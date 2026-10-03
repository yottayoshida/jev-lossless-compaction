import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { judgeNotRunning, judgeRunning, judgeSessions, streamOf, type Stream } from '../bench/host.ts';
import { RECALL_TOOL, idOf } from '../src/store.ts';

// Cut from the streams of one `npm run check:host` on Claude Code 2.1.288: the events the checks read, nothing of the machine.
const read = (label: string) => streamOf(readFileSync(new URL(`fixtures/host/${label}.jsonl`, import.meta.url), 'utf8'));

/** The recall the agent was asked for, and the Read result of the first session whose text has that id. */
async function asked(first: Stream, recalled: Stream): Promise<{ id: string; original: string }> {
  const id = String(recalled.calls.find((call) => call.name === RECALL_TOOL)?.input['id'] ?? '');
  for (const call of first.calls.filter((one) => one.name === 'Read')) {
    const text = first.results.get(call.id) ?? '';
    if ((await idOf(text)) === id) return { id, original: text };
  }
  throw new Error('no Read result of the first session has the id recall was called with');
}

const ok = (checks: { name: string; ok: boolean }[]) => checks.map((check) => `${check.ok ? 'ok' : 'FAIL'} ${check.name}`);
const failing = (checks: { name: string; ok: boolean }[]) => checks.filter((check) => !check.ok).map((check) => check.name);

test('the streams of a real run read as the checks need: every check passes on the working tree, and on a hook file Claude Code does not load', async () => {
  const [first, compact, recalled] = [read('first'), read('compact'), read('recall')];
  assert.equal(first.version, '2.1.288');
  assert.equal(first.calls.filter((call) => call.name === 'Read').length, 6);
  const { id, original } = await asked(first, recalled);
  assert.ok(original.length > 20_000);
  assert.deepEqual(failing(judgeRunning(first, compact, recalled, id, original)), [], ok(judgeRunning(first, compact, recalled, id, original)).join('\n'));
  assert.deepEqual(failing(judgeNotRunning(read('not-running-first'), read('not-running-compact'))), []);
  // Each set judged as the other fails on every count: neither judge passes whatever it is given.
  assert.deepEqual(failing(judgeNotRunning(first, compact)), ['not running: no recall', 'not running: told at the first message', 'not running: a /compact is held']);
  assert.deepEqual(failing(judgeRunning(read('not-running-first'), read('not-running-compact'), read('not-running-compact'), id, original)), [
    'recall is registered',
    'nothing is told at the first message',
    'a /compact moves results out',
    'recall gives a result back as it was',
  ]);
});

test('each check fails when the part of the stream it reads is changed, and only that check', async () => {
  const [first, compact, recalled] = [read('first'), read('compact'), read('recall')];
  const { id, original } = await asked(first, recalled);
  const running = (f: Stream, c: Stream, r: Stream, i = id, o = original) => failing(judgeRunning(f, c, r, i, o));

  assert.deepEqual(running({ ...first, tools: first.tools.filter((tool) => tool !== RECALL_TOOL) }, compact, recalled), ['recall is registered']);
  const told = { ...first, hooks: first.hooks.map((hook) => (hook.event === 'UserPromptSubmit' ? { ...hook, stdout: '{"systemMessage":"something"}' } : hook)) };
  assert.deepEqual(running(told, compact, recalled), ['nothing is told at the first message']);
  assert.deepEqual(running({ ...first, hooks: [] }, compact, recalled), ['nothing is told at the first message']);
  assert.deepEqual(running(first, { ...compact, logs: compact.logs.map((line) => line.replace(/moved \d+ of/, 'moved 0 of')) }, recalled), ['a /compact moves results out']);
  assert.deepEqual(running(first, { ...compact, logs: [] }, recalled), ['a /compact moves results out']);
  // The text recall gave back, one character off; recall called with another id; the original one character off.
  const call = recalled.calls.find((one) => one.name === RECALL_TOOL);
  assert.ok(call);
  const results = new Map(recalled.results);
  results.set(call.id, `${original.slice(0, -1)}x`);
  assert.deepEqual(running(first, compact, { ...recalled, results }), ['recall gives a result back as it was']);
  assert.deepEqual(running(first, compact, recalled, 'f'.repeat(64)), ['recall gives a result back as it was']);
  assert.deepEqual(running(first, compact, recalled, id, `${original}\n`), ['recall gives a result back as it was']);

  const [notFirst, notCompact] = [read('not-running-first'), read('not-running-compact')];
  const notRunning = (f: Stream, c: Stream) => failing(judgeNotRunning(f, c));
  assert.deepEqual(notRunning({ ...notFirst, tools: [...notFirst.tools, RECALL_TOOL] }, notCompact), ['not running: no recall']);
  assert.deepEqual(notRunning({ ...notFirst, hooks: notFirst.hooks.map((hook) => ({ ...hook, stdout: '' })) }, notCompact), ['not running: told at the first message']);
  assert.deepEqual(notRunning(notFirst, { ...notCompact, result: 'Compacted' }), ['not running: a /compact is held']);
});

test('every session ran on one known Claude Code, with the plugin loaded from the copy checked', () => {
  // The records have the paths taken out: each plugin was loaded from `<path>`.
  const sessions = ['first', 'compact', 'recall', 'not-running-first', 'not-running-compact'].map((label) => ({ label, stream: read(label), pluginPath: '<path>' }));
  assert.ok(sessions.every(({ stream }) => stream.pluginPath === '<path>'));
  assert.deepEqual(failing(judgeSessions(sessions)), []);
  // Another copy loaded in one session; a version that is not known; two versions.
  const [one, ...rest] = sessions;
  assert.ok(one);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginPath: '<installed copy>' } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginPath: '' } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, pluginCount: 2 } }, ...rest])), ['the plugin is loaded from the copy checked']);
  assert.ok(sessions.every(({ stream }) => stream.pluginCount === 1));
  assert.deepEqual(failing(judgeSessions(sessions.map((session) => ({ ...session, stream: { ...session.stream, version: '' } })))), ['one Claude Code version, known']);
  assert.deepEqual(failing(judgeSessions([{ ...one, stream: { ...one.stream, version: '2.1.287' } }, ...rest])), ['one Claude Code version, known']);
});

test('a stream is read whatever else it holds: lines that are not JSON, and events of other kinds, are passed over', () => {
  const stream = streamOf(
    [
      'not json',
      JSON.stringify({ type: 'system', subtype: 'init', session_id: 's', claude_code_version: '9.9.9', tools: ['Read', RECALL_TOOL] }),
      JSON.stringify({ type: 'system', subtype: 'hook_started', hook_event: 'UserPromptSubmit' }),
      JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'UserPromptSubmit', exit_code: 0, stdout: '' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a' } }] } }),
      JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'one ' }, { type: 'text', text: 'two' }] }] } }),
      JSON.stringify({ type: 'result', result: 'done' }),
    ].join('\n'),
  );
  assert.equal(stream.version, '9.9.9');
  assert.deepEqual(stream.hooks, [{ event: 'UserPromptSubmit', exitCode: 0, stdout: '' }]);
  assert.deepEqual(stream.calls, [{ id: 't1', name: 'Read', input: { file_path: 'a' } }]);
  assert.equal(stream.results.get('t1'), 'one two');
  assert.equal(stream.result, 'done');
});
