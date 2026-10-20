# Walkthroughs: artwork, data, operator, air

Read the [election walkthrough](election/README.md) first for the concrete data-collection example. Open [the annotated screens](NoaCG-election-and-custom-workflow.pdf) alongside this document. All UI screens are proposals; the four election output captures are actual local rehearsal renders.

## A — Harbour Cup, custom Top 16 bracket

1. Designer supplies a Top 16 SVG with 15 fixed match slots. Catalogue br01–br04 can draw simple results from one textarea, but cannot preserve this fixed artwork, logo positions and slot relationships. Choose custom import or agent authoring deliberately.
2. Expose each slot's team A/B name, logo, score and winner indication as explicit fN fields. Keep a reviewed field map. There is no existing bracket recipe; for today's contract an authored native template is the complete route. A proposed table-slots recipe would make the visual route easier later.
3. The producer maintains Teams and [Matches.csv](fixtures/Matches.csv). Upstream formulas or the results supplier compute winners/progression into stable match keys `R16_01…F_01`; no relational join or winner engine is added to Show.data. Future opponents can read “TBD”. Advancing data changes slot content; it never dispatches an event.
4. Add the graphic to a production, prepare “Overview” and “Final focus” cues, then map fields to `cup.matches.R16_01.a_name`, `.a_score`, `.a_logo`, etc. A custom Sheet mapper is proposed; an existing API sender can already materialize this keyed JSON and use scalar bindings.
5. Preview all 15 slots, long names, ties, missing logos and unset future rounds. Validate package/assets and publish. Snapshot cue text remains separate from connected scores. Play the graphic with Take.
6. Supplier updates match scores; every bound slot changes on air. Operator separately presses Highlight Round or Crown Champion, declared through NOACG_ANIM.machine. A winner value is not permission to crown. Action state is reported through existing state fields.
7. A removed match or unresolved logo produces a field warning and retains the last validated value under the proposed adapter; stop the sender today to freeze API writes. Sheet Pause is the agreed future reader behavior. Correct upstream or deliberately disconnect, keeping the resolved content.
8. Export the validated native .noacgpack.json. In the new show, retain artwork/field schema/cues but confirm new source mapping. Production credentials/connections do not silently travel.

Review screens 01, 04 and 06. Verify that the 15th match exists and that receiving its winner does not increment action counters. This full custom bracket journey is specified, not locally proven by the election rehearsal.

## B — North sponsor roll

| Route | Creation and connection | Operation, recovery and reuse |
|---|---|---|
| Native SVG/HTML | Build a bundled sponsor graphic; list/switch or sp01–sp04 as appropriate. Sheet sponsor rows resolve approved library image IDs before writing field values. A single-text list recipe alone does not understand arbitrary name/logo/duration columns. | Prepare each sponsor or an explicitly authored rotation behavior; preview logos and rights-approved assets; publish; operator starts/stops rotation. Data edits change content only. Export the native pack with assets; rebind in the next show. |
| Provider OGraf package | Obtain a self-contained package, inspect manifest/GDD/customActions, assets and package scope. Generic controls exist, but full convenient Library/rundown ingestion needs Outcome 6 qualification. | Validate against the host CSP, preview actions, add to rundown when supported, then explicit Take. Retain a known-good package version for rollback. No arbitrary vendor web URL shortcut. |
| Media clip | Provider renders a video with the correct alpha/output format. Import and cue through the qualified media/Bridge/CasparCG route. No live text connection is implied. | Preview, check duration/audio/alpha, explicitly play; use a fallback clip if source delivery fails. Outcome 5 device verification is required. |
| Arbitrary hosted page | A link is not a portable graphic package. Native external dependencies block publication; foreign policy permits only its declared package scope and permitted resource types. | Request a self-contained export or pre-rendered clip. A host-side data/image sync could be designed separately, but does not make a webpage acceptable inside the on-air frame. |

Recovery uses bundled last-known assets or an approved fallback sponsor card. Reuse never carries a supplier credential. The earlier general hosted-URL mockup is withdrawn as a recommended route.

## C — Ari Kova overlay above player video

Use [harbour-overlay.svg](fixtures/harbour-overlay.svg) and the same North/Orbit artwork as A. Add it above the player video layer; the graphic does not ingest/control the video.

Prepare Ari's cue with `f0` name and `f1` portrait as Fill snapshots, `f2` live score as a scalar connection, `f3` status as a scalar connection, and `f4` recent-play list as a read-only connection. The multi-field mapper shows source column, selected key, sample value, destination field and ownership before confirmation. A second scorebug intentionally shares the score path.

Preview then Take. A Sheet-backed ± change to f2 writes the shared production value and updates both graphics; it holds until that **source cell** changes. A poll changing only f4 must not undo it. “Return to Sheet value” is a proposed explicit shared write to the last successfully read source value, available only while that source value is known. An API push has different semantics: the next absolute write wins; no D4 lock is promised for arbitrary senders.

Edit the connected list in its source or Disconnect. Filled player name/portrait never refresh behind the operator. If choosing a different player while scores remain bound, the confirmation shows the new player key and all affected paths together; prepare/preview off air before replacing the live card. Reordering rows never changes a stable keyed selection. On missing column/logo, keep the last validated output and diagnose per field. Export/reuse with source reassignment. Review screens 02–03 and 05–06.

## D — Illustrator artwork with no catalogue type

Drop an unfamiliar SVG into Import → Design → Fields. Inspect selected text/image nodes and embedded fonts. Outlined letters are shapes, not editable text: selecting their replacement hides the original group and positions a live field over it. Designer checks the overlay and longest sample string. Fit is measured after fonts load; long values must be visually checked at minimum readable size.

Confirm stable field IDs, labels, type and defaults. Numeric min/max/step is an explicitly proposed native contract extension; it is not a current end-to-end import guarantee. Attach score/list behavior only after confirming roles; name heuristics may suggest, never assert, semantics. An unfamiliar multi-column repeater requires authored behavior today or proposed Option B.

Save to Library, add to the production, prepare cues, map custom columns or API paths without picking a catalogue category, preview valid/empty/error samples, run productionGate and publish. Take, receive ordinary value updates, and operate only declared action buttons. Disconnect preserves resolved values. Reimport changed artwork as a new reviewed version: unchanged IDs retain links; removed or type-changed IDs block automatic migration. Export and rebind in another show.

## Codex and visual authoring use the same result

The same SVG, explicit field map and sample data are the inputs to both routes. The visual wizard emits SPX DataFields, SVG IDs, NOACG_BEHAVIOUR bindings and NOACG_ANIM machine data. A Codex author follows the existing [local authoring skill](https://github.com/NoaCG/NoaCG-Studio/blob/eccb018d45527d48bab2cbfe4584e893309f53a0/.agents/skills/noacg-graphic-local/SKILL.md) / noacg CLI contract and produces those same artifacts; it must not invent a second “custom graphic manifest”. Generated OGraf files remain derived artifacts. Both outputs must pass the same gate and identical field/action scenarios. This research references that authoring contract; it did not log in, save through the CLI, or claim the two full authoring journeys were run.
