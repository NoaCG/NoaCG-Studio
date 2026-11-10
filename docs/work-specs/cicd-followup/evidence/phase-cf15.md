# Phase cf15: finish the cicd-improvement documentation follow-ups

Row cf15 of the [cicd-followup spec](../spec.md), plan run #1967. Built 2026-11-10 by the cf15
builder (Claude Code Cloud worker) on `claude/plan-cicd-followup-cf15-build`, from `main` at
`446ae235e7760273734f7d6ef10862ca85338f29`.

Acceptance (a), verbatim: "The documentation-only follow-ups (#1914, #1920 (its documentation part;
the full-shard figure is cf18's), #1928, #1932, #1939, #1949, #1849, plus any documentation-only
remainder of #1945 and #1953) are completed in one cleanup PR; behaviour changes are left to their
implementation phase."

## Result

Every item of the nine issues is classified below. Every documentation-only item is fixed in this
PR, each with the source it was checked against. No code, test, CI file or script changes. Edited
evidence files are corrected in place, never deleted; each correction says what changed and names
cf15 and the issue.

- **Closed by this PR (every item done or owned elsewhere):** #1849, #1920, #1945, #1949, #1953.
- **Left open, with one comment listing what remains:** #1914 (item 2, a test change), #1928
  (items 1 and 3, a test and a selection change), #1932 (items 2 to 4, script behaviour), #1939
  (items 3 and 4, a ledger measurement and a reader change). No cicd-followup phase names these
  items, so each stays on its own issue; no owner is invented.

Classes: **doc** documentation-only, fixed here; **behaviour** a code, test, script or CI change,
left; **done** already done by a later phase or by the evidence itself.

| Issue | Item | Class | Action | Source checked |
| --- | --- | --- | --- | --- |
| #1849 | ci01 4.4 names `a5360d4c` as the durations table's last landing | doc | phase-ci01.md 4.4 now names `b2c04fdf` (2026-10-19, reached `main` with #1505, merge `742a5a65`) and says what it first read | `git log origin/main -- scripts/e2e-durations.json`: `b2c04fdf` then `e54c0896` (2026-11-02); `git merge-base --is-ancestor b2c04fdf a5360d4c^1` true, so #1757 did not change the table |
| #1914 | 1. Lead with the same-machine timing | doc | phase-ci09.md section 5 now leads with 468.8 s to 326.0 s (30%); the Actions means read as supporting. No figure changed | phase-ci09.md section 5 table, same rows |
| #1914 | 2. Seed in `production()` ignores `addGraphicToShow`, `setFolderMode`, `setFolderPlayback` results | behaviour | Left; a test change | `e2e/playout-folders.spec.ts:65,75,76` at `446ae235`: results still ignored |
| #1914 | 3. `bootstrapGraphic` leaves the 800 ms autosave pending | done | None | Fixed by cf05: `e2e/_create.ts:98-105` calls `flushPendingProject()` (`2af95242`, #1603) |
| #1920 | 1. Record the reset commit | doc | phase-ci10.md section 7: `c2ca020a7670ac6a7f2e99150aec9a5108d1e6c6`, 2026-11-01T14:12:39Z | `node scripts/e2e-selection-misses.mjs resets --ref c2ca020a...`: "protection removed or changed: 1 covers line(s)"; `--ref c2ca020a^1` reads `06d3836c` |
| #1920 | 2. Full-shard Actions timing of the merged spec | owned | Left to cf18, as the spec says | spec.md cf15 acceptance |
| #1920 | 3. Durations refresh reads the merged spec at about 4.4 min | doc | phase-ci10.md section 5 records the refresh: 4.918 min, deleted spec gone | `scripts/e2e-durations.json` at `e54c0896` (run 41447757102, landed with #1503 at `d97509d0`) and at `446ae235` |
| #1928 | 1. No S12 test pins the guard off for `list` and `merge` | behaviour | Left; a test change | `scripts/catalog-bench-scope.test.mjs:188` (S12) has no `_mode` case; `e2e/catalog/_bench-scope.mjs:233` |
| #1928 | 2. "526 of 526" is not whole-catalog coverage | done | None | Already counted as known-uncovered (#1926): phase-ci13.md 2.1, phase-ci15.md section 1 (ci12 receipt row), phase-ci17.md (AC-5 scope integrity) |
| #1928 | 3. Catalog gate scripts that raise no catalog run | behaviour | Left; a selection change (an audit reset) | `node scripts/e2e-affected.mjs --files scripts/check-catalog-emit.mjs --json` at `446ae235`: `mode none`, `catalog false` (`catalog-emit.mjs` and `catalog-scope.mjs` give `catalog true`) |
| #1928 | 4. How to bench one unit locally | doc | One sentence in `docs/VERIFICATION.md`, catalog section: scope with `NOACG_ONLY_DESIGNS`/`NOACG_ONLY_CATEGORIES`, never `-g`, `--last-failed`, `--shard` or `--repeat-each` | Rule S5, `e2e/catalog/_bench-scope.mjs:155`; the scoped door already documented at `docs/VERIFICATION.md:637` |
| #1932 | 1. Per-contract figures come from an uncommitted pass | doc | phase-ci13.md section 2 now says the tables came from a one-off pass and the CLI reports only the whole-nightly contract | `scripts/schedule-coverage.mjs` `main()` at `446ae235`: no read of `CONTRACTS` |
| #1932 | 2. A refused activity API silences the report | behaviour | Left; script change | `pushTimes`, `scripts/schedule-coverage.mjs:363` |
| #1932 | 3. Drill-only code in the report module | behaviour | Left; script change | `CONTRACTS` :61, `replayCulprit` :252 |
| #1932 | 4. Run jobs fetched one at a time | behaviour | Left; script change | `scripts/schedule-coverage.mjs` `main()`, per-run `gh api .../jobs` |
| #1932 | 5. `updated_at` as completion time | doc | Stated in phase-ci13.md section 2 (can only overstate a delay) | `scripts/schedule-coverage.mjs:438` |
| #1932 | Related #1622 | none | A pointer, not an item | |
| #1939 | 1. JEV row 2 to row 3 pair unjudged | doc | phase-ci14.md 2.4 and section 4 judge it: started after the check; 27 of 27 judged; section 1 row updated | #1853 comment 6544011578, "Independent phase 2 check ... PASS", 2026-10-31T13:31:19Z; #1858 first commit `e8d41f3b` 13:57:16Z; #1853 first commit `8a24521d` 11:26:21Z (2.08 h) |
| #1939 | 2. Section 2.3 overlap wording | doc | phase-ci14.md 2.3 gives the overlaps: 6.4, 7.3 and 5.5 minutes | Issue events `added_to_merge_queue`/`removed_from_merge_queue` for #1860, #1861, #1864, #1866, #1896, #1899 (#1896/#1899 after the 2.0 clock correction) |
| #1939 | 3. Read admission from the coordinators' ledger `build` events | behaviour (measurement) | Left; the ledgers are not in the repository and ci17 did not read them (phase-ci17.md:121-122) | |
| #1939 | 4. Fall-back-hour clock artefact in the ci01 clocks and ci18 age report | behaviour | Left; a reader change. The artefact is already documented in phase-ci14.md section 5 | |
| #1945 | 1. Two quarantine incidents without an issue | done | None | cf01: #1805 and #1954 (#1945 comment, 2026-11-02T11:05:08Z) |
| #1945 | 2. `production-data` row reads `miss, unmarked` | doc | phase-ci15.md section 3: row annotated, note explains `miss, flake` on `main` after #1940 | `flakyIn`, `scripts/e2e-selection-misses.mjs:182`; `e2e/quarantine.json` at `9c2980d0` adds `e2e/production-data.spec.ts` |
| #1945 | 3. Section 4 plan sizes as of `5ca8b87a` | doc | phase-ci15.md section 4: dated note, a plan that held the spec is one lower after #1940, selection unchanged | Quarantine block, `scripts/e2e-affected.mjs:52`; `production-data` is a `// focus` spec (phase-ci15.md section 3). Plans not re-run: the culprits predate this clone's history |
| #1945 | 4. Section 6 list omits #1942, #1944, #1622 | doc | phase-ci15.md section 6 lists them | phase-ci15.md cites all three |
| #1949 | 1. "Only carrier" lacks ci13's qualifier | doc | phase-ci16.md section 3 row restores it | phase-ci13.md:23-24 |
| #1949 | 2. `8e84002d..origin/main` lists 11, not four | doc | phase-ci16.md section 5: range pinned to `5f60ce97`, 11 landings, none a reset; the four named are from `5ca8b87a` on | `git log --first-parent 8e84002d..5f60ce97`: 11 |
| #1949 | 3. Skip tie is the job's `if:` at ci.yml:923 | doc | phase-ci16.md section 2 names ci.yml:923 | `git show 5f60ce97:.github/workflows/ci.yml`: `if:` at 923, `optional()` at 1522, its catalog call at 1533 |
| #1953 | 1. List all six expiring offline exceptions | doc | phase-ci17.md AC-9 lists six, cites cf09's settlement | `docs/work-specs/e2e-suite-budget/spec.md:204-209`; phase-cf09.md (PR #1995) |
| #1953 | 2. Second AC-4 remedy | doc | phase-ci17.md adds "or evidence that clears each" | phase-ci15.md section 5 |

`docs/work-specs/cicd-improvement/work.json`: the `sha256` of the eight edited evidence files is
refreshed. `node scripts/work-spec.mjs converge docs/work-specs/cicd-improvement/work.json`: 0
problems, status `open`, the same eight open criteria as on `main`. Gaps rise from 742 to 750: eight
`review stale` lines, for the edited ci01, ci09, ci10, ci13, ci14, ci15 and ci16 files, whose
review records predate this change, and for this new file (phase-ci17.md raises none). That is the
expected record of an edit, not a new problem.

## Verification

- Each source in the table, read as cited (git, the reset reader, the planner CLI, the quarantine
  store, the issue and PR events). GitHub REST calls: about 30, below the 100-call bound. No log URL
  or credential is recorded here.
- `node scripts/work-spec.mjs converge` on this branch and on `origin/main`, compared (above).
- `/check` and CI on the reviewed head: in the PR.
- Re-read just before queueing (known-traps "Docs and reconciliation phases"): the nine issues and
  the cited PRs.

## Phase notes

- **Previous verified main SHA:** `446ae235e7760273734f7d6ef10862ca85338f29` (CI push run
  42832319330 green).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`, landed through `/queue-merge`.
  It restores the evidence files, `docs/VERIFICATION.md` and `work.json` hashes, and removes this
  file. Issue closures and comments stay; reopen the closed issues by hand if reverting.
- **Decisions:**
  - Corrections are annotated in place ("Corrected by cicd-followup cf15, #n"), so a reader of an
    earlier evidence file sees what changed and why, as the brief asks.
  - #1928 item 4 was conditional ("if this proves costly"). One sentence in `docs/VERIFICATION.md`
    costs nothing and the scoped door already exists, so it is done rather than left.
  - #1945 item 3's plan sizes were not re-run: the culprits predate the clone's shallow history and
    a full unshallow is out of proportion for a count the issue already states. The note says so.
  - #1920 closes: items 1 and 3 are done and item 2 is cf18's by the spec.
- **Traps:**
  - The default cloud clone is shallow; `git fetch --shallow-since=2026-10-10 origin main` was
    needed to read `b2c04fdf` and `a5360d4c`.
  - ci14 said #1853 had no check comment. It has one (13:31:19Z); a later reader should search the
    PR's comments rather than trust "no check comment".
