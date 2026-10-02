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
