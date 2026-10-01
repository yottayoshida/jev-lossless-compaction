import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ANY, MARK, ownProcessId } from '../src/mark.ts';
import type { Exec } from '../src/types.ts';

const script = fileURLToPath(new URL('../hooks/notice.sh', import.meta.url));
// macOS runs /bin/sh as bash, Linux as dash: the hook is written for both.
const SHELLS = ['/bin/sh', '/bin/dash'].filter((shell) => existsSync(shell));
const SETTING = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS';
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

type Given = { mark?: string; pid?: string; data?: string | null; input?: string };

// What Claude Code 2.1.286 handed the hooks, written out as it was: the hook reads these
// by their text, so a test input built another way would not say what the hook is given.
const precompact = (trigger: string, session = SESSION): string =>
  `{"session_id":"${session}","transcript_path":"/home/someone/.claude/projects/-work/${session}.jsonl","cwd":"/work","prompt_id":"9e09bc81-93f0-44fa-9d62-a24082c823a5","hook_event_name":"PreCompact","trigger":"${trigger}","custom_instructions":null}`;
const manual = (session = SESSION): string => precompact('manual', session);
const automatic = precompact('auto');
const started = (source: string): string =>
  `{"session_id":"${SESSION}","transcript_path":"/home/someone/.claude/projects/-work/${SESSION}.jsonl","cwd":"/work","hook_event_name":"SessionStart","source":"${source}","model":"claude-haiku-4-5-20251001"}`;

/** One run of the hook. PATH is empty: a command it could only find there would fail the run. */
function run(shell: string, mode: string, given: Given) {
  const env: Record<string, string> = { PATH: '' };
  if (given.mark !== undefined) env[MARK] = given.mark;
  if (given.pid !== undefined) env['CLAUDE_PID'] = given.pid;
  if (typeof given.data === 'string') env['CLAUDE_PLUGIN_DATA'] = given.data;
  const done = spawnSync(shell, [script, mode], { input: given.input ?? manual(), env, encoding: 'utf8' });
  return { status: done.status, stdout: done.stdout, stderr: done.stderr };
}

function withData(body: (data: string, held: string) => void): void {
  const data = mkdtempSync(join(tmpdir(), 'lossless-notice-'));
  try {
    body(data, join(data, 'held'));
  } finally {
    rmSync(data, { recursive: true, force: true });
  }
}

const quiet = { status: 0, stdout: '', stderr: '' };

test('the test runs the hook under a shell', () => {
  assert.ok(SHELLS.length > 0);
});

for (const shell of SHELLS) {
  test(`${shell}: with the mark of this process, or the mark that could not be a number, a /compact is not held and nothing is said`, () => {
    withData((data, held) => {
      assert.deepEqual(run(shell, 'before', { mark: '4242', pid: '4242', data }), quiet);
      assert.deepEqual(run(shell, 'before', { mark: ANY, pid: '4242', data }), quiet);
      assert.deepEqual(run(shell, 'after', { mark: '4242', pid: '4242', data, input: started('compact') }), quiet);
      assert.deepEqual(run(shell, 'after', { mark: ANY, pid: '4242', data, input: started('compact') }), quiet);
      assert.ok(!existsSync(held));
    });
  });

  test(`${shell}: without the mark a /compact is held, says what to change, and writes nothing to stdout; again in that process it goes through`, () => {
    withData((data, held) => {
      const first = run(shell, 'before', { pid: '4242', data });
      assert.equal(first.status, 2);
      // PreCompact's stdout is added to the summary's instructions: it stays empty.
      assert.equal(first.stdout, '');
      assert.match(first.stderr, new RegExp(`"${SETTING}": "1"`));
      assert.match(first.stderr, new RegExp(`claude --resume ${SESSION},`));
      assert.match(first.stderr, /if it is held again, the plugin is still not running/);
      assert.ok(!first.stderr.includes('not held again'), first.stderr);
      assert.match(first.stderr, /run \/compact again in this session/);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n`);
      assert.equal(statSync(held).mode & 0o077, 0, "the file is its owner's alone");

      // The same process again, whatever the conversation: through.
      assert.deepEqual(run(shell, 'before', { pid: '4242', data }), quiet);
      assert.deepEqual(run(shell, 'before', { pid: '4242', data, input: manual(OTHER) }), quiet);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n`);
    });
  });

  test(`${shell}: the conversation reopened is held once more, as the notice says, and goes through in a third process`, () => {
    withData((data, held) => {
      assert.equal(run(shell, 'before', { pid: '4242', data }).status, 2);
      // Reopened after the setting was added: were this let through, a plugin that still
      // does not run would leave the built-in summary to run on the path the notice gave.
      const reopened = run(shell, 'before', { pid: '5555', data });
      assert.equal(reopened.status, 2);
      assert.match(reopened.stderr, /still not running/);
      // The next process goes through, so this notice must not promise to hold again.
      assert.match(reopened.stderr, /This conversation is not held again/);
      assert.ok(!reopened.stderr.includes('if it is held again'), reopened.stderr);
      assert.match(reopened.stderr, /claude --debug/);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n5555 ${SESSION}\n`);
      // A third process: `claude -p --resume … "/compact"` is a new one every time and must not be held for ever.
      assert.deepEqual(run(shell, 'before', { pid: '6666', data }), quiet);
      // Another conversation is held on its own.
      assert.equal(run(shell, 'before', { pid: '6666', data, input: manual(OTHER) }).status, 2);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n5555 ${SESSION}\n6666 ${OTHER}\n`);
    });
  });

  test(`${shell}: a mark that is another process's, inherited by a child, does not count`, () => {
    withData((data) => {
      assert.equal(run(shell, 'before', { mark: '9999', pid: '4242', data }).status, 2);
      assert.equal(run(shell, 'before', { mark: '1', pid: '5151', data, input: manual(OTHER) }).status, 2);
      const after = run(shell, 'after', { mark: '9999', pid: '4242', data, input: started('compact') });
      assert.match(after.stdout, /systemMessage/);
    });
  });

  test(`${shell}: nothing is held when it is not a /compact, when the process cannot be told, or when held cannot be written`, () => {
    withData((data, held) => {
      assert.deepEqual(run(shell, 'before', { pid: '4242', data, input: automatic }), quiet);
      // Without CLAUDE_PID this process cannot be told from its parent: a mark of any value counts, and none holds nothing.
      assert.deepEqual(run(shell, 'before', { data }), quiet);
      assert.deepEqual(run(shell, 'before', { mark: '9999', data }), quiet);
      assert.deepEqual(run(shell, 'before', { pid: '4242', data: null }), quiet);
      assert.deepEqual(run(shell, 'before', { pid: '4242', data: join(data, 'not-there') }), quiet);
      for (const input of ['', 'not json', '{"trigger": "manual"}', '{"trigger":"manual-ish"}']) {
        assert.deepEqual(run(shell, 'before', { pid: '4242', data, input }), quiet, input);
      }
      assert.deepEqual(run(shell, 'elsewhere', { pid: '4242', data }), quiet);
      assert.ok(!existsSync(held));
    });
  });

  test(`${shell}: a held file that cannot be read, or is a link, holds nothing and is left as it is`, () => {
    withData((data, held) => {
      writeFileSync(held, `1111 ${OTHER}\n`);
      chmodSync(held, 0o200);
      // Unreadable, it would say nothing of what was held, and every /compact would be held.
      assert.deepEqual(run(shell, 'before', { pid: '4242', data }), quiet);
      chmodSync(held, 0o600);
      assert.equal(readFileSync(held, 'utf8'), `1111 ${OTHER}\n`);
    });
    withData((data, held) => {
      const elsewhere = join(data, 'elsewhere');
      const fifty = Array.from({ length: 50 }, (_, at) => `${1000 + at} ${OTHER}\n`).join('');
      writeFileSync(elsewhere, fifty);
      symlinkSync(elsewhere, held);
      assert.deepEqual(run(shell, 'before', { pid: '4242', data }), quiet);
      assert.equal(readFileSync(elsewhere, 'utf8'), fifty);
    });
  });

  test(`${shell}: held is one file that starts again past fifty lines, reads a last line without its newline, and takes no session id that is not one`, () => {
    withData((data, held) => {
      writeFileSync(held, Array.from({ length: 50 }, (_, at) => `${1000 + at} ${OTHER}\n`).join(''));
      assert.equal(run(shell, 'before', { pid: '4242', data }).status, 2);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n`);

      const odd = '{"session_id":"x; echo oops $(id)","hook_event_name":"PreCompact","trigger":"manual","custom_instructions":null}';
      const held2 = run(shell, 'before', { pid: '7777', data, input: odd });
      assert.equal(held2.status, 2);
      assert.ok(!held2.stderr.includes('oops'), held2.stderr);
      assert.match(held2.stderr, /claude --resume,/);
      assert.equal(readFileSync(held, 'utf8'), `4242 ${SESSION}\n7777 -\n`);
      // A line without a session counts for no conversation.
      const none = '{"session_id":"-","hook_event_name":"PreCompact","trigger":"manual","custom_instructions":null}';
      assert.equal(run(shell, 'before', { pid: '8888', data, input: none }).status, 2);
      assert.equal(run(shell, 'before', { pid: '9999', data, input: none }).status, 2);
    });
    withData((data, held) => {
      // Cut short, or edited by hand: the last line is still read, and the next is not joined to it.
      writeFileSync(held, `1111 ${OTHER}\n4242 ${SESSION}`);
      assert.deepEqual(run(shell, 'before', { pid: '4242', data }), quiet);
      assert.equal(run(shell, 'before', { pid: '5555', data }).status, 2);
      assert.equal(readFileSync(held, 'utf8'), `1111 ${OTHER}\n4242 ${SESSION}\n5555 ${SESSION}\n`);
    });
  });

  test(`${shell}: after a compaction without the mark, one line says it was Claude Code's own; at startup nothing is said`, () => {
    withData((data) => {
      for (const given of [{ pid: '4242' }, {}]) {
        const said = run(shell, 'after', { ...given, data, input: started('compact') });
        assert.equal(said.status, 0);
        assert.equal(said.stderr, '');
        const message = (JSON.parse(said.stdout) as { systemMessage: string }).systemMessage;
        assert.match(message, /was Claude Code's own summary/);
        assert.match(message, new RegExp(`"${SETTING}": "1"`));
      }
      // At startup the classic hook runs before the module: a missing mark means nothing there.
      for (const source of ['startup', 'resume', 'clear']) {
        assert.deepEqual(run(shell, 'after', { pid: '4242', data, input: started(source) }), quiet, source);
      }
      assert.deepEqual(run(shell, 'after', { mark: '9999', data, input: started('compact') }), quiet);
    });
  });
}

test('the id the mark holds is what a command the plugin starts sees as its parent, and anything else is "any"', async () => {
  const answering =
    (answers: Record<string, { exitCode: number; stdout: string } | Error>): Exec =>
    async (argv) => {
      const answer = answers[argv[0] as string];
      if (answer === undefined || answer instanceof Error) throw answer ?? new Error('ENOENT');
      return { ...answer, truncated: false };
    };
  const places = ['/bin', '/usr/bin'];

  const asked: (readonly string[])[] = [];
  const recorded: Exec = async (argv, timeoutMs) => {
    asked.push([...argv, String(timeoutMs)]);
    return { exitCode: 0, stdout: '4242\n', truncated: false };
  };
  assert.equal(await ownProcessId(recorded, places), '4242');
  // Two seconds each at most: session.start waits for this before the tools are registered.
  assert.deepEqual(asked, [['/bin/sh', '-c', 'echo "$PPID"', '2000']]);

  // The next place when the first cannot be started.
  assert.equal(await ownProcessId(answering({ '/usr/bin/sh': { exitCode: 0, stdout: ' 77 \n' } }), places), '77');
  for (const answer of [
    { exitCode: 0, stdout: '' },
    { exitCode: 0, stdout: 'any' },
    { exitCode: 0, stdout: '0' },
    { exitCode: 0, stdout: '-5' },
    { exitCode: 0, stdout: '12 34' },
    { exitCode: 0, stdout: '12\n34' },
    { exitCode: 1, stdout: '4242' },
  ]) {
    assert.equal(await ownProcessId(answering({ '/bin/sh': answer, '/usr/bin/sh': answer }), places), ANY, JSON.stringify(answer));
  }
  assert.equal(await ownProcessId(answering({}), places), ANY);
  assert.equal(MARK, 'LOSSLESS_COMPACTION_RUNNING');
});

test('the hook file wires the module, the two classic hooks and the name of the mark together', () => {
  const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
  const wiring = JSON.parse(read('../hooks/hooks.json')) as {
    modules: string[];
    hooks: Record<string, { matcher?: string; hooks: { type: string; command: string; timeout?: number }[] }[]>;
  };
  assert.deepEqual(wiring.modules, ['./move-out.ts']);
  assert.deepEqual(Object.keys(wiring.hooks).sort(), ['PreCompact', 'SessionStart']);
  const before = wiring.hooks['PreCompact']?.[0];
  const after = wiring.hooks['SessionStart']?.[0];
  assert.equal(before?.hooks[0]?.command, 'sh "${CLAUDE_PLUGIN_ROOT}/hooks/notice.sh" before');
  assert.equal(after?.hooks[0]?.command, 'sh "${CLAUDE_PLUGIN_ROOT}/hooks/notice.sh" after');
  // Only after a compaction: at startup the classic hook runs before the module has set the mark.
  assert.equal(after?.matcher, 'compact');
  assert.equal(before?.matcher, undefined);

  const module = read('../hooks/move-out.ts');
  // Claude Code reads the variable a module writes off its source, so the name is spelled out there.
  assert.ok(module.includes(`await $.env.set('${MARK}', await ownProcessId(execOf($), PLACES));`), 'the module sets the mark');
  const start = module.slice(module.indexOf("on('session.start'"));
  assert.ok(start.indexOf('await markRunning($);') > 0, 'in session.start');
  assert.ok(start.indexOf('await markRunning($);') < start.indexOf('$.tool.register('), 'before anything else');
  const notice = read('../hooks/notice.sh');
  assert.ok(notice.includes(`\${${MARK}:-}`), 'the classic hook reads the same name');
  assert.ok(notice.includes(`[ "$mark" = ${ANY} ]`), 'and the same word for a mark that is no number');
});
