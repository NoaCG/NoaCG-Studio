# Whole-plan assessment: creation to reliable playout

Prepared 18 October 2026 for the 19 October morning review. This is a reviewable proposal, not an amendment to agreed authority. No existing work-spec, product source, hosted account or production has been changed.

## Judgment and scope

**The architecture is a sound basis for many kinds of custom graphics. The agreed run is not a complete delivery plan for every graphic and every playout environment.** Its strongest promise is a consistent NoaCG-controlled workflow for cue-owned content, shared live values, lists and staged messages. The proposed custom mapper and adapter work would extend that promise usefully without introducing another binding engine.

There are three different completion claims to keep separate:

| Claim | Assessment |
|---|---|
| The agreed production-page run is complete | Means C0, refactor 1 → 2+7 → 13a, then C1–C7, with Q before C1. It does not mean the entire refactor or every GOALS outcome is complete. |
| Native custom graphics work end to end in NoaCG | Credible with the bounded amendments below and actual scenario evidence. This is the recommended next completion contract. |
| Any imported graphic works through every output/control route | Not supported by this run. Foreign OGraf ingestion, structured controls, route-specific export behavior and interoperability have separate limits and milestones. |

Even finishing the deferred refactor phases later would not, by itself, complete foreign-package ingestion or rich authoring. Extraction improves the implementation; feature and acceptance work still determines what a producer can do.

Baseline for this assessment: **main `4569b9622923e1ecc9c790c071ee27e263580324`**, including the new editor live-data controls. Earlier research and its local experiment remain attributed to `eccb018d45527d48bab2cbfe4584e893309f53a0`; their evidence has not been relabeled as a new run. The supplied revised second-opinion brief, seven research documents, election example, agreed specs and adjacent GOALS/authoring/playout plans were reviewed.

## What is already a strong foundation

The second opinion correctly identifies the missing layer as usability and adaptation around existing contracts. `ProductionBindings` already maps any graphic name and field ID to a production-data path. Fields and machine controls are not restricted to catalogue categories. The production page overlays live values when previewing, taking and updating a cue. [E1]

The agreed ownership rules are coherent: **Fill** creates a cue snapshot; **Connect** follows shared production data; scalar Sheet overrides hold until the particular source cell changes; connected lists are read-only. Prepared messages are protected from live bindings at both entry points. Data updates must not trigger Take, Continue, Reset or machine events. Keep those decisions. [E2]

The plan also has real operational depth: browser/server reader handover, source freshness, Pause, late-response handling, persistent published configuration, combined rehearsal and unaided-user trials. It calls for four of five participants to complete each AC-14 task and answer the comprehension questions correctly; medians are reported without imposing a time target. C7 includes a real player, at least OBS. These are substantial acceptance requirements, not just a connection-dialog implementation. [E3]

Existing playout should not be described as absent: the repository records production experience with CasparCG/Bridge, OBS checks, vMix 29 layered playback and SPX export checks. Those receipts establish specific routes and actions. They do not automatically prove a newly authored graphic, a new data source or a different export/controller combination. [E4]

## Coverage after the agreed run

“Existing” below means a capability the run preserves, not something newly verified during this review. “Proposed” means not yet accepted into the run.

| Producer's job | Coverage | What still decides whether the complete journey works |
|---|---|---|
| Create an ordinary lower third; type values; prepare and air cues | Existing authoring/playout; improved production workflow | Save/Publish/Take must remain understandable, with the actual output route qualified. |
| Import an unfamiliar SVG; expose text, score and picture fields | Existing import foundation; outside this run's authoring scope | Stable IDs on reimport, numeric bounds, asset mapping and visual/CLI equivalence remain authoring qualifications. |
| Fill a guest/player cue from arbitrary spreadsheet columns | Row-fill foundation; generic mapper proposed | Explicit column → field mapping, previewed values and independent snapshot ownership. |
| Connect a ticker, schedule, standings or credits | Central agreed C1/C2/C7 scope | Real Sheet qualification, background-reader continuity, last-good behavior and AC-14/16. |
| Connect a custom scorebug, keyed player card or fixed bracket slots | Generic bindings exist; A1–A3 proposed | Keyed adapters, asset resolution, mapping UI, and entity selection described below. |
| Run quiz reveals, clocks or bracket highlight/crown actions | Existing machine/control contract | Authoring and recovery tests for the actual behavior. A field mapping does not create a reveal sequence or bracket algorithm. |
| Prepare audience messages on arbitrary branded artwork | Agreed staging workflow | Explicit destination-role mapping for custom field labels; English title heuristics are insufficient. |
| Take live election data from its supplier to graphics | Existing push API; C5 makes it easier to operate | Actual supplier access, connector/parser, editorial assets, hosted API and output rehearsal. C5 does not build that external connector. |
| Import a provider's foreign OGraf package into a production | Isolated host foundation; separate milestone | Library/rundown ingestion, package isolation, typed controls, assets, lifecycle and recovery. |
| Play sponsor video or other media | Existing media/Bridge path, separate acceptance | Actual file availability, codec/audio/layer behavior and the remaining media scenario checks. |
| Hand over to another operator; reuse graphics next week | Some existing team and packaging support | Source lease and override continuity, publisher/library dependencies, schema compatibility and explicit rebinding in the new production. |

The list adapter is not a general multi-column renderer. A fixed 15-match bracket can use upstream keyed records and scalar slots, but the artwork still needs compatible targets and behavior. A sponsor loop, countdown and multi-step reveal likewise require their own declared behavior. “Any graphic” should mean an extensible supported contract, not automatic understanding of arbitrary artwork or JavaScript. [E5]

## Gaps that should change the plan or its completion claim

### 1. Finish custom mapping without rebuilding binding

Retain amendments A1–A5 in [document 07](07-proposed-plan-amendments.md): explicit Fill/Connect column mapping, promoted Values, stable keyed adapters, image resolution, return-to-source, and schema/reimport review. Treat B1's richer table-slot recipe as conditional on the authoring fixtures, not an automatic prerequisite for C1.

There is one additional catalogue-shaped seam: the agreed message workflow recognizes body/name roles from English field titles such as Message, Question and Author. A custom Finnish card with `Kysymys` and `Nimi`, or a card with several text fields, needs a deliberate choice of destination roles. Add a small explicit role-selection path using the existing field IDs and staging model. It must preserve the same binding refusal and private Source/Reference handling. Do not infer a destination merely because only one text field remains. [E6]

### 2. Specify which entity a reusable live graphic follows

This is the most important limitation in the election example. Bindings belong to the **pool graphic**, not to each cue using it. [E1]

Concrete failure to prevent:

1. `Election Candidate Card.f2` is bound to `election.candidates.FI2027_02_101.votes_text`.
2. Cue A prepares Aino's name, party and portrait. Her live votes are correct.
3. Cue B uses the same pool graphic but prepares another person's name and portrait.
4. Taking cue B still overlays the same live binding: it can display the second person's identity with Aino's vote total.

The current research proof deliberately uses one fixed candidate. It does not prove automatic identity switching across candidates.

For a bounded first rehearsal, prepare distinctly named pool graphics with fixed candidate bindings, sharing the same underlying design where supported, and qualify the preparation/reuse steps. Adding the same graphic name again replaces its existing pool entry; merely duplicating a cue does not create independent bindings. Alternatively, use snapshot-only candidate cards and make their refresh policy explicit. [E7]

For routine election use at larger scale, specify a deliberate entity-selection workflow before implementation. It must define how identity, photo, votes and status change coherently; what Preview shows while Program retains its previous candidate; and when the operator commits the change. An upstream `activeCandidate` projection is technically possible, but changing it affects any on-air fields bound to that path immediately. It is not a safe substitute for cue-specific preview/commit semantics. This review does not authorize a new per-cue binding model.

### 3. Reconcile the legacy Sheet path with current main

C6 names `src/components/ControlPanel.tsx`, which no longer exists. The active entry is `src/components/editorFoundation/LiveDataControls.tsx`, mounted by `EditorFoundation.tsx`. It offers Add/Replace live data and appends a polling block into the template's JavaScript. That block calls the graphic's `update()` itself. [E8]

Update C6's actual entry points and test scope when the plan is amended. Preserve existing embedded blocks as agreed, but detect and explain the conflict before connecting the same legacy graphic through production-level sources. Otherwise a legacy poller can independently change fields after a production update, and production Pause cannot honestly promise to freeze it. This is a code-supported risk identified by inspection, not a reproduced race in this review.

Minimum policy: existing legacy mode remains labeled and supported; new graphics use the production connection flow; migrating a graphic requires an explicit replacement/removal step and an observed single-writer result. Do not silently strip existing exported graphics. Export compatibility and the new production connection workflow are distinct promises.

### 4. Treat identity and schema changes as visible maintenance

The agreed data-source spec explicitly excludes repairing name-keyed bindings after a graphic rename. Automatic repair is therefore not a completion criterion of this run. At minimum, make a broken connection visible and require deliberate rebinding; never silently match a new graphic by a convenient title. [E9]

Reimport adds field-ID/type changes, and Publish can refresh a production's graphic from a newer Library edit. A name staying the same does not prove its field schema stayed compatible. A5 should cover comparison against the version that bindings and prepared cues were made for, including a changed image field and a removed score field. A visual-only artwork revision should preserve valid field IDs. A mismatch should be reviewed before the revised graphic is published. This is a targeted authoring/connection safeguard, not a reason to rewrite the whole model. [E7]

### 5. Decide the controller and output route before promising portability

| Route | Who controls the production? | What can reasonably be promised |
|---|---|---|
| NoaCG output loaded in OBS/vMix/CasparCG; Bridge where needed | NoaCG | Existing production data/binding and operator workflow reaches the renderer as ordinary field updates; qualify the exact engine, layers, assets and recovery. |
| SPX output-embed wrapper | NoaCG runs the inner show; SPX shows/hides the frame | Useful output integration, but SPX is not automatically operating each NoaCG cue. |
| Standalone SPX/HTML/CasparCG template package | External host or packaged local controller | Portable graphic fields and supported actions; no general promise of NoaCG sources, shared data, bindings or all production automation. |
| Native NoaCG pack imported into a new production | NoaCG after import/setup | Reuse the graphic contract and assets; reconnect production-specific sources deliberately. |
| Foreign OGraf package hosted by NoaCG | Planned normal-production path | Preserve the package contract and declare unsupported control/recovery capabilities; complete the separate ingestion milestone. |

The standalone exporter explicitly documents that SPX leaves shared bindings and the production tree behind. It also documents the reported-state hazard of Update after Continue for certain hidden-field controls, with a manual recovery procedure. The local HTML production controller has a rundown but does not therefore carry the source engine or timed-cue support. A fallback package must have its own runbook and rehearsal; downloading it is not transparent failover for a live election feed. [E10]

The authoring floor is Chromium 117, while the measured vMix 29 engine is 115. Existing designs can work there, but new designs that only satisfy 117 need a vMix-specific check. A compatibility scan is useful evidence, not a substitute for actual pixels, fonts, alpha, frame rate and lifecycle actions on the target. Avoid a blanket “all outputs supported” label. [E11]

### 6. Close recovery and collaboration with complete scenarios

The agreed plan already addresses late responses and handover. Strengthen its evidence with the exact combination that matters: make a shared Sheet scalar override, close the reader, let the server or another operator take over, then read an unchanged source cell. The override must survive. Change that cell and the source must win. This requires preservation of the source comparison baseline; comparing a fresh read only with the overridden production value would be wrong. Repeat around Pause/Resume and a late response from the old reader. [E2]

For a running timer or multi-step reveal, restart the renderer and verify the reported data/state contract restores the intended result without replaying a non-idempotent action. A foreign opaque action may be unreconstructible; expose that limitation. Data-only election checks do not establish machine-action recovery. [E12]

Team operation also has an existing boundary outside this run: the repository records saved entries and later Library edits depending on who publishes, and same-name graphics from different members colliding. A team runbook should pin the intended design and entries, use distinct identities, and test the actual publishing operator. Do not promise full creator-independent handover merely because the new source reader transfers correctly. [E13]

### 7. Keep source acquisition visible as real work

The [election source investigation](election/source-investigation.md) establishes Ministry provenance behind Yle's reporting, not access to Yle's private delivery interface or a verified 2027 live schema. The API accepts normalized values; it does not obtain the results for the producer.

Assign the data lead the supplier access and raw snapshots; assign the connector the parsing, IDs, ordering, correction handling and formatting; assign the newsroom the roster, portraits, logos and editorial labels; assign the graphics operator the mappings, preview and air actions. These responsibilities belong in the runbook. Use the supplied synthetic files until the real interface is available. February 2027 is rehearsal; the scheduled parliamentary election is 18 April 2027.

## Minimum changes before execution

These proposals supplement document 07; no authority has been edited. Keep the agreed sequence. Do not add deferred refactor phases merely to make the run sound complete.

| Proposal | Destination | Smallest reviewable acceptance addition |
|---|---|---|
| W1: State the completion boundary | Production-page scope and final report; data-sources C7 | Distinguish the agreed window from the full refactor, native workflow from foreign ingestion, and existing proof from new receipts. |
| W2: Custom mappings and message roles | Existing A1–A3; audience C0/C3 compatibility and staging criteria | Use unfamiliar field labels and an asset column; prepare on a Finnish-labeled custom card without a catalogue fallback; retain destination hygiene. |
| W3: Live entity identity | Data-sources binding model and C7; election V1 | Two different candidate cues cannot mix identities and results. Record the chosen bounded approach; a scalable selection design requires a separate explicit decision. |
| W4: Legacy writer boundary | C6, sheet AC-10 and compatibility tests | Target the current editor; prove an old graphic keeps working and migration leaves one effective writer; state what Pause controls. |
| W5: Revision/identity review | Existing A5; data-sources AC-12/C2/C6 | Rename or reimport cannot silently redirect a binding or publish incompatible fields without diagnosis and repair. |
| W6: Complete recovery evidence | C2/C7; sheet AC-5/6/7; existing output/machine acceptance | Shared override survives handover; renderer restart preserves a reveal/clock as its contract permits; source writes never act as show controls. |
| W7: Route and export qualification | C6/C7 plus existing playout acceptance | State the controller, exact host and version, retained/lost features and fallback procedure; observe representative native custom graphics on the selected production route. |

Foreign OGraf B2 and richer recipe B1 remain separately scoped. HostedControlPage migration is expressly outside the refactor; production-page UI improvements must not be described as automatically available on every hosted/mobile control surface. Preserve its existing control behavior and qualify any new source-control exposure separately. [E14]

## A concrete completion rehearsal

Use one saved production containing an unfamiliar SVG lower third, a shared scorebug, a connected list, a two-candidate election sequence, a fixed bracket, a prepared custom message card, and one deliberate reveal/clock. Add media or foreign packages only when those routes are part of the milestone being claimed.

| Setup and action | Required observable result |
|---|---|
| Create/import artwork, expose fields, save, add to production and publish | The correct design, assets and field IDs appear in Preview and on the selected output; saving alone is not confused with publishing or taking. |
| Map unfamiliar columns; Fill a cue; Connect a scalar, keyed record and list | The producer can explain who owns each value; a source edit cannot alter the filled cue; keyed records survive reorder. |
| Run the two-candidate sequence while results keep arriving | Name, portrait, votes and status always describe the same candidate; Preview preparation does not unexpectedly change Program. |
| Update a shared score, override it, hand over readers and resume | Both graphics agree; unchanged external cells preserve the override; the changed cell replaces it. |
| Send a newer downward correction, malformed snapshot and bad portrait | Valid correction appears; bad input is diagnosed without blanking the last validated output; freshness remains truthful. |
| Prepare a custom audience message, then edit/delete its source | Approved wording stays unchanged; a live-binding attempt is refused at both doors. |
| Advance the reveal, then send unrelated data and restart the renderer | Incoming values do not advance it; recovery matches the declared state contract and does not duplicate an action. |
| Close the operator page, interrupt the source/network, reconnect and change operators | Output retains appropriate last-good state; control and source freshness are distinguished; the expected publisher's design/entries remain correct. |
| Export the chosen fallback and import the native pack into a new production | Lost production capabilities are explicit; fallback actions are demonstrated; the new production prompts deliberate source rebinding. |

Retain the agreed C7 tasks and four-of-five unaided-user criterion. Add representative custom tasks to that trial rather than replacing it with an expert developer demonstration. Record build, graphic/package revision, source fixtures/provider, controller, host/browser version, actions, actual pixels and skipped legs. Blocked routes remain unverified.

The existing election experiment contributes **14 local checks and four native publication-gate passes**. It does not prove real supplier parsing, hosted API/auth/realtime, Sheet D4 UI, machine-event recovery, human usability or actual broadcast output. This review adds source-backed findings, not new runtime passes.

## Evidence references

All repository links below are pinned to the inspected main commit. Earlier research keeps its own historical baseline.

- **E1:** [ProductionBindings and resolution](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/model/productionData.ts#L23); [live values overlay cue data](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/components/home/ProductionPage.tsx#L1641).
- **E2:** [Sheet reader/override contract](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/sheet-data-flow/spec.md#L101); [DS19](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L241).
- **E3:** [AC-14/16](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L364); [actual run window and deferred phases](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/production-page-refactor/spec.md#L681).
- **E4:** [GOALS output and interoperability status](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/GOALS.md#L154); [playout route documentation](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/PLAYOUT_INTEGRATION.md).
- **E5:** [prior authoring contract audit](03-authoring-and-data-contract.md); [scenario traces](02-scenarios-and-walkthroughs.md); [OGraf work packages](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/OGRAF_FULL_STACK_PLAN.md#L276).
- **E6:** [message compatibility and field-title heuristic](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/audience-flow/spec.md#L78).
- **E7:** [same-name pool replacement](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/model/shows.ts#L558); [Publish refreshes copies](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/model/shows.ts#L675).
- **E8:** [C6's old target](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L465); [active editor controls](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/components/editorFoundation/LiveDataControls.tsx#L7); [embedded poller implementation](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/control/liveData.ts#L48).
- **E9:** [explicit non-goals](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L80); [rename limitation](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L264).
- **E10:** [portable-graphic boundary](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/CONTROL_PANEL_ANY_GRAPHIC.md#L496); [current export loss/reported-field guidance](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/export/spxLeftBehind.ts); [local controller emission](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/export/showExport.ts#L332).
- **E11:** [measured engines and supported floor](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/PLAYOUT_COMPATIBILITY.md#L21); [scanner limits](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/src/validation/engineSupport.ts#L23).
- **E12:** [state and foreign-action recovery limits](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/OGRAF_FULL_STACK_PLAN.md#L118).
- **E13:** [team acceptance limits](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/TEAMS_PLAN.md#L446).
- **E14:** [HostedControlPage explicitly not migrated](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/production-page-refactor/spec.md#L64).
