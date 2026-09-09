// Output + argument conventions shared by every command.
//
// Two audiences read this tool: a person in a terminal and a coding agent parsing `--json`. In
// JSON mode stdout carries exactly ONE JSON object and nothing else; every log line goes to
// stderr, so an agent can `JSON.parse` the output without scraping. Exit codes are a contract
// (docs/AGENT_CLI.md): 0 clean, 1 the graphic has findings or the request was refused, 2 a
// usage / IO error.

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;

export interface ParsedArgs {
  /** Positional arguments, in order. */
  _: string[];
  /** `--key value`, `--key=value`, `--flag` (true). A repeated key collects an array. */
  flags: Record<string, string | boolean | string[]>;
}

/** A small, predictable parser: long flags only, repeatable keys, `--` ends flags. */
export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [], flags: {} };
  let onlyPositional = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (onlyPositional || !a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    if (a === '--') {
      onlyPositional = true;
      continue;
    }
    const eq = a.indexOf('=');
    let key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    let value: string | boolean;
    if (eq >= 0) value = a.slice(eq + 1);
    else if (key.startsWith('no-')) {
      // `--no-bench` -> bench: false
      key = key.slice(3);
      value = false;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) value = argv[++i];
    else value = true;
    const prev = out.flags[key];
    if (prev === undefined) out.flags[key] = value;
    else if (Array.isArray(prev)) prev.push(String(value));
    else out.flags[key] = [String(prev), String(value)];
  }
  return out;
}

export function flagString(args: ParsedArgs, key: string): string | undefined {
  const v = args.flags[key];
  if (v === undefined || typeof v === 'boolean') return undefined;
  return Array.isArray(v) ? v[v.length - 1] : v;
}

export function flagList(args: ParsedArgs, key: string): string[] {
  const v = args.flags[key];
  if (v === undefined || typeof v === 'boolean') return [];
  return Array.isArray(v) ? v : [v];
}

export function flagBool(args: ParsedArgs, key: string, fallback: boolean): boolean {
  const v = args.flags[key];
  if (v === undefined) return fallback;
  if (typeof v === 'boolean') return v;
  const s = Array.isArray(v) ? v[v.length - 1] : v;
  return !/^(false|0|no|off)$/i.test(s);
}

export function flagNumber(args: ParsedArgs, key: string): number | undefined {
  const s = flagString(args, key);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new UsageError(`--${key} expects a number, got "${s}".`);
  return n;
}

/** A refusal that is the user's to fix (exit 2). */
export class UsageError extends Error {}

export class Out {
  constructor(readonly json: boolean) {}
  /** A human line - stdout in text mode, stderr in JSON mode (so stdout stays one object). */
  say(line = ''): void {
    if (this.json) process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }
  /** A log/progress line: always stderr. */
  log(line: string): void {
    process.stderr.write(`${line}\n`);
  }
  /** The JSON result (JSON mode only). */
  result(value: unknown): void {
    if (this.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  }
}

/**
 * Refuse a word left outside a command's flags.
 *
 * `_[0]` is the verb on both entrances (index.ts dispatches on it, mcp.ts builds the same argv),
 * so `allowed` counts the arguments AFTER it: 0 for `scaffold`, 1 for the verbs that take one
 * package. Anything past that is a mistake, and in practice always the same one - an unquoted
 * flag value. `--name Football scoreboard` leaves "scoreboard" sitting in `_`, and before this
 * the graphic was quietly called "Football", in its `<title>`, its SPX description and its file
 * names, right into the user's library. Measured on the 2026-09-09 time-to-air walk
 * (docs/AGENT_CLI.md, "Time to air, measured"). `pack` takes any number of packages and `caspar`
 * has sub-commands, so neither calls this.
 */
export function refuseStrayArgs(args: ParsedArgs, allowed: 0 | 1, example?: string): void {
  const stray = args._.slice(1 + allowed);
  if (stray.length === 0) return;
  const takes = allowed === 0 ? 'no argument' : 'one argument';
  const quote = example ? `A value containing a space needs quotes: ${example}.` : 'A value containing a space needs quotes.';
  throw new UsageError(
    `${args._[0]} takes ${takes} outside its flags, but also got ${stray.map((s) => `"${s}"`).join(', ')}. ${quote}`,
  );
}

/** Left-aligned columns for a small table. */
export function table(rows: string[][]): string {
  const widths: number[] = [];
  for (const row of rows) row.forEach((cell, i) => (widths[i] = Math.max(widths[i] ?? 0, cell.length)));
  return rows.map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ')).join('\n');
}
