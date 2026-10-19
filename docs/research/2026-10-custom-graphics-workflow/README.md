# NoaCG custom graphics: from collected data to air

Research only, prepared 18 October 2026 for the morning review. The revised brief and the owner's election-source clarification are covered. No product implementation, existing work-spec change, hosted write or plan execution.

**Latest: [19 October owner feedback and six proposed run additions](09-owner-feedback-and-run-additions.md).** This narrows the recommendation: preserve import, qualify CasparCG/Bridge and browser output first, and deliver the agent-authored election package and full OGraf system in separate milestones. It also explains the API collection boundary and recommends one shared Bridge provisionally. Existing agreed specs remain unchanged.

The earlier [morning verdict](morning-review.md) and [full assessment](08-whole-plan-assessment.md) review the agreed run against main `4569b9622`, including live candidate selection, the legacy Sheet path, export limits and a larger completion rehearsal. Read their scope proposals alongside the newer owner feedback. The earlier experiment and mockups retain their historical evidence baseline.

For the concrete use case, open the [Finnish election walkthrough](election/README.md). It explains who collects each input, the sample files, exact API body/bindings, four graphic types, February rehearsal and 18 April 2027 operation. [The source investigation](election/source-investigation.md) distinguishes verified Yle/Ministry provenance from the unverified delivery interface. The local proof uses one fixed live candidate; the new assessment explains the additional work needed for selecting different candidates on one reusable live card.

## Review artifacts

- [Pasteable second-opinion brief](second-opinion.md): self-contained review request with examples and evidence limits.
- [Annotated visual index](index.html) and [11-page mockup PDF](NoaCG-election-and-custom-workflow.pdf).
- [Contact sheet](screens/contact-sheet.png) and [all static screens](mockups.html).
- [Actual local experiment report](election/evidence/report.json), [publication gates](election/evidence/publish-gates.json), and [HTTP transcript](election/evidence/http-transcript.json).
- Actual local outputs: [party board](election/evidence/election-party-board.png), [candidate card](election/evidence/election-candidate-card.png), [count bug](election/evidence/election-count-bug.png), [ticker](election/evidence/election-ticker.png).

## Requested research documents

1. [Current-state evidence](01-current-state-evidence.md): immutable baseline, exact file/line citations, working/agreed/gap/proposal matrix.
2. [Scenarios and walkthroughs](02-scenarios-and-walkthroughs.md): bracket, sponsor roll, player overlay and arbitrary SVG end to end.
3. [Authoring and data contract](03-authoring-and-data-contract.md): existing SPX/machine/recipe/OGraf contracts and minimal extensions.
4. [Connection and live recovery](04-connection-and-live-recovery.md): custom mapper, ownership, override, disconnect and error states.
5. [Options and external benchmarks](05-options-and-external-benchmarks.md): Option A recommended, B conditional, C rejected; primary source links.
6. [Validation and acceptance criteria](06-validation-and-acceptance-criteria.md): seven usability tasks and setup/action/observable results with honest evidence status.
7. [Proposed plan amendments](07-proposed-plan-amendments.md): exact relevant decisions/ACs/phases, dependencies and compatibility; existing specs untouched.
8. [Whole-plan assessment](08-whole-plan-assessment.md): completion boundary, source-backed gaps, output-route matrix, supplemental amendments and a complete custom-show rehearsal; [short morning review](morning-review.md).
9. [Owner feedback and run additions](09-owner-feedback-and-run-additions.md): latest scope, P1–P6, separate election acceptance, Bridge recommendation, OGraf roadmap and preparation for the planned 20 October start.

## Focused screen index

The [nine established general Sheet-connection screens](https://github.com/NoaCG/NoaCG-Studio/blob/eccb018d45527d48bab2cbfe4584e893309f53a0/docs/research/2026-10-data-sources/README.md) remain the baseline and are not redrawn here. Every new screen has Click / What happens next / Verify annotations outside the application shell.

| Screen | User action and visible verification |
|---|---|
| [01 SVG fields/behavior](screens/01-svg-fields-behaviour.png) | Select score/image nodes; confirm types and roles; proposed numeric bounds are distinguished from current native support. |
| [02 Custom column mapper](screens/02-custom-column-mapper.png) | Map arbitrary columns with samples/assets; choose Fill or Connect deliberately. |
| [03 Mixed ownership](screens/03-mixed-ownership.png) | See cue fields, shared scalar override, Return to Sheet value, and read-only list together. |
| [04 Top 16 bracket](screens/04-bracket-data-actions.png) | Inspect keyed source matches beside the graphic; use operator Highlight/Crown separately. |
| [05 Field recovery](screens/05-schema-image-recovery.png) | Repair renamed Score column and missing crest while the last validated picture stays on air. |
| [06 Export/reuse](screens/06-export-reuse.png) | Keep resolved values, export a native pack, and explicitly rebind in another production. |
| [07 Election source](screens/07-election-data-origin.png) | Follow Ministry/distributor → adapter → NoaCG and identify the separate newsroom asset job. |
| [08 Election files](screens/08-election-files.png) | Open the concrete roster/snapshots and compare the ordinary update with a correction. |
| [09 Election bindings](screens/09-election-bindings.png) | Trace KOK votes and Aino's candidate key to specific fN fields. |
| [10 Election operation](screens/10-election-on-air.png) | See actual local output captures inside a proposed operator shell; separate incoming updates from Take. |
| [11 Qualification/runbook](screens/11-election-runbook.png) | Distinguish 14 local checks from the real-provider/hosted/output rehearsal still needed. |

## Evidence level

- **Source-inspected:** main eccb018d45527d48bab2cbfe4584e893309f53a0, including PR #1390.
- **Machine-verified locally:** 14 rehearsal assertions, four real publication gates, actual SPX/productionData/composeDocument execution; exact output captures.
- **Static proposals:** 11 HTML-rendered UI mockups, not implemented application features.
- **Not yet scenario-proven on real services:** Yle/Ministry feed access, hosted database/auth/realtime, real Sheets, broadcast engine, human usability, complete SVG/CLI equivalence and custom machine actions.

The earlier arbitrary hosted-page screen is superseded; see the corrected four provider routes in document 02. The smallest recommendation remains improving the source mapper/adapters around existing contracts.

## Reproduction

With the repository's normal dependencies installed, run `node docs/research/2026-10-custom-graphics-workflow/design-source.mjs`, then queue `node docs/research/2026-10-custom-graphics-workflow/render.mjs` with the repository jobs tool and `--cap 5`. The election walkthrough supplies the separate prepare/rehearsal commands. All outputs stay inside this research folder. See [render-check.json](render-check.json) and [validation.md](validation.md).
