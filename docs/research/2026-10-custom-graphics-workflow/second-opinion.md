# Second-opinion request: NoaCG custom graphics and Finnish election proof

Please review this research proposal. Do not implement product code, change agreed authorities, edit existing work-specs, or start the production-page plan run.

## Goal

An ordinary producer should be able to explain and carry out the whole journey: collect external data, create/import custom artwork, expose editable fields and operator controls, prepare cues, map data, preview, publish, operate live, recover, and reuse in another production. A catalogue match must not be required.

The concrete proof case is Finland's parliamentary election. February 2027 is rehearsal; the election is 18 April 2027. We use synthetic counts and fictional candidates. We need evidence for the handoff from source files/feed all the way to a visible graphic, not just a connection dialog.

## Baseline and conclusions

Inspected NoaCG main: eccb018d45527d48bab2cbfe4584e893309f53a0, including merged PR #1390 (25384c35d). Preserve its four owner decisions, Fill/Connect vocabulary, source ownership, D4 shared scalar override and DS19 read-only connected lists.

Existing ProductionBindings already maps graphic name → field ID → JSON path. resolveBindings/diffResolved support arbitrary scalar fields without catalogue categories. The missing work is primarily explicit column mapping, source adapter behavior, asset resolution and compatible authoring. No second binding engine is justified.

Keep SPXGCTemplateDefinition + NOACG_ANIM.machine, SVG BehaviourRecipe/NOACG_BEHAVIOUR, and OGraf manifest/GDD/v_noacg as the existing contracts. Do not invent a parallel manifest. Current native numeric min/max/step round-tripping is a gap even though GDD has bounds. Stable field IDs across changed SVG imports also need explicit review.

The five agreed Sheet adapters target specific shapes: lines, schedule, standings, credits, rows. Not all use pipe strings; rows is not joined. Current list behavior consumes a newline string and does not render arbitrary multi-column rows. Promote Values and add explicit column-to-field mapping. Correct the review's shorthand: DS3 concerns multi-cell rows; DS4 is RSS/Atom, and DS16 is the run order.

## Where election data comes from

Yle's own 2023 report says its results service updates as the Ministry of Justice publishes new figures:
https://yle.fi/a/74-20025410/64-3-145832

The official source is the Ministry's information/results service:
https://vaalit.fi/en/information-and-result-service

Official 2023 archive locations and technical examples of party/candidate CSV ZIPs were identified. Archive retrieval was blocked by this environment's network proxy, so no official file was parsed. Yle's exact private feed/API contract and the live 2027 delivery contract were not verified. Statistics Finland's public 13sw table is a historical comparison/rehearsal source, not a substitute live feed.

Practical route: the newsroom's data lead obtains the 2027 media/distributor schema and test delivery; an external connector reads it, retains raw snapshots, validates IDs/revisions/types, joins the approved roster/assets, and pushes normalized JSON to NoaCG. Photos, logos, translations and editorial headlines are collected separately. The graphic itself never scrapes Yle or holds the data key.

## Concrete files and one update

The research package contains parties.csv (ten party/group examples), candidates.csv (six fictional people), districts.csv, approved image assets, three result snapshots, an adapter, exact patches, bindings, prepared cue values and four native template fixtures.

Aino Example has stable key FI2027_02_101. A candidate numbered 101 in another district has a different key. Snapshot 1: KOK 225000, Aino 3500. Snapshot 2: KOK 228000, Aino 3700. Snapshot 3 corrects Aino downward to 3680. All are synthetic.

The adapter sends a coherent snapshot through the existing API. This is a readable partial excerpt:

```http
PATCH https://noacg.studio/api/data/patch
Authorization: Bearer <production-data-key>
Content-Type: application/json
```

```json
{
  "election": {
    "parties": {"KOK": {"votes": 228000, "votes_text": "228,000"}},
    "candidates": {"FI2027_02_101": {"votes": 3700, "votes_text": "3,700"}}
  }
}
```

Existing bindings:

```json
{
  "Election Party Board": {"f1": "election.parties.KOK.votes_text"},
  "Election Candidate Card": {"f2": "election.candidates.FI2027_02_101.votes_text"}
}
```

Aino's name, party/district and portrait remain prepared cue values. Votes/status follow her stable key. Party percentages are recomputed from the complete synthetic party total and sent in the same coherent patch. The brief excerpt alone must not be used to update votes while leaving derived shares stale.

Prepare four graphics: party board, candidate lower third, count bug and ticker. District/seat comparison graphics are subsequent fixtures. Seat projections are explicitly synthetic supplier-like values, not computed from national vote share. Reporting units are not interchangeable with ballots counted. Confirmed/elected status must come from a qualified source.

Configure bindings and publish before using the production key. Current rebinding requires republishing; immediate persistence is the C2 plan. The connector sends absolute values, rejects older revisions, accepts newer downward corrections, retries identical values safely, and sends nothing on failed reads. Empty text clears via empty string; JSON null deletes a path without clearing its last rendered field.

## What the research actually proved

Four research native templates passed the actual NoaCG publication gate with no warnings. The actual SPX parser, productionData functions, composeDocument and shared field writer were exercised through a short-lived loopback HTTP stand-in. Four output captures are included.

Fourteen checks passed: first off-air update, visible second update, unchanged prepared name, identical retry producing no changed rows, source reorder preserving identity, duplicate/missing/older input rejection, newer lower correction, null-versus-empty behavior, rejected request retaining output, shared path resolution, image decode and no extra lifecycle actions after one deliberate operator Take.

This is local proof of normalized data → existing bindings → visible custom fields. It is not proof of hosted API handlers/SQL/auth/realtime, real 2027 feed access/parser, Sheets reader/D4 UI, custom NOACG_ANIM actions, or OBS/vMix/CasparCG output. Those boundaries require the next integration rehearsal; no hosted write or product implementation was performed.

## Ownership and recovery to preserve

- Fill snapshots belong to cues and never refresh in the background.
- A Sheet scalar ±/set/typed override writes to shared Show.data; all graphics on that path follow. It holds until that particular source cell changes.
- A connected list is read-only; edit the source or disconnect.
- “Return to Sheet value” is a new explicit shared write of the latest known-good source value.
- Arbitrary API pushes remain next-write-wins. Do not promise a persistent override lock. API Pause is C5/conditional; stop the sender until it is implemented and qualified.
- Pause/Resume for Sheets retains unrelated overrides and applies only cells changed while paused.
- Missing rows/columns/types or bad images preserve validated output with diagnostics. Raw image assignment alone does not implement image last-good retention; the proposed host resolver must validate/cache first.
- Prepared audience/message destinations refuse live bindings at both doors; offer a separate card or explicit ownership switch.
- Data never triggers Take, Continue, Reset, or machine events.

## Other scenarios and proposed scope

A: Top 16 bracket. Existing br01–br04 use one parsed textarea, regenerate DOM and have no fixed logo slots. There is no bracket recipe. Upstream materializes 15 keyed Matches rows; bind fixed scalar slots. Operator Highlight/Crown actions remain separate NOACG_ANIM events.

B: Sponsor roll. Distinguish native bundled SVG/HTML, self-contained provider OGraf package, media clip through Bridge/CasparCG, and arbitrary hosted webpage. Withdraw the earlier generic “Add hosted graphic” proposal. Foreign OGraf may have a permitted pinned HTTP package scope; that is not arbitrary web embedding. Full library/rundown import still needs qualification.

C: Player overlay. Mix cue-owned name/portrait, connected scalar score/status, and read-only connected list; intentionally share score with another graphic. Do not switch candidate identity by row position.

D: Unfamiliar Illustrator SVG. Expose nodes, explain outlined-text replacement and text fitting, confirm role/type, use the same native contract through visual import or noacg authoring, then validate/publish. Reimport reviews field identity/type compatibility.

Recommend Option A: existing bindings plus custom mapper, promoted Values, adapter-keyed rows and asset-name resolution. Consider Option B later: targeted multi-column/table-slot BehaviourRecipe extension after checking existing perRow machinery. Reject Option C: separate relational engine.

Proposed amendments belong in C1/C2/C6/C7 and the named authoring plans; keep C0 → refactor 1 → 2+7 → 13a → content order. Do not change existing work.json authority/spec hashes during this research.

## Please challenge these points

1. Is the data acquisition story now concrete enough for a producer, and is the distinction between Yle provenance and an unverified delivery interface clear?
2. Is Option A sufficient for the four election graphics and fixed bracket slots? What specifically requires Option B?
3. Are field IDs, keyed records, image resolution and cue/live ownership safe under reorder, corrections and schema drift?
4. Does the proof overclaim anything? Which next hosted/provider/output test would most efficiently close the remaining risk?
5. Are the eleven annotated mockups understandable, especially the handoff from source files to field mappings to Take?

Full package: docs/research/2026-10-custom-graphics-workflow/. Start with election/README.md, then the seven numbered documents, NoaCG-election-and-custom-workflow.pdf and election/evidence/report.json.
