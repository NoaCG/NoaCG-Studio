# Custom graphics: static morning-review package

Prepared 18 October 2026 for review on 19 October, Kyiv time. Research artifacts only: no product implementation, live connections, deployments, plan execution, or changes to agreed authorities.

> **Superseded in part by the revised research:** the generic “Add hosted graphic” route is withdrawn as a recommendation. Use self-contained native/OGraf packages or the qualified media route. See [the corrected workflow and election proof](../2026-10-custom-graphics-workflow/README.md). The old screens remain historical proposals.

## Open the mockups

- [Visual index](index.html): all 23 screens, each linked to its full-resolution PNG.
- [Complete review PDF](NoaCG-custom-graphics-mockups.pdf): 23 pages, including click/next/verification notes.
- [Contact sheet](contact-sheet.png): the whole journey at a glance.
- [All static screens](mockups.html): self-contained local HTML with bundled fonts.
- [Pasteable second-opinion brief](second-opinion.md).
- [Render checks](render-check.json).

Every screen is labeled **PROPOSED UI / STATIC MOCKUP / SIMULATED DATA**. Existing visual patterns, agreed future behavior, and new proposals appear together to make the future journey reviewable. This is not evidence that the proposed behavior works today. Buttons are illustrations and do not operate anything.

## Walkthrough index

| Screens | Scenario | What to inspect |
|---|---|---|
| [01](screens/01-svg-import.png)–[03](screens/03-svg-controls.png) | D: Illustrator SVG | Import checks; selected text and image elements; confirmed numeric type; separate values and actions. |
| [04](screens/04-svg-cue.png)–[08](screens/08-svg-live.png) | D: connect and operate | Finish/add to production; field-led Connect; Sheet cell; scrolling column; image validation; Preview/Take/Program. |
| [09](screens/09-bracket-author.png)–[11](screens/11-bracket-live.png) | A: Top 16 bracket | Visible sixteen-team bracket; declared match identities/relationships; source-row mapping; operator-controlled progression. |
| [12](screens/12-provider-import.png)–[15](screens/15-provider-live.png) | B: commercial roll | Imported assets/package versus hosted content; capability checks; missing editable contract; deliberately advancing the roll. |
| [16](screens/16-player-author.png)–[19](screens/19-player-live.png) | C: player-video overlay | Mixed content contract; pushed API value/text collection; selected roster row copied once; multiple sources and shared score. |
| [20](screens/20-recovery-failed.png)–[23](screens/23-disconnect-reuse.png) | Recovery and reuse | Failed read; shared manual override during Pause; valid empty list; disconnect; source review in another production. |

The match-strip and player-overlay examples both combine text, images, scores and a scrolling list. Each screen includes **Click**, **What happens next**, and **Verify** outside the proposed application surface.

## Evidence baseline

Repository: NoaCG/NoaCG-Studio. Inspected current-main snapshot: `63b3e00b9ff27db221c3f71ead5abb2c2a599336`, fetched 18 October 2026. The initial workspace snapshot was older; an isolated research worktree was created from fetched main before artifact edits.

[PR #1390](https://github.com/NoaCG/NoaCG-Studio/pull/1390) was verified through the GitHub connector as **merged**, at `25384c35d66f22062cf90f81461ddd46ff5b6261` on 18 October 2026, 18:25 UTC. It records planning agreement, not implementation authorization. It is a reference, not a PR created or updated by this work.

| Classification | Evidence | Effect on the mockups |
|---|---|---|
| Existing UI | `public/docs/svg-fields.png`, `public/docs/data-cue.png`, `public/landing/shot-playout.png` | Dark shell, amber accent, five-step import rail, artwork preview, Preview/Program, cue editor, transport and rundown. These are repository screenshots, not newly captured application runtime evidence. |
| Existing implementation | `src/templates/importedDesign/designTypes.ts`, `artworkFields.ts`, `svgBind.ts`; `src/components/wizard/import/MapSvgFieldsStep.tsx` | Text and image elements can become fields; numeric samples have number handling; image empty values can restore original artwork. UI is redesigned around those capabilities without claiming the new screen layout exists. |
| Existing implementation | `src/model/productionData.ts` (`formatValue`, `flattenLeaves`, `resolveBindings`), `src/model/shows.ts` (`setFieldBinding`, `setFieldBindings`) | Graphic-name/field-ID bindings work with values independently of catalogue type. Scalars stringify; scalar arrays form lines; objects and object arrays are not directly field values. |
| Existing API | `docs/DATA_API.md`, `docs/PRODUCTION_DATA_PLAN.md` | Published production data key; pushed values through the existing data path; updates and show actions remain separate. Direct `/update` is still available; the screens emphasize `/patch`. |
| Agreed future behavior | `docs/research/2026-10-data-sources/synthesis-2026-10-17.md` §§3–7; `docs/work-specs/data-sources/spec.md` | Field-led Fill versus Connect; graphic-wide connection scope; source status; same binding engine; no new shared workspace or general store. |
| Agreed future behavior | `docs/work-specs/sheet-data-flow/spec.md` | Browser-led reads at 5 seconds under one lease, published server fallback about once a minute; failed reads preserve last good values; valid empty lists clear; D4 manual override; source Pause and changed-cell Resume. Latency remains subject to qualification. |
| Agreed plan/authority | data-sources, sheet-data-flow, audience-flow and production-page-refactor `spec.md` / `work.json` | Keep C0 → selected refactor work → C1–C7 order and track Q; do not start it. Keep destination hygiene for prepared messages and the separate Messages view. |
| New proposal | This package, screens 05–07, 09–10, 12–14, 23 | Explicit arbitrary cell/column selection, grouped structured-row mapping, package capability inspection, hosted-content wrapper and reuse/remapping review require further research and acceptance. |

The distinction requested in the brief is real in the inspected implementation: ordinary fields are not catalogue-limited, but that does not establish an intuitive custom connection workflow or support for semantic collections such as a bracket. No new binding engine is proposed here.

## Rules preserved in every scenario

1. **Fill is cue-owned; Connect is graphic-wide.** Two cues of one connected graphic follow the same live field. Different independently connected matches may require separate graphic instances; no cue-scoped binding feature is implied.
2. **Data never Takes, advances, resets or clears a graphic.** Clearing a list field from a valid empty read is a content update, not an Out/Clear show command.
3. **Manual score behavior depends on source behavior.** For Sheets, a manual shared value holds until the source cell changes. Pause retains it; Resume compares with the last good source snapshot. For pushed API data, the next write may replace the operator's value. There is no invented persistent operator lock.
4. **API Pause is not assumed shipped.** It remains C5's suppress-and-diff design with the agreed stop-the-sender fallback. The API mockups show Details rather than a falsely working Pause.
5. **Prepared message destinations remain protected.** A body/name field bound live cannot accept prepared messages, and a protected destination cannot later acquire a binding. These screens do not propose bypassing the C0 rules or changing deliberate `/update` semantics.
6. **Publishing remains explicit.** The API example uses a published production. Saving changed bindings immediately on a published production is C2 behavior, not today's runtime claim.
7. **Image success, empty content and fetch failure are distinct.** A sample successfully loaded in the editor does not prove output availability. Provider assets require an approved, portable reference or packaging; SVG image empty behavior is not silently redefined.

## New proposals to review before implementation

### Custom cell and column selection

Provide a finite picker for a Sheet cell, column or explicitly keyed row set, starting at the destination field. The concrete cell example intentionally uses B3; moving rows would change that cell's meaning. A stable row-key option should be offered only when a source actually has unique keys. No matching catalogue category, formula language, or automatic semantic guess is needed.

### Bracket grouping

Keep explicit leaf fields in the runtime contract. Add authoring metadata to group them by stable match/team IDs and declare progression relationships. A mapping adapter would resolve source rows to those leaf fields in a consistent batch. This needs a real schema and compatibility proof before implementation; the UI is not evidence of a working object-array binding.

The bracket shown uses 16 teams and 15 matches. The author must declare uniqueness, next-match and next-slot relationships and validate an acyclic progression graph. Winner highlighting and advancing remain deliberate actions. Correcting an upstream result after advancement needs further interaction design; the screen does not claim to solve it.

### Provider material

A compatible package can carry assets, font requirements, editable declarations and actions. An arbitrary ZIP cannot. A hosted page may be reachable and embeddable yet expose no editable field/control protocol. Screen 14 deliberately stops short of mapping it. Authentication, embedding restrictions, output-environment reachability, update readiness and fallback behavior require provider-specific evidence. The sample `.example` URL is fictional.

### Reuse

Preserve artwork, field definitions and controls. Review production-local sources and credentials when adding a graphic elsewhere; do not copy a production data key. Detect missing field IDs and incompatible types rather than silently guessing a replacement mapping. How aliases/renames are migrated remains outside the agreed name-keyed-binding run.

## Usability questions for the review

- Can a new operator explain the difference between Fill and Connect after seeing screen 04?
- Can they identify the source of each value and which other cues/graphics will change?
- Can they import a custom SVG, expose a crest and score, and connect them without selecting a catalogue template?
- Can they connect one list column and verify the scrolling result?
- Do they understand that a hosted URL without a contract has no editable fields?
- Can they recover from an unreadable Sheet without clearing valid on-air content?
- Can they predict what happens to a manual score on the next Sheet read versus the next API write?

Use actual creators/operators for these tasks. Static screens can test comprehension and discoverability; they cannot establish interaction timing, rendering continuity, data safety or provider latency.

## Proposed placement in the existing plan

These are review suggestions only. No spec or work.json is modified.

| Existing work | Suggested addition after review |
|---|---|
| Before C1 / track Q | Validate arbitrary custom field examples and SVG authoring declarations; confirm which cell/column mappings are necessary. |
| C1 | Include a non-catalogue graphic with text, images, numbers and a list; field-led source selection and preview; type mismatch and empty/failure fixtures. |
| C2 | Verify graphic-wide connection scope, immediate published configuration persistence, shared source ownership, Pause/reload and output asset availability on custom graphics. |
| C3 | Reuse the selected-row snapshot behavior where applicable; do not weaken prepared-message destination protection. |
| C5 | Test pushed custom scalar/list values and conflicting writer behavior; keep API Pause conditional on its agreed qualification. |
| C6–C7 | Add all four custom journeys, disconnect/reuse, published output checks, and operator comprehension tasks. |
| Separate authoring research | Bracket relationships and keyed structured mapping; provider package/hosted protocols; schema evolution. Do not silently append these to C1. |

## Verification and limits

The renderer creates 23 PNGs and a 23-page PDF from the same static HTML, then generates the visual index/contact sheet. It records JavaScript errors and major container overflow in `render-check.json`. Screens are visually inspected at readable resolution. Local assets and fonts keep the package viewable without a network connection.

Final checks: 23 PNGs; PDF metadata reports 23 pages; zero JavaScript errors and zero major-container overflow; no missing local index/Markdown links; both generator scripts pass Node syntax checks; `git diff --check` passes. Five applicable repository gates passed: contract freshness, contract citations, docs index, client-secret scan and copy check. The initial default-sandbox gate attempt was interrupted after stalling in `git check-ignore`; the bounded retry with the supported shell permission completed successfully. There are no changes outside this research directory.

Initial render attempts could not launch Chromium inside the default shell sandbox (including an already-running queue worker). Once that worker had exited, rendering was retried through the repository's browser-job queue with the shell's supported network permission, which permits Chromium's required local sockets. No destination-policy bypass or credential changes were used.

No application build, live provider request, real Sheet edit, API write, database mutation, output-player acceptance test or usability trial was performed. New primary-source comparison research is not claimed by this visual package. The full research brief remains broader than these mockups.

To regenerate, run `node design-source.mjs`, then run `node render.mjs` from a checkout with Playwright available through the repository's browser-job queue. `MOCKUP_PLAYWRIGHT_PACKAGE` can point to an installed checkout's `package.json`; it is only a module-resolution selector. Open `index.html` locally or use the PDF for sharing.
