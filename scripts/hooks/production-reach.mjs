// A SHELL COMMAND MAY NOT REACH PRODUCTION WITH THE ADMIN KEY BY ACCIDENT (issue #2560).
//
// Cloud agent sessions carry the production project's address, its service-role key and the
// Supabase access token in their environment, on purpose: about twenty tools in scripts/ read them
// for deliberate production work (db-push, admin, feedback-digest, supabase-advisors and others),
// and the owner decided on 2026-11-14 (#2361) to keep them there and guard their use. On
// 2026-11-13 a worker's one-off script fell back to them and sent two admin "create user" requests
// to production. Nothing stood between a one-off and the key.
//
// THE RULE FAILS CLOSED. Proving that a command does NOT use a credential means understanding all
// of shell, and every construct a parser misreads (a line continuation, a heredoc fed to `bash`, a
// subshell) lets a use through; three review rounds found one after another. So the question asked
// here is the other way round: a command that NAMES an armed credential is refused, unless every
// simple command in it that names one is plain text work (a search, a commit message, a file
// written with `cat <<'EOF'`) or sets the credential itself. What the parser does not understand is
// refused.
//
//   ARMED      the environment holds the service-role key and its backend URL is not a local
//              stack, or it holds the access token (which opens the management API for every
//              project), or the command loads an env file (`--env-file`, dotenv, `source .env`),
//              whose contents a hook cannot see.
//   REFUSED    a simple command, or a heredoc it is fed, names an armed credential, and either it
//              is not a text tool (TEXT_TOOLS, without the flags that run code), or the shell
//              expands the credential in it (`$NAME`, an unquoted heredoc; `test`/`[` excepted).
//              Also: a script file it runs that is not tracked in git reads an armed credential,
//              or a Supabase CLI command acts on a hosted project (the CLI sends the token unasked).
//   ALLOWED    that simple command runs one of PRODUCTION_TOOLS, or sets or unsets the credentials
//              it names for itself (`env -u NAME cmd`, `NAME=local-value cmd`; `NAME=$NAME` is not
//              setting it). An `unset` in one command does not cover another.
//
// A tracked file was reviewed and is not read here; a one-off was not. It is a seatbelt against an
// accident, not a wall against someone set on getting through: a name built at run time, or a
// tracked file edited to call production, is not seen.

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { KEY_VARS, URL_VARS, isLocalStackUrl } from '../configured-target.mjs';
import { gitOutput } from './lib.mjs';

export const ACCESS_TOKEN = 'SUPABASE_ACCESS_TOKEN';

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
/** Interpreters: a script file among their words is run. */
const RUNNERS = new Set(['node', 'tsx', 'ts-node', 'bun', 'deno', 'python', 'python3', 'bash', 'sh', 'zsh']);
/** Loads an env file the hook cannot read. */
const ENV_FILE = /--env-file\b|\bdotenv\b|(?:^|[\s;&|(])(?:source|\.)\s+[^\s;&|]*\.env\b/;
/** Code reads its environment. */
const READS_ENV = /process\.env|import\.meta\.env|os\.environ|os\.getenv|Deno\.env|\$\{?[A-Z_]+|\$env:/;
/**
 * Commands that only handle text: naming a credential in one is not using it. Each with the
 * arguments that would make it run code instead, which turn it back into an ordinary command.
 */
const TEXT_TOOLS = new Map([
  ...['grep', 'egrep', 'fgrep', 'echo', 'printf', 'cat', 'head', 'tail', 'ls', 'wc', 'diff', 'jq', 'sort', 'uniq', 'cut', 'tr', 'tee', 'cd', 'pwd', 'mkdir', 'touch', 'true', 'false', 'test', '[', '[['].map((t) => [t, null]),
  ['rg', /^--pre\b/],
  ['find', /^-(?:exec|execdir|ok|okdir)$/],
  ['git', /^(?:-c|--exec\b|-x$|--upload-pack\b|--receive-pack\b|bisect$|filter-branch$)/],
  ['gh', /^(?:extension|alias)$/],
]);
/** Shell keywords that can stand before a command, and the closing ones that stand alone. */
const SHELL_WORDS = new Set(['{', '}', '!', 'if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'time']);
/** Commands in which an expansion only tests that a variable is set. */
const TESTS = new Set(['test', '[', '[[']);

/** Any of these in the text is needed for any reason below; without one, nothing is parsed. */
const MAY_REACH = /[$`]|supabase|\.(?:[cm]?[jt]s|py|sh)\b|\b(?:node|tsx|ts-node|bun|deno|python3?|bash|sh|zsh)\b/i;
/** Interpreter flags that run code other than the file it is given: inline code, or a preload. */
const RUNS_OTHER_CODE = /^(?:-e|--eval|-p|--print|-c|-r|--require|--import|--loader|--experimental-loader)(?:=|$)/;
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const TOOL_FILES = new Set(PRODUCTION_TOOLS.map((path) => path.split('/').pop()));

const base = (word) => word.split(/[\\/]/).pop();
const isShell = (word) => /^(?:ba|z)?sh$/.test(base(word));
/** The words that are not leading `NAME=value` assignments. */
const commandWords = (words) => words.filter((w) => !ASSIGN.test(w));
const NAMES = new RegExp(`\\b(${CREDENTIALS.join('|')})\\b`, 'g');
/** The credentials a stretch of text names. */
const namedIn = (text) => [...new Set([...text.matchAll(NAMES)].map((m) => m[1]))];

/** Shell expansions in a stretch of text the shell expands (`$NAME`, `${NAME}`, `$env:NAME`). */
function expansionsIn(text) {
  return [...text.matchAll(/\$(?:env:)?\{?([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
}
const expandsCredential = (text) => expansionsIn(text).some((name) => CREDENTIALS.includes(name));

/** Which credentials this environment arms, or [] when nothing points anywhere it should not. */
export function armedCredentials(env, command = '') {
  if (ENV_FILE.test(command)) return CREDENTIALS;
  const has = (name) => (env[name] ?? '').trim() !== '';
  const urls = URL_VARS.filter(has).map((name) => env[name].trim());
  // An admin key with no URL beside it is still a key to somewhere; only a local stack disarms it.
  const remote = urls.length === 0 || urls.some((url) => !isLocalStackUrl(url));
  return [...(remote ? KEY_VARS.filter(has) : []), ...(has(ACCESS_TOKEN) ? [ACCESS_TOKEN] : [])];
}

/**
 * Heredoc bodies taken out of the text, each kept with the line that opened it: `{ text, docs }`,
 * where `docs[i]` lists `{ body, quoted }` for line i of `text`. A quoted tag (`<<'EOF'`) is not
 * expanded.
 */
function takeHeredocs(command) {
  const all = command.split('\n');
  const lines = [];
  const docs = [];
  for (let i = 0; i < all.length; i += 1) {
    const mine = [];
    lines.push(all[i]);
    docs.push(mine);
    for (const [, quote, tag] of all[i].matchAll(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g)) {
      const body = [];
      while (i + 1 < all.length && all[i + 1].trim() !== tag) body.push(all[(i += 1)]);
      i += 1; // the terminator
      mine.push({ body: body.join('\n'), quoted: quote !== '' });
    }
  }
  return { text: lines.join('\n'), docs };
}

/**
 * The simple commands of one shell text, in order, read as the shell reads it: a quoted argument
 * may span lines. Each is `{ words, expands, nested, scope, heredocs }`: its words with quotes
 * removed, the variables the shell expands in it (single quotes excepted), the shell text inside
 * `$(...)` or backticks (judged as commands of their own), the subshell it runs in, and the
 * heredocs opened on the lines it spans.
 *
 * `scope` is a path: `( ... )` opens a child of the scope it is in, so what an `unset` or `cd`
 * changes inside a subshell does not reach the commands after it.
 */
function simpleCommands(text, docs = [], root = '0') {
  const out = [];
  const scopes = [root];
  let opened = 0;
  let line = 0;
  let cur = { words: [], expands: [], nested: [], from: 0 };
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) cur.words.push(word);
    word = null;
  };
  const endCommand = () => {
    endWord();
    if (cur.words.length > 0) {
      cur.scope = scopes.at(-1);
      cur.heredocs = docs.slice(cur.from, line + 1).flat();
      out.push(cur);
    }
    cur = { words: [], expands: [], nested: [], from: line };
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '\n') line += 1;
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
      line += (text.slice(i + 1, j + 1).match(/\n/g) ?? []).length;
      i = j;
      continue;
    }
    if (c === '`') {
      const j = text.indexOf('`', i + 1);
      const end = j < 0 ? text.length : j;
      cur.nested.push(text.slice(i + 1, end));
      word = (word ?? '') + text.slice(i, end + 1);
      line += (text.slice(i + 1, end + 1).match(/\n/g) ?? []).length;
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
    } else if (c === '(') {
      endCommand();
      scopes.push(`${scopes.at(-1)}/${(opened += 1)}`);
    } else if (c === ')') {
      endCommand();
      if (scopes.length > 1) scopes.pop();
    } else if (/[;|&\n]/.test(c)) {
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

/** Every simple command in the text, nested ones included; a nested one runs in a child scope. */
function commandsOf(command) {
  const { text, docs } = takeHeredocs(command);
  const all = [];
  let nests = 0;
  const visit = (shell, heredocs, scope, depth) => {
    for (const cmd of simpleCommands(shell, heredocs, scope)) {
      all.push(cmd);
      if (depth > 2) continue;
      const inner = [...cmd.nested];
      const at = cmd.words.findIndex((w) => w === '-c');
      if (at > 0 && isShell(cmd.words[at - 1]) && cmd.words[at + 1]) inner.push(cmd.words[at + 1]);
      for (const nested of inner) visit(nested, [], `${cmd.scope}/n${(nests += 1)}`, depth + 1);
    }
  };
  visit(text, docs, '0', 0);
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
      if (!expandsCredential(assign[2])) own.add(assign[1]);
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
  // After an interpreter, any file it is given may be the program, extension or not; a file run
  // directly is judged by its extension, since every word of every command would otherwise be read.
  const candidates = at >= 0 ? words.slice(at + 1).filter((w) => !w.startsWith('-')) : commandWords(words).slice(0, 1).filter((w) => SCRIPT.test(w));
  const files = [];
  for (const word of candidates) {
    const file = isAbsolute(word) ? word : resolve(dir, word);
    if (statSync(file, { throwIfNoEntry: false })?.isFile()) files.push(file);
  }
  return files;
}

/** The repository-relative path of a tracked file, or null for a one-off (untracked, or outside any repository). One git call. */
function trackedPath(file) {
  const listed = gitOutput(dirname(file), ['ls-files', '--full-name', '--error-unmatch', '--', base(file)]);
  return listed ? listed.trim() : null;
}

/** Supabase CLI commands that act only on this machine; any other acts on a hosted project. */
const LOCAL_DEFAULT = { db: ['reset', 'diff', 'lint', 'start'], migration: ['new', 'up', 'down', 'squash'], functions: ['new', 'serve'], gen: ['types', 'signing-key', 'keys'] };
const LOCAL_CLI = new Set(['start', 'stop', 'status', 'init', 'help', 'completion', 'login', 'logout', 'services', 'test', 'seed', 'bootstrap', ...Object.keys(LOCAL_DEFAULT)]);
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
  // Cheapest first: in a cloud session the credentials are always armed, so `ls` and `git status`
  // end at the text test rather than in the parser.
  if (!MAY_REACH.test(command)) return null;
  const armed = armedCredentials(env, command);
  if (armed.length === 0) return null;
  // An env file loads the credentials after any `env -u` or assignment, so with one nothing a
  // command sets itself counts.
  const envFile = armed === CREDENTIALS && ENV_FILE.test(command);

  const reasons = [];
  // Where each shell scope stands after its `cd`s: a subshell starts from its parent's directory,
  // and its own `cd` stays inside it. Used only to find the script files a command runs.
  const dirs = new Map([['0', cwd]]);
  const dirOf = (scope) => {
    if (!dirs.has(scope)) dirs.set(scope, dirOf(scope.slice(0, scope.lastIndexOf('/'))));
    return dirs.get(scope);
  };
  // Bash joins a backslash-newline before it reads anything, so this does too.
  for (const cmd of commandsOf(command.replace(/\\\r?\n/g, ''))) {
    const { expands, heredocs, scope } = cmd;
    // The words a shell reads before the command itself (`{ cmd; }`, `if cmd`, `do cmd`, `! cmd`).
    const lead = cmd.words.findIndex((w) => !SHELL_WORDS.has(w));
    if (lead < 0) continue;
    const words = cmd.words.slice(lead);
    const [head, arg] = words;
    if (head === 'cd' || head === 'pushd') {
      if (!arg || arg === '~') dirs.set(scope, homedir());
      else if (!arg.includes('$') && arg !== '-') dirs.set(scope, resolve(dirOf(scope), arg.replace(/^~(?=[\\/])/, homedir())));
      continue;
    }

    const own = envFile ? new Set() : prefixOverrides(words);
    // What the program it starts can read. The shell expands `$NAME` in this command's own
    // arguments BEFORE an assignment or `env -u` on it applies, so expansions are judged
    // against every armed credential, not only these.
    const live = armed.filter((name) => !own.has(name));

    // A production tool allows this simple command, and nothing else in the line. Each file is
    // read once; git is asked only about a possible tool or a one-off that reads a live
    // credential, so an ordinary `node x.mjs` costs one read and no git call.
    const files = scriptsRun(words, dirOf(scope)).map((file) => {
      const text = safeRead(file);
      const named = live.filter((name) => text.includes(name));
      const tool = TOOL_FILES.has(base(file)) && CREDENTIALS.some((name) => text.includes(name));
      const oneOff = named.length > 0 && READS_ENV.test(text);
      return { file, named, oneOff, rel: tool || oneOff ? trackedPath(file) : null };
    });
    // Only when the tool IS the program: the first file the interpreter is given, with no code of
    // its own beside it (`node -e '...' scripts/admin.mjs` runs the `-e` code, not the tool).
    const entry = files[0];
    if (entry?.rel && PRODUCTION_TOOLS.includes(entry.rel) && !words.some((w) => RUNS_OTHER_CODE.test(w))) continue;

    const name = commandWords(words)[0] ?? words[0];
    // What this command names: its words, and every heredoc its line feeds it. A text tool may
    // name a credential; anything else that names one is treated as using it.
    const named = namedIn([...words, ...heredocs.map((doc) => doc.body)].join('\n')).filter((cred) => live.includes(cred));
    const expanded = [...expands, ...heredocs.filter((doc) => !doc.quoted).flatMap((doc) => expansionsIn(doc.body))].filter((cred) => armed.includes(cred));
    const text = TEXT_TOOLS.has(name) && !(TEXT_TOOLS.get(name) && words.some((w) => TEXT_TOOLS.get(name).test(w)));
    if (named.length > 0 && !text) reasons.push(`\`${name}\` names ${named.join(' and ')} and is not plain text work`);
    else if (expanded.length > 0 && !TESTS.has(name)) reasons.push(`\`${name}\` expands ${[...new Set(expanded)].join(' and ')}`);

    for (const { file, named: reads, oneOff, rel } of files) {
      if (oneOff && !rel) reasons.push(`${relative(cwd, file) || file} is a script not in the repository, and it reads ${reads.join(' and ')}`);
    }
    // The CLI is the one tool that sends the access token without being handed it.
    if (live.includes(ACCESS_TOKEN) && hostedSupabaseCli(words)) {
      reasons.push(`\`${commandWords(words).join(' ').slice(0, 60)}\` is a Supabase CLI command that acts on a hosted project`);
    }
  }
  if (reasons.length === 0) return null;

  return (
    `Blocked: this command could reach a hosted Supabase project with the admin key or the access token in this session's environment (#2560): ${[...new Set(reasons)].join('; ')}.\n` +
    'Those credentials point at PRODUCTION here. They stay in the environment for the deliberate production tools, and a one-off command or script may not use them: on 2026-11-13 one sent admin requests to production.\n' +
    'What to do:\n' +
    '  - Local work: start the local stack (supabase start) and give the command its own values, for example ' +
    '`env -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_SECRET_KEY -u SUPABASE_ACCESS_TOKEN SUPABASE_URL=http://127.0.0.1:54321 node my-script.mjs` ' +
    '(the unset or the value goes on the same command that runs the program; one in an earlier command does not count).\n' +
    '  - Searching or writing text that names a credential: keep it in its own command (grep, git commit, cat <<\'EOF\'), apart from a command that runs a program.\n' +
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
