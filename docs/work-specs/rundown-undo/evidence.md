# Rundown undo plan evidence

This records the original docs-only verification. Current runtime implementation and
verification are recorded in [implementation](implementation.md).

Branch: `codex/e-rundown-undo`. Source baseline: `5f79c85a3`.
Scope: `docs/work-specs/rundown-undo/` plus the authorized
[issue #805](https://github.com/NoaCG/NoaCG-Studio/issues/805) addition. No product/history implementation.

## Source checks

Read ProductionPage's draft/flush, deletion, clipboard, authoring wrapper, data-change subscription
and key activation paths; shows.ts's save envelope, move/paste/edit/delete/folder APIs;
playoutKeys.ts's modifier map and native typing guard; durableStore's mirror, rollback,
commitDurableWrites and cross-tab invalidation; teamShows cache APIs; teamProductions save CAS,
merge/retry pump and state subscriptions. Names in the plan were checked against those files.

Read `e2e/playout-cues.spec.ts`, including command-count, source deletion and reorder/reload
contracts. Inspected the focused `e2e/playout-folders.spec.ts` cases for failed writes, duplicate,
Remove folder and folder invariants. These existing tests were not rerun as undo proof.

`npm run rules -- docs/work-specs/rundown-undo/plan.md docs/work-specs/rundown-undo/evidence.md
--loaded AGENTS.md` completed before editing with no missing folder guidance.

## Reproduction limits

The source has no rundown Z/Y handler. No running browser reproduction was attempted in this
docs-only task; the owner's actual incident, OS/native text undo, Bridge/runtime behavior,
team contention and personal/cloud races remain unmeasured here. Acceptance cases in plan.md
are requirements for a future implementation, not claims of current support.
No visual product acceptance applies because this branch changes no rendered product.

## Check result

Exact review scope from `node scripts/review-request.mjs --json`: branch
`codex/e-rundown-undo`, base `5f79c85a3b8ab118573fc186e1f2aa8c7fda5e85`, the three files above.
No callable general review/simplify capability was available; both passes ran inline.

- Review `inline:3/3`: fixed inverse guards for live cue deletion/running folders, clarified the
  serialized retention budget versus real heap use, and reconciled metadata-only team CAS retry
  with the promise that unrelated metadata survives. Reviewed code claims, scope and edge cases.
- Simplify `inline`: expanded the server-apply API shorthand into exact names, tightened prose,
  removed the extra EOF blank line. No implementation or unrelated cleanup.
- Verify `inline`: `check-docs-index`, `owner-receipts --check`, and `check-goals-budget` passed.
  An inline Node cross-check passed for 25 current seam names, the relative evidence link and
  public-copy em-dash absence. Its initial literal check rejected the `applyServerTeamShow(s)`
  shorthand; exact API spelling corrected that, and the final check passed.
- Required `npm run build`: passed, actual shell exit code 0 on the normal approved host.
  The build test tier ran 2,418 tests: 2,415 passed, 3 skipped, 0 failed. Type checks, lint,
  dependency checks, bundle/prerender, secret scan and after-build checks completed.
  Full local log: `docs/work-specs/rundown-undo/build.log` (ignored).

## Documentation acceptance

| Criterion | Observation |
| --- | --- |
| Actual mutation/cache/save/subscription seams named | Pass: source review and 25-name cross-check; proposed additions are labeled as proposals |
| Multi-step move/delete/duplicate/edit, history ownership, native typing and redo boundary specified | Pass: scope table, draft grouping and observable cases in plan.md |
| Save failure, remote changes and production/account switch guards specified | Pass: explicit conditional-write/receipt prerequisites and residual personal LWW limits |
| Live commands excluded and reproduction limits stated | Pass: data-only inverse and live-source refusal requirements; no runtime claims |
| Only authorized documentation changes | Pass: working-tree scope inspected; no product/history code, browser run or framework/rule changes |
| Orchestration observation tracked without inventing an owner ask | Pass: derived finding with supplied coordinator figures clearly marked as not independently remeasured |

Next bounded implementation: prove the save receipts and conditional-restore seam in plan.md A
before advertising history. Every runtime acceptance case remains future implementation work.
The coordinator owns final wave usage reporting; this worker did not recompute its observations.
