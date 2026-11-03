# Phase cf09: settle the offline tier exceptions (#1953)

Plan run #1967 (cicd-followup), phase cf09. Builder session on branch
`claude/plan-cicd-followup-cf09-build`, from `main` at 5dbc3f64. Written 2026-11-03.

Acceptance (a): "Each offline exception expiring 2026-11-13 or 2026-11-16 is paid down, or
extended briefly, only where pay-down is not practical before the expiry, with the reason
recorded, current cost evidence, an owner and a reduction plan. Coverage is not weakened to meet a
limit."

## Result

All 62 offline exception lines expiring on those dates are settled **without an extension**. No
line is extended, removed or edited, and no test changes. Each line lapses on its date and stays
on record, as the append-only rule requires.

Why no extension: an offline exception line does one thing. When the capacity line is at or above
95% (85% while the durations table is stale), it lets a change add measured minutes to the spec it
names. The line now reads 76.0% on main's table and 82.2% on the newest measurement. Both are below
85%. So none of the 62 lines waives anything today, and none will after its date. The minutes
each line put on record are now measured in the durations table and fit under the line. An
extension would be an exception with nothing to cover. The policy rules that out (no automatic
renewal), and the gate refuses one anyway: a new offline line is refused on any day up to and
including 2026-11-16, whatever its expiry (one active offline exception at a time), and after that
it also needs a measured repayment receipt dated after 2026-11-16.

Where the cost went down, that is measured pay-down with the same or more protection:

- **The save-transaction family** (six lines, e2e-suite-budget): 26.7 minutes on record (run
  39048521384's retry job), now 13.2 measured minutes (2026-11-02 recording). The six files now
  declare 127 tests (`npx playwright test --list`, 2026-11-03), up from the 107 the split moved
  (the 2026-10-17 entry in e2e-suite-budget's `## Test maintenance`), so coverage went up while
  cost halved.
- **`ai.spec.ts` and `ai-lite.spec.ts`** (wizard-ai, the two 2026-11-13 lines): 4.4 and 0.3 on
  record, now 3.32 and 0.18.

The 54 codebase-lean lines recorded local measurements (two workers) for revived cases until the
weekly refresh measured them. It has: every file is in the table. On the same 53 files
(`production-data` was not run on 2026-11-02), they come to 38.3 minutes on record, 35.7 measured
on 2026-10-19 and 40.3 measured on 2026-11-02. So since 2026-10-19 this group grew about 4.6
minutes, mostly in the four specs below, and it now sits 2 minutes above what was on record.
`production-data` is 2.4 on record and 1.89 in the table.

## Scope: every offline exception expiring 2026-11-13 or 2026-11-16

`readExceptions()` in `scripts/e2e-capacity.mjs` parses every `## Budget exceptions` section on
disk. Filtered to these two dates, it finds 62 lines in three specs:

- `docs/work-specs/wizard-ai/spec.md`: 2 lines, expiring 2026-11-13.
- `docs/work-specs/e2e-suite-budget/spec.md`: 6 lines, the six #1953 lists, expiring 2026-11-16.
- `docs/work-specs/codebase-lean/spec.md`: 54 lines, expiring 2026-11-16.

`scripts/growth-ceilings.json` holds no offline-tier exception. Its only entry is
`ci04-catalog-gate` (graphics, 2026-11-30), which belongs to cf14. The ci18 evidence
(`phase-ci18.md`) names the same three specs as the offline tier's work-spec lines, with
2026-11-16 as the last expiry. `noacg-harness/spec.md` mentions the wizard-ai line but adds none
of its own.

## Current cost evidence

Minutes per spec file. "On record" is the exception line. "Table" is `scripts/e2e-durations.json`
on main, the 80th percentile of three complete full runs on 2026-10-19 (39243785986, 39245690239,
39246625438). "2026-11-02" is the same recorder on the six newest green full `ci.yml` runs on
`main` (41447757102, 41438860531, 41435677487, 41433517095, 41431073579, 41430380125), from the
open refresh PR #1503 (head `e54c0896`). `production-data.spec.ts` was quarantined during those
runs (released 2026-11-02), so they did not run it.

| Spec | Work spec | Expires | On record | Table (10-19) | 2026-11-02 |
| --- | --- | --- | --- | --- | --- |
| `sports.spec.ts` | codebase-lean | 2026-11-16 | 1.1 | 1.02 | 1.03 |
| `public-service.spec.ts` | codebase-lean | 2026-11-16 | 1.1 | 1.07 | 1.11 |
| `anim-engine.spec.ts` | codebase-lean | 2026-11-16 | 0.6 | 0.44 | 0.41 |
| `competition-pack.spec.ts` | codebase-lean | 2026-11-16 | 1.1 | 0.97 | 1.04 |
| `audience-pack.spec.ts` | codebase-lean | 2026-11-16 | 0.5 | 0.38 | 0.41 |
| `graphic-types.spec.ts` | codebase-lean | 2026-11-16 | 0.6 | 0.47 | 0.50 |
| `state-machine.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.21 | 0.23 |
| `machine-edit.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.04 | 0.04 |
| `import-canvas.spec.ts` | codebase-lean | 2026-11-16 | 0.4 | 0.32 | 0.31 |
| `import-graphic.spec.ts` | codebase-lean | 2026-11-16 | 1.0 | 1.00 | 1.00 |
| `import-prepare.spec.ts` | codebase-lean | 2026-11-16 | 0.5 | 0.44 | 0.45 |
| `import-svg-behaviour.spec.ts` | codebase-lean | 2026-11-16 | 3.6 | 3.59 | 4.49 |
| `import-svg.spec.ts` | codebase-lean | 2026-11-16 | 3.4 | 2.94 | 2.92 |
| `import-stretch.spec.ts` | codebase-lean | 2026-11-16 | 0.4 | 0.28 | 0.27 |
| `import-svg-corpus.spec.ts` | codebase-lean | 2026-11-16 | 3.8 | 3.78 | 3.85 |
| `import.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.23 | 0.22 |
| `import-svg-sticker-sample.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.05 | 0.05 |
| `production-data.spec.ts` | codebase-lean | 2026-11-16 | 2.4 | 1.89 | not run (quarantined) |
| `design-rules-product.spec.ts` | codebase-lean | 2026-11-16 | 0.5 | 0.38 | 0.47 |
| `holding-pack.spec.ts` | codebase-lean | 2026-11-16 | 0.8 | 0.68 | 0.66 |
| `end-credits.spec.ts` | codebase-lean | 2026-11-16 | 0.7 | 0.63 | 0.62 |
| `package.spec.ts` | codebase-lean | 2026-11-16 | 0.6 | 0.62 | 0.58 |
| `image-purpose.spec.ts` | codebase-lean | 2026-11-16 | 0.5 | 0.39 | 0.38 |
| `house.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.14 | 0.18 |
| `shows.spec.ts` | codebase-lean | 2026-11-16 | 0.5 | 0.51 | 0.52 |
| `format.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.06 | 0.06 |
| `production-chat-intake.spec.ts` | codebase-lean | 2026-11-16 | 0.6 | 0.32 | 0.64 |
| `wave2.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.21 | 0.21 |
| `ux.spec.ts` | codebase-lean | 2026-11-16 | 0.2 | 0.12 | 0.12 |
| `counting-settle.spec.ts` | codebase-lean | 2026-11-16 | 3.1 | 2.97 | 2.97 |
| `ai-more-control.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.24 | 0.27 |
| `adapt-first.spec.ts` | codebase-lean | 2026-11-16 | 0.4 | 0.38 | 0.41 |
| `mark-legibility.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.23 | 0.24 |
| `production-controls.spec.ts` | codebase-lean | 2026-11-16 | 1.8 | 1.85 | 3.93 |
| `productions.spec.ts` | codebase-lean | 2026-11-16 | 1.1 | 1.35 | 1.37 |
| `exports.spec.ts` | codebase-lean | 2026-11-16 | 1.0 | 0.95 | 0.96 |
| `template-pack-4.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.36 | 0.39 |
| `template-pack-10.spec.ts` | codebase-lean | 2026-11-16 | 0.2 | 0.27 | 0.27 |
| `flows.spec.ts` | codebase-lean | 2026-11-16 | 0.2 | 0.23 | 0.23 |
| `wizard-filters.spec.ts` | codebase-lean | 2026-11-16 | 1.4 | 1.39 | 1.44 |
| `inspector.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.08 | 0.08 |
| `pasteboard.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.04 | 0.02 |
| `legacy-timeline.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.04 | 0.04 |
| `images.spec.ts` | codebase-lean | 2026-11-16 | 0.2 | 0.26 | 0.26 |
| `assets.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.06 | 0.07 |
| `asset-workflow.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.07 | 0.08 |
| `wysiwyg.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.07 | 0.08 |
| `production-audience.spec.ts` | codebase-lean | 2026-11-16 | 0.7 | 0.71 | 1.60 |
| `google-fonts.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.12 | 0.14 |
| `render.spec.ts` | codebase-lean | 2026-11-16 | 0.9 | 0.95 | 0.97 |
| `video-project.spec.ts` | codebase-lean | 2026-11-16 | 0.7 | 0.89 | 0.79 |
| `project-format.spec.ts` | codebase-lean | 2026-11-16 | 0.6 | 0.62 | 0.63 |
| `machine-graph.spec.ts` | codebase-lean | 2026-11-16 | 0.3 | 0.22 | 0.24 |
| `timeline-v2.spec.ts` | codebase-lean | 2026-11-16 | 0.1 | 0.06 | 0.06 |
| `save-transaction.spec.ts` | e2e-suite-budget | 2026-11-16 | 7.5 | 5.02 | 5.34 |
| `save-transaction-holds.spec.ts` | e2e-suite-budget | 2026-11-16 | 4.0 | 2.13 | 2.16 |
| `save-transaction-wizard.spec.ts` | e2e-suite-budget | 2026-11-16 | 1.1 | 0.48 | 0.49 |
| `save-transaction-leave.spec.ts` | e2e-suite-budget | 2026-11-16 | 5.1 | 1.86 | 1.85 |
| `save-transaction-leave-shortcut.spec.ts` | e2e-suite-budget | 2026-11-16 | 4.1 | 1.47 | 1.52 |
| `save-transaction-leave-modal.spec.ts` | e2e-suite-budget | 2026-11-16 | 4.9 | 1.80 | 1.87 |
| `ai.spec.ts` | wizard-ai | 2026-11-13 | 4.4 | 3.26 | 3.32 |
| `ai-lite.spec.ts` | wizard-ai | 2026-11-13 | 0.3 | 0.19 | 0.18 |
| **62 lines** | | | **72.1** | **53.8** | **57.0** |

The capacity line on main (`node scripts/e2e-capacity.mjs`, 2026-11-03): 159.7 of 210.3
table-minutes, **76.0%**, verdict WARN only because the table is 15 days old and no weekly growth
report has been published. The offline growth tier is at 77% (410/535 per landing, 166/215 per
day). That tier never reads work-spec lines: `applyOfflineStop` waives only ledger exceptions from
`growth-ceilings.json`.

## Proof that the expiry changes no verdict

The probe below calls `assess()` from `scripts/e2e-capacity.mjs` once for each of the 62 specs.
Each call is a change that edits that spec and adds one measured minute, the case an exception
exists for. It runs on both tables, on 2026-11-03 and 2026-11-17, with the table fresh and stale:

| Table | Today | Stale table | Line | Verdict for a +1 minute edit, all 62 specs |
| --- | --- | --- | --- | --- |
| main (2026-10-19) | 2026-11-03 | no / yes | 76.0% | ok on 62 of 62 |
| main (2026-10-19) | 2026-11-17 | no / yes | 76.0% | ok on 62 of 62 |
| #1503 (2026-11-02) | 2026-11-03 | no / yes | 82.2% | ok on 62 of 62 |
| #1503 (2026-11-02) | 2026-11-17 | no / yes | 82.2% | ok on 62 of 62 |

From `assess()`: a change is refused only if `share >= line && added > 0 && uncovered.length > 0`,
where `line` is 95% (85% while the table is stale). Below 85%, an exception is never consulted.

Control: the same probe with every table weight raised by 30% (line 98.8%) answers `warn` on all
62 on 2026-11-03, while the lines run, and `refuse` on all 62 on 2026-11-17. So the probe does see
an exception at work when the line is high enough for one to matter.

The probe, run from the repository root with the 2026-11-02 table saved as `dur-1503.json`
(`gh api repos/NoaCG/NoaCG-Studio/contents/scripts/e2e-durations.json?ref=e54c0896 --jq .content | base64 -d`):

```js
import { readFileSync } from 'node:fs';
import { assess, readExceptions } from './scripts/e2e-capacity.mjs';
import { specFilesOnDisk } from './scripts/e2e-durations.mjs';
const tables = { main: JSON.parse(readFileSync('scripts/e2e-durations.json')), '#1503': JSON.parse(readFileSync('dur-1503.json')) };
const ex = readExceptions().filter((e) => ['2026-11-13', '2026-11-16'].includes(e.expires));
for (const [label, table] of Object.entries(tables)) for (const today of ['2026-11-03', '2026-11-17']) for (const tableStale of [false, true]) {
  const v = {};
  for (const e of ex) {
    const name = e.spec.replace('e2e/', '');
    const r = assess({ table, suite: specFilesOnDisk(), changed: [e.spec], measured: { [name]: (table.minutes[name] ?? 0) + 1 }, exceptions: ex, today, tableStale });
    v[r.status] = (v[r.status] ?? 0) + 1;
  }
  console.log(label, today, tableStale, (100 * assess({ table, suite: specFilesOnDisk(), today, tableStale }).share).toFixed(1), v);
}
```

## What stays watched (owner and reduction plan)

Owner: `miwco` (primary), with the weekly owner session as backup coverage (#1951). These are the
same owner strings as `scripts/growth-ceilings.json`.

Once the lines lapse, the gate takes over again. If the line reaches 85% (stale table) or 95%, an
edit that adds minutes to any spec needs a new exception. The gate requires that exception to carry
a measured repayment receipt after 2026-11-16 and to be the only active offline exception. The
weekly refresh PR (#1503 now) and the weekly growth report are where the owner sees the line move.

Four of the 62 specs measured clearly more on 2026-11-02 than on 2026-10-19. That is the measured
waste to look at first, filed as #1994:

| Spec | Table (10-19) | 2026-11-02 | Change |
| --- | --- | --- | --- |
| `production-controls.spec.ts` | 1.85 | 3.93 | +2.08 |
| `production-audience.spec.ts` | 0.71 | 1.60 | +0.89 |
| `import-svg-behaviour.spec.ts` | 3.59 | 4.49 | +0.90 |
| `production-chat-intake.spec.ts` | 0.32 | 0.64 | +0.32 |

`production-controls` and `production-chat-intake` carry quarantined flakes (#1946/#1778 in cf06,
#1924 in cf05). A run that retried them adds its retry time to their measurement, so their repair
may take back part of the growth. The issue names cf03's ranking (duplicate work, setup, shard
balance) as the place to decide the rest. None of this changes what the lapse does: all four fit
under the line now.

## Coverage

No test, spec, assertion, selection, quarantine, limit or check changes in this phase. The only
edits are this file and one dated note under each of the three `## Budget exceptions` sections.
`parseExceptions()` reads only `- e2e/...: N min, ..., expires ...` lines, so a prose note there
adds or removes no exception. `node scripts/e2e-capacity.mjs --changed origin/main` on this branch
reports no exception change.

## #1953

#1953 asks for two wording fixes in `phase-ci17.md`, and cf15 owns them. This phase settles all
six of the offline exceptions it lists (the save-transaction family), but the issue stays open for
cf15's text edits, so no closing keyword appears here.

## Phase notes

- **Previous verified main SHA:** cb0040f4efc2975d44c23e5e946981f3f6b6ef43 (CI push run
  41559433697 green). The branch starts from 5dbc3f64, whose CI was still running at the start.
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It removes the three notes and
  this file. The exception lines are untouched either way.
- **Decisions:**
  - No extension. An exception line only matters at or above the 85%/95% line. Both measurements
    put the line below 85%, so an extension would cover nothing, and the gate's rule X5 (one active
    offline exception, a repayment receipt for any later one) refuses any new offline line on a
    day up to and including 2026-11-16, and an extension must land before the original date.
    Extending would mean changing the gate, which this phase may not do.
  - No new pay-down work. Every line's minutes already fit under the line. The largest family
    (save-transaction) is already measured at half its recorded cost with more tests. A speed-up
    done only to "pay down" an exception that waives nothing would be work for show. The measured
    growth goes to #1994 and to cf03's ranking, where cf13 chooses work by measured effect.
  - The notes go in the three specs, after their lines, so whoever reads a lapsed line later sees
    why it was not renewed. The lines themselves stay, as the append-only rule says.
- **Traps:**
  - `specFilesOnDisk` is exported by `scripts/e2e-durations.mjs`, not `e2e-affected.mjs`.
  - The durations table on main is 15 days old. Until #1503 or a later refresh lands, the gate's
    refusal line is 85%, not 95%. The 2026-11-02 recording raises the line to 82.2%, which is
    close to 85%.
  - GitHub's issue search needs `is:issue` or `is:pull-request` in the query.
