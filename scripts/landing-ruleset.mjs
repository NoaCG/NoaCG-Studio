#!/usr/bin/env node
// The one ruleset on `main`: the merge queue is the only way onto it (docs/WORKFLOW_ARCHITECTURE.md
// §5.2).
//
//   node scripts/landing-ruleset.mjs            # print the ruleset GitHub holds, and the one this file wants
//   node scripts/landing-ruleset.mjs --apply    # create it, or update it to match
//   node scripts/landing-ruleset.mjs --apply --without-review   # bootstrap: before the Reviewed check exists on main
//
// Idempotent: the ruleset is found by NAME and updated in place. With "require merge queue" on,
// GitHub performs every merge itself and refuses direct pushes to main from anyone but a bypass
// actor, so "one lander" is a fact of the branch rather than a rule anybody remembers - and no
// workflow token ever needs to push main. The repository admin stays a bypass actor for
// emergencies; every use shows in the ruleset's insights.
//
// The required checks are the two the queue consumes: `CI gate` (ci.yml, on the pull request and
// again on the merge group) and `Reviewed` (ci.yml, the /check stamp read off the pull request
// head). Requiring `Reviewed` before that job exists on main would wedge the queue, hence
// `--without-review` for the one landing that brings it.
//
// Applying needs an organisation owner's `gh` login; the owner said yes on 2026-09-06.

import { execFileSync } from 'node:child_process';

export const RULESET_NAME = 'main is landed by the queue';
const REPOSITORY_ADMIN_ROLE_ID = 5;

/** The ruleset as it should be. Pure, so a test can pin it. */
export function desiredRuleset({ withReview = true } = {}) {
  const contexts = ['CI gate', ...(withReview ? ['Reviewed'] : [])];
  return {
    name: RULESET_NAME,
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [{ actor_id: REPOSITORY_ADMIN_ROLE_ID, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'merge_queue',
        parameters: {
          // A merge commit keeps every landed commit as it was verified; squashing would rewrite
          // what CI saw. Up to five pull requests are built and merged as one group.
          merge_method: 'MERGE',
          max_entries_to_build: 5,
          min_entries_to_merge: 1,
          max_entries_to_merge: 5,
          min_entries_to_merge_wait_minutes: 2,
          grouping_strategy: 'ALLGREEN',
          check_response_timeout_minutes: 60,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          do_not_enforce_on_create: false,
          required_status_checks: contexts.map((context) => ({ context })),
        },
      },
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
  const withReview = !process.argv.includes('--without-review');
  const slug = repo();
  const existing = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const wanted = desiredRuleset({ withReview });
  if (!apply) {
    console.log(`[landing-ruleset] ${slug}: ${existing ? `ruleset ${existing.id} "${existing.name}" (${existing.enforcement})` : 'no ruleset named as wanted'}`);
    console.log(JSON.stringify(wanted, null, 2));
    console.log('Run with --apply to create or update it.');
    return;
  }
  const body = JSON.stringify(wanted);
  if (existing) gh(['api', '--method', 'PUT', `repos/${slug}/rulesets/${existing.id}`, '--input', '-'], body);
  else gh(['api', '--method', 'POST', `repos/${slug}/rulesets`, '--input', '-'], body);
  const after = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const detail = JSON.parse(gh(['api', `repos/${slug}/rulesets/${after.id}`]));
  const checks = detail.rules.find((r) => r.type === 'required_status_checks')?.parameters.required_status_checks.map((c) => c.context) ?? [];
  console.log(`[landing-ruleset] ${existing ? 'updated' : 'created'} ruleset ${after.id} on ${slug}`);
  console.log(`  enforcement ${detail.enforcement}; rules ${detail.rules.map((r) => r.type).join(', ')}; required checks ${checks.join(', ')}; bypass ${detail.bypass_actors.map((a) => `${a.actor_type}:${a.actor_id}`).join(', ')}`);
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/landing-ruleset.mjs')) main();
