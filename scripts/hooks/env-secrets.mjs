// AGENT SESSIONS NEVER SHOW A .env VALUE (#1281). The one place that decides, for the shell guards
// (guard-command.mjs, codex-guard-command.mjs) and the file-tool guard (guard-read.mjs).
//
// Why: on 2026-10-15 a check session looking for test credentials printed the first ~30 characters
// of every value in the main checkout's .env into its transcript. Those are production keys, and a
// prefix is enough to identify one. The suites already carry their own test accounts, so the
// refusal points there.
//
// What it refuses: a file reader or a searcher given a .env file (`cat .env`, `type .env.local`,
// `grep KEY .env`, `Get-Content .env`), input redirected from one, inline code that names one
// (`node -e "...readFileSync('.env')..."`), a recursive grep over a folder that holds one, a
// wholesale dump of the environment (`printenv`, `env`, `Get-ChildItem env:`), and printing a
// variable whose name says it is a secret (`echo $SUPABASE_ACCESS_TOKEN`).
//
// What it leaves alone: loading the file for a program (`node --env-file=.env script.mjs`,
// `set -a; . ./.env`, dotenv inside a script), copying, listing, editing or testing it, a search
// that prints only names or counts, and the .env files this repository commits, which hold no
// secrets. It guards against a careless step, not against a session set on getting round it.

import { readdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { commandSegments } from '../command-match.mjs';
import { targetDir } from '../command-target.mjs';

/** The .env files this repository commits. Both say they hold no secrets; the test pins the list to git. */
export const COMMITTED_ENV_FILES = Object.freeze(['.env.example', '.env.bench']);

/**
 * Does `path` name a .env file that may hold secrets? `.env` and `.env.<anything>`, a glob such as
 * `.env*`, but not a committed one. `.envrc` and `foo.env` are other things.
 */
export function isSecretEnvFile(path) {
  const name = String(path).replace(/["'`]/g, '').split(/[\\/]/).pop().toLowerCase();
  return /^\.env(?:[.*?[].*)?$/.test(name) && !COMMITTED_ENV_FILES.includes(name);
}

/** The first secret .env file a piece of command text names, wherever it appears in it. */
function secretEnvMention(text) {
  return [...text.matchAll(/(?:^|[\s'"`(=,:<>/\\])(\.env(?:[.*?][\w.*?-]*)?)(?=$|[\s'"`),;|&>])/g)]
    .map((match) => match[1])
    .find(isSecretEnvFile);
}

/** Programs that print what is in the files they are given. */
const READERS = new Set([
  'cat', 'type', 'more', 'less', 'most', 'head', 'tail', 'bat', 'batcat', 'nl', 'tac', 'od', 'xxd',
  'hexdump', 'strings', 'sed', 'awk', 'gawk', 'mawk', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack',
  'findstr', 'sort', 'uniq', 'cut', 'tr', 'paste', 'column', 'fold', 'diff', 'comm', 'base64',
  'iconv', 'jq', 'yq', 'get-content', 'gc', 'select-string', 'sls', 'format-hex',
]);
const GREPS = new Set(['grep', 'egrep', 'fgrep', 'rg']);

/** Interpreters, with the flag that hands them inline code. */
const INLINE_CODE = /^(?:node|bun|deno|python3?|py|perl|ruby|php)(?:\.exe)?\s(?:.*\s)?(?:-e|-p|-c|-r|-ne|-pe|--eval|--print|eval)(?:\s|=|$)/i;

/** A variable name that says its value is a secret. */
const SECRET_NAME = /(?:^|_)(?:API_?KEY|KEY|TOKEN|SECRET|PASSWORD|PASSWD|PAT)$/i;

/**
 * Why this shell command would show a .env value, or null when it would not. `baseDir` is the
 * directory the session runs in; a recursive grep is judged by the folder it searches.
 */
export function showsEnvSecrets(command, baseDir = process.cwd()) {
  for (const segment of commandSegments(command)) {
    // Inline code is judged whole, before `parts` takes its quotes and brackets apart. Loading the
    // file for that code (`--env-file=.env`) is not reading it.
    if (INLINE_CODE.test(segment)) {
      const named = secretEnvMention(segment.replace(/--env-file[=\s]+\S+/g, ''));
      if (named) return `inline code reads ${named}`;
    }
    const redirected = /(?<![<\d])<\s*(["']?)([^\s"'<>|;&()]+)\1/.exec(segment);
    if (redirected && isSecretEnvFile(redirected[2])) return `input is read from ${redirected[2]}`;
    const file = /\[(?:System\.)?IO\.File\]::Read/i.test(segment) && secretEnvMention(segment);
    if (file) return `${file} is read`;
    if (/\[(?:System\.)?Environment\]::GetEnvironmentVariables\(/i.test(segment)) return 'it would list every environment variable';

    for (const part of parts(segment)) {
      const words = part.split(/\s+/);
      const program = words[0].replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
      const args = words.slice(1);
      const why = READERS.has(program) ? readerShows(program, args, command, baseDir) : environmentDump(program, args, part);
      if (why) return why;
    }
  }
  return null;
}

/**
 * The pieces of a segment that can each be a command: the payload of `bash -c`, `powershell
 * -Command` or `cmd /c`, and what runs inside `$(...)`, backquotes, `(...)` and `{...}`. Quoting
 * is respected the way bash does it: nothing in single quotes runs, and in double quotes only
 * `$(...)` and backquotes do. So `git commit -m 'Refuse `cat .env`'` and
 * `grep "a (b|c)" --include=*.md .` each stay one command.
 */
function parts(segment) {
  const text = unwrap(segment);
  const pieces = [''];
  let single = false;
  let double = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single && text[i - 1] !== '\\') double = !double;
    const runs = c === '`' || (c === '$' && text[i + 1] === '(');
    const groups = (c === '(' || c === ')' || c === '{' || c === '}') && text[i - 1] !== '$';
    if (!single && (runs || (!double && groups))) {
      pieces.push('');
      if (c === '$') i += 1;
      continue;
    }
    pieces[pieces.length - 1] += c;
  }
  return pieces.map(unwrap).filter(Boolean);
}

/** Take off what stands in front of a command: `VAR=x`, `sudo`, `bash -c '...'` and the like. */
function unwrap(piece) {
  let at = piece.trim();
  for (let i = 0; i < 3; i += 1) {
    let next = at.replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, '').replace(/^(?:sudo|nohup|time|exec|command|builtin|&)\s+/i, '');
    const payload = /^(?:bash|sh|zsh|cmd|powershell|pwsh)(?:\.exe)?\s+(?:-NoProfile\s+|-NonInteractive\s+|-l\s+)*(?:-c|-lc|-Command|\/c)\s+(.*)$/is.exec(next);
    if (payload) next = payload[1].trim().replace(/^(["'])(.*?)\1?$/s, '$2');
    next = next.trim();
    if (next === at) break;
    at = next;
  }
  return at;
}

/** Why a reader given these arguments would print a .env value, or null. */
function readerShows(program, args, command, baseDir) {
  // A search that prints only names or counts, and an in-place edit, show no value.
  if (GREPS.has(program) && args.some((arg) => /^-[a-zA-Z]*[qlLc]|^--(?:quiet|silent|count|files-with(?:out)?-match)/.test(arg))) return null;
  if (program === 'sed' && args.some((arg) => /^-[a-zA-Z]*i|^--in-place/.test(arg))) return null;
  // Writing INTO a .env file (`cat .env.example > .env`) is not reading one, nor is excluding one.
  const named = secretEnvMention(
    args.join(' ').replace(/\d*>>?\s*(?:&\d|\S+)/g, '').replace(/(?:^|\s)(?:--(?:exclude|glob|iglob)\S*|-g)(?:=|\s+)\S+/g, ' '),
  );
  if (named) return `${program} would print ${named}`;
  const searched = GREPS.has(program) && recursiveSearchOver(program, args, command, baseDir);
  return searched ? `${program} would search ${searched}` : null;
}

/**
 * A recursive grep (or `rg` told to ignore .gitignore) over a folder that holds a secret .env file,
 * with no exclusion for it: that file's path, or null. Only the searched folder itself is looked in,
 * because .env files sit at a checkout's root, which is where such a search starts.
 */
function recursiveSearchOver(program, args, command, baseDir) {
  const flags = args.filter((arg) => arg.startsWith('-'));
  const recursive =
    program === 'rg'
      ? flags.some((flag) => /^--no-ignore\b|^-[a-zA-Z]*uu/.test(flag))
      : flags.some((flag) => /^-[a-zA-Z]*[rR]|^--(?:dereference-)?recursive$/.test(flag));
  if (!recursive) return null;
  // A search that excludes .env files, or only looks in files of a named kind, never opens one.
  if (flags.some((flag) => /^--(?:exclude|glob|iglob)\b.*\.env/.test(flag)) || /\s-g\s+\S*!\S*\.env/.test(command)) return null;
  if (flags.some((flag) => /^--(?:include|type)=(?!.*\.env)/.test(flag)) || /\s(?:-t|--type|-g)\s+(?!["']?!)(?!\S*\.env)\S/.test(command)) return null;
  const operands = args.filter((arg) => !arg.startsWith('-')).map((arg) => arg.replace(/^["']|["']$/g, ''));
  // The first operand is the pattern unless it came with -e; with no folder named, the search is `.`.
  const folders = flags.some((flag) => flag === '-e' || flag.startsWith('--regexp')) ? operands : operands.slice(1);
  const cwd = targetDir(command, baseDir);
  for (const folder of folders.length > 0 ? folders : ['.']) {
    const dir = isAbsolute(folder) ? folder : join(cwd, folder);
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue; // a file, or nothing there: not a folder this rule is about
    }
    const secret = names.find(isSecretEnvFile);
    if (secret) return join(dir, secret);
  }
  return null;
}

/** Why this command would print the whole environment, or one secret-named variable from it. */
function environmentDump(program, args, part) {
  const plain = args.filter((arg) => !arg.startsWith('-'));
  if ((program === 'printenv' || program === 'env') && plain.length === 0) return `${program} would print every variable`;
  const named = program === 'printenv' && plain.find((name) => SECRET_NAME.test(name));
  if (named) return `printenv would print ${named}`;
  const listsAll = program === 'set' ? args.length === 0 : args.every((arg) => /^-[px]+$/.test(arg));
  if (['export', 'declare', 'typeset', 'set'].includes(program) && listsAll) {
    return `${program} would print every variable`;
  }
  if (/^(?:get-childitem|gci|ls|dir|get-item|gi)\s+(?:-path\s+)?env:[\\/]?\*?\s*$/i.test(part)) return 'it would list every environment variable';
  if (/^(?:echo|printf|write-output|write-host|write-information)$/.test(program) || /^\$env:\w+\b(?!\s*=)/i.test(part)) {
    // `${NAME:+set}` says whether it is set without printing it.
    const secret = [...part.matchAll(/\$(?:env:)?\{?(\w+)(:?\+)?/gi)].find((match) => !match[2] && SECRET_NAME.test(match[1]));
    if (secret) return `it would print ${secret[1]}`;
  }
  return null;
}

/** Why a Read or Grep call would show a .env value, or null. A Grep that lists files shows none. */
export function readsEnvSecrets(toolName, input) {
  if (toolName === 'Read' && isSecretEnvFile(input?.file_path ?? '')) return `Read would show ${input.file_path}`;
  if (toolName === 'Grep' && input?.output_mode === 'content') {
    if (isSecretEnvFile(input.path ?? '')) return `Grep would print lines of ${input.path}`;
    const glob = String(input.glob ?? '');
    if (glob.split(/[,{}\s]+/).some(isSecretEnvFile)) return `Grep would print lines of ${glob}`;
  }
  return null;
}

/** The refusal, the same for every guard: what happened, and where the test accounts are. */
export function envSecretsRefusal(why) {
  return (
    `Blocked: ${why}. A .env file holds production keys, and a value printed here stays in the ` +
    'session transcript; even a prefix identifies a key (#1281).\n' +
    'For a test account, use the ones the configured suites carry: the throwaway accounts in ' +
    '.github/workflows/configured-suite.yml (local Supabase stack) and ' +
    '.github/workflows/hosted-latency.yml (staging), explained in docs/VERIFICATION.md under ' +
    '"E2E is TIERED". Run that suite on GitHub: `gh workflow run configured-suite.yml`.\n' +
    'Which keys exist: .env.example, and the code that reads them. A script that needs the values ' +
    'loads the file itself (`node --env-file=.env <script>`); to test that a key is set, use its ' +
    'exit code: `node --env-file=.env -e "process.exit(process.env.NAME ? 0 : 1)"`.'
  );
}
