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

## Measurement contract

Not applicable: the fix changes which landing counts as an audit reset, not CI time, cost or
flake rates.
