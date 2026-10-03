import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digest } from '../src/ask.ts';
import { find, phrasesOf, shown, ticketsIn, type FindInput } from '../src/find.ts';
import { FIND_TOOL, RECALL_TOOL, moveOut, ticketText } from '../src/store.ts';
import type { Http, Message } from '../src/types.ts';
import { MemoryFiles, conversation, ok, output, questionsOf, recordingHttp, type Call, type Sent } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;

const refuse: Http = async () => {
  throw new Error('nothing may be sent in this test');
};

const call = (label: string, lines = 30, tool = 'Bash'): Call => ({
  tool,
  input: tool === 'Bash' ? { command: `show ${label}` } : { file_path: `${label}.md` },
  text: output(label, lines),
});

/**
 * A conversation in which every call's result has been moved out: the store
 * holds the text, and both sides of the call hold the ticket.
 */
async function compacted(files: MemoryFiles, calls: readonly Call[], leave: readonly number[] = []): Promise<Message[]> {
  const messages = conversation(calls);
  for (const [index, entry] of calls.entries()) {
    if (leave.includes(index + 1)) continue;
    const stored = await moveOut(files, DIR, entry.tool, entry.text);
    assert.ok(!('reason' in stored));
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === `toolu_${index + 1}`) use.text = stored.text;
      for (const result of message.toolResults ?? []) if (result.tool_use_id === `toolu_${index + 1}`) result.text = stored.text;
    }
  }
  return messages;
}

function keysOf(sent: Sent): string[] {
  const question = questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined;
  return Object.keys(question?.criteria ?? {});
}

function optionsOf(sent: Sent): string[] {
  const question = questionsOf(sent)['q'] as { criteria?: Record<string, string> } | undefined;
  return Object.values(question?.criteria ?? {});
}

/** An answer giving `winner` probability `p` and the rest an even share. */
function answer(keys: readonly string[], winner: string | null, p = 0.95) {
  const rest = keys.length > 1 ? (winner === null ? 1 : 1 - p) / (winner === null ? keys.length : keys.length - 1) : 1;
  return ok({ answers: { q: { type: 'choice', choice: winner ?? keys[0], probabilities: Object.fromEntries(keys.map((key) => [key, key === winner ? p : rest])) } } });
}

const input = (files: MemoryFiles, messages: Message[], question: unknown, http: Http = refuse, extra: Partial<FindInput> = {}): FindInput => ({
  files,
  dirs: [DIR],
  messages,
  provider: TYPESAFE,
  http,
  question,
  ...extra,
});

test('found: the text of the result Jev picks comes back unchanged, under one line saying which and how likely', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result shows b?', http));

  assert.equal(sent.length, 1);
  const [head, ...body] = text.split('\n\n');
  assert.match(head ?? '', /^\[found\] Bash result, \d+ bytes; id [0-9a-f]{64}; probability 0\.95$/);
  assert.equal(body.join('\n\n'), output('b', 30));
  // What Jev was shown: "none of these", then the call and a digest of each result, never the whole text.
  const shownOptions = optionsOf(sent[0] as Sent);
  assert.equal(shownOptions.length, 4);
  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2', 't3']);
  assert.ok(shownOptions[0]?.startsWith('None of these'));
  assert.ok(shownOptions[2]?.startsWith('Bash called with {"command":"show b"}; '));
  assert.ok(!shownOptions[2]?.includes('b line 20:'));
});

test('not found: when "none of these" wins, no text comes back and the answer says so', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result shows z?', http));

  assert.ok(text.startsWith('[not found] None of the moved-out results seems to be about that'), text);
  assert.ok(!text.includes('line 1:'));
  // Jev sees the start of each result only: the answer says so and how to look further, so that an agent does not stop at it (#38).
  assert.ok(text.includes('first lines') && text.includes('can be missed') && text.includes(`read the results with ${RECALL_TOOL}`), text);
});

test('when "none of these" is among the likeliest but not decisive, the list says so', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 'none', probabilities: { none: 0.4, t1: 0.35, t2: 0.2, t3: 0.05 } } } }),
  );

  const text = await find(input(files, messages, 'Which?', http));

  const lines = text.split('\n');
  assert.equal(lines[0], '[not sure] The likeliest results, most likely first:');
  assert.ok(lines[1]?.includes('show a') && lines[1].includes('probability 0.35'));
  assert.equal(lines.at(-1), '- or none of them; probability 0.40');
});

test('not sure: two results splitting the probability get listed, with their ids, and no text comes back', async () => {
  const files = new MemoryFiles();
  const calls = Array.from({ length: 95 }, (_, i) => call(`step ${i + 1}`));
  const messages = await compacted(files, calls);
  const { http } = recordingHttp((request) => {
    const keys = keysOf(request);
    const probabilities = Object.fromEntries(keys.map((key) => [key, 0]));
    if (keys.includes('t7')) probabilities['t7'] = 0.5;
    if (keys.includes('t8')) probabilities['t8'] = 0.5;
    if (keys.includes('t9')) probabilities['t9'] = 0.001;
    return ok({ answers: { q: { type: 'choice', choice: 't7', probabilities } } });
  });

  const text = await find(input(files, messages, 'Which result shows step 7?', http));

  const lines = text.split('\n');
  assert.equal(lines[0], '[not sure] The likeliest results, most likely first:');
  assert.equal(lines.length, 4);
  assert.ok(lines[1]?.includes('show step 7') && lines[1].includes('probability 0.50'));
  assert.ok(lines[2]?.includes('show step 8') && lines[2].includes('probability 0.50'));
  assert.equal(lines.filter((line) => line.includes(`recall with ${RECALL_TOOL} id `)).length, 3);
  assert.ok(!text.includes('step 7 line 1:'));
});

test('a likeliest result that is not far enough ahead is listed too', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't1', probabilities: { none: 0, t1: 0.55, t2: 0.3, t3: 0.15 } } } }),
  );

  const text = await find(input(files, messages, 'Which?', http));

  assert.ok(text.startsWith('[not sure]'), text);
  // Far enough ahead, but under half: listed as well.
  const under = await compacted(new MemoryFiles(), [call('a'), call('b'), call('c'), call('d'), call('e')]);
  const low = recordingHttp(() =>
    ok({ answers: { q: { type: 'choice', choice: 't1', probabilities: { none: 0, t1: 0.45, t2: 0.15, t3: 0.14, t4: 0.13, t5: 0.13 } } } }),
  );
  assert.ok((await find(input(files, under, 'Which?', low.http))).startsWith('[not sure]'));
});

test('a quoted phrase that one result holds returns that result without asking Jev', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);

  const text = await find(input(files, messages, 'Which result has "c line 17: value" in it?'));

  const [head, ...body] = text.split('\n\n');
  assert.match(head ?? '', /^\[found\] Bash result, \d+ bytes; id [0-9a-f]{64}; matched the quoted phrase "c line 17: value"$/);
  assert.equal(body.join('\n\n'), output('c', 30));
});

test('a quoted phrase that several results hold narrows the choice to them', async () => {
  const files = new MemoryFiles();
  const shared = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), shared]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result has "c line 17: value" and shows d?', http));

  assert.equal(sent.length, 1);
  assert.deepEqual(optionsOf(sent[0] as Sent).map((option) => option.split(';')[0]), [
    'None of these: the result the question is about is not among the moved-out results.',
    'Bash called with {"command":"show c"}',
    'Bash called with {"command":"show d"}',
  ]);
  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith('c line 17: value 3'));
});

test('two quoted phrases narrow to the results that hold both', async () => {
  const files = new MemoryFiles();
  const both = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), both]);

  const text = await find(input(files, messages, 'Which has "c line 17: value" and "d line 3: value"?'));

  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith('c line 17: value 3'));
});

test('a quoted phrase too short to narrow by, or one nothing holds, leaves every result in the choice', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  await find(input(files, messages, 'Which has "c line 17"?', http));
  await find(input(files, messages, 'Which has "nothing holds this line"?', http));
  // An identifier in backticks is not a phrase: c holds it, and the choice is still everyone's.
  await find(input(files, messages, 'Which has `c line 17: value 3`?', http));

  assert.deepEqual(sent.map((request) => keysOf(request).length), [4, 4, 4]);
  assert.deepEqual(phrasesOf('Which "c line 17" or `a phrase of twelve` or "x" or "a phrase of twelve"?'), ['a phrase of twelve']);
});

test("tickets that stand for this plugin's own tools' results, and repeated ids, are not offered", async () => {
  const files = new MemoryFiles();
  const calls = [call('a'), call('b'), call('c')];
  const messages = await compacted(files, calls);
  // A text of its own, so that only the tool's name keeps these out.
  const own = await moveOut(files, DIR, RECALL_TOOL, output('own', 30));
  assert.ok(!('reason' in own));
  const first = ticketsIn(messages)[0];
  assert.ok(first);
  const tickets = [
    ticketText({ tool: RECALL_TOOL, bytes: own.bytes, id: own.id }),
    ticketText({ tool: FIND_TOOL, bytes: own.bytes, id: own.id }),
    `[moved out] recall result, ${own.bytes} bytes; recall with ${RECALL_TOOL} id ${own.id}`,
    `[moved out] find result, ${own.bytes} bytes; recall with ${RECALL_TOOL} id ${own.id}`,
    // What 0.1.0 wrote for its own recall tool, and what 0.2.0 wrote, under the old name.
    `[jev-lossless-compaction] This mcp__jev-lossless-compaction__recall result (${own.bytes} bytes) was moved out of the conversation and is kept unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${own.id}.`,
    `[moved out] recall result, ${own.bytes} bytes; recall with mcp__jev-lossless-compaction__recall id ${own.id}`,
    // A result of another tool that happens to be the same text as a's: the id again.
    ticketText({ tool: 'Bash', bytes: first.bytes, id: first.id }),
  ];
  tickets.forEach((ticket, i) => {
    messages.push({ role: 'assistant', text: '', toolUses: [{ tool_use_id: `toolu_x${i}`, tool: 'Bash', input: {}, text: ticket }] });
    messages.push({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: `toolu_x${i}`, text: ticket, isError: false }] });
  });
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  assert.equal(ticketsIn(messages).length, 3);
  await find(input(files, messages, 'Which?', http));
  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2', 't3']);
});

test('tickets written under the old name, in either wording, are offered and read back from where they were written', async () => {
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const NEW = '/home/u/.claude/lossless-compaction';
  const files = new MemoryFiles();
  const messages = conversation([call('a'), call('b'), call('c')]);
  const wordings = [
    (t: { tool: string; bytes: number; id: string }) => `[moved out] ${t.tool} result, ${t.bytes} bytes; recall with mcp__jev-lossless-compaction__recall id ${t.id}`,
    (t: { tool: string; bytes: number; id: string }) =>
      `[jev-lossless-compaction] This ${t.tool} result (${t.bytes} bytes) was moved out of the conversation and is kept unchanged on disk. To read it, call the tool mcp__jev-lossless-compaction__recall with id ${t.id}.`,
  ];
  for (const [index, label] of ['a', 'b'].entries()) {
    const stored = await moveOut(files, OLD, 'Bash', output(label, 30));
    assert.ok(!('reason' in stored));
    const line = (wordings[index] as (typeof wordings)[number])(stored);
    for (const message of messages) {
      for (const use of message.toolUses) if (use.tool_use_id === `toolu_${index + 1}`) use.text = line;
      for (const result of message.toolResults ?? []) if (result.tool_use_id === `toolu_${index + 1}`) result.text = line;
    }
  }
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  const text = await find(input(files, messages, 'Which result shows b?', http, { dirs: [NEW, OLD] }));

  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2']);
  assert.ok(text.startsWith('[found] Bash result'), text);
  assert.ok(text.endsWith(output('b', 30)));
});

test('with more results than one request takes, one that wins a later request is found', async () => {
  const files = new MemoryFiles();
  const calls = Array.from({ length: 100 }, (_, i) => call(`step ${i + 1}`, 5));
  const messages = await compacted(files, calls);
  const { http, sent } = recordingHttp((request) => {
    const keys = keysOf(request);
    // The first request is flat; the one holding t90 points at it; the last round agrees.
    return answer(keys, keys.includes('t90') ? 't90' : null);
  });

  const text = await find(input(files, messages, 'Which result shows step 90?', http));

  // "none of these" rides in every request and is not carried as a finalist.
  const sizes = sent.map((request) => keysOf(request).length);
  assert.deepEqual(sizes.slice(0, 2), [81, 21]);
  assert.equal(sent.length, 3);
  assert.ok((sizes[2] ?? 0) <= 7, `${sizes[2]} in the last request`);
  const last = keysOf(sent[2] as Sent);
  assert.equal(last.filter((key) => key === 'none').length, 1);
  assert.ok(last.includes('t90'));
  assert.ok(text.startsWith('[found] Bash result'));
  assert.ok(text.endsWith(output('step 90', 5)));
});

test('when Jev cannot be asked, the answer says so by status alone', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b')]);
  const echo = `unauthorized: Bearer ${TYPESAFE.key}`;
  const { http } = recordingHttp(() => ({ status: 401, ok: false, text: echo }));

  const text = await find(input(files, messages, 'Which?', http));

  assert.equal(text, '[lossless-compaction] Jev could not be asked: HTTP 401.');
  const thrown = await find(
    input(files, messages, 'Which?', async () => {
      throw new Error(`down, key ${TYPESAFE.key}`);
    }),
  );
  assert.ok(!thrown.includes(TYPESAFE.key));
  assert.ok(thrown.includes('could not be reached'));
});

test('nothing moved out, a subagent, no key, no question: each is answered without asking anything', async () => {
  const files = new MemoryFiles();
  const kept = conversation([call('a')]);
  const messages = await compacted(files, [call('a')]);

  assert.ok((await find(input(files, kept, 'Which?'))).includes('No ticket of a moved-out result is in this conversation'));
  assert.ok((await find(input(files, messages, 'Which?', refuse, { agentId: 'agent-1' }))).includes("subagent's results"));
  assert.ok((await find(input(files, messages, 'Which?', refuse, { provider: null }))).includes('find needs a Jev key'));
  assert.ok((await find(input(files, messages, undefined))).includes('Ask in words'));
  assert.ok((await find(input(files, messages, '   '))).includes('Ask in words'));
  // A subagent's call reads nothing: the store is not even looked at.
  const looked = files.looked.length;
  await find(input(files, messages, 'Which?', refuse, { agentId: 'agent-1' }));
  assert.equal(files.looked.length, looked);
});

test('a large stored text is digested from its head only, cut at a line, and a key that begins there is blanked to the end', async () => {
  const files = new MemoryFiles();
  const pem = ['-----BEGIN', ' PRIVATE KEY-----'].join('');
  const base64 = 'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='.repeat(2);
  // The key begins about 4 KB in, inside the head, and runs far past the 8 KB the head is cut at.
  const head = [...Array.from({ length: 100 }, (_, i) => `line ${i + 1} ${'y'.repeat(30)}`), pem, base64].join('\n');
  const tail = `${`${base64}\n`.repeat(9000)}-----END PRIVATE KEY-----\n`;
  const large = { tool: 'Bash', input: { command: 'show large' }, text: head + '\n' + tail };
  assert.ok(large.text.length > 256 * 1024);
  const messages = await compacted(files, [large, call('b')]);
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't2'));

  await find(input(files, messages, 'Which?', http));

  const option = optionsOf(sent[0] as Sent)[0] ?? '';
  assert.ok(!option.includes(base64.slice(0, 12)), option);
  assert.ok(!option.includes('BEGIN'), option);
  // What the head holds once blanked: the key from its BEGIN to the end of the head, and nothing of it after.
  const head8k = shown(large.text);
  assert.ok(head8k.length <= 8 * 1024);
  assert.ok(head8k.includes(pem));
  assert.ok(digest(head8k, 20_000).includes('[redacted]'));
  assert.ok(!digest(head8k, 20_000).includes(base64.slice(0, 12)));
  assert.equal(shown(output('small', 10)), output('small', 10));
});

test('a result whose stored text no longer matches its id is not offered, and the others still are', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const damaged = ticketsIn(messages)[1];
  assert.ok(damaged);
  files.files.set(`${DIR}/blobs/${damaged.id}.txt`, 'changed on disk');
  const { http, sent } = recordingHttp((request) => answer(keysOf(request), 't1'));

  const text = await find(input(files, messages, 'Which?', http));

  assert.deepEqual(keysOf(sent[0] as Sent), ['none', 't1', 't2']);
  assert.ok(text.startsWith('[found] Bash result'));
});

test('not found with a quoted phrase: it was looked for in the whole of each result, so the answer says so and not that a value can be missed', async () => {
  const files = new MemoryFiles();
  const messages = await compacted(files, [call('a'), call('b'), call('c')]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result has "z line 99: nothing" in it?', http));

  assert.ok(text.startsWith('[not found] None of the moved-out results holds the quoted phrase as written, looked for in the whole of each'), text);
  assert.ok(!text.includes('can be missed'), text);
});

test('when several results hold the quoted phrase and Jev says none, they are listed rather than said to be none', async () => {
  const files = new MemoryFiles();
  const shared = { tool: 'Bash', input: { command: 'show d' }, text: `${output('d', 30)}\nc line 17: value 3` };
  const messages = await compacted(files, [call('a'), call('b'), call('c'), shared]);
  const { http } = recordingHttp((request) => answer(keysOf(request), 'none', 0.9));

  const text = await find(input(files, messages, 'Which result has "c line 17: value" and shows nothing else?', http));

  assert.ok(text.startsWith('[not sure] The likeliest results, most likely first:'), text);
  assert.equal(text.split('\n').filter((line) => line.includes(`recall with ${RECALL_TOOL} id `)).length, 2, text);
  assert.ok(text.includes('show c') && text.includes('show d'), text);
  assert.match(text, /- or none of them; probability 0\.90$/);
});
