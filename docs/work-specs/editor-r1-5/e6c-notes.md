# E6C — Cloud export and receiving preparation

Product baseline and previous verified main: `1178ac8e8b1c3cabef036e57a1a50c74576ebf93`.
E5C was independently accepted at `621592610bd120da9572b73fee9e39c321a4b059`.
This phase implements only the three E6C criteria in [the spec](spec.md).
Revert the eventual merge with `git revert -m 1 <E6C merge SHA>`.

## Reproduction and classification, before product code

Issue [#775](https://github.com/NoaCG/NoaCG-Studio/issues/775) remains open,
with no comments on 2026-11-13. Its original source-backed backlog at
`745c6f2dcd9ce5e82cc6655c652e08f0568800fd` identifies the three proportional
passes in the placed raster-text runtime. On exact baseline 1178, queued small
job j-0148 executed Chromium 149.0.7827.55 on Cloud Linux with the actual bundled
Inter, Oswald and Saira fonts, weights 400/700, 48px design type and slots
800/1043/1090px. Three of 18 cases exceeded their slot above the 55% floor:
Oswald 400: 1044/1043px; Oswald 700: 1045/1043px; Saira 700: 1091/1090px.
All fonts were loaded; element and text-range widths agreed. This is a reachable
1–2px variant, not proof of the originally reported 5% named-host case. Raw font/runtime
hashes, measurements and the captured rendered output remain in owned ignored
`e6c.local/linux-fit-baseline/`. The complete file is byte-identical at immutable pre-E4 source
`745c6f2dcd9ce5e82cc6655c652e08f0568800fd` and baseline1178: SHA256
`969cc8e85bd73add168516b95db5faea950b700bc38d7dfdb17dfd821308af9f`.
Both emit the identical 2,483-byte runtime, SHA256
`e98eadc644f079d5287996ffacf8fff8cca8a871ce0ecb1488623d1d19314592`,
also the hash measured in the baseline browser. The reachable defect therefore
exists without E4 changes; no E4 state change or allowance is involved.

The initial scratch listing and j-0147 stopped before browser execution because
Playwright's default `/tmp` transform cache was read-only. The next invocation
used owned temporary files, passed its static listing and executed j-0148.
Neither record is erased or relabelled. No broader selection or build was run.

The fit correction is contained geometry. Preparing a corrected runtime from an exact known emitted
script affects source-to-output identity, so the combined row is **Risky**. The Rules below are published
before code and need a fresh read-only Rules-first assessment. No software
implementation has been made at this checkpoint.

## Rules stated before code

1. A placed shrink line that can fit at or above 55% of its design font size
   measures no wider than its wrapper after fitting. Font size is the only
   sizing lever: no glyph distortion, clipping, wrapper growth or new margin.
   If even the floor overflows, retain the floor and record the limitation.
2. Keep the existing cheap proportional passes, then use a fixed bounded search
   between the floor and the overflowing size if necessary: at most 12 bisections,
   at most 18 geometry reads including the wrapper. The lower endpoint was
   observed to fit and the upper endpoint to overflow. Return the measured lower
   endpoint, with a final bracket no wider than the original bracket / 4096;
   never enlarge beyond the authored size or shrink below the floor. This solves
   the measured width constraint synchronously, with no wait, action retry,
   threshold relaxation or test/queue/cap change.
3. Repeated fitting starts from the authored design size and is deterministic.
   Keep one fit outside the animation region and the existing update, DOM-ready,
   font-ready and preview stylesheet refit points. The imported SVG fit ladder
   remains its own system and is never given this raster runtime.
4. An existing graphic's output receives the correction only when its script contains the
   complete, byte-exact known old emitted runtime (LF or CRLF). Replace that
   block only, preserve surrounding bytes, fields/assets, animation and authored
   custom code; no partial, similar, duplicate or unknown runtime is rewritten.
   Repeated preparation is idempotent. A customized old runtime remains authored
   code, with its limitation stated rather than silently overwritten.
5. Use a pure, narrowly called output helper on cloned preview/export/render
   inputs. Leave `prepareOutRuntime`, save/import/dirty comparisons and the
   source document/history untouched. Add no storage migration, background write,
   propagation, collaboration or ownership model.
   Installing graphics still creates independent production copies, and master
   edits do not update them. Output preparation must leave library/production
   documents, current on-air payload and operator data byte-identical; a new
   runtime is only consumed when that output is explicitly composed. Retain
   source and emitted-runtime hashes separately in the receiving fixture.
6. Pin candidate package bytes, original source and actual executed version.
   A changed runtime invalidates reuse of an older app artifact as this candidate;
   retain that artifact's own source/version. No new manual app bundle/build is
   admitted before the coordinator receives its exact need/source/route/bounds.
   Existing E5C packaging 3/3 and every E4 allowance remain spent.

## Acceptance and verification plan

Inventory all six actual registry targets (SPX, HTML overlay, H2R, CasparCG,
OGraf and LiveOS), combined graphic and whole-production SPX paths. Generate
candidate packages from authored source with bundled font/logo. Exercise available
browser/isolated renderer data, In, Next, Out, interruption and replay; inspect
source/field/assets and actual artifact/notices/dependency closure. Use existing
adapters and the qualified serial queue. Keep bulky ZIP/PNG/log evidence in owned
ignored output, and publish small hash receipts and usable local instructions.

A blank-page browser regression must assert the actual fit rule with bundled
fonts, floor cases and a mutation back to the old runtime; an editor journey
must tighten its existing long-text check without sleeps/retries or weakened
assertions. Check exact-runtime upgrade preservation and idempotence cheaply in
Node. One relevant broader selection remains available, bounded at 12 minutes;
small jobs remain at five minutes. Full suites/builds remain Actions.

Cloud output cannot close #775's named Linux receiver requirement, real E5
participants/devices/native125/performance, real E6 hosts/operators, OW1 written
GSAP disposition or explicit candidate-specific owner release approval. No new
performance campaign, paid model call, licence or release posture change.

## Callsite audit and precode design correction

The initial proposed `prepareOutRuntime` integration was rejected during the
precode audit because its direct callers include `store/saveActions.ts:32`
(`prepareEmptyOut` can apply a new template), `components/wizard/templateFile.ts:21`
(imported source), and `store/templateStore.ts:184` (draft/record equivalence).
Those paths and `blocks/animMigration.ts` stay unchanged. The other direct callers
are cloned output preparations: `preview/composeDocument.ts:154`,
`export/selfContained.ts:43`, `export/targets/spxStarter.ts:190` and
`export/targets/ograf.ts:2271`. The separate render path
`render/composeRenderDocument.ts:109` strips realtime blocks from an output string
and needs the same pure preparation. A dedicated helper at those five sites
can correct known emitted runtime without introducing a store mutation.

Every export flavour uses one of these existing builders; combined packages
compose SPX and OGraf, and the production SPX builder uses `buildStarterInto`.
CLI/MCP export uses Bridge's `buildGraphicPackage` and inherits that builder.
No change belongs in a receiving message handler, durable store, production-copy
rule or on-air state. Verify the exact old match, CRLF, already-new, duplicate,
customized, partial, unknown and SVG cases, and unchanged input/source/history
while preparing preview, render and each export.

## Implemented result and actual evidence

Product implementation `de563b599f175a60500ef288d0d59b3d624126c3` adds a fixed
12-step measured bracket only after the three proportional passes fail. The
complete known legacy block is prepared through a pure output-only helper at
all five named sites. `prepareOutRuntime`'s body, save/import/equivalence,
source/history, storage and on-air/production-copy rules are unchanged. Preview's
existing composition facade serves render; no architecture guard was relaxed.
The original emitted runtime was 2,483 bytes; current emitted runtime is 3,238
UTF8 bytes, SHA256 `d2a302a04eac45c7f5d26241550919c74841f6f372a491f2e47ce106b7b08e57`.
A customized/unknown old fitter remains authored code, so its limitation is
retained instead of silently replacing it. The SVG ladder remains separate.

[Verification](e6c/verification.json) retains each failed/pretest attempt and
actual source scope. Six targeted Node checks passed; j-0149's editor journey
and same 18 strict real-font cases plus two impossible-floor cases passed.
The exact old control still overflows in three feasible cases. J-0151 passed
all seven output/package checks: all five emitted output sites contain the new
fit, caller source and store/history/storage are unchanged, six packages execute
In/Next/Out/interruption/replay and the Bridge output equals the combined package.
J-0152 passed all 48 maintained typography/export/isolation/render checks in
2.4 minutes, two workers, zero retries/skips. Its one broader allowance is spent.
It ran committed de563; c456 changes only a guards comment. Working-diff jobs are
not relabelled as final-head executions.

J-0150's original 3 PASS / 4 FAIL is preserved. Its raw literal oracle missed
OGraf's deliberate two-space serialization; the correction compares that exact
emitter indentation only and writes raw source/state/output evidence first.
Its single-file probe sent a folder-relative logo path into documents with
embedded images. Valid text-only data plus a separately asserted embedded SVG
data-URL update now retain logo width 32 and heading. Inspection also exposed a
pre-existing generated instruction defect: single-file FIELDS.md recommended an
images folder/default path it did not ship. The generator is byte-identical at
745c6f2dc and 1178 (SHA256 `81e18d37e40992a572e65735cc4ce34e2a12f6c8094493b6df21df08dcb5dbf8`).
The narrow target-aware note/default correction covers all three single-file
flavours and their production editions; folder targets keep their path contract.
No runtime image transport or E4 rule changed.

The first native candidate admission at de563 failed its existing gate-coverage
judge because the new test's brace guard was comma-split into nonexistent paths.
Its build tests/helper did not run, cleanup is null and no candidate exists.
The separate verified correction `c456f647eb8a30839473fd93467f447a181f2dc1`
expands only that header to five exact full paths; the existing audit passes
472 gates. The prospectively admitted corrected source's unchanged full normal
Actions build passed: 5,844 tests, 5,814 PASS, zero FAIL, 30 existing SKIP; gateway
533 mock tests PASS. All twelve unchanged native helper assertions passed,
cleanup=true/no errors, zero helper retries/skips, inside 269,775ms/ten minutes.
[The producer receipt](e6c/native-producer.json) and local kit retain exact version,
ZIP/manifest/upload hashes, 849 files and 22 historical E5C capture exports.
Neither failed admission nor E5C's exhausted 3/3 history is reset. No extra F4,
model round, workflow/helper change or local production build was performed.

[The final local kit](e6c-local-kit.md) provides eight actual downloadable ZIPs,
source and per-file checksums, operator data, compatibility/setup/version form,
Linux fit measurements, expected rendered observations and off-air/rollback.
New PNGs remain owned retained raw evidence, hash-indexed; no encoded wrapper or
picture-policy exception was introduced. Browser backgrounds differ by host
compositing, so the captures are not a pixel-equality claim.

**Source applicability:** 621→1178 is OBS scene joining/publish callback work.
The new callback consumes published before/after scenes; `takeJoined` immediately
returns for no joins. These authored direct export/renderer fixtures and the
single-graphic production SPX build do not publish or join an OBS scene. Export,
font, editor and dependency inputs were unchanged in that delta; relevant browser
exports/OBS activation and the actual current package producers were renewed here.
This does not claim whole-app equivalence or fresh hosted scene-publish acceptance.

**Remaining gates and decisions:** [G07's technical inventory](e6c/g07.json) covers
actual graphics/notices, app producer provenance and CLI/Bridge/toolkit boundaries.
Full applicable vendor terms/date archive and written disposition remain OW1;
raw native consumer readback remains explicitly unverified. Named E6 hosts/Linux
receivers/operators and E5 real people/devices/native125/performance remain open,
not waived by these Cloud results. The original #775 remains open for that named
Linux qualification; this phase's reachable variant cannot close its reported
5% host case. There is no equivalent Studio reference task for this generated
runtime's fit floor or these host protocols; no new usability/reference-parity
claim is made. Final full second opinion, current-head check/CI/Codex, merge queue
and fresh exact-merge acceptance are separate gates; their actual source, verdict
and run receipts belong on the PR and normal coordinator/checker records.
