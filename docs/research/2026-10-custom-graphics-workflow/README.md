# NoaCG custom graphics: from collected data to air

**Latest review:** [Argon feedback reconciliation](14-argon-review-reconciliation.md) accepts the
election-first sequencing and strengthens candidate-selection tests, while correcting factual
errors against main `70714e8f5`. The [original feedback](argon-review-2026-10-19.txt) is preserved.
Only the review candidate is revised; no new extension is authorized or implemented.

**Full-run review prompt:** [22-step baseline, Companion qualification and proposed competitive extensions](13-full-run-second-opinion.md).
Self-contained second-opinion handoff with ready conditions, evidence limits and a recommended
expanded programme. Extensions are review candidates, not changes to the agreed executable specs.

Research prepared 18 October 2026, followed by owner refinements on 19 October. No product implementation or plan execution. The 19 October integration now updates the actual work specs with the owner's authorization; the earlier research-only status is historical.

**Prior integration: [competitor findings integrated into the authoritative plan](../../work-specs/production-page-refactor/evidence/research-integration-2026-10-19.md).** The supplied 19 October research sharpens current data/status acceptance and later OGraf/API/layout scopes. The 22-step order plus Q is preserved; Friday is a progress checkpoint, not a deadline. No implementation or run has started.

The earlier [Pixotope roadmap proposal](12-pixotope-roadmap-proposal.md) remains background, including a bounded Discovery investigation. The integration receipt identifies adopted refinements and later proposals; optional investigations are not automatically authorized.

[Integration into the actual plan](../../work-specs/production-page-refactor/evidence/plan-refinement-2026-10-19.md) records the earlier accepted refinements: all 22 steps, P1–P6, whole-graphic connections and downloadable starter data. The final human trial follows all refactors. Competitor findings are now incorporated; the final whole-plan review remains pending and execution has not started.

[Whole-graphic connections and downloadable data templates](11-whole-graphic-connections.md) records the rationale and future Excel/local-file issue.

The [complete-run cloud and verification strategy](10-verification-and-execution-strategy.md) covers all 22 current steps in one coordinated project, with flexible work blocks. It maps cloud versus local work, explains safe avoidance of duplicate verification, and includes current CI timing evidence. The proposed runner/CI changes have not been implemented.

[19 October owner feedback and six proposed run additions](09-owner-feedback-and-run-additions.md) keeps import redesign, the agent-authored election package and the full OGraf system separate, while requiring CasparCG/Bridge and browser output first. It also explains the API collection boundary and recommends one shared Bridge provisionally. The actual specs now incorporate the accepted additions and supersede the earlier two-window wording.

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
10. [Verification and execution strategy](10-verification-and-execution-strategy.md): all phases, cloud/local assignment, actual CI measurements, duplicate-dispatch prevention and the proposed multi-day run boundary.
11. [Whole-graphic connections](11-whole-graphic-connections.md): bulk matching as the primary interaction, downloadable starter data, bracket identity, and the future source-provider issue.
12. [Pixotope roadmap proposal](12-pixotope-roadmap-proposal.md): current evidence, roadmap mapping, priorities, acceptance and Discovery test plan; proposal only.

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
