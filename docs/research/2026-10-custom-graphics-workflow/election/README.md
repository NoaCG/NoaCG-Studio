# A concrete election-night workflow

**Collect once, normalize once, connect several graphics, and let the operator decide what goes on air.** This example shows every handoff using readable files and an isolated local rehearsal. February 2027 is the rehearsal; the next Finnish parliamentary election is **18 April 2027**. All people, counts, reporting progress and seat projections below are synthetic. The abbreviated party list is illustrative, not a verified 2027 roster.

## 1. Who collects what?

| Person | Gets/maintains | Where it goes |
|---|---|---|
| Data lead | Approved Ministry/distributor results delivery; contract and test snapshots | External connector, outside the graphic |
| Newsroom producer | Candidate/party roster, stable IDs, Finnish/Swedish display names and approved images | Roster CSVs/Sheet and bundled/library assets |
| Graphics designer | Party board, candidate lower third, count bug and ticker; editable field IDs | Native NoaCG templates using the existing SPX contract |
| Operator | Which candidate/district is next, headline approval, preview and Take/Out | Prepared cues and playout controls |

Yle publicly identifies Ministry publication as the source it follows; its exact interface was not found. Read [the source investigation](source-investigation.md) for primary evidence and the real-feed access still required. No one should have to type changing vote counts into 50 graphic fields manually.

```text
Official/distributor delivery          Newsroom roster + approved images
          │                                          │
          └─────────► external adapter ◄──────────────┘
                       validate IDs, revision, types
                       keep raw snapshot + audit log
                                  │
                                  ▼
                         one NoaCG PATCH request
                                  │
                                  ▼
                      production JSON + field bindings
                          │       │       │       │
                        party  candidate  count  ticker
                                  │
                    operator previews and presses Take
```

In February the **first box is replaced by results-01/02/03.json**. The adapter, bindings and graphics can be exercised without waiting for real votes. The local HTTP endpoint is a research stand-in, and the renderer/gate/binding functions are actual NoaCG source.

## 2. The files you can open

| File | Concrete contents and purpose |
|---|---|
| [parties.csv](fixtures/parties.csv) | Ten illustrative party/group rows: KOK, SDP, PS, KESK, VAS, VIHR, RKP, KD, LIIK and ALAND demo grouping. Stable key, display label, image asset name. |
| [candidates.csv](fixtures/candidates.csv) | Six fictional candidates across Helsinki/Uusimaa. Aino Example is `FI2027_02_101`. Another district can also have ballot 101 without a collision. |
| [districts.csv](fixtures/districts.csv) | Display roster for the two example districts; these are not all Finnish districts. |
| [assets.json](fixtures/assets.json) | Eleven bundled image data assets: ten simple tiles and one silhouette. A source cell such as party_KOK resolves to a known asset. |
| [results-01.json](fixtures/results-01.json) | Revision 1: KOK 225000, SDP 215000, Aino 3500; 60/100 synthetic reporting units. |
| [results-02.json](fixtures/results-02.json) | Revision 2: KOK 228000, SDP 217000, Aino 3700; 61/100 units. |
| [results-03-correction.json](fixtures/results-03-correction.json) | Revision 3: Aino corrected downward to 3680. A lower count is allowed when the revision is newer. |
| [adapter.mjs](adapter.mjs) | Reads the rosters, validates the rehearsal snapshot, resolves approved assets and creates the JSON patch. This is not an official feed parser. |
| [patch-01.json](patch-01.json), [patch-02.json](patch-02.json) | Exact normalized bodies used in the local HTTP rehearsal, including formatted display values and assets. |
| [bindings.json](bindings.json) | Exact existing graphic→field→path map. |
| [prepared-cues.json](prepared-cues.json) | Aino's name, party/district and portrait stay cue-owned. |
| [templates/](templates/) | Four complete research native-template objects: HTML, CSS, JS, SPX fields/settings and bundled assets. No new authoring manifest. |
| [evidence/report.json](evidence/report.json) | Actual assertions and explicit limits of the proof. |

## 3. What each graphic needs

| Graphic | Author creates | Producer connects/prepares | Election-night behavior | In this proof |
|---|---|---|---|---|
| National party board | Ten fixed rows; name/votes/share/projected seats/logo = 50 fields | Each row maps to its stable party key; dependent figures arrive in one snapshot | Numbers refresh on air, layout order stays deliberate | Rendered and tested |
| Candidate lower third | Name, party/district, votes, status, portrait | Fill name/portrait from candidate roster; connect votes/status to selected candidate key | Aino's votes update without replacing her identity | Rendered and tested |
| Count bug | Reporting progress, preliminary label, source timestamp | Shared summary paths | Updates unobtrusively while on air | Rendered and tested |
| Headline ticker | One lines field | Approved newsroom headlines, separate from raw numeric feed | Text changes without restarting playout | Field update rendered/tested; scrolling animation not implemented in this research fixture |
| District results board | Same board layout filtered to a district | Prepare district cue and explicit district paths | Operator chooses the district; live numbers follow that district | Planned next fixture, not rendered/tested |
| Seat/coalition board | Party seat slots and an explicitly labeled comparison | Qualified supplier seat data; operator selects the coalition comparison | Never call a projection a confirmed result; no automated winner reveal | Planned; no allocation/projection model built |

For a simple static candidate card, Fill all fields and take a frozen snapshot. For a live candidate card, keep identity filled and bind only changing values as shown. To change candidate, prepare another graphic/card or explicitly review its new key and all mappings off air. A cue name alone must not silently switch a shared live binding for every cue.

## 4. One update, field by field

The second source snapshot contains:

```json
{
  "revision": 2,
  "parties": [{"party_id": "KOK", "votes": 228000}],
  "candidates": [{"candidate_id": "FI2027_02_101", "votes": 3700}]
}
```

This is a **readable excerpt**, not a complete valid fixture. The complete snapshot includes every party/candidate, timestamp, status and reporting units. The adapter computes share from the complete synthetic party total, preserves integer raw counts, and produces display strings:

```json
{
  "election": {
    "parties": {"KOK": {"votes": 228000, "votes_text": "228,000"}},
    "candidates": {"FI2027_02_101": {"votes": 3700, "votes_text": "3,700"}}
  }
}
```

This is a valid **partial** NoaCG merge patch for those leaves. For a coherent party board use the complete [patch-02.json](patch-02.json), which also updates percentages and timestamp. A partial votes-only update must not leave a stale derived share on air.

| Source → normalized path | NoaCG graphic field | Screen change |
|---|---|---|
| KOK votes → election.parties.KOK.votes_text | Election Party Board / f1 | 225,000 → 228,000 |
| Full party total → election.parties.KOK.share_text | Election Party Board / f2 | 22.5 → 22.7% |
| Aino votes → election.candidates.FI2027_02_101.votes_text | Election Candidate Card / f2 | 3,500 → 3,700 |
| Reporting units → election.summary.reporting_text | Election Count Bug / f0 | 60 / 100 → 61 / 100 |
| No source binding for candidate name | Election Candidate Card / f0 | Remains Aino Example |

“61/100 reporting units” is not “61% of ballots counted”. Both numbers are synthetic here. A real feed's denominator and counting-stage definition must be confirmed before choosing a label. Election-day advance votes and later district/candidate updates can have different availability; absence must never mean zero.

## 5. The actual NoaCG API contract

For a future **published test production**, configure these bindings and publish them, then obtain that production's data key. Today's binding changes require republish; immediate connection persistence is planned in C2. The following is a reviewable example, **not executed against hosted NoaCG in this research**:

```bash
# Run from this election folder only when deliberately testing a published test production.
# Set NOACG_DATA_KEY securely in the connector environment; never in a graphic or Sheet.
curl --fail-with-body --request PATCH \
  'https://noacg.studio/api/data/patch' \
  --header "Authorization: Bearer ${NOACG_DATA_KEY:?Set the test production data key}" \
  --header 'Content-Type: application/json' \
  --data-binary @patch-02.json
```

The body is the plain JSON tree, not wrapped in `data`. No increment instructions, cue Take, transition names or event payloads belong in it. The documented response is `{ok:true,data:<whole tree>,writes:[{graphic,event,applied}]}`; `event` here is a log row identifier, not permission to invoke a machine event. [The local transcript](evidence/http-transcript.json) records exact research requests/responses. Its row identifiers are local stand-in values.

Read back with `GET https://noacg.studio/api/data/state` and the same bearer key to inspect data and bindings. Inspect the affected fields in preview and the output itself; a 200 response alone does not prove the graphic is on the correct channel or visible.

The connector sends absolute state, retains the last accepted revision, skips older revisions, serializes writes, retries identical state safely, and coalesces rapid source bursts to the newest coherent snapshot. NoaCG itself does not understand provider revision order; that check belongs in the connector. A newer correction may lower a count. A failed read sends **nothing**; intentional text clear sends `""`. JSON `null` deletes a path and does not clear its last rendered value. API writes follow next-write-wins semantics; do not assume Sheet D4 protection from a continuously pushing sender. Until API Pause is implemented/qualified, stop that sender to freeze.

## 6. How to create and connect it

**Designer, once:** create/import the four layouts, expose fields with stable fN IDs, bundle approved images/fonts, validate the native package, and save to Library. Fixed slots are sufficient; no catalogue match is required. Operator controls remain separate declarations. The sample templates prove a basic native contract route; importing these object files directly through a specific UI is not asserted as an existing file-import feature.

**Producer, once per production:** add graphics, prepare candidate cues, load the normalized data into the production tree, and assign the [bindings](bindings.json) through the existing binding surface. Publish after configuring bindings. Validate resolved examples in every field. The proposed custom Sheet mapper would replace manual path setup with column selection; its mockup is not claimed as shipped.

**Data lead, per supplier:** implement the source-specific parser outside NoaCG using the agreed real schema. Map official IDs to the roster, retain raw messages, validate counts/status/revisions, resolve image IDs, then push normalized state. Existing DATA_API documents this connector pattern. The sample adapter deliberately handles only our fixture schema and simple fixture CSVs; it is not ready for arbitrary provider CSV encodings, delta ordering or credentials.

**Operator, on air:** preview, press Take, watch received/changed status, and choose the next prepared graphic. Source arrivals change fields but never advance the rundown or trigger a winner celebration.

## 7. February rehearsal and 18 April runbook

| When / owner | Action | Evidence required |
|---|---|---|
| Before February / data lead | Obtain provider test delivery/schema; reconcile roster IDs, data use and asset rights | Known source contact, sample payloads, revision/correction rules and timestamps |
| February / designer + producer | Build artwork and prepare cues; use the included synthetic sequence | Readable small/long names, complete field map, preliminary labels, no leaked credentials |
| February / data lead + operator | Replay normal updates, duplicate delivery, reorder, missing data, lower correction, outage, bad logo and recovery | Exact requests/output captures; no unexpected Take/Continue/Reset; measured latency |
| Before live use / engineering | Repeat against hosted test production with real approved feed/test feed and actual OBS/vMix/CasparCG output | Hosted auth/SQL/realtime, restart, quotas, output layers and failover qualified; operator signs off |
| Election day before opening / producer | Verify final roster/assets, source revision, bindings, output route, backup cards and sender-stop procedure | Preview and program confidence check; test data cannot enter the live production |
| Results release / data lead | Start approved delivery according to official 2027 publication schedule; validate first complete snapshot | Counted/available vs unknown distinguished; timestamps and provenance visible off air |
| During show / operator | Take prepared board/card; monitor freshness; stop sender on suspect data, retain known-good graphic or take a backup | Stable on-air state; explicit recovery and editorial correction |
| After preliminary count / producer | Keep preliminary label until official confirmation; archive raw snapshots and program decisions | Confirmed status comes from the authoritative result, not a timer or projected winner |

The 2023 Ministry publication started at 20:00 local time. That is historical evidence, not a promised 2027 delivery SLA. Reconfirm the election-night schedule. Display operator time in Europe/Helsinki, retain UTC in the audit log.

## 8. What is proven now?

The local rehearsal passed **14 checks**. Four native template fixtures passed NoaCG's actual publication gate and SPX parser. Actual applyPatch/resolveBindings/diffResolved functions fed actual composeDocument previews through a loopback HTTP stand-in. We verified changing votes, row reorder, duplicate retry, correction, explicit clear, cue identity retention, shared values, image decode and absence of automatic lifecycle actions. [Machine-readable report](evidence/report.json).

It does not prove Yle's feed access, a 2027 provider parser, real Sheets/D4, hosted API/database/realtime, custom machine actions or broadcast output. Those are explicit qualification steps above. It proves the central **normalized data → existing bindings → visible custom fields** mechanism can support this use case.

Reproduce from a NoaCG checkout with its normal dependencies installed:

```bash
node docs/research/2026-10-custom-graphics-workflow/election/prepare.mjs
node scripts/jobs.mjs add "node docs/research/2026-10-custom-graphics-workflow/election/rehearsal.mjs" --cap 5
```

No login, real data key, official feed or hosted write is used. Replaying regenerates fixture/evidence files in this research folder only. The browser job uses the repository's existing queue. The prepared fixture API is a short-lived loopback server, not a product implementation.
