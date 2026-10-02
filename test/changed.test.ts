import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { COMPARED, MAX_FILE_BYTES, MAX_PATH_CHARS, NAMED, changedLine, changedLines, readChangedLine, readingsIn, sameText, unnumbered } from '../src/changed.ts';
import { KEPT, keepConversation, keepThenSummarize } from '../src/keep.ts';
import { RECALL_TOOL, idOf, moveOut, readPartTicket, recall } from '../src/store.ts';
import type { Message } from '../src/types.ts';
import { MemoryFiles } from './helpers.ts';

const DIR = '/home/u/.claude/lossless-compaction';
const WORK = '/home/u/work';

/** What Claude Code's Read returns for a file's text: each line after its number and a tab. The fixture holds it to the real thing. */
const numbered = (file: string): string =>
  file
    .split('\n')
    .map((line, at) => `${at + 1}\t${line}`)
    .join('\n');

let calls = 0;
/** One call and its result, as the two messages a conversation holds them in. */
function called(tool: string, input: Record<string, unknown>, text: string, isError = false): Message[] {
  calls += 1;
  const id = `toolu_${String(calls).padStart(4, '0')}`;
  return [
    { role: 'assistant', text: '', toolUses: [{ tool_use_id: id, tool, input }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text, isError }] },
  ];
}
const read = (path: string, file: string, more: Record<string, unknown> = {}): Message[] => called('Read', { file_path: path, ...more }, numbered(file));
const said = (text: string): Message => ({ role: 'user', text, toolUses: [] });

const log = (version: number, lines = 30): string => `${Array.from({ length: lines }, (_, i) => `record ${i + 1}: ${(i + 1) * 7 * version} units`).join('\n')}\n`;

type Fixture = { claudeCode: string; files: { name: string; base64: string; result: string | null }[] };
const fixture = JSON.parse(readFileSync(new URL('./fixtures/read/claude-code-2.1.287.json', import.meta.url), 'utf8')) as Fixture;
const fileOfFixture = (name: string) => {
  const one = fixture.files.find((file) => file.name === name);
  assert.ok(one !== undefined && one.result !== null, name);
  return { text: Buffer.from(one.base64, 'base64').toString('utf8'), result: one.result };
};

test('what a real Read returned for a file is, its numbers taken off, the file: no file that did not change is taken for one that did', () => {
  // Read by Claude Code 2.1.287 from files written for it: plain, CRLF, a byte order mark, no line break at the end,
  // tabs at the start of a line and inside one, empty lines, a carriage return inside a line, a line of 2,600 characters.
  const names = ['plain.txt', 'crlf.txt', 'bom.txt', 'noeol.txt', 'tabs.txt', 'blank.txt', 'cr-inside.txt', 'longline.txt'];
  for (const name of names) {
    const { text, result } = fileOfFixture(name);
    const then = unnumbered(result);
    assert.ok(then !== null, `${name}: every line is a number and a tab`);
    assert.equal(sameText(text, then), true, name);
    // The control: one character of the file changed, and it is no longer the same.
    assert.equal(sameText(text.replace('line', 'lime').replace('first', 'fist').replace('one', 'on').replace('short', 'shirt'), then), false, `${name}, changed`);
  }
  // Without leaving the carriage returns and the mark out, these two would be named at every summary.
  assert.notEqual(unnumbered(fileOfFixture('crlf.txt').result), fileOfFixture('crlf.txt').text);
  assert.notEqual(unnumbered(fileOfFixture('bom.txt').result), fileOfFixture('bom.txt').text);
  // A carriage return inside a line is the file's own, and stays.
  assert.ok(unnumbered(fileOfFixture('cr-inside.txt').result)?.includes('one\rtwo'));
  // An empty file is answered with a warning, which is no reading.
  assert.equal(unnumbered(fileOfFixture('empty.txt').result), null);
  // What the tests below build as a Read result is what the real one is.
  assert.equal(numbered(fileOfFixture('plain.txt').text), fileOfFixture('plain.txt').result);
  assert.equal(numbered(fileOfFixture('noeol.txt').text), fileOfFixture('noeol.txt').result);
});

test('a result is numbered lines throughout, or it is no reading', () => {
  assert.equal(unnumbered('1\tone\n2\ttwo\n3\t'), 'one\ntwo\n');
  assert.equal(unnumbered('1\t\tbegins with a tab'), '\tbegins with a tab');
  assert.equal(unnumbered('1\tone\ntwo'), null);
  assert.equal(unnumbered('File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current.'), null);
  assert.equal(unnumbered('1\tone\n\n[Truncated: PARTIAL view]'), null);
  assert.equal(unnumbered('     1→one'), null);
  assert.equal(unnumbered(''), null);
});

test('the line names a path and an id, and is read back as it was written', () => {
  const id = 'a'.repeat(64);
  const line = changedLine(`${WORK}/notes v2. If it.md`, id);
  assert.ok(line.includes(`${RECALL_TOOL} id ${id}`));
  assert.deepEqual(readChangedLine(line), { path: `${WORK}/notes v2. If it.md`, id });
  assert.equal(readChangedLine(`${line} `), null);
  assert.equal(readChangedLine(line.replace(id, 'a'.repeat(63))), null);
  assert.equal(readChangedLine(line.replace(id, 'g'.repeat(64))), null);
  assert.equal(readChangedLine(changedLine('', id)), null);
  assert.equal(readChangedLine(`[moved out] Read result, 10 bytes; recall with ${RECALL_TOOL} id ${id}`), null);
});

test('the reading of a file is its last whole Read that returned its lines, newest file first', () => {
  const a = `${WORK}/a.log`;
  const b = `${WORK}/b.log`;
  const messages = [said('go'), ...read(a, log(1)), ...read(b, log(1)), ...read(a, log(2))];
  assert.deepEqual(readingsIn(messages), [
    { path: a, text: numbered(log(2)) },
    { path: b, text: numbered(log(1)) },
  ]);

  // A second Read of a file Claude Code answers without its lines: the reading is still the first.
  const again = [...read(a, log(1)), ...called('Read', { file_path: a }, 'File unchanged since last read. The content from the earlier Read tool_result in this conversation is still current.')];
  assert.deepEqual(readingsIn(again), [{ path: a, text: numbered(log(1)) }]);

  // Part of a file, a page of one, and a Read that failed are no reading of the file.
  for (const more of [{ offset: 10 }, { limit: 5 }, { pages: '1-2' }]) assert.deepEqual(readingsIn(read(a, log(1), more)), [], JSON.stringify(more));
  assert.deepEqual(readingsIn(called('Read', { file_path: a }, numbered(log(1)), true)), []);
  // A call that is not a Read, whether or not it names a file, and a Read without a path.
  assert.deepEqual(readingsIn([...called('Bash', { command: `cat ${a}` }, numbered(log(1))), ...called('Read', {}, numbered(log(1)))]), []);
  assert.deepEqual(readingsIn(called('mcp__editor__open', { file_path: a }, numbered(log(1)))), []);
});

test('a file the conversation wrote to after reading it is not a reading: the agent changed it itself', () => {
  const a = `${WORK}/a.ts`;
  for (const tool of ['Edit', 'Write', 'MultiEdit']) {
    assert.deepEqual(readingsIn([...read(a, log(1)), ...called(tool, { file_path: a }, 'done')]), [], tool);
  }
  assert.deepEqual(readingsIn([...read(`${WORK}/n.ipynb`, log(1)), ...called('NotebookEdit', { notebook_path: `${WORK}/n.ipynb` }, 'done')]), []);
  // A write that failed or was refused changed nothing: the reading stands, and the file is still set against it.
  for (const tool of ['Edit', 'Write']) {
    assert.deepEqual(readingsIn([...read(a, log(1)), ...called(tool, { file_path: a }, 'File has been modified since read', true)]), [{ path: a, text: numbered(log(1)) }], tool);
  }
  // Written to and then read: what was read is a reading. Another file written to changes nothing.
  assert.deepEqual(readingsIn([...called('Write', { file_path: a }, 'done'), ...read(a, log(2))]), [{ path: a, text: numbered(log(2)) }]);
  assert.deepEqual(readingsIn([...read(a, log(1)), ...called('Edit', { file_path: `${WORK}/b.ts` }, 'done')]), [{ path: a, text: numbered(log(1)) }]);
});

test('a reading moved out earlier is known by its ticket, and one named after an earlier summary by its line', async () => {
  const files = new MemoryFiles();
  const a = `${WORK}/a.log`;
  const b = `${WORK}/b.log`;
  const moved = await moveOut(files, DIR, 'Read', numbered(log(1)));
  assert.ok('id' in moved);
  assert.deepEqual(readingsIn(called('Read', { file_path: a }, moved.text)), [{ path: a, id: moved.id }]);

  const id = 'b'.repeat(64);
  const after = said(`${KEPT}, in 1 part; recall a part by its id.\n${changedLine(b, id)}`);
  assert.deepEqual(readingsIn([after]), [{ path: b, id }]);
  // Read again since: the newer reading. Written to since: none.
  assert.deepEqual(readingsIn([after, ...read(b, log(3))]), [{ path: b, text: numbered(log(3)) }]);
  assert.deepEqual(readingsIn([after, ...called('Edit', { file_path: b }, 'done')]), []);
  // What the host puts into that turn in front of the plugin's message does not hide it.
  assert.deepEqual(readingsIn([said(`<system-reminder>\nToday is a new day.\n</system-reminder>\n\n${after.text}`)]), [{ path: b, id }]);
  // The line counts in the plugin's own message and in no other: pasted by the person, or in what the host puts in
  // a turn, it names no file the plugin will look at.
  assert.deepEqual(readingsIn([said(`<system-reminder>\n${after.text}\n</system-reminder>`)]), []);
  assert.deepEqual(readingsIn([said(`here is what it said earlier:\n${changedLine(b, id)}`)]), []);
  assert.deepEqual(readingsIn([said(`<task-notification>\n${changedLine(b, id)}\n</task-notification>`)]), []);
  assert.deepEqual(readingsIn([said(changedLine(b, id))]), []);
  // The same words in what the model said, or inside a result, are not the plugin's line.
  assert.deepEqual(readingsIn([{ role: 'assistant', text: after.text, toolUses: [] }]), []);
  assert.deepEqual(readingsIn([{ ...after, toolResults: [{ tool_use_id: 'toolu_none', text: 'x', isError: false }] }]), []);
  assert.deepEqual(readingsIn([{ role: 'assistant', text: changedLine(b, id), toolUses: [] }]), []);
  assert.deepEqual(readingsIn(called('Bash', { command: 'cat notes' }, changedLine(b, id))), []);
});

test('a file that is no longer what was read is named with the id its reading comes back by, and one that is, is not', async () => {
  const files = new MemoryFiles();
  const changed = `${WORK}/changing.log`;
  const same = `${WORK}/kept.log`;
  const crlf = `${WORK}/windows.txt`;
  files.files.set(changed, log(2));
  files.files.set(same, log(1));
  files.files.set(crlf, 'one\r\ntwo\r\n');
  const messages = [said('go'), ...read(changed, log(1)), ...read(same, log(1)), ...read(crlf, 'one\ntwo\n')];

  const lines = await changedLines(files, DIR, [DIR], messages);

  const id = await idOf(numbered(log(1)));
  assert.deepEqual(lines, [changedLine(changed, id)]);
  assert.deepEqual(await recall(files, [DIR], id), { text: numbered(log(1)) });
  // Nothing but the store was written to.
  assert.ok(files.writes.every((path) => path.startsWith(`${DIR}/`)), files.writes.join(' '));
  assert.equal(files.files.get(changed), log(2));
});

test('a reading too short to be stored on its own is stored to be named, and one already moved out is read from where it is', async () => {
  const files = new MemoryFiles();
  const short = `${WORK}/status.txt`;
  files.files.set(short, 'round: 6\n');
  const lines = await changedLines(files, DIR, [DIR], read(short, 'round: 5\n'));
  const id = await idOf(numbered('round: 5\n'));
  assert.deepEqual(lines, [changedLine(short, id)]);
  assert.deepEqual(await recall(files, [DIR], id), { text: numbered('round: 5\n') });

  // Moved out by an earlier compaction, into the place of an older version: read from there, and named by that id.
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const moved = await moveOut(files, OLD, 'Read', numbered(log(1)));
  assert.ok('id' in moved);
  const a = `${WORK}/a.log`;
  files.files.set(a, log(2));
  assert.deepEqual(await changedLines(files, DIR, [DIR, OLD], called('Read', { file_path: a }, moved.text)), [changedLine(a, moved.id)]);
  // The control: the file as it was read, and nothing is named; a place the reading is not in, and nothing is named.
  files.files.set(a, log(1));
  assert.deepEqual(await changedLines(files, DIR, [DIR, OLD], called('Read', { file_path: a }, moved.text)), []);
  files.files.set(a, log(2));
  assert.deepEqual(await changedLines(files, DIR, [DIR], called('Read', { file_path: a }, moved.text)), []);
  // What a ticket stands for is not a reading when it is not numbered lines.
  const other = await moveOut(files, DIR, 'Read', 'not the lines of a file');
  assert.ok('id' in other);
  assert.deepEqual(await changedLines(files, DIR, [DIR], called('Read', { file_path: a }, other.text)), []);
});

test('a file that cannot be set against its reading is not named', async () => {
  const files = new MemoryFiles();
  const gone = `${WORK}/gone.log`;
  const linked = `${WORK}/link.log`;
  const dir = `${WORK}/dir`;
  const large = `${WORK}/large.log`;
  const odd = `${WORK}/two\nlines.log`;
  files.files.set(`${WORK}/target.log`, log(2));
  files.links.set(linked, `${WORK}/target.log`);
  files.dirs.add(dir);
  files.files.set(large, 'x'.repeat(MAX_FILE_BYTES + 1));
  files.files.set(odd, log(2));
  const messages = [gone, linked, dir, large, odd].flatMap((path) => read(path, log(1)));

  assert.deepEqual(await changedLines(files, DIR, [DIR], messages), []);
  // Each was looked at once and none was read: a link, a directory and a file too large are told by that look.
  for (const path of [linked, dir, large]) assert.equal(files.looked.filter((one) => one === path).length, 1, path);
  // The controls: at the limit a file is read and named, and the link's target, read by its own path, is named.
  files.files.set(large, 'x'.repeat(MAX_FILE_BYTES));
  assert.equal((await changedLines(files, DIR, [DIR], read(large, log(1)))).length, 1);
  assert.equal((await changedLines(files, DIR, [DIR], read(`${WORK}/target.log`, log(1)))).length, 1);
});

test('the newest twenty files are set against their readings, ten are named, and the rest are counted', async () => {
  const files = new MemoryFiles();
  const paths = Array.from({ length: COMPARED + 5 }, (_, i) => `${WORK}/f${String(i + 1).padStart(2, '0')}.log`);
  for (const path of paths) files.files.set(path, log(2));
  const messages = paths.flatMap((path) => read(path, log(1)));

  const lines = await changedLines(files, DIR, [DIR], messages);

  const newest = [...paths].reverse();
  assert.deepEqual(lines.slice(0, NAMED).map((line) => readChangedLine(line)?.path), newest.slice(0, NAMED));
  assert.deepEqual(lines.slice(NAMED), [`${COMPARED - NAMED} more of the files read in the conversation have changed on disk as well.`]);
  // The five oldest were not looked at.
  for (const path of paths.slice(0, 5)) assert.ok(!files.looked.includes(path), path);
  assert.ok(files.looked.includes(paths[5] as string));

  // One over the ten is said in the singular.
  const eleven = paths.slice(0, NAMED + 1).flatMap((path) => read(path, log(1)));
  assert.equal((await changedLines(files, DIR, [DIR], eleven)).at(-1), '1 more of the files read in the conversation has changed on disk as well.');
});

test('the message after a summary names the changed file under the parts, and names it again at the next summary while it differs', async () => {
  const files = new MemoryFiles();
  const changed = `${WORK}/changing.log`;
  const same = `${WORK}/kept.log`;
  files.files.set(changed, log(2));
  files.files.set(same, log(1));
  const first = [said('go'), ...read(changed, log(1)), ...read(same, log(1)), said('noted')];

  const done = await keepConversation(files, DIR, first);

  assert.ok('text' in done);
  const id = await idOf(numbered(log(1)));
  const lines = done.text.split('\n');
  assert.equal(lines[0], `${KEPT}, in 1 part; recall a part by its id.`);
  assert.ok(readPartTicket(lines[1] as string) !== null);
  assert.deepEqual(lines.slice(2), [changedLine(changed, id)]);

  // The next summary: the Read is in a part by now, and the line is what is left of it in the conversation.
  const second = [said('summary of the first'), said(done.text), said('carry on'), ...read(same, log(1))];
  const next = await keepConversation(files, DIR, second);
  assert.ok('text' in next);
  assert.deepEqual(next.text.split('\n').filter((line) => readChangedLine(line) !== null), [changedLine(changed, id)]);
  // Back to what was read: no longer named.
  files.files.set(changed, log(1));
  const back = await keepConversation(files, DIR, second);
  assert.ok('text' in back);
  assert.deepEqual(back.text.split('\n').filter((line) => readChangedLine(line) !== null), []);
});

test('nothing read, or nothing changed, leaves the message after a summary as it was', async () => {
  const files = new MemoryFiles();
  const same = `${WORK}/kept.log`;
  files.files.set(same, log(1));
  for (const messages of [[said('go'), said('noted')], [said('go'), ...read(same, log(1))]]) {
    const done = await keepConversation(files, DIR, messages);
    assert.ok('text' in done);
    const lines = done.text.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(readPartTicket(lines[1] as string) !== null);
  }
});

test('before a summary, a reading moved out to the place of an older version is found, and the line stands in the message after the summary', async () => {
  const files = new MemoryFiles();
  const OLD = '/home/u/.claude/jev-lossless-compaction';
  const a = `${WORK}/a.log`;
  const moved = await moveOut(files, OLD, 'Read', numbered(log(1)));
  assert.ok('id' in moved);
  files.files.set(a, log(2));
  const messages = [said('go'), ...called('Read', { file_path: a }, moved.text), said('noted')];
  type Result = { messages?: readonly Message[]; skip?: string };
  const summarize = async (): Promise<Result> => ({ messages: [said('the summary')] });
  const skip = (why: string): Result => ({ skip: why });

  const kept = await keepThenSummarize(files, { dir: DIR, read: [DIR, OLD], messages }, () => {}, summarize, skip);

  assert.ok(kept.messages !== undefined);
  const after = kept.messages[1] as Message;
  assert.equal(after.role, 'user');
  assert.deepEqual(after.text.split('\n').filter((line) => readChangedLine(line) !== null), [changedLine(a, moved.id)]);
  // The control: without the older place to read from, the reading cannot be had and nothing is named.
  const blind = await keepThenSummarize(files, { dir: DIR, messages }, () => {}, summarize, skip);
  assert.ok(blind.messages !== undefined);
  assert.deepEqual((blind.messages[1] as Message).text.split('\n').filter((line) => readChangedLine(line) !== null), []);
});

test('a path unfit for a line, a path too long for it, and a file that does not read as text are not named', async () => {
  const files = new MemoryFiles();
  const tabbed = `${WORK}/a\tb.log`;
  // A next-line character, a line separator, and a mark that turns the direction of text.
  const unfit = [0x85, 0x2028, 0x202e].map((code) => `${WORK}/a${String.fromCharCode(code)}b.log`);
  const long = `${WORK}/${'d'.repeat(MAX_PATH_CHARS)}.log`;
  const fits = `${WORK}/${'d'.repeat(MAX_PATH_CHARS - WORK.length - 5)}.log`;
  assert.equal(fits.length, MAX_PATH_CHARS);
  for (const path of [tabbed, ...unfit, long, fits]) files.files.set(path, log(2));
  // As a file in UTF-16 reads when it is read as UTF-8: with the character that stands for what could not be read, or a NUL.
  const replaced = `${WORK}/utf16-a.txt`;
  const nul = `${WORK}/utf16-b.txt`;
  files.files.set(replaced, `one${String.fromCharCode(0xfffd)}two\n`);
  files.files.set(nul, `o${String.fromCharCode(0)}n${String.fromCharCode(0)}e\n`);

  const lines = await changedLines(files, DIR, [DIR], [tabbed, ...unfit, long, fits, replaced, nul].flatMap((path) => read(path, log(1))));

  // The control is the path of exactly the length allowed: named, where one a character longer is not.
  assert.deepEqual(lines.map((line) => readChangedLine(line)?.path), [fits]);
});

test('a conversation that cannot be read for its readings names nothing and throws nothing', async () => {
  const files = new MemoryFiles();
  const a = `${WORK}/a.log`;
  files.files.set(a, log(2));
  const broken = { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_x', tool: 'Read', input: null }] } as unknown as Message;
  assert.deepEqual(await changedLines(files, DIR, [DIR], [...read(a, log(1)), broken]), []);
  // The control: without the broken message the file is named.
  assert.equal((await changedLines(files, DIR, [DIR], read(a, log(1)))).length, 1);
});

