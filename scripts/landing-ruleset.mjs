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
/** The `github-actions[bot]` account, the actor a workflow's own token pushes as. */
const ACTIONS_BOT_USER_ID = 41898282;
const REPOSITORY_ADMIN_ROLE_ID = 5;

/**
 * The ruleset as it should be. Pure, so a test can pin it. `lander` says how the Land workflow
 * is allowed past the push restriction: as the Actions app ('integration', what an organisation
 * accepts), as the bot user ('user'), or not at all ('none' - then the `update` rule is left
 * out, since it would block the lander itself; deletion and rewrites stay forbidden, and the
 * single-lander property rests on the client and the hooks until the repository is in an
 * organisation). GitHub refuses the app on a user-owned repository: "Actor GitHub Actions
 * integration must be part of the ruleset source or owner organization" (2026-09-06).
 */
export function desiredRuleset({ lander = 'integration' } = {}) {
  const bypass = [{ actor_id: REPOSITORY_ADMIN_ROLE_ID, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  if (lander === 'integration') bypass.unshift({ actor_id: ACTIONS_APP_ID, actor_type: 'Integration', bypass_mode: 'always' });
  if (lander === 'user') bypass.unshift({ actor_id: ACTIONS_BOT_USER_ID, actor_type: 'User', bypass_mode: 'always' });
  const rules = [{ type: 'deletion' }, { type: 'non_fast_forward' }];
  // `update` is "pushes to this branch are restricted": only bypass actors may push at all.
  if (lander !== 'none') rules.push({ type: 'update' });
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: bypass,
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules,
  };
}

/** The shapes to try, strongest first; the first GitHub accepts is the one applied. */
export const LANDER_SHAPES = ['integration', 'user', 'none'];

function gh(args, input) {
  return execFileSync('gh', args, { encoding: 'utf8', input, windowsHide: true });
}

function repo() {
  return gh(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).trim();
}

export function findExisting(rulesets, name = RULESET_NAME) {
  return (rulesets ?? []).find((r) => r.name === name) ?? null;
}

/** Create or update; returns the shape GitHub accepted. A 422 on one shape tries the next. */
function applyRuleset(slug, existing) {
  for (const lander of LANDER_SHAPES) {
    const body = JSON.stringify(desiredRuleset({ lander }));
    try {
      if (existing) gh(['api', '--method', 'PUT', `repos/${slug}/rulesets/${existing.id}`, '--input', '-'], body);
      else gh(['api', '--method', 'POST', `repos/${slug}/rulesets`, '--input', '-'], body);
      return lander;
    } catch (error) {
      const refused = /422|Validation Failed/.test(String(error.stdout ?? error.message));
      if (!refused) throw error;
      console.log(`[landing-ruleset] GitHub refused the "${lander}" shape: ${String(error.stdout ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }
  throw new Error('every ruleset shape was refused');
}

function main() {
  const apply = process.argv.includes('--apply');
  const slug = repo();
  const existing = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  if (!apply) {
    console.log(`[landing-ruleset] ${slug}: ${existing ? `ruleset ${existing.id} "${existing.name}" (${existing.enforcement})` : 'no ruleset named as wanted'}`);
    console.log(JSON.stringify(desiredRuleset(), null, 2));
    console.log('Run with --apply to create or update it (weaker shapes are tried if GitHub refuses this one).');
    return;
  }
  const lander = applyRuleset(slug, existing);
  const after = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const detail = JSON.parse(gh(['api', `repos/${slug}/rulesets/${after.id}`]));
  console.log(`[landing-ruleset] ${existing ? 'updated' : 'created'} ruleset ${after.id} on ${slug} with the "${lander}" shape`);
  console.log(`  enforcement ${detail.enforcement}; rules ${detail.rules.map((r) => r.type).join(', ')}; bypass ${detail.bypass_actors.map((a) => `${a.actor_type}:${a.actor_id}`).join(', ')}`);
  if (lander === 'none') {
    console.log('  NOTE: pushes to main are not restricted by GitHub on a user-owned repository; the single lander rests on the client and the hooks until the repository moves to an organisation.');
  }
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/landing-ruleset.mjs')) main();
