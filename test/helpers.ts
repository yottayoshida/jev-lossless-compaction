import type { DirEntry, FileStat, Files, Http, HttpResponse, Message } from '../src/types.ts';

/**
 * A file system in memory that behaves as the host's was measured to: a write
 * follows a symbolic link, `stat` reports a link as a link, and a link to
 * nothing is `other`.
 */
export class MemoryFiles implements Files {
  readonly files = new Map<string, string>();
  readonly links = new Map<string, string>();
  readonly dirs = new Set<string>();
  readonly writes: string[] = [];
  /** Every path that was read or looked at, in order. */
  readonly looked: string[] = [];
  /** Set to change what a write stores, as a broken disk would. */
  corrupt: ((text: string) => string) | undefined;

  #real(path: string): string {
    return this.links.get(path) ?? path;
  }

  async read(path: string): Promise<string> {
    this.looked.push(path);
    const text = this.files.get(this.#real(path));
    if (text === undefined) throw new Error(`nothing at ${path}`);
    return text;
  }

  async write(path: string, text: string): Promise<void> {
    this.writes.push(path);
    const real = this.#real(path);
    this.files.set(real, this.corrupt ? this.corrupt(text) : text);
    for (let cut = real.lastIndexOf('/'); cut > 0; cut = real.lastIndexOf('/', cut - 1)) {
      this.dirs.add(real.slice(0, cut));
    }
  }

  async stat(path: string): Promise<FileStat> {
    this.looked.push(path);
    const target = this.links.get(path);
    if (target !== undefined) {
      const text = this.files.get(target);
      return text === undefined
        ? { kind: 'other', size: 0, isLink: true }
        : { kind: 'file', size: text.length, isLink: true };
    }
    const text = this.files.get(path);
    if (text !== undefined) return { kind: 'file', size: text.length, isLink: false };
    if (this.dirs.has(path)) return { kind: 'dir', size: 0, isLink: false };
    throw new Error(`nothing at ${path}`);
  }

  /** When each file was last written, in ms; a file not in it is as old as can be. */
  readonly mtimes = new Map<string, number>();

  /** The entries directly in `path`, as the host's `fs.list` gives them: a link is `other`, not followed. */
  async list(path: string): Promise<DirEntry[]> {
    if (!this.dirs.has(path)) throw new Error(`no directory at ${path}`);
    const names = new Map<string, DirEntry>();
    const child = (full: string) => (full.startsWith(`${path}/`) ? full.slice(path.length + 1).split('/')[0] : undefined);
    for (const full of [...this.files.keys(), ...this.dirs, ...this.links.keys()]) {
      const name = child(full);
      if (name === undefined || names.has(name)) continue;
      const at = `${path}/${name}`;
      const kind = this.links.has(at) ? 'other' : this.files.has(at) ? 'file' : 'dir';
      names.set(name, { name, kind, mtimeMs: this.mtimes.get(at) ?? 0, isLink: this.links.has(at) });
    }
    return [...names.values()];
  }

  /** What is stored, by path, for comparing one state of the disk with another. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files].sort(([a], [b]) => a.localeCompare(b)));
  }
}

export type Sent = { url: string; headers: Record<string, string>; body: unknown };

/** An endpoint that records what it was sent and answers with `answer`. */
export function recordingHttp(answer: (sent: Sent, count: number) => HttpResponse | Promise<HttpResponse>) {
  const sent: Sent[] = [];
  const http: Http = async (url, init) => {
    const request = { url, headers: init.headers, body: JSON.parse(init.body) as unknown };
    sent.push(request);
    return answer(request, sent.length);
  };
  return { http, sent };
}

export const ok = (payload: unknown): HttpResponse => ({ status: 200, ok: true, text: JSON.stringify(payload) });

/** The questions of a request, whichever provider it was built for. */
export function questionsOf(sent: Sent): Record<string, { instructions: string }> {
  const body = sent.body as { questions?: unknown; input?: { questions?: unknown } };
  return (body.questions ?? body.input?.questions ?? {}) as Record<string, { instructions: string }>;
}

export type Call = { tool: string; input: Record<string, unknown>; text: string; isError?: boolean };

/**
 * A conversation as a `session.compact` hook receives it: the person's
 * request, then a call and its result per entry, then the assistant's last
 * word. The result's text sits on both sides of each call, and every message
 * carries a handle.
 */
export function conversation(calls: readonly Call[], request = 'Fix the failing parser test.'): Message[] {
  const messages: Message[] = [{ role: 'user', text: request, toolUses: [], handle: 'h0' }];
  calls.forEach((call, index) => {
    const id = `toolu_${index + 1}`;
    messages.push({
      role: 'assistant',
      text: '',
      toolUses: [
        {
          tool_use_id: id,
          tool: call.tool,
          input: call.input,
          text: call.text,
          result: { stdout: call.text },
          ...(call.isError ? { isError: true as const } : {}),
        },
      ],
      handle: `h${messages.length}`,
    });
    messages.push({
      role: 'user',
      text: '',
      toolUses: [],
      toolResults: [{ tool_use_id: id, text: call.text, isError: call.isError ?? false, result: { stdout: call.text } }],
      handle: `h${messages.length}`,
    });
  });
  messages.push({ role: 'assistant', text: 'Done with that step.', toolUses: [], handle: `h${messages.length}` });
  return messages;
}

/** A Read of `file` whose result is exactly `chars` characters, distinct per file. */
export const sized = (file: string, chars: number): Call => ({
  tool: 'Read',
  input: { file_path: file },
  text: `${file}\n${'x'.repeat(chars - file.length - 1)}`,
});

/** `lines` numbered lines that start with `label`, so two outputs never share text. */
export function output(label: string, lines: number): string {
  return Array.from({ length: lines }, (_, i) => `${label} line ${i + 1}: value ${(i * 7919) % 1000}`).join('\n');
}
