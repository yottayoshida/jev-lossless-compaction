// Builds the conversation of a trace: its files are written, each step is said in
// turn to one session, and what came of it is checked before anything is forked
// from it. A trace that compacted on the way, or came out too small or too large,
// is not used.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { claude } from './cc.ts';
import { type Usage } from './lib.ts';
import { BUILD_TOOLS, type Step, type Trace } from './traces.ts';

/** What the runs need of a built trace. */
export type Base = {
  trace: string;
  version: number;
  sessionId: string;
  model: string;
  claudeCode: string;
  /** Input tokens of the last request: the size of the conversation as it stands. */
  tokens: number;
  thinkingTokens: number;
  toolCalls: number;
  /**
   * The directory under the box's `work/` the trace was built in, of this
   * building alone. Claude Code files its records of sessions by the directory
   * they ran in, and a question may read them: a directory used before would
   * hold what earlier sessions were asked and answered.
   */
  work: string;
  modelUsage: Record<string, Usage>;
  /** SHA-256 of Claude Code's own record of the session, which stays on the machine. */
  recordSha256: string;
  builtAt: string;
};

export type Places = {
  /** Where sessions work and their records are kept: outside the repository. */
  box: string;
  /** The checkout of the plugin under test. */
  pluginDir: string;
};

export const workDir = (places: Places, base: Pick<Base, 'work'>) => join(places.box, 'work', base.work);

export type Conversation = { role: string; blocks: { type: string; text?: string; name?: string; input?: unknown; signatureChars?: number }[] }[];

/** What was said to the agent in a published conversation, in order. */
export const saidIn = (conversation: Conversation): string[] =>
  conversation.filter((message) => message.role === 'user').flatMap((message) => message.blocks.flatMap((block) => (block.type === 'text' && block.text !== undefined ? [block.text] : [])));

/** What a trace says to the agent, in order. */
export const saidBy = (trace: Pick<Trace, 'steps'>): string[] => trace.steps.flatMap((step) => ('say' in step ? [step.say] : []));
export const storeDir = (places: Places) => join(places.box, 'store');
const basePath = (places: Places, trace: Trace) => join(places.box, 'bases', `${trace.name}.json`);
const conversationPath = (places: Places, trace: Trace) => join(places.box, 'bases', `${trace.name}.conversation.json`);

function apply(dir: string, step: Step): void {
  if ('write' in step) {
    mkdirSync(dirname(join(dir, step.write)), { recursive: true });
    writeFileSync(join(dir, step.write), step.text);
  } else if ('remove' in step) {
    rmSync(join(dir, step.remove), { force: true });
  }
}

/** Where Claude Code keeps its own record of a session started in `cwd`. */
export function recordPath(cwd: string, sessionId: string): string {
  return join(homedir(), '.claude', 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'), `${sessionId}.jsonl`);
}

/**
 * The conversation of a built trace as it can be published: who said what, the
 * calls and their results, with the working directory's path taken out. Claude
 * Code's own record holds the account it ran under, and is not published.
 */
export function conversationOf(record: string, cwd: string): Conversation {
  const out: Conversation = [];
  const clean = (text: string) => text.split(cwd).join('<work>').split(homedir()).join('<home>');
  for (const line of record.split('\n')) {
    if (line.trim() === '') continue;
    let row: any;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if ((row.type !== 'user' && row.type !== 'assistant') || row.isSidechain || row.isMeta) continue;
    const content = row.message?.content;
    const blocks = (typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []).flatMap((block: any): Conversation[number]['blocks'] => {
      switch (block?.type) {
        case 'text':
          return [{ type: 'text', text: clean(String(block.text ?? '')) }];
        case 'tool_use':
          return [{ type: 'tool_use', name: block.name, input: JSON.parse(clean(JSON.stringify(block.input ?? {}))) }];
        case 'tool_result': {
          const inner = typeof block.content === 'string' ? block.content : (block.content ?? []).map((part: any) => part?.text ?? `[${part?.type}]`).join('\n');
          return [{ type: 'tool_result', text: clean(String(inner)) }];
        }
        case 'thinking':
          return [{ type: 'thinking', signatureChars: String(block.signature ?? '').length }];
        default:
          return [{ type: String(block?.type) }];
      }
    });
    if (blocks.length > 0) out.push({ role: row.message?.role ?? row.type, blocks });
  }
  return out;
}

/** Builds one trace, or reads the one already built. Throws when what was built is not what the trace asks for. */
export async function build(trace: Trace, model: string, places: Places, log: (text: string) => void = () => {}): Promise<Base> {
  const kept = basePath(places, trace);
  if (existsSync(kept)) {
    const base = JSON.parse(readFileSync(kept, 'utf8')) as Base;
    if (base.version === trace.version) {
      if (base.model !== model) throw new Error(`${kept}: built with ${base.model}, and ${model} is asked for; move it aside to build the trace again`);
      if (typeof base.work !== 'string') throw new Error(`${kept}: built before a trace had a working directory of its own; move it aside to build the trace again`);
      // A trace edited without its version raised is no longer the conversation that was built.
      const built = saidIn(JSON.parse(readFileSync(conversationPath(places, trace), 'utf8')) as Conversation);
      if (JSON.stringify(built) !== JSON.stringify(saidBy(trace))) throw new Error(`${kept}: the trace says something else than when it was built; raise its version, or move the file aside`);
      return base;
    }
  }
  // A directory no session has run in: Claude Code holds no record filed under it.
  const work = `${trace.name}-${Date.now().toString(36)}`;
  const dir = workDir(places, { work });
  if (existsSync(dir) || existsSync(dirname(recordPath(dir, 'any')))) throw new Error(`${dir}: sessions have run here before`);
  mkdirSync(dir, { recursive: true });
  for (const file of trace.files) apply(dir, { write: file.path, text: file.text });

  let sessionId: string | undefined;
  let last: Awaited<ReturnType<typeof claude>> | undefined;
  let toolCalls = 0;
  let said = 0;
  for (const step of trace.steps) {
    if (!('say' in step)) {
      apply(dir, step);
      continue;
    }
    said += 1;
    last = await claude({
      out: join(places.box, 'records', trace.name, 'build', `step-${String(said).padStart(2, '0')}.jsonl`),
      cwd: dir,
      model,
      arm: 'builtin',
      storeDir: storeDir(places),
      allowedTools: BUILD_TOOLS,
      prompt: step.say,
      ...(sessionId !== undefined ? { resume: sessionId, fork: false } : {}),
      ...(step.effort !== undefined ? { effort: step.effort } : {}),
    });
    if (last.session.compaction !== null) throw new Error(`${trace.name}: the conversation was compacted while it was built, at step ${said}`);
    sessionId = last.session.sessionId;
    toolCalls += last.session.toolCalls.length;
    log(`${trace.name} step ${said}: ${last.session.requests.at(-1)} tokens, ${last.session.toolCalls.length} calls, "${last.session.answer.slice(0, 40)}"`);
  }
  if (last === undefined || sessionId === undefined) throw new Error(`${trace.name}: nothing is said in this trace`);

  const tokens = last.session.requests.at(-1) ?? 0;
  const thinkingTokens = Object.values(last.session.modelUsage).reduce((sum, usage) => sum + usage.thinkingTokens, 0);
  const { minTokens, maxTokens, minThinkingTokens } = trace.accept;
  if (tokens < minTokens || tokens > maxTokens) throw new Error(`${trace.name}: built to ${tokens} tokens, outside ${minTokens}–${maxTokens}`);
  if (minThinkingTokens !== undefined && thinkingTokens < minThinkingTokens) {
    throw new Error(`${trace.name}: ${thinkingTokens} thinking tokens, under ${minThinkingTokens}`);
  }
  const memory = join(dirname(recordPath(dir, sessionId)), 'memory');
  if (existsSync(memory) && readdirSync(memory).length > 0) throw new Error(`${trace.name}: the session wrote to automatic memory`);

  for (const step of trace.beforeCompaction) apply(dir, step);

  const record = readFileSync(recordPath(dir, sessionId), 'utf8');
  const base: Base = {
    trace: trace.name,
    version: trace.version,
    sessionId,
    model,
    claudeCode: last.session.version,
    tokens,
    thinkingTokens,
    toolCalls,
    work,
    modelUsage: last.session.modelUsage,
    recordSha256: createHash('sha256').update(record).digest('hex'),
    builtAt: new Date().toISOString(),
  };
  mkdirSync(dirname(kept), { recursive: true });
  writeFileSync(kept, `${JSON.stringify(base, null, 2)}\n`);
  writeFileSync(conversationPath(places, trace), `${JSON.stringify(conversationOf(record, dir), null, 1)}\n`);
  return base;
}
