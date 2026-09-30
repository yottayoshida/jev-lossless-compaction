// Asking Jev how much each tool result is still needed.
//
// One `score` question per result, many questions per request. What Jev is
// shown of a result is a digest cut from the text after secrets' shapes have
// been blanked. Jev's answers decide an order and nothing else.

import type { Candidate } from './select.ts';
import type { Http } from './types.ts';

/** The levels of the one scale every question uses, lowest need first. */
export const LEVELS = ['not needed again', 'probably not needed', 'probably needed', 'needed'] as const;

const JUDGING =
  'Each question shows one tool result from this coding session: the call, the size of its output, and a digest of ' +
  'the output. Score how much the rest of the task still needs that output to be in the conversation. An output ' +
  'whose content has been acted on, or that only showed the way to something read later, is not needed again. ' +
  'Every output stays available on disk whatever the score.';

const BATCH_CHARS = 80_000;
const MAX_REQUESTS = 24;
const IN_FLIGHT = 8;
const SPLITS = 3;

const BLANK = '[redacted]';

// Shapes of secrets. This is a courtesy, not a boundary: a password with no
// telling name or prefix passes through it.
const SHAPES: readonly (readonly [RegExp, string])[] = [
  [/-----BEGIN [A-Z0-9 ]+-----[\s\S]*?(?:-----END [A-Z0-9 ]+-----|$)/g, BLANK],
  [/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, `$1${BLANK}@`],
  [/\b((?:proxy-)?authorization["']?\s*[:=]\s*["']?)[^\r\n"']+/gi, `$1${BLANK}`],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${BLANK}`],
  [
    /\b([A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passwd|password|pwd|credential|private[_-]?key)[A-Za-z0-9_.-]*["']?\s*[:=]\s*["']?)[^\s"',;]+/gi,
    `$1${BLANK}`,
  ],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, BLANK],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, BLANK],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, BLANK],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, BLANK],
  [/\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g, BLANK],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, BLANK],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, BLANK],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, BLANK],
  [
    /([?&](?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|sig|signature|token|access_token|key)=)[^&\s"']+/gi,
    `$1${BLANK}`,
  ],
];

export function redact(text: string): string {
  let out = text;
  for (const [shape, replacement] of SHAPES) out = out.replace(shape, replacement);
  return out;
}

const LOUD = /\b(?:errors?|failed|failures?|fatal|panic(?:ked)?|exception|traceback|denied|refused|cannot|segmentation)\b/i;
const LINE = 200;

/**
 * The head and the tail of a result, and the lines between them that look like
 * failures. Secrets' shapes are blanked over the whole text first: cutting
 * first could split one and leave a piece no shape matches.
 */
export function digest(text: string, limit = 700): string {
  const lines = redact(text).split('\n');
  const clip = (line: string) => (line.length > LINE ? `${line.slice(0, LINE)} [...]` : line);
  if (lines.length <= 12) return lines.map(clip).join('\n').slice(0, limit);
  const middle = lines.slice(6, -4);
  const loud = middle.filter((line) => LOUD.test(line)).slice(0, 5);
  return [...lines.slice(0, 6), `[... ${middle.length} lines, of which these look like failures:]`, ...loud, '[...]', ...lines.slice(-4)]
    .map(clip)
    .join('\n')
    .slice(0, limit);
}

export type Question = { type: 'score'; instructions: string; criteria: readonly string[] };

const keyOf = (candidate: Candidate) => `r${candidate.position}`;

/** A value with every string in it blanked. */
function redactIn(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redact(value);
  if (depth > 8 || typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => redactIn(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redactIn(item, depth + 1)]));
}

/**
 * A call's input as one line. Blanked before it is written as JSON, which
 * puts a backslash before a quote and so hides `KEY="..."` from the shapes,
 * and again after, where a secret shows by the name of its field.
 */
export function inputLine(input: Record<string, unknown>): string {
  return redact(JSON.stringify(redactIn(input))).slice(0, 300);
}

function questionFor(candidate: Candidate): Question {
  const input = inputLine(candidate.input);
  return {
    type: 'score',
    instructions:
      `Still needed? Result #${candidate.position} of ${candidate.tool}, called with ${input}. ` +
      `${candidate.text.length} characters. It reads:\n${digest(candidate.text)}`,
    criteria: LEVELS,
  };
}

export type State = { task: string; judging: string };

export function stateFor(goal: string): State {
  return { task: redact(goal).slice(0, 2000), judging: JUDGING };
}

/** Questions grouped so that each request, state included, stays under the size a request may have. */
export function batchesFor(state: State, candidates: readonly Candidate[]): Record<string, Question>[] {
  const room = BATCH_CHARS - JSON.stringify(state).length;
  const batches: Record<string, Question>[] = [];
  let current: Record<string, Question> = {};
  let used = 0;
  for (const candidate of candidates) {
    const question = questionFor(candidate);
    const size = JSON.stringify(question).length + keyOf(candidate).length + 4;
    if (used > 0 && used + size > room) {
      batches.push(current);
      current = {};
      used = 0;
    }
    current[keyOf(candidate)] = question;
    used += size;
  }
  if (used > 0) batches.push(current);
  return batches;
}

export type Provider =
  | { kind: 'typesafe'; key: string; model: string }
  | { kind: 'cloudflare'; key: string; accountId: string };

export type Settings = { provider?: unknown; apiKey?: unknown; cloudflareAccountId?: unknown; model?: unknown };
export type Environment = { TYPESAFE_API_KEY?: string; CLOUDFLARE_API_TOKEN?: string; CLOUDFLARE_ACCOUNT_ID?: string };

const filled = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Who is asked, or null when no key was given and nothing is to be sent.
 * A setting is read before the environment. The address is fixed per kind and
 * cannot be set, and a key from the environment goes to its own provider only.
 * The key in the settings is one field: it goes to whichever provider is set.
 */
export function providerFrom(settings: Settings, env: Environment): Provider | null | { error: string } {
  const kind = filled(settings.provider) ?? 'typesafe';
  if (kind !== 'typesafe' && kind !== 'cloudflare') return { error: 'provider must be typesafe or cloudflare' };
  const set = filled(settings.apiKey);
  const key = set ?? filled(kind === 'typesafe' ? env.TYPESAFE_API_KEY : env.CLOUDFLARE_API_TOKEN);
  if (key === undefined) return null;
  if (!/^[\x21-\x7e]+$/.test(key)) return { error: 'the API key holds a character a key cannot have' };
  if (kind === 'typesafe') return { kind, key, model: filled(settings.model) ?? 'jev-latest' };
  // With the key from the settings, the account comes from the settings too: the
  // environment, which a repository can set, then decides nothing about where it goes.
  const accountId = filled(settings.cloudflareAccountId) ?? (set === undefined ? filled(env.CLOUDFLARE_ACCOUNT_ID) : undefined);
  if (accountId === undefined || !/^[0-9a-f]{32}$/i.test(accountId)) {
    return { error: 'the cloudflare provider needs an account id of 32 hexadecimal characters' };
  }
  return { kind, key, accountId };
}

export function requestFor(provider: Provider, state: State, questions: Record<string, Question>) {
  const headers = { authorization: `Bearer ${provider.key}`, 'content-type': 'application/json' };
  if (provider.kind === 'typesafe') {
    return {
      url: 'https://api.typesafe.ai/v1/systemone',
      headers,
      body: JSON.stringify({ model: provider.model, state, questions }),
    };
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${provider.accountId}/ai/run`,
    headers,
    body: JSON.stringify({ model: 'typesafe/jev', input: { state, questions } }),
  };
}

/** The object holding `answers`. Workers AI wraps it a few levels down. */
function answersIn(payload: unknown): Record<string, unknown> | null {
  let node = payload;
  for (let depth = 0; depth < 5 && typeof node === 'object' && node !== null; depth += 1) {
    const object = node as Record<string, unknown>;
    const answers = object['answers'];
    if (typeof answers === 'object' && answers !== null && !Array.isArray(answers)) {
      return answers as Record<string, unknown>;
    }
    node = object['result'];
  }
  return null;
}

/** The scores for the keys that were asked. Anything that is not a number on the scale is left out. */
export function readScores(body: string, keys: readonly string[]): Map<string, number> {
  const scores = new Map<string, number>();
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return scores;
  }
  const answers = answersIn(payload);
  if (!answers) return scores;
  for (const key of keys) {
    if (!Object.hasOwn(answers, key)) continue;
    const answer = answers[key];
    const score = typeof answer === 'object' && answer !== null ? (answer as { score?: unknown }).score : undefined;
    if (typeof score === 'number' && score >= 0 && score <= LEVELS.length - 1) scores.set(key, score);
  }
  return scores;
}

export type Asked = {
  /** Score by tool_use_id. A result Jev gave no usable score for is absent. */
  scores: Map<string, number>;
  requests: number;
  sentChars: number;
  failed: number;
};

export const nothingAsked = (): Asked => ({ scores: new Map(), requests: 0, sentChars: 0, failed: 0 });

/**
 * Asks about every candidate. A request that fails is not sent again, except
 * that one refused for its size is split in two. `expired` ends the asking: no
 * request starts after it turns true. No part of a response is ever thrown or
 * logged, since an endpoint may echo the key it was sent.
 *
 * `asked` is counted into as the asking goes, so a caller that stops waiting
 * can still say what had been sent by then.
 */
export async function ask(
  http: Http,
  provider: Provider,
  goal: string,
  candidates: readonly Candidate[],
  expired: () => boolean,
  asked: Asked = nothingAsked(),
): Promise<Asked> {
  const state = stateFor(goal);
  const idByKey = new Map(candidates.map((candidate) => [keyOf(candidate), candidate.id]));
  const queue = batchesFor(state, candidates).map((questions) => ({ questions, splits: SPLITS }));

  const work = async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      if (expired() || asked.requests >= MAX_REQUESTS) {
        asked.failed += 1;
        continue;
      }
      const keys = Object.keys(job.questions);
      const request = requestFor(provider, state, job.questions);
      asked.requests += 1;
      asked.sentChars += request.body.length;
      let response;
      try {
        response = await http(request.url, { method: 'POST', headers: request.headers, body: request.body });
      } catch {
        asked.failed += 1;
        continue;
      }
      if (expired()) {
        asked.failed += 1;
        continue;
      }
      if (!response.ok) {
        const tooLarge = response.status === 400 && response.text.includes('max_tokens_exceeded');
        if (tooLarge && job.splits > 0 && keys.length > 1) {
          const half = Math.ceil(keys.length / 2);
          for (const part of [keys.slice(0, half), keys.slice(half)]) {
            queue.push({
              questions: Object.fromEntries(part.map((key) => [key, job.questions[key] as Question])),
              splits: job.splits - 1,
            });
          }
        } else {
          asked.failed += 1;
        }
        continue;
      }
      for (const [key, score] of readScores(response.text, keys)) {
        const id = idByKey.get(key);
        if (id !== undefined) asked.scores.set(id, score);
      }
    }
  };

  await Promise.all(Array.from({ length: IN_FLIGHT }, work));
  return asked;
}
