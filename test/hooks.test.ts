import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { FIND_TOOL, RECALL_TOOL } from '../src/store.ts';
import { KEY_VARIABLES, PLACE_VARIABLES, ROUTE_VARIABLES } from '../src/trust.ts';

const hooks = readFileSync(new URL('../hooks/move-out.ts', import.meta.url), 'utf8');
const compaction = readFileSync(new URL('../src/compact.ts', import.meta.url), 'utf8');

test('the tool.call matchers are spelled out in the hook and name the tools the store names', () => {
  assert.ok(hooks.includes(`{ tool: '${RECALL_TOOL}' }`), 'recall matcher');
  assert.ok(hooks.includes(`{ tool: '${FIND_TOOL}' }`), 'find matcher');
});

test('every tool and the compaction read where results are through placesOf, so the old place is read too', () => {
  assert.ok(hooks.includes("placesOf(filesOf($), options['storeDir']"), 'placesOf');
  assert.ok(!hooks.includes('storeDirFrom('), 'the plain default is never used on its own');
  assert.ok(hooks.includes('const config: Config = {\n      store,'), 'the compaction is handed both places');
  assert.ok(hooks.includes('recall(filesOf($), store.read,'), 'recall reads both');
  assert.ok(hooks.includes('dirs: store.read,'), 'find reads both');
});

test("the find hook hands find the host's clock, answers a broken provider setting itself, and catches what the host throws", () => {
  const handler = hooks.slice(hooks.indexOf(`{ tool: '${FIND_TOOL}' }`));
  assert.ok(handler.includes('wait: (ms, signal) => $.clock.sleep(ms, { signal })'), 'clock');
  assert.ok(handler.includes('find cannot ask Jev: ${provider.error}'), 'provider error');
  assert.ok(handler.includes('} catch (error) {'), 'catch');
});

test("every variable trust.ts judges is read by the hook, so none of them is silently never the repository's", () => {
  const env = hooks.slice(hooks.indexOf('async function envOf('), hooks.indexOf('async function taintsOf('));
  for (const name of [...PLACE_VARIABLES, ...KEY_VARIABLES, ...ROUTE_VARIABLES]) {
    assert.ok(env.includes(`${name}: await $.env.get('${name}')`), name);
  }
});

test("where results are kept and where find sends both go through the repository's settings first", () => {
  assert.ok(hooks.includes("$.settings.read({ source: 'project' })") && hooks.includes("$.settings.read({ source: 'local' })"), 'both files');
  // The user file only tells the home directory apart: failing to read it must not stop anything.
  const taints = hooks.slice(hooks.indexOf('async function taintsOf('), hooks.indexOf('async function storeOf('));
  const [both, user] = taints.split("repo.user = await $.settings.read({ source: 'user' })");
  assert.ok(user !== undefined && both?.includes('repo = null;') && !user.includes('repo = null'), 'the user file is read on its own');
  assert.ok(hooks.includes('placeTaints(taints, options)'), 'the place');
  assert.ok(hooks.includes('sendTaints(taints, options)'), 'the sending');
  // Each of recall, find, the compaction and the clean-up takes the place from storeOf and gives up on its reason.
  const givingUp = hooks.split("if (typeof store === 'string')").length - 1;
  // The compaction calls it `place` until the place is known to be private (it keeps the conversation after that).
  assert.equal(givingUp + (hooks.split("if (typeof place === 'string')").length - 1), 4, 'four callers');
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
  assert.ok(collecting.includes("const store = await storeOf($, options);\n    if (typeof store === 'string') return;"), 'the clean-up too');
});

test('a compaction makes the place private before anything is written, and gives up when it cannot', () => {
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  const made = attempt.indexOf('await privateOf($, place)');
  assert.ok(made > 0, 'privateOf is called');
  assert.ok(made < attempt.indexOf('await compact('), 'before the compaction writes');
  assert.ok(made < attempt.indexOf('whyNotRebuilt('), 'and before a conversation that is not rebuilt is kept');
  assert.ok(
    attempt.includes("if (unsafe !== null) return { why: unsafe, keep: { unkept: 'the place to keep it in could not be made private' } };"),
    'and gives up on its reason, keeping nothing',
  );
  assert.ok(made < attempt.indexOf('store = place;'), 'the conversation is kept only in a place made private');
  assert.ok(attempt.indexOf('await noteRootOf($, store, options);') < attempt.indexOf('whyNotRebuilt('), "this session's transcript is noted before any summary");
  assert.ok(hooks.includes('$.process.run(argv, { timeoutMs: 10_000 })'), 'commands run through the host');
});

test('the clean-up runs after the session starts, unwaited, and recall, find and the compaction put back from the trash first', () => {
  const start = hooks.slice(hooks.indexOf("on('session.start'"), hooks.indexOf("on('tool.call'"));
  assert.ok(start.includes('void collectOnce($, options);'), 'not waited for');
  const recallHook = hooks.slice(hooks.indexOf(`{ tool: '${RECALL_TOOL}' }`), hooks.indexOf(`{ tool: '${FIND_TOOL}' }`));
  assert.ok(recallHook.includes('restoreFor($, store, new Set([id]))'), 'recall');
  const findHook = hooks.slice(hooks.indexOf(`{ tool: '${FIND_TOOL}' }`), hooks.indexOf("on('session.compact'"));
  assert.ok(findHook.indexOf('restoreFor($, store, ticketIds(messages))') < findHook.indexOf('await find('), 'find, first');
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  assert.ok(attempt.indexOf('restoreFor($, store, ticketIds(messages))') < attempt.indexOf('await compact('), 'the compaction, first');
  assert.ok(attempt.indexOf('await privateOf($, store)') < attempt.indexOf('noteRootOf('), 'the place recorded once private');
});

test('a compaction imports nothing that sends: compact.ts does not reach ask.ts', () => {
  assert.ok(!compaction.includes("from './ask.ts'"));
  assert.ok(!compaction.includes('http'));
});

test('every way the main conversation reaches the built-in summary keeps it first; only a subagent goes straight on', () => {
  const handler = hooks.slice(hooks.indexOf("on('session.compact'"));
  assert.deepEqual(handler.match(/return next\(e\)/g), ['return next(e)'], 'the subagent branch alone');
  assert.ok(handler.includes('if (e.agentId !== undefined) return next(e);'), 'and it is the subagent branch');
  assert.equal(handler.match(/return summarizeKeeping\(\$, /g)?.length, 3, 'the three branches that hand over');
  assert.ok(handler.includes('return summarizeKeeping($, e, next, tried.keep);'), 'why the compaction did not run');
  assert.ok(handler.includes("summarizeKeeping($, e, next, { store, messages: e.messages as readonly Message[] })"), 'nothing moved out');
  assert.ok(handler.includes('summarizeKeeping($, { ...e, messages: outcome.messages }, next, { store, messages: outcome.messages })'), 'too much left');
  assert.ok(hooks.includes('asSent = messagesFromApi(api) ?? messages;'), 'a conversation that is not rebuilt is kept from its blocks, or as handed');
  assert.ok(hooks.includes('return { why, keep: { store, messages: asSent } };'), 'when it cannot be rebuilt');
  assert.ok(hooks.includes('if (outcome.abandoned !== undefined) return { why: outcome.abandoned, keep: { store, messages: asSent } };'), 'when a result that holds an image could not be moved out');
  assert.ok(hooks.includes("keep: store === null ? { unkept: 'the place to keep it in could not be read' } : { store, messages: asSent }"), 'a failure once the place is known still keeps it');
});

test('a clean-up keeps what kept parts name: it collects against the ids followed through them, and stops when they cannot be read', () => {
  const collecting = hooks.slice(hooks.indexOf('async function collectOnce('), hooks.indexOf('function numberIn('));
  assert.ok(collecting.includes('const named = await namedThroughParts(files, dirs, live.ids);'), 'followed');
  assert.ok(collecting.includes("if ('stop' in named) {"), 'stops');
  assert.ok(collecting.includes('collect(list, execOf($), dir, named, now)'), 'collected against them');
  assert.ok(!collecting.includes('collect(list, execOf($), dir, live.ids, now)'), 'not against the transcripts alone');
});

test('stored results are written through mv where it starts, the reason a write failed is said, and a summary can be skipped', () => {
  assert.ok(hooks.includes('return { files: storingFilesOf($), now: () => Date.now() };'), 'the compaction writes through it');
  assert.ok(hooks.includes('return keepThenSummarize(storingFilesOf($), where,'), 'keeping the conversation too');
  assert.ok(hooks.includes("(why) => ({ skip: why })"), 'a skip is what the hook returns');
  assert.ok(compaction.includes("`; could not write: ${report.writeErrors.join(', ')}`"), 'the reason is said');
  const storing = hooks.slice(hooks.indexOf('function storingFilesOf('), hooks.indexOf('function runOf('));
  assert.ok(storing.includes("started('mv', ['-f', '--', from, to])"), 'mv -f --');
  assert.ok(storing.includes('$.process.run([`${place}/${program}`, ...args], { timeoutMs: 10_000 })'), 'from /bin, else /usr/bin, never through PATH');
  assert.ok(storing.includes("there.kind === 'file'"), 'what stands at the name after the move is a file');
  assert.ok(storing.includes("available: async () => (canMove ||= (await started('mv', [])) !== null),"), 'only that mv starts is remembered, never that it did not');
  assert.ok(hooks.includes('let canMove = false;'), 'and it starts out not known');
  assert.ok(storing.includes("started('mkdir', ['-p', '--', path])"), 'mkdir -p --');
  assert.ok(storing.includes("started('rm', ['-f', '--', path])"), 'rm -f --');
});

test("a compaction is told what is not the conversation from Claude Code's breakdown, and the line comes from src/", () => {
  assert.ok(hooks.includes('count: countFrom(context?.breakdown, tokens, api),'), 'count');
  assert.ok(!hooks.includes('function summary('), 'no line of its own');
  assert.equal(hooks.split('reportLine(outcome.report)').length - 1, 3, 'every line a compaction shows');
});

test('a result that holds an image is told from the blocks, handed to the compaction, and comes back from recall as an image', () => {
  assert.ok(hooks.includes('const media = mediaIn(api);'), 'read from the conversation with its blocks');
  assert.ok(hooks.includes('media: media.results,'), 'handed to the compaction');
  assert.ok(hooks.includes(': Math.ceil(charsOf(messages) / CHARS_PER_TOKEN) + media.images * IMAGE_TOKENS,'), 'a size made up from characters counts the images too, since the compaction takes them off');
  assert.ok(hooks.includes('whyNotRebuilt(messages, api) ?? (media.why === null ? null :'), 'what cannot be carried stops the rebuild');
  const handler = hooks.slice(hooks.indexOf(`{ tool: '${RECALL_TOOL}' }`), hooks.indexOf(`{ tool: '${FIND_TOOL}' }`));
  assert.ok(handler.includes('return { result: found.parts === undefined ? found.text : blocksOf(found.parts) };'), 'text as before, and what holds an image as its blocks (src/media.ts decides their form)');
});
