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
All fonts were loaded; element and text-range widths agreed. Raw font/runtime
hashes, measurements and the captured rendered output remain in owned ignored
`e6c.local/linux-fit-baseline/`. This predates E4 and is the original raster-fit
family; no E4 product/state change or allowance is involved.

The initial scratch listing and j-0147 stopped before browser execution because
Playwright's default `/tmp` transform cache was read-only. The next invocation
used owned temporary files, passed its static listing and executed j-0148.
Neither record is erased or relabelled. No broader selection or build was run.

The fit correction is contained geometry. Applying it to an exact known emitted
runtime through the existing `prepareOutRuntime` seam affects saved-source
transformation, so the combined row is **Risky**. The Rules below are published
before code and need a fresh read-only Rules-first assessment. No software
implementation has been made at this checkpoint.

## Rules stated before code

1. A placed shrink line that can fit at or above 55% of its design font size
   measures no wider than its wrapper after fitting. Font size is the only
   sizing lever: no glyph distortion, clipping, wrapper growth or new margin.
   If even the floor overflows, retain the floor and record the limitation.
2. Keep the existing cheap proportional passes, then use a fixed bounded search
   between the floor and the overflowing size if necessary. Re-measure the
   actual rendered line; finish on a size already observed to fit. The fit has
   a fixed maximum number of layout measurements independent of text length.
3. Repeated fitting starts from the authored design size and is deterministic.
   Keep one fit outside the animation region and the existing update, DOM-ready,
   font-ready and preview stylesheet refit points. The imported SVG fit ladder
   remains its own system and is never given this raster runtime.
4. Existing graphics receive the correction only when their script contains the
   complete, byte-exact known old emitted runtime (LF or CRLF). Replace that
   block only, preserve surrounding bytes, fields/assets, animation and authored
   custom code; no partial, similar, duplicate or unknown runtime is rewritten.
   Repeated preparation is idempotent. A customized old runtime remains authored
   code, with its limitation stated rather than silently overwritten.
5. Use the existing preview/save/export preparation seam. Add no storage
   migration, background write, propagation, collaboration or ownership model.
   Installing graphics still creates independent production copies, and master
   edits do not update them. Source/runtime provenance remains explicit.
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
