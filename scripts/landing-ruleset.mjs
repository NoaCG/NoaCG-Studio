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
          // MERGE, BECAUSE FOUR SCRIPTS DEFINE "LANDED" AS COMMIT CONTAINMENT, and only a merge
          // commit makes a branch an ancestor of main. `cleanup-worktrees.mjs` reclaims a worktree
          // when `rev-list --count <branch> --not origin/main` is 0; `jobs.mjs` calls a branch
          // unlanded while `origin/main..<branch>` is non-empty, in two paths; `merge-order.mjs`
          // ranks by that same count and holds a branch that CONTAINS another until the other
          // lands; `worktree-activity.mjs` measures a session's work the same way and lists
          // worktree-less branches with `branch --no-merged`. (Which main ref differs - the first
          // two resolve `origin/main`, `merge-order` still counts against the local `main` - and
          // the argument holds for either.) Under SQUASH none of those ever becomes true: the
          // branch's commits are not on main, and its tree stops matching main's the moment the
          // next landing arrives, so `possiblySquashMerged` misses too. Every landed branch would
          // stay "ahead of main" forever - no worktree reclaimed on a disk-bound laptop,
          // `npm run jobs` filling with finished work, and a stacked child held by a parent that
          // already landed.
          //
          // NOT because of what CI saw: that reason was here until 2026-09-09 and it is false. The
          // queue re-runs `ci.yml` on the merge group (`merge_group`, on
          // `gh-readonly-queue/main/pr-N-<sha>`), so `CI gate` judges the TREE of a temporary merge
          // - and squash and merge both land exactly that tree. Squash discards commit objects, not
          // bytes. Measured before deciding: `e2e-affected.mjs`'s fork-point planner, the piece
          // that looked most at risk, gives an identical file plan under both, because main having
          // no merge commits is the same answer as its stop-line finding one.
          //
          // Squash would buy two real things and neither pays for the above: `git revert <sha>`
          // instead of `revert -m 1 <sha>`, and no agent fixup commits on main. The second is
          // already had - `git log --first-parent` shows one line per landing, which is what
          // `revert-landing.mjs`, `deploy-affecting-paths.mjs` and `red-main-issue.mjs` all read.
          //
          // Up to five pull requests are built and merged as one group.
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

/** `gh api` parsed, or null when it could not be read. `gh` throws on any non-zero exit. */
function readJson(args) {
  try {
    return JSON.parse(gh(args));
  } catch {
    return null;
  }
}

/**
 * THE MECHANICAL LANDINGS NEED ONE MORE SETTING: "Allow GitHub Actions to create and approve pull
 * requests", off by default on an organisation and on every repository in it. Without it a
 * quarantine entry or a revert (scripts/queue-pr.mjs) pushes its branch and is refused at
 * `gh pr create`; with it the pull request goes through the same queue as everything else. The
 * organisation half needs an owner's `gh` login WITH the `admin:org` scope
 * (`gh auth refresh -h github.com -s admin:org`), which a session's login usually lacks - so a
 * refusal here is reported with that command, and the ruleset above is applied either way.
 */
export function allowActionsPullRequests(slug) {
  const org = slug.split('/')[0];
  const payload = JSON.stringify({ default_workflow_permissions: 'read', can_approve_pull_request_reviews: true });
  for (const [scope, route] of [['organisation', `orgs/${org}/actions/permissions/workflow`], ['repository', `repos/${slug}/actions/permissions/workflow`]]) {
    try {
      gh(['api', '--method', 'PUT', route, '--input', '-'], payload);
      console.log(`[landing-ruleset] ${scope}: Actions may open pull requests.`);
    } catch (error) {
      const detail = String(error.stderr ?? error.message ?? '').split('\n').find((l) => l.trim()) ?? '';
      console.log(`[landing-ruleset] ${scope}: could not allow Actions to open pull requests (${detail.trim()}).`);
      console.log('  needs: account - an organisation owner runs:  gh auth refresh -h github.com -s admin:org  then  node scripts/landing-ruleset.mjs --apply');
      console.log('  Until then a quarantine entry or a revert is pushed and refused at `gh pr create`; the next run retries it.');
    }
  }
}

export function findExisting(rulesets, name = RULESET_NAME) {
  return (rulesets ?? []).find((r) => r.name === name) ?? null;
}

/**
 * EVERY field this file sets, flattened to name -> value, so a difference can be NAMED.
 *
 * Generic rather than a list of interesting fields, because a hand-written list is one somebody has
 * to remember to extend: the first draft of this named eight, and each of the six it left out
 * changes how a landing behaves while reporting a clean match - the ref EXCLUDE list (which can
 * make the ruleset govern nothing), `target`, the check timeout (ci.yml's own header says a run
 * takes six to nine minutes, so a five-minute timeout drops every group), both batch sizes and
 * `strict_required_status_checks_policy`.
 *
 * Two normalisations, because a difference in ORDER is not a difference in behaviour: rules are
 * keyed by `type`, and every list is sorted. Without them a ruleset GitHub returned in another
 * order reads as drift, and the advice that follows drift is `--apply`, which needs an owner's
 * login - so a false positive spends a `needs: account` ask on a ruleset that was already right.
 *
 * GitHub's own additions (`id`, `node_id`, timestamps, `_links`, `source`) are absent by
 * construction: nothing here reads a key this file does not set.
 */
export function rulesetFacts(ruleset) {
  const facts = {};
  if (!ruleset) return facts;
  const list = (values) => [...values].sort().join(', ');
  facts.enforcement = String(ruleset.enforcement ?? '');
  facts.target = String(ruleset.target ?? '');
  for (const side of ['include', 'exclude']) {
    facts[`branches ${side}`] = list(ruleset.conditions?.ref_name?.[side] ?? []);
  }
  facts.bypass = list((ruleset.bypass_actors ?? []).map((a) => `${a.actor_type}:${a.actor_id}:${a.bypass_mode}`));
  const rules = new Map((ruleset.rules ?? []).map((r) => [r.type, r.parameters ?? {}]));
  facts.rules = list(rules.keys());
  for (const [type, parameters] of rules) {
    for (const [key, value] of Object.entries(parameters)) {
      // The one array of objects inside a rule; every other parameter is a scalar.
      if (key === 'required_status_checks') facts['required checks'] = list(value.map((c) => c.context));
      else facts[`${type}.${key}`] = String(value);
    }
  }
  return facts;
}

/**
 * Every fact GitHub disagrees with this file about, sorted, as lines somebody can act on.
 *
 * This is the question the script exists to answer and until 2026-09-09 it did not: a plain run
 * printed the ruleset's id and then dumped the WANTED JSON, leaving a person to compare two
 * structures by eye - and the summary it printed came from the LIST endpoint, which carries no
 * `rules` at all, so the merge method was not even on screen to compare against.
 *
 * Only the keys this file sets are compared, so a field GitHub grows later is not drift until this
 * file has an opinion about it. Sorted, so the output does not depend on the order `rulesetFacts`
 * happens to build its keys in.
 *
 * @param {object|null} held the ruleset GitHub holds, read from `repos/{slug}/rulesets/{id}`
 */
export function rulesetDrift(held, wanted) {
  if (!held) return ['no ruleset of this name exists on GitHub'];
  const there = rulesetFacts(held);
  const here = rulesetFacts(wanted);
  return Object.keys(here)
    .filter((key) => there[key] !== here[key])
    .sort()
    .map((key) => `${key}: GitHub has ${there[key] || '(nothing)'}, this file wants ${here[key] || '(nothing)'}`);
}

function main() {
  const apply = process.argv.includes('--apply');
  const withReview = !process.argv.includes('--without-review');
  const slug = repo();
  const existing = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  if (!apply) {
    // THE READ PATH ALWAYS COMPARES AGAINST THE STEADY-STATE SHAPE, whatever `--without-review`
    // says. That flag describes the one bootstrap landing that brings the `Reviewed` job; against
    // today's `main` it asks for only `CI gate`, so the run reported drift on a correct ruleset and
    // then advised `--apply` - an instruction that DROPS the Reviewed requirement from main. The
    // flag belongs to applying, so it is read only there.
    const steady = desiredRuleset();
    // The list endpoint answers "does one exist"; only the detail endpoint carries the rules the
    // drift is about, so a found ruleset costs one more call. Unreadable is UNKNOWN, never a
    // finding - the rule `scripts/owner-preflight.mjs` states for the same question.
    const held = existing ? readJson(['api', `repos/${slug}/rulesets/${existing.id}`]) : null;
    console.log(`[landing-ruleset] ${slug}: ${existing ? `ruleset ${existing.id} "${existing.name}" (${existing.enforcement})` : 'no ruleset of this name'}`);
    if (existing && !held) {
      console.log('  Could not read the ruleset detail, so whether GitHub agrees with this file is unknown.');
      return;
    }
    const drift = rulesetDrift(held, steady);
    if (drift.length === 0) {
      console.log('  GitHub matches this file on every field it sets. Nothing to apply.');
      return;
    }
    for (const line of drift) console.log(`  DRIFT ${line}`);
    // The payload, because the person who can READ this is routinely not the person who can apply
    // it (see the header): this JSON is the body for
    // `gh api --method PUT repos/<slug>/rulesets/<id> --input -`.
    console.log(JSON.stringify(steady, null, 2));
    console.log('Run with --apply to update it, or PUT the JSON above.');
    process.exitCode = 1;
    return;
  }
  const wanted = desiredRuleset({ withReview });
  const body = JSON.stringify(wanted);
  if (existing) gh(['api', '--method', 'PUT', `repos/${slug}/rulesets/${existing.id}`, '--input', '-'], body);
  else gh(['api', '--method', 'POST', `repos/${slug}/rulesets`, '--input', '-'], body);
  allowActionsPullRequests(slug);
  // READ BACK WHAT GITHUB ACTUALLY STORED, and compare it to what was sent. This summary used to
  // print enforcement, rule types, required checks and bypass actors - and not `merge_method`, so
  // an apply that GitHub rejected or coerced on the one field this ruleset exists to pin looked
  // exactly like one that worked.
  const after = findExisting(JSON.parse(gh(['api', `repos/${slug}/rulesets`])));
  const detail = readJson(['api', `repos/${slug}/rulesets/${after.id}`]);
  console.log(`[landing-ruleset] ${existing ? 'updated' : 'created'} ruleset ${after.id} on ${slug}`);
  if (!detail) {
    console.log('  Could not read it back, so what GitHub stored is unknown. Run with no flags to check.');
    return;
  }
  for (const [key, value] of Object.entries(rulesetFacts(detail))) console.log(`  ${key}: ${value || '(nothing)'}`);
  const drift = rulesetDrift(detail, wanted);
  for (const line of drift) console.log(`  DRIFT GitHub did not store what was sent - ${line}`);
  if (drift.length > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].replaceAll('\\', '/').endsWith('/scripts/landing-ruleset.mjs')) main();
