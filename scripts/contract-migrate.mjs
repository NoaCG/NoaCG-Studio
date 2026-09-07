#!/usr/bin/env node
// THE MIGRATION AUDIT: nothing a contract knew may be lost when it becomes rules and records.
//
//   node scripts/contract-migrate.mjs tokens <file>
//   node scripts/contract-migrate.mjs audit --contract src/templates/AGENTS.md --since <ref> \
//       [--area templates] [--also docs/SOME_DOC.md] [--allow contracts/migrations/<area>.json]
//
// WHY. Phase 2b (docs/WORKFLOW_ARCHITECTURE.md §5.3, §7) moves 108 hand-written contracts into
// the rule store, one area per row. A row that quietly drops a rule looks exactly like a row that
// moved it: both leave a smaller file and a green build. The plan names one gate for that, and
// this is it - the set of backticked tokens in the contract BEFORE the row must be a subset of
// the tokens in what replaced it. A symbol is the smallest thing a contract can be wrong about
// losing: a path, a flag, a function, a class, an npm command.
//
// WHAT "WHAT REPLACED IT" MEANS. The union of three things: the contract file as it stands now
// (a row may leave prose behind and take it in a later row), every rule under
// `contracts/rules/<area>/`, and every record under `contracts/records/<area>/`. Records count
// because that is where the evidence goes: a measurement, a run id and the incident that produced
// the rule are supposed to leave the loaded file, not the repository.
//
// A TOKEN MAY BE DROPPED DELIBERATELY, and then it is written down: `--allow <file>` reads a JSON
// map of token to reason, and a reason is required. Two mentions of the same helper collapsing
// into one rule is the common case, and the audit cannot tell that from a rule going missing -
// only the person doing the row can, once, in writing.
//
// WHAT IT CANNOT SEE, and no version of it will: a rule written without a backtick. Measured on
// `src/templates/versus/AGENTS.md`, the smallest contract in the tree - it carries three tokens,
// and its actual content ("f0/f1 team names, f2 event line, steps '1' because the sides are
// simultaneous") is prose. So this gate proves nothing was dropped from the SYMBOLS a contract
// named; the row's own reading is what carries the rest. Treat a green audit as a floor, never as
// a verdict that the migration was faithful.
//
// It reads git for the BEFORE side, so the row can be audited after the edit rather than before.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every backticked token in a markdown file, normalized. Fenced blocks are dropped first: a code
 * fence is an example, and holding a migration to every identifier inside one would make the gate
 * unusable on the first row.
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function tokensOf(text) {
  const withoutFences = String(text ?? '').replace(/^```[\s\S]*?^```/gm, '\n');
  const tokens = new Set();
  for (const match of withoutFences.matchAll(/`([^`\n]+)`/g)) {
    const token = match[1].trim().replace(/\s+/g, ' ');
    if (token) tokens.add(token);
  }
  return tokens;
}

/**
 * What the contract knew and the replacement does not. Pure: this decides whether a migration row
 * may land, so it has to be checkable without a repository.
 *
 * @param {{ before: Set<string>|string[], after: Set<string>|string[], allow?: Record<string,string> }} input
 * @returns {{ missing: string[], allowed: string[], problems: string[] }}
 */
export function survivingTokens({ before, after, allow = {} }) {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const missing = [];
  const allowed = [];
  const problems = [];
  for (const token of [...beforeSet].sort()) {
    if (afterSet.has(token)) continue;
    if (Object.prototype.hasOwnProperty.call(allow, token)) {
      const reason = allow[token];
      if (!reason || String(reason).trim().length < 12) {
        problems.push(`"${token}" is allowed to drop with no reason worth reading - say what took its place, or keep it`);
      }
      allowed.push(token);
      continue;
    }
    missing.push(token);
  }
  // An allowance for a token that never went missing is a list rotting, the same way an exemption
  // for a wired-up gate is. It is reported, not fatal: the row that fixes it is the one that reads
  // this line.
  for (const token of Object.keys(allow)) {
    if (beforeSet.has(token) && !afterSet.has(token)) continue;
    problems.push(`"${token}" is on the allow list but did not drop - delete the entry`);
  }
  return { missing, allowed, problems };
}

/** The area a contract belongs to: the store folder its rules live under. */
export function areaOf(contractPath) {
  const clean = String(contractPath).replaceAll('\\', '/');
  const dir = path.posix.dirname(clean);
  if (dir === '.' || dir === '') return 'root';
  return dir.replace(/^src\//, '').replace(/\//g, '-');
}

function git(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return res.status === 0 ? res.stdout : null;
}

function readIfPresent(file) {
  try {
    return readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return '';
  }
}

/** Every file under a store folder, or nothing when the folder does not exist yet. */
function storeFiles(area) {
  const out = git(['ls-files', `contracts/rules/${area}`, `contracts/records/${area}`]);
  return (out ?? '').split('\n').map((f) => f.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const flags = new Map();
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        const key = a;
        const existing = flags.get(key);
        flags.set(key, existing ? [].concat(existing, next) : next);
        i += 1;
      } else flags.set(a, true);
    } else positional.push(a);
  }
  return { command: positional[0], rest: positional.slice(1), flags };
}

function main(argv) {
  const { command, rest, flags } = parseArgs(argv);

  if (command === 'tokens') {
    const file = rest[0];
    if (!file) {
      console.error('tokens: name a file.');
      return 2;
    }
    for (const token of [...tokensOf(readIfPresent(file))].sort()) console.log(token);
    return 0;
  }

  if (command === 'audit') {
    const contract = flags.get('--contract');
    const since = flags.get('--since');
    if (typeof contract !== 'string' || typeof since !== 'string') {
      console.error('audit: --contract <path> and --since <ref> are both required.');
      return 2;
    }
    const beforeText = git(['show', `${since}:${contract}`]);
    if (beforeText === null) {
      console.error(`audit: cannot read ${contract} at ${since} - name the ref the row started from.`);
      return 2;
    }
    const area = typeof flags.get('--area') === 'string' ? flags.get('--area') : areaOf(contract);
    const also = [].concat(flags.get('--also') ?? []).filter((f) => typeof f === 'string');
    const afterFiles = [contract, ...storeFiles(area), ...also];
    const after = new Set();
    for (const file of afterFiles) for (const token of tokensOf(readIfPresent(file))) after.add(token);

    let allow = {};
    const allowFile = flags.get('--allow');
    if (typeof allowFile === 'string') {
      try {
        allow = JSON.parse(readIfPresent(allowFile));
      } catch {
        console.error(`audit: could not read the allow list ${allowFile} as JSON.`);
        return 2;
      }
    }

    const before = tokensOf(beforeText);
    const { missing, allowed, problems } = survivingTokens({ before, after, allow });
    console.log(`[contract-migrate] ${contract} at ${since}: ${before.size} token(s)`);
    console.log(`  replaced by ${afterFiles.length} file(s) under area "${area}": ${after.size} token(s)`);
    if (allowed.length > 0) console.log(`  ${allowed.length} dropped with a written reason`);
    for (const problem of problems) console.log(`  note: ${problem}`);
    if (missing.length > 0) {
      console.error(`\n${missing.length} token(s) the contract knew and nothing now carries:\n`);
      for (const token of missing) console.error(`  \`${token}\``);
      console.error('\nEach one is either a rule that has not been written yet, or a deliberate drop.');
      console.error('Write the rule, or add the token to an --allow file with the reason it went.');
      return 1;
    }
    console.log('\nEvery token the contract carried survives in the store, the file, or a written drop.');
    return 0;
  }

  console.error('usage: contract-migrate.mjs tokens <file> | audit --contract <path> --since <ref> [--area <a>] [--also <file>] [--allow <file>]');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
