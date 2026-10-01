// The wiring: Claude Code's events on one side, `src/` on the other.
// Everything that decides something lives in `src/`.
//
// Claude Code reads which host calls a plugin makes from this file, so `$` is
// only ever handed to a function declared at the top of it, and every host call
// is spelled out as `$.noun.verb(...)`.

import type { PluginOptions, Register } from 'claude-code';

import { providerFrom, type Provider } from '../src/ask.ts';
import {
  CHARS_PER_TOKEN,
  charsOf,
  compact,
  windowFrom,
  type Config,
  type Context,
  type Host,
  type Outcome,
  type Report,
} from '../src/compact.ts';
import { find } from '../src/find.ts';
import { closeStore, type Run } from '../src/private.ts';
import { goalOf, whyNotRebuilt } from '../src/select.ts';
import { FIND, PLUGIN, RECALL, placesOf, recall, type StoreDirs } from '../src/store.ts';
import { describeTaints, placeTaints, sendTaints, taintsFrom, type RepoSettings, type Seen, type Taint } from '../src/trust.ts';
import type { FileStat, Files, HttpResponse, Message } from '../src/types.ts';

const FALLBACK_WINDOW = 200_000;

type WithUi = { ui: { log: (text: string) => void; toast: (text: string) => void } };
type WithEnv = { env: { get: (name: string) => Promise<string | undefined> } };
type WithFiles = {
  fs: {
    read: (path: string) => Promise<string>;
    write: (path: string, text: string) => Promise<void>;
    stat: (path: string) => Promise<FileStat>;
  };
};
type WithHttp = {
  http: {
    fetch: (
      url: string,
      init: { method: string; headers: Record<string, string>; body: string },
    ) => Promise<HttpResponse>;
  };
  clock: { sleep: (ms: number, options: { signal: AbortSignal }) => Promise<void> };
};
type WithProcess = { process: { run: (argv: readonly string[], init: { timeoutMs: number }) => Promise<{ exitCode: number }> } };
type WithSettings = { settings: { read: (args: { source: 'project' | 'local' | 'user' }) => Promise<unknown> } };
type WithSession = {
  session: {
    messages: (args?: { as: 'api' }) => Promise<unknown>;
    usage: (args: { breakdown: 'summary' }) => Promise<{ context?: (Context & { tokens?: unknown }) | undefined }>;
  };
};
type Compacting = { messages: readonly unknown[]; instructions?: string | undefined };

function say($: WithUi, text: string): void {
  try {
    $.ui.log(`${PLUGIN}: ${text}`);
    $.ui.toast(`${PLUGIN}: ${text}`);
  } catch {
    // A surface that cannot show it must not change what the plugin does.
  }
}

function filesOf($: WithFiles): Files {
  return {
    read: (path) => $.fs.read(path),
    write: (path, text) => $.fs.write(path, text),
    stat: (path) => $.fs.stat(path),
  };
}

function runOf($: WithProcess): Run {
  return async (argv) => ({ exitCode: (await $.process.run(argv, { timeoutMs: 10_000 })).exitCode });
}

/** The directory written to, made or closed to its owner alone, else why not; the others read from, closed where they can be. */
async function privateOf($: WithUi & WithFiles & WithProcess, store: StoreDirs): Promise<string | null> {
  const { refused, warnings } = await closeStore(filesOf($), runOf($), store);
  for (const warning of warnings) say($, `a directory results are read from could not be made private: ${warning}`);
  return refused === null ? null : `the place results are kept in cannot be made private: ${refused}`;
}

function hostOf($: WithFiles): Host {
  return { files: filesOf($), now: () => Date.now() };
}

// Each name spelled out: Claude Code reads which variables a module reads off its source.
async function envOf($: WithEnv): Promise<Seen['env']> {
  return {
    HOME: await $.env.get('HOME'),
    USERPROFILE: await $.env.get('USERPROFILE'),
    CLAUDE_CONFIG_DIR: await $.env.get('CLAUDE_CONFIG_DIR'),
    TYPESAFE_API_KEY: await $.env.get('TYPESAFE_API_KEY'),
    CLOUDFLARE_API_TOKEN: await $.env.get('CLOUDFLARE_API_TOKEN'),
    CLOUDFLARE_ACCOUNT_ID: await $.env.get('CLOUDFLARE_ACCOUNT_ID'),
    HTTPS_PROXY: await $.env.get('HTTPS_PROXY'),
    https_proxy: await $.env.get('https_proxy'),
    HTTP_PROXY: await $.env.get('HTTP_PROXY'),
    http_proxy: await $.env.get('http_proxy'),
    ALL_PROXY: await $.env.get('ALL_PROXY'),
    all_proxy: await $.env.get('all_proxy'),
    NODE_TLS_REJECT_UNAUTHORIZED: await $.env.get('NODE_TLS_REJECT_UNAUTHORIZED'),
    NODE_EXTRA_CA_CERTS: await $.env.get('NODE_EXTRA_CA_CERTS'),
    SSL_CERT_FILE: await $.env.get('SSL_CERT_FILE'),
    SSL_CERT_DIR: await $.env.get('SSL_CERT_DIR'),
  };
}

/** The values this plugin sees that the repository's settings files hold; null when those files could not be read. */
async function taintsOf($: WithSettings, env: Seen['env'], options: PluginOptions): Promise<Taint[] | null> {
  let repo: RepoSettings;
  try {
    repo = { project: await $.settings.read({ source: 'project' }), local: await $.settings.read({ source: 'local' }) };
  } catch {
    repo = null;
  }
  // Only to tell your home directory's project file from a repository's: unread, the project file simply counts.
  if (repo !== null) {
    try {
      repo.user = await $.settings.read({ source: 'user' });
    } catch {
      // Left out.
    }
  }
  return taintsFrom(repo, { env, options });
}

/** Where results are kept, or why no place can be trusted: the repository's settings never decide it (ADR 0005). */
async function storeOf($: WithEnv & WithFiles & WithSettings, options: PluginOptions): Promise<StoreDirs | string> {
  const env = await envOf($);
  const taints = await taintsOf($, env, options);
  const deciding = taints === null ? null : placeTaints(taints, options);
  if (deciding === null || deciding.length > 0) {
    return deciding === null
      ? describeTaints(null)
      : `where results are kept would be decided by the repository (${describeTaints(deciding)}); set storeDir in your user settings`;
  }
  const store = await placesOf(filesOf($), options['storeDir'], {
    CLAUDE_CONFIG_DIR: env.CLAUDE_CONFIG_DIR,
    HOME: env.HOME,
    USERPROFILE: env.USERPROFILE,
  });
  return store ?? 'the place to keep results in is not an absolute path; set storeDir to one';
}

/** The provider `find` asks, none without a key, or why not: the repository's settings never decide where it sends (ADR 0005). */
async function providerOf($: WithEnv & WithSettings, options: PluginOptions): Promise<Provider | null | { error: string }> {
  const env = await envOf($);
  const provider = providerFrom(options, env);
  if (provider === null || 'error' in provider) return provider;
  const taints = await taintsOf($, env, options);
  const deciding = taints === null ? null : sendTaints(taints, options);
  if (deciding === null || deciding.length > 0) {
    return {
      error:
        deciding === null
          ? describeTaints(null)
          : `where it sends would be decided by the repository (${describeTaints(deciding)}); set the key in your user settings`,
    };
  }
  return provider;
}

function numberIn(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

function summary(report: Report): string {
  const took = report.ms < 1000 ? `${report.ms} ms` : `${(report.ms / 1000).toFixed(1)} s`;
  const stayed = Object.entries(report.notMoved)
    .map(([reason, count]) => `${count} ${reason}`)
    .join(', ');
  return (
    `moved ${report.moved} of ${report.results} tool results out ` +
    `(${report.charsBefore} -> ${report.charsAfter} chars, about ${report.tokensAfter} of ${report.window} tokens in use) ` +
    `in ${took}${stayed === '' ? '' : `; left in place: ${stayed}`}`
  );
}

/**
 * One compaction, up to what would be handed back. A string says why the
 * built-in compaction runs on the conversation as it is. Nothing is thrown,
 * so the caller calls `next` once whatever happened here.
 */
async function attempt(
  $: WithUi & WithEnv & WithFiles & WithSession & WithSettings & WithProcess,
  e: Compacting,
  options: PluginOptions,
): Promise<Outcome | string> {
  try {
    // First, so that it is said whatever else this compaction comes to.
    if (options['keepNewest'] !== undefined) {
      say($, 'the keepNewest setting is gone: the newest results are kept by size now, set keepTokens instead');
    }
    const store = await storeOf($, options);
    if (typeof store === 'string') return store;
    const messages = e.messages as readonly Message[];
    const why = whyNotRebuilt(messages, await $.session.messages({ as: 'api' }));
    if (why !== null) return why;
    // Before anything is written: what cannot be made private is not written to.
    const unsafe = await privateOf($, store);
    if (unsafe !== null) return unsafe;

    // A summary is estimated by Claude Code itself: nothing is sent for it.
    const { context } = await $.session.usage({ breakdown: 'summary' });
    const tokens = context?.tokens;
    const config: Config = {
      store,
      keepTokens: Math.floor(numberIn(options['keepTokens'], 20_000, 0, 1_000_000)),
      minChars: Math.floor(numberIn(options['minChars'], 2000, 0, 10_000_000)),
      targetPercent: numberIn(options['targetPercent'], 40, 1, 99),
      maxAfterPercent: numberIn(options['maxAfterPercent'], 75, 1, 100),
    };
    return await compact(
      {
        messages,
        tokens: typeof tokens === 'number' && tokens > 0 ? tokens : Math.ceil(charsOf(messages) / CHARS_PER_TOKEN),
        window: windowFrom(context, FALLBACK_WINDOW),
        goal: goalOf(messages, e.instructions),
      },
      config,
      hostOf($),
    );
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    try {
      await $.tool.register({
        name: RECALL,
        description:
          `Returns, unchanged, a tool result that ${PLUGIN} moved out of the conversation. ` +
          "Call it with the id written in the line that stands in the result's place.",
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: "The 64 hexadecimal characters at the end of the line that stands in the result's place." },
          },
          required: ['id'],
        },
      });
    } catch (error) {
      say($, `the recall tool could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    // Only with a key: without one the tool would have nothing to answer with.
    try {
      const provider = await providerOf($, options);
      if (provider !== null && 'error' in provider) {
        say($, `the find tool is not registered: ${provider.error}`);
      } else if (provider !== null) {
        await $.tool.register({
          name: FIND,
          description:
            `Finds, among the tool results that ${PLUGIN} moved out of this conversation, the one a question is about, ` +
            'and returns it unchanged. Ask in words what the result contains or is about; a phrase of twelve characters ' +
            'or more in double quotes is looked for as written. When Jev is not sure which result it is, the likeliest few ' +
            'are listed with the ids to recall them by; when none of them seems to be about it, it says so.',
          inputSchema: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'What the result is about, in words; an exact phrase, twelve characters or more, in double quotes.' },
            },
            required: ['question'],
          },
        });
      }
    } catch (error) {
      say($, `the find tool could not be registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    return next(e);
  });

  // Spelled out, not imported: Claude Code reads the matcher from this file. A test holds it to RECALL_TOOL.
  on('tool.call', { tool: 'mcp__lossless-compaction__recall' }, async ($, e) => {
    const store = await storeOf($, options);
    if (typeof store === 'string') return { result: `[${PLUGIN}] Nothing is read: ${store}.` };
    const found = await recall(filesOf($), store.read, (e as { id?: unknown }).id);
    return { result: 'text' in found ? found.text : `[${PLUGIN}] ${found.error}` };
  });

  // Spelled out, not imported: a test holds it to FIND_TOOL.
  on('tool.call', { tool: 'mcp__lossless-compaction__find' }, async ($, e) => {
    try {
      const store = await storeOf($, options);
      if (typeof store === 'string') return { result: `[${PLUGIN}] Nothing is read: ${store}.` };
      const provider = await providerOf($, options);
      if (provider !== null && 'error' in provider) {
        return { result: `[${PLUGIN}] find cannot ask Jev: ${provider.error}. recall reads a result by its id.` };
      }
      const agentId = (e as { agentId?: string | undefined }).agentId;
      const messages = agentId === undefined ? ((await $.session.messages()) as readonly Message[]) : [];
      const result = await find({
        files: filesOf($),
        dirs: store.read,
        messages,
        provider,
        http: (url, init) => $.http.fetch(url, init),
        wait: (ms, signal) => $.clock.sleep(ms, { signal }),
        question: (e as { question?: unknown }).question,
        agentId,
      });
      return { result };
    } catch (error) {
      // What the host threw names no key: keys are only ever read, not thrown.
      return { result: `[${PLUGIN}] find could not run: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  on('session.compact', async ($, e, next) => {
    // A result computed ahead would be the built-in summary, paid for and then not used.
    if (e.trigger === 'precompute') return { skip: `${PLUGIN} computes nothing ahead of a compaction` };
    // A subagent may have no tool to read a result back with.
    if (e.agentId !== undefined) return next(e);

    const outcome = await attempt($, e, options);
    if (typeof outcome === 'string') {
      say($, `built-in compaction: ${outcome}`);
      return next(e);
    }
    if (outcome.report.moved === 0) {
      say($, `built-in compaction: nothing could be moved out (${summary(outcome.report)})`);
      return next(e);
    }
    if (!outcome.enough) {
      say($, `built-in compaction on what is left, too much is still in use: ${summary(outcome.report)}`);
      return next({ ...e, messages: outcome.messages });
    }
    say($, summary(outcome.report));
    return { messages: outcome.messages };
  });
};
