import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LEVELS, ask, batchesFor, digest, inputLine, providerFrom, readScores, redact, requestFor, stateFor } from '../src/ask.ts';
import type { Candidate } from '../src/select.ts';
import { ok, output, questionsOf, recordingHttp } from './helpers.ts';

// Put together here so that no line of this file has the shape of a real credential.
const FAKE = {
  github: ['gh', 'p_', 'a1B2c3D4'.repeat(5)].join(''),
  openai: ['s', 'k-', 'x9Y8z7W6'.repeat(4)].join(''),
  aws: ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join(''),
  jwt: ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJ', 'zdWIiOiIxMjM0NTY3ODkwIn0', '.', 'c2lnbmF0dXJlLWhlcmU'].join(''),
  password: ['hunter2', 'swordfish'].join('-'),
};

const candidate = (position: number, text: string, extra: Partial<Candidate> = {}): Candidate => ({
  id: `toolu_${position}`,
  position,
  tool: 'Bash',
  input: { command: `step ${position}` },
  text,
  superseded: false,
  ...extra,
});

const TYPESAFE = { kind: 'typesafe', key: 'test-key-for-typesafe', model: 'jev-latest' } as const;
const never = () => false;

test('the shapes of secrets are blanked, and ordinary text is left as it is', () => {
  const lines = [
    `GITHUB=${FAKE.github}`,
    `export OPENAI_API_KEY="${FAKE.openai}"`,
    `aws_access_key_id = ${FAKE.aws}`,
    `Authorization: Bearer ${FAKE.jwt}`,
    `db_password: ${FAKE.password}`,
    `postgres://admin:${FAKE.password}@db.internal:5432/app`,
    `https://bucket.example/file?X-Amz-Signature=${'f'.repeat(64)}&other=1`,
    ['-----BEGIN', ' PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END', ' PRIVATE KEY-----'].join(''),
  ];
  const blanked = redact(lines.join('\n'));

  for (const secret of [...Object.values(FAKE), 'f'.repeat(64), 'MIIEvQIBADANBg']) {
    assert.ok(!blanked.includes(secret), `still there: ${secret.slice(0, 6)}...`);
  }
  assert.ok(blanked.includes('db.internal:5432/app'));
  assert.ok(blanked.includes('other=1'));

  const plain = 'test parser > handles nested arrays\n  expected 3 tokens, received 4';
  assert.equal(redact(plain), plain);
});

test('a secret that straddles a cut leaves no piece behind', () => {
  // The line is cut at 200 characters, in the middle of the credential.
  const line = `${'x'.repeat(190)} ${FAKE.github}`;
  const text = [line, ...output('log', 30).split('\n')].join('\n');

  const shown = digest(text);

  for (let at = 0; at + 8 <= FAKE.github.length; at += 1) {
    assert.ok(!shown.includes(FAKE.github.slice(at, at + 8)), `piece at ${at}`);
  }
  // What cutting first would have shown: a piece too short for any shape to match.
  assert.ok(redact(line.slice(0, 200)).includes(FAKE.github.slice(0, 8)));
});

test('a digest keeps the head, the tail and the lines between them that look like failures', () => {
  const lines = output('build', 60).split('\n');
  lines[30] = 'ERROR: migration 0042 failed';

  const shown = digest(lines.join('\n'));

  assert.ok(shown.startsWith('build line 1:'));
  assert.ok(shown.includes('ERROR: migration 0042 failed'));
  assert.ok(shown.includes('build line 60:'));
  assert.ok(!shown.includes('build line 20:'));
  assert.ok(shown.length <= 700);
});

test('the goal is blanked too, and what is asked is the result, not the conversation', () => {
  const state = stateFor(`Deploy with token=${FAKE.password} and fix the parser`);
  const [batch] = batchesFor(state, [candidate(7, output('parser', 80))]);

  assert.ok(!JSON.stringify(state).includes(FAKE.password));
  assert.deepEqual(Object.keys(state), ['task', 'judging']);
  assert.deepEqual(Object.keys(batch ?? {}), ['r7']);
  assert.equal(batch?.['r7']?.type, 'score');
  assert.deepEqual(batch?.['r7']?.criteria, LEVELS);
  assert.ok(batch?.['r7']?.instructions.includes('parser line 1:'));
});

test('questions are grouped so that no request is larger than one may be', () => {
  const state = stateFor('Fix the parser');
  const candidates = Array.from({ length: 300 }, (_, i) => candidate(i + 1, output(`step ${i + 1}`, 80)));

  const batches = batchesFor(state, candidates);

  assert.ok(batches.length > 1);
  assert.equal(batches.reduce((sum, batch) => sum + Object.keys(batch).length, 0), 300);
  for (const batch of batches) {
    assert.ok(JSON.stringify({ state, questions: batch }).length <= 80_000);
  }
});

test('a setting is read before the environment, and each key goes to its own provider only', () => {
  const env = { TYPESAFE_API_KEY: 'from-env-typesafe', CLOUDFLARE_API_TOKEN: 'from-env-cloudflare' };
  const account = 'a'.repeat(32);

  assert.deepEqual(providerFrom({ apiKey: 'from-setting' }, env), {
    kind: 'typesafe',
    key: 'from-setting',
    model: 'jev-latest',
  });
  assert.deepEqual(providerFrom({}, env), { kind: 'typesafe', key: 'from-env-typesafe', model: 'jev-latest' });
  assert.deepEqual(providerFrom({ provider: 'cloudflare', cloudflareAccountId: account }, env), {
    kind: 'cloudflare',
    key: 'from-env-cloudflare',
    accountId: account,
  });
  // No key for the chosen provider: nothing is sent, whatever other keys are around.
  assert.equal(providerFrom({}, { CLOUDFLARE_API_TOKEN: 'from-env-cloudflare' }), null);
  assert.equal(providerFrom({ provider: 'cloudflare', cloudflareAccountId: account }, { TYPESAFE_API_KEY: 'x' }), null);
  assert.equal(providerFrom({ apiKey: '   ' }, {}), null);
});

test("a secret in a call's input is blanked whether a quote stands before it or a field's name", () => {
  const name = ['API', 'KEY'].join('_');
  const value = ['abcd', 'EFGH', '1234', 'secret'].join('');
  // Written as JSON, the quote after `=` becomes `\"`, which the shapes do not expect.
  const quoted = inputLine({ command: `export ${name}="${value}"` });
  const named = inputLine({ [['pass', 'word'].join('')]: value });
  const nested = inputLine({ env: [{ [name]: value }] });

  for (const line of [quoted, named, nested]) {
    assert.ok(!line.includes(value), line);
    assert.ok(line.includes('[redacted]'), line);
  }
  assert.ok(inputLine({ file_path: 'src/parser.ts', limit: 40 }).includes('src/parser.ts'));
});

test('with the key from the settings, the account id is not read from the environment', () => {
  const account = 'a'.repeat(32);

  const fromSettings = providerFrom({ provider: 'cloudflare', apiKey: 'k' }, { CLOUDFLARE_ACCOUNT_ID: account });
  assert.ok(fromSettings !== null && 'error' in fromSettings);
  // With the key from the environment, the account may come from there too.
  assert.deepEqual(providerFrom({ provider: 'cloudflare' }, { CLOUDFLARE_API_TOKEN: 'k', CLOUDFLARE_ACCOUNT_ID: account }), {
    kind: 'cloudflare',
    key: 'k',
    accountId: account,
  });
});

test('a provider that is not one of the two, a key that cannot be a key, a bad account id: all refused', () => {
  for (const settings of [
    { provider: 'https://evil.example/collect', apiKey: 'k' },
    { apiKey: 'two words' },
    { apiKey: 'line\nbreak' },
    { provider: 'cloudflare', apiKey: 'k' },
    { provider: 'cloudflare', apiKey: 'k', cloudflareAccountId: '../../accounts/other' },
  ]) {
    const provider = providerFrom(settings, {});
    assert.ok(provider !== null && 'error' in provider, JSON.stringify(settings));
  }
});

test('the address is fixed per provider, and Workers AI gets its input wrapped', () => {
  const state = stateFor('goal');
  const questions = batchesFor(state, [candidate(1, output('a', 40))])[0] ?? {};

  const direct = requestFor(TYPESAFE, state, questions);
  const wrapped = requestFor({ kind: 'cloudflare', key: 'cf-key', accountId: 'b'.repeat(32) }, state, questions);

  assert.equal(direct.url, 'https://api.typesafe.ai/v1/systemone');
  assert.deepEqual(JSON.parse(direct.body), { model: 'jev-latest', state, questions: JSON.parse(JSON.stringify(questions)) });
  assert.equal(wrapped.url, `https://api.cloudflare.com/client/v4/accounts/${'b'.repeat(32)}/ai/run`);
  assert.deepEqual(Object.keys(JSON.parse(wrapped.body)), ['model', 'input']);
  assert.equal(wrapped.headers.authorization, 'Bearer cf-key');
});

test('only a number on the scale, for a key that was asked, counts as a score', () => {
  const body = JSON.stringify({
    result: {
      state: 'Completed',
      result: {
        answers: {
          r1: { type: 'score', score: 0.4 },
          r2: { type: 'score', score: 3 },
          r3: { type: 'score', score: 3.5 },
          r4: { type: 'score', score: -1 },
          r5: { type: 'score', score: '0' },
          r6: { type: 'score', score: Number.NaN },
          r7: 'not needed again',
          r99: { type: 'score', score: 0 },
        },
      },
    },
  });

  const scores = readScores(body, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'constructor']);

  assert.deepEqual([...scores], [['r1', 0.4], ['r2', 3]]);
  assert.equal(readScores('<html>502</html>', ['r1']).size, 0);
  assert.equal(readScores('{"answers":[]}', ['r1']).size, 0);
});

test('every candidate is asked about once, with the key in the header and nowhere else', async () => {
  const candidates = [candidate(1, output('a', 80)), candidate(2, output('b', 80)), candidate(3, output('c', 80))];
  const { http, sent } = recordingHttp((request) =>
    ok({ answers: Object.fromEntries(Object.keys(questionsOf(request)).map((key, i) => [key, { score: i }])) }),
  );

  const asked = await ask(http, TYPESAFE, 'Fix the parser', candidates, never);

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(sent[0]?.headers['authorization'], `Bearer ${TYPESAFE.key}`);
  assert.ok(!JSON.stringify(sent[0]?.body).includes(TYPESAFE.key));
  assert.deepEqual(Object.keys(questionsOf(sent[0] as never)), ['r1', 'r2', 'r3']);
  assert.deepEqual([...asked.scores], [['toolu_1', 0], ['toolu_2', 1], ['toolu_3', 2]]);
  assert.deepEqual([asked.requests, asked.failed], [1, 0]);
});

test('a request that fails is not sent again', async () => {
  const { http, sent } = recordingHttp(() => ({ status: 503, ok: false, text: 'unavailable' }));

  const asked = await ask(http, TYPESAFE, 'goal', [candidate(1, output('a', 80))], never);

  assert.equal(sent.length, 1);
  assert.equal(asked.scores.size, 0);
  assert.equal(asked.failed, 1);
});

test('a request refused for its size is split in two', async () => {
  const candidates = Array.from({ length: 4 }, (_, i) => candidate(i + 1, output(`step ${i + 1}`, 80)));
  const { http, sent } = recordingHttp((request) => {
    const keys = Object.keys(questionsOf(request));
    return keys.length > 2
      ? { status: 400, ok: false, text: '{"error_type":"max_tokens_exceeded"}' }
      : ok({ answers: Object.fromEntries(keys.map((key) => [key, { score: 1 }])) });
  });

  const asked = await ask(http, TYPESAFE, 'goal', candidates, never);

  assert.deepEqual(sent.map((request) => Object.keys(questionsOf(request)).length), [4, 2, 2]);
  assert.equal(asked.scores.size, 4);
  assert.equal(asked.failed, 0);
});

test('once the asking has expired, nothing more is sent and a late answer is not used', async () => {
  let expired = false;
  // The asking expires when the first answer arrives, not when the first request leaves.
  const { http, sent } = recordingHttp(async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    expired = true;
    return ok({ answers: Object.fromEntries(Object.keys(questionsOf(request)).map((key) => [key, { score: 0 }])) });
  });
  const candidates = Array.from({ length: 2000 }, (_, i) => candidate(i + 1, output(`step ${i + 1}`, 80)));
  const requests = batchesFor(stateFor('goal'), candidates).length;

  const asked = await ask(http, TYPESAFE, 'goal', candidates, () => expired);

  // More requests than may be in flight at once, or stopping would not show.
  assert.ok(requests > 8, `${requests} requests to send`);
  // Eight are in flight when the first answer comes back; none starts after it.
  assert.equal(sent.length, 8);
  assert.equal(asked.scores.size, 0);
});

test('an endpoint that echoes the key back gets it into nothing the caller sees', async () => {
  const echo = `bad request: authorization Bearer ${TYPESAFE.key}`;
  const { http } = recordingHttp((_, count) =>
    count === 1 ? { status: 500, ok: false, text: echo } : { status: 200, ok: true, text: echo },
  );
  const candidates = Array.from({ length: 300 }, (_, i) => candidate(i + 1, output(`step ${i + 1}`, 80)));

  const asked = await ask(http, TYPESAFE, 'goal', candidates, never);

  assert.ok(!JSON.stringify({ ...asked, scores: [...asked.scores] }).includes(TYPESAFE.key));
  assert.equal(asked.scores.size, 0);
});

test('an endpoint that cannot be reached is a failed request, not an exception', async () => {
  const asked = await ask(
    async () => {
      throw new Error(`connect failed with header Bearer ${TYPESAFE.key}`);
    },
    TYPESAFE,
    'goal',
    [candidate(1, output('a', 80))],
    never,
  );

  assert.deepEqual([asked.requests, asked.failed, asked.scores.size], [1, 1, 0]);
});
