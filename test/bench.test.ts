import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  OUTCOMES,
  gapsOf,
  holdsAll,
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
import { saidBy, saidIn } from '../bench/build.ts';
import { argsOf, toolsOf } from '../bench/cc.ts';
import { MISSED, batchName, currentOf, itemsOf, keyOf, promptOf, summed, verdictsIn } from '../bench/grade.ts';
import { estimates, graderOf, outcomesOf, overruled, report, verdictOf } from '../bench/report.ts';
import { armsOf, staleness, type Unit } from '../bench/run.ts';
import { TRACES, described } from '../bench/traces.ts';
import { reportLine, type Report } from '../src/compact.ts';

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
  assert.equal(readLine('something else'), null);
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
  assert.match(text, /\| results \| haiku \| default \(abc1234\) \| 1 \| moved \| 44333 \| 41176 \| 7\.7 % \|/);
  assert.match(text, /\| results \| haiku \| v0\.5\.2 \(abc1234\) \| 1 \| moved \| 91829 \| 41176 \| 123\.0 % \|/);
  assert.ok(!text.includes('builtin'));
  // Where the plugin handed over, what was sent next is what the summary left: its estimate was of something else, and no error is given.
  const handed = estimates([{ ...probe, compaction: { ...probe.compaction, line: { ...line, outcome: 'nothing' as const } } }]);
  assert.match(handed, /\| nothing \| 44333 \| 41176 \| — \|/);
});

test('the conversations published in bench/bases are the traces as they are now: what was said, in order, at a size the trace accepts', () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`../bench/bases/${name}`, import.meta.url), 'utf8'));
  for (const trace of TRACES) {
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
