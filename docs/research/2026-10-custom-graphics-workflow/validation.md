# Verification record

Research baseline: main eccb018d45527d48bab2cbfe4584e893309f53a0. Branch: codex/custom-graphics-mockups, isolated worktree. No src/, api/, existing work-spec or authority changes.

| Check | Result | Evidence |
|---|---|---|
| Fixture generation | PASS | prepare.mjs produced three synthetic results snapshots, CSV rosters, eleven image assets, four template objects, cue values and bindings |
| Native template validation | PASS, four graphics; zero errors/warnings | election/evidence/publish-gates.json; actual publication gate |
| Data-to-output rehearsal | PASS, 14 assertions | Job j-0007; election/evidence/report.json; actual binding/parser/preview code with loopback stand-in |
| First mockup render | Layout defects identified | Job j-0008 found vertical overflow on screens 01 and 10; corrected spacing/preview heights |
| Final mockup render | PASS, 11 screens, no page errors/overflow | Jobs j-0009 and j-0010 (final bracket fixture alignment); render-check.json; 11-page PDF and PNGs |
| Visual inspection | PASS for research review | Contact sheet and full-resolution fields, ownership, collection and election-operation screens inspected; actual party board inspected |
| Repository documentation gates | PASS, five gates | npm run gates -- run --changed origin/main: contract freshness, contract citations, docs index, client secrets, copy |
| JSON parsing and local document links | PASS after final index/validation files added | All research JSON parses; all local Markdown targets resolve |
| Archive integrity | PASS | ZIP integrity checked after packaging; all indexed screens and four output captures included |

No product build was needed. Human usability, full SVG import/CLI parity, actual Sheets, hosted auth/SQL/realtime, real provider access/schema/parser, NOACG_ANIM custom-event integration and actual OBS/vMix/CasparCG output were not exercised. The new UI and the proposed integration amendments remain proposals.

The official archive and StatFin API requests were blocked by this environment's network proxy (403 tunnel response). Source research therefore records what primary web pages establish, plus clearly attributed secondary archive-format pointers; supplied data is synthetic, not falsely labeled downloaded official data.

## Whole-plan follow-up review, 18 October 2026

Inspected current main `4569b9622923e1ecc9c790c071ee27e263580324` after rebasing the research branch. Added `morning-review.md` and `08-whole-plan-assessment.md`; linked them from the Markdown and visual indexes. The mockup images, PDF and earlier experiment receipts are unchanged.

- Reviewed the supplied second-opinion brief, agreed run/specs, adjacent authoring/playout/team plans and current source. Findings are source-inspected; no new runtime or real-output pass is claimed.
- All 25 pinned source references in the assessment exist at the cited commit; cited line numbers are in range. All local Markdown links in the 15 research documents and the HTML index targets resolve.
- `node --check` passed for the research render script after its index-link update. No browser render was needed for the link-only change.
- `git diff --cached --check` passed. The five applicable repository gates passed against origin/main: contract freshness, contract citations, documentation index, client secrets and copy.
- All branch changes remain under `docs/research/`. No product source, agreed work-spec, authority, hosted configuration or running production was changed. The product plan run was not started.

The updated review ZIP includes both new documents. Archive integrity and exact agreement with the research folder are checked during packaging. Human feedback and real-device/provider acceptance remain future work, as requested by the owner.
