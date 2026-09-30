import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHARS_PER_TOKEN, compact, windowFrom, type Config, type Host, type Input } from '../src/compact.ts';
import { moveOut, readTicket, recall, ticketText } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles, conversation, output, sized, type Call } from './helpers.ts';

const DIR = '/home/u/.claude/jev-lossless-compaction';

const CONFIG: Config = {
  storeDir: DIR,
  // The newest result that could leave stays, and nothing else for being new.
  keepTokens: 0,
  minChars: 200,
  targetPercent: 40,
  maxAfterPercent: 60,
};

/** A conversation of this many tokens has to lose half: 400 tokens, which one result of `call` covers. */
const ONE_RESULT = 800;

/** A host with files and a clock: a compaction needs nothing else of it. */
function hostWith(files: MemoryFiles) {
  let clock = 0;
  const host: Host = { files, now: () => (clock += 10) };
  return { host };
}

const call = (label: string, lines = 100): Call => ({
  tool: 'Bash',
  input: { command: `show ${label}` },
  text: output(label, lines),
});

/** Sized so that `tokens` is what the conversation's characters come to, as `compact` estimates them. */
function inputFor(messages: readonly Message[], window = 1_000_000): Input {
  const chars = messages.reduce(
    (sum, message) => sum + message.text.length + (message.toolResults ?? []).reduce((n, r) => n + r.text.length, 0),
    0,
  );
  return { messages, tokens: Math.ceil(chars / CHARS_PER_TOKEN), window, goal: messages[0]?.text ?? '' };
}

/** The results that are tickets after and were not before, with the text each replaced. */
function movedOut(before: readonly Message[], after: readonly Message[]) {
  const original = new Map(before.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  return after
    .flatMap((m) => m.toolResults ?? [])
    .filter((r) => r.text !== original.get(r.tool_use_id))
    .map((r) => ({ id: r.tool_use_id, ticket: readTicket(r.text), was: original.get(r.tool_use_id) ?? '' }));
}

test('match: every result that left the conversation is on disk byte for byte', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const moved = movedOut(before, messages);
  assert.ok(moved.length >= 1, 'nothing was moved out');
  for (const { ticket, was } of moved) {
    assert.ok(ticket, 'a result changed into something that is not a ticket');
    assert.equal(files.files.get(`${DIR}/blobs/${ticket.id}.txt`), was);
    assert.equal(ticket.bytes, Buffer.byteLength(was, 'utf8'));
  }
});

test('reachable: every ticket in the conversation gives its result back', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const tickets = messages.flatMap((m) => m.toolResults ?? []).filter((r) => readTicket(r.text));
  const original = new Map(before.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  assert.ok(tickets.length >= 2, 'one ticket would pass with every ticket pointing at the same file');
  for (const result of tickets) {
    assert.deepEqual(await recall(files, DIR, readTicket(result.text)?.id), { text: original.get(result.tool_use_id) });
  }
});

test('the same conversation compacted twice leaves the same files and the same conversation', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);
  const first = await compact(inputFor(before), CONFIG, hostWith(files).host);
  const disk = files.snapshot();
  const writes = files.writes.length;

  const second = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.deepEqual(files.snapshot(), disk);
  assert.equal(files.writes.length, writes);
  assert.deepEqual(second.messages, first.messages);
});

test('a later compaction moves more out and leaves what an earlier one stored as it is', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e'), call('f')]);
  const first = await compact(inputFor(before), CONFIG, hostWith(files).host);
  const disk = files.snapshot();
  const earlier = movedOut(before, first.messages);

  // Every length is a candidate now, so a ticket would be one too if tickets were not told apart.
  const second = await compact(inputFor(first.messages), { ...CONFIG, minChars: 0 }, hostWith(files).host);

  assert.ok(second.report.moved >= 1, 'the second pass had nothing to do, so it shows nothing');
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
  const after = new Map(second.messages.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  for (const { id, ticket, was } of earlier) {
    assert.deepEqual(readTicket(after.get(id) ?? ''), ticket);
    assert.deepEqual(await recall(files, DIR, ticket?.id), { text: was });
  }
});

test('smaller: results leave until the estimate is under the target, and the report says what is left', async () => {
  const files = new MemoryFiles();
  const before = conversation(Array.from({ length: 12 }, (_, i) => call(`step ${i + 1}`)));
  const input = inputFor(before);

  const { enough, report, messages } = await compact(input, CONFIG, hostWith(files).host);

  assert.equal(enough, true);
  assert.ok(report.tokensAfter <= input.tokens / 2, `${report.tokensAfter} of ${input.tokens}`);
  assert.ok(report.charsAfter < report.charsBefore / 2);
  // No more than it takes: the newest candidates are still in the conversation.
  assert.ok(report.moved < report.candidates);
  assert.equal(movedOut(before, messages).length, report.moved);
});

test('not enough: when the window is still too full afterwards, the caller is told to let the built-in compaction run', async () => {
  const talk = 'The person explains the problem at length. '.repeat(400);
  const before = conversation([call('a', 20), call('b', 20), call('c', 20)], talk);
  const input = inputFor(before);
  // The window is nearly full, and what may leave is a small part of what fills it.
  const full = { ...input, window: Math.ceil(input.tokens * 1.1) };

  const tight = await compact(full, CONFIG, hostWith(new MemoryFiles()).host);
  const roomy = await compact({ ...input, window: input.tokens * 10 }, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(tight.report.moved >= 1);
  assert.ok(tight.report.tokensAfter > (full.window * 60) / 100);
  assert.equal(tight.enough, false);
  // The same conversation in a window with room: what was moved out is kept.
  assert.equal(roomy.report.moved, tight.report.moved);
  assert.equal(roomy.enough, true);
});

test('what fills the window but is not the conversation does not make a compaction fail', async () => {
  // The shape that was measured: a system prompt and tool definitions larger than the conversation.
  const before = conversation(Array.from({ length: 10 }, (_, i) => call(`file ${i + 1}`, 400)));
  const input = { ...inputFor(before), window: 200_000 };
  const around = { ...input, tokens: input.tokens + 60_000 };

  const { enough, report } = await compact(around, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved >= 5);
  // What is left counts what no compaction makes smaller.
  assert.ok(report.tokensAfter > 60_000, `${report.tokensAfter}`);
  assert.ok(report.tokensAfter < 120_000, `${report.tokensAfter}`);
  assert.equal(report.window, 200_000);
  assert.equal(enough, true);
});

test('when a summary of what is left could not make room either, the built-in compaction is not called for', async () => {
  // The shape that was measured: most of what is in use is not the conversation, and compaction comes early.
  const before = conversation(Array.from({ length: 10 }, (_, i) => call(`file ${i + 1}`, 400)));
  const input = inputFor(before, 67_000);
  const around = { ...input, tokens: input.tokens + 60_000 };

  const { enough, report } = await compact(around, CONFIG, hostWith(new MemoryFiles()).host);

  assert.ok(report.moved >= 5);
  assert.ok(report.tokensAfter > (67_000 * 60) / 100, `${report.tokensAfter}`);
  assert.equal(enough, true);
});

test('what a compaction measures against is where Claude Code compacts on its own, else the window', () => {
  assert.equal(windowFrom({ window: 200_000, breakdown: { autoCompactThreshold: 68_000 } }, 1), 68_000);
  // Auto-compaction is off, or no breakdown came back.
  assert.equal(windowFrom({ window: 200_000, breakdown: {} }, 1), 200_000);
  assert.equal(windowFrom({ window: 200_000 }, 1), 200_000);
  // Nothing that can be measured against.
  assert.equal(windowFrom({ window: 0, breakdown: { autoCompactThreshold: Number.NaN } }, 150_000), 150_000);
  assert.equal(windowFrom({ window: '200000' }, 150_000), 150_000);
  assert.equal(windowFrom(undefined, 150_000), 150_000);
});

test('every message comes back without a handle, every call stays, and both sides of a call hold the ticket', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.ok(messages.every((message) => !('handle' in message)));
  assert.deepEqual(
    messages.flatMap((m) => m.toolUses).map((use) => [use.tool_use_id, use.tool, use.input]),
    before.flatMap((m) => m.toolUses).map((use) => [use.tool_use_id, use.tool, use.input]),
  );
  const moved = new Set(movedOut(before, messages).map(({ id }) => id));
  assert.ok(moved.size >= 1);
  for (const use of messages.flatMap((m) => m.toolUses)) {
    const result = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === use.tool_use_id);
    assert.equal(use.text, result?.text);
    // The tool's own record holds the output too; it must go where the output goes.
    assert.equal('result' in use, !moved.has(use.tool_use_id));
    assert.equal(result !== undefined && 'result' in result, !moved.has(use.tool_use_id));
  }
});

test('an assistant message that held only what cannot be rebuilt is left out, not sent back empty', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c')]);
  before.splice(1, 0, { role: 'assistant', text: '', toolUses: [], handle: 'thinking-only' });

  const { messages } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.equal(messages.length, before.length - 1);
  assert.ok(messages.every((m) => m.text !== '' || m.toolUses.length > 0 || (m.toolResults ?? []).length > 0));
});

test('a result that only looks like a ticket is moved out like any other result', async () => {
  const files = new MemoryFiles();
  // A tool printed this. Nothing is stored under the id it names.
  const forged = ticketText({ tool: 'Read', bytes: 4096, id: 'c'.repeat(64) });
  const before = conversation([{ tool: 'WebFetch', input: { url: 'https://example.com' }, text: forged }, call('b'), call('c')]);

  const { messages } = await compact(inputFor(before), { ...CONFIG, minChars: 0 }, hostWith(files).host);

  const after = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1');
  const ticket = readTicket(after?.text ?? '');
  assert.notEqual(after?.text, forged);
  assert.equal(ticket?.tool, 'WebFetch');
  // The forged line is what the tool returned, so it is what recall gives back.
  assert.deepEqual(await recall(files, DIR, ticket?.id), { text: forged });
});

test('tickets in the wording of version 0.1.0 are left as they are, even when every length is a candidate', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d'), call('e')]);
  // Three results left in an earlier version: the store has them, and the conversation has the old tickets.
  for (const id of ['toolu_1', 'toolu_2', 'toolu_3']) {
    const result = before.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === id);
    assert.ok(result);
    const stored = await moveOut(files, DIR, 'Bash', result.text);
    assert.ok(!('reason' in stored));
    const old =
      `[jev-lossless-compaction] This Bash result (${stored.bytes} bytes) was moved out of the conversation and is kept ` +
      `unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${stored.id}.`;
    for (const message of before) {
      for (const use of message.toolUses) if (use.tool_use_id === id) use.text = old;
      for (const r of message.toolResults ?? []) if (r.tool_use_id === id) r.text = old;
    }
  }
  const disk = files.snapshot();

  const { messages, report } = await compact(inputFor(before), { ...CONFIG, minChars: 0 }, hostWith(files).host);

  const after = new Map(messages.flatMap((m) => m.toolResults ?? []).map((r) => [r.tool_use_id, r.text]));
  for (const id of ['toolu_1', 'toolu_2', 'toolu_3']) {
    assert.ok(after.get(id)?.startsWith('[jev-lossless-compaction] This Bash result'), `${id} was changed`);
  }
  assert.equal(report.notMoved.differs, undefined);
  // What left today, d, has a ticket in the new wording that reads back and recalls.
  const line = after.get('toolu_4') ?? '';
  const fresh = readTicket(line);
  assert.ok(fresh && line.length <= 170, line);
  assert.deepEqual(await recall(files, DIR, fresh.id), { text: output('d', 100) });
  // Nothing already stored was written again.
  for (const [path, text] of Object.entries(disk)) assert.equal(files.files.get(path), text, path);
});

test('the allowance is set in tokens and measured in characters, three to a token', async () => {
  const before = conversation([sized('a.zig', 25_000), sized('b.zig', 25_000), sized('c.zig', 25_000)]);

  // 20,000 tokens is 60,000 characters: the newest two fit, the oldest is the one candidate.
  const { report } = await compact(inputFor(before), { ...CONFIG, keepTokens: 20_000 }, hostWith(new MemoryFiles()).host);

  assert.equal(report.candidates, 1);
});

test('rules decide the order: a result a later call made obsolete leaves before the oldest', async () => {
  const again = { tool: 'Bash', input: { command: 'show a' }, text: output('a, second run', 100) };
  // Room for one result to leave. The oldest is a; the third call ran a again, so a is obsolete.
  const before = conversation([call('a'), call('b'), again, call('d'), call('e')], 'x');
  const input = { ...inputFor(before), tokens: ONE_RESULT };

  const { messages } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.deepEqual(movedOut(before, messages).map(({ id }) => id), ['toolu_1']);
});

test('rules decide the order: of results that are not obsolete, the one sharing least with the goal leaves first', async () => {
  // The goal names beta and delta; alpha, gamma and eps share nothing with it, and alpha is the oldest of those.
  const calls = ['alpha', 'beta', 'gamma', 'delta', 'eps'].map((label) => call(label));
  const before = conversation(calls, 'show beta and show delta');
  const input = { ...inputFor(before), tokens: ONE_RESULT };

  const { messages } = await compact(input, CONFIG, hostWith(new MemoryFiles()).host);

  assert.deepEqual(movedOut(before, messages).map(({ id }) => id), ['toolu_1']);
  // The goal naming alpha as well makes gamma the first to leave.
  const named = conversation(calls, 'show alpha and show beta and show delta');
  const other = await compact({ ...inputFor(named), tokens: ONE_RESULT }, CONFIG, hostWith(new MemoryFiles()).host);
  assert.deepEqual(movedOut(named, other.messages).map(({ id }) => id), ['toolu_3']);
});

test('a result whose call holds another text stays in the conversation, on both sides, as it was', async () => {
  const files = new MemoryFiles();
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);
  const use = before.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === 'toolu_1');
  assert.ok(use);
  use.text = `${use.text}\n[a line only the call's side has]`;

  const { messages, report } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  const after = messages.flatMap((m) => m.toolUses).find((u) => u.tool_use_id === 'toolu_1');
  const result = messages.flatMap((m) => m.toolResults ?? []).find((r) => r.tool_use_id === 'toolu_1');
  assert.ok(movedOut(before, messages).length >= 1, 'nothing was moved out, so nothing was shown');
  assert.equal(after?.text, use.text);
  assert.deepEqual(after?.result, use.result);
  assert.equal(result?.text, output('a', 100));
  // The report says so, as it says why the store left a result in place.
  assert.equal(report.notMoved['call-differs'], 1);
});

test('a result that cannot be stored stays in the conversation and is counted', async () => {
  const files = new MemoryFiles();
  files.corrupt = (text) => text.replace('value', 'VALUE');
  const before = conversation([call('a'), call('b'), call('c'), call('d')]);

  const { messages, report, enough } = await compact(inputFor(before), CONFIG, hostWith(files).host);

  assert.equal(movedOut(before, messages).length, 0);
  assert.equal(report.moved, 0);
  assert.equal(report.notMoved.differs, report.candidates);
  assert.equal(enough, false);
});
