// Finding, among the results moved out of a conversation, the one a question
// is about: what the `find` tool answers with.

import { choose, digest, inputLine, type Provider } from './ask.ts';
import { PART, PLUGIN, RECALL_TOOL, isOwnTool, isStored, readPartTicket, readTicket, recall, type Ticket } from './store.ts';
import type { Files, Http, Message } from './types.ts';

/** The text of a result is returned when the likeliest option has at least this probability ... */
export const FOUND_AT = 0.5;
/** ... and is at least this far ahead of the next one. Otherwise the likeliest few are listed. */
export const MARGIN = 0.3;
/** How many are listed then. */
export const LISTED = 3;
/** A phrase the question quotes narrows the options only when it is at least this long. */
export const MIN_PHRASE = 12;
/** The option put beside the results in every request: the answer may be none of them. */
export const NONE = 'none';
const NONE_TEXT = 'None of these: the result the question is about is not among the moved-out results.';
/** A stored text up to this size is blanked whole before it is digested; a larger one only in its head. */
export const WHOLE_UP_TO = 256 * 1024;
export const HEAD_CHARS = 8 * 1024;
const DIGEST_CHARS = 400;
/** At most this many parts of kept conversations are read for the tickets in them. */
export const MAX_PARTS = 64;
/**
 * Tickets read from kept parts are offered until the choice holds this many:
 * with eighty options to a request it takes about seventeen requests, under
 * the twenty-four a question may make. The conversation's own tickets are
 * always offered, however many they are.
 */
export const MAX_OFFERED = 1200;

export type FindInput = {
  files: Files;
  /** Where results are read from, the place written to first. */
  dirs: readonly string[];
  /** The conversation as the host hands it to a hook. */
  messages: readonly Message[];
  provider: Provider | null;
  http: Http;
  /** The host's clock, to give a request up by. */
  wait?: ((ms: number, signal: AbortSignal) => Promise<void>) | undefined;
  /** What the model asked for, in words. */
  question: unknown;
  /** Set when a subagent called, which this plugin moves nothing out of. */
  agentId?: string | undefined;
};

/**
 * A ticket of the conversation, or of a part of a conversation kept before a
 * summary, with what it stands for in words: the call that made the result, or
 * which messages the part holds.
 */
export type Stored = Ticket & { line: string; about: string };

/**
 * The phrases the question puts in double quotes, long enough to narrow by.
 * Backticks do not count: a model puts an identifier in them without meaning
 * "as written", and one stored text that happens to hold it is not an answer.
 */
export function phrasesOf(question: string): string[] {
  const phrases: string[] = [];
  for (const match of question.matchAll(/"([^"\n]+)"/g)) {
    const phrase = match[1] ?? '';
    if (phrase.length >= MIN_PHRASE) phrases.push(phrase);
  }
  return phrases;
}

/** What of a stored text is blanked and digested: all of it, or the head of a large one cut at a line. */
export function shown(text: string): string {
  if (text.length <= WHOLE_UP_TO) return text;
  const cut = text.lastIndexOf('\n', HEAD_CHARS);
  return text.slice(0, cut > 0 ? cut : HEAD_CHARS);
}

/**
 * The tickets of the conversation, each id once, without those that stand for
 * a result of this plugin's own tools: such a result is a copy of a stored
 * text, which would sit in the choice twice. The tickets of parts of a kept
 * conversation are read from the lines of the messages that hold them.
 */
export function ticketsIn(messages: readonly Message[]): Stored[] {
  const uses = new Map(messages.flatMap((message) => message.toolUses).map((use) => [use.tool_use_id, use]));
  const seen = new Set<string>();
  const tickets: Stored[] = [];
  for (const message of messages) {
    for (const result of message.toolResults ?? []) {
      const ticket = readTicket(result.text);
      if (!ticket || isOwnTool(ticket.tool) || seen.has(ticket.id)) continue;
      seen.add(ticket.id);
      const input = uses.get(result.tool_use_id)?.input ?? {};
      tickets.push({ ...ticket, line: result.text, about: `${ticket.tool} called with ${inputLine(input)}` });
    }
    if (message.role === 'user' && (message.toolResults?.length ?? 0) === 0) tickets.push(...partsIn(message.text, seen));
  }
  return tickets;
}

function partsIn(text: string, seen: Set<string>): Stored[] {
  const out: Stored[] = [];
  for (const line of text.split('\n')) {
    const part = readPartTicket(line);
    if (!part || seen.has(part.id)) continue;
    seen.add(part.id);
    out.push({ ...part, line, about: `part ${part.part} of ${part.parts} of the conversation before a summary, messages ${part.first}-${part.last}` });
  }
  return out;
}

const CALL = /^\[call (\S+) (\S+)\] (.*)$/;
const RESULT = /^\[result (\S+)(?: error)?\]$/;

/**
 * The tickets written in a kept part: those of the results it holds, each
 * described by the call the part writes above it, and those of parts kept by
 * an earlier summary, which a part holds when a summary was summarized.
 */
function ticketsInPart(text: string, seen: Set<string>): Stored[] {
  const lines = text.split('\n');
  const calls = new Map<string, string>();
  for (const line of lines) {
    const match = CALL.exec(line);
    if (match) calls.set(match[2] as string, `${match[1]} called with ${match[3]}`);
  }
  const out: Stored[] = [];
  let result: string | undefined;
  for (const line of lines) {
    const header = RESULT.exec(line);
    if (header) {
      result = header[1];
      continue;
    }
    const ticket = readTicket(line);
    if (!ticket || isOwnTool(ticket.tool) || seen.has(ticket.id)) continue;
    seen.add(ticket.id);
    out.push({ ...ticket, line, about: (result !== undefined ? calls.get(result) : undefined) ?? `${ticket.tool} called` });
  }
  return [...out, ...partsIn(text, seen)];
}

/** Every ticket `find` offers: the conversation's, then, part by part up to MAX_PARTS, those in kept parts. */
async function everyTicket(files: Files, dirs: readonly string[], messages: readonly Message[]): Promise<Stored[]> {
  const tickets = ticketsIn(messages);
  const seen = new Set(tickets.map((ticket) => ticket.id));
  let read = 0;
  for (let index = 0; index < tickets.length && read < MAX_PARTS; index += 1) {
    const ticket = tickets[index] as Stored;
    if (ticket.tool !== PART) continue;
    read += 1;
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    // Parts are always followed: the limit is on the results offered, not on where they are read from.
    const inside = ticketsInPart(got.text, seen);
    tickets.push(...inside.filter((t) => t.tool === PART));
    tickets.push(...inside.filter((t) => t.tool !== PART).slice(0, Math.max(0, MAX_OFFERED - tickets.length)));
  }
  return tickets;
}

type Entry = { ticket: Stored; option: string; holds: boolean };

const describe = (ticket: Stored) => `${ticket.about}; ${ticket.bytes} bytes`;

async function found(files: Files, dirs: readonly string[], ticket: Stored, why: string): Promise<string> {
  const got = await recall(files, dirs, ticket.id);
  if ('error' in got) return `[${PLUGIN}] ${got.error}`;
  const what = ticket.tool === PART ? ticket.about : `${ticket.tool} result`;
  return `[found] ${what}, ${ticket.bytes} bytes; id ${ticket.id}; ${why}\n\n${got.text}`;
}

function listed(entries: readonly [Entry, number][], none: number | undefined): string {
  const lines = entries.map(
    ([entry, p]) => `- ${describe(entry.ticket)}; probability ${p.toFixed(2)}; recall with ${RECALL_TOOL} id ${entry.ticket.id}`,
  );
  if (none !== undefined) lines.push(`- or none of them; probability ${none.toFixed(2)}`);
  return [`[not sure] The likeliest results, most likely first:`, ...lines].join('\n');
}

/** The text of the `find` tool's answer. Nothing is thrown. */
export async function find(input: FindInput): Promise<string> {
  if (input.agentId !== undefined) {
    return `[${PLUGIN}] Nothing to find: this plugin does not move a subagent's results out of its conversation.`;
  }
  if (input.provider === null) {
    return (
      `[${PLUGIN}] find needs a Jev key: set provider and apiKey in the plugin's settings, or TYPESAFE_API_KEY or ` +
      'CLOUDFLARE_API_TOKEN in the environment. recall reads a result by its id without one.'
    );
  }
  const question = typeof input.question === 'string' ? input.question.trim() : '';
  if (question === '') return `[${PLUGIN}] Ask in words what the result is about.`;

  const { files, dirs } = input;
  const phrases = phrasesOf(question);
  const entries: Entry[] = [];
  // One stored text at a time: what is kept of each is a few hundred characters.
  for (const ticket of await everyTicket(files, dirs, input.messages)) {
    if (!(await isStored(files, dirs, ticket.line))) continue;
    const got = await recall(files, dirs, ticket.id);
    if ('error' in got) continue;
    const holds = phrases.length > 0 && phrases.every((phrase) => got.text.includes(phrase));
    entries.push({ ticket, option: `${describe(ticket)}. It reads: ${digest(shown(got.text), DIGEST_CHARS)}`, holds });
  }
  if (entries.length === 0) {
    return (
      `[${PLUGIN}] No ticket of a moved-out result is in this conversation: none was moved out, or a summary ` +
      'has run since that kept nothing, or they are older than what is shown. recall reads a result by its id.'
    );
  }

  const holding = entries.filter((entry) => entry.holds);
  if (holding.length === 1) {
    return found(files, dirs, (holding[0] as Entry).ticket, `matched the quoted phrase "${phrases[0]}"`);
  }
  const pool = holding.length > 1 ? holding : entries;
  const byKey = new Map(pool.map((entry, index): [string, Entry] => [`t${index + 1}`, entry]));
  const chosen = await choose(
    input.http,
    input.provider,
    question,
    [...byKey].map(([key, entry]) => ({ key, text: entry.option })),
    { always: { key: NONE, text: NONE_TEXT }, wait: input.wait },
  );
  if ('error' in chosen) return `[${PLUGIN}] Jev could not be asked: ${chosen.error}.`;

  const [first, second] = chosen.ranked;
  const decisive = first !== undefined && first[1] >= FOUND_AT && first[1] - (second?.[1] ?? 0) >= MARGIN;
  if (decisive && first[0] === NONE) {
    return `[not found] None of the moved-out results seems to be about that: it may still be in the conversation, or was never moved out.`;
  }
  if (decisive) {
    const entry = byKey.get(first[0]);
    if (entry) return found(files, dirs, entry.ticket, `probability ${first[1].toFixed(2)}`);
  }
  const likeliest = chosen.ranked.slice(0, LISTED);
  const results = likeliest.flatMap(([key, p]): [Entry, number][] => {
    const entry = byKey.get(key);
    return entry ? [[entry, p]] : [];
  });
  const none = likeliest.find(([key, p]) => key === NONE && p > 0)?.[1];
  return listed(results, none);
}
