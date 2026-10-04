import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { reportLine, tokensOf, undoneLine, type Count, type Report } from '../src/compact.ts';
import { cutLine, decide } from '../src/cut.ts';
import { beforeTrying, configFrom, nextStep, type Step, type Tried } from '../src/flow.ts';
import { PLUGIN } from '../src/store.ts';
import type { Message } from '../src/types.ts';

const COUNT: Count = { fixedTokens: 10_000, density: 1 / 3 };
const prose = (chars: number) => 'p'.repeat(chars);
// Nine turns of 10,000 tokens and a little, as in test/cut.test.ts: over the line of 75,000, cut after the first turn.
const WIDE: Message[] = Array.from({ length: 9 }, (_, at): Message[] => [
  { role: 'user', text: `turn ${at + 1} ${prose(30_000)}`, toolUses: [] },
  { role: 'assistant', text: 'noted', toolUses: [] },
]).flat();
const WIDE_TOKENS = Math.round(COUNT.fixedTokens + tokensOf(WIDE, COUNT));
const SMALL = WIDE.slice(0, 2);

/** One turn as in test/cut.test.ts: the person says `said` characters, a file is read, the model answers. */
function turn(n: number, said: number): Message[] {
  return [
    { role: 'user', text: `turn ${n} ${prose(said)}`, toolUses: [] },
    { role: 'assistant', text: `reading ${n}`, toolUses: [{ tool_use_id: `t${n}`, tool: 'Read', input: { file_path: `/p/f${n}.txt` } }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `t${n}`, text: `r${n} ${prose(90)}`, isError: false }] },
    { role: 'assistant', text: `done ${n}`, toolUses: [] },
  ];
}
const talk = (turns: number, said: number): Message[] => Array.from({ length: turns }, (_, at) => turn(at + 1, said)).flat();

function report(over: Partial<Report> = {}): Report {
  return { results: 5, candidates: 5, moved: 0, images: 0, charsBefore: 1000, charsAfter: 1000, tokensAfter: 20_000, counted: true, window: 100_000, notMoved: {}, writeErrors: [], ms: 12, ...over };
}

/** A compaction in a window of 100,000 with 75 % allowed to stay, of `messages`, as `over` changes it. */
function tried(messages: readonly Message[], over: { report?: Partial<Report>; enough?: boolean; target?: number } & Partial<Omit<Tried, 'outcome'>> = {}): Tried {
  const { report: changed, enough, target, ...rest } = over;
  return {
    trigger: 'auto',
    instructions: undefined,
    outcome: { messages: [...messages], enough: enough ?? false, target: target ?? 75_000, report: report(changed) },
    inUse: 90_000,
    given: true,
    maxAfterPercent: 75,
    count: COUNT,
    keepTokens: 2_000,
    ...rest,
  };
}

test('a compaction computed ahead is skipped and a subagent goes straight on, before anything is tried', () => {
  assert.deepEqual(beforeTrying({ trigger: 'precompute', agentId: undefined }), { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` });
  assert.deepEqual(beforeTrying({ trigger: 'precompute', agentId: 'a1' }), { step: 'skip', why: `${PLUGIN} computes nothing ahead of a compaction` }, 'skipped first');
  assert.deepEqual(beforeTrying({ trigger: 'auto', agentId: 'a1' }), { step: 'pass' });
  assert.deepEqual(beforeTrying({ trigger: 'manual', agentId: undefined }), { step: 'try' });
});

test('a /compact by hand with nothing to move out and room left is left undone, the figure named only when Claude Code gave it (ADR 0015)', () => {
  const asked = { trigger: 'manual', inUse: 30_000, report: { moved: 0, candidates: 0 } } as const;
  assert.deepEqual(nextStep(tried(WIDE, asked)), { step: 'skip', why: `${PLUGIN}: ${undoneLine(30_000, 100_000)}` });
  assert.deepEqual(nextStep(tried(WIDE, { ...asked, given: false })), { step: 'skip', why: `${PLUGIN}: ${undoneLine(null, 100_000)}` });
  // Not with instructions, not on its own, not with something that could have left, not over what may stay, not once results left.
  for (const other of [{ instructions: 'keep the plan' }, { trigger: 'auto' }, { report: { moved: 0, candidates: 1 } }, { inUse: 75_001 }, { report: { moved: 2, candidates: 0 } }]) {
    assert.notEqual(nextStep(tried(WIDE, { ...asked, ...other })).step, 'skip', JSON.stringify(other));
  }
});

test('results moved out and enough: handed back as rebuilt, saying what was moved', () => {
  const step = nextStep(tried(WIDE, { report: { moved: 3 }, enough: true, trigger: 'manual', instructions: 'keep the plan' }));
  assert.deepEqual(step, { step: 'back', line: reportLine(report({ moved: 3 })) });
  // Nothing moved is never handed back as a compaction that moved results out: src/cut.ts decides it, as one too full would be.
  assert.deepEqual(nextStep(tried(WIDE, { enough: true })), { step: 'back', line: cutLine(report(), null) });
});

test('with instructions the built-in summary runs: of the conversation as handed in when nothing was moved out, of what is left when something was', () => {
  const instructions = 'keep the plan';
  const given = nextStep(tried(WIDE, { instructions }));
  assert.deepEqual(given, { step: 'summarize', line: `built-in compaction: nothing could be moved out (${reportLine(report())})`, of: 'given' });
  const rebuilt = nextStep(tried(WIDE, { instructions, report: { moved: 3 } }));
  assert.deepEqual(rebuilt, { step: 'summarize', line: `built-in compaction on what is left, too much is still in use: ${reportLine(report({ moved: 3 }))}`, of: 'rebuilt' });
});

test('without instructions the oldest messages are cut where src/cut.ts says, and a part that cannot be written falls back to the summary as it would have run (ADR 0019)', () => {
  const nothing = nextStep(tried(WIDE, { report: { tokensAfter: WIDE_TOKENS } }));
  assert.deepEqual(nothing, {
    step: 'cut',
    after: 1,
    at: 8,
    over: false,
    otherwise: { step: 'summarize', line: `built-in compaction: nothing could be moved out (${reportLine(report({ tokensAfter: WIDE_TOKENS }))})`, of: 'given' },
  });
  const some = nextStep(tried(WIDE, { report: { moved: 3, tokensAfter: WIDE_TOKENS } })) as Extract<Step, { step: 'cut' }>;
  assert.equal(some.step, 'cut');
  assert.equal(some.otherwise.of, 'rebuilt');
});

test('under the line once rebuilt, counted from what stays: handed back with nothing cut, said as a cut of nothing', () => {
  const step = nextStep(tried(SMALL, { report: { moved: 3, tokensAfter: 20_000 } }));
  assert.deepEqual(step, { step: 'back', line: cutLine(report({ moved: 3, tokensAfter: 20_000 }), null) });
});

// Without a count, src/cut.ts cuts down to the size it is given whatever is in use (test/cut.test.ts): the steps
// decided before it is asked are told from the steps it would give only there.

test('a compaction that moved results out and did enough is handed back without asking src/cut.ts, which would have cut it', () => {
  const enough = tried(WIDE, { report: { moved: 3, tokensAfter: WIDE_TOKENS }, enough: true, count: undefined });
  assert.equal(nextStep({ ...enough, outcome: { ...enough.outcome, enough: false } }).step, 'cut', 'not enough, the same conversation is cut');
  assert.deepEqual(nextStep(enough), { step: 'back', line: reportLine(report({ moved: 3, tokensAfter: WIDE_TOKENS })) });
});

test('a /compact left undone is decided before src/cut.ts is asked: where it would hand over, and where it would cut (ADR 0015)', () => {
  const asked: Parameters<typeof tried>[1] = { trigger: 'manual', inUse: 30_000, count: undefined, target: 15_000, report: { moved: 0, candidates: 0, tokensAfter: 30_000 } };
  const skip = { step: 'skip', why: `${PLUGIN}: ${undoneLine(30_000, 100_000)}` };
  // One long message: there is no place to cut, and src/cut.ts hands it over.
  assert.equal(nextStep(tried(SMALL, { ...asked, trigger: 'auto' })).step, 'summarize', 'on its own, the same conversation is summarized');
  assert.deepEqual(nextStep(tried(SMALL, asked)), skip);
  // Three turns, cut down to half of what was in use: src/cut.ts cuts it.
  const three = WIDE.slice(0, 6);
  assert.equal(nextStep(tried(three, { ...asked, trigger: 'auto' })).step, 'cut', 'on its own, the same conversation is cut');
  assert.deepEqual(nextStep(tried(three, asked)), skip);
});

test('a cut is made where src/cut.ts says, as it says: the first message with the rest, and past what may stay', () => {
  const heavy: Count = { fixedTokens: 80_000, density: 1 / 3 };
  const pasted: Message[] = [{ role: 'user', text: prose(240_000), toolUses: [] }, { role: 'assistant', text: 'noted', toolUses: [] }, ...talk(5, 9_000)];
  const cases: [string, Message[], Count, (cut: Extract<Step, { step: 'cut' }>) => boolean][] = [
    ['what was pasted first goes too', pasted, COUNT, (cut) => cut.after === 0],
    ['what is not the conversation is over the line by itself', talk(5, 9_000), heavy, (cut) => cut.over],
  ];
  for (const [name, messages, count, holds] of cases) {
    const tokens = Math.round(count.fixedTokens + tokensOf(messages, count));
    const step = nextStep(tried(messages, { count, report: { moved: 3, tokensAfter: tokens } }));
    const decided = decide({ messages, tokens, count, window: 100_000, maxAfterPercent: 75, cutTo: 75_000, keepTokens: 2_000, instructions: undefined });
    assert.ok(step.step === 'cut' && decided.hand === 'back', name);
    assert.deepEqual([step.after, step.at, step.over], [decided.after, decided.at, decided.over], name);
    assert.ok(holds(step), name);
  }
});

test("the settings' defaults are those plugin.json gives them, and a value out of range is the default", () => {
  const manifest = JSON.parse(readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')) as { userConfig: Record<string, { default?: unknown }> };
  const defaults = configFrom({});
  for (const [name, value] of Object.entries(defaults)) assert.equal(value, manifest.userConfig[name]?.default, name);
  assert.deepEqual(configFrom({ keepTokens: -1, minChars: 'many', targetPercent: 100, maxAfterPercent: 0 }), defaults);
  assert.deepEqual(configFrom({ keepTokens: 1500.7, minChars: 0, targetPercent: 1, maxAfterPercent: 100 }), { keepTokens: 1500, minChars: 0, targetPercent: 1, maxAfterPercent: 100 });
});
