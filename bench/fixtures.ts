// The made-up files a trace works on. Every text is computed from small integers,
// so the same trace has the same files wherever it is built, and a question's
// reference answer is computed from the same function as the file it asks about.

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** One line of a station log. `edition` 1 is the file as first read; 2 is the file after it was regenerated. */
export function logLine(log: number, step: number, edition: 1 | 2 = 1): string {
  const station = (step * 7919 + log * 131) % 9973;
  const units = edition === 1 ? (step * 31 + log) % 997 : (step * 37 + log * 5 + 11) % 997;
  return `record ${log}-${pad(step, 4)}: station ${station} reported ${units} units at step ${step}`;
}

/** A station log of `lines` lines: about 58 characters a line. */
export function logFile(log: number, lines: number, edition: 1 | 2 = 1): string {
  return `${Array.from({ length: lines }, (_, i) => logLine(log, i + 1, edition)).join('\n')}\n`;
}

/** One line a report script prints. */
export function reportLine(report: number, batch: number): string {
  const warnings = (batch * 7 + report * 3) % 11;
  const checksum = ((batch * 2654435761 + report * 40503) >>> 0).toString(16).padStart(8, '0');
  return `batch ${pad(batch, 2)}: ${warnings} warnings, checksum ${checksum}`;
}

/** A shell script that prints `batches` report lines and nothing else: its output cannot be had again once it is removed. */
export function reportScript(report: number, batches: number): string {
  return `#!/bin/sh\n${Array.from({ length: batches }, (_, i) => `echo '${reportLine(report, i + 1)}'`).join('\n')}\n`;
}

const SUBJECTS = ['The ingest queue', 'The scheduler', 'The archive tier', 'The audit trail', 'The replay worker', 'The quota service', 'The index builder', 'The export job'];
const VERBS = ['retries', 'batches', 'defers', 'rejects', 'mirrors', 'compacts', 'throttles', 're-reads'];
const OBJECTS = ['late records', 'duplicate keys', 'oversized payloads', 'stale leases', 'partial uploads', 'orphaned parts', 'unsigned requests', 'expired tokens'];
const REASONS = [
  'so that a restart loses nothing',
  'because the downstream store is eventually consistent',
  'until the operator acknowledges the alert',
  'whenever the backlog passes its high-water mark',
  'to keep the nightly window under an hour',
  'since the old path dropped them without a word',
  'as long as the lease is still held',
  'before anything is acknowledged upstream',
];

/** One paragraph of design notes: plain prose, no two alike within a document. */
export function paragraph(doc: number, n: number): string {
  const pick = <T>(list: readonly T[], salt: number) => list[(n * 5 + doc * 3 + salt * 7 + ((n * salt) % 5)) % list.length] as T;
  const sentences = Array.from({ length: 5 }, (_, s) => {
    const k = s + 1;
    return `${pick(SUBJECTS, k)} ${pick(VERBS, k + 2)} ${pick(OBJECTS, k + 4)} ${pick(REASONS, k + 6)}.`;
  });
  return `Note ${doc}.${n}. ${sentences.join(' ')} The limit for this path is ${(n * 17 + doc * 29) % 900 + 100} per minute.`;
}

/** A design document of `paragraphs` paragraphs: about 520 characters each. */
export function proseDoc(doc: number, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, i) => paragraph(doc, i + 1)).join('\n\n');
}

/** A source file of `functions` small functions, each with a distinct constant. */
export function sourceFile(module: number, functions: number): string {
  const body = Array.from({ length: functions }, (_, i) => {
    const n = i + 1;
    const limit = (n * 53 + module * 97) % 4096;
    return [
      `/** Step ${n} of module ${module}: clamps a reading to ${limit}. */`,
      `export function clamp${module}_${n}(reading: number): number {`,
      `  const limit = ${limit};`,
      `  if (!Number.isFinite(reading)) return 0;`,
      `  return reading > limit ? limit : reading < -limit ? -limit : reading;`,
      `}`,
    ].join('\n');
  });
  return `// Module ${module}: readings are clamped per step before they are summed.\n\n${body.join('\n\n')}\n`;
}

/** The limit `clampM_N` clamps to, as `sourceFile` writes it. */
export const clampLimit = (module: number, n: number) => (n * 53 + module * 97) % 4096;

/** A short status file, read again and again while it changes. */
export function statusFile(round: number): string {
  return [`round: ${round}`, `open tickets: ${(round * 13 + 4) % 40}`, `oldest ticket: T-${pad((round * 271) % 9000 + 1000, 4)}`, `on call: operator-${(round * 3) % 7 + 1}`].join('\n') + '\n';
}

/** A small data file a short command reads: its output is under what the plugin moves out. */
export function inventoryFile(shelf: number): string {
  return Array.from({ length: 12 }, (_, i) => `shelf ${shelf} slot ${i + 1}: part P-${pad((shelf * 37 + i * 11) % 1000, 3)} qty ${(shelf * 5 + i * 3) % 50}`).join('\n') + '\n';
}

/** A puzzle that takes working out: its answer is computed here, not asked of anyone. */
export function puzzle(n: number): { ask: string; answer: number } {
  const start = 7 + n * 4;
  const step = 3 + n;
  const count = 40 + n * 5;
  const last = start + step * (count - 1);
  const sum = (count * (start + last)) / 2;
  const removed = Array.from({ length: count }, (_, i) => start + step * i).filter((value) => value % (n + 6) === 0);
  const answer = sum - removed.reduce((a, b) => a + b, 0);
  return {
    ask:
      `Puzzle ${n}. A sequence starts at ${start} and each term is ${step} more than the one before; it has ${count} terms. ` +
      `Remove every term that is divisible by ${n + 6}, then add up what is left. Work it out step by step, checking the removed terms one by one, and end with the line "ANSWER ${n}: <number>".`,
    answer,
  };
}

const JA_SUBJECTS = ['受付の係は', '書庫の担当は', '閲覧室の係は', '目録の担当は', '貸出の窓口は', '予約の係は', '点検の担当は', '案内の係は'];
const JA_OBJECTS = ['返却の遅れた本を', '重複した登録を', '大きすぎる地図を', '古くなった貸出の記録を', '記入の途中の申込書を', '棚の決まっていない本を', '名前の書かれていない申込書を', '期限の過ぎた予約を'];
const JA_VERBS = ['もう一度確かめる', 'まとめて処理する', '後回しにする', '受け取らずに戻す', '写しを取っておく', '並べ直す', '件数を絞る', '読み直す'];
const JA_REASONS = [
  '休館日をはさんでも記録が残るようにするためだ',
  '隣の館の目録がすぐには揃わないからだ',
  '責任者が掲示を確認するまでのあいだだけである',
  '未処理の件数が目安を超えたときに限る',
  '夜の作業を一時間以内に収めるためだ',
  '以前のやり方では記録が残らなかったからだ',
  '貸出がまだ有効なあいだに限る',
  '利用者に受領を伝える前に行う',
];

/** One paragraph of notes on a library's desk in Japanese: about 250 characters, no two alike within a document. */
export function jaParagraph(doc: number, n: number): string {
  const pick = <T>(list: readonly T[], salt: number) => list[(n * 5 + doc * 3 + salt * 7 + ((n * salt) % 5)) % list.length] as T;
  const sentences = Array.from({ length: 5 }, (_, s) => {
    const k = s + 1;
    return `${pick(JA_SUBJECTS, k)}${pick(JA_OBJECTS, k + 4)}${pick(JA_VERBS, k + 2)}。${pick(JA_REASONS, k + 6)}。`;
  });
  return `覚え書き ${doc}.${n}。${sentences.join('')}この窓口の上限は一日 ${((n * 17 + doc * 29) % 900) + 100} 件である。`;
}

/** A design document in Japanese of `paragraphs` paragraphs. */
export function jaDoc(doc: number, paragraphs: number): string {
  return Array.from({ length: paragraphs }, (_, i) => jaParagraph(doc, i + 1)).join('\n\n');
}

/** The same puzzle as `puzzle`, asked in Japanese. */
export function jaPuzzle(n: number): string {
  const start = 7 + n * 4;
  const step = 3 + n;
  const count = 40 + n * 5;
  return (
    `問題 ${n}。初項 ${start}、公差 ${step} の数列が ${count} 項ある。${n + 6} で割り切れる項をすべて取り除き、残りを合計せよ。` +
    `取り除く項を一つずつ確かめながら順に計算し、最後の行を「ANSWER ${n}: <数>」とせよ。`
  );
}

/**
 * Thirteen documents on unrelated subjects, for the conversation whose calls say
 * nothing of what they print (`opaque`). The first two lines say what each is
 * about; the rest is plain prose shared by none of the subjects' words, and none
 * of the words of a station log, so that what a result is about is in its first
 * lines alone.
 */
export const OPAQUE_SUBJECTS = [
  ['Runbook: rotating the signing key used for release builds', 'Who holds the old key, how the new one is made, and how every builder is moved over to it.'],
  ['Incident report: the payment webhook that stopped answering', 'What customers saw while checkout hung, what was found, and what was changed afterwards.'],
  ['How to set up the printer pool on the third floor', 'Drivers, paper trays, the queue that holds jobs overnight, and who to call when it jams.'],
  ['Onboarding a contractor onto the company VPN', 'The request form, the hardware token, the groups a contractor joins, and the day access ends.'],
  ['Why the object storage bill doubled', 'Which buckets grew, what was left behind by old experiments, and what is now cleaned up each week.'],
  ['Moving the team wiki to a new host', 'Exporting pages, keeping old links working, and the weekend the old host was switched off.'],
  ['What to do during a fire drill', 'Where to gather, who sweeps each floor, and what happens to visitors and deliveries meanwhile.'],
  ['Tuning garbage collection on the search service', 'Heap sizes tried, the pauses seen under each, and the settings that were kept.'],
  ['The holiday rota for the support desk', 'Who covers which days over the winter break, how swaps are agreed, and the escalation chain.'],
  ['Post-mortem: a database table deleted by mistake', 'How a cleanup script removed the wrong table, how it was brought back, and the guard added since.'],
  ['How the mobile app delivers push notifications', 'The path from the backend to the phone, the retries, and why some notifications arrive late.'],
  ['Renewing the TLS certificates before they expire', 'Which certificates there are, who is warned and when, and how a renewal is checked.'],
  ['Looking after the coffee machine in the kitchen', 'Descaling, the filter, the beans that are ordered, and the sign to put up when it is broken.'],
] as const;

const PLAIN = [
  'This part was written down so that whoever comes later does not have to ask.',
  'Most of it was learned the slow way, by doing it wrong at the start.',
  'Nobody owns this alone; whoever notices a gap fills it in.',
  'If something here is out of date, change it rather than adding a note beside it.',
  'The order below is the order it is usually done in, though not every time.',
  'A short message to the team before starting saves a long one afterwards.',
  'Anything that cannot be undone is said so where it comes up.',
  'Where a choice was made, the reason is kept next to it.',
  'The earliest attempt took most of an afternoon; it is quicker now.',
  'Questions go to the shared channel, where the answer helps others too.',
  'Some of this is habit more than rule, and is marked as such.',
  'When in doubt, stop and ask; waiting a little costs less than guessing.',
];

/** A reference code only one document holds, for the questions asked by a value. */
export const opaqueCode = (doc: number) => `RX-${pad((doc * 4441) % 9000 + 1000, 4)}-${'KMPTW'[doc % 5]}`;

/** The line a value question is about: one in the middle of a document. */
export const opaqueCodeLine = (doc: number) => `Reference code ${opaqueCode(doc)} was given to this document when it was filed.`;

/** Document `doc` (1 to 13): two lines of what it is about, then about `lines` lines of plain prose. */
export function opaqueDoc(doc: number, lines: number): string {
  const [title, about] = OPAQUE_SUBJECTS[doc - 1] ?? ['', ''];
  const body = Array.from({ length: lines }, (_, i) => {
    const a = PLAIN[(i * 5 + doc) % PLAIN.length];
    const b = PLAIN[(i * 7 + doc * 3 + 1) % PLAIN.length];
    return `${doc}.${pad(i + 1, 3)} ${a} ${b}`;
  });
  body.splice(Math.floor(lines / 2), 0, opaqueCodeLine(doc));
  return `${title}\n${about}\n\n${body.join('\n')}\n`;
}

/** A shell script that prints, by number, each of `outputs` and nothing else: once it is removed, none of them can be had again. */
export function showScript(outputs: readonly string[]): string {
  const cases = outputs.map((text, i) => `${pad(i + 1, 2)}) cat <<'SHOWN'\n${text}SHOWN\n;;`);
  return `#!/bin/sh\ncase "$1" in\n${cases.join('\n')}\n*) echo "no output $1"; exit 1 ;;\nesac\n`;
}
