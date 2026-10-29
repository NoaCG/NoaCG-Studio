# Validation and acceptance

## Seven human tasks

Use 3–5 creator/operator pairs, including a newcomer. Provide the same Harbour artwork and synthetic election files; do not coach the click sequence. Record completion, time, wrong-air actions and whether they can explain ownership. Any unexpected Take/Continue/Reset is a failure. Suggested planning targets are ≤10 minutes for import/mapping and ≤30 seconds for a recovery decision; calibrate after the first trial rather than claim a measured result.

1. Import unfamiliar SVG, identify outlined text, expose text/number/image and choose behavior. Explain which pieces remain artwork.
2. Fill a candidate cue from mismatched column names and explain why it will not follow a later source edit.
3. Connect a custom score/list/portrait mapping without selecting a catalogue type; deliberately share one value with another graphic.
4. Operate a Top 16 bracket: receive results then separately highlight a round/crown a winner.
5. Build the mixed-ownership player overlay; nudge score and explain Return to Sheet value versus next API write.
6. Recover from a missing column/logo and a provider outage while preserving the current program image.
7. Export, import into another production, rebind its data and show that the first production remains independent.

Human trial: **not run**. Local automated evidence is restricted to election/evidence/report.json.

## Testable acceptance matrix

| ID | Setup → Action → Observable result | Evidence status |
|---|---|---|
| R01 | Four native fixtures → actual SPX parse + publication gate → fields recovered, all gates pass | Local PASS |
| R02 | Empty tree, off-air fixtures → first HTTP patch → four graphic writes, all remain hidden | Local PASS |
| R03 | Explicit operator Take → second snapshot → KOK 228,000 and Aino 3,700, cue name unchanged, no additional lifecycle actions | Local PASS |
| R04 | Snapshot accepted → identical retry → zero changed-field rows | Local PASS |
| R05 | Stable party/composite candidate IDs → reverse rows → identical resolved identity/value mapping | Local PASS; Sheet UI untested |
| R06 | Adapter input → duplicate ID, missing votes or older revision → rejected before patch; newer lower correction accepted | Local PASS |
| R07 | On-air value → null delete → last displayed value retained; ticker empty string → cleared | Local PASS |
| R08 | Local rejected HTTP request → no accepted patch → last output unchanged | Local PASS; real provider failures untested |
| R09 | Two bindings to one candidate path → resolve → identical values; decoded bundled logos → visible images | Local PASS |
| R10 | All rehearsal updates → inspect play/stop/next counters → only the deliberate operator play occurred | Local PASS; real NOACG_ANIM event path still to test |
| U01 | Custom SVG + node map → visual import and CLI author identical fields → same IDs/types/defaults, valid package and action inventory | Required, not run |
| U02 | Outlined text/long name/missing ID → import and preview → explicit replacement, readable fitted text, missing-ID gate failure | Required, not run |
| U03 | Arbitrary headers Player/TeamLogo/Score/Status → map Fill → exact mapped values copied to cue; later Sheet edit cannot rewrite them | Proposed mapper test |
| U04 | Same source → keyed Connect → row reorder keeps same player; duplicate key blocks; no row-index fallback | Proposed adapter/UI test |
| U05 | Overlay with list/scalar/filled fields → refresh → only connected fields change; list cannot be edited locally | C1 / DS19 test |
| U06 | Two graphics share Sheet score → ±, unchanged poll, unrelated edit, score edit → both nudge; override holds twice; source-cell change replaces it | C1/C2 / D4 test |
| U07 | Scalar overridden → Return to Sheet value → latest valid source value written to shared path immediately; no action event | New affordance test |
| U08 | Override exists → Pause, edit other cell, Resume → only changed cell writes; unchanged override retained | C2 test |
| U09 | API-connected value → manual edit then next push → later push wins; unsupported Pause is not offered as functioning | Existing semantics / C5 test |
| U10 | Prepared message field → attempt binding, then reverse sequence → both doors refuse and offer separate card/explicit switch; Advanced cannot bypass | C0/C1 hygiene test |
| U11 | Renamed column, missing row, bad type/image → source read → last validated affected values retained, per-field repair with old/new samples | Proposed custom recovery test |
| U12 | Valid empty vs failed read → refresh → intentional clear vs no write; health checked/changed/empty/stale remain distinct | C1/C2 test |
| U13 | Published Sheet with all pages closed → edit → output follows at measured tick latency, one reader, persisted Pause honored after reload | Q/C2 real-provider test |
| U14 | Full 15-match SVG → update scores/winners → correct named slots; no Highlight/Crown unless operator presses | Scenario A qualification |
| U15 | Sponsor routes → validate native/OGraf/media/URL inputs → approved package route works, arbitrary runtime page rejected, clip path explicitly qualified | Scenario B qualification |
| U16 | Player overlay over actual video → source update then explicit action → layer correct, filled name fixed, controls separate | Scenario C device/journey test |
| U17 | Valid template/source bindings → save, reload, publish, export/import → values/field IDs survive; production connections require rebinding; old production untouched | C2/C6 compatibility test |
| U18 | Published f2 number → incompatible reimport → known-good published output retained; migration review required before publishing replacement | New compatibility test |
| U19 | Real results feed + hosted NoaCG + chosen output → rehearsal through outage/correction/rate limit → measured latency and recovery; no on-air action from data | Election go-live gate, not run |

Live-source invariants need structural tests (reader has no airing method) and command-log assertions, including Continue, Reset and explicit NOACG_ANIM events. The local rehearsal's lifecycle counters are useful evidence but not a substitute for those full-system checks.
