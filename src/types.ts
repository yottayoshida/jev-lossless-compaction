// The shapes this plugin reads from Claude Code, cut down to the fields it uses,
// and the two host services it needs. Nothing here depends on Claude Code's own
// type declarations, so `src/` can be checked and tested without them.

/** One tool_use block of an assistant message. */
export type ToolUse = {
  tool_use_id: string;
  tool: string;
  input: Record<string, unknown>;
  /** The tool's stored record. Holds the output too, so it is dropped with it. */
  result?: unknown;
  /** The result as the model read it. */
  text?: string;
  isError?: true;
};

/** One tool_result block of a user message. */
export type ToolResult = {
  tool_use_id: string;
  text: string;
  isError: boolean;
  result?: unknown;
};

/** One message as a `session.compact` hook receives it. */
export type Message = {
  role: 'user' | 'assistant';
  text: string;
  toolUses: ToolUse[];
  toolResults?: ToolResult[];
  /** Claude Code's own token. A message handed back with it is taken as is. */
  handle?: string;
};

export type FileStat = {
  kind: 'file' | 'dir' | 'other';
  size: number;
  isLink?: boolean;
};

/** The part of the host's file system the store uses. Text is UTF-8. */
export type Files = {
  read(path: string): Promise<string>;
  write(path: string, text: string): Promise<void>;
  /** Rejects when nothing is at the path. */
  stat(path: string): Promise<FileStat>;
};

/** One entry of a directory, as it stands: a link is not followed. */
export type DirEntry = { name: string; kind: 'file' | 'dir' | 'other'; mtimeMs: number; isLink: boolean };

/** Runs a command by its argument vector, no shell; rejects when it cannot be started or runs past `timeoutMs`. */
export type Exec = (
  argv: readonly string[],
  timeoutMs: number,
) => Promise<{ exitCode: number; stdout: string; truncated: boolean }>;

export type HttpResponse = { status: number; ok: boolean; text: string };

export type Http = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<HttpResponse>;
