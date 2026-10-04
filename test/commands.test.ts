import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PLACES, firstOf, forgetMove, moverOf } from '../src/commands.ts';
import type { FileStat } from '../src/types.ts';

/** A host whose commands start only from `places`, each answering with `exit`; what was started is recorded. */
function host(places: readonly string[], exit: (argv: readonly string[]) => number = () => 0) {
  const started: string[][] = [];
  const start = async (argv: readonly string[]) => {
    if (!places.some((place) => argv[0]?.startsWith(`${place}/`))) throw new Error(`cannot start ${argv[0]}`);
    started.push([...argv]);
    return { exitCode: exit(argv) };
  };
  return { start, started };
}

const file: FileStat = { kind: 'file', size: 1 };
const dir: FileStat = { kind: 'dir', size: 0 };

test('a command is run from /bin, else /usr/bin, never by a bare name; neither is null, and an exit code is no reason to try the next', async () => {
  assert.deepEqual(PLACES, ['/bin', '/usr/bin']);
  const both = host(['/bin', '/usr/bin'], () => 2);
  assert.deepEqual(await firstOf(both.start, 'mv', ['-n', 'a']), { exitCode: 2 });
  assert.deepEqual(both.started, [['/bin/mv', '-n', 'a']], 'started once, from /bin, though it failed');
  const nix = host(['/usr/bin']);
  assert.deepEqual(await firstOf(nix.start, 'rm', ['-f']), { exitCode: 0 });
  assert.deepEqual(nix.started, [['/usr/bin/rm', '-f']]);
  assert.equal(await firstOf(host([]).start, 'mv', []), null);
});

test('mv is known to start once it has, never that it does not; a rename ends with a file at the name, or is taken back', async () => {
  forgetMove();
  assert.equal(await moverOf(host([]).start, async () => file).available(), false);
  const ok = host(['/bin']);
  assert.equal(await moverOf(ok.start, async () => file).available(), true);
  assert.deepEqual(ok.started, [['/bin/mv']], 'started with no operand: it prints its usage only');
  // Known now: asked again, nothing is started, and a host where it cannot start is not asked.
  assert.equal(await moverOf(host([]).start, async () => file).available(), true);

  const moving = host(['/bin']);
  assert.equal(await moverOf(moving.start, async () => file).rename('/s/tmp/x.1.part', '/s/blobs/x.txt'), true);
  assert.deepEqual(moving.started, [['/bin/mv', '-f', '--', '/s/tmp/x.1.part', '/s/blobs/x.txt']]);
  // A directory at the name takes the file inside it and mv still exits 0: the file is taken out again.
  const into = host(['/bin']);
  assert.equal(await moverOf(into.start, async () => dir).rename('/s/tmp/x.1.part', '/s/blobs/x.txt'), false);
  assert.deepEqual(into.started[1], ['/bin/rm', '-f', '--', '/s/blobs/x.txt/x.1.part']);
  // A link at the name, nothing there, or mv failing is no rename.
  assert.equal(await moverOf(host(['/bin']).start, async () => ({ ...file, isLink: true })).rename('/a', '/b'), false);
  assert.equal(await moverOf(host(['/bin']).start, async () => Promise.reject(new Error('gone'))).rename('/a', '/b'), false);
  assert.equal(await moverOf(host(['/bin'], () => 1).start, async () => file).rename('/a', '/b'), false);

  const other = host(['/bin']);
  const mover = moverOf(other.start, async () => file);
  await mover.makeDir('/s/tmp');
  await mover.remove('/s/tmp/x.1.part');
  assert.deepEqual(other.started, [['/bin/mkdir', '-p', '--', '/s/tmp'], ['/bin/rm', '-f', '--', '/s/tmp/x.1.part']]);
  forgetMove();
});
