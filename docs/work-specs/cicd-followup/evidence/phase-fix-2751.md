# Fix #2751: a covers change resets the selection audit only when a file loses its spec

Scoped fix in the cicd-followup plan run (run issue #1967, phase cf18 reads this audit), outside its
numbered phases. Row class: Risky (a CI script that judges phase cf18).

## The defect

`resetOf` in `scripts/e2e-selection-misses.mjs` restarts the audit's 14-day clean window whenever a
landing's line diff shows a `// covers:` line as removed. Appending a path to an existing line is
shown as one removed and one added line, so an append counts as "protection removed or changed".
The written rule (docs/work-specs/cicd-improvement/runbook.md, "Audit reset and coverage rules")
says additive headers do not reset, and removed protection resets only "when it changes which
existing contracts are selected".

## Rules (written before coding)

Each line is observable in the reset the tool reports (`node scripts/e2e-selection-misses.mjs
resets`) for one first-parent landing on `main`.

- R1. A landing that changes selector code (`SELECTION_CODE`) resets, exactly as before.
- R2. A landing that adds or removes a `// focus` or `// critical:` header line resets, exactly as
  before.
- R3. A landing whose commits carry a `Selection-audit-reset: <reason>` trailer resets, exactly as
  before.
- R4. A landing that deletes a spec file (`e2e/*.spec.ts` or `e2e/configured/*.spec.ts`) resets,
  whatever that spec's header said. A renamed spec is read as deleted and added, so it resets too.
- R5. Every spec file the landing modifies is evaluated, whatever lines its diff shows: the spec's
  covers at the landing's first parent against its covers at the landing, both read with the
  selector's own header reader (`parseSpecHeader`, `scripts/e2e-lists.mjs`). It resets when some
  file tracked at the landing commit (`git ls-tree -r <landing>`, not the working copy) is matched
  by the old covers and not by the new covers of the same spec. The reason names the spec, how many
  files it lost and one of them. (Amended after the Rules review: evaluating only specs whose diff
  shows a removed `covers:` line would miss a line that inserts code or an import above the
  header, which ends the leading comment block and drops every covers line after it.)
- R6. A file that exists only in the parent's tree is not a loss: an old pattern for a folder that
  moved matches nothing in the new tree.
- R7. A spec the tool cannot evaluate resets as before ("protection removed or changed"), with
  what could not be evaluated: a git read that fails, or a header that does not parse on either
  side.
- R8. A covers change that leaves every file in the new tree with every spec it had does not reset:
  an appended path, a line split in two, a moved folder that moved with its pattern, `covers: none`
  replaced by globs. Such a landing is audited like any other.
- R9. A spec added by the landing is additive: it is not evaluated and does not reset on its own.
- R10. Covers lines only added (no covers line removed or changed) do not reset, as before.
- R11. Offline and configured specs follow the same rules; configured covers are the configured
  triggers.
- R12. The change is to how the audit reads history. Selector code, spec headers,
  `e2e/quarantine.json` and the workflows are unchanged, so no pull request or merge group selects
  a different test.

## The Rules review

A fresh read-only `/so` (session_017SdbwMaMa9Fqjp1h8c9djG) on head 1f662f47: AGREE WITH
CORRECTIONS, A-.

- F1, case list. Under R5, 361cb6f6 (#2294) and cdc1011e (#2314) lose no file: both rewrite a path
  into a brace glob that still matches it (`src/components/{SyncStatus,AccountSaveNotice}.tsx`,
  `src/components/home/{ProductionAudienceWorkspace,InteractionQuestions}.tsx`). The issue's
  measurement counted them as narrowing, most likely without expanding braces. The builder
  reproduced this with `parseSpecHeader` against `git ls-tree -r`. Default taken, reported to the
  coordinator: the issue's rule as written, so these two do not reset; 78ce3f35 (#2362) still
  resets (five configured specs deleted, R4), and a synthetic real narrowing is tested instead.
- F2, header termination. Adopted into R5 (every modified spec is evaluated).
  Known and unchanged (R2 says "exactly as before"): a `// focus` or `// critical:` line pushed
  out of the leading block by inserted code shows no removed header line, so R2 does not see it.
- F3, per-spec additivity. A covers line for a file nothing mapped before narrows that file's
  selection from escalation (shared set or the whole configured set) to the named specs. The
  runbook says additive headers do not reset, so R10 stands; it does not mean "no selection
  change".

## Resets after cf14, old rule against new

Every first-parent landing on `main` after cf14 (86749ef1, 2026-11-05) through f349290c, read with
the old `resetOf` and with the new one (`latestReset` one landing at a time; full history fetched).
The old rule resets on 28 landings; the new rule on 10. The 18 dropped are all covers-only resets
in which no file in the landing's tree loses a spec. #2697 (66ab49d3) and #2362 (78ce3f35) keep
resetting, on selector code and on five deleted configured specs.

| Landing | Committed | PR | Old reason | Resets under the new rule |
| --- | --- | --- | --- | --- |
| 3d2c2c11 | 2026-11-24T05:25Z | #2743 | protection removed or changed: 1 covers line(s) | no |
| 0a57313e | 2026-11-24T04:37Z | #2741 | protection removed or changed: 1 covers line(s) | no |
| df55d141 | 2026-11-23T20:49Z | #2737 | protection removed or changed: 1 covers line(s) | no |
| 614b125a | 2026-11-23T13:50Z | #2734 | protection removed or changed: 1 covers line(s) | no |
| 66ab49d3 | 2026-11-22T14:39Z | #2697 | selector code: scripts/e2e-affected.mjs; protection removed or changed: 9 covers line(s) | yes |
| 79edf4da | 2026-11-21T11:35Z | #2661 | protection removed or changed: 1 covers line(s) | no |
| 6e64a615 | 2026-11-21T07:18Z | #2630 | protection removed or changed: 1 covers line(s) | no |
| bedd28f8 | 2026-11-20T22:38Z | #2629 | protection removed or changed: 1 covers line(s) | no |
| 18c0c25f | 2026-11-14T03:24Z | #2530 | selector code: scripts/e2e-affected.mjs | yes |
| f9fa0ce4 | 2026-11-14T01:39Z | #2529 | selector code: scripts/e2e-affected.mjs | yes |
| b1e06209 | 2026-11-13T22:43Z | #2522 | selector code: scripts/e2e-affected.mjs | yes |
| 5f6c362f | 2026-11-13T10:25Z | #2438 | critical/shared membership: 1 header line(s) changed | yes |
| 1938f262 | 2026-11-12T18:59Z | #2443 | protection removed or changed: 1 covers line(s) | no |
| c1ce4e4e | 2026-11-12T14:00Z | #2424 | selector code: scripts/e2e-traced.mjs | yes |
| 6febd132 | 2026-11-12T10:37Z | #2364 | selector code: scripts/e2e-affected.mjs | yes |
| c0bc989f | 2026-11-11T16:34Z | #2380 | protection removed or changed: 1 covers line(s) | no |
| d8b18080 | 2026-11-11T12:09Z | #2374 | protection removed or changed: 1 covers line(s) | no |
| 78ce3f35 | 2026-11-10T21:32Z | #2362 | protection removed or changed: 25 covers line(s) | yes |
| d521e014 | 2026-11-09T19:14Z | #2321 | selector code: scripts/e2e-affected.mjs | yes |
| cdc1011e | 2026-11-09T13:28Z | #2314 | protection removed or changed: 2 covers line(s) | no |
| 361cb6f6 | 2026-11-08T15:47Z | #2294 | protection removed or changed: 1 covers line(s) | no |
| 0c193936 | 2026-11-06T22:03Z | #2264 | selector code: scripts/e2e-affected.mjs | yes |
| 3ed3e33a | 2026-11-06T11:35Z | #2217 | protection removed or changed: 1 covers line(s) | no |
| 11346a60 | 2026-11-06T10:51Z | #2210 | protection removed or changed: 1 covers line(s) | no |
| 28158bac | 2026-11-06T10:47Z | #2214 | protection removed or changed: 1 covers line(s) | no |
| 06fc649d | 2026-11-06T10:03Z | #2205 | protection removed or changed: 1 covers line(s) | no |
| 7d5e6683 | 2026-11-06T07:18Z | #2227 | protection removed or changed: 2 covers line(s) | no |
| a4db3042 | 2026-11-05T11:58Z | #2196 | protection removed or changed: 1 covers line(s) | no |

Latest reset under the old rule: 3d2c2c11 (#2743, 2026-11-24T05:25Z), an append. Under the new
rule: 66ab49d3 (#2697, 2026-11-22T14:39:42Z), selector code (`scripts/e2e-affected.mjs`), from
`node scripts/e2e-selection-misses.mjs resets --ref origin/main`. Across the last 400 landings the
new rule finds 13 resets, none of them "not evaluated", so the current parser reads every older
header in that window.

## Tests and the mutations they catch

`scripts/e2e-selection-misses.test.mjs`:

- Real landings (fixtures cut from `git show` and `git ls-tree -r`): 3d2c2c11, bedd28f8,
  79edf4da, 361cb6f6 and cdc1011e do not reset; 78ce3f35 does (spec deleted).
- A reference model written from R5, R6 and R8 by hand: six covers values with the files each
  selects listed as sets, every header of up to two of them (22) against every other (484 pairs);
  a reset exactly when the union before minus the union after is not empty. Plus R4 (deleted),
  R9 (added), R7 (unreadable or unparsable on either side) and R1 to R3 beside it.
- Through `latestReset` with an injected git: a modified spec with no covers line removed in its
  diff (an import above the header) resets; a brace-glob rewrite does not; an unreadable spec resets;
  the tree is read once per evaluated landing.

Mutations, each run against the suite (12 tests) before the review fix below:

| Mutation in `scripts/e2e-selection-misses.mjs` | Result |
| --- | --- |
| M1 `resetOf` ignores the evaluation (the old line rule) | 3 tests fail |
| M2 a deleted spec is skipped | 2 fail |
| M3 an unreadable spec is swallowed | 2 fail |
| M4 only specs whose diff removes a covers line are evaluated | 1 fails |
| M5 the unchanged-lines shortcut becomes a line count | 2 fail |
| M6 a file counts as covered only when a glob names it literally | 3 fail |
| M7 the tree is read at the parent, not the landing (after the final `/so`, N1) | 1 fails |
| M8 a failed tree read is swallowed (after the final `/so`, N2) | 1 fails |

Rules found after coding: a spec whose `--name-status` letter is neither A nor D (a type change)
was first skipped; `/check` review made every status other than A read like a modification
(fail-safe), with a test.

## The final review

A fresh read-only `/so` (session_017SdbwMdpvz5KAcPkE1nzLa) on head ed9ed875: AGREE, A. It replayed
the reset table on real history and found it exact. Two test-only nits, both answered in the next
commit: N1, nothing checked that the tree is read at the landing (M7); N2, nothing checked that a
failed tree read resets (M8, which would not fail safe). Production code unchanged.

## Measurement contract

Not applicable: the fix changes which landing counts as an audit reset, not CI time, cost or
flake rates.
