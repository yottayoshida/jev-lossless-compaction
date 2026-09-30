// Which tool results may leave the conversation, and the order they leave in
// when nothing but rules decides it.

import type { Message, ToolUse } from './types.ts';

export type Candidate = {
  /** The tool_use_id of the call this result answers. */
  id: string;
  /** Position among every tool result of the conversation, oldest first. */
  position: number;
  tool: string;
  input: Record<string, unknown>;
  text: string;
  /** A later call made this result obsolete. Read off the calls; nothing is asked. */
  superseded: boolean;
};

export type Selection = {
  candidates: Candidate[];
  /** Why the other results stay: counted, so a report can say what was left alone. */
  left: { newest: number; short: number; failed: number; tickets: number; unlike: number };
};

export type SelectOptions = {
  /** Results in this many of the newest messages stay. The first message always stays. */
  keepNewest: number;
  /** Results shorter than this many characters stay. */
  minChars: number;
};

const WRITES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function fileOf(input: Record<string, unknown>): string | null {
  const path = input['file_path'] ?? input['notebook_path'];
  return typeof path === 'string' ? path : null;
}

/** What a call was aimed at, for the tools whose repeat makes the earlier result obsolete. */
function targetOf(use: ToolUse): string | null {
  switch (use.tool) {
    case 'Read':
      return JSON.stringify(['Read', fileOf(use.input), use.input['offset'] ?? null, use.input['limit'] ?? null]);
    case 'Bash':
      return JSON.stringify(['Bash', use.input['command'] ?? null]);
    case 'Grep':
    case 'Glob':
      return JSON.stringify([use.tool, use.input]);
    default:
      return null;
  }
}

/**
 * The results that may be moved out, oldest first. `stored` holds the ids of
 * results that already are tickets of this store; a line that only looks like
 * one is an ordinary result.
 */
export function select(messages: readonly Message[], options: SelectOptions, stored: ReadonlySet<string>): Selection {
  const uses = new Map<string, ToolUse>();
  const order: string[] = [];
  for (const message of messages) {
    for (const use of message.toolUses) {
      uses.set(use.tool_use_id, use);
      order.push(use.tool_use_id);
    }
  }

  // The last call aimed at each target, and the last write to each file.
  const lastCall = new Map<string, number>();
  const lastWrite = new Map<string, number>();
  order.forEach((id, index) => {
    const use = uses.get(id);
    if (!use) return;
    const target = targetOf(use);
    if (target !== null) lastCall.set(target, index);
    const file = fileOf(use.input);
    if (file !== null && WRITES.has(use.tool)) lastWrite.set(file, index);
  });
  const callIndex = new Map(order.map((id, index) => [id, index]));

  const firstKept = Math.max(1, messages.length - Math.max(0, options.keepNewest));
  const left = { newest: 0, short: 0, failed: 0, tickets: 0, unlike: 0 };
  const candidates: Candidate[] = [];
  let position = 0;

  messages.forEach((message, index) => {
    for (const result of message.toolResults ?? []) {
      position += 1;
      if (stored.has(result.tool_use_id)) {
        left.tickets += 1;
        continue;
      }
      if (index === 0 || index >= firstKept) {
        left.newest += 1;
        continue;
      }
      if (result.isError) {
        left.failed += 1;
        continue;
      }
      if (result.text.length < options.minChars) {
        left.short += 1;
        continue;
      }
      const use = uses.get(result.tool_use_id);
      // What is stored is the text on the result's side. The text on the call's
      // side leaves with it, so it has to be the same text.
      if (use?.text !== undefined && use.text !== result.text) {
        left.unlike += 1;
        continue;
      }
      const at = callIndex.get(result.tool_use_id) ?? -1;
      const target = use ? targetOf(use) : null;
      const file = use && use.tool === 'Read' ? fileOf(use.input) : null;
      const repeated = target !== null && (lastCall.get(target) ?? -1) > at;
      const rewritten = file !== null && (lastWrite.get(file) ?? -1) > at;
      candidates.push({
        id: result.tool_use_id,
        position,
        tool: use?.tool ?? 'tool',
        input: use?.input ?? {},
        text: result.text,
        superseded: repeated || rewritten,
      });
    }
  });

  return { candidates, left };
}

const WORD = /[a-z0-9_]{3,}/g;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;

/** Words, and for text written without spaces, every pair of neighbouring characters. */
export function termsOf(text: string): Set<string> {
  const terms = new Set<string>(text.toLowerCase().match(WORD) ?? []);
  for (const run of text.match(UNSPACED) ?? []) {
    for (let i = 0; i + 1 < run.length; i += 1) terms.add(run.slice(i, i + 2));
  }
  return terms;
}

/** The share of the goal's terms that a candidate's call and the start of its result mention. */
export function overlap(goal: ReadonlySet<string>, candidate: Candidate): number {
  if (goal.size === 0) return 0;
  const mentioned = termsOf(`${JSON.stringify(candidate.input)}\n${candidate.text.slice(0, 4000)}`);
  let shared = 0;
  for (const term of goal) if (mentioned.has(term)) shared += 1;
  return shared / goal.size;
}

/**
 * The order results leave in when only rules decide: those a later call made
 * obsolete, then those that share the least with the goal, then the oldest.
 */
export function ruleOrder(candidates: readonly Candidate[], goal: string): Candidate[] {
  const terms = termsOf(goal);
  const shared = new Map(candidates.map((candidate) => [candidate.id, overlap(terms, candidate)]));
  return [...candidates].sort(
    (a, b) =>
      Number(b.superseded) - Number(a.superseded) ||
      (shared.get(a.id) ?? 0) - (shared.get(b.id) ?? 0) ||
      a.position - b.position,
  );
}

// Text the host writes into a person's turn. It is not what they are working on.
const HOST_TEXT = /<(system-reminder|task-notification|local-command-[a-z]+|command-[a-z]+)>[\s\S]*?<\/\1>/g;

/** The host hands a plugin the newest 4096 messages of a conversation and no more. */
export const HOST_SHOWS = 4096;

// The kinds of block a rebuilt message carries as text, or loses in the way the
// README says it does (thinking). Any other kind is something that would go
// missing without a word: an image, a document, a kind that does not exist yet.
const REBUILT = new Set(['text', 'tool_use', 'tool_result', 'tool_reference', 'thinking', 'redacted_thinking']);

/**
 * Why this conversation is left to the built-in compaction, or null when
 * every message of it can be rebuilt. `api` is the conversation with its
 * blocks intact.
 */
export function whyNotRebuilt(messages: readonly Message[], api: unknown): string | null {
  if (!Array.isArray(api)) return 'the conversation could not be read with its blocks';
  if (messages.length >= HOST_SHOWS || api.length >= HOST_SHOWS) {
    return `the conversation has ${HOST_SHOWS} messages or more, and older ones may not have been shown`;
  }
  const kinds = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object' || node === null) return;
    const block = node as Record<string, unknown>;
    const kind = block['type'];
    if (typeof kind !== 'string') kinds.add('a block without a kind');
    else if (!REBUILT.has(kind)) kinds.add(/^[a-z_]{1,40}$/.test(kind) ? kind : 'a kind with an unusual name');
    visit(block['content']);
  };
  for (const message of api) visit((message as { content?: unknown } | null)?.content);
  return kinds.size === 0 ? null : `the conversation holds what a rebuilt message cannot carry: ${[...kinds].sort().join(', ')}`;
}

/** What the person is working on: what they asked the compaction to keep, then their latest turns. */
export function goalOf(messages: readonly Message[], instructions: string | undefined): string {
  const said = messages
    .filter((message) => message.role === 'user' && (message.toolResults?.length ?? 0) === 0)
    .map((message) => message.text.replace(HOST_TEXT, '').trim())
    .filter((text) => text !== '' && !text.startsWith('/'))
    .slice(-3);
  return [instructions?.trim() ?? '', ...said].filter((text) => text !== '').join('\n\n');
}
