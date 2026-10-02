// What `find` picks, set against a plain word match, with no agent in between.
// The results of a built conversation that the plugin would move out by size
// are stored, a ticket standing for each, and the plugin's own `find` is called
// with each question: the same function the tool runs, asking Jev. No session of
// Claude Code is started. What is sent is what `find` sends: for each result the
// call that made it and a few hundred characters of its text.

import { find } from '../src/find.ts';
import { moveOut } from '../src/store.ts';
import type { Provider } from '../src/ask.ts';
import type { Http, Message } from '../src/types.ts';
import { MemoryFiles } from '../test/helpers.ts';
import { type Conversation } from './build.ts';
import { lexicalPick } from './lib.ts';
import { type FindQuestion } from './traces.ts';

/** The plugin's default: a result shorter than this stays in the conversation, and is no option of `find`. */
export const MIN_CHARS = 2000;

const DIR = '/bench/store';

export type Result = { tool: string; input: Record<string, unknown>; text: string };

/** The results of a published conversation, each with the call that made it, that are long enough to be moved out. */
export function resultsOf(conversation: Conversation, minChars = MIN_CHARS): Result[] {
  const calls = conversation.flatMap((message) => message.blocks.filter((block) => block.type === 'tool_use'));
  const results = conversation.flatMap((message) => message.blocks.filter((block) => block.type === 'tool_result'));
  if (calls.length !== results.length) throw new Error(`${calls.length} calls and ${results.length} results: they cannot be paired`);
  return calls
    .map((call, at) => ({ tool: String(call.name ?? ''), input: (call.input ?? {}) as Record<string, unknown>, text: results[at]?.text ?? '' }))
    .filter((result) => result.text.length >= minChars);
}

export type Staged = { files: MemoryFiles; messages: Message[]; stored: (Result & { id: string })[] };

/** The results stored as the plugin stores them, and a conversation that holds a ticket for each. */
export async function staged(results: readonly Result[]): Promise<Staged> {
  const files = new MemoryFiles();
  for (const path of [DIR, `${DIR}/blobs`, `${DIR}/index`, `${DIR}/tmp`]) files.dirs.add(path);
  const stored: Staged['stored'] = [];
  const tickets: string[] = [];
  for (const result of results) {
    const moved = await moveOut(files, DIR, result.tool, result.text);
    if ('reason' in moved) throw new Error(`a result of ${result.tool} could not be stored: ${moved.reason}`);
    // The same text returned twice is stored once, and is one option.
    if (stored.some((one) => one.id === moved.id)) continue;
    stored.push({ ...result, id: moved.id });
    tickets.push(moved.text);
  }
  const messages: Message[] = [
    { role: 'user', text: 'The conversation.', toolUses: [] },
    { role: 'assistant', text: '', toolUses: stored.map((one, at) => ({ tool_use_id: `call-${at + 1}`, tool: one.tool, input: one.input })) },
    { role: 'user', text: '', toolUses: [], toolResults: tickets.map((text, at) => ({ tool_use_id: `call-${at + 1}`, text, isError: false })) },
  ];
  return { files, messages, stored };
}

export type Answer = {
  /** `gave`: one result, with its text. `listed`: the likeliest few, to choose from. `none`: it said none is about that. `failed`: Jev was not asked, or did not answer. */
  kind: 'gave' | 'listed' | 'none' | 'failed';
  /** The ids named, most likely first. */
  ids: string[];
};

/** What `find` answered with, read from the head of its text. */
export function readAnswer(text: string): Answer {
  const head = text.split('\n\n')[0] ?? '';
  const ids = [...head.matchAll(/\bid ([0-9a-f]{64})\b/g)].map((match) => match[1] as string);
  if (head.startsWith('[found]') && ids.length === 1) return { kind: 'gave', ids };
  if (head.startsWith('[not sure]') && ids.length > 0) return { kind: 'listed', ids };
  if (head.startsWith('[not found]')) return { kind: 'none', ids: [] };
  return { kind: 'failed', ids: [] };
}

export type Pick = {
  trace: string;
  question: string;
  by: FindQuestion['by'];
  options: number;
  /** The ids of the options that hold the text asked for: one when the question can be answered, none when what holds it was too short to be moved out. */
  right: string[];
  /** The option sharing the most words with the question: the call that made it and its text in full, where `find` sends Jev the call and a few hundred characters. */
  words: string | null;
  jev: Answer & { ms: number; said: string };
};

/** Each question of a trace asked of `find` and of the word match, over the same options. */
export async function pick(trace: string, questions: readonly FindQuestion[], conversation: Conversation, provider: Provider, http: Http): Promise<Pick[]> {
  const { files, messages, stored } = await staged(resultsOf(conversation));
  const picks: Pick[] = [];
  for (const question of questions) {
    const began = Date.now();
    const said = await find({ files, dirs: [DIR], messages, provider, http, question: question.ask });
    picks.push({
      trace,
      question: question.id,
      by: question.by,
      options: stored.length,
      right: stored.filter((one) => one.text.includes(question.target)).map((one) => one.id),
      words: lexicalPick(question.ask, stored.map((one) => ({ id: one.id, text: `${one.tool} ${JSON.stringify(one.input)}\n${one.text}` })))?.id ?? null,
      jev: { ...readAnswer(said), ms: Date.now() - began, said: (said.split('\n\n')[0] ?? '').slice(0, 600) },
    });
  }
  return picks;
}

/** How one question went for `find`. */
export type Went = 'gave the right one' | 'gave a wrong one' | 'listed, the right one first' | 'listed, the right one further down' | 'listed without it' | 'said none' | 'did not answer';

export function wentOf(one: Pick): Went {
  const right = new Set(one.right);
  const { kind, ids } = one.jev;
  if (kind === 'failed') return 'did not answer';
  if (kind === 'none') return 'said none';
  if (kind === 'gave') return right.has(ids[0] ?? '') ? 'gave the right one' : 'gave a wrong one';
  if (right.has(ids[0] ?? '')) return 'listed, the right one first';
  return ids.some((id) => right.has(id)) ? 'listed, the right one further down' : 'listed without it';
}

const WENT: readonly Went[] = ['gave the right one', 'gave a wrong one', 'listed, the right one first', 'listed, the right one further down', 'listed without it', 'said none', 'did not answer'];

/**
 * The table: per trace and kind of question, the questions whose answer is
 * among the options, how the word match did on them and how `find` did. A
 * question whose answer was too short to be moved out is counted apart: there
 * the right answer of `find` is that none of the options is it.
 */
export function pickTable(picks: readonly Pick[]): string {
  const groups = [...new Set(picks.map((one) => `${one.trace}|${one.by}`))];
  const head = ['Trace', 'Asked by', 'Options', 'Questions', 'Word match: right', ...WENT.map((went) => `find: ${went}`), 'Answer not among the options: find said none'];
  const rows = groups.map((group) => {
    const [trace, by] = group.split('|');
    const of = picks.filter((one) => one.trace === trace && one.by === by);
    const answerable = of.filter((one) => one.right.length > 0);
    const rest = of.filter((one) => one.right.length === 0);
    return [
      trace ?? '',
      by ?? '',
      String(of[0]?.options ?? 0),
      String(answerable.length),
      String(answerable.filter((one) => one.words !== null && one.right.includes(one.words)).length),
      ...WENT.map((went) => String(answerable.filter((one) => wentOf(one) === went).length)),
      `${rest.filter((one) => one.jev.kind === 'none').length} of ${rest.length}`,
    ];
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map((_, at) => (at === 0 ? '---' : '---:')).join(' | ')} |`, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}
