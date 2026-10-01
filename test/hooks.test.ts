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
  // Each of recall, find and the compaction takes the place from storeOf and gives up on its reason.
  assert.equal(hooks.split("if (typeof store === 'string')").length - 1, 3, 'three callers');
});

test('a compaction makes the place private before anything is written, and gives up when it cannot', () => {
  const attempt = hooks.slice(hooks.indexOf('async function attempt('), hooks.indexOf('export const register'));
  const made = attempt.indexOf('await privateOf($, store)');
  assert.ok(made > 0, 'privateOf is called');
  assert.ok(made < attempt.indexOf('await compact('), 'before the compaction writes');
  assert.ok(attempt.includes('if (unsafe !== null) return unsafe;'), 'and gives up on its reason');
  assert.ok(hooks.includes('$.process.run(argv, { timeoutMs: 10_000 })'), 'commands run through the host');
});

test('a compaction imports nothing that sends: compact.ts does not reach ask.ts', () => {
  assert.ok(!compaction.includes("from './ask.ts'"));
  assert.ok(!compaction.includes('http'));
});
