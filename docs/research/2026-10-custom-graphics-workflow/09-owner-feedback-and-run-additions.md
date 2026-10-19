# 19 October decisions and proposed additions to the run

This records the owner's morning feedback and a narrower recommendation for the planned 20 October 2026 start. It supersedes the **scope recommendation** in documents 07–08 and the unanswered questions in the morning review. Their technical findings remain useful. Existing agreed specs, work.json authority and product source are unchanged. This document does not start or schedule execution.

## What the owner has decided

| Topic | Direction |
|---|---|
| Foreign OGraf packages in the normal rundown | Required long term; not required this week or in this run. |
| Full OGraf playout system | Desired future direction, including an OGraf server and professional outputs. Separate future work. |
| Election system | A concrete prospective Yle demonstration; a separate agent-authored, installable graphics package. Live results must follow the person selected. |
| First production output | CasparCG through NoaCG Bridge must pass the complete rehearsal. Normal browser sources, including OBS, must also work. |
| vMix and SPX | Preserve existing behavior; perform their expanded qualification after CasparCG/Bridge. |
| SVG import | Keep the existing workflow for this run. Editable SVG text is the immediate need; no broad redesign of import, animation steps or custom buttons. Existing quiz/scoreboard recipes remain acceptable for now. |
| Bridge packaging | Ease of use is the priority. One executable is preferred if selecting the output in the production page is enough; separate downloads are acceptable if they materially simplify operation. This is a design question, not authorization to restructure the Bridge. |
| Timing | Use today to prepare the scope for a planned start tomorrow. No drastic changes based only on discussion. |

## Revised recommendation

Keep the agreed C0 → refactor 1 → 2+7 → 13a → C1–C7 order and its Q qualification. Make this run deliver reliable production operation and a clear way for existing graphic fields to receive Sheet/API values. Treat creation of the election package and its candidate-selection behavior as a following, separately specified delivery.

The previous proposal combined three jobs: importing/designing artwork, connecting external data, and constructing a complete election product. That was too much to make a prerequisite for this run. The broader mapping, asset and authoring research remains a design resource, not a mandatory expansion of tomorrow's work.

### Six bounded additions or clarifications

The following wording is proposed for formal incorporation after review. Keep any additional connection or migration affordances small; this table does not propose a new general mapper.

| ID / destination | Proposed addition | Observable acceptance |
|---|---|---|
| P1 — production-page scope and final report | Explicitly separate this run from SVG/behavior redesign, the full election package, foreign OGraf ingestion, native outputs and Bridge packaging changes. | Completion is reported against this window and its routes; deferred work is named rather than implicitly promised. Preserve existing SVG text, quiz/scoreboard and operator-control behavior. |
| P2 — data-sources C1/C5/C7, AC-3/7/14/16 | Prove an ordinary custom native graphic can connect its existing scalar fields to a Sheet value and an API value without a catalogue match. Use the existing field editor and binding model; offer a source/value selection and preview where needed. | An agent-authored fixture with two unfamiliar field labels receives the selected values. Updating the source updates the intended fields only. Fill creates a fixed cue snapshot; Connect follows shared data. No import-wizard changes, automatic title-based binding or general relational mapper. |
| P3 — data-sources C5/C6 and DATA_API documentation | Explain acquisition → connector → NoaCG API → selected fields. Supply a prepared sample sender, a working request example, last-received feedback and the exact freeze/resume policy. | A producer can run the prepared example and identify its source, received value and graphic destination. A newer correction is accepted; a failed read sends no replacement. Incoming values never trigger Take, Continue or Reset. Preserve C5's conditional API Pause and explicit stop-sender fallback. |
| P4 — data-sources C6 and sheet AC-10 | Reconcile retirement of the old embedded Sheet setup with the current editor. Use `LiveDataControls.tsx`, not the removed `ControlPanel.tsx`, as an actual implementation target. State the migration boundary. | New graphics use the production-level flow; old embedded pollers still work. Connecting the same legacy graphic through the new flow requires an explicit migration choice, with no unnoticed competing writer. Production Pause never claims to control a still-running embedded poller. |
| P5 — C2/C7 and sheet AC-5/6/7 | Make the combined ownership/recovery example explicit: shared scalar override, reader handover, Pause/Resume, delayed response and missing data. | An unchanged Sheet cell does not erase an operator override after another reader takes over. A changed cell wins. Invalid/missing data retains last good values with truthful freshness. Prepared messages remain protected. This refines existing acceptance rather than creating a new precedence model. |
| P6 — C7/AC-16 and output acceptance | Make the actual CasparCG/Bridge setup a required first-production acceptance route alongside the existing browser/OBS check. Expanded vMix/SPX qualification follows later. | Record installed Bridge/CasparCG versions, channel/layers, fonts/assets, Take/Update/Continue/Out, stacked graphics, restart/reconnect, and visible output. When the production uses a physical consumer, observe that consumer too. An unavailable hardware check remains unverified and cannot support a production-ready claim. Preserve relevant existing regressions. |

P2 is the minimum future-proofing for the election package. It proves values can reach arbitrary fields. It does **not** claim that changing a candidate cue already changes its live binding. That feature needs the separate election contract below.

### What moves out of this run

- Broad arbitrary-column mapping, generic keyed-row selection, arbitrary image-name resolution, new number-bound controls, and schema/reimport UX from A1–A5 remain later extensions, except for the narrow scalar-field connection proof in P2.
- The optional bracket/multi-column recipe B1, custom animation/action authoring redesign, and full visual-import/CLI parity are separate authoring work.
- Custom message-role mapping for arbitrary labels, automatic repair after graphic renames, and full portability of mapping hints are not prerequisites for this run. Preserve agreed message safety and explicit diagnosis of broken connections.
- The earlier full election/provider/output rehearsal V1 becomes acceptance for the election package. C7 keeps its own complete agreed rehearsal plus P2/P6, without requiring a real election supplier or every election graphic first.
- Foreign OGraf B2, a NoaCG OGraf Server API and integrated professional output remain separate milestones.

## The simpler workflow to explain and demonstrate

There are two places with different jobs:

1. **Authoring establishes the fields.** SVG import exposes supported text; agent-authored graphics declare their editable fields and controls in the existing contract. A baked-in outlined word is not automatically an editable text node. Preserve the current fallback instead of promising lossless import of every SVG.
2. **Production connects data to those fields.** Choose the graphic/cue, find its existing field such as Votes, choose Connect, select the source and its value, inspect the sample, and confirm. Fill is the alternative when that cue should retain a snapshot. Preview/Take remain the operator's actions.

For the later election package, the agent prepares the artwork, fields, assets and installation recipe. The producer should see a candidate picker and clear source setup, not have to perform dozens of field mappings. Production-specific feed access and credentials still need deliberate setup; a reusable graphic pack is not already a portable live-data installation.

Do not build another large set of mockups now. The next useful visual is one short production-page walkthrough showing one field receiving one source value. It should use the current graphic editor, not a redesigned import wizard. The separate election design then shows candidate selection in Preview while Program keeps the previously aired person.

## What the API actually does

**NoaCG's Production Data API receives data. It does not itself search websites or scrape election results.** A source connector obtains the information and sends suitable values to it.

```text
Supplier API, CSV/file delivery, or another agreed source
    → connector fetches, checks and normalizes the results
    → NoaCG Production Data API receives an authenticated update
    → production bindings deliver values to graphic fields
    → NoaCG output shows them; the operator controls what is on air
```

For example, the supplier reports that candidate Aino has 3,700 votes. The connector identifies her by a stable candidate ID, checks the update's revision, and sends her vote total to NoaCG. The eventual candidate-card selection mechanism must ensure the on-air card follows that same ID. A later count of 3,680 may be a valid correction, not an error to discard.

An agent can build this connector, but its routine live work is a defined program: fetch, parse, validate and send. Prefer the supplier's feed/API or files. Website scraping is a fallback to investigate only if a suitable delivery route is unavailable; it adds a separate dependency on page structure and access. No live Yle delivery contract has been verified. The existing synthetic fixtures are suitable for the first demonstration and must stay labeled as simulation.

Google Sheets has a different convenience: this run plans the connector inside NoaCG, so a producer supplies the Sheet link and chooses the value/list. An arbitrary external API is not automatically supported by pasting its URL; a custom connector remains necessary until a specific built-in integration exists.

## Separate election package: required contract before building

The package should include party/results boards, candidate cards, count progress and ticker; fictional demonstration data and a replay sender; bundled assets; an installation/setup guide; and a runbook for the actual CasparCG/Bridge route. Real provider integration is a separately identified qualification, not a prerequisite for a clearly labeled simulated demonstration.

The decisive acceptance case is:

1. Aino is on air and her votes continue updating.
2. The operator selects another candidate for Preview. Aino stays on Program with her own identity and votes.
3. The operator presses Take. Name, portrait, party, votes and status now all refer to the selected candidate.
4. Further updates follow that candidate; Aino's new results cannot overwrite this card.
5. A source outage, a correction and a renderer reconnect preserve the stated policy.

Current bindings are per pool graphic, not per cue. An agent-authored package cannot make that constraint disappear. Before choosing an implementation, trace the selection through the existing cue, binding and reported-state contracts. If a small product capability is required, specify it in the election run rather than silently adding it to tomorrow's production-page run. A large set of fixed-candidate graphic copies is a possible fixture technique, not the recommended finished operator experience.

## Bridge recommendation

**Keep one Bridge implementation and, provisionally, one executable.** The existing command already registers CasparCG, vMix and an external OGraf-server adapter together. The immediate design issue is that pairing/setup and the executable's instructions still lead with CasparCG. No new multi-adapter framework is necessary to explore the owner's preferred experience.

The desired later flow is: launch Bridge → pair the browser when needed → select the output in the production page → reuse remembered connection settings or show only the missing settings → verify connection. On a subsequent launch, reconnect to the remembered target. Connection must not put a production on air automatically. If several systems are present, follow the operator's selected target rather than guessing.

Separate EXEs do not remove a remote CasparCG server's address, channel choice or browser pairing permission. Conversely, if an output has genuinely different installation or driver requirements, system-specific installers or launchers can wrap the same shared Bridge code. Decide from a clean-machine usability test later, not from a preference for one binary at any cost. No restructuring is needed for this run.

A normal OBS browser source can simply load the NoaCG output URL; it does not need a Bridge merely to render it. Automating the external application's controls is a separate capability. The present vMix adapter controls the NoaCG browser-output input on the Bridge's own computer; do not advertise universal remote vMix discovery. The existing outward OGraf adapter is also distinct from operating our own OGraf server.

## Full OGraf system: a sensible later direction

The proposed destination already fits the existing architecture plan:

```text
NoaCG authoring and production control
    → OGraf-compatible server/control API
    → renderer/compositor
    → browser or professional output
```

Recommend three delivery milestones: (1) foreign packages in the normal NoaCG rundown, with CasparCG/browser playback; (2) a NoaCG OGraf Server API over the existing command and recovery path; (3) an integrated local playout distribution with qualified device/network outputs. Controlling an external OGraf server, hosting an OGraf package, and implementing the OGraf Server API are three different capabilities.

OGraf supplies a graphics/control interoperability contract; it does not by itself deliver timed video to a device. SDI, including fill/key where required, and NDI need an output runtime and their own acceptance. Other possible future targets include SMPTE ST 2110 for broadcast IP facilities, HDMI/DisplayPort for local display, and SRT for transported video. They have different timing, alpha, hardware and deployment properties, so they are not interchangeable checkboxes.

Providing the whole NoaCG package does not require writing a rendering engine from scratch. Start by evaluating integration of an existing runtime behind the server boundary. Select a native/device-output design later from measured frame timing, recovery, alpha/audio behavior and the intended facility's needs. Keep all of this outside the current run.

## Preparation today and start tomorrow

1. Review P1–P6 as the proposed amendment, keeping the wider custom/election/OGraf work explicitly deferred.
2. Incorporate the settled wording into the existing specs and update their work.json spec hashes/review evidence together. Check that the run manifest still reflects the same phase order. This research document has not made those edits or changed authority.
3. Reconcile the execution branch with current main and run the normal plan preflight. Confirm the actual Bridge/CasparCG version and output configuration to be used for acceptance; no version is assumed from a desktop screenshot or a generic supported-version table.
4. Arrange Q's existing real-Sheet measurements, feed fixtures, YouTube access, cost evidence and early user trial. Q's early trial uses C0's build, so not all qualification can be finished before the first implementation step. Its required evidence must be recorded before C1; a Sheet failure remains a stop there.
5. Start the agreed run on 20 October when instructed, beginning at C0. Keep source qualification and required hardware receipts visible; do not reinterpret a blocked external check as a pass or promise completion of the whole run tomorrow.

This leaves a focused implementation run, then a concrete election-package project with a meaningful Yle demonstration target, followed by the longer-term OGraf milestones.

## Evidence used for this follow-up

Source inspection at `4569b9622923e1ecc9c790c071ee27e263580324`, the base of the research worktree. No new device or integration test was run.

- [One Bridge command registers all three adapters](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/cli/src/commands/bridge.ts#L33).
- [Bridge pairing, remembered CasparCG servers and operation](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/BRIDGE.md#L190).
- [vMix adapter scope](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/cli/src/playout/adapters/vmix.ts#L1) and [outward OGraf adapter](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/cli/src/playout/adapters/ograf.ts#L1).
- [Agreed content phases, including Q and C5's fallback](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/work-specs/data-sources/spec.md#L408).
- [Existing Data API contract](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/DATA_API.md); [concrete election API/source walkthrough](election/README.md).
- [Whole-system OGraf responsibilities](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/OGRAF_FULL_STACK_PLAN.md#L14) and [CasparCG versus native-output acceptance](https://github.com/NoaCG/NoaCG-Studio/blob/4569b9622923e1ecc9c790c071ee27e263580324/docs/OGRAF_FULL_STACK_PLAN.md#L227).
