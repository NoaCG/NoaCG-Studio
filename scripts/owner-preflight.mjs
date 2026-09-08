#!/usr/bin/env node
// gate: none - it reads organisation and repository SETTINGS, which needs an owner's GitHub login; nothing on a runner holds one, and it reports rather than blocking a change
// guards: .github/workflows/post-land.yml, scripts/landing-ruleset.mjs, scripts/queue-pr.mjs
//
// EVERY ACCOUNT-LEVEL PREREQUISITE, ASKED AT ONCE.
//
//   npm run check:owner-setup            # the list, with the command to fix each miss
//   npm run check:owner-setup -- --json  # the same as one object
//
// WHY. The landing machinery rests on a handful of settings that live in GitHub rather than in
// this repository: the organisation must let Actions open a pull request, the ruleset on `main`
// must require the queue and the two checks, the `production` environment must hold the Supabase
// token, the `land` label must exist. Each one is invisible until the moment it blocks something,
// and on 2026-09-06 they arrived one at a time over an evening - each as a separate ask to the
// owner, each discovered by a mechanism failing rather than by anyone looking. The answer to "we
// keep finding these one at a time" is one command that asks all of them.
//
// It NEVER changes anything. `scripts/landing-ruleset.mjs --apply` is what writes the ruleset and
// the Actions permission; this file only reports, and names that command where it applies.
//
// It needs a login with `admin:org` on the organisation to read the Actions policy. Without one
// those two rows report `unknown` rather than `missing`: an answer nobody could obtain is not a
// finding, and reporting it as one is how a list stops being read.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measured } from './measured.mjs';

/** The checks whose answer is a fact about GitHub, not about this tree. */
export const CHECK_IDS = ['org-actions-pr', 'repo-actions-pr', 'ruleset', 'required-checks', 'migration-token', 'land-label'];

/**
 * The report, as a pure function of what was observed. `facts` carries one entry per check:
 * `true` (satisfied), `false` (missing) or `null` (could not be read).
 *
 * Pure, because this is the list somebody acts on: it must be checkable without a network, and
 * the wording of a miss must be the command that fixes it rather than a description of the
 * problem.
 *
 * `rows` rides along with the report because it is the only place the table's size is known, and
 * the caller says it out loud (`measured`): the rows are hardcoded here, so an edit that emptied
 * them would leave a report that judged nothing and still read as "everything is in place".
 *
 * @param {Record<string, boolean|null>} facts
 * @returns {{ lines: string[], missing: string[], unknown: string[], rows: number }}
 */
export function preflightReport(facts = {}) {
  const rows = [
    {
      id: 'org-actions-pr',
      says: 'the organisation lets Actions open a pull request',
      why: 'without it a quarantine entry, a quarantine release and a revert push their branch and are refused at `gh pr create`',
      fix: 'node scripts/landing-ruleset.mjs --apply   (needs an owner login: gh auth refresh -h github.com -s admin:org)',
    },
    {
      id: 'repo-actions-pr',
      says: 'the repository lets Actions open a pull request',
      why: 'the organisation setting is necessary and not sufficient; the repository carries its own copy',
      fix: 'node scripts/landing-ruleset.mjs --apply',
    },
    {
      id: 'ruleset',
      says: 'the ruleset on `main` is active and requires the merge queue',
      why: 'it is what makes the queue the only writer of main; without it a push could land unreviewed work',
      fix: 'node scripts/landing-ruleset.mjs --apply',
    },
    {
      id: 'required-checks',
      says: 'the ruleset requires `CI gate` and `Reviewed`',
      why: 'the queue merges on those two names; a rename in ci.yml that misses the ruleset lands work no gate judged',
      fix: 'node scripts/landing-ruleset.mjs --apply',
    },
    {
      id: 'migration-token',
      says: 'the `production` environment holds SUPABASE_ACCESS_TOKEN',
      why: 'post-land.yml applies what production and staging are missing on every landing; without the token it says so and migrations wait for a person',
      fix: 'add it in the repository settings, Environments, production (the owner holds the value; nothing here can)',
    },
    {
      id: 'land-label',
      says: 'the `land` label exists',
      why: 'the ledger sync and the listing read a landing off it',
      fix: 'gh label create land --color F5A623 --description "Queued for the landing queue"',
    },
  ];
  const lines = [];
  const missing = [];
  const unknown = [];
  for (const row of rows) {
    const fact = facts[row.id];
    if (fact === true) {
      lines.push(`  OK       ${row.says}`);
    } else if (fact === null || fact === undefined) {
      unknown.push(row.id);
      lines.push(`  unknown  ${row.says}`);
      lines.push(`           could not be read with this login; ${row.fix}`);
    } else {
      missing.push(row.id);
      lines.push(`  MISSING  ${row.says}`);
      lines.push(`           ${row.why}`);
      lines.push(`           fix: ${row.fix}`);
    }
  }
  return { lines, missing, unknown, rows: rows.length };
}

/** `gh api` as JSON, or null when the call fails - a refusal is "could not read", never a crash. */
function ghJson(args) {
  const res = spawnSync('gh', ['api', ...args], { encoding: 'utf8', windowsHide: true });
  if (res.status !== 0) return null;
  try {
    return JSON.parse(res.stdout);
  } catch {
    return null;
  }
}

/** What GitHub says right now, as the fact map `preflightReport` takes. */
export function gather({ repo = 'NoaCG/NoaCG-Studio', rulesetName = 'main is landed by the queue', required = ['CI gate', 'Reviewed'] } = {}) {
  const org = repo.split('/')[0];
  const facts = {};

  const orgPolicy = ghJson([`orgs/${org}/actions/permissions/workflow`]);
  facts['org-actions-pr'] = orgPolicy === null ? null : orgPolicy.can_approve_pull_request_reviews === true;

  const repoPolicy = ghJson([`repos/${repo}/actions/permissions/workflow`]);
  facts['repo-actions-pr'] = repoPolicy === null ? null : repoPolicy.can_approve_pull_request_reviews === true;

  const rulesets = ghJson([`repos/${repo}/rulesets`]);
  const summary = Array.isArray(rulesets) ? rulesets.find((r) => r?.name === rulesetName) : null;
  const detail = summary ? ghJson([`repos/${repo}/rulesets/${summary.id}`]) : null;
  if (rulesets === null) {
    facts.ruleset = null;
    facts['required-checks'] = null;
  } else if (!detail) {
    facts.ruleset = false;
    facts['required-checks'] = false;
  } else {
    const types = (detail.rules ?? []).map((r) => r.type);
    facts.ruleset = detail.enforcement === 'active' && types.includes('merge_queue');
    const contexts = (detail.rules ?? []).find((r) => r.type === 'required_status_checks')?.parameters?.required_status_checks?.map((c) => c.context) ?? [];
    facts['required-checks'] = required.every((name) => contexts.includes(name));
  }

  const secrets = ghJson([`repos/${repo}/environments/production/secrets`]);
  facts['migration-token'] = secrets === null ? null : (secrets.secrets ?? []).some((s) => s?.name === 'SUPABASE_ACCESS_TOKEN');

  const labels = ghJson([`repos/${repo}/labels?per_page=100`]);
  facts['land-label'] = labels === null ? null : labels.some((l) => l?.name === 'land');

  return facts;
}

function main(argv) {
  const facts = gather();
  const { lines, missing, unknown, rows } = preflightReport(facts);
  // How many prerequisites were actually judged. This file never fails, so the count is the only
  // thing standing between "everything is in place" and a table an edit emptied.
  measured(rows, 'preflight rows');
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ facts, missing, unknown }, null, 2)}\n`);
    return 0;
  }
  console.log('[owner-setup] the account-level prerequisites the landing machinery rests on:\n');
  for (const line of lines) console.log(line);
  console.log('');
  if (missing.length > 0) {
    console.log(`${missing.length} prerequisite(s) missing: ${missing.join(', ')}. Each line above carries the command that fixes it.`);
  } else if (unknown.length > 0) {
    console.log(`Nothing missing that this login can see; ${unknown.length} could not be read (${unknown.join(', ')}).`);
  } else {
    console.log('Everything the landing machinery needs is in place.');
  }
  // A report, never a gate: a missing prerequisite is somebody's next action, not a red build.
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
