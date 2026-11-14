// A SHELL COMMAND MAY NOT REACH PRODUCTION WITH THE ADMIN KEY BY ACCIDENT (issue #2560).
//
// Cloud agent sessions carry the production project's address, its service-role key and the
// Supabase access token in their environment, on purpose: about twenty tools in scripts/ read them
// for deliberate production work (db-push, admin, feedback-digest, supabase-advisors and others),
// and the owner decided on 2026-11-14 (#2361) to keep them there and guard their use. On
// 2026-11-13 a worker's one-off script fell back to them and sent two admin "create user" requests
// to production. Nothing stood between a one-off and the key.
//
// This decides, from the command text and nothing on the network, whether a command would use one
// of those credentials while they point at a project the session does not own. Each simple command
// in the line is judged on its own, in order, so a `cd` or an `unset` counts for what follows it and
// a production tool in one part allows that part only.
//
//   ARMED      the environment holds the service-role key and its backend URL is not a local
//              stack, or it holds the access token (which opens the management API for every
//              project), or the command loads an env file (`--env-file`, dotenv, `source .env`),
//              whose contents a hook cannot see.
//   USES       the shell expands a credential (`$NAME` outside single quotes, an unquoted heredoc),
//              code handed to an interpreter reads it (`node -e`, `python -c`, a heredoc fed to
//              one), a script file run here that is not tracked in git reads it, the command names
//              the management API host, or a Supabase CLI command acts on a hosted project.
//   ALLOWED    that simple command runs one of PRODUCTION_TOOLS, or the credential was set or
//              unset for it (`NAME=local-value cmd`, `env -u NAME cmd`, an earlier `unset NAME`).
//              Setting a credential to itself (`NAME=$NAME`) is not setting it.
//
// A tracked file was reviewed and is not read here; a one-off was not. Naming a variable without
// using it (`grep -rn "process.env.SUPABASE_SERVICE_ROLE_KEY" scripts`, a quoted commit message) is
// not a use. It is a seatbelt against an accident, not a wall against someone set on getting
// through: a name built at run time, or a tracked file edited to call production, is not seen.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { KEY_VARS, URL_VARS, isLocalStackUrl } from '../configured-target.mjs';

export const ACCESS_TOKEN = 'SUPABASE_ACCESS_TOKEN';
export const MANAGEMENT_HOST = 'api.supabase.com';

/**
 * The deliberate production tools: every tracked script in scripts/ that reads one of these
 * credentials on purpose. A simple command that runs one of them may use the credentials however
 * it likes (`SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN node scripts/supabase-advisors.mjs`).
 */
export const PRODUCTION_TOOLS = [
  'scripts/admin.mjs',
  'scripts/allowlist.mjs',
  'scripts/bench-env.mjs',
  'scripts/connector-oauth-spike.mjs',
  'scripts/connector-switch.mjs',
  'scripts/db-push.mjs',
  'scripts/editor-projects-qualification.mjs',
  'scripts/endurance-election.mjs',
  'scripts/feedback-digest.mjs',
  'scripts/lite-eval-token.mjs',
  'scripts/migration-drift.mjs',
  'scripts/ograf-walk-common.mjs',
  'scripts/owner-preflight.mjs',
  'scripts/production-load.mjs',
  'scripts/production-page-keys.mjs',
  'scripts/supabase-advisors.mjs',
];

const CREDENTIALS = [...KEY_VARS, ACCESS_TOKEN];
const SCRIPT = /\.(?:[cm]?[jt]s|py|sh)$/i;
/** Interpreters: a script file among their words is run, and an -e/-c argument is code. */
const RUNNERS = new Set(['node', 'tsx', 'ts-node', 'bun', 'deno', 'python', 'python3', 'bash', 'sh', 'zsh']);
const CODE_FLAGS = new Set(['-e', '--eval', '-p', '--print', '-c', 'eval']);
/** Loads an env file the hook cannot read. */
const ENV_FILE = /--env-file\b|\bdotenv\b|(?:^|[\s;&|(])(?:source|\.)\s+[^\s;&|]*\.env\b/;
/** Code reads its environment. */
const READS_ENV = /process\.env|import\.meta\.env|os\.environ|os\.getenv|Deno\.env|\$\{?[A-Z_]+|\$env:/;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const base = (word) => word.split(/[\\/]/).pop();

/** Code that names `name` reads it: as an env property, an env lookup, or a destructured env. */
function codeReads(text, name) {
  if (!text.includes(name)) return false;
  const n = esc(name);
  return new RegExp(
    `\\benv\\.${n}\\b|\\benv\\[\\s*['"\`]${n}['"\`]|environ(?:\\.get\\(|\\[)\\s*['"]${n}['"]|getenv\\(\\s*['"]${n}['"]|env\\.get\\(\\s*['"]${n}['"]|\\{[^}]*\\b${n}\\b[^}]*\\}\\s*=\\s*(?:process\\.env|import\\.meta\\.env|Deno\\.env)`,
  ).test(text);
}

/** Shell expansions in a stretch of text the shell expands (`$NAME`, `${NAME}`, `$env:NAME`). */
function expansionsIn(text) {
  return [...text.matchAll(/\$(?:env:)?\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
}

/** Which credentials this environment arms, or [] when nothing points anywhere it should not. */
export function armedCredentials(env, command = '') {
  if (ENV_FILE.test(command)) return CREDENTIALS;
  const armed = [];
  const urls = URL_VARS.map((name) => (env[name] ?? '').trim()).filter(Boolean);
  // An admin key with no URL beside it is still a key to somewhere; only a local stack disarms it.
  const remote = urls.length === 0 || urls.some((url) => !isLocalStackUrl(url));
  if (remote) armed.push(...KEY_VARS.filter((name) => (env[name] ?? '').trim() !== ''));
  if ((env[ACCESS_TOKEN] ?? '').trim() !== '') armed.push(ACCESS_TOKEN);
  return armed;
}

/**
 * Heredoc bodies taken out of the text, each kept with the line that opened it: `{ text, docs }`,
 * where `docs[i]` lists `{ body, quoted }` for line i. A quoted tag (`<<'EOF'`) is not expanded.
 */
function takeHeredocs(command) {
  const lines = command.split('\n');
  const kept = [];
  const docs = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const opened = [...line.matchAll(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g)];
    kept.push(line);
    docs.push([]);
    for (const [, quote, tag] of opened) {
      const body = [];
      while (i + 1 < lines.length && lines[i + 1].trim() !== tag) body.push(lines[(i += 1)]);
      i += 1; // the terminator
      docs[kept.length - 1].push({ body: body.join('\n'), quoted: quote !== '' });
    }
  }
  return { lines: kept, docs };
}

/**
 * The simple commands of one shell text, in order. Each is `{ words, expands, nested }`: its words
 * with quotes removed, the variables the shell expands in it (single quotes excepted), and the
 * shell text inside `$(...)` or backticks, which is judged as commands of its own.
 */
function simpleCommands(text) {
  const out = [];
  let cur = { words: [], expands: [], nested: [] };
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) cur.words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (cur.words.length > 0) out.push(cur);
    cur = { words: [], expands: [], nested: [] };
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else word += c;
      continue;
    }
    if (c === '$' && text[i + 1] === '(') {
      // A substitution: its text runs as commands of its own, and stands in this word as text.
      let depth = 0;
      let j = i + 1;
      for (; j < text.length; j += 1) {
        if (text[j] === '(') depth += 1;
        else if (text[j] === ')' && (depth -= 1) === 0) break;
      }
      cur.nested.push(text.slice(i + 2, j));
      word = (word ?? '') + text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '`') {
      const j = text.indexOf('`', i + 1);
      const end = j < 0 ? text.length : j;
      cur.nested.push(text.slice(i + 1, end));
      word = (word ?? '') + text.slice(i, end + 1);
      i = end;
      continue;
    }
    if (c === '$') {
      const [name] = expansionsIn(text.slice(i, i + 200));
      if (name) cur.expands.push(name);
    }
    if (quote === '"') {
      if (c === '"') quote = null;
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      word = word ?? '';
    } else if (/[;|&\n()]/.test(c)) {
      endCommand();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endCommand();
  return out;
}

/** Every simple command in the line, nested ones included, each with the heredocs of its line. */
function commandsOf(command) {
  const { lines, docs } = takeHeredocs(command);
  const all = [];
  const visit = (text, heredocs, depth) => {
    for (const cmd of simpleCommands(text)) {
      cmd.heredocs = heredocs;
      all.push(cmd);
      if (depth > 2) continue;
      for (const inner of cmd.nested) visit(inner, [], depth + 1);
      const at = cmd.words.findIndex((w) => w === '-c');
      if (at > 0 && /^(?:ba|z)?sh$/.test(base(cmd.words[at - 1])) && cmd.words[at + 1]) visit(cmd.words[at + 1], [], depth + 1);
    }
  };
  lines.forEach((line, i) => visit(line, docs[i], 0));
  return all;
}

/** Index of the interpreter in a simple command's words, or -1. */
const runnerAt = (words) => words.findIndex((w) => RUNNERS.has(base(w)));

/**
 * Credentials a simple command sets or unsets for itself, from its leading words: `NAME=value`,
 * `env -u NAME`, `env -i`. A value that expands a credential (`NAME=$NAME`) is not a new value.
 */
function prefixOverrides(words) {
  const own = new Set();
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const assign = w.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/s);
    if (assign) {
      if (!expansionsIn(assign[2]).some((name) => CREDENTIALS.includes(name))) own.add(assign[1]);
    } else if (w === '-u' || w === '--unset') {
      own.add(words[(i += 1)]);
    } else if (w.startsWith('--unset=')) {
      own.add(w.slice('--unset='.length));
    } else if (w === '-i' && words[i - 1] === 'env') {
      CREDENTIALS.forEach((name) => own.add(name));
    } else if (!(w === 'env' || w.startsWith('-'))) {
      break;
    }
  }
  return own;
}

/** Script files a simple command runs: any script word after an interpreter, or the command itself. */
function scriptsRun(words, dir) {
  const at = runnerAt(words);
  const first = words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
  const candidates = at >= 0 ? words.slice(at + 1) : first ? [first] : [];
  const files = [];
  for (const word of candidates) {
    if (!SCRIPT.test(word)) continue;
    const file = isAbsolute(word) ? word : resolve(dir, word);
    if (existsSync(file) && statSync(file).isFile()) files.push(file);
  }
  return files;
}

/** Code a simple command hands an interpreter in its arguments (`node -e '<code>'`). */
function inlineCode(words) {
  const at = runnerAt(words);
  if (at < 0 || /^(?:ba|z)?sh$/.test(base(words[at]))) return [];
  return words.slice(at + 1).filter((w, i, rest) => i > 0 && CODE_FLAGS.has(rest[i - 1]));
}

/** The repository-relative path of a tracked file, or null for a one-off (untracked, or outside any repository). */
function trackedPath(file) {
  const top = spawnSync('git', ['-C', dirname(file), 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  if (top.status !== 0) return null;
  const root = top.stdout.trim();
  const rel = relative(root, file).split('\\').join('/');
  const listed = spawnSync('git', ['-C', root, 'ls-files', '--error-unmatch', '--', rel], { encoding: 'utf8', windowsHide: true });
  return listed.status === 0 ? rel : null;
}

/** Supabase CLI commands that act only on this machine; any other acts on a hosted project. */
const LOCAL_CLI = new Set(['start', 'stop', 'status', 'init', 'help', 'completion', 'login', 'logout', 'services', 'test', 'seed', 'db', 'migration', 'functions', 'gen', 'bootstrap']);
const LOCAL_DEFAULT = { db: ['reset', 'diff', 'lint', 'start'], migration: ['new', 'up', 'down', 'squash'], functions: ['new', 'serve'], gen: ['types', 'signing-key', 'keys'] };
const CLI_VALUE_FLAGS = new Set(['--workdir', '--profile', '--output', '-o', '--network-id', '--dns-resolver']);

/** Does this simple command run the Supabase CLI against a hosted project? */
function hostedSupabaseCli(words) {
  const at = words.findIndex((w) => /^(?:.*[\\/])?supabase(?:@\S*)?$/.test(w));
  if (at < 0 || (at > 0 && !['npx', 'bunx', 'pnpm', 'yarn', 'exec', 'dlx', 'env', 'timeout'].includes(words[at - 1]) && !/=/.test(words[at - 1]))) return false;
  const args = words.slice(at + 1);
  if (args.some((w) => /^--(?:linked|project-ref|project-id)\b/.test(w))) return true;
  if (args.some((w) => /^--(?:local|db-url)\b/.test(w))) return false;
  const positional = args.filter((w, i) => !w.startsWith('-') && !CLI_VALUE_FLAGS.has(args[i - 1]));
  const [sub, verb] = positional;
  if (!sub) return false;
  if (!LOCAL_CLI.has(sub)) return true;
  const local = LOCAL_DEFAULT[sub];
  return Boolean(local && verb && !local.includes(verb));
}

/**
 * The refusal for this command, or null when it may run.
 *
 * `env` is the session's environment (the hook inherits it); `cwd` is where the command starts.
 * Tests pass a fake environment and fake files, so nothing here ever reaches a network.
 */
export function productionReachRefusal(command, { env = process.env, cwd = process.cwd() } = {}) {
  const armed = armedCredentials(env, command);
  if (armed.length === 0) return null;
  // An env file loads the credentials after any `env -u` or assignment, so with one nothing a
  // command sets itself counts.
  const envFile = ENV_FILE.test(command);

  const reasons = [];
  const unset = new Set();
  let dir = cwd;
  for (const { words, expands, heredocs } of commandsOf(command)) {
    const [head, arg] = words;
    if (head === 'cd' || head === 'pushd') {
      if (!arg || arg === '~') dir = homedir();
      else if (!arg.includes('$') && arg !== '-') dir = resolve(dir, arg.replace(/^~(?=[\\/])/, homedir()));
      continue;
    }
    if (head === 'unset' || head === 'export') {
      for (const w of words.slice(1)) {
        const name = w.split('=')[0];
        if (head === 'unset' || (w.includes('=') && !expansionsIn(w).some((n) => CREDENTIALS.includes(n)))) unset.add(name);
      }
      continue;
    }

    // The shell expands `$NAME` before any prefix assignment of this command applies.
    const shellLive = armed.filter((name) => envFile || !unset.has(name));
    const own = envFile ? new Set() : new Set([...unset, ...prefixOverrides(words)]);
    const live = armed.filter((name) => !own.has(name));

    // A production tool allows this simple command and nothing else in the line.
    const files = scriptsRun(words, dir).map((file) => ({ file, text: safeRead(file) }));
    const named = (text) => live.filter((name) => text.includes(name));
    // Git is asked only about a file that names a credential, so an ordinary `node x.mjs` costs one read.
    const tracked = files.filter(({ text }) => CREDENTIALS.some((name) => text.includes(name))).map((f) => ({ ...f, rel: trackedPath(f.file) }));
    if (tracked.some(({ rel }) => rel && PRODUCTION_TOOLS.includes(rel))) continue;

    // A heredoc fed to an interpreter that runs no file is the code it runs (`node <<'EOF'`).
    const fed = runnerAt(words) >= 0 && files.length === 0 ? heredocs.map((doc) => doc.body) : [];
    const name = words.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) ?? words[0];
    const expanded = [...expands, ...heredocs.filter((doc) => !doc.quoted).flatMap((doc) => expansionsIn(doc.body))];
    const usedByShell = shellLive.filter((name) => expanded.includes(name));
    const usedByCode = live.filter((name) => [...inlineCode(words), ...fed].some((code) => codeReads(code, name)));
    const used = [...new Set([...usedByShell, ...usedByCode])];
    if (used.length > 0) reasons.push(`\`${name}\` uses ${used.join(' and ')}`);

    for (const { file, text, rel } of tracked) {
      if (rel || named(text).length === 0 || !READS_ENV.test(text)) continue;
      reasons.push(`${relative(cwd, file) || file} is a script not in the repository, and it reads ${named(text).join(' and ')}`);
    }
    if (live.includes(ACCESS_TOKEN)) {
      if (words.some((w) => w.toLowerCase().includes(MANAGEMENT_HOST))) reasons.push(`\`${name}\` calls the Supabase management API (${MANAGEMENT_HOST})`);
      if (hostedSupabaseCli(words)) reasons.push(`\`${words.filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)).join(' ').slice(0, 60)}\` is a Supabase CLI command that acts on a hosted project`);
    }
  }
  if (reasons.length === 0) return null;

  return (
    `Blocked: this command could reach a hosted Supabase project with the admin key or the access token in this session's environment (#2560): ${[...new Set(reasons)].join('; ')}.\n` +
    'Those credentials point at PRODUCTION here. They stay in the environment for the deliberate production tools, and a one-off command or script may not use them: on 2026-11-13 one sent admin requests to production.\n' +
    'What to do:\n' +
    '  - Local work: start the local stack (supabase start) and set its values in the command itself, for example ' +
    '`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<from supabase status> node my-script.mjs`, ' +
    'or unset them for it (`env -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_SECRET_KEY -u SUPABASE_ACCESS_TOKEN ...`).\n' +
    `  - Deliberate production work: run the tool made for it (${PRODUCTION_TOOLS.map((p) => p.replace(/^scripts\//, '')).join(', ')} in scripts/), or ask the owner.`
  );
}

function safeRead(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
