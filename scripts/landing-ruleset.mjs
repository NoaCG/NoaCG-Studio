#!/usr/bin/env node
// The one ruleset on `main`: only the lander (GitHub Actions) and the repository admin may push
// it, nobody may delete or rewrite it (docs/WORKFLOW_ARCHITECTURE.md §5.2).
//
//   node scripts/landing-ruleset.mjs            # print the ruleset GitHub holds, and the one this file wants
//   node scripts/landing-ruleset.mjs --apply    # create it, or update it to match
//
// Idempotent: the ruleset is found by NAME and updated in place. Rulesets are the mechanism that
// makes "one lander" a fact rather than a rule somebody remembers: with the `update` rule active,
// a push to main from a session's laptop is refused by GitHub itself. The repository admin stays
// a bypass actor on purpose - an emergency needs a door, and every use of it shows in the
// ruleset's own insights - and can be removed here when the lander has run for a while.
//
// Applying needs the owner's `gh` login (admin on the repository); the owner said yes to this on
// 2026-09-06. The Actions app id (15368) and the admin role id (5) are GitHub's fixed values.

import { execFileSync } from 'node:child_process';

export const RULESET_NAME = 'main is landed by the queue';
const ACTIONS_APP_ID = 15368;
const REPOSITORY_ADMIN_ROLE_ID = 5;

/** The ruleset as it should be. Pure, so a test can pin it. */
export function desiredRuleset() {
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [
      { actor_id: ACTIONS_APP_ID, actor_type: 'Integration', bypass_mode: 'always' },
      { actor_id: REPOSITORY_ADMIN_ROLE_ID, actor_type: 'RepositoryRole', bypass_mode: 'always' },
    ],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      // `update` is "pushes to this branch are restricted": only bypass actors may push at all.
      { type: 'update' },
    ],
  };
}

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, windowsHide: true });
}

function repo() {
  return gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
}

export function findExisting(rulesets, name = RULESET_NAME) {
  return (rulesets ?? []).find((r) => r.name === name) ?? null;
}

function main() {
  const apply = process.argv.includes('--apply');
  const slug = repo();
  const existing = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const wanted = desiredRuleset();
  if (!apply) {
    console.log(`[landing-ruleset] ${slug}: ${existing ? `ruleset ${existing.id} "${existing.name}" (${existing.enforcement})` : 'no ruleset named as wanted'}`);
    console.log(JSON.stringify(wanted, null, 2));
    console.log('Run with --apply to create or update it.');
    return;
  }
  const body = JSON.stringify(wanted);
  if (existing) {
    gh(['api', '--method', 'PUT', `repos/${slug}/rulesets/${existing.id}`, '--input', '-'], body);
    console.log(`[landing-ruleset] updated ruleset ${existing.id} on ${slug}`);
  } else {
    const created = JSON.parse(gh(['api', '--method', 'POST', `repos/${slug}/rulesets`, '--input', '-'], body));
    console.log(`[landing-ruleset] created ruleset ${created.id} on ${slug}`);
  }
  const after = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const detail = JSON.parse(gh(['api', `repos/${slug}/rulesets/${after.id}`]));
  console.log(`  enforcement ${detail.enforcement}; rules ${detail.rules.map((r) => r.type).join(', ')}; bypass ${detail.bypass_actors.map((a) => `${a.actor_type}:${a.actor_id}`).join(', ')}`);
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/landing-ruleset.mjs')) main();
