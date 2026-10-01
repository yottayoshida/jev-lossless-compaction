// One compaction: choose what leaves, move it out, hand the conversation back.

import { IMAGE_TOKENS, encodeMedia, type MediaPart } from './media.ts';
import { ruleOrder, select, type Candidate } from './select.ts';
import { isStored, moveOut, readTicket, ticketText, type Moved, type NotMoved, type StoreDirs, type Ticket } from './store.ts';
import type { Files, Message, ToolResult, ToolUse } from './types.ts';

export type Config = {
  /** Where results are written, and every place they are read from. */
  store: StoreDirs;
  /**
   * The newest result that could leave stays whatever its size; the ones before
   * it stay while they and the newest add up to this many tokens.
   */
  keepTokens: number;
  minChars: number;
  /** Results leave until the conversation is estimated under this share of the window, in percent. */
  targetPercent: number;
  /**
   * Over this share of the window after moving out, in percent, too much is still
   * in use to go on with and the built-in compaction takes over.
   */
  maxAfterPercent: number;
};

/** What a compaction needs of the host: files, and a clock. Nothing is sent anywhere. */
export type Host = {
  files: Files;
  now(): number;
};

export type Input = {
  messages: readonly Message[];
  /** Tokens in the context now: the conversation, the system prompt and the tools' definitions. */
  tokens: number;
  /**
   * How to count a size from what stays, see `countFrom`. Absent when it cannot be
   * told, and sizes are estimated from `tokens` alone.
   */
  count?: Count;
  /** The size the context may reach, see `windowFrom`. */
  window: number;
  /** What the person is working on, in their words. */
  goal: string;
  /**
   * The tool results that hold an image, by the id of their call, see `mediaIn`.
   * Each is moved out whatever its age or size: a rebuilt message cannot carry it.
   */
  media?: ReadonlyMap<string, readonly MediaPart[]>;
};

export type Report = {
  results: number;
  candidates: number;
  moved: number;
  /** The images that left with their results; those results are among `moved`. */
  images: number;
  charsBefore: number;
  charsAfter: number;
  /** Estimated from characters: the context after, in tokens, and the size it was measured against. */
  tokensAfter: number;
  /**
   * Whether `tokensAfter` is counted from what stays. When false it is `tokens` less
   * what was moved out, which still counts the thinking every compaction drops, and
   * is not a figure to show.
   */
  counted: boolean;
  window: number;
  /** Why results stayed: by what the store said, and `call-differs` for a call whose own text was another. */
  notMoved: Partial<Record<NotMoved['reason'] | 'call-differs', number>>;
  /** What the host said when writes failed, each once, at most three: ENOSPC for a full disk. */
  writeErrors: string[];
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
  /**
   * Why nothing was rebuilt: a result that holds an image could not be moved
   * out. `messages` are then the ones handed in, untouched, handles and all.
   */
  abandoned?: string;
  report: Report;
};

// ponytail: tokens are estimated as characters / 3. Results of reading source code
// measured 2.2 to 2.3 characters a token, prose in English runs near 4, Japanese at a
// character or less. Where a size is `tokens` less what was moved out, too high a
// figure is the worse mistake: what was saved is underestimated, and a compaction that
// did enough is handed to the built-in one. Where a size is counted from what stays,
// the session's own figure is used when it is lower (`countFrom`), and this one is
// only the floor. The host counts no text for a plugin.
export const CHARS_PER_TOKEN = 3;
const WRITES_IN_FLIGHT = 16;

/** What Claude Code says of the context, as far as `countFrom` reads it. */
export type Breakdown = { categories?: unknown; apiUsage?: unknown };

/** What Claude Code says of the context, cut down to what a compaction measures against. */
export type Context = { window?: unknown; breakdown?: { autoCompactThreshold?: unknown } & Breakdown };

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

/** The results that already are tickets of this store, by the id of their call, with what the ticket says. */
async function storedTickets(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Map<string, Ticket>> {
  const shaped = messages.flatMap((message) => message.toolResults ?? []).filter((result) => readTicket(result.text));
  const kept = await inParallel(shaped, WRITES_IN_FLIGHT, (result) => isStored(files, dirs, result.text));
  return new Map(shaped.filter((_, index) => kept[index]).map((result) => [result.tool_use_id, readTicket(result.text) as Ticket]));
}

/**
 * Every message without its handle, moved-out results replaced by their tickets
 * on both sides of the call. A ticket an earlier compaction left is written in
 * the current wording, same id and size, so that a conversation compacted again
 * names the tool that exists now (ADR 0004). A message handed back with its
 * handle makes Claude Code restore the whole history when the session is resumed.
 */
function rebuild(messages: readonly Message[], moved: ReadonlyMap<string, Moved>, stored: ReadonlyMap<string, Ticket>): Message[] {
  const lineFor = (id: string): string | undefined => {
    const ticket = moved.get(id) ?? stored.get(id);
    return ticket && ticketText(ticket);
  };
  const out: Message[] = [];
  for (const message of messages) {
    const toolUses = message.toolUses.map((use): ToolUse => {
      const line = lineFor(use.tool_use_id);
      if (line === undefined) return { ...use };
      const { result: _result, ...rest } = use;
      return { ...rest, text: line };
    });
    const toolResults = (message.toolResults ?? []).map((result): ToolResult => {
      const line = lineFor(result.tool_use_id);
      return line === undefined ? { ...result } : { tool_use_id: result.tool_use_id, text: line, isError: false };
    });
    if (message.text === '' && toolUses.length === 0 && toolResults.length === 0) continue;
    const rebuilt: Message = { role: message.role, text: message.text, toolUses };
    if (toolResults.length > 0) rebuilt.toolResults = toolResults;
    out.push(rebuilt);
  }
  return out;
}

/**
 * A size counted from what stays: what is not the conversation, and how many tokens
 * the conversation's characters come to.
 */
export type Count = { fixedTokens: number; tokensPerChar: number };

const MEDIA = new Set(['image', 'document']);

/** How many images a conversation read with its blocks holds, wherever they stand. */
export function imagesOf(api: unknown): number {
  let total = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    if ((node as { type?: unknown }).type === 'image') total += 1;
    else visit((node as { content?: unknown }).content);
  };
  if (Array.isArray(api)) for (const message of api) visit((message as { content?: unknown } | null)?.content);
  return total;
}

/** The characters of a conversation read with its blocks: every text a block holds, its signature and input too, and no image. */
export function apiChars(api: unknown): number {
  let total = 0;
  const visit = (node: unknown): void => {
    if (typeof node === 'string') {
      total += node.length;
      return;
    }
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    // The bytes of an image are not characters of the conversation: counted, they would
    // bring the tokens a character down to the floor for every conversation holding one.
    if (MEDIA.has((node as { type?: unknown }).type as string)) return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type') continue;
      if (key === 'content' || typeof value === 'string') visit(value);
      else total += JSON.stringify(value ?? '').length;
    }
  };
  if (Array.isArray(api)) for (const message of api) visit((message as { content?: unknown } | null)?.content);
  return total;
}

/**
 * How to count a size from what stays, from Claude Code's breakdown. What is not
 * the conversation is every row in use but `Messages`. The conversation counts at the
 * tokens a character the `Messages` row comes to over the conversation as it was
 * sent (`api`), and at no less than one in three: Japanese runs near a token a
 * character, and counted at three characters a token a conversation that is still
 * too full would be said to fit.
 *
 * Undefined unless it can be relied on: `tokens` is Claude Code's own figure, the
 * breakdown carries the last response's usage, which its `Messages` row is
 * reconciled to, there is such a row, and what is left lies between nothing and
 * `tokens`.
 */
export function countFrom(breakdown: Breakdown | undefined, tokens: unknown, api: unknown): Count | undefined {
  if (typeof tokens !== 'number' || !Number.isFinite(tokens) || tokens <= 0) return undefined;
  if (typeof breakdown?.apiUsage !== 'object' || breakdown.apiUsage === null || !Array.isArray(breakdown.categories)) return undefined;
  const used = breakdown.categories.filter(
    (row): row is { name: string; tokens: number } =>
      typeof row === 'object' && row !== null && (row as { kind?: unknown }).kind === 'used' &&
      typeof (row as { name?: unknown }).name === 'string' &&
      typeof (row as { tokens?: unknown }).tokens === 'number' && Number.isFinite((row as { tokens: number }).tokens),
  );
  const conversation = used.find((row) => row.name === 'Messages');
  if (conversation === undefined) return undefined;
  const fixedTokens = used.filter((row) => row !== conversation).reduce((sum, row) => sum + row.tokens, 0);
  if (!(fixedTokens > 0 && fixedTokens < tokens)) return undefined;
  const chars = apiChars(api);
  const floor = 1 / CHARS_PER_TOKEN;
  // Images are left out on both sides: their bytes are not among the characters, so
  // their tokens are taken off the row. Left in the row alone, the figure would say
  // a conversation of screenshots is still too full once every one of them is gone.
  const text = Math.max(0, conversation.tokens - imagesOf(api) * IMAGE_TOKENS);
  return { fixedTokens, tokensPerChar: chars > 0 ? Math.max(floor, text / chars) : floor };
}

export async function compact(input: Input, config: Config, host: Host): Promise<Outcome> {
  const started = host.now();
  const { files } = host;
  const stored = await storedTickets(files, config.store.read, input.messages);
  const resultCount = input.messages.reduce((sum, message) => sum + (message.toolResults?.length ?? 0), 0);

  // First, and whatever else is decided: every result that holds an image. Each is
  // stored whole, text and images, and becomes one ticket. If one of them cannot be,
  // nothing is rebuilt, since a rebuilt message would lose the image without a word.
  const moved = new Map<string, Moved>();
  const held = input.media ?? new Map<string, readonly MediaPart[]>();
  let images = 0;
  if (held.size > 0) {
    const tools = new Map(input.messages.flatMap((message) => message.toolUses.map((use) => [use.tool_use_id, use.tool] as const)));
    const here = new Set(input.messages.flatMap((message) => (message.toolResults ?? []).map((result) => result.tool_use_id)));
    const abandon = (why: string): Outcome => ({
      messages: [...input.messages],
      enough: false,
      abandoned: why,
      report: {
        results: resultCount,
        candidates: 0,
        moved: 0,
        images: 0,
        charsBefore: charsOf(input.messages),
        charsAfter: charsOf(input.messages),
        tokensAfter: input.tokens,
        counted: false,
        window: input.window,
        notMoved: {},
        writeErrors: [],
        ms: host.now() - started,
      },
    });
    // Whatever the hook's messages say of them: what holds an image as it was sent is moved out.
    const ids = [...held.keys()];
    if (ids.some((id) => !here.has(id))) return abandon('a tool result that holds an image is not among the messages shown');
    // The same image returned twice is one text: the first of each is written side by side
    // with the others, and the rest after, when the text is there and only the ticket is made.
    // Two writes of one file at a time can spoil each other.
    const texts = new Map(ids.map((id) => [id, encodeMedia(held.get(id) as readonly MediaPart[])]));
    const first = new Map<string, string>();
    for (const id of ids) if (!first.has(texts.get(id) as string)) first.set(texts.get(id) as string, id);
    const leading = [...first.values()];
    const store = (id: string) => moveOut(files, config.store.write, tools.get(id) ?? 'tool', texts.get(id) as string);
    const written = await inParallel(leading, WRITES_IN_FLIGHT, store);
    const firsts = new Map(leading.map((id, at) => [id, written[at] as Moved | NotMoved]));
    for (const id of ids) {
      const result = firsts.get(id) ?? (await store(id));
      if ('reason' in result) {
        return abandon(`a tool result that holds an image could not be moved out (${result.code ?? result.reason})`);
      }
      moved.set(id, result);
      images += (held.get(id) as readonly MediaPart[]).filter((part) => part.type === 'image').length;
    }
  }

  const { candidates, left: stayed } = select(
    input.messages,
    { keepChars: config.keepTokens * CHARS_PER_TOKEN, minChars: config.minChars },
    // A result that left above is no more a candidate than one that is a ticket already.
    new Set([...stored.keys(), ...moved.keys()]),
  );

  // What is in use, counted from what stays when what is not the conversation is
  // known. Every message is rebuilt and carries no thinking, so the thinking in
  // `tokens` is gone afterwards whatever is moved out: counted from `tokens`, a
  // conversation that fits could be handed to the built-in summary (#24).
  const { count } = input;
  const perChar = count?.tokensPerChar ?? 1 / CHARS_PER_TOKEN;
  const charsBefore = charsOf(input.messages);
  const before = count === undefined ? input.tokens : count.fixedTokens + charsBefore * perChar;
  // At most the target, and never more than half of what is there now: a
  // compaction that was asked for should leave room to work in. Both measured the
  // same way, so that something is always needed.
  const target = Math.min((input.window * config.targetPercent) / 100, before / 2);
  const need = before - target;
  // The order results leave in is decided by rules alone: those a later call made
  // obsolete first, then those sharing the least with the goal, then the oldest.
  const order = ruleOrder(candidates, input.goal);

  const notMoved: Report['notMoved'] = {};
  const writeErrors: string[] = [];
  if (stayed.unlike > 0) notMoved['call-differs'] = stayed.unlike;
  // Counted from what stays, images are in neither size. Where a size is `tokens` less
  // what left, the images that left above are taken off as well, at the same rough figure:
  // `tokens` holds them, as Claude Code's own figure or as the caller made it up.
  let saved = count === undefined ? images * IMAGE_TOKENS * CHARS_PER_TOKEN : 0;
  const left = [...order];
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
      moveOut(files, config.store.write, candidate.tool, candidate.text),
    );
    wave.forEach((candidate, at) => {
      const result = written[at] as Moved | NotMoved;
      if ('reason' in result) {
        notMoved[result.reason] = (notMoved[result.reason] ?? 0) + 1;
        if (result.code !== undefined && !writeErrors.includes(result.code) && writeErrors.length < 3) writeErrors.push(result.code);
        return;
      }
      moved.set(candidate.id, result);
      saved += Math.max(0, candidate.text.length - result.text.length);
    });
  }

  const messages = rebuild(input.messages, moved, stored);
  // What is measured against the window is everything in it: the system prompt and the
  // tools' definitions too, which no compaction makes smaller.
  const charsAfter = charsOf(messages);
  const tokensAfter = Math.round(count === undefined ? input.tokens - saved / CHARS_PER_TOKEN : count.fixedTokens + charsAfter * perChar);
  // How far over what may stay in use. A summary can take away no more than the
  // conversation that is left: when that does not cover it, handing over gains nothing.
  const over = tokensAfter - (input.window * config.maxAfterPercent) / 100;
  return {
    messages,
    enough: moved.size > 0 && (over <= 0 || charsAfter * perChar < over),
    report: {
      results: resultCount,
      candidates: candidates.length,
      moved: moved.size,
      images,
      charsBefore,
      charsAfter,
      tokensAfter,
      counted: count !== undefined,
      window: input.window,
      notMoved,
      writeErrors,
      ms: host.now() - started,
    },
  };
}

/** The line a compaction shows. A size of the context is named only when it was counted from what stays. */
export function reportLine(report: Report): string {
  const took = report.ms < 1000 ? `${report.ms} ms` : `${(report.ms / 1000).toFixed(1)} s`;
  const stayed = Object.entries(report.notMoved)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
  return (
    `moved ${report.moved} of ${report.results} tool results out` +
    (report.images === 0 ? ' ' : `, ${report.images} ${report.images === 1 ? 'image' : 'images'} with them ` ) +
    `(${report.charsBefore} -> ${report.charsAfter} chars` +
    (report.counted ? `, about ${report.tokensAfter} of ${report.window} tokens in use) ` : ') ') +
    `in ${took}${stayed === '' ? '' : `; left in place: ${stayed}`}` +
    (report.writeErrors.length === 0 ? '' : `; could not write: ${report.writeErrors.join(', ')}`)
  );
}
