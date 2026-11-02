# Phase cf01: alarm and incident ownership, routing and incident records

Plan run #1967 (cicd-followup), phase cf01. Builder session on branch
`claude/plan-cicd-followup-cf01-build`, from `main` at b6f59fb1.

## Phase notes

- **Previous verified main SHA:** b6f59fb1f3c16162c964552df7100e6a5a09b970 (the spec landing, #1960).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>` reverts the code half. The issue
  records in (c) are GitHub comments and assignments; a revert leaves them in place.
- **Decisions:**
  - One owner record, not many strings. Every alarm already read its owner from
    `scripts/growth-ceilings.json` `owner`, so the text changes there once, and a new
    `ownerLogin` names the account each alarm issue is assigned to.
  - Assignment is the routing. GitHub notifies the assignee when an alarm issue opens or is first
    routed, keeps them subscribed to later comments, and re-assigning an existing assignee sends
    nothing, so a rolling update does not mail again. The answer is checked: GitHub returns the
    issue unchanged for a login it cannot assign, and that is an error, not a quiet success. Once
    the alarm itself is written, a refused route is a `::warning` in the run, not a failed job
    (`routeOrWarn`): quarantine.yml's spec jobs depend on the job its reports run in, and post-land
    would otherwise go red on every landing. The weekly `list` flags the issue as not routed.
  - A carried growth breach follows the recorded owner (`carryBreaches`), keeping its first date
    and its one correction, so the ownership change reaches breaches already open.
  - Every alarm issue is found the same way before it is assigned: exact title, opened by a bot
    or a repository member (`findAlarmIssue`, which growth-report's `findIssue` now calls). The
    two quarantine lookups used a title search instead, which could have assigned `miwco` to an
    outsider's issue.
  - The ceilings file moves to version 2 with a revision citing the owner's decision on #1951
    (`issuecomment-6570085219`), because the file's own rule lets a non-ledger field change only
    that way. No ceiling, estimate or measurement moves; a test pins that.
  - The `ci04-catalog-gate` exception keeps its owner text. The exception ledger is append-only
    (an edit is refused), the exception is a cost exception rather than an alarm, and it expires
    on 2026-11-30 under cf14.
  - The test alarm is its own dispatch-only workflow, `alarm-test.yml`, on main only. The
    per-PR capacity check prices any new job conservatively (6 runner-minutes per landing,
    overhead tier, a warning, not a refusal); its real cost is one 3-minute job per manual
    dispatch. Adding it to an existing workflow would cost more (a cron cadence or extra runs of
    existing jobs) or change existing jobs.
  - The test alarm carries no @mention, so a receipt proves the assignment route real alarms use.
  - Backup coverage is made real: the weekly owner session's measure step now runs
    `node scripts/alarm-owner.mjs list`, which names every open growth, age and quarantine alarm
    issue and flags one not routed to `miwco`. `alarm-issues.mjs` does not list these titles, so
    before this the weekly session never saw them.
  - Incident records went on the existing issues as comments (not body rewrites of issues others
    wrote), and each issue is assigned to `miwco`.
- **Review round (/check, 10 findings, all confirmed and fixed):** routing failure no longer fails
  a job after the alarm is written; routing runs after the change comment so a failure cannot lose
  it; exact-title stale lookup; carried breaches follow the owner; `list` reads only bot or member
  issues, refuses past 1,000 open issues instead of answering "none", and flags a missed or
  overdue date; `issueNumber` reports plain text clearly.
- **Codex round (head 1d54000a, 1 finding, P2, confirmed and fixed):** a growth breach past its
  one correction renders as `(stopped)`, which `list` did not flag. `pastDate` now reads each
  alarm's own words, `(missed)`, `**overdue**` and `** (stopped)`, with a test per form.
  Family: the backup review must see every past-date state. Class: product defect (tooling).
- **/so round (head 1d54000a, grade A-, AGREE):** the stale lookup lacked the trusted-author check
  (fixed above); the overdue flag reads alarm text (kept, now one pure function tested against the
  renderers' exact lines); the `ci04-catalog-gate` owner text stays on purpose (decisions above).
- **Traps met:** `gh issue` body edits by shell were refused by the session's permission
  classifier; the GitHub tools wrote the comments and assignments. A top-level `await` in a CLI
  that imports a module importing it back deadlocks silently ("unsettled top-level await"); the
  CLI runs in an `async main()` after evaluation instead.

## (a) Owner strings

The growth, age and quarantine alarms and the incident list all print `owner` from
`scripts/growth-ceilings.json`, now `miwco (primary); the weekly owner session (backup coverage)`:

| Alarm | Where the owner is printed | Read from |
|---|---|---|
| Weekly growth report and its rolling issue "Growth controls: weekly actions" | `scripts/growth-controls.mjs` `weeklyMarkdown`, `scripts/growth-report.mjs` `buildReport` | `ceilings.owner` |
| Delivery age alarms, issue "Delivery items past their age ceiling" (#1892), and plan phase alarms | `scripts/growth-report.mjs` `ages`, `scripts/growth-controls.mjs` `ageAlarms` | `ceilings.owner` |
| Quarantine incident list, issue "Quarantine incidents: protection out of the blocking gate" (#1907) | `scripts/e2e-quarantine.mjs` `quarantineIncidents` | `alarmOwner().owner` |
| Quarantine stale list, issue "Quarantined specs older than 14 days" | routed only (its body names no owner) | `alarmOwner().login` |
| Per-PR capacity warning ("an owned failure") | `scripts/e2e-capacity.mjs` | `ceilings.owner` |

Proof: `scripts/alarm-owner.test.mjs` (a) tests; `node scripts/e2e-quarantine.mjs incidents`
prints `owner miwco (primary); the weekly owner session (backup coverage)` for all three specs;
`node scripts/e2e-capacity.mjs --changed origin/main` prints the same owner on its owned-failure
line. The old string survives only in the cicd-improvement evidence files (history).

## (b) Routing and the test alarm

Every raised or updated alarm issue is assigned to `ownerLogin` (`miwco`) by
`scripts/alarm-owner.mjs` `routeToOwner`: `scripts/growth-report.mjs` `rollingIssue` (weekly,
age and phase alarms) and both rolling issues of `scripts/e2e-quarantine.mjs`. On the first runs
after landing, #1907 and #1892 are assigned to `miwco` (today `alarm-owner.mjs list` shows both
"NOT routed to miwco").

The test alarm, after this lands, run by the coordinator:

    gh workflow run alarm-test.yml --ref main -R NoaCG/NoaCG-Studio

It opens one issue titled `Test alarm: owner routing check <time> UTC` with the workflow's own
token and assigns it to `miwco` through the same function. The receipt is the notification thread
in `miwco`'s GitHub notifications or the owner's confirmation on #1951. Per the acceptance, the
coordinator asks for the receipt on #1951 in the same turn; this phase stops at the queue and
never closes #1951.

## (c) One incident issue per quarantined spec

`e2e/quarantine.json` at b6f59fb1 holds three specs. None has a `// critical:` header (10 specs in
`e2e/` do), so no critical repair date must come first; every date is on or before 2026-11-30.

| Spec | Issue | Record | Critical | Merge failures | Repair date |
|---|---|---|---|---|---|
| `e2e/configured/late-send-abandoned.spec.ts` | #1805 | [comment](https://github.com/NoaCG/NoaCG-Studio/issues/1805#issuecomment-6575541195) | no | 0 | 2026-11-11 (unchanged) |
| `e2e/production-chat-intake.spec.ts` | #1924 | [comment](https://github.com/NoaCG/NoaCG-Studio/issues/1924#issuecomment-6575543132) | no | 0 | 2026-11-15 |
| `e2e/production-data.spec.ts` | #1603 | [comment](https://github.com/NoaCG/NoaCG-Studio/issues/1603#issuecomment-6575544970) | no | 0 | 2026-11-15 |

Each record carries owner (`miwco`, weekly session backup, repair by cf07 or cf05, and the
existing owner: none was named on any of the three), impact, repair date and restoration criteria,
and each issue is assigned to `miwco`. #1603 is the quarantined test: run 41359365006 fails
"Connect closes only once the save landed" at `cue-connect-confirm`, the failure #1603 describes.

**Merge failures, method.** All 23 failed `merge_group` CI runs from 2026-10-01 to 2026-11-02
(50 API calls, cached): a run counts against a spec when its `CI gate` job failed and a failed E2E
job's annotations name the spec. None did for any of the three. `production-chat-intake` failed
once in merge-queue run 39763463821 (2026-10-22) and the same-commit retry kept the gate green.
Configured specs do not run in the merge group, so `late-send-abandoned` cannot fail one; its cost
lands on PR selections and branch dispatches (PR #1848, runs 41187110573 and 41189183454), which
this count does not include.

**Overlaps.** #1946 and #1778 are two different flakes in `e2e/production-controls.spec.ts`, not
quarantined: cross-linked both ways (cf06). #1874 (`configured/production-data-key-tick`) left
quarantine on 2026-11-01 (6599585) and is a different spec from #1603: status recorded on it.
`import-svg` left quarantine on 2026-11-02 (#1963, 9b3d00a2): recorded on #1954, which keeps the
root cause (cf08). The spec-to-issue map is on #1907; #1945 item 1 is marked resolved. Each
quarantined spec has exactly one tracking issue.

**Since then.** PR #1968 released `production-chat-intake` after 20 passes (b46abd3, merged into
this branch), so `e2e/quarantine.json` now holds two specs, each with its issue above. Passing
again is not the repair: #1924 keeps its record and stays open for the root cause (cf05).

## Verification

- `npm run gates -- run --changed origin/main`: 14 gates, 6 test files, 267 tests, all pass.
- `node --test scripts/alarm-owner.test.mjs`: 8 pass (owner text, incident rows, reviewed
  revision with no ceiling moved, routing on open and update and not on close, a refused route
  throws and, after the alarm is written, warns, the test alarm's label and route, the weekly
  list's titles). `growth-controls.test.mjs` adds a carried breach following the new owner.
- `npm run check:workflows`: 25 validated, `alarm-test.yml` included.
- `npx eslint` on the changed scripts: clean.
- `node scripts/alarm-owner.mjs list` (live, read-only): lists #1907 and #1892, both not yet routed.
- `node scripts/e2e-capacity.mjs --changed origin/main`: warn, not refuse (the reviewed
  ceilings revision and the conservatively priced dispatch-only job, both named above).
