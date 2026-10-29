# SVG workflow decisions

Draft planning decisions, 29 October 2026. The owner requested research-informed improvements and
another whole-plan opinion before implementation. Public repository documentation records the
requirements and NoaCG seams; supplied external investigation archives remain outside public git.
Source baseline: `96bb45612f2a183b3d3e18f4287552c1f3e41802`.

## Selected additions

| Row | Outcome | Existing seam |
|---|---|---|
| 12 | Inspect/correct an inferred field by its actual artwork | MapSvgFieldsStep, draft, fieldAutoMap |
| 19 | Award events, corrections and refused events have distinct effects | score recipe, graphicVerbs, animRuntime |
| 23 | A second author removes the Lock requirement through the supported variant | BehaviourSection, quiz recipe, saved draft |
| 26 | Understand linked roles/names without JSON or an input per person | contentFormats, credits recipe/style binding |
| 34 | Text/source updates preserve useful ongoing motion | tickerMotion, shared data binding |
| 37 | Arrangements and supported control surfaces keep canonical target identity | controlModel, panelActions, ActionArranger |
| 41 | Prove import-to-output and reimport/recovery as one journey | existing preparation, output and configured harnesses |

Requirements are user outcomes, not copies of another product's UI. Code inspection establishes
reuse opportunities, not a new passing runtime result. Tests must first expose any missing behavior;
a passing existing path needs no gratuitous implementation.

## Preserve existing distinctions

- A value change does not automatically mean a semantic event. An upward score correction is not
  necessarily an awarded point. An event acknowledgement is not proof of its visible effect.
- A timeline pause called Lock does not enforce domain locking. Disabling an optional Lock edge
  differs from removing every unused state/control. Test the exact selected profile.
- Data editing, motion authoring, behavior selection and operator presentation are connected through
  existing contracts. Do not create parallel stores or an alternative control renderer.
- One list may drive several credits layouts. Preserve role/name associations and field identity;
  do not replace the proven text/list grammar merely to resemble another schema.
- Continuity is a visible outcome. Requiring the same animation object is stronger than necessary;
  measure no unwanted blank/re-entry and the declared item boundary instead.
- Conformance, usable setup, visual result, receiving-host behavior and recovery are distinct evidence.
  Unknown state remains unknown until the runtime reports it.

## Deferred directions

A generic rule/form/dashboard editor, user expression language, proprietary host integration,
new nested-collection store, generic arbitrary-SVG ticker compiler, full template overhaul and
automatic multi-zone behavior synthesis are outside this run. Three independent notice zones
remain a bounded composition diagnostic, with supported/unsupported outcomes recorded. Real
failures within declared seams can be repaired in their row; a new engine needs a later proposal.

## Model selection is an experiment

The 28 October Gateway catalog snapshot listed Jev 1.14 at $0.042/M input, Elephant at $0.035/M,
Haiku 5.5 and ordinary Luna at $0.10/M input + $0.50/M output, and existing Gemini Flash Lite at
$0.10/$0.40. These are base rates, not image invoices or a quality ranking. Routes, prices,
context limits and no-training/ZDR policy must be rechecked. Luna Decisions was not eligible
under the default ZDR requirement; do not silently relax it. Jev images require the exact pinned,
tested endpoint rather than the text-only alias. An optional image arm that cannot qualify is
reported unavailable; it does not invent a prerequisite for useful structured import.

There is no winner yet. Development screens the declared configurations; holdout uses at most
three frozen candidates plus established baselines. Select by useful complete setups, consequential
errors, correction effort, latency and full billed cost. A small held-out pilot is not broad accuracy
proof. No-go and partial-go are honest outcomes; acceptance must never be weakened to keep a run moving.

## Prior-to-current row mapping

Seven additions are inserted before the original final matrix, not appended after release.
The 36-row draft maps as follows; the new numbered spec is the only execution numbering:

| Previous row | Current row |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |
| 7 | 7 |
| 8 | 8 |
| 9 | 9 |
| 10 | 10 |
| 11 | 11 |
| 12 | 13 |
| 13 | 14 |
| 14 | 15 |
| 15 | 16 |
| 16 | 17 |
| 17 | 18 |
| 18 | 20 |
| 19 | 21 |
| 20 | 22 |
| 21 | 24 |
| 22 | 25 |
| 23 | 27 |
| 24 | 28 |
| 25 | 29 |
| 26 | 30 |
| 27 | 31 |
| 28 | 32 |
| 29 | 33 |
| 30 | 35 |
| 31 | 36 |
| 32 | 38 |
| 33 | 39 |
| 34 | 40 |
| 35 | 42 |
| 36 | 43 |

No previous project or ledger exists for this plan, so no running phase migration is authorized.
