import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import {
  KEY_VARS,
  OUTCOMES,
  gapsOf,
  holdsAll,
  keysIn,
  lexicalPick,
  lookedOutside,
  median,
  outcomeOf,
  ownUsage,
  problemsOf,
  readLine,
  readSession,
  retrievalOf,
  shuffled,
  spread,
  tellsIn,
  type ToolCall,
} from '../bench/lib.ts';
import { saidBy, saidIn, type Conversation } from '../bench/build.ts';
import { argsOf, envOf, toolsOf } from '../bench/cc.ts';
import { MISSED, batchName, currentOf, itemsOf, keyOf, promptOf, published, scrubbed, summed, unitsUnder, verdictsIn, type Grades } from '../bench/grade.ts';
import { MIN_CHARS, pick, pickTable, readAnswer, resultsOf, staged, wentOf, type Pick } from '../bench/pick.ts';
import { estimates, finds, graderOf, outcomesOf, overruled, report, verdictOf, whole } from '../bench/report.ts';
import { QUOTE, armsOf, staleness, variantsOf, type Unit } from '../bench/run.ts';
import { BUILT, FOUND, PROBED, TRACES, described } from '../bench/traces.ts';
import { termsOf } from '../src/select.ts';
import { reportLine, undoneLine, type Report } from '../src/compact.ts';
import type { Http } from '../src/types.ts';
import { ok, questionsOf, recordingHttp, type Sent } from './helpers.ts';

// Sessions recorded on Claude Code 2.1.287 with Haiku 4.5, the user's settings left
// out: one trace of six reads, compacted by each arm, and one question asked of each.
// The results of the tool calls are taken out, the home directory is renamed, and what a
// session prints of the account it ran under is left out. They were recorded before the
// tools of a session were narrowed to the ones named, so each still lists them all.
const recorded = (name: string) => readSession(readFileSync(new URL(`./fixtures/bench/${name}.jsonl`, import.meta.url), 'utf8'));
const base = recorded('base');
const compactPlugin = recorded('compact-plugin');
const compactBuiltin = recorded('compact-builtin');
const questionPlugin = recorded('question-plugin');
const questionBuiltin = recorded('question-builtin');

test('a recorded session is read: what it ran with, each request once, the calls it made', () => {
  assert.equal(base.model, 'claude-haiku-4-5-20251001');
  assert.equal(base.version, '2.1.287');
  assert.deepEqual(base.plugins, []);
  assert.deepEqual(base.mcp, []);
  assert.equal(base.memory, null);
  assert.equal(base.answer, 'done');
  assert.equal(base.isError, false);
  assert.deepEqual(base.toolCalls.map((call) => call.name), ['Read', 'Read', 'Read', 'Read', 'Read', 'Read']);
  // Seven responses, though the stream prints one twice when it holds thinking and a call.
  assert.deepEqual(base.requests, [18257, 25453, 32524, 39587, 46649, 53712, 60777]);
  assert.equal(base.compaction, null);
});

test('a call printed again is the call it was: counted once by its id, whatever response carries it', () => {
  const said = (id: string, callId: string) =>
    JSON.stringify({ type: 'assistant', message: { id, usage: { input_tokens: 10 }, content: [{ type: 'tool_use', id: callId, name: 'Read', input: {} }] } });
  // The second response is the first printed again after a compaction; the third is a call of its own.
  const session = readSession([said('msg_1', 'toolu_1'), said('msg_2', 'toolu_1'), said('msg_3', 'toolu_2')].join('\n'));
  assert.deepEqual(session.toolCalls.map((call) => call.name), ['Read', 'Read']);
  // A call that carries no id cannot be told from another, and is kept.
  const bare = JSON.stringify({ type: 'assistant', message: { id: 'msg_4', content: [{ type: 'tool_use', name: 'Grep', input: {} }] } });
  assert.equal(readSession([bare, bare.replace('msg_4', 'msg_5')].join('\n')).toolCalls.length, 2);
});

test('a compaction is read from each arm: the plugin\'s line and no request, the summary\'s seconds and its own usage', () => {
  assert.deepEqual(compactPlugin.plugins, [{ source: 'lossless-compaction@inline', path: '/home/u/lossless-compaction' }]);
  assert.deepEqual(compactPlugin.mcp, ['lossless-compaction']);
  assert.deepEqual(compactPlugin.compaction, { trigger: 'manual', preTokens: 60882, postTokens: 13704, durationMs: 101, preserved: false });
  assert.equal(compactPlugin.uiLog.length, 1);
  assert.deepEqual(readLine(compactPlugin.uiLog[0] ?? ''), {
    outcome: 'moved',
    moved: 3,
    results: 6,
    images: 0,
    charsBefore: 108144,
    charsAfter: 54793,
    estimate: 44333,
    window: 167000,
    ms: 55,
  });
  assert.deepEqual(compactPlugin.requests, []);

  assert.deepEqual(compactBuiltin.plugins, []);
  assert.equal(compactBuiltin.compaction?.durationMs, 25730);
  assert.equal(compactBuiltin.compaction?.preserved, true);
  assert.deepEqual(compactBuiltin.uiLog, []);
});

test('what a session used by itself is its usage less its parent\'s: the plugin\'s compaction costs nothing, the summary its request', () => {
  // The figure a session prints is cumulative: the plugin's compaction shows the whole trace's cost.
  assert.equal(compactPlugin.modelUsage['claude-haiku-4-5-20251001']?.costUSD, base.modelUsage['claude-haiku-4-5-20251001']?.costUSD);
  const plugin = ownUsage(compactPlugin, base);
  assert.equal(plugin.costUSD, 0);
  assert.equal(plugin.outputTokens, 0);

  const builtin = ownUsage(compactBuiltin, base);
  assert.ok(Math.abs(builtin.costUSD - 0.0290912) < 1e-6, `${builtin.costUSD}`);
  assert.equal(builtin.outputTokens, 3928 - 890);
  assert.equal(builtin.thinkingTokens, 1572 - 391);
  // With no parent, a session's usage is all its own.
  assert.equal(ownUsage(base, null).costUSD, base.modelUsage['claude-haiku-4-5-20251001']?.costUSD);
});

test('a session that is not the one meant is told from its start, and why', () => {
  const had = { base: base.tools, builtin: compactBuiltin.tools, plugin: compactPlugin.tools };
  assert.deepEqual(problemsOf(base, { arm: 'builtin', tools: had.base, version: '2.1.287' }), []);
  assert.deepEqual(problemsOf(compactBuiltin, { arm: 'builtin', tools: had.builtin }), []);
  assert.deepEqual(problemsOf(compactPlugin, { arm: 'plugin', tools: had.plugin, pluginPath: '/home/u/lossless-compaction' }), []);

  assert.deepEqual(problemsOf(compactPlugin, { arm: 'builtin', tools: had.plugin }), [
    'the plugin is loaded in the built-in arm',
    'hooks ran in the built-in arm: SessionStart:compact',
  ]);
  assert.deepEqual(problemsOf(compactBuiltin, { arm: 'plugin', tools: had.builtin }), ['the plugin is not loaded once in the plugin arm']);
  // Two checkouts carry the same version: the arm is told by where the plugin was loaded from.
  assert.deepEqual(problemsOf(compactPlugin, { arm: 'plugin', tools: had.plugin, pluginPath: '/home/u/v0.5.2' }), ['the plugin was loaded from /home/u/lossless-compaction']);
  assert.deepEqual(problemsOf(base, { arm: 'builtin', tools: had.base, version: '2.1.286' }), ['Claude Code is 2.1.287, not 2.1.286']);

  // A session has the tools it was started with and no other: one more is a way to an answer the other arm may not have, one fewer a way it lacks.
  const asking = { ...base, tools: ['Read', 'Grep', 'Glob', 'ToolSearch'] };
  assert.deepEqual(problemsOf(asking, { arm: 'builtin', tools: ['Glob', 'Grep', 'Read', 'ToolSearch'] }), [], 'the order they are listed in is not looked at');
  assert.deepEqual(problemsOf({ ...asking, tools: [...asking.tools, 'Bash'] }, { arm: 'builtin', tools: asking.tools }), ["the session's tools are Bash, Glob, Grep, Read, ToolSearch, not Glob, Grep, Read, ToolSearch"]);
  assert.deepEqual(problemsOf({ ...asking, tools: [...asking.tools, 'mcp__lossless-compaction__find'] }, { arm: 'builtin', tools: asking.tools }).length, 1, 'a tool the plugin registered by itself');
  assert.deepEqual(problemsOf({ ...asking, tools: ['Read'] }, { arm: 'builtin', tools: asking.tools }), ["the session's tools are Read, not Glob, Grep, Read, ToolSearch"]);
  assert.deepEqual(problemsOf({ ...asking, tools: [] }, { arm: 'builtin', tools: [] }), [], 'the grader has none');
  // The plugin's tools are there in its arm only.
  const named = ['Read', 'ToolSearch', 'mcp__lossless-compaction__recall'];
  assert.deepEqual(toolsOf({ arm: 'plugin', allowedTools: named }), named);
  assert.deepEqual(toolsOf({ arm: 'builtin', allowedTools: named }), ['Read', 'ToolSearch']);

  const meddled = { ...base, memory: { auto: '/somewhere' }, mcp: ['notion'], denials: [{ tool_name: 'Write' }], hooks: ['Stop:lang-gate'], plugins: [{ source: 'other@market', path: '/p' }] };
  assert.deepEqual(problemsOf(meddled, { arm: 'builtin', tools: had.base }), [
    'other plugins are loaded: other@market',
    'other MCP servers are connected: notion',
    'automatic memory is on',
    '1 tool call(s) were refused',
    'hooks ran in the built-in arm: Stop:lang-gate',
    "hooks ran that are not the plugin's: Stop:lang-gate",
  ]);
  assert.ok(problemsOf(readSession(''), { arm: 'builtin', tools: [] }).includes('the session did not start'));
  // At a question a refused call is what the agent tried: counted, and no reason to stop.
  assert.deepEqual(problemsOf({ ...base, denials: [{ tool_name: 'Bash' }] }, { arm: 'builtin', tools: had.base, refusalsCounted: true }), []);
});

test('a figure a session did not give is not read as nought: the session is not used', () => {
  assert.deepEqual(gapsOf(compactPlugin, 'compaction'), []);
  assert.deepEqual(gapsOf(compactBuiltin, 'compaction'), []);
  assert.deepEqual(gapsOf(questionPlugin, 'question'), []);
  assert.deepEqual(gapsOf(questionBuiltin, 'question'), []);
  assert.deepEqual(gapsOf(base, 'compaction'), ['nothing was compacted']);
  // The plugin's compaction makes no request, which is not a gap; a question without one is.
  assert.deepEqual(compactPlugin.requests, []);
  assert.deepEqual(gapsOf({ ...questionPlugin, requests: [] }, 'question'), ['the question made no request']);
  assert.deepEqual(gapsOf({ ...questionPlugin, requests: [41176, 0], durationMs: 0, modelUsage: {} }, 'question'), [
    'a request did not say what it was sent',
    'the question did not say how long it took',
    'the question did not say what it used',
  ]);
  // A boundary printed without its figures: read, they are not numbers, and none is taken for zero.
  const bare = readSession(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'manual' } }));
  assert.ok(Number.isNaN(bare.compaction?.durationMs) && Number.isNaN(bare.compaction?.preTokens));
  assert.equal(gapsOf(bare, 'compaction').length, 3);
  // A compaction that took no time at all is a figure; one that says nothing of what was in use is not.
  const instant = readSession(JSON.stringify({ type: 'system', subtype: 'compact_boundary', compact_metadata: { pre_tokens: 60882, post_tokens: 13704, duration_ms: 0 } }));
  assert.deepEqual(gapsOf(instant, 'compaction'), []);
  assert.ok(problemsOf({ ...base, version: '' }, { arm: 'builtin', tools: base.tools }).includes('the session did not say which Claude Code it is'));
});

test('the plugin\'s line is read in every form it has, and from the function that writes it', () => {
  const report: Report = { results: 21, candidates: 9, moved: 6, images: 2, charsBefore: 844544, charsAfter: 548237, tokensAfter: 52357, counted: true, window: 167000, notMoved: {}, writeErrors: [], ms: 61 };
  assert.deepEqual(readLine(`lossless-compaction: ${reportLine(report)}`), {
    outcome: 'moved', moved: 6, results: 21, images: 2, charsBefore: 844544, charsAfter: 548237, estimate: 52357, window: 167000, ms: 61,
  });
  // No count of tokens when the plugin could not stand behind one, and seconds for a slow one.
  const plain = readLine(reportLine({ ...report, images: 0, counted: false, ms: 2400 }));
  assert.equal(plain?.estimate, undefined);
  assert.equal(plain?.window, undefined);
  assert.equal(plain?.ms, 2400);
  assert.equal(readLine(`built-in compaction on what is left, too much is still in use: ${reportLine(report)}`)?.outcome, 'too-much');
  assert.equal(readLine(`built-in compaction: nothing could be moved out (${reportLine({ ...report, moved: 0 })})`)?.outcome, 'nothing');
  assert.equal(readLine('lossless-compaction: built-in compaction: the conversation holds what a rebuilt message cannot carry: image')?.outcome, 'other');
  // A `/compact` left undone (ADR 0015): what was in use where Claude Code gave the figure, and no figure where it did not.
  assert.deepEqual(readLine(`lossless-compaction: ${undoneLine(28425, 167000)}`), {
    outcome: 'undone', moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, inUse: 28425, window: 167000, ms: 0,
  });
  assert.deepEqual(readLine(`lossless-compaction: ${undoneLine(null, 167000)}`), { outcome: 'undone', moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 });
  assert.equal(readLine('something else'), null);
});

test('a compaction a hook skipped is read as not carried out, with what Claude Code said of it', () => {
  const why = `lossless-compaction: ${undoneLine(28425, 167000)}`;
  const skipped = readSession(
    [
      { type: 'system', subtype: 'status', status: 'compacting' },
      { type: 'system', subtype: 'status', status: null, compact_result: 'failed', compact_error: `skipped: ${why}` },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n'),
  );
  assert.equal(skipped.compaction, null);
  assert.equal(skipped.skipped, `skipped: ${why}`);
  // The plugin shows no line of its own beside it: what it left undone is read from the reason.
  assert.deepEqual(skipped.uiLog, []);
  assert.equal(readLine(skipped.skipped ?? '')?.inUse, 28425);
  // A compaction that went through is not one, nor is a session that compacted nothing.
  assert.equal(compactPlugin.skipped, null);
  assert.equal(base.skipped, null);
  assert.equal(readSession(JSON.stringify({ type: 'system', subtype: 'status', status: null, compact_result: 'success' })).skipped, null);
});

test('an exact answer is right when it holds every part asked for, whatever its spacing, case and Markdown', () => {
  const line = 'record 2-0150: station 1325 reported 664 units at step 150';
  assert.ok(holdsAll(`The line said:\n\n> Record 2-0150:  station 1325 reported 664 units\n  at step 150`, [line]));
  assert.ok(!holdsAll('record 2-0150: station 1325 reported 646 units at step 150', [line]));
  assert.ok(holdsAll('port 8443, and never add left-pad', ['8443', 'left-pad']));
  assert.ok(!holdsAll('port 8443', ['8443', 'left-pad']));
  assert.ok(!holdsAll('anything', []), 'nothing to look for is not a match');
  // The same text in bold, in code marks, or laid out in a table is the same answer.
  assert.ok(holdsAll('The line was **record 2-0150: station 1325 reported `664` units at step 150**.', [line]));
  assert.ok(holdsAll('| record | checksum |\n| --- | --- |\n| batch 07: 9 warnings, | checksum deadbeef |', ['batch 07: 9 warnings, checksum deadbeef']));
  assert.ok(!holdsAll('**checksum deadbeee**', ['checksum deadbeef']));
  // The marks sit against the punctuation of what they wrap, and a quoted line is folded.
  const whole = 'batch 07: 9 warnings, checksum deadbeef';
  for (const answer of ['**batch 07**: 9 warnings, checksum deadbeef', 'batch 07: **9 warnings**, checksum deadbeef', 'batch 07: 9 warnings, checksum _deadbeef_', '`batch 07: 9 warnings, checksum deadbeef`.', '> batch 07: 9 warnings,\n> checksum deadbeef']) {
    assert.ok(holdsAll(answer, [whole]), answer);
  }
  assert.ok(!holdsAll('batch 07: 9 warnings, checksum dead beef', [whole]), 'a space inside the text is not layout');
});

test('the two recorded answers do not hold the line, and neither brought anything back', () => {
  for (const [session, arm] of [[questionPlugin, 'plugin'], [questionBuiltin, 'builtin']] as const) {
    assert.ok(!holdsAll(session.answer, ['record 2-0150: station 1325 reported 664 units at step 150']), arm);
    assert.deepEqual(retrievalOf(session.toolCalls), { recalls: 0, finds: 0, searches: 0, reads: 0 }, arm);
    assert.equal(outcomeOf('abstained', session.toolCalls), 'abstained');
  }
  // What each was sent first after its compaction: the plugin's arm holds the newest results still.
  assert.equal(questionPlugin.requests[0], 41176);
  assert.equal(questionBuiltin.requests[0], 21665);
  // Each answer says what became of the result: words that tell the arm, counted so that grading can be shown not to turn on them.
  assert.ok(tellsIn(questionPlugin.answer) > 0);
  assert.ok(tellsIn(questionBuiltin.answer) > 0);
  assert.equal(tellsIn('Line 150 reads: station 1325 reported 664 units.'), 0);
  assert.equal(tellsIn('The oldest ticket is T-1271, of 17 open tickets.'), 0, 'a word of a trace\'s own files tells no arm');
});

test('how a question went is told from the verdict and the calls: what was brought back counts before what was read again', () => {
  const call = (name: string): ToolCall => ({ name, input: {} });
  const recall = call('mcp__lossless-compaction__recall');
  const find = call('mcp__lossless-compaction__find');
  assert.equal(outcomeOf('correct', []), 'correct from context');
  assert.equal(outcomeOf('correct', [call('ToolSearch'), recall]), 'correct after recall');
  assert.equal(outcomeOf('correct', [find, recall]), 'correct after find');
  assert.equal(outcomeOf('correct', [call('Read')]), 'correct after reading again');
  assert.equal(outcomeOf('correct', [call('Read'), recall]), 'correct after recall');
  assert.equal(outcomeOf('correct', [call('Glob')]), 'correct from context', 'listing files reads none');
  assert.equal(outcomeOf('incorrect', []), 'incorrect without retrieval');
  assert.equal(outcomeOf('incorrect', [call('ToolSearch')]), 'incorrect without retrieval', 'loading a tool brings nothing back');
  assert.equal(outcomeOf('incorrect', [recall]), 'incorrect after retrieval');
  assert.equal(outcomeOf('incorrect', [call('Grep')]), 'incorrect after reading again');
  assert.equal(outcomeOf('abstained', [recall]), 'abstained');
  // Digging what was dropped out of Claude Code's own record is not reading a file of the work again.
  assert.equal(outcomeOf('correct', [call('Grep'), call('Read')], true), 'correct after reading outside the working directory');
  assert.equal(outcomeOf('incorrect', [call('Grep')], true), 'incorrect after reading outside the working directory');
  assert.equal(outcomeOf('correct', [call('Read'), recall], true), 'correct after recall', 'what the plugin brought back counts first');
  assert.equal(outcomeOf('incorrect', [recall], true), 'incorrect after retrieval');
  assert.equal(outcomeOf('abstained', [call('Grep')], true), 'abstained');
  assert.equal(new Set(OUTCOMES).size, 10);
  assert.deepEqual(retrievalOf([call('ToolSearch'), recall, recall, find, call('Read'), call('Grep'), call('Glob')]), { recalls: 2, finds: 1, searches: 1, reads: 2 });
});

test('a session that read outside its working directory is told apart', () => {
  const read = (file_path: string): ToolCall => ({ name: 'Read', input: { file_path } });
  const cwd = '/home/u/bench/work/t1';
  assert.ok(!lookedOutside([read('/home/u/bench/work/t1/log2.txt'), read('log2.txt'), { name: 'Grep', input: { pattern: 'x', path: 'src' } }], cwd));
  assert.ok(lookedOutside([read('/home/u/.claude/projects/x/session.jsonl')], cwd));
  assert.ok(lookedOutside([read('/home/u/bench/store/blobs/abc.txt')], cwd));
  assert.ok(lookedOutside([read('../../store/blobs/abc.txt')], cwd));
  assert.ok(lookedOutside([{ name: 'Glob', input: { pattern: '*', path: '~/.claude' } }], cwd));
  assert.ok(!lookedOutside([{ name: 'Bash', input: { command: 'cat /etc/hosts' } }], cwd), 'only the file tools are looked at: Bash is not allowed at all');
});

test('a few runs are shown as they are, more as their median and range', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
  assert.equal(spread([55, 6, 4]), '55, 6, 4');
  assert.equal(spread([1, 2, 3, 4, 100]), '3 (1–100)');
  assert.equal(spread([0.0291, 0.03], 3), '0.029, 0.030');
  assert.equal(spread([]), '—');
});

test('the plain baseline picks the entry sharing the most words with the question', () => {
  const entries = [
    { id: 'a', text: 'record 1-0001: station 12 reported 3 units' },
    { id: 'b', text: 'error: the kernel refused the call with ENOSYS on this platform' },
    { id: 'c', text: 'error: disk full' },
  ];
  assert.equal(lexicalPick('which result reported that the kernel refused a call?', entries)?.id, 'b');
  assert.equal(lexicalPick('nothing in common here', entries)?.id, 'a', 'a tie goes to the first');
  assert.equal(lexicalPick('anything', []), null);
});

test('the order answers are graded in is not the order they were given in, and can be made again', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const once = shuffled(items, 28);
  assert.deepEqual(shuffled(items, 28), once);
  assert.notDeepEqual(once, items);
  assert.notDeepEqual(shuffled(items, 29), once);
  assert.deepEqual([...once].sort((a, b) => a - b), items);
});

// --- the traces, the grading and the tables ---

test('every trace asks the same nine kinds of question, and each exact answer is in the file or output it is about', () => {
  assert.equal(TRACES.length, 6);
  assert.equal(new Set(TRACES.map((trace) => trace.name)).size, 6);
  for (const trace of TRACES) {
    assert.deepEqual(
      trace.questions.map((question) => question.kind),
      ['exact-gone', 'exact-gone', 'exact-unchanged', 'exact-then', 'exact-now', 'continuity', 'continuity', 'constraint', 'constraint'],
      trace.name,
    );
    const file = (path: string) => trace.files.find((one) => one.path === path)?.text ?? '';
    const regenerated = trace.beforeCompaction.find((step): step is { write: string; text: string } => 'write' in step);
    assert.ok(regenerated, `${trace.name}: one file is regenerated before the compaction`);
    assert.ok(trace.beforeCompaction.some((step) => 'remove' in step && step.remove === 'report.sh'), `${trace.name}: the script is gone before the compaction`);
    const [gone1, gone2, unchanged, then, now] = trace.questions;
    for (const question of [gone1, gone2]) for (const needle of question?.needles ?? []) assert.ok(file('report.sh').includes(needle), `${trace.name} ${question?.id}`);
    const kept = trace.files.find((one) => one.path.startsWith('kept-'));
    for (const needle of unchanged?.needles ?? []) assert.ok(kept?.text.includes(needle), `${trace.name} unchanged`);
    // What the file said then is not what it says now: an answer from the old reading is wrong for "now", and the other way round.
    for (const needle of then?.needles ?? []) {
      assert.ok(file(regenerated.write).includes(needle), `${trace.name} then`);
      assert.ok(!regenerated.text.includes(needle), `${trace.name} then is not now`);
    }
    for (const needle of now?.needles ?? []) {
      assert.ok(regenerated.text.includes(needle), `${trace.name} now`);
      assert.ok(!file(regenerated.write).includes(needle), `${trace.name} now is not then`);
    }
    for (const question of trace.questions.filter((one) => one.kind === 'continuity' || one.kind === 'constraint')) {
      assert.ok(question.rubric && question.right && question.wrong, `${trace.name} ${question.id}: a rubric and both controls`);
      assert.ok(question.kind !== 'constraint' || !question.ask.includes(question.reference), `${trace.name} ${question.id}`);
    }
    // A rule is stated in the first message and nowhere else: no file, no later message and no question holds the phrase that marks it.
    const [opening, ...later] = trace.steps;
    const pieces = [...trace.files.map((one) => one.text), ...[...later, ...trace.beforeCompaction].map((step) => ('say' in step ? step.say : 'write' in step ? step.text : ''))];
    assert.equal(trace.marks.length, 2, trace.name);
    assert.equal(new Set(trace.marks).size, 2, trace.name);
    for (const mark of trace.marks) {
      assert.equal(opening !== undefined && 'say' in opening ? opening.say.split(mark).length - 1 : 0, 1, `${trace.name}: "${mark}" is said once in the first message`);
      assert.equal(pieces.filter((text) => text.includes(mark)).length, 0, `${trace.name}: "${mark}" is in a file or a later message`);
      assert.deepEqual(trace.questions.filter((question) => question.ask.includes(mark)).map((question) => question.id), [], `${trace.name}: "${mark}" is in a question`);
    }
    const rules = trace.questions.filter((question) => question.kind === 'constraint');
    assert.ok(rules.every((question, at) => question.reference.includes(trace.marks[at] ?? '\0')), `${trace.name}: each mark is of the rule its question asks for`);
    // No question names a tool or says what to do when the answer is not at hand.
    for (const question of [...trace.questions, ...trace.finds]) {
      assert.ok(!/recall|find tool|Read tool|cannot|do not read|don't read/i.test(question.ask), `${trace.name} ${question.id}: ${question.ask}`);
    }
    for (const find of trace.finds) {
      const everything = [...trace.files.map((one) => one.text), ...trace.steps.map((step) => ('say' in step ? step.say : ''))].join('\n');
      assert.ok(everything.includes(find.target) || trace.name === 'writes', `${trace.name} ${find.id}`);
    }
  }
});

test('bench/questions.json is the traces written out: what is asked is fixed in the repository, apart from the code that runs it', () => {
  const written = JSON.parse(readFileSync(new URL('../bench/questions.json', import.meta.url), 'utf8'));
  assert.deepEqual(written, JSON.parse(JSON.stringify(described())));
});

test('every session of the benchmark is started without the user\'s settings, with its tools named, in a fixed window', () => {
  const args = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', allowedTools: ['Read', 'Grep'], resume: 'abc', prompt: 'hello' });
  const at = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(at('--setting-sources'), '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(at('--allowedTools'), 'Read,Grep');
  assert.equal(at('--tools'), 'Read,Grep', 'the built-in tools there are, not only the ones allowed');
  assert.equal(at('--autocompact'), '200000');
  assert.equal(at('--plugin-dir'), '/p');
  assert.deepEqual(JSON.parse(at('--settings') ?? ''), { pluginConfigs: { 'lossless-compaction@inline': { options: { storeDir: '/s' } } } });
  assert.deepEqual(args.slice(args.indexOf('--resume'), args.indexOf('--resume') + 3), ['--resume', 'abc', '--fork-session']);
  // Building a trace goes on in one session; the built-in arm loads no plugin.
  const going = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', pluginDir: '/p', storeDir: '/s', allowedTools: [], resume: 'abc', fork: false, prompt: 'next' });
  assert.ok(!going.includes('--fork-session') && !going.includes('--plugin-dir'));
  // The plugin's tool is allowed by name; it is not one of the built-in tools.
  const asking = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', allowedTools: ['Read', 'ToolSearch', 'mcp__lossless-compaction__recall'], prompt: 'q' });
  assert.equal(asking[asking.indexOf('--tools') + 1], 'Read,ToolSearch');
  assert.equal(asking[asking.indexOf('--allowedTools') + 1], 'Read,ToolSearch,mcp__lossless-compaction__recall');
  // The grader has no tool at all.
  const grading = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', storeDir: '/s', allowedTools: [], prompt: 'grade' });
  assert.equal(grading[grading.indexOf('--tools') + 1], '');
  // A session nothing goes on from leaves no record for a later one to read; the others are kept, to be forked.
  assert.ok(argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'builtin', storeDir: '/s', allowedTools: [], resume: 'abc', prompt: 'q', kept: false }).includes('--no-session-persistence'));
  assert.ok(!args.includes('--no-session-persistence') && !going.includes('--no-session-persistence'));
});

const unitOf = (arm: 'plugin' | 'builtin', run: number, questions: Unit['questions'], over: Partial<Unit['compaction']> = {}): Unit => ({
  trace: 'results',
  version: 1,
  base: 'base-session',
  plugin: arm === 'plugin' ? 'abc1234' : null,
  pluginCommit: arm === 'plugin' ? 'c0ffee1' : null,
  model: 'haiku',
  run,
  arm,
  first: (run % 2 === 1) === (arm === 'plugin'),
  variant: 'default',
  mode: 'ask',
  at: '2026-10-02T00:00:00Z',
  claudeCode: '2.1.287',
  compaction: {
    sessionId: 's',
    durationMs: arm === 'plugin' ? 55 : 25730,
    wallMs: 0,
    preTokens: 60882,
    postTokens: arm === 'plugin' ? 13704 : 2462,
    line: null,
    summarized: arm === 'builtin',
    own: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: arm === 'plugin' ? 0 : 0.0291, thinkingTokens: 0 },
    ...over,
  },
  questions,
});

const answered = (id: string, kind: Unit['questions'][number]['kind'], answer: string, calls: string[], verdict?: 'correct'): Unit['questions'][number] => ({
  id,
  kind,
  answer,
  calls,
  retrieval: { recalls: calls.filter((name) => name.endsWith('__recall')).length, finds: 0, searches: 0, reads: calls.filter((name) => name === 'Read').length },
  outside: false,
  refused: 0,
  tells: 0,
  requests: [41176],
  durationMs: 4951,
  wallMs: 5200,
  own: { inputTokens: 10, outputTokens: 330, cacheReadInputTokens: 15196, cacheCreationInputTokens: 25970, costUSD: 0.0551, thinkingTokens: 0 },
  ...(verdict !== undefined ? { verdict } : {}),
});

test('a unit whose /compact was left undone is tabled as that: no summary, and a row of its own only where there is one', () => {
  const asked = [answered('next', 'continuity', 'Next is log13 to log16.', [], 'correct')];
  // Units measured before a `/compact` could be left undone make the tables they made.
  assert.ok(!report([unitOf('plugin', 1, asked), unitOf('builtin', 1, asked)], null).includes('Left as it was'));
  const undone = unitOf('plugin', 1, asked, { undone: true, summarized: false, durationMs: 52, preTokens: 28425, postTokens: 28425 });
  const tables = report([undone, unitOf('builtin', 1, asked)], null);
  assert.ok(tables.includes('| Built-in summary ran | 0 of 1 | 1 of 1 |'));
  assert.ok(tables.includes('| Left as it was, nothing compacted | 1 of 1 | 0 of 1 |'));
  assert.ok(tables.includes('| Compaction, ms | 52 | 25730 |'));
  // It estimated nothing, so it has no row where estimates are set against what was in use; one that compacted has.
  const line = { outcome: 'undone' as const, moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0, inUse: 28425, window: 167000 };
  const moved = { outcome: 'moved' as const, moved: 6, results: 21, images: 0, charsBefore: 9, charsAfter: 5, ms: 61, estimate: 52357, window: 167000 };
  const rows = estimates([{ ...undone, compaction: { ...undone.compaction, line } }, unitOf('plugin', 2, asked, { line: moved })]).split('\n').slice(2);
  assert.deepEqual(rows.map((row) => row.split(' | ')[4]), ['moved']);
});

test('the grader is sent a number, the question, the facts, the rubric and the answer: nothing of the arm, the model or the run', () => {
  const units = [
    unitOf('plugin', 1, [answered('next', 'continuity', 'Next is log13 to log16.', []), answered('gone-1', 'exact-gone', 'batch 07: …', [], 'correct')]),
    unitOf('builtin', 1, [answered('next', 'continuity', 'I do not know.', []), answered('gone-1', 'exact-gone', 'I cannot run it again, but it was batch 07: 3 warnings.', [])]),
  ];
  const items = itemsOf(units);
  // The exact answer the program found right is not sent. The one it did not is: only to say whether something else was given or nothing.
  const toGrade = items.filter((item) => item.expected === undefined);
  const [first, second] = units;
  assert.ok(first !== undefined && second !== undefined);
  assert.deepEqual(toGrade.map((item) => item.key), [
    keyOf(first, 'next', 'Next is log13 to log16.'),
    keyOf(second, 'next', 'I do not know.'),
    keyOf(second, 'gone-1', 'I cannot run it again, but it was batch 07: 3 warnings.'),
  ]);
  // A verdict is filed under the answer it is on: the same question answered otherwise is another key.
  assert.match(keyOf(first, 'next', 'Next is log13 to log16.'), /^results\|haiku\|1\|plugin\|default\|next\|[0-9a-f]{12}$/);
  assert.notEqual(keyOf(first, 'next', 'Next is log13 to log16.'), keyOf(first, 'next', 'Next is log13 to log17.'));
  assert.deepEqual(toGrade.map((item) => item.rubric === MISSED), [false, false, true]);
  // For each of the 24 questions a model grades: a right and a wrong answer, each plain and with two openings that tell an arm.
  // For each trace's first exact question: another line and a plain "cannot tell", each plain and with the two openings, and the other line behind a hedge.
  const controls = items.filter((item) => item.expected !== undefined);
  assert.equal(controls.length, 24 * 2 * 3 + 6 * 7);
  assert.equal(controls.filter((item) => item.expected === 'correct').length, 24 * 3);
  assert.equal(controls.filter((item) => item.expected === 'abstained').length, 6 * 3);
  assert.equal(controls.filter((item) => item.rubric === MISSED && item.key.includes('|told-')).length, 6 * 4);
  assert.ok(controls.filter((item) => item.rubric === MISSED).every((item) => item.expected !== 'correct'), 'no answer under that rubric is right');
  // Only the units that asked a trace's questions are graded: a probe asks nothing of the conversation.
  assert.equal(itemsOf(units.map((unit) => ({ ...unit, mode: 'probe' as const }))).filter((item) => item.expected === undefined).length, 0);

  const prompt = promptOf(shuffled(items, 28).slice(0, 20));
  assert.ok(!/\b(plugin|builtin|built-in arm|haiku|sonnet|run-\d|default)\b/i.test(prompt.replace(/Dana Whitlock|default settings/g, '')), 'no arm, model or run in what the grader reads');
  assert.ok(!prompt.includes('results|') && !prompt.includes('control|'), 'nor the key an answer is filed under');
  assert.match(prompt, /=== Item 20 ===/);
});

test('a grader\'s reply is read by position, and what it left out is not guessed', () => {
  const verdicts = verdictsIn('1 correct\n2. incorrect\n 3: Abstained\n4 maybe\n6 correct\n2 correct\n', 5);
  assert.deepEqual([...verdicts], [[1, 'correct'], [2, 'incorrect'], [3, 'abstained']]);
  assert.equal(verdictsIn('I think they are all fine.', 3).size, 0);
});

test('the grader is measured on what was mixed in: answers known right and wrong, and whether words that tell an arm changed its verdict', () => {
  const items = itemsOf([unitOf('plugin', 1, [answered('next', 'continuity', 'Next is log13 to log16.', [])])]);
  // A grader that is right on every plain control, and marks down every answer that opens with a tell.
  const biased = new Map(items.map((item) => [item.key, item.expected === undefined ? ('correct' as const) : item.key.includes('|told-') ? ('incorrect' as const) : item.expected]));
  const fair = new Map(items.map((item) => [item.key, item.expected ?? ('correct' as const)]));
  const marked = summed(items, [biased, fair], 'a-model');
  assert.equal(marked.model, 'a-model');
  assert.equal(marked.controls.count, 186);
  assert.equal(marked.controls.graded, 186);
  assert.equal(marked.controls.asExpected, 48 + 48 + 6 + 6 + 12 + 6, 'the plain ones; the wrong answers that open with a tell; of the exact ones the hedged line, the other line however it opens, and the plain "cannot tell"');
  assert.equal(marked.controls.toldPairs, 96 + 24);
  assert.equal(marked.controls.toldPairsGraded, 120);
  assert.equal(marked.controls.toldPairsSame, 48 + 12, 'the right answers, and "cannot tell", were marked down for how they open');
  assert.equal(summed(items, [fair, fair]).controls.toldPairsSame, 120);
  assert.equal(summed(items, [fair, fair]).disagreements, 0);
  const answer = items.find((item) => item.expected === undefined)?.key ?? '';
  assert.match(answer, /\|next\|/);
  const differing = new Map(fair).set(answer, 'incorrect');
  assert.equal(summed(items, [fair, differing]).disagreements, 1);
  assert.deepEqual(summed(items, [fair, new Map()]).ungraded.length, items.length);
  assert.equal(summed(items, [fair, new Map()]).disagreements, 0, 'a pass that gave no grade disagrees with nothing');
  // A grader that said nothing was not unmoved by the words: no pair was graded, and none is counted as alike.
  const silent = summed(items, [new Map(), fair]);
  assert.deepEqual([silent.controls.graded, silent.controls.asExpected, silent.controls.toldPairsGraded, silent.controls.toldPairsSame], [0, 0, 0, 0]);
  // One of a pair left out: that pair says nothing either.
  const half = new Map(fair);
  half.delete('control|results|next|right');
  assert.deepEqual([summed(items, [half]).controls.toldPairsGraded, summed(items, [half]).controls.toldPairsSame], [118, 118]);
  // A pass keeps its place: the first pass giving no grade is not replaced by the second.
  assert.deepEqual(silent.verdicts[answer], [null, 'correct']);
  assert.match(graderOf(marked), /Graded by a-model.*Of 186 answers mixed in.*graded 186, 126 as expected.*both of 120, 60 alike/);
  assert.match(graderOf(null), /Nothing has been graded/);
});

test('a reply is kept for the very prompt it answered: another batch, grader or pass is another name', () => {
  const name = batchName(1, 'haiku', 'prompt A');
  assert.equal(batchName(1, 'haiku', 'prompt A'), name);
  assert.match(name, /^pass-1-[0-9a-f]{16}$/);
  assert.notEqual(batchName(1, 'haiku', 'prompt A, and one more answer'), name, 'more units measured since: other batches');
  assert.notEqual(batchName(1, 'sonnet', 'prompt A'), name);
  assert.notEqual(batchName(2, 'haiku', 'prompt A'), name);
});

test('a unit measured against something else is not taken for this one: another version, another building, another commit', () => {
  const measured = { version: 1, base: 'base-session', plugin: 'abc1234' };
  assert.equal(staleness(measured, { version: 1 }, { sessionId: 'base-session' }, 'abc1234'), null);
  assert.match(staleness(measured, { version: 2 }, { sessionId: 'base-session' }, 'abc1234') ?? '', /version 1 of the trace, which is now 2/);
  assert.match(staleness(measured, { version: 1 }, { sessionId: 'another' }, 'abc1234') ?? '', /built again/);
  assert.match(staleness(measured, { version: 1 }, { sessionId: 'base-session' }, 'def5678') ?? '', /the plugin's code abc1234, which is now def5678/);
  assert.equal(staleness({ ...measured, plugin: null }, { version: 1 }, { sessionId: 'base-session' }, null), null, 'the built-in arm runs no plugin');
  // A unit written before these were recorded is not this one either.
  assert.notEqual(staleness({ version: 1 } as never, { version: 1 }, { sessionId: 'base-session' }, null), null);
  // What is graded and tabled is the traces as they are now.
  const old = { ...unitOf('plugin', 1, []), version: 0 };
  assert.deepEqual(currentOf([unitOf('plugin', 1, []), old, unitOf('builtin', 1, [])]).older, 1);
  assert.equal(currentOf([old]).units.length, 0);
  assert.equal(currentOf([{ ...old, version: 1, trace: 'no-such-trace' }]).units.length, 0);
  assert.equal(currentOf([{ run: 1 } as never]).units.length, 0, 'a file that says neither trace nor version is not a current unit');
});

test('probes alone are tabled without the tables of questions, and a checkout can be probed at another share of the window', () => {
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const probe = { ...unitOf('plugin', 1, [answered('probe', 'continuity', 'ok', [])], { line }), mode: 'probe' as const, variant: 'v0.6.0' };
  const alone = whole([probe], null);
  assert.ok(alone.startsWith('### What the plugin estimated against what was in use\n'), alone.slice(0, 80));
  assert.ok(!alone.includes('graded'));
  assert.match(whole([{ ...probe, version: 0 }].filter(() => false), null, 2), /^2 unit\(s\) measured an older version of their trace and are left out\.\n/);
  // The control: one unit that asked questions, and the tables of questions are there.
  assert.ok(whole([probe, unitOf('plugin', 1, [])], null).includes('### results, haiku'));

  assert.equal(variantsOf(undefined, undefined, '/here'), undefined);
  assert.deepEqual(variantsOf(undefined, '100', '/here'), [{ name: 'max-after-100', pluginDir: '/here', options: { maxAfterPercent: 100 } }]);
  assert.deepEqual(variantsOf('new=/a,v0.6.0=/b', undefined, '/here'), [{ name: 'new', pluginDir: '/a' }, { name: 'v0.6.0', pluginDir: '/b' }]);
  assert.deepEqual(variantsOf('v0.6.0=/b', '100', '/here'), [{ name: 'v0.6.0-max-after-100', pluginDir: '/b', options: { maxAfterPercent: 100 } }]);
  assert.throws(() => variantsOf('v0.6.0', undefined, '/here'), /name=path/);
});

test('two conversations are built and probed and asked nothing: they are no part of the questions, the grading or the comparison', () => {
  assert.deepEqual(PROBED.map((trace) => trace.name), ['mixed', 'japanese']);
  assert.deepEqual(BUILT, [...TRACES, ...PROBED, ...FOUND]);
  assert.equal(new Set(BUILT.map((trace) => trace.name)).size, 9);
  const written = described().map((one) => one.trace);
  assert.ok(PROBED.every((trace) => !written.includes(trace.name)));
  // A probe of one is a current unit; a unit that asked its questions would have nothing to be graded by.
  const probed = { ...unitOf('plugin', 1, []), trace: 'mixed', mode: 'probe' as const };
  assert.equal(currentOf([probed]).units.length, 1);
  assert.equal(itemsOf([probed]).length, itemsOf([]).length);
  // What each is for: prose that stays with results that can leave, and Japanese that stays with ASCII that leaves.
  const chars = (trace: (typeof BUILT)[number], test: (char: string) => boolean) =>
    trace.steps.reduce((sum, step) => sum + ('say' in step ? [...step.say].filter(test).length : 0), 0);
  const [mixed, japanese] = PROBED;
  assert.ok(mixed !== undefined && japanese !== undefined);
  assert.ok(chars(mixed, () => true) > 300_000 && mixed.files.filter((file) => file.text.length > 15_000).length >= 6);
  assert.ok(chars(japanese, (char) => char > '\x7f') > 50_000 && japanese.files.filter((file) => file.text.length > 15_000).length >= 6);
  assert.ok(japanese.files.every((file) => !/[^\x00-\x7f]/.test(file.text)), 'what is read, and can leave, is ASCII');
});

test('within a trace and model the arms take turns at going first from run to run', () => {
  for (let traceAt = 0; traceAt < TRACES.length; traceAt += 1) {
    for (let modelAt = 0; modelAt < 2; modelAt += 1) {
      const firsts = [1, 2, 3, 4].map((run) => armsOf(run, traceAt, modelAt)[0]);
      assert.deepEqual(new Set([firsts[0], firsts[1]]).size, 2, `trace ${traceAt}, model ${modelAt}: ${firsts.join(' ')}`);
      assert.deepEqual([firsts[2], firsts[3]], [firsts[0], firsts[1]]);
    }
  }
  // And in one run the traces do not all start with the same arm.
  assert.equal(new Set(TRACES.map((_, traceAt) => armsOf(1, traceAt, 0)[0])).size, 2);
  assert.deepEqual([...armsOf(1, 0, 0)].sort(), ['builtin', 'plugin']);
});

test('the tables keep the arms apart, show a few runs as they are, and say how each question went', () => {
  const plugin = (run: number, right: boolean) =>
    unitOf('plugin', run, [
      answered('gone-1', 'exact-gone', 'batch 07', ['ToolSearch', 'mcp__lossless-compaction__recall'], right ? 'correct' : undefined),
      answered('unchanged', 'exact-unchanged', 'x', ['Read'], 'correct'),
      answered('next', 'continuity', 'Next is log13 to log16.', []),
    ]);
  const builtin = (run: number) =>
    unitOf('builtin', run, [
      answered('gone-1', 'exact-gone', 'I cannot tell.', []),
      answered('unchanged', 'exact-unchanged', 'x', ['Read'], 'correct'),
      answered('next', 'continuity', 'Next is log13 to log16.', []),
    ]);
  const units = [plugin(1, true), builtin(1), plugin(2, false), builtin(2)];
  // The grader calls every answer it is sent right but the built-in arm's "cannot tell". Of an exact answer the program
  // found not to hold the text it has no say on right: the plugin's second run stays wrong.
  const graded = new Map(itemsOf(units).map((item) => [item.key, item.expected ?? (item.key.includes('|builtin|') && item.key.includes('|gone-1|') ? ('abstained' as const) : ('correct' as const))]));
  const grades = summed(itemsOf(units), [graded]);
  const missed = units[2]?.questions[0];
  assert.ok(units[2] !== undefined && missed !== undefined && missed.verdict === undefined);
  assert.equal(grades.verdicts[keyOf(units[2], 'gone-1', missed.answer)]?.[0], 'correct');
  assert.equal(verdictOf(units[2], missed, grades), 'incorrect');
  assert.equal(verdictOf(units[2], missed, null), undefined);
  // That the grader would have passed it is kept in sight: it is how a right answer the program's matching missed shows.
  assert.ok(overruled(units[2], missed, grades));
  assert.ok(units[0]?.questions[0] !== undefined && !overruled(units[0], units[0].questions[0], grades), 'not an answer the program found right');
  // The unit measured again answers otherwise: the verdict on the old answer is on nothing, and the new one is ungraded.
  const again = { ...missed, answer: 'batch 07: 4 warnings' };
  assert.equal(verdictOf(units[2], again, grades), undefined);
  assert.ok(!overruled(units[2], again, grades));

  assert.deepEqual(
    Object.entries(outcomesOf(units.filter((unit) => unit.arm === 'plugin'), grades)).filter(([, count]) => count > 0),
    [['correct from context', 2], ['correct after recall', 1], ['correct after reading again', 2], ['incorrect after retrieval', 1]],
  );
  assert.deepEqual(
    Object.entries(outcomesOf(units.filter((unit) => unit.arm === 'builtin'), grades)).filter(([, count]) => count > 0),
    [['correct from context', 2], ['correct after reading again', 2], ['abstained', 2]],
  );
  assert.equal(outcomesOf(units, null).ungraded, 4 + 3, 'without grades the answers a program cannot grade are counted as such: four on the standing, three exact ones that do not hold the text');

  const text = report(units, grades, 2);
  assert.match(text, /### results, haiku/);
  assert.match(text, /Runs: plugin 2, first in 1; builtin 2, first in 1\. The plugin's code: abc1234 \(commit c0ffee1\)\./);
  assert.match(text, /\| Exact answers the program found wrong and the grader called right \| 0, 1 \| 0, 0 \|/);
  assert.match(text, /\| Words that tell the arm, in all answers \| 0, 0 \| 0, 0 \|/);
  // Units that are not one comparison can sit side by side in the box: the table says so.
  assert.ok(!text.includes('different buildings') && !text.includes('different states'));
  assert.match(report(units.map((unit) => (unit.run === 2 ? { ...unit, base: 'another-session' } : unit)), grades), /measured on 2 different buildings of the trace/);
  assert.match(report(units.map((unit) => (unit.run === 2 && unit.arm === 'plugin' ? { ...unit, plugin: 'def5678' } : unit)), grades), /measured on 2 different states of the plugin's code/);
  // The same code at another commit, one that touched only the benchmark, is one state: both commits are named.
  const later = report(units.map((unit) => (unit.run === 2 && unit.arm === 'plugin' ? { ...unit, pluginCommit: 'beef123' } : unit)), grades);
  assert.ok(!later.includes('different states'));
  assert.match(later, /The plugin's code: abc1234 \(commit c0ffee1, beef123\)\./);
  assert.match(text, /2 unit\(s\) measured an older version of their trace and are left out\./);
  assert.ok(!report(units, grades).includes('older version'));
  assert.match(text, /\| Compaction: tokens read from cache \| 0, 0 \| 0, 0 \|/);
  assert.match(text, /\| Compaction: cost, USD \| 0\.0000, 0\.0000 \| 0\.0291, 0\.0291 \|/);
  // What a session tried and was refused, and an answer from outside the working directory, are shown per arm.
  const strayed = units.map((unit) => (unit.arm === 'builtin' && unit.run === 1 ? { ...unit, questions: unit.questions.map((one, at) => (at === 0 ? { ...one, outside: true, refused: 2 } : one)) } : unit));
  assert.match(report(strayed, grades), /\| Calls refused at a question \| 0, 0 \| 2, 0 \|/);
  assert.match(report(strayed, grades), /\| Answers after reading outside the working directory \| 0, 0 \| 1, 0 \|/);
  // That answer was "cannot tell": it stays so. A right answer got that way is shown apart from one read from a file of the work.
  const dug = units.map((unit) => (unit.arm === 'builtin' ? { ...unit, questions: unit.questions.map((one) => (one.id === 'unchanged' ? { ...one, outside: true } : one)) } : unit));
  assert.match(report(dug, grades), /\| correct after reading outside the working directory \| 0 \| 2 \|/);
  assert.match(report(dug, grades), /\| correct after reading again \| 2 \| 0 \|/);
  assert.match(text, /\| correct after reading outside the working directory \| 0 \| 0 \|/);
  const cached = units.map((unit) => (unit.arm === 'builtin' ? { ...unit, compaction: { ...unit.compaction, own: { ...unit.compaction.own, cacheReadInputTokens: 53704, cacheCreationInputTokens: 900, inputTokens: 10, outputTokens: 3038 } } } : unit));
  assert.match(report(cached, grades), /\| Compaction: tokens read from cache \| 0, 0 \| 53704, 53704 \|/);
  assert.match(report(cached, grades), /\| Compaction: tokens written to cache or sent fresh \| 0, 0 \| 910, 910 \|/);
  assert.match(report(cached, grades), /\| Compaction: tokens written out \| 0, 0 \| 3038, 3038 \|/);
  assert.match(text, /\| Compaction, ms \| 55, 55 \| 25730, 25730 \|/);
  assert.match(text, /\| Built-in summary ran \| 0 of 2 \| 2 of 2 \|/);
  assert.match(text, /\| Exact, source gone \| 1\/1, 0\/1 \| 0\/1, 0\/1 \|/);
  assert.match(text, /\| Where the work stands \| 1\/1, 1\/1 \| 1\/1, 1\/1 \|/);
  assert.match(text, /\| abstained \| 0 \| 2 \|/);
  // The arms swapped in what was measured swap in the table.
  const swapped = report(units.map((unit) => ({ ...unit, arm: unit.arm === 'plugin' ? ('builtin' as const) : ('plugin' as const) })), null);
  assert.match(swapped, /\| Compaction, ms \| 25730, 25730 \| 55, 55 \|/);
});

test('what the plugin estimated is set against what the next request was sent', () => {
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const probe = { ...unitOf('plugin', 1, [answered('probe', 'continuity', 'ok', [])], { line }), mode: 'probe' as const };
  const text = estimates([probe, { ...probe, variant: 'v0.5.2', compaction: { ...probe.compaction, line: { ...line, estimate: 91829 } } }, unitOf('builtin', 1, [])]);
  assert.match(text, /\| results \| haiku \| default \(abc1234\) \| 1 \| moved \| 44333 \| 41176 sent next \| 7\.7 % \|/);
  assert.match(text, /\| results \| haiku \| v0\.5\.2 \(abc1234\) \| 1 \| moved \| 91829 \| 41176 sent next \| 123\.0 % \|/);
  assert.ok(!text.includes('builtin'));
  // Where the plugin moved nothing and handed over, nothing had changed: its estimate is of what was in use before, not of what the summary left.
  const untouched = estimates([{ ...probe, compaction: { ...probe.compaction, line: { ...line, outcome: 'nothing' as const } } }]);
  assert.match(untouched, /\| nothing \| 44333 \| 60882 in use before \| -27\.2 % \|/);
  // No rebuilt message carries thinking: where the unit says how much of what was in use was thinking, the estimate is set against the rest.
  const thought = estimates([{ ...probe, compaction: { ...probe.compaction, thinkingBefore: 15882, line: { ...line, outcome: 'nothing' as const } } }]);
  assert.match(thought, /\| nothing \| 44333 \| 45000 in use before, without 15882 of thinking \| -1\.5 % \|/);
  // Where results were moved out, what was sent next is the measure, whatever the thinking was.
  assert.match(estimates([{ ...probe, compaction: { ...probe.compaction, thinkingBefore: 15882 } }]), /\| moved \| 44333 \| 41176 sent next \| 7\.7 % \|/);
  // Where it moved some and still handed over, what it left was never sent: there is nothing to set the estimate against.
  const stillTooMuch = estimates([{ ...probe, compaction: { ...probe.compaction, line: { ...line, outcome: 'too-much' as const } } }]);
  assert.match(stillTooMuch, /\| too-much \| 44333 \| — \| — \|/);
  assert.match(estimates([{ ...probe, compaction: { ...probe.compaction, line: { outcome: 'other' as const, moved: 0, results: 0, images: 0, charsBefore: 0, charsAfter: 0, ms: 0 } } }]), /\| other \| none stated \| — \| — \|/);
});

test('the conversations published in bench/bases are the traces as they are now: what was said, in order, at a size the trace accepts', () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../bench/bases/${name}`, import.meta.url), 'utf8'));
  for (const trace of BUILT) {
    const built = read(`${trace.name}.json`) as { trace: string; version: number; tokens: number; thinkingTokens: number };
    assert.equal(built.trace, trace.name);
    assert.equal(built.version, trace.version, `${trace.name}: built from another version of the trace`);
    assert.ok(built.tokens >= trace.accept.minTokens && built.tokens <= trace.accept.maxTokens, `${trace.name}: ${built.tokens} tokens`);
    assert.ok(built.thinkingTokens >= (trace.accept.minThinkingTokens ?? 0), `${trace.name}: ${built.thinkingTokens} thinking tokens`);
    const conversation = read(`${trace.name}.conversation.json`) as { role: string; blocks: { type: string; text?: string }[] }[];
    // A trace changed since it was built says something else: the conversation beside it would no longer be the one measured.
    assert.deepEqual(saidIn(conversation), saidBy(trace), trace.name);
    assert.ok(saidBy(trace).length >= 5, trace.name);
    // Nothing of the machine it was built on: the working directory is written <work>, and no home directory is named.
    const text = JSON.stringify(conversation);
    assert.ok(!/\/Users\/|\/home\/|\.cctmp|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(text), `${trace.name}: a path or an id of the machine`);
    assert.ok(conversation.every((message) => message.blocks.every((block) => block.type !== 'thinking' || !('thinking' in block || 'signature' in block))), `${trace.name}: thinking is kept as a length only`);
  }
});

// --- find ---

const builtConversation = (name: string) => JSON.parse(readFileSync(new URL(`../bench/bases/${name}.conversation.json`, import.meta.url), 'utf8')) as Conversation;

test('the questions find is for: by a value or by what the result was, each about one result of the built conversation', async () => {
  for (const trace of TRACES) {
    const { stored } = await staged(resultsOf(builtConversation(trace.name)));
    assert.ok(stored.length >= 3 && stored.every((one) => one.text.length >= MIN_CHARS), trace.name);
    assert.equal(new Set(trace.finds.map((find) => find.id)).size, trace.finds.length, trace.name);
    assert.ok(trace.finds.filter((find) => find.by === 'meaning').length >= 3 && trace.finds.filter((find) => find.by === 'value').length >= 2, trace.name);
    for (const find of trace.finds) {
      const right = stored.filter((one) => one.text.includes(find.target));
      // One result holds the line, and so is the answer; what confirms an edit is too short to be an option at all.
      assert.equal(right.length, find.id === 'find-edit' ? 0 : 1, `${trace.name} ${find.id}`);
      // Asked by what the result was, a question holds no number and nothing in quotes: no word of it is the answer's own.
      if (find.by === 'meaning') assert.ok(!/[0-9"]/.test(find.ask), `${trace.name} ${find.id}: ${find.ask}`);
    }
  }
  // Results under the plugin's size to move out are no option: the short trace has thirty-eight results and three options.
  assert.equal(resultsOf(builtConversation('short'), 0).length, 38);
  assert.equal(resultsOf(builtConversation('short')).length, 3);
  // An agent asked the same question is told how to show which result it means, so that a program can check it.
  assert.deepEqual(QUOTE, { value: 'Quote that line in full.', meaning: 'Quote its first line in full.' });
});

test('the conversation asked only what find is for: no call says what came back, and what came back is in the results alone', () => {
  assert.deepEqual(FOUND.map((trace) => trace.name), ['opaque']);
  const [opaque] = FOUND;
  assert.ok(opaque !== undefined);
  assert.deepEqual(opaque.questions, []);
  assert.deepEqual(opaque.marks, []);
  // One file, the script, and it is gone before any question: nothing on disk answers one.
  assert.deepEqual(opaque.files.map((file) => file.path), ['show.sh']);
  assert.deepEqual(opaque.beforeCompaction, [{ remove: 'show.sh' }]);
  const script = opaque.files[0]?.text ?? '';
  const outputs = script.split(/\n\d\d\) cat <<'SHOWN'\n/).slice(1).map((part) => part.split('SHOWN\n;;')[0] ?? '');
  assert.equal(outputs.length, 20);
  // Thirteen documents, then station logs that may leave once the documents have, then logs the newest results keep (60,000 characters).
  assert.ok(outputs.slice(0, 13).every((text) => text.length > 6_000 && text.length < 8_000));
  assert.ok(outputs.slice(13, 17).every((text) => text.length > 20_000 && text.length < 30_000));
  assert.ok(outputs.slice(17).reduce((sum, text) => sum + text.length, 0) <= 20_000 * 3);
  const said = opaque.steps.map((step) => ('say' in step ? step.say : '')).join('\n');
  assert.equal(opaque.finds.filter((find) => find.by === 'meaning').length, 7);
  assert.equal(opaque.finds.filter((find) => find.by === 'value').length, 3);
  for (const find of opaque.finds) {
    // One output holds what the question is about, and nothing that is said does.
    assert.equal(outputs.filter((text) => text.includes(find.target)).length, 1, find.id);
    assert.ok(outputs.slice(0, 13).some((text) => text.includes(find.target)), find.id);
    assert.ok(!said.includes(find.target), find.id);
    assert.ok(!/recall|find tool|Read tool|cannot|do not read|don't read/i.test(find.ask), find.id);
    if (find.by === 'meaning') assert.ok(!/[0-9"]/.test(find.ask), `${find.id}: ${find.ask}`);
  }
  // A question by what a result was shares no word of five letters or more with that result's first two lines.
  const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
  for (const find of opaque.finds.filter((one) => one.by === 'meaning')) {
    const head = outputs.find((text) => text.startsWith(find.target))?.split('\n').slice(0, 2).join(' ') ?? '';
    const shared = [...words(find.ask)].filter((word) => words(head).has(word) && !['which', 'earlier', 'result'].includes(word));
    assert.deepEqual(shared, [], find.id);
  }
  // Results leave sharing the least with the last three things said first (ruleOrder): every document shares fewer of their words than any station log, so the documents leave before the logs do.
  const goal = termsOf(opaque.steps.flatMap((step) => ('say' in step ? [step.say] : [])).slice(-3).join('\n\n'));
  const sharing = outputs.map((text, at) => {
    const mentioned = termsOf(`${JSON.stringify({ command: `sh show.sh ${String(at + 1).padStart(2, '0')}` })}\n${text.slice(0, 4000)}`);
    return [...goal].filter((term) => mentioned.has(term)).length;
  });
  assert.ok(Math.max(...sharing.slice(0, 13)) < Math.min(...sharing.slice(13)), sharing.join(' '));
  // The calls name a number and nothing else: no subject of a document is in what is said.
  for (const text of outputs.slice(0, 13)) assert.ok(!said.includes(text.split('\n')[0] ?? '\0'));
  assert.ok(opaque.steps.slice(1, 6).every((step) => 'say' in step && /^Run (`sh show\.sh \d\d`(, )?)+ with Bash/.test(step.say)));
});

const JEV = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;
const keysAsked = (sent: Sent) => Object.keys((questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined)?.criteria ?? {});
/** Jev answering with `winner` at probability `p`, the rest sharing what is left. */
const jev = (winner: string | null, p = 0.95) =>
  recordingHttp((sent) => {
    const keys = keysAsked(sent);
    const rest = winner === null ? 1 / keys.length : (1 - p) / (keys.length - 1);
    return ok({ answers: { q: { type: 'choice', choice: winner ?? keys[0], probabilities: Object.fromEntries(keys.map((key) => [key, key === winner ? p : rest])) } } });
  });

test('find is asked as the tool asks it, and what it answers is read: one result, a few to choose from, none, or no answer', async () => {
  const trace = TRACES.find((one) => one.name === 'results');
  const seventh = trace?.finds.find((find) => find.id === 'find-seventh');
  assert.ok(trace !== undefined && seventh !== undefined);
  const conversation = builtConversation('results');
  const { stored } = await staged(resultsOf(conversation));
  const right = stored.findIndex((one) => one.text.includes(seventh.target));
  assert.ok(right >= 0);

  // Jev sure of the right one: `find` gives that result.
  const sure = jev(`t${right + 1}`);
  const [gave] = await pick('results', [seventh], conversation, JEV, sure.http);
  assert.ok(gave !== undefined);
  assert.deepEqual([gave.jev.kind, gave.jev.ids, gave.right], ['gave', [stored[right]?.id], [stored[right]?.id]]);
  assert.equal(wentOf(gave), 'gave the right one');
  assert.equal(gave.options, 15);
  assert.equal(gave.by, 'meaning');
  // What was sent: the question, and for each option the call that made it and a few hundred characters, not the result.
  assert.equal(sure.sent.length, 1);
  const body = JSON.stringify(sure.sent[0]?.body);
  assert.ok(body.includes('the seventh of the station logs') && body.includes('log7.txt'));
  assert.ok(body.length < 15 * 1200, `${body.length} characters for fifteen results of up to eighteen thousand each`);
  assert.equal(keysAsked(sure.sent[0] as Sent).length, 16, 'the fifteen results, and that it is none of them');

  // Jev sure of another: `find` gives that one, and it is wrong.
  const [wrong] = await pick('results', [seventh], conversation, JEV, jev(`t${((right + 1) % 15) + 1}`).http);
  assert.ok(wrong !== undefined);
  assert.equal(wentOf(wrong), 'gave a wrong one');
  // Jev not sure: the likeliest few are listed, and the right one may or may not be among them.
  const [listed] = await pick('results', [seventh], conversation, JEV, jev(null).http);
  assert.ok(listed !== undefined);
  assert.equal(listed.jev.kind, 'listed');
  assert.ok(listed.jev.ids.length >= 1 && listed.jev.ids.length <= 3);
  assert.match(wentOf(listed), /^listed/);
  // Jev sure it is none of them.
  const [none] = await pick('results', [seventh], conversation, JEV, jev('none').http);
  assert.ok(none !== undefined);
  assert.equal(wentOf(none), 'said none');
  // Jev not reached: no answer, and nothing is made of it.
  const refused: Http = async () => ({ status: 500, ok: false, text: 'no' });
  const [failed] = await pick('results', [seventh], conversation, JEV, refused);
  assert.ok(failed !== undefined);
  assert.deepEqual([failed.jev.kind, failed.jev.ids, wentOf(failed)], ['failed', [], 'did not answer']);

  // The word match reads the call and the whole text: a number in the question finds its line, another way of saying it does not.
  const byValue = trace.finds.find((find) => find.id === 'find-log-a');
  assert.ok(byValue !== undefined);
  const [valued] = await pick('results', [byValue], conversation, JEV, jev(null).http);
  assert.ok(valued !== undefined && valued.words !== null && valued.right.includes(valued.words));
  assert.ok(gave.words === null || !gave.right.includes(gave.words), 'the seventh log is not found by its words');
  // It is given the call that made each result, as Jev is: a file named in the question finds the read of it.
  const [named] = await pick('results', [{ id: 'by-name', by: 'meaning', ask: 'Which earlier result came from reading log7.txt?', target: seventh.target }], conversation, JEV, jev(null).http);
  assert.ok(named !== undefined && named.words !== null && named.right.includes(named.words));
});

test('the head of what find says is read, whatever follows it', () => {
  const id = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  assert.deepEqual(readAnswer(`[found] Read result, 6170 bytes; id ${id}; probability 0.95\n\nrecord … id ${other}`), { kind: 'gave', ids: [id] });
  assert.deepEqual(readAnswer(`[not sure] The likeliest results, most likely first:\n- Read called with x; 9 bytes; probability 0.40; recall with mcp__lossless-compaction__recall id ${id}\n- Bash called with y; 9 bytes; probability 0.30; recall with mcp__lossless-compaction__recall id ${other}\n- or none of them; probability 0.20`), { kind: 'listed', ids: [id, other] });
  assert.deepEqual(readAnswer('[not found] None of the moved-out results seems to be about that: it may still be in the conversation, or was never moved out.'), { kind: 'none', ids: [] });
  assert.deepEqual(readAnswer('[lossless-compaction] Jev could not be asked: 500.'), { kind: 'failed', ids: [] });
  assert.deepEqual(readAnswer(''), { kind: 'failed', ids: [] });
});

test('the table of picks keeps the two kinds of question apart, and a question with no answer among the options apart from both', () => {
  const one = (question: string, by: Pick['by'], right: string[], words: string | null, kind: Pick['jev']['kind'], ids: string[]): Pick => ({
    trace: 'writes', question, by, options: 3, right, words, jev: { kind, ids, ms: 900, said: '' },
  });
  const text = pickTable([
    one('find-report', 'value', ['r'], 'r', 'gave', ['r']),
    one('find-kept', 'value', ['k'], 'k', 'listed', ['r', 'k']),
    one('find-edit', 'value', [], 'r', 'none', []),
    one('find-script', 'meaning', ['r'], 'k', 'gave', ['k']),
    one('find-stays', 'meaning', ['k'], 'k', 'listed', ['k', 'r']),
    one('find-changes', 'meaning', ['c'], 'k', 'listed', ['r', 'k']),
  ]);
  const rows = text.split('\n').slice(2).map((row) => row.split('|').map((cell) => cell.trim()).slice(1, -1));
  // Trace, kind, options, questions with an answer, word match right, then: gave right, gave wrong, listed first, listed further, listed without, none, no answer; and the unanswerable.
  assert.deepEqual(rows, [
    ['writes', 'value', '3', '2', '2', '1', '0', '0', '1', '0', '0', '0', '1 of 1'],
    ['writes', 'meaning', '3', '3', '1', '0', '1', '1', '0', '1', '0', '0', '0 of 0'],
  ]);
});

test('a key for find is in a session only when it was handed one, and in nothing that is written', () => {
  const file = "# the key for Jev\nexport CLOUDFLARE_API_TOKEN='made-up-token'\nCLOUDFLARE_ACCOUNT_ID = 0123456789abcdef0123456789abcdef\nHOME=/somewhere\nTYPESAFE_API_KEY=\n";
  const keys = keysIn(file);
  assert.deepEqual(keys, { CLOUDFLARE_API_TOKEN: 'made-up-token', CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef' });
  assert.deepEqual(keysIn('nothing of the kind'), {});
  assert.deepEqual([...KEY_VARS].sort(), ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN', 'TYPESAFE_API_KEY']);

  // Whoever runs the benchmark may have a key in the environment: no session gets it by that.
  const around = { PATH: '/bin', TYPESAFE_API_KEY: 'lying-around', CLOUDFLARE_API_TOKEN: 'lying-around', CLOUDFLARE_ACCOUNT_ID: 'lying-around' };
  const plain = envOf({}, around);
  assert.equal(plain['PATH'], '/bin');
  assert.ok(KEY_VARS.every((name) => !(name in plain)));
  assert.equal(plain['CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'], '1');
  assert.equal(plain['CLAUDE_CODE_DISABLE_AUTO_MEMORY'], '1');
  // The variant that compares find is handed the keys of the file, and only those.
  const handed = envOf({ env: keys }, around);
  assert.equal(handed['CLOUDFLARE_API_TOKEN'], 'made-up-token');
  assert.ok(!('TYPESAFE_API_KEY' in handed));
  // On the command line, which any process of the machine can read, there is no key: the plugin is told where to ask, not with what.
  const args = argsOf({ out: '/o', cwd: '/w', model: 'm', arm: 'plugin', pluginDir: '/p', storeDir: '/s', pluginOptions: { provider: 'cloudflare' }, allowedTools: ['Read'], prompt: 'q', env: keys });
  assert.ok(!args.join(' ').includes('made-up-token') && !args.join(' ').includes('0123456789abcdef'));
  assert.ok(args.join(' ').includes('"provider":"cloudflare"'));
});

test('the questions find is for, asked of an agent, are tabled per unit: with recall alone and with find', () => {
  const asked = (variant: string, right: boolean, calls: string[]): Unit => ({
    ...unitOf('plugin', 1, [answered('find-script', 'exact-gone', 'batch 01', calls, right ? 'correct' : undefined), answered('find-stays', 'exact-gone', 'x', calls)]),
    mode: 'find',
    variant,
  });
  const found = asked('find', true, ['ToolSearch', 'mcp__lossless-compaction__find']);
  found.questions.forEach((one) => (one.retrieval = { recalls: 0, finds: 1, searches: 1, reads: 0 }));
  const text = finds([found, asked('default', false, ['ToolSearch', 'mcp__lossless-compaction__recall']), unitOf('plugin', 1, [])]);
  const rows = text.split('\n').slice(2);
  assert.equal(rows.length, 2, 'the units that asked the trace\'s own questions are not in it');
  assert.match(rows[0] ?? '', /\| results \| haiku \| 1 \| `recall` only \| — \| 0\/2 \| 0 \| 2 \| 0 \|/);
  assert.match(rows[1] ?? '', /\| results \| haiku \| 1 \| `recall` and `find` \| — \| 1\/2 \| 2 \| 0 \| 0 \|/);
});

// --- what was published ---

test('published, an answer names no path of the machine it ran on, and keeps its verdict', () => {
  const said = 'I read /Users/someone/box/work/short-abc/kept-4.log and /Users/someone/.claude/projects/x/y.jsonl: station 12 reported 3 units.';
  const units = [unitOf('builtin', 1, [answered('next', 'continuity', said, []), answered('gone-1', 'exact-gone', 'batch 07', [], 'correct')])];
  const [unit] = units;
  assert.ok(unit !== undefined);
  const grades = summed(itemsOf(units), [new Map(itemsOf(units).map((item) => [item.key, item.expected ?? ('incorrect' as const)]))], 'a-model');
  const out = published(units, grades, { box: '/Users/someone/box', home: '/Users/someone' });
  const [clean] = out.units;
  assert.ok(clean !== undefined && clean.questions[0] !== undefined && out.grades !== null);
  assert.equal(clean.questions[0].answer, 'I read <box>/work/short-abc/kept-4.log and <home>/.claude/projects/x/y.jsonl: station 12 reported 3 units.');
  assert.ok(!JSON.stringify(out).includes('/Users/someone'));
  // The verdict was on the answer as it was given; it is found under the answer as published, and no longer under the other.
  assert.equal(verdictOf(clean, clean.questions[0], out.grades), 'incorrect');
  assert.equal(out.grades.verdicts[keyOf(unit, 'next', said)], undefined);
  assert.equal(Object.keys(out.grades.verdicts).length, Object.keys(grades.verdicts).length);
  // What was given is not changed by publishing it.
  assert.equal(unit.questions[0]?.answer, said);
  assert.deepEqual(published(units, null, { box: '/b', home: '/h' }).grades, null);

  // Claude Code names its record of a session after the working directory, every character that is no letter or digit made a dash: an answer that read one names it so.
  const machine = { box: '/Users/some.one/.tmp/box', home: '/Users/some.one' };
  const record = 'from `/Users/some.one/.claude/projects/-Users-some-one--tmp-box-work-results-abc/1b5642a2.jsonl`';
  assert.equal(scrubbed({ said: record }, machine).said, 'from `<home>/.claude/projects/<box>-work-results-abc/1b5642a2.jsonl`');
  assert.equal(scrubbed({ said: 'under -Users-some-one-elsewhere' }, machine).said, 'under <home>-elsewhere');
  // What `find` said of each pick goes the same way.
  assert.deepEqual(scrubbed({ picks: [{ said: 'Read called with /Users/some.one/.tmp/box/x' }] }, machine), { picks: [{ said: 'Read called with <box>/x' }] });
  // Only paths are replaced: a home directory named like a word, or like a field, changes no word and no field.
  const wordy = { box: '/home/right/box', home: '/home/right' };
  assert.deepEqual(scrubbed({ right: ['a'], words: 'the right one is in /home/right/box/work, not in /home/right' }, wordy), { right: ['a'], words: 'the right one is in <box>/work, not in <home>' });
});

const RESULTS = fileURLToPath(new URL('../bench/results/2026-10-02', import.meta.url));

test('the results in the repository: of the traces as they are, of the conversations beside them, every answer graded, and the tables made from them', () => {
  assert.ok(existsSync(RESULTS));
  const all = unitsUnder(RESULTS);
  const { units, older } = currentOf(all);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${RESULTS}/grades.json`, 'utf8')) as Grades;
  const picks = existsSync(`${RESULTS}/picks.json`) ? (JSON.parse(readFileSync(`${RESULTS}/picks.json`, 'utf8')) as { picks: Pick[] }).picks : null;
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, picks), readFileSync(`${RESULTS}/report.md`, 'utf8'));

  // Each unit is of the conversation published beside it, and of one state of the plugin's code.
  const built = new Map(TRACES.map((trace) => [trace.name, (JSON.parse(readFileSync(new URL(`../bench/bases/${trace.name}.json`, import.meta.url), 'utf8')) as { sessionId: string }).sessionId]));
  for (const unit of units) assert.equal(unit.base, built.get(unit.trace), `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
  // Two checkouts were measured: this code, and v0.5.2 in the probes that set its estimate beside this one's.
  assert.equal(new Set(units.filter((unit) => unit.arm === 'plugin' && unit.variant !== 'v0.5.2').map((unit) => unit.plugin)).size, 1);
  assert.equal(new Set(units.filter((unit) => unit.variant === 'v0.5.2').map((unit) => unit.plugin)).size, 1);

  // What was run: six traces three times on Haiku, three once on Sonnet, both arms each time.
  const asked = units.filter((unit) => unit.mode === 'ask' && unit.variant === 'default');
  const count = (model: RegExp, arm: string) => asked.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 3, 3]);
  assert.ok(asked.every((unit) => unit.questions.length === 9));
  // In each trace and model both arms went first at least once where there were three runs.
  for (const trace of TRACES) {
    const firsts = asked.filter((unit) => unit.trace === trace.name && /haiku/.test(unit.model) && unit.first).map((unit) => unit.arm);
    assert.deepEqual([...new Set(firsts)].sort(), ['builtin', 'plugin'], trace.name);
  }
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(asked, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + JSON.stringify(picks) + readFileSync(`${RESULTS}/report.md`, 'utf8');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const ESTIMATE = fileURLToPath(new URL('../bench/results/2026-10-02-estimate', import.meta.url));

test('the probes in the repository: the size the plugin counts against what was in use, with the count of ADR 0013 and with 0.6.0', () => {
  assert.ok(existsSync(ESTIMATE));
  const all = unitsUnder(ESTIMATE);
  const { units, older } = currentOf(all);
  assert.equal(older, 0);
  assert.ok(units.every((unit) => unit.mode === 'probe' && unit.arm === 'plugin' && unit.questions.length === 1));
  // The table is these units and nothing else: made again, it is the file.
  assert.equal(whole(units, null, older, null), readFileSync(`${ESTIMATE}/report.md`, 'utf8'));

  // Each unit is of a conversation in the repository: the one beside the traces, or, for the one Opus built, the one beside these results.
  const built = (path: string) => (existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { sessionId: string; model: string }) : null);
  const baseOf = (unit: Unit) => {
    const shared = built(fileURLToPath(new URL(`../bench/bases/${unit.trace}.json`, import.meta.url)));
    const own = built(`${ESTIMATE}/bases/${unit.trace}.json`);
    return [shared, own].find((base) => base?.sessionId === unit.base) ?? null;
  };
  for (const unit of units) assert.ok(baseOf(unit) !== null, `${unit.trace} ${unit.model} ${unit.variant}`);
  // Two states of the plugin's code: the count of ADR 0013, and 0.6.0, also made to compact what it handed over.
  const of = (...variants: string[]) => units.filter((unit) => variants.includes(unit.variant));
  assert.equal(units.length, of('adr-0013', 'v0.6.0', 'v0.6.0-max-after-100').length);
  assert.equal(new Set(of('adr-0013').map((unit) => unit.plugin)).size, 1);
  assert.equal(new Set(of('v0.6.0', 'v0.6.0-max-after-100').map((unit) => unit.plugin)).size, 1);
  // What was probed: every conversation with Haiku, two of them compacted by Sonnet, the Japanese one built and compacted by Opus.
  const short = (model: string) => /haiku|sonnet|opus/.exec(model)?.[0] ?? model;
  const probed = (variant: string) => of(variant).map((unit) => `${unit.trace} ${short(unit.model)}`).sort();
  const eleven = [...[...TRACES, ...PROBED].map((trace) => `${trace.name} haiku`), 'results sonnet', 'mixed sonnet', 'japanese opus'].sort();
  assert.deepEqual(probed('adr-0013'), eleven);
  assert.deepEqual(probed('v0.6.0'), eleven);
  assert.deepEqual(probed('v0.6.0-max-after-100'), ['mixed haiku', 'mixed sonnet']);

  // How far the size was off what was in use: against what was sent next where results were moved out, else
  // against what was in use before, less the thinking.
  const off = (unit: Unit): number => {
    const line = unit.compaction.line;
    assert.ok(line !== null && line.estimate !== undefined && unit.compaction.thinkingBefore !== undefined, `${unit.trace} ${unit.model} ${unit.variant}`);
    const against = line.outcome === 'moved' ? (unit.questions[0]?.requests[0] ?? NaN) : unit.compaction.preTokens - unit.compaction.thinkingBefore;
    assert.ok(line.outcome === 'moved' || line.outcome === 'nothing');
    return (line.estimate - against) / against;
  };
  const sameModel = (unit: Unit) => baseOf(unit)?.model === unit.model;
  // What docs/limits.md says of the count, compacted by the model that built the conversation. Where results were moved out,
  // within 20 % of what was sent next and no more than 5 % under; where nothing could be, up to 7 % under what was in use less the thinking.
  const own = of('adr-0013').filter(sameModel);
  const movedOut = own.filter((unit) => unit.compaction.line?.outcome === 'moved').map(off);
  const untouched = own.filter((unit) => unit.compaction.line?.outcome === 'nothing').map(off);
  assert.deepEqual([movedOut.length, untouched.length], [4, 5]);
  assert.ok(Math.max(...movedOut) <= 0.2 && Math.min(...movedOut) >= -0.05, movedOut.map((e) => (e * 100).toFixed(1)).join(' '));
  assert.ok(Math.max(...untouched) <= 0 && Math.min(...untouched) >= -0.07, untouched.map((e) => (e * 100).toFixed(1)).join(' '));
  // Compacted by another model before it has answered, the size is the other model's count: under by its tokenizer's share where the prose stays.
  const others = of('adr-0013').filter((unit) => !sameModel(unit));
  assert.deepEqual(others.map((unit) => `${unit.trace} ${short(unit.model)}`).sort(), ['mixed sonnet', 'results sonnet']);
  const [mixedBySonnet] = others.filter((unit) => unit.trace === 'mixed').map(off);
  assert.ok(mixedBySonnet !== undefined && mixedBySonnet < -0.15 && mixedBySonnet > -0.25, String(mixedBySonnet));
  // What #37 was filed for: 0.6.0 handed `mixed` to the summary at a size 39 % over what it had left, and this count compacts it.
  const mixed = (variant: string) => of(variant).find((unit) => unit.trace === 'mixed' && /haiku/.test(unit.model));
  assert.equal(mixed('v0.6.0')?.compaction.line?.outcome, 'too-much');
  assert.equal(mixed('v0.6.0')?.compaction.summarized, true);
  assert.equal(mixed('adr-0013')?.compaction.line?.outcome, 'moved');
  const forced = mixed('v0.6.0-max-after-100');
  assert.ok(forced !== undefined && off(forced) > 0.35);
  // And 0.6.0 was outside what this count keeps to, either way, on the same conversations.
  const before = of('v0.6.0').filter(sameModel).filter((unit) => unit.compaction.line?.outcome !== 'too-much').map(off);
  assert.ok(Math.max(...before) > 0.4 && Math.min(...before) < -0.19, before.map((e) => (e * 100).toFixed(1)).join(' '));

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const read = (name: string) => readFileSync(`${ESTIMATE}/${name}`, 'utf8');
  const text = JSON.stringify(all) + read('report.md') + read('bases/japanese.json') + read('bases/japanese.conversation.json');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
  // The conversation Opus built is the trace as it is now, as the ones beside the traces are held to be.
  const japanese = BUILT.find((trace) => trace.name === 'japanese');
  assert.ok(japanese !== undefined);
  assert.deepEqual(saidIn(JSON.parse(read('bases/japanese.conversation.json')) as Conversation), saidBy(japanese));
  assert.equal(built(`${ESTIMATE}/bases/japanese.json`)?.model, 'claude-opus-5-5');
});

test('the tables are of the plugin as it is set by default, or of the one other variant measured where there is no default', () => {
  const changed = { ...unitOf('plugin', 1, []), variant: 'changed' };
  const alone = report([changed], null);
  assert.ok(alone.includes('### ') && alone.includes(' Variant: changed.'), alone.slice(0, 300));
  // The default among them: it is what is tabled, and nothing says a variant.
  const mixed = report([changed, unitOf('plugin', 1, [])], null);
  assert.ok(mixed.includes('### ') && !mixed.includes('Variant:'));
  assert.ok(mixed.includes('plugin 1,'), 'one run of the plugin, not two');
  // Two variants and no default: they are not one comparison, and none is tabled.
  assert.ok(!report([changed, { ...changed, variant: 'other' }], null).includes('### '));
  // A probe asks no question of a trace and decides nothing.
  assert.ok(report([changed, { ...changed, variant: 'probed', mode: 'probe' as const }], null).includes(' Variant: changed.'));
  // What the plugin estimated is tabled for the same units: no table of no rows under the heading.
  const line = { outcome: 'moved' as const, moved: 3, results: 6, images: 0, charsBefore: 108144, charsAfter: 54793, estimate: 44333, window: 167000, ms: 55 };
  const said = { ...unitOf('plugin', 1, [answered('next', 'continuity', 'ok', [])], { line }), variant: 'changed' };
  assert.match(whole([said], null), /\| changed \([0-9a-z ]+\) \| 1 \| moved \| 44333 \|/);
  assert.ok(!whole([said, unitOf('plugin', 1, [])], null).includes('| changed ('));
});

const CHANGED = fileURLToPath(new URL('../bench/results/2026-10-02-changed', import.meta.url));
/** The calls to `recall` in those units, as docs/measurements.md states them. */
const RECALLS = 92;

test('the units in the repository measured with the line after a summary: the reading is fetched where it was not, and nothing else moves (#14)', () => {
  assert.ok(existsSync(CHANGED));
  const all = unitsUnder(CHANGED);
  const { units, older } = currentOf(all);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${CHANGED}/grades.json`, 'utf8')) as Grades;
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), readFileSync(`${CHANGED}/report.md`, 'utf8'));
  assert.equal(outcomesOf(units, grades).ungraded, 0);

  // What was run: the plugin's arm of the five conversations that go to the summary, three times on Haiku, and two of them once on Sonnet.
  assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.variant === 'changed' && unit.mode === 'ask' && unit.questions.length === 9));
  assert.ok(units.every((unit) => unit.compaction.summarized));
  assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1);
  const SHOWN = ['full', 'prose', 'short', 'thinking'];
  const of = (set: readonly Unit[], model: RegExp, traces: readonly string[]) => set.filter((unit) => model.test(unit.model) && traces.includes(unit.trace));
  assert.deepEqual(of(units, /haiku/, [...SHOWN, 'writes']).map((unit) => `${unit.trace} ${unit.run}`).sort(), [...SHOWN, 'writes'].flatMap((trace) => [1, 2, 3].map((run) => `${trace} ${run}`)).sort());
  assert.deepEqual(of(units, /sonnet/, TRACES.map((trace) => trace.name)).map((unit) => unit.trace).sort(), ['prose', 'writes']);

  // What they are set against: the plugin's arm of the results of 2026-10-02, on the same buildings of the conversations.
  const earlier = currentOf(unitsUnder(RESULTS)).units.filter((unit) => unit.arm === 'plugin' && unit.mode === 'ask' && unit.variant === 'default');
  const earlierGrades = JSON.parse(readFileSync(`${RESULTS}/grades.json`, 'utf8')) as Grades;
  for (const unit of units) assert.ok(earlier.some((one) => one.trace === unit.trace && one.base === unit.base), `${unit.trace} ${unit.model}`);

  const answers = (set: readonly Unit[], id: string) => set.map((unit) => ({ unit, one: unit.questions.find((question) => question.id === id) as Unit['questions'][number] }));
  const right = (set: readonly Unit[], id: string, g: Grades) => answers(set, id).filter(({ unit, one }) => verdictOf(unit, one, g) === 'correct').length;
  const noCall = (set: readonly Unit[], id: string) => answers(set, id).filter(({ one }) => one.calls.length === 0).length;
  const recalls = (set: readonly Unit[], id: string) => answers(set, id).reduce((sum, { one }) => sum + one.retrieval.recalls, 0);

  // What the file said when it was read, where Claude Code shows the file again: none right of twelve, and six with the line.
  assert.equal(right(of(earlier, /haiku/, SHOWN), 'then', earlierGrades), 0);
  assert.equal(noCall(of(earlier, /haiku/, SHOWN), 'then'), 12);
  assert.deepEqual(SHOWN.map((trace) => right(of(units, /haiku/, [trace]), 'then', grades)), [3, 0, 2, 1]);
  // Every call to recall in these units, as the document counts them.
  assert.equal(units.flatMap((unit) => unit.questions).reduce((sum, one) => sum + one.retrieval.recalls, 0), RECALLS);
  // Each right answer came after one recall, and each miss called nothing.
  assert.equal(recalls(of(units, /haiku/, SHOWN), 'then'), 6);
  assert.equal(noCall(of(units, /haiku/, SHOWN), 'then'), 6);
  // Where the file is not shown again, right as before, with one recall an answer where there were two.
  assert.deepEqual([right(of(earlier, /haiku/, ['writes']), 'then', earlierGrades), right(of(units, /haiku/, ['writes']), 'then', grades)], [3, 3]);
  assert.deepEqual([recalls(of(earlier, /haiku/, ['writes']), 'then'), recalls(of(units, /haiku/, ['writes']), 'then')], [6, 3]);
  // A file that did not change is not named: answered right with no call, as before. What the changed file says now: right as before.
  for (const [set, g] of [[earlier, earlierGrades], [units, grades]] as const) {
    assert.deepEqual([right(of(set, /haiku/, SHOWN), 'unchanged', g), noCall(of(set, /haiku/, SHOWN), 'unchanged')], [12, 12]);
    assert.equal(right(of(set, /haiku/, [...SHOWN, 'writes']), 'now', g), 15);
  }
  // The script's output that no file holds: 29 of 30, where it was 26.
  const gone = (set: readonly Unit[], g: Grades) => right(of(set, /haiku/, [...SHOWN, 'writes']), 'gone-1', g) + right(of(set, /haiku/, [...SHOWN, 'writes']), 'gone-2', g);
  assert.deepEqual([gone(earlier, earlierGrades), gone(units, grades)], [26, 29]);
  // Sonnet: all three right in both conversations, with the line as without it.
  for (const id of ['then', 'now', 'unchanged']) {
    assert.equal(right(of(units, /sonnet/, ['prose', 'writes']), id, grades), 2, id);
    assert.equal(right(of(earlier, /sonnet/, ['prose', 'writes']), id, earlierGrades), 2, id);
  }

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + readFileSync(`${CHANGED}/report.md`, 'utf8');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const AGAIN = fileURLToPath(new URL('../bench/results/2026-10-02-v0.6.1', import.meta.url));

/** A row of the published tables of a trace and model, as the documents quote it: the plugin's cell, then the built-in compaction's. */
const rowOf = (tables: string, trace: string, label: string, model = 'claude-haiku-4-5-20251001'): string[] => {
  const section = tables.split('\n### ').find((part) => part.startsWith(`${trace}, ${model}\n`)) ?? '';
  const line = section.split('\n').find((one) => one.startsWith(`| ${label} |`)) ?? '';
  return line.split('|').slice(2, 4).map((cell) => cell.trim());
};

/** Right answers of those asked, over the runs of some traces, in one arm: 0 the plugin's, 1 the built-in compaction's. */
const rightOf = (tables: string, traces: readonly string[], label: string, arm: 0 | 1): [number, number] => {
  let [got, asked] = [0, 0];
  for (const trace of traces) {
    for (const one of (rowOf(tables, trace, label)[arm] ?? '').matchAll(/(\d+)\/(\d+)/g)) {
      got += Number(one[1]);
      asked += Number(one[2]);
    }
  }
  return [got, asked];
};

const KIND_ROWS = ['Exact, source gone', 'Exact, file unchanged', 'Exact, file changed: what it said then', 'Exact, file changed: what it says now', 'Where the work stands', 'A rule stated early'];

/** Every kind of question together, over some traces, in one arm. */
const everyOf = (tables: string, traces: readonly string[], arm: 0 | 1): [number, number] =>
  KIND_ROWS.map((kind) => rightOf(tables, traces, kind, arm)).reduce<[number, number]>(([got, asked], [g, a]) => [got + g, asked + a], [0, 0]);

test('the benchmark run again on 0.6.1: of conversations built again, every answer graded, the tables made from them, and what the documents say of them', () => {
  assert.ok(existsSync(AGAIN));
  const all = unitsUnder(AGAIN);
  const { units, older } = currentOf(all);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${AGAIN}/grades.json`, 'utf8')) as Grades;
  const tables = readFileSync(`${AGAIN}/report.md`, 'utf8');
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), tables);

  // Each unit is of a conversation built again from the traces as they are, which the file beside the results names, and of one state of the plugin's code.
  const bases = TRACES.map((trace) => readFileSync(`${AGAIN}/bases/${trace.name}.json`, 'utf8'));
  const built = new Map(TRACES.map((trace, at) => [trace.name, JSON.parse(bases[at] as string) as { sessionId: string; version: number }]));
  for (const unit of units) {
    assert.equal(unit.base, built.get(unit.trace)?.sessionId, `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
    assert.equal(unit.version, built.get(unit.trace)?.version, unit.trace);
  }
  assert.equal(new Set(units.filter((unit) => unit.arm === 'plugin').map((unit) => unit.plugin)).size, 1);

  // What was run: as the first time, six traces three times on Haiku, three once on Sonnet, both arms each time, and nothing else.
  assert.ok(units.every((unit) => unit.mode === 'ask' && unit.variant === 'default' && unit.questions.length === 9));
  const count = (model: RegExp, arm: string) => units.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 3, 3]);
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(units, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // What docs/measurements.md and the README say of them, read off the tables: the plugin's cell, then the built-in compaction's.
  const row = (trace: string, label: string) => rowOf(tables, trace, label);
  const right = (traces: readonly string[], label: string, arm: 0 | 1) => rightOf(tables, traces, label, arm);
  assert.deepEqual(row('results', 'Built-in summary ran'), ['0 of 3', '3 of 3']);
  assert.deepEqual(row('results', 'Tokens sent on the next request'), ['43995, 43995, 43995', '8246, 8313, 8353']);
  assert.deepEqual(row('results', 'Exact, source gone'), ['2/2, 2/2, 2/2', '1/2, 1/2, 0/2']);
  const handed = ['writes', 'prose', 'short', 'full', 'thinking'];
  for (const trace of handed) assert.deepEqual(row(trace, 'Built-in summary ran'), ['3 of 3', '3 of 3'], trace);
  assert.deepEqual([right(handed, 'Exact, source gone', 0), right(handed, 'Exact, source gone', 1)], [[26, 30], [10, 30]]);
  const six = TRACES.map((trace) => trace.name);
  assert.deepEqual([right(six, 'Exact, file changed: what it said then', 0), right(six, 'Exact, file changed: what it said then', 1)], [[5, 18], [0, 18]]);
  // Every kind of question together: 143 and 118 of 162, where the first run had 139 and 114.
  assert.deepEqual([everyOf(tables, six, 0), everyOf(tables, six, 1)], [[143, 162], [118, 162]]);

  // Where the conversation was handed over, the summary in the plugin's arm against the built-in one's, pair by pair: this run, and the first.
  const pairsOf = (of: readonly Unit[]) =>
    handed.flatMap((trace) =>
      [1, 2, 3].map((run) => {
        const one = (arm: string) => of.find((unit) => unit.trace === trace && /haiku/.test(unit.model) && unit.run === run && unit.arm === arm && unit.mode === 'ask' && unit.variant === 'default')?.compaction;
        const [plugin, builtin] = [one('plugin'), one('builtin')];
        assert.ok(plugin !== undefined && builtin !== undefined, `${trace} run ${run}`);
        return { plugin, builtin };
      }),
    );
  // Of fifteen: the eighth.
  const median = (values: readonly number[]) => [...values].sort((a, b) => a - b)[(values.length - 1) / 2] as number;
  const told = (of: readonly Unit[]) => {
    const pairs = pairsOf(of);
    return {
      longer: pairs.filter(({ plugin, builtin }) => plugin.durationMs > builtin.durationMs).length,
      of: pairs.length,
      seconds: Math.round(median(pairs.map(({ plugin, builtin }) => plugin.durationMs - builtin.durationMs)) / 100) / 10,
      tokens: median(pairs.map(({ plugin, builtin }) => plugin.own.outputTokens - builtin.own.outputTokens)),
    };
  };
  assert.deepEqual(told(units), { longer: 14, of: 15, seconds: 7.7, tokens: 793 });
  assert.deepEqual(told(currentOf(unitsUnder(RESULTS)).units), { longer: 10, of: 15, seconds: 1.4, tokens: 268 });
  // About 10 ms for a token the summary wrote out, in both arms, and 6 ms or less for the plugin to look for what to move.
  const rate = (arm: 'plugin' | 'builtin') => median(pairsOf(units).map((pair) => pair[arm].durationMs / pair[arm].own.outputTokens));
  for (const arm of ['plugin', 'builtin'] as const) assert.ok(rate(arm) > 9.5 && rate(arm) < 11, `${arm} ${rate(arm)}`);
  for (const { plugin } of pairsOf(units)) assert.ok(plugin.line !== null && plugin.line.ms <= 6);

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + tables + bases.join('');
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const LEFT = fileURLToPath(new URL('../bench/results/2026-10-03', import.meta.url));

test('the benchmark with a /compact left undone (ADR 0015): the plugin measured again on the conversations of the run on 0.6.1, beside its built-in arm', () => {
  assert.ok(existsSync(LEFT));
  const all = unitsUnder(LEFT);
  const { units, older } = currentOf(all);
  assert.equal(older, 0);
  const grades = JSON.parse(readFileSync(`${LEFT}/grades.json`, 'utf8')) as Grades;
  const tables = readFileSync(`${LEFT}/report.md`, 'utf8');
  // The tables are these units and grades and nothing else: made again, they are the file.
  assert.equal(whole(units, grades, older, null), tables);

  // The conversations are those of the run on 0.6.1, and its built-in arm is here unchanged: the plugin's arm alone was measured again, on another state of its code.
  const again = currentOf(unitsUnder(AGAIN)).units;
  const builtOn = new Map(again.map((unit) => [unit.trace, unit.base]));
  for (const unit of units) assert.equal(unit.base, builtOn.get(unit.trace), `${unit.trace} ${unit.model} run ${unit.run} ${unit.arm}`);
  const counterpart = (unit: Unit) => again.find((one) => one.trace === unit.trace && one.model === unit.model && one.run === unit.run && one.arm === unit.arm && one.mode === unit.mode);
  for (const unit of units.filter((one) => one.arm === 'builtin')) assert.deepEqual(unit, counterpart(unit), `${unit.trace} ${unit.model} run ${unit.run}`);
  const plugin = units.filter((unit) => unit.arm === 'plugin');
  assert.equal(new Set(plugin.map((unit) => unit.plugin)).size, 1);
  assert.notEqual(plugin[0]?.plugin, again.find((unit) => unit.arm === 'plugin')?.plugin);

  // What was run: the six traces three times on Haiku; on Sonnet `results` and `writes`, `prose` being left out (its question about what a file
  // said before it changed was refused twice by Sonnet's safeguards); and, with the line at 1 %, a probe of each of the four left undone, three times.
  const asked = units.filter((unit) => unit.mode === 'ask' && unit.variant === 'default');
  const count = (model: RegExp, arm: string) => asked.filter((unit) => model.test(unit.model) && unit.arm === arm).length;
  assert.deepEqual([count(/haiku/, 'plugin'), count(/haiku/, 'builtin'), count(/sonnet/, 'plugin'), count(/sonnet/, 'builtin')], [18, 18, 2, 3]);
  assert.deepEqual(asked.filter((unit) => /sonnet/.test(unit.model) && unit.arm === 'plugin').map((unit) => unit.trace).sort(), ['results', 'writes']);
  assert.ok(asked.every((unit) => unit.questions.length === 9));
  const four = ['writes', 'prose', 'short', 'thinking'];
  const probes = units.filter((unit) => unit.mode === 'probe');
  assert.deepEqual(probes.map((unit) => `${unit.trace} ${unit.run}`).sort(), four.flatMap((trace) => [1, 2, 3].map((run) => `${trace} ${run}`)).sort());
  assert.ok(probes.every((unit) => unit.variant === 'max-after-1' && unit.arm === 'plugin' && unit.compaction.summarized && unit.compaction.line?.outcome === 'nothing'));
  assert.equal(units.length, asked.length + probes.length);
  // Every answer has a verdict, and the grader was right on every answer whose grade was known.
  assert.equal(outcomesOf(asked, grades).ungraded, 0);
  assert.equal(grades.controls.asExpected, grades.controls.count);
  assert.equal(grades.controls.toldPairsSame, grades.controls.toldPairs);

  // The four with nothing to move out and room left are left as they were every time; `results` is compacted and `full` summarized as before.
  for (const unit of asked.filter((one) => one.arm === 'plugin')) assert.equal(unit.compaction.undone === true, four.includes(unit.trace), `${unit.trace} ${unit.model} run ${unit.run}`);

  // What docs/measurements.md and the README say of them, read off the tables.
  for (const trace of four) {
    assert.deepEqual(rowOf(tables, trace, 'Built-in summary ran'), ['0 of 3', '3 of 3'], trace);
    assert.deepEqual(rowOf(tables, trace, 'Left as it was, nothing compacted'), ['3 of 3', '0 of 3'], trace);
    assert.ok((rowOf(tables, trace, 'Compaction, ms')[0] ?? '').split(', ').every((ms) => Number(ms) < 100), trace);
  }
  assert.deepEqual(rowOf(tables, 'full', 'Built-in summary ran'), ['3 of 3', '3 of 3']);
  assert.deepEqual(rowOf(tables, 'results', 'Built-in summary ran'), ['0 of 3', '3 of 3']);
  const sixTraces = ['results', 'writes', 'prose', 'short', 'full', 'thinking'];
  const middle = (cell: string) => cell.split(', ').map(Number).sort((a, b) => a - b)[1];
  const nextRequest = (arm: 0 | 1) => sixTraces.map((trace) => middle(rowOf(tables, trace, 'Tokens sent on the next request')[arm] ?? ''));
  assert.deepEqual(nextRequest(0), [43995, 69039, 59893, 29343, 14671, 33098]);
  assert.deepEqual(nextRequest(1), [8313, 26034, 12573, 13157, 12557, 12781]);
  // Over every run of the four: what the next request carried left as it was, and after a summary.
  const span = (arm: 0 | 1) => {
    const all = four.flatMap((trace) => (rowOf(tables, trace, 'Tokens sent on the next request')[arm] ?? '').split(', ').map(Number));
    return [Math.min(...all), Math.max(...all)];
  };
  assert.deepEqual([span(0), span(1)], [[29343, 69039], [12522, 26318]]);
  // The script's output that no file holds any more, right of six, per trace: the README's table.
  assert.deepEqual(sixTraces.map((trace) => rightOf(tables, [trace], 'Exact, source gone', 0)[0]), [6, 5, 4, 6, 6, 6]);
  assert.deepEqual(sixTraces.map((trace) => rightOf(tables, [trace], 'Exact, source gone', 1)[0]), [2, 1, 4, 1, 3, 1]);
  // Every kind of question, Haiku over the six: the plugin's arm, then the built-in one's.
  const kinds = KIND_ROWS.map((kind) => [rightOf(tables, sixTraces, kind, 0), rightOf(tables, sixTraces, kind, 1)]);
  assert.deepEqual(kinds, [[[33, 36], [12, 36]], [[18, 18], [18, 18]], [[15, 18], [0, 18]], [[18, 18], [18, 18]], [[34, 36], [34, 36]], [[34, 36], [36, 36]]]);
  assert.deepEqual([everyOf(tables, sixTraces, 0), everyOf(tables, sixTraces, 1)], [[152, 162], [118, 162]]);
  // What a file said before it changed, in the four left as they were: 12 of 12, with no tool, from the conversation that was still there.
  const then = asked.filter((unit) => unit.arm === 'plugin' && /haiku/.test(unit.model) && four.includes(unit.trace)).map((unit) => unit.questions.find((one) => one.id === 'then'));
  assert.equal(then.filter((one) => one?.verdict === 'correct' && one.calls.length === 0).length, 12);
  // The nine questions' cost, sending the whole conversation each time: the first run wrote it to the cache, the two after it read it.
  assert.deepEqual(rowOf(tables, 'writes', 'All questions: cost, USD'), ['1.1160, 0.0802, 0.0809', '0.4245, 0.4375, 0.5103']);
  assert.deepEqual(rowOf(tables, 'writes', 'Tokens sent on the next request', 'claude-sonnet-5-5'), ['86799', '28400']);
  assert.deepEqual(rowOf(tables, 'writes', 'All questions: cost, USD', 'claude-sonnet-5-5'), ['2.8051', '0.9990']);
  // What the compaction and the nine questions cost on the four, as the README gives it: left as they were with the cache warm (runs 2 and 3,
  // which read what run 1 wrote) and cold (run 1), against a summary and its nine; and the files read again a unit.
  const haikuOn = (arm: string, runs: readonly number[]) => asked.filter((unit) => /haiku/.test(unit.model) && unit.arm === arm && four.includes(unit.trace) && runs.includes(unit.run));
  const costOf = (unit: Unit) => unit.compaction.own.costUSD + unit.questions.reduce((sum, one) => sum + one.own.costUSD, 0);
  const spanOf = (values: readonly number[], digits: number) => [Math.min(...values), Math.max(...values)].map((value) => Number(value.toFixed(digits)));
  assert.deepEqual(spanOf(haikuOn('plugin', [2, 3]).map(costOf), 2), [0.04, 0.08]);
  assert.deepEqual(spanOf(haikuOn('plugin', [1]).map(costOf), 2), [0.4, 1.12]);
  assert.deepEqual(spanOf(haikuOn('builtin', [1, 2, 3]).map(costOf), 2), [0.18, 0.61]);
  const readsOf = (unit: Unit) => unit.questions.reduce((sum, one) => sum + one.retrieval.reads, 0);
  assert.deepEqual(spanOf(haikuOn('builtin', [1, 2, 3]).map(readsOf), 0), [1, 22]);
  assert.ok(haikuOn('plugin', [1, 2, 3]).every((unit) => readsOf(unit) === 1));

  // Nothing of the machine: no home directory in either form a path of it takes, no key.
  const text = JSON.stringify(all) + JSON.stringify(grades) + tables;
  assert.ok(!/[\/-]Users[\/-]|[\/-]home[\/-][a-z]|cctmp|CLOUDFLARE_API_TOKEN|TYPESAFE_API_KEY/.test(text));
});

const FOUND_AT = fileURLToPath(new URL('../bench/results/2026-10-03-find', import.meta.url));
/** The plugin's code the published units of the plugin as it now is were measured with (`checkoutOf`): this change on `e792fad`, before #48. */
const MEASURED_CODE = '3b4bdf93e529';

test('the units in the repository measured where the calls say nothing: every figure docs/measurements.md, docs/limits.md, README.md and CHANGELOG.md give (#38)', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const measurements = read('../docs/measurements.md');
  const limits = read('../docs/limits.md');
  const readme = read('../README.md');
  const changelog = read('../CHANGELOG.md');
  const has = (text: string, phrase: string, what: string) => assert.ok(text.replace(/\s+/g, ' ').includes(phrase), `${what}: ${phrase}`);
  const of = (dir: string) => {
    const { units, older } = currentOf(unitsUnder(`${FOUND_AT}/${dir}`));
    assert.equal(older, 0, dir);
    assert.ok(units.every((unit) => unit.arm === 'plugin' && unit.mode === 'find'), dir);
    assert.equal(new Set(units.map((unit) => unit.plugin)).size, 1, dir);
    return units;
  };
  const counts = (units: readonly Unit[], trace: string, model: RegExp, variant: string) => {
    const these = units.filter((unit) => unit.trace === trace && model.test(unit.model) && unit.variant === variant).sort((a, b) => a.run - b.run);
    const meaningOf = (unit: Unit) => unit.questions.filter((one) => one.id.startsWith('find-doc-'));
    const questions = these.flatMap((unit) => unit.questions);
    return {
      runs: these.map((unit) => unit.run),
      calls: these.reduce((sum, unit) => sum + meaningOf(unit).filter((one) => one.retrieval.finds > 0).length, 0),
      perRun: these.map((unit) => meaningOf(unit).filter((one) => one.retrieval.finds > 0).length),
      meaning: questions.filter((one) => one.id.startsWith('find-doc-') && one.verdict === 'correct').length,
      code: questions.filter((one) => one.id.startsWith('find-code-') && one.verdict === 'correct').length,
      right: these.map((unit) => unit.questions.filter((one) => one.verdict === 'correct').length),
      finds: these.map((unit) => unit.questions.reduce((sum, one) => sum + one.retrieval.finds, 0)),
    };
  };
  const and = (list: readonly number[]) => `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;

  const rows: [dir: string, label: string][] = [
    ['before', 'Before this change'],
    ['named-in-recall', "`recall`'s description names `find`"],
    ['named-and-none', 'and `find`\'s "none" says what Jev saw'],
  ];
  const by: Record<string, Record<'default' | 'find', ReturnType<typeof counts>>> = {};
  for (const [dir, label] of rows) {
    const units = of(dir);
    // Every unit moved all thirteen documents out: sixteen results of twenty.
    assert.ok(units.filter((unit) => unit.trace === 'opaque').every((unit) => unit.compaction.line?.moved === 16), dir);
    const entry = { default: counts(units, 'opaque', /haiku/, 'default'), find: counts(units, 'opaque', /haiku/, 'find') };
    by[dir] = entry;
    for (const [variant, key] of [['default', 'no'], ['find', 'yes']] as const) {
      const n = entry[variant];
      assert.deepEqual(n.runs, [1, 2, 3], `${dir} ${variant}`);
      const row = new RegExp(`\\| ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} +\\| ${key} +\\| +${n.calls} of 21 \\| +${n.meaning} of 21 \\| +${n.code} of 9 \\|`);
      assert.match(measurements, row, `${dir} ${variant}`);
    }
  }
  const [before, named, now] = [by['before'], by['named-in-recall'], by['named-and-none']] as const;
  assert.ok(before && named && now);
  // The rule set before measuring: 11 of 21. The plugin before this change falls short of it; the plugin as it now is reaches it.
  assert.ok(before.find.calls < 11 && now.find.calls >= 11);
  assert.equal(new Set(of('named-and-none').map((unit) => unit.plugin)).values().next().value, MEASURED_CODE);
  has(measurements, `fell short of the rule, ${before.find.calls} of 21 (${and(before.find.perRun)} in the three runs)`, 'measurements');
  has(measurements, `the agent called it for ${named.find.calls} of 21`, 'measurements');
  has(measurements, `said the code was not there: ${named.find.code} of 9`, 'measurements');
  has(measurements, `with that, ${now.find.calls} of 21 (${and(now.find.perRun)}), and ${now.find.code} of 9 codes`, 'measurements');
  const noKey = [before.default.code, named.default.code, now.default.code];
  has(measurements, `its codes went from ${Math.min(...noKey)} to ${Math.max(...noKey)} of 9`, 'measurements');
  has(limits, `about what a result was about: ${now.find.calls} of 21, in a made-up conversation of thirteen such results`, 'limits');
  has(readme, `Haiku 4.5 called it for ${now.find.calls} of 21 questions`, 'README');
  has(changelog, `for ${before.find.calls} of 21 questions about what a result was about before this change, and for ${now.find.calls} of 21 now`, 'CHANGELOG');
  has(changelog, `0 of 9 right, against ${before.find.code} of 9 before this change; with this answer, ${now.find.code} of 9 (with no key, ${Math.min(...noKey)} to ${Math.max(...noKey)} of 9 in the same runs)`, 'CHANGELOG');
  assert.equal(named.find.code, 0);

  // Sonnet 5.5, one run of the plugin as it now is.
  const units = of('named-and-none');
  const sonnet = counts(units, 'opaque', /sonnet/, 'find');
  const sonnetNoKey = counts(units, 'opaque', /sonnet/, 'default');
  has(limits, `(Sonnet 5.5, one run: ${sonnet.calls} of 7)`, 'limits');
  has(changelog, `(Sonnet 5.5, one run: ${sonnet.calls} of 7)`, 'CHANGELOG');
  has(measurements, `with a key it called \`find\` for ${sonnet.calls} of the 7 questions by meaning and was right on ${sonnet.meaning}, and on ${sonnet.code} of the 3 codes; with no key, right on ${sonnetNoKey.meaning} and on ${sonnetNoKey.code}.`, 'measurements');

  // Where the calls name what they read: three runs of each arm.
  const results = { find: counts(units, 'results', /haiku/, 'find'), none: counts(units, 'results', /haiku/, 'default') };
  const short = { find: counts(units, 'short', /haiku/, 'find'), none: counts(units, 'short', /haiku/, 'default') };
  has(measurements, `\`results\` ${and(results.find.right)} of 8 with a key and ${and(results.none.right)} without`, 'measurements');
  has(measurements, `calling \`find\` ${and(results.find.finds)} times in eight questions`, 'measurements');
  has(measurements, `\`short\` ${and(short.find.right)} of 5 with a key and ${and(short.none.right)} without`, 'measurements');
  assert.deepEqual(short.find.finds, [0, 0, 0]);
});
