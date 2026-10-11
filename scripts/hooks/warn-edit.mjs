// PostToolUse notice for the Write tool: THIS NEW MIGRATION'S NUMBER IS ALREADY CLAIMED SOMEWHERE
// ELSE IN THIS REPOSITORY. The gate is a path match, so an ordinary Write pays one `relative()` call.
//
// WHY THAT NEEDS A HOOK. A migration number is a scarce slot with no allocator, and two branches
// that both mint 0053 collide in a way every downstream mechanism is blind to: they touch no
// common file, so `git merge-tree` finds no conflict, `merge-order.mjs` returns `clear`, and both
// land into a ledger holding two different 0053s. Nothing says so until `db-push.mjs` refuses onto
// the drifted ledger, by which time both are on `main`. The full reasoning is in
// `scripts/migration-collision.mjs`; this file is the git half of it.
//
// A NOTICE, NOT A REFUSAL, and for a weaker reason than its siblings: this is the one of the three
// guardrails with no dated incident behind it, only the collision class the merge-order contract
// already names. A refusal on that evidence would be the guard being more certain than the case
// is, and the answer is sometimes legitimately "keep the number and renumber the other branch".
//
// WRITE ONLY, not Edit. The rule is about MINTING a number, which only happens when the file is
// created; an Edit to an existing migration claims nothing new. That also keeps the extra process
// off the tool that runs most often.
//
// KNOWN GAP, stated rather than implied: the Write tool is not the only way a file gets created.
// `cat > supabase/migrations/0053_x.sql <<'EOF'` through the shell tool creates one with no Write
// event, and this environment's own instructions steer towards heredocs. Closing it means teaching
// the shell notice next door to read a redirect target, which is a different matcher with a
// different failure mode; until then a migration written that way is not checked.
//
// COST. Measured 2026-09-02 on this laptop: 50 ms on an ordinary Write, which is node starting up,
// because the only unconditional work is a path match. The all-refs traversal costs about 170 ms
// with 97 local branches, and runs only for a file under supabase/migrations.

import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { readHookInput, warn, gitOutput } from './lib.mjs';
import { collisions, migrationVersion, nextFreeVersion, parseAddedPaths } from '../migration-collision.mjs';

const input = await readHookInput();
const filePath = input?.tool_input?.file_path;
if (typeof filePath !== 'string' || filePath.length === 0) process.exit(0);

const root = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
const rel = relative(root, resolve(root, filePath)).replaceAll('\\', '/');

const version = migrationVersion(rel);
if (!version) process.exit(0);

// Everything below runs for a migration file and nothing else.
//
// TWO PLACES CAN HOLD THE NUMBER, and they fail differently. On disk beside it is the easy one -
// a second file in this very worktree, which a listing would have shown. The one that costs a
// landing is a number claimed on ANOTHER BRANCH, invisible from here by construction, which is
// why the check reaches for every ref rather than the working tree.
const onDisk = listMigrations(root).map((name) => `supabase/migrations/${name}`);
const everywhere = parseAddedPaths(
  gitOutput(root, ['log', '--all', '--diff-filter=A', '--name-only', '--format=%H', '--', 'supabase/migrations/']) ?? '',
);

// The committed answer goes FIRST, because `collisions` keeps the first row it sees for a path and
// the two sources overlap on every migration that is both checked out and committed. A row with a
// commit behind it can say WHO holds the number; the working-tree row can only say "here", which
// is the less useful half of the same fact.
const clashes = collisions(version, rel, [...everywhere, ...onDisk.map((path) => ({ sha: null, path }))]);
if (clashes.length === 0) process.exit(0);

const claimed = [...new Set([...onDisk, ...everywhere.map((e) => e.path)].map(migrationVersion).filter(Boolean))];
const lines = [...new Set(clashes.map((clash) => `  ${clash.path}${where(root, clash.sha)}`))];

warn(
  `Heads up: migration ${version} is already claimed elsewhere in this repository, so ${rel} is a ` +
    'second file minting the same number:\n' +
    `${lines.join('\n')}\n` +
    'Two branches on one number merge CLEANLY - they share no file, so merge-order returns `clear` - ' +
    `and land a ledger holding two different ${version}s. Nothing reports it until \`npm run db:push\` ` +
    'refuses onto the drifted ledger, with both already on `main`.\n' +
    `Renumber this one to ${nextFreeVersion(claimed)} (the lowest free number across every branch, not ` +
    'just this worktree), unless the other claim is the one that should move - in which case say so ' +
    'in the pull request, because whoever lands second inherits the problem.',
);

/** The migration filenames in this checkout's working tree, or [] when there are none. */
function listMigrations(cwd) {
  try {
    return readdirSync(resolve(cwd, 'supabase', 'migrations')).filter((name) => name.endsWith('.sql'));
  } catch {
    return [];
  }
}

/** Which branches carry the commit that added a colliding file - the fact that names the owner. */
function where(cwd, sha) {
  if (!sha) return '  (in this worktree)';
  const branches = (gitOutput(cwd, ['branch', '--contains', sha, '--format=%(refname:short)']) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (branches.length === 0) return '';
  // A migration that reached `main` is on every branch that has taken main in since, so the list
  // is long and its only useful member is `main` itself: it means the number is simply spent.
  if (branches.includes('main')) return '  (on main - the number is spent)';
  return `  (on ${branches.slice(0, 3).join(', ')}${branches.length > 3 ? `, +${branches.length - 3} more` : ''})`;
}
