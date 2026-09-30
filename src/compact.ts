// One compaction: choose what leaves, move it out, hand the conversation back.

import { ask, nothingAsked, type Provider } from './ask.ts';
import { ruleOrder, select, type Candidate } from './select.ts';
import { isStored, moveOut, readTicket, type Moved, type NotMoved } from './store.ts';
import type { Files, Http, Message, ToolResult, ToolUse } from './types.ts';

export type Config = {
  storeDir: string;
  keepNewest: number;
  minChars: number;
  /** Results leave until the conversation is estimated under this share of the window, in percent. */
  targetPercent: number;
  /**
   * Over this share of the window after moving out, in percent, too much is still
   * in use to go on with and the built-in compaction takes over.
   */
  maxAfterPercent: number;
  /** Null: nothing is sent anywhere and rules decide the order. */
  provider: Provider | null;
  /** How long Jev is waited for before rules decide the order, in milliseconds. */
  askWithinMs: number;
};

export type Host = {
  files: Files;
  http: Http;
  /** Resolves after `ms`, rejects when `signal` aborts. */
  wait(ms: number, signal: AbortSignal): Promise<void>;
  now(): number;
};

export type Input = {
  messages: readonly Message[];
  /** Tokens in the context now: the conversation, the system prompt and the tools' definitions. */
  tokens: number;
  /** The size the context may reach, see `windowFrom`. */
  window: number;
  /** What the person is working on, in their words. */
  goal: string;
};

export type Report = {
  results: number;
  candidates: number;
  moved: number;
  charsBefore: number;
  charsAfter: number;
  /** Estimated from characters: the context after, in tokens, and the size it was measured against. */
  tokensAfter: number;
  window: number;
  order: 'jev' | 'rules';
  requests: number;
  sentChars: number;
  failedRequests: number;
  /** Why results stayed: by what the store said, and `call-differs` for a call whose own text was another. */
  notMoved: Partial<Record<NotMoved['reason'] | 'call-differs', number>>;
  ms: number;
};

export type Outcome = {
  /** The conversation after moving out, every message rebuilt without Claude Code's handle. */
  messages: Message[];
  /**
   * False when nothing left, or when too much is still in use and a summary of
   * what is left could change that: the built-in compaction should run on `messages`.
   */
  enough: boolean;
  report: Report;
};

// ponytail: tokens are estimated as characters / 3. Results of reading source code
// measured 2.2 to 2.3 characters a token, prose in English runs near 4, Japanese at a
// character or less. Guessing too high a figure is the worse mistake: what was saved
// is underestimated, and a compaction that did enough is handed to the built-in one.
// The host counts no text for a plugin, and the `Messages` row of its breakdown takes
// up what its other rows got wrong, so neither removes the guess.
export const CHARS_PER_TOKEN = 3;
const UNSCORED = 1.5;
const WRITES_IN_FLIGHT = 16;

/** What Claude Code says of the context, cut down to what a compaction measures against. */
export type Context = { window?: unknown; breakdown?: { autoCompactThreshold?: unknown } };

/**
 * The size the context may reach: where Claude Code compacts on its own when
 * it says so, else the model's window. Measured against the model's window, a
 * compaction could hand back a conversation that is compacted again at once.
 */
export function windowFrom(context: Context | undefined, fallback: number): number {
  const sizes = [context?.breakdown?.autoCompactThreshold, context?.window];
  return sizes.find((size): size is number => typeof size === 'number' && Number.isFinite(size) && size > 0) ?? fallback;
}

/** The characters of a conversation: what the person and the model said, the calls' inputs, the results. */
export function charsOf(messages: readonly Message[]): number {
  let total = 0;
  for (const message of messages) {
    total += message.text.length;
    for (const use of message.toolUses) total += JSON.stringify(use.input).length;
    for (const result of message.toolResults ?? []) total += result.text.length;
  }
  return total;
}

async function inParallel<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const work = async () => {
    for (let index = next++; index < items.length; index = next++) {
      out[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, work));
  return out;
}

/** The ids of the results that already are tickets of this store. */
async function storedTickets(files: Files, dir: string, messages: readonly Message[]): Promise<Set<string>> {
  const shaped = messages.flatMap((message) => message.toolResults ?? []).filter((result) => readTicket(result.text));
  const kept = await inParallel(shaped, WRITES_IN_FLIGHT, (result) => isStored(files, dir, result.text));
  return new Set(shaped.filter((_, index) => kept[index]).map((result) => result.tool_use_id));
}

/**
 * Every message without its handle, moved-out results replaced by their tickets
 * on both sides of the call. A message handed back with its handle makes Claude
 * Code restore the whole history when the session is resumed.
 */
function rebuild(messages: readonly Message[], moved: ReadonlyMap<string, Moved>): Message[] {
  const out: Message[] = [];
  for (const message of messages) {
    const toolUses = message.toolUses.map((use): ToolUse => {
      const ticket = moved.get(use.tool_use_id);
      if (!ticket) return { ...use };
      const { result: _result, ...rest } = use;
      return { ...rest, text: ticket.text };
    });
    const toolResults = (message.toolResults ?? []).map((result): ToolResult => {
      const ticket = moved.get(result.tool_use_id);
      return ticket ? { tool_use_id: result.tool_use_id, text: ticket.text, isError: false } : { ...result };
    });
    if (message.text === '' && toolUses.length === 0 && toolResults.length === 0) continue;
    const rebuilt: Message = { role: message.role, text: message.text, toolUses };
    if (toolResults.length > 0) rebuilt.toolResults = toolResults;
    out.push(rebuilt);
  }
  return out;
}

type Ordered = { order: Candidate[]; by: 'jev' | 'rules'; requests: number; sentChars: number; failed: number };

/**
 * The order results leave in. Those a later call made obsolete go first and
 * are never asked about. Jev orders the rest; a result it gave no score for
 * sits in the middle of the scale, and rules break every tie.
 */
async function orderOf(candidates: readonly Candidate[], input: Input, config: Config, host: Host, need: number): Promise<Ordered> {
  const byRules = ruleOrder(candidates, input.goal);
  const obsolete = byRules.filter((candidate) => candidate.superseded);
  const open = byRules.filter((candidate) => !candidate.superseded);
  const rules: Ordered = { order: byRules, by: 'rules', requests: 0, sentChars: 0, failed: 0 };

  const freed = obsolete.reduce((sum, candidate) => sum + candidate.text.length, 0) / CHARS_PER_TOKEN;
  if (config.provider === null || open.length === 0 || freed >= need) return rules;

  // Counted into from here, so that what was sent is reported even when the answer is not waited for.
  const asked = nothingAsked();
  let late = false;
  const timer = new AbortController();
  const answered = await Promise.race([
    ask(host.http, config.provider, input.goal, open, () => late, asked).then(() => true),
    host.wait(config.askWithinMs, timer.signal).then(
      () => false,
      () => false,
    ),
  ]);
  late = true;
  timer.abort();
  const sent = { requests: asked.requests, sentChars: asked.sentChars, failed: asked.failed };
  if (!answered || asked.scores.size === 0) return { ...rules, ...sent };

  const rank = new Map(open.map((candidate, index) => [candidate.id, index]));
  const scored = [...open].sort(
    (a, b) =>
      (asked.scores.get(a.id) ?? UNSCORED) - (asked.scores.get(b.id) ?? UNSCORED) ||
      (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
  );
  return { order: [...obsolete, ...scored], by: 'jev', ...sent };
}

export async function compact(input: Input, config: Config, host: Host): Promise<Outcome> {
  const started = host.now();
  const { files } = host;
  const stored = await storedTickets(files, config.storeDir, input.messages);
  const { candidates, left: stayed } = select(input.messages, config, stored);

  // At most the target, and never more than half of what is there now: a
  // compaction that was asked for should leave room to work in.
  const target = Math.min((input.window * config.targetPercent) / 100, input.tokens / 2);
  const need = input.tokens - target;
  const ordered = await orderOf(candidates, input, config, host, need);

  const moved = new Map<string, Moved>();
  const notMoved: Report['notMoved'] = {};
  if (stayed.unlike > 0) notMoved['call-differs'] = stayed.unlike;
  let saved = 0;
  const left = [...ordered.order];
  while (saved / CHARS_PER_TOKEN < need && left.length > 0) {
    // As many as the estimate says are still needed, written side by side. Each
    // round takes at least one, so the loop ends when the candidates do.
    const wave: Candidate[] = [];
    let expected = saved;
    do {
      const candidate = left.shift() as Candidate;
      wave.push(candidate);
      expected += candidate.text.length;
    } while (left.length > 0 && expected / CHARS_PER_TOKEN < need);
    const written = await inParallel(wave, WRITES_IN_FLIGHT, (candidate) =>
      moveOut(files, config.storeDir, candidate.tool, candidate.text),
    );
    wave.forEach((candidate, at) => {
      const result = written[at] as Moved | NotMoved;
      if ('reason' in result) {
        notMoved[result.reason] = (notMoved[result.reason] ?? 0) + 1;
        return;
      }
      moved.set(candidate.id, result);
      saved += Math.max(0, candidate.text.length - result.text.length);
    });
  }

  const messages = rebuild(input.messages, moved);
  // What is measured against the window is everything in it: the system prompt and the
  // tools' definitions too, which no compaction makes smaller.
  const tokensAfter = Math.round(input.tokens - saved / CHARS_PER_TOKEN);
  const charsAfter = charsOf(messages);
  // How far over what may stay in use. A summary can take away no more than the
  // conversation that is left: when that does not cover it, handing over gains nothing.
  const over = tokensAfter - (input.window * config.maxAfterPercent) / 100;
  return {
    messages,
    enough: moved.size > 0 && (over <= 0 || charsAfter / CHARS_PER_TOKEN < over),
    report: {
      results: input.messages.reduce((sum, message) => sum + (message.toolResults?.length ?? 0), 0),
      candidates: candidates.length,
      moved: moved.size,
      charsBefore: charsOf(input.messages),
      charsAfter,
      tokensAfter,
      window: input.window,
      order: ordered.by,
      requests: ordered.requests,
      sentChars: ordered.sentChars,
      failedRequests: ordered.failed,
      notMoved,
      ms: host.now() - started,
    },
  };
}
