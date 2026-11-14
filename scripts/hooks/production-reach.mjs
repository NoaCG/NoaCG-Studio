// A SHELL COMMAND MAY NOT REACH PRODUCTION WITH THE ADMIN KEY BY ACCIDENT (issue #2560).
//
// Cloud agent sessions carry the production project's address, its service-role key and the
// Supabase access token in their environment, on purpose: about twenty tools in scripts/ read them
// for deliberate production work (db-push, admin, feedback-digest, supabase-advisors and others),
// and the owner decided on 2026-11-14 (#2361) to keep them there and guard their use. On
// 2026-11-13 a worker's one-off script fell back to them and sent two admin "create user" requests
// to production. Nothing stood between a one-off and the key.
//
// This decides, from the command text and nothing else on the network, whether a command would
// use one of those credentials while they point at a project the session does not own:
//
//   ARMED      the environment holds the service-role key and its backend URL is not a local
//              stack, or it holds the access token (which opens the management API for every
//              project), or the command loads an env file (`--env-file`), whose contents a hook
//              cannot see.
//   REACHES    the command text uses a credential's VALUE (`$NAME`, `process.env.NAME`,
//              `os.environ['NAME']`, ...), names the management API host, runs a Supabase CLI
//              command that talks to a hosted project, or runs a script file that is not tracked
//              in git and reads a credential from its environment. A file tracked in the
//              repository was reviewed and is not read here; a one-off was not.
//   ALLOWED    the command runs one of PRODUCTION_TOOLS, or sets every credential it uses itself
//              (`NAME=... cmd`, `env -u NAME cmd`, `unset NAME`).
//
// It is a seatbelt against an accident, not a wall against someone set on getting through: a
// script that builds the variable name at run time, or a tracked file edited to call production,
// is not seen. Naming a variable without using it (`grep -rn SUPABASE_SERVICE_ROLE_KEY scripts`)
// is not a use.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';import { KEY_VARS, URL_VARS, isLocalStackUrl } from '../configured-target.mjs';
import { stripHeredocBodies } from '../command-match.mjs';

export const ACCESS_TOKEN = 'SUPABASE_ACCESS_TOKEN';
export const MANAGEMENT_HOST = 'api.supabase.com';

/**
 * The deliberate production tools: every tracked script in scripts/ that reads one of these
 * credentials on purpose. A command that runs one of them may use the credentials however it
 * likes (`SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN node scripts/supabase-advisors.mjs`).
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

const ADMIN_KEYS = KEY_VARS;
const CREDENTIALS = [...ADMIN_KEYS, ACCESS_TOKEN];
const SCRIPT = /\.(?:[cm]?[jt]s|py|sh)$/i;
const RUNNERS = new Set(['node', 'tsx', 'ts-node', 'bun', 'deno', 'python', 'python3', 'bash', 'sh', 'zsh']);
const WRAPPERS = new Set(['npx', 'env', 'timeout', 'nice', 'exec', 'time', 'command', 'sudo']);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A use of the variable's VALUE in shell, PowerShell, JavaScript or Python. */
function valueUse(name) {
  const n = esc(name);
  return new RegExp(
    `(?:\\$\\{?${n}\\b|\\$env:${n}\\b|%${n}%|\\benv\\.${n}\\b|\\benv\\[\\s*['"\`]${n}['"\`]|environ(?:\\.get\\(|\\[)\\s*['"]${n}['"]|getenv\\(\\s*['"]${n}['"]|env\\.get\\(\\s*['"]${n}['"]|\\{[^}]*\\b${n}\\b[^}]*\\}\\s*=\\s*(?:process\\.env|import\\.meta\\.env|Deno\\.env))`,
  );
}

/** A file reads `name` from its environment: it names the variable and reads an environment. */
const readsEnv = /process\.env|import\.meta\.env|os\.environ|os\.getenv|Deno\.env|\$\{?[A-Z_]+|\$env:/;

/** Which credentials this environment arms, and why, or [] when nothing points anywhere it should not. */
export function armedCredentials(env, command = '') {
  if (/--env-file\b/.test(command)) return CREDENTIALS;
  const armed = [];
  const urls = URL_VARS.map((name) => (env[name] ?? '').trim()).filter(Boolean);
  // An admin key with no URL beside it is still a key to somewhere; only a local stack disarms it.
  const remote = urls.length === 0 || urls.some((url) => !isLocalStackUrl(url));
  if (remote) armed.push(...ADMIN_KEYS.filter((name) => (env[name] ?? '').trim() !== ''));
  if ((env[ACCESS_TOKEN] ?? '').trim() !== '') armed.push(ACCESS_TOKEN);
  return armed;
}

/**
 * The command split into simple commands, each as its words. Quotes hold a word together and
 * an operator inside them is text (`sed 's|a|b|' f.mjs` is one command). The payload of
 * `bash -c '...'` and of `$(...)` is split again, so a script run from inside one is still seen.
 */
function segments(command, depth = 0) {
  const out = [];
  let words = [];
  let word = null;
  let quote = null;
  const endWord = () => {
    if (word !== null) words.push(word);
    word = null;
  };
  const endSegment = () => {
    endWord();
    if (words.length > 0) out.push(words);
    words = [];
  };
  const text = stripHeredocBodies(command);
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = null;
      else word = (word ?? '') + c;
    } else if (c === '"' || c === "'") {
      quote = c;
      word = word ?? '';
    } else if (/[;|&\n()`]/.test(c)) {
      endSegment();
    } else if (/\s/.test(c)) {
      endWord();
    } else {
      word = (word ?? '') + c;
    }
  }
  endSegment();
  if (depth > 1) return out;
  const nested = out.flatMap((ws) => {
    const at = ws.findIndex((w) => w === '-c');
    const shell = at > 0 && /(?:^|[\\/])(?:ba|z)?sh$/.test(ws[at - 1]) && ws[at + 1];
    const subs = ws.filter((w) => /\$\(|`/.test(w));
    return [...(shell ? segments(shell, depth + 1) : []), ...subs.flatMap((w) => segments(w.replace(/\$\(/g, ';'), depth + 1))];
  });
  return [...out, ...nested];
}

/** The words after leading assignments and wrappers (`FOO=1 timeout 60 npx tsx x.ts` -> `tsx x.ts`). */
function commandWords(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (w === '-u' || w === '--unset') i += 2;
    else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w) || WRAPPERS.has(w) || /^-/.test(w) || /^\d+[smh]?$/.test(w)) i += 1;
    else break;
  }
  return words.slice(i);
}

/** Script files a command runs: the file a runner is given, or a file run directly. */
function scriptsRun(command, cwd) {
  const files = [];
  for (const words of segments(command)) {
    const rest = commandWords(words);
    if (rest.length === 0) continue;
    const runner = rest[0].split(/[\\/]/).pop();
    const candidates = RUNNERS.has(runner) ? rest.slice(1).filter((w) => !w.startsWith('-')) : [rest[0]];
    for (const word of candidates.slice(0, 1)) {
      if (!SCRIPT.test(word)) continue;
      const file = isAbsolute(word) ? word : resolve(cwd, word);
      if (existsSync(file) && statSync(file).isFile()) files.push(file);
    }
  }
  return [...new Set(files)];
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

/** Credentials the command sets or unsets itself, so it does not take the ambient value. */
function overridden(command) {
  const set = new Set();
  for (const name of CREDENTIALS) {
    const n = esc(name);
    if (new RegExp(`(?:^|[\\s;&|(])(?:${n}=|unset\\s+(?:\\S+\\s+)*${n}\\b|-u\\s+${n}\\b|--unset=${n}\\b|Remove-Item\\s+env:${n}\\b)`).test(command)) set.add(name);
  }
  return set;
}

/** Does a Supabase CLI command in this text talk to a hosted project through the management API? */
function hostedSupabaseCli(command) {
  for (const words of segments(command)) {
    const rest = commandWords(words);
    const at = rest.findIndex((w) => /(?:^|[\\/])supabase$/.test(w));
    if (at < 0) continue;
    const args = rest.slice(at + 1);
    if (args.some((w) => /^--(?:linked|project-ref|project-id)\b/.test(w))) return true;
    const local = args.some((w) => /^--(?:local|db-url)\b/.test(w));
    const [sub, verb] = args.filter((w) => !w.startsWith('-'));
    if (['link', 'projects', 'orgs', 'secrets', 'branches', 'sso', 'domains', 'vanity-subdomains', 'snippets', 'backups'].includes(sub)) return true;
    if (sub === 'functions' && ['deploy', 'delete', 'download', 'list'].includes(verb)) return true;
    if ((sub === 'db' && ['push', 'pull', 'dump'].includes(verb)) || sub === 'inspect') return !local;
  }
  return false;
}

/**
 * The refusal for this command, or null when it may run.
 *
 * `env` is the session's environment (the hook inherits it); `cwd` resolves the scripts a command
 * names. Tests pass a fake environment and fake files, so nothing here ever reaches a network.
 */
export function productionReachRefusal(command, { env = process.env, cwd = process.cwd() } = {}) {
  const armed = armedCredentials(env, command);
  if (armed.length === 0) return null;

  // An env file loads the credentials after any `env -u` or assignment here, so with one nothing
  // the command sets itself counts.
  const own = /--env-file\b/.test(command) ? new Set() : overridden(command);
  const live = armed.filter((name) => !own.has(name));
  if (live.length === 0) return null;

  // Scripts first: one of the production tools allows the whole command. A file is read only to
  // see whether it names a credential, and git is asked about it only then, so an ordinary
  // `node x.mjs` costs one read.
  const reasons = [];
  for (const file of scriptsRun(command, cwd)) {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const named = live.filter((name) => text.includes(name));
    if (named.length === 0) continue;
    const rel = trackedPath(file);
    if (rel && PRODUCTION_TOOLS.includes(rel)) return null;
    if (!rel && readsEnv.test(text)) reasons.push(`it runs ${relative(cwd, file) || file}, a script not in the repository that reads ${named.join(' and ')}`);
  }

  const used = live.filter((name) => valueUse(name).test(command));
  if (used.length > 0) reasons.unshift(`it uses ${used.join(' and ')}`);
  if (live.includes(ACCESS_TOKEN)) {
    if (command.toLowerCase().includes(MANAGEMENT_HOST)) reasons.push(`it calls the Supabase management API (${MANAGEMENT_HOST})`);
    if (hostedSupabaseCli(command)) reasons.push('it runs a Supabase CLI command that talks to a hosted project');
  }
  if (reasons.length === 0) return null;

  return (
    `Blocked: this command could reach a hosted Supabase project with the admin key or the access token in this session's environment: ${reasons.join('; ')} (#2560).\n` +
    "Those credentials point at PRODUCTION here. They stay in the environment for the deliberate production tools, and a one-off command or script may not use them: on 2026-11-13 one sent admin requests to production.\n" +
    'What to do:\n' +
    '  - Local work: start the local stack (supabase start) and set its values in the command itself, for example ' +
    '`SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=<from supabase status> node my-script.mjs`, ' +
    'or unset the variables for it (`env -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_SECRET_KEY -u SUPABASE_ACCESS_TOKEN ...`).\n' +
    `  - Deliberate production work: run the tool made for it (${PRODUCTION_TOOLS.map((p) => p.replace(/^scripts\//, '')).join(', ')} in scripts/), or ask the owner.`
  );
}
