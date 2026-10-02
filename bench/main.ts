// The benchmark's commands. Sessions run outside the repository, under BENCH_BOX:
//
//   node bench/main.ts describe                      what is asked, and the answers
//   node bench/main.ts build   --traces a,b          build the conversations
//   node bench/main.ts run     --traces a,b --models m1,m2 --runs 3
//   node bench/main.ts probe   --traces a,b --models m1 [--plugin-dirs name=path,...] [--max-after 100]
//   node bench/main.ts grade   [--model m]           grade what a program cannot
//   node bench/main.ts report                        the tables
//
// `run` asks the trace's questions; `probe` asks one that needs no history, to
// measure what a compaction left against what the plugin estimated.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { build, type Places } from './build.ts';
import { currentOf, grade, unitsUnder, type Grades } from './grade.ts';
import { estimates, report } from './report.ts';
import { runAll, type Variant } from './run.ts';
import { TRACES, described } from './traces.ts';

const HAIKU = 'claude-haiku-4-5-20251001';

function flag(args: readonly string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
}

const list = (value: string | undefined, all: readonly string[]) => (value === undefined ? [...all] : value.split(',').filter((item) => item !== ''));

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const pluginDir = resolve(import.meta.dirname, '..');
  if (command === 'describe') {
    const out = flag(args, 'out');
    const text = `${JSON.stringify(described(), null, 2)}\n`;
    if (out === undefined) process.stdout.write(text);
    else writeFileSync(out, text);
    return;
  }
  const box = process.env['BENCH_BOX'];
  if (box === undefined || box === '') throw new Error('set BENCH_BOX to a directory outside the repository: sessions work there and their records stay there');
  if (`${resolve(box)}${sep}`.startsWith(`${pluginDir}${sep}`)) throw new Error(`BENCH_BOX is inside the repository (${pluginDir}): records of sessions stay outside it`);
  const places: Places = { box: resolve(box), pluginDir };
  const log = (text: string) => console.error(text);
  const traces = list(flag(args, 'traces'), TRACES.map((trace) => trace.name));
  const buildModel = flag(args, 'build-model') ?? HAIKU;
  if (command === 'build') {
    for (const name of traces) {
      const trace = TRACES.find((one) => one.name === name);
      if (trace === undefined) throw new Error(`no trace named ${name}`);
      const base = await build(trace, buildModel, places, log);
      console.log(JSON.stringify({ trace: base.trace, tokens: base.tokens, thinkingTokens: base.thinkingTokens, toolCalls: base.toolCalls, session: base.sessionId }));
    }
    return;
  }
  if (command === 'run' || command === 'probe') {
    const models = list(flag(args, 'models'), [HAIKU]);
    const runs = Number(flag(args, 'runs') ?? 1);
    const maxAfter = flag(args, 'max-after');
    const dirs = flag(args, 'plugin-dirs');
    const variants: Variant[] | undefined =
      dirs !== undefined
        ? dirs.split(',').map((pair) => {
            const [name, path] = pair.split('=');
            if (name === undefined || path === undefined) throw new Error('--plugin-dirs takes name=path,name=path');
            return { name, pluginDir: resolve(path) };
          })
        : maxAfter !== undefined
          ? [{ name: `max-after-${maxAfter}`, pluginDir, options: { maxAfterPercent: Number(maxAfter) } }]
          : undefined;
    const arms = flag(args, 'arms');
    const units = await runAll(
      { traces, models, runs, buildModel, mode: command === 'probe' ? 'probe' : 'ask', ...(variants ? { variants } : {}), ...(arms ? { arms: arms.split(',') as ('plugin' | 'builtin')[] } : {}) },
      places,
      log,
    );
    console.log(`${units.length} units under ${places.box}/units`);
    return;
  }
  if (command === 'grade') {
    const grades = await grade(places, flag(args, 'model') ?? HAIKU, log);
    console.log(JSON.stringify({ answers: Object.keys(grades.verdicts).length, controls: grades.controls, disagreements: grades.disagreements, ungraded: grades.ungraded.length }));
    return;
  }
  if (command === 'report') {
    const { units, older } = currentOf(unitsUnder(places.box));
    const gradesPath = join(places.box, 'grades.json');
    const grades = existsSync(gradesPath) ? (JSON.parse(readFileSync(gradesPath, 'utf8')) as Grades) : null;
    process.stdout.write(`${report(units, grades, older)}\n\n### What the plugin estimated against what was sent\n\n${estimates(units.filter((unit) => unit.mode === 'probe' || unit.variant === 'default'))}\n`);
    return;
  }
  throw new Error('commands: describe, build, run, probe, grade, report');
}

await main();
