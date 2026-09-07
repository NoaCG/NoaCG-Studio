# Workflow metrics: the baseline and how to re-measure it

The targets in `docs/WORKFLOW_ARCHITECTURE.md` §9 are checkable only against a baseline taken
the same way. This file is that baseline, taken 2026-09-06 on `origin/main` at 296df0ef, and the
commands that reproduce each number. Re-run them, put the new column beside the old, and the
architecture either improved or it did not.

| Metric | 2026-09-06 | Target | Command |
|---|---|---|---|
| Queued to landed, median / p90 / max | 9 min / 79 min / 42 h | ≤ 10 / ≤ 20 min / ≤ 2 h | `npm run metrics:landing` |
| Landings per day | 16 median, 36 max | capacity ≥ 200 (phase 4 load test) | `npm run metrics:landing` |
| Red `main`, hours per 30 days | ~78 | ≤ 4 | `gh issue list --search '"CI is red on main" in:title' --state all --json createdAt,closedAt` |
| Runner minutes per 30 days | 113,685 (62 h/day) | ≤ 45,000 at the same landing rate | `npm run metrics:ci -- --limit 500` (sums job durations) |
| `main` runs re-running a sha already green on its branch | 496 of 512 | 0 | `npm run metrics:ci` |
| Branch run for one component | 19 to 28 runner-min, 4 to 7 shards | ≤ 12 runner-min, ≤ 2 shards | `npm run metrics:ci`, read per class |
| Cancelled `ci.yml` runs | 15% | n/a (selection from the merge-base) | `npm run metrics:ci` |
| Contract corpus | 108 files, 569,309 bytes | shrinking; hand-written files → 0 by phase 2b | `npm run metrics:contracts` |
| Root bytes × chains | 22,733 × 54 = 1,227,582 | ≤ 450,000 | `npm run metrics:contracts` |
| Tightest chain | `src/components/wizard` 101,636 bytes (~25k tokens) | ≤ 40,960 bytes loaded for any single file touch | `npm run metrics:contracts` |
| Compiled layer at launch | 0 bytes (store empty before phase 0) | ≤ 8,192 | `npm run metrics:contracts` |
| Evidence paragraphs in hand-written contracts | 50 files carry them (`scripts/contract-evidence-baseline.json`) | only ever down | `npm run check:contract-evidence` |
| Merges with a real conflict resolution, 45 days | 77 of 618 (12.5%) | ≤ 3% | `npm run metrics:conflicts` |
| Most-resolved files | `package.json` 15, `e2e/catalog-baseline.json` 12 | none above 2 | `npm run metrics:conflicts` |
| `build` line edits per 30 days | 66 | 0 | `git log --no-merges --since=30.days -G'"build": ' --format=%H origin/main -- package.json \| wc -l` |
| Import-only wizard commits forced into a giant (60 d) | 40% (51 of 129) | ≤ 10% | `npm run metrics:cochange` |
| Template-only wizard commits forced into a giant | 57% (36 of 63) | ≤ 10% | `npm run metrics:cochange` |
| AI-only wizard commits forced into a giant | 25% (13 of 51) | ≤ 10% | `npm run metrics:cochange` |

The co-change script counts `src/model/wizard.ts` among the giants and takes only the wizard's
own AI files as the AI capability, so its numbers sit above the audit's hand counts in
`WORKFLOW_ARCHITECTURE.md` §5.5 (37 / 43 / 4%); the script's definition is the one the targets
are measured against.
| Direct importers of `src/model/wizard.ts` | 621 (reverse closure 866 files) | file gone | `npx depcruise --config .dependency-cruiser.cjs --output-type json src` and count `resolved === 'src/model/wizard.ts'` |
| Files in the test map's `CORE` | 141 | ≤ 20 | classify `git ls-files` through `planFor` in `scripts/e2e-affected.mjs` |

Three numbers in the plan were measured with one-off scripts (the change-class table, the
sentence-level evidence split, the reverse closures); they are quoted in
`docs/WORKFLOW_ARCHITECTURE.md` §2 with the method and are not repeated by an npm script.

## Re-measured 2026-09-06, after phases 1c and 1d landed

Taken on `origin/main` at `d283883b` (the merge of phase 1d), the same way as the column above.
The 2a module rows were still in the queue, so the rows they move are unchanged here on purpose.

| Metric | Baseline | Now | Reading |
|---|---|---|---|
| Contract corpus | 108 files, 569,309 B | 108 files, 572,533 B | +3,224 B: the two phases' own rules, written into `AGENTS.md` and `e2e/AGENTS.md` before the compiler owns them |
| Root bytes × chains | 22,733 × 54 | 23,268 × 54 = 1,256,472 | same direction; phase 2b is what moves it |
| Tightest chain (`src/components/wizard`) | 101,636 B | 102,171 B | unchanged in kind |
| Compiled layer at launch | 0 B (store empty) | 384 B | the rule store has its first compiled rule; target is ≤ 8,192 |
| `build` line edits / 30 days | 66 | 72 | measured over history that ends the day the line stopped naming tests; from `a83ad926` on, a new check or test edits its own header, so the line has no reason to change |
| Files the map escalates to the full suite | 141 by `CORE`, 153 unmapped | 141 by `CORE`, 153 unmapped | unchanged: the module rows that move them are in the queue |
| Gates that declare where they run and what they guard | n/a | 32 checks, 99 test files | `npm run gates -- audit`; the audit refuses a gate that declares nothing |
| Quarantined specs | n/a | 0 | `npm run quarantine list` |
| Mechanical landings (quarantine, revert) | n/a | 0 | none fired yet; the organisation setting that lets Actions open pull requests is still off |

**What cannot be read yet.** `metrics:landing` and `metrics:ci` both look back 30 days, so they
still describe the laptop-lander era: the queue-to-landed and runner-minute rows need days of
history under the merge queue before they say anything about it. Re-run both after a week of
landings and put the column beside the baseline; the rows worth watching first are runner minutes
per landing (the `main` full run per landing is what phase 1c's retry and quarantine are meant to
stop re-running) and red-`main` hours, which should fall to the time a revert takes to land.

## Re-measured 2026-09-07, after the four module rows of phase 2a landed

Taken on `origin/main` at `38dc3286`. The rows below are the ones the module work moves; the rest
of the table is unchanged from the section above.

| Metric | Baseline | Now | Reading |
|---|---|---|---|
| Files the map escalates to the full suite | 141 by `CORE`, 153 unmapped | 145 by `CORE`, 153 unmapped | +4: `src/templates/contract.ts` and the three files the debts row moved into `src/model/`. The template contract is one file that legitimately reaches everything; what leaves `CORE` is the 617 designs around it, and only once selection is derived from the graph (phase 3) |
| Specs planned for an Import-graphic file | 38 | 13 | the capability's own nine, plus the four that assert on testids only its components render |
| Direct importers of `src/model/wizard.ts` | 621 | 619, all through the one-landing shim | the file is a fifteen-line re-export; the second half of domain row 1 rewrites the importers and deletes it |
| Import-only commits forced into a wizard giant | 40% (54 of 134) | 40% (54 of 134) | unchanged, and it cannot change yet: this reads sixty days of history, and every commit in that window predates the split. The first honest reading is sixty days of commits made under the new layout |

**The co-change rows are the ones to watch, and the trap in them.** They are what justifies the
remaining wizard rows, and they measure the PAST. A reading taken this week says nothing about
whether the split worked; a reading in October does. The buckets name the old paths beside the new
ones for exactly that reason, so the window keeps measuring one capability across the move - if a
later session prunes the old paths from `scripts/metrics/cochange.mjs`, the number falls for a
reason that is bookkeeping rather than modularity.

## Re-measured 2026-09-07, after the compiler learned to write a nested contract

Taken on this branch against `origin/main` at `93001bc7`. The row built the generator and migrated
one area with it: `src/templates/versus`, the smallest contract in the tree.

| Metric | Before | Now | Reading |
|---|---|---|---|
| Contract corpus | 108 files, 574,356 B | 107 files, 574,477 B | one file fewer (the `CLAUDE.md` sibling is gone) and 121 bytes more |
| `src/templates/versus` in the Codex chain | 981 B + 61 B sibling = 1,042 | 1,163 B generated | **+121 bytes. The migration made this chain BIGGER** |
| `src/templates/versus` in a Claude session | 981 B, loaded whenever the directory is touched | 0 B in the chain; 1,093 B loaded only when a versus file is read | the bytes moved from always to on-demand |
| Compiled layer | 1 file, 632 B at launch, 0 B scoped | 2 files, 632 B at launch, 1,093 B scoped | the kernel did not move; the new file is path-scoped |
| Kernel against its ceiling | n/a | 632 of 8,192 B | `npm run contracts:compile -- --report` prints it, and the compiler refuses a kernel over it |
| Hand-written contract files | 108 | 106 | `npm run metrics:contracts` now reports this row directly; the target is zero |

**The row got BIGGER, and that is the honest reading of it.** A generated contract carries about
200 bytes of fixed overhead - the marker the compiler, the edit guard and `check-shared-instructions`
all read, a heading, and one line saying where to change a rule. `versus` was chosen first because
it is the smallest contract in the tree, so it is the worst case for that overhead: three rules do
not amortise it. The header was cut from five lines to one when this number was first measured,
which is why it is +121 bytes rather than +300.

**So the byte win is not what this phase buys, and the plan should stop implying it is.** What it
buys is measurable in three other places, and those are the numbers the next rows should carry:

- **Conflicts.** Three rules that were one paragraph in one file are now three files. The
  `build`-line evidence in `WORKFLOW_ARCHITECTURE.md` §1.4 is that one-file-per-item directories
  absorbed 811 commits with 11 resolutions, against 66 edits and 15 resolutions on a single line.
  `npm run metrics:conflicts` is where this shows up, and not for weeks.
- **Evidence out of the loaded chain.** The three records under `contracts/records/templates-versus/`
  carry the why - the dropped `card05`, the symmetry argument for the field numbering - and nothing
  loads them. In the prose version that reasoning either sat in the chain or was lost.
- **Claude's load moved from always to on-demand.** 981 bytes left every session that touches the
  directory; 1,093 arrive only when a versus file is actually read.

**Where the byte win has to come from instead:** the areas where the prose is large. The tightest
chain is `src/components/wizard` at 102,598 bytes and `src/templates/AGENTS.md` is 52,368 bytes
across 24 chains - 1,256,832 bytes of multiplier from one file. A row that turns 50 KB of prose
into 40 rules pays the 200-byte overhead forty times over. Re-measure this table after
`src/templates` migrates; if the corpus has not fallen by then, the design is wrong and not merely
early.

## Re-measured 2026-09-07, after `src/templates` migrated

The row above ended by saying the byte win had to come from the large areas, and that if the
corpus had not fallen once `src/templates` migrated the design was wrong rather than early. This
is that measurement. `src/templates/AGENTS.md` was 53,037 bytes read in full by every session
touching any template.

| Metric | Before `versus` | After `versus` | After `src/templates` |
|---|---|---|---|
| Contract corpus | 574,356 B / 108 files | 574,477 B / 107 | **548,519 B / 106** |
| `src/templates/AGENTS.md` | 52,368 B | 52,368 B | **26,482 B** |
| Its multiplier (bytes x chains) | 1,256,832 | 1,256,832 | **635,568** |
| Tightest chains, top five | 3 of 5 were template chains | same | **none are** |
| Compiled layer | 632 B launch, 0 scoped | 632 B, 1,093 scoped | 632 B launch, **33,824 B scoped** |
| Hand-written contract files | 108 | 106 | **104** |

**The design holds.** One area, 86 rules, and the corpus fell 25,958 bytes while the file's
multiplier halved. `src/templates/importedDesign`, `infographics` and `types` were three of the
five tightest chains in the repository before this row and none of them is in the top five now -
they were tight because of the parent, not because of themselves.

**Where the bytes actually went, because the corpus fell by less than the file did.** The contract
lost 25,886 bytes and the corpus lost 25,958. The rules that replaced it are not in the corpus at
all: 33,824 bytes of them are in `.claude/rules/`, loaded only when a session reads a file the rule
scopes to. Forty-one rules are catalog-wide and 45 name the single file they bind, so most of that
33 KB never loads in a given session. The reasoning - every incident, date and measurement the
prose carried - is in 86 records under `contracts/records/templates/` that nothing loads at all.

**The near-duplicate threshold is calibrated, and the answer is that it needs no change.**
`DUPLICATE_THRESHOLD = 0.6` was set on a store of two rules and phase 2b lists recalibrating it as
its own row. Across 86 rules written from one contract it refused nothing: zero `--distinct`
overrides were needed. On its first real corpus it produced no false positives, so the row that
was going to re-measure it can be closed by this number instead.

**What this row does not prove.** The conflict argument (`WORKFLOW_ARCHITECTURE.md` §1.4) is still
unmeasured - `npm run metrics:conflicts` reads 45 days of history and every commit in that window
predates the store. The first honest reading is weeks away, and until then the case for one file
per rule rests on the `build`-line evidence rather than on this repository's contracts.
