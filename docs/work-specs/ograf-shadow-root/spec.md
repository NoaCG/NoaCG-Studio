# Mount exported OGraf graphics in a shadow root

## Problem and authority

Owner decision, 2026-10-10, on [issue #922](https://github.com/NoaCG/NoaCG-Studio/issues/922):
move exported OGraf graphics into a shadow root, in phases, with a written plan first. This is that
plan. It changes no code. Owner requirements, from that decision and the ask that started this spec:

- **O1.** The OGraf export only. CasparCG, SPX and HTML5 template output behave exactly as today,
  and any shared runtime change is inert outside a shadow root and proven so by existing render
  checks. Nothing reaches the upcoming CasparCG productions.
- **O2.** The plan covers every surface, from the code.
- **O3.** Each phase lands and is verified on its own.
- **O4.** The shadow root becomes the OGraf default only after it is proven on SPX 1.4.1 and on
  SuperFly's OGraf server.

Why: NoaCG is going OGraf-first, and a broadcaster running several graphics on one renderer needs
the two cases [#924](https://github.com/NoaCG/NoaCG-Studio/pull/924) could not close in the light
DOM: two copies of one design on air together, and a renderer page's own rules reaching into a
graphic. Today `graphic.mjs` injects one `<style>` and the design's markup into the element's light
DOM and runs the template with a `document`, `window` and `gsap` scoped to that element
(`graphicModule` in `src/export/targets/ograf.ts`).

## What the spikes measured (2026-10-10)

A throwaway Playwright spec built real packages with `ografTarget.build`, rewrote the generated
`graphic.mjs` into a shadow-root mount (the design below), and mounted both in a renderer page in
Chromium. Method, numbers and limits: `evidence/spikes.md`.

| Question | Measured | So |
|---|---|---|
| Do the animation interpreter and the catalog's presets work in a shadow root? | 48 designs (two per catalog category, plus `aw01`, `aw02`): settled frames pixel-identical to the light mount (one sweep reading was an artefact of a shared page; fresh pages agree); `load()` and `playAction()` answered 200 | No GSAP context, no change to `animRuntime.ts` or the presets |
| Selector strings in an ARRAY target | `aw01`, `aw02` log "GSAP target .reveal-subject,... not found" without the fix, nothing with it | `scopedGsap` resolves arrays too |
| `@font-face` in the shadow stylesheet | Never registers: `document.fonts` empty, text in the fallback face (4 designs, 1,607 to 16,039 px); lifted to the head, 0 px | Lift the rules (decision 3) |
| `@property`, `@keyframes` in the shadow stylesheet | `@property` ignored (23px light, 0px shadow); `@keyframes` works | Lift `@property` with the fonts |
| A template reading `window.document` | `load()` answers 500 without the fix; works with it | `scopedWindow` answers `document` |
| A template appending a `<style>` to `document.head` | 0px without the fix, 41px with `head` mapped to the shadow root, as in light | `scopedDocument` answers `head` |
| Two copies of one design, each recolouring its own gradient | Light: copy two paints copy one's colour; shadow: each its own, also after copy one is disposed | Closed by the shadow root |
| Renderer page rules (SPX's inherited settings, `*` reset, bare and `!important` rules) | Light frames change by 12,474 to 40,000 px across five designs; shadow by 0 | Closed by the shadow root |
| Non-real-time `goToTime`; a masked Lottie | Both work in the shadow root, frames as in light | No change |
| Wall-clock frames during motion | Differ between any two mounts, light against light as much as light against shadow | Parity runs on a virtual clock (decision 5) |

Read from the renderers' own source: SPX 1.4.1 (`static/js/ograf_functions.js`) creates the element
with class `ografRenderTarget`, appends it to `#divN`, and calls `load`, `updateAction` and
`playAction`. It looks for an `iframe` inside the element only to wait for one to load, and
`view-renderer.handlebars` reaches `.ografRenderTarget iframe` only on its invoke-function path. A
real-time NoaCG graphic has no iframe in either mount, so both reads are unchanged. (The note in
docs/SPX_ON_A_REAL_SERVER.md §10 that this lookup ruled the shadow root out does not hold.)
SuperFly's `renderer-layer` (`LayerHandler.ts`) creates the element, appends it, calls `load`, and
on clear calls `dispose` and empties the layer; it never reads inside the graphic. Both cache the
element class by graphic id, so two copies of one design on two layers is reachable on both today.

**What this changes in #922's cost list.** The GSAP item predates #924, which made `scopedGsap`
resolve the string targets of every timeline it makes inside the graphic, not only those of
`gsap.*` calls. Handed the canvas inside the shadow root, the same wrapper finds the elements. What
remains is three escapes the wrapper does not cover (array targets, `window.document`,
`document.head`), the lift of document-level rules, and the specs that read a mounted graphic. The
`window.document` item of #922 is real, but no generator emits it: it is hand-written or imported
code only, and the document-members test already forbids it in the runtimes.

## Behaviour after the last phase

- `load()` attaches an **open** shadow root to the element (once; a later `load()` reuses it) and
  puts in it one `<style>` followed by one canvas element holding the design's markup, with no
  wrapper between the canvas and the design's top-level elements. The canvas is the template's
  `html`, `body`, `documentElement` and `:root`. The stylesheet rewrite (`scopeCssToGraphic`) and
  its fail-closed gate are unchanged; their selector `:where([data-noacg-graphic="<id>"])` now
  matches the canvas, which carries the attribute.
- The host element is still stamped `data-noacg-graphic` at load and unstamped at dispose, and
  gets the authored box from a `:host` rule (`display: block; position: relative`, authored size,
  clipped). Any renderer rule on the element beats a `:host` rule whatever its specificity, a
  universal reset included (the spike's renderer-rules page carried SPX's `*` reset), so a
  renderer that sizes its layers still does. The canvas starts from initial values as the element
  does today, so a renderer's inherited text settings (SPX's `font-size: 3em`) stop at it.
- `scopedDocument`, `scopedWindow` and `scopedGsap` are handed the canvas. In addition:
  `document.head` answers with the shadow root, so a template that appends a `<style>` styles its
  own tree, as it styled its own page under SPX; `window.document` answers with the scoped
  document; a selector string inside an array target resolves inside the graphic.
- Every `@font-face` and `@property` rule, from the stylesheet and from the markup's `<style>`
  blocks, is lifted at export into one `<style data-noacg-fonts="<id>">` in the renderer's
  `<head>`: added by the first copy of the design to load, removed when its last copy is disposed.
  Its URLs are resolved against the package, as today. Chromium applies neither rule from inside a
  shadow tree.
- `dispose()` empties the shadow root and kills the tweens of its descendants. The non-real-time
  frame sits in the canvas.

## Preserved

- **SPX, CasparCG, HTML overlay and H2R output, byte for byte.** None of their targets imports
  `targets/ograf.ts` (its importers are `registry.ts`, `liveos.ts`, `noacgPackage.ts`,
  `ografImport.ts`, `ExportSurface.tsx`, `src/ograf/main.ts` and `scripts/ograf-starters-emit.mjs`),
  and no phase changes code under `src/` other than `src/export/targets/ograf.ts` and, at the
  flip, the starter guide in `src/ograf/`. So no template
  generator, animation or behaviour block, shared runtime (`animRuntime.ts`, `stretch.ts`, the text
  fit, the sound runtime), bundled asset (GSAP, Lottie, the flex-gap shim) or preview changes.
- The manifest, the package's file list, the dual package's SPX half and its `sourceHash`.
- Packages already exported: they are static files and keep their light-DOM mount.
- Every app surface that shows a graphic renders `composeDocument` in an iframe, never
  `graphic.mjs`: editor, wizard, thumbnails, `/output`, the control page, production monitors and
  the `/ograf` previews.

## Non-goals

- Removing the export-time rewrites. The stylesheet rewrite is still needed (`html`, `body` and
  `:root` match nothing inside a shadow tree). Inside a shadow root the markup's id renaming and
  `<style>` scoping (`graphicSources`, #789) are redundant but harmless; dropping them is a later,
  separate simplification.
- A closed shadow root. It isolates nothing more from a renderer page that means harm, and it
  would hide the graphic from the renderers', the walks' and the specs' own inspection.
- Scaling the canvas from `renderCharacteristics` ([#791](https://github.com/NoaCG/NoaCG-Studio/issues/791)).
- The flex-gap shim inside a shadow root (decision 6).
- `@font-face` inside an `@import`ed sheet. The app emits no `@import` (the SVG sanitiser strips it
  and the AI paths refuse it); a hand-written one keeps its faces inside the shadow tree, where they
  do not load. Recorded as a known limit at the flip.
- Foreign OGraf packages hosted by NoaCG (`ografHost.ts`, `foreignOgraf.ts`): other people's
  graphics, untouched.
- Any change to SPX, CasparCG or HTML5 packages, to the shared runtimes, or to the app's previews.

## Key decisions (derived; the owner can overrule any of them)

1. **Everything lives in the generated wrapper.** The shadow mount, the three closed escapes and
   the lift are all in `graphicModule` and the export code beside it. No shared runtime changes,
   so O1 holds by construction: there is no shared change for the existing render checks to prove
   inert, and they run as they always do. Each phase shows it by its changed-file list (AC-8).
2. **A canvas element inside the shadow root, not the host as the canvas.** The template's
   `body` must be an element inside the tree: the stage fit appends its measuring probe to it
   (`stageFit.ts`) and the stretch runtime walks `offsetParent` up to it, and a probe appended to
   the host would land in its light DOM and never render. As a bonus, the stylesheet is no longer
   the canvas's first child, so `:first-child` and `body.children` see only the design (the cost
   #924 documented goes away).
3. **Document-level rules move to the head, for as long as the design is mounted.** The head is
   the only place Chromium applies `@font-face` and `@property`. In the light DOM both were
   document-wide while the design was mounted and left with its last copy, so the style is counted
   per design (the module is per design, so a module-level count serves) and removed with the last
   copy: two designs that name one family with different files collide only while both are on air,
   as today.
4. **The transition runs on an internal option.** `addOgrafPackage(..., { mount: 'light' |
   'shadow' })`, default `'light'` until the flip, set only by specs and the renderer walks; no UI,
   CLI flag or manifest field. The flip makes `'shadow'` the only mount and deletes the light path
   and the option in the same pull request, so one revert is the whole rollback.
5. **Parity is measured against the light mount, on a virtual clock.** Phase 2's sweep builds
   every catalog design in both mounts and compares the settled frame and frames during the
   entrance at the same timeline time: Playwright's page clock for `Date` and the timers (clocks,
   countdowns, game timers), GSAP's ticker detached and driven by `gsap.updateRoot` as the
   non-real-time document already does (`GSAP_DETACH_JS`), and CSS animations paused at the same
   time. Wall-clock frames of designs with continuous motion differ between any two mounts, and the
   spikes did not establish what still moved under the page clock alone, so the sweep mounts the
   light build twice first and trusts a design's comparison only when those two agree.
   The sweep also records each design's light frame against the studio's own document. At the flip
   its reference becomes the studio document, the frame `e2e/ograf-conformance.spec.ts` already
   requires for Hairline, and any design Phase 2 found different there is listed as a known
   exception with its own issue: an OGraf defect older than this plan, not a reason to hold it.
6. **The flex-gap shim stays as it is.** It walks `document.body` and observes
   `documentElement`, so it cannot see into a shadow root; on an engine without flexbox `gap`
   (before Chromium 84, such as CasparCG 2.3's CEF 71) a shadow-mounted graphic loses its gaps.
   NoaCG's oldest supported CasparCG is 2.4 (CEF 117, docs/PLAYOUT_INTEGRATION.md), and changing
   the shim would change the CasparCG single-file output O1 protects. Recorded as a known limit.
7. **Readers go through one helper.** Specs and walks read a mounted graphic through
   `graphicBody(el)`: the template's `body`, which is the element itself in the light mount and the
   canvas in the shadow mount. Markup lookups, attributes the template sets on its body and the
   canvas box all answer there in either mount; only a read of the graphic's own stylesheet needs
   `el.shadowRoot ?? el`. So the flip needs no second edit to them.
8. **The SPX 1.4.1 walk becomes a script.** `scripts/ograf-external-walk.mjs` already makes the
   SuperFly walk repeatable; SPX's has only ever been driven by hand (docs/SPX_ON_A_REAL_SERVER.md
   §10). O4 needs both repeatable, on light packages as the baseline and on shadow packages as the
   proof, and again on the flip branch.

## Surface map

| Surface | Changes? | How we would know it broke |
|---|---|---|
| OGraf export: `graphicModule`, `addOgrafPackage`, `graphicSources` (`src/export/targets/ograf.ts`) | Yes, phases 1, 2 and 4: the only `src/` code that changes | `ograf-conformance`, `ograf-isolation`, the OGraf cases of `exports` and `graphic-sound`, and the parity sweep, all in both mounts until the flip |
| LiveOS target (`liveos.ts`) | Same `graphic.mjs`, through `addOgrafPackage` | `exports.spec.ts` pins it byte-identical to the OGraf target's; no LiveOS engine to try it on |
| Dual package (`noacgPackage.ts`): the CLI workspace, the bridge's `exportPackage`, the Import round trip | The generated OGraf half; the SPX half, the sources and `sourceHash` do not | `bridge`, `spx-operator`, `graphic-sound` and `editor-cli-round-trip` specs |
| Production export (`showExport.ts`) | OGraf and LiveOS through `target.build` unchanged; the SPX production package not at all | `shows.spec.ts` builds every target |
| SPX, CasparCG, HTML overlay and H2R targets, `selfContained.ts`, `common.ts`, `bundledFonts.ts` | No: none imports `targets/ograf.ts` | AC-8; the non-OGraf cases of `exports.spec.ts` |
| Shared runtimes: `animRuntime.ts` and the 253 preset calls, `stretch.ts`, text fit, sound and behaviour runtimes; bundled GSAP, Lottie, flex-gap shim | No | AC-8; `scripts/check-catalog-emit.mjs` and the catalog gates see unchanged emit |
| `noacg` CLI: scaffold, inspect, validate and `--screenshots` of NoaCG and SPX packages | No: they bench `composeDocument` or read the manifest | CLI smoke tests |
| `noacg validate` and the MCP tool on a plain OGraf zip | Mount our `graphic.mjs` through `ografHost.ts` and only screenshot it | No test today; checked once by hand on a shadow package in phase 2 (AC-7) |
| Bridge as an OGraf client (`cli/src/playout/adapters/ograf.ts`) | No: drives packages already on a server | `bridge-ograf.spec.ts` |
| Editor and wizard previews, thumbnails, validation benches, `/output`, the control page, production monitors, rundown | No: all render `composeDocument` in an iframe | Their own specs, untouched |
| Foreign OGraf hosting (`ografHost.ts`, `foreignOgraf.ts`) | No: other people's packages | `ograf-contract`, `foreign-ograf-sandbox` |
| `/ograf` page and starters (`src/ograf/main.ts`, `scripts/ograf-starters-emit.mjs`) | The downloads follow the flip (built at click time); the previews do not; the guide's font paragraph is rewritten | `ograf-starters.spec.ts` (file list, manifest); the starters are catalog designs, so the parity sweep covers them |
| OGraf import and the control contract (`ografImport.ts`, `control/ografContract.ts`) | No: manifest and sources only | Their specs |
| Fonts, bundled and imported | Lifted to the head (decision 3) | AC-4 |
| Imported SVG designs | Markup and its rewrites unchanged; its ids become tree-scoped | `ograf-isolation` (two designs, two copies), the parity sweep over the SVG corpus |
| Lottie | Player and bootstrap unchanged; lookups go through the scoped document | The parity sweep includes a Lottie design |
| `scripts/ograf-document-members.test.mjs` | Learns `head`, and the new reason `fonts` passes through | Itself |
| 12 specs that read a mounted graphic in page JS: `editor-base-edits`, `editor-cross-cue`, `editor-ease`, `editor-fidelity-trim`, `editor-keys`, `editor-out-step`, `editor-out`, `editor-steps`, `exports`, `graphic-sound`, `ograf-conformance`, `ograf-isolation` | Read through `graphicBody` (phase 1); the assertions that encode the light structure get a shadow form (phase 2) | Themselves: the OGraf ones in both mounts from phase 2, the editor ones on the flip branch's CI |
| 9 editor specs that read a mounted graphic only through Playwright locators | No: locators pierce an open shadow root | Themselves |
| SuperFly's OGraf server | Hosts the change | AC-9 |
| SPX 1.4.1, OGraf project | Hosts the change | AC-10 |
| The ograf.dev community checker (its X-08, `@font-face` portability, is the shadow-DOM advisory) | Its verdict on a starter | Re-run by hand after the flip if the tool is reachable; evidence, not a gate |
| `docs/OGRAF.md`, `src/export/AGENTS.md`, docs/SPX_ON_A_REAL_SERVER.md §10, the starter guide (`src/ograf/guide.ts`) | Rewritten at the flip; the guide's `TEMPLATE_CSS` pointer stays true, its font paragraph does not | Review |

## Phases

Each phase runs `/check` and lands with `/queue-merge`, and adds what the next one must allow for
to `## Phase notes` below.

1. **Close the scoped runtime's escapes; make every reader mount-agnostic** (AC-1, AC-2, AC-8).
   `scopedGsap` resolves the selector strings inside an array target; `scopedWindow` answers
   `document` with the scoped document. Both change OGraf packages only, and only for code that
   uses them: the competition reveal designs (`competition/reveal/shared.ts` passes arrays) and
   hand-written templates. Add `graphicBody` and route the 12 specs and the SuperFly walk's
   `litRoles` through it. The light mount stays the only mount.
2. **The shadow mount, behind the internal option** (AC-3 to AC-8). The mount, the `:host` rule,
   `document.head`, the lift, dispose and the non-real-time frame. The OGraf specs
   (`ograf-conformance`, `ograf-isolation`, and the OGraf cases of `exports` and `graphic-sound`)
   run in both mounts; their shadow run builds the same template in the page through
   `addOgrafPackage(..., { mount: 'shadow' })`, because the export dialog has no mount. The
   assertions that encode the light-DOM structure get a shadow form: the body's children starting
   with the stylesheet (`ograf-isolation`), both graphics' `#f0` found document-wide and the
   `@font-face` read out of the element's stylesheet (`ograf-conformance`), and the three dispose
   checks that the element is empty (`exports`, `ograf-conformance`, `graphic-sound`), which a
   shadow mount passes vacuously and which become "the shadow root is empty". New: the parity
   sweep, the two-copies case and the renderer-rules case. `scripts/ograf-document-members.test.mjs`
   learns `head` and the new reason for `fonts`, and `src/export/targets/ograf.ts` joins the catalog
   triggers in `scripts/e2e-affected.mjs` (AC-3).
3. **Both renderer walks, scripted, on both mounts** (AC-9, AC-10). The SuperFly walk gets
   `--mount`, building the same template through `addOgrafPackage` with that mount, plus a
   two-copies beat and a two-designs beat. The SPX 1.4.1 walk is new. Each runs on light
   (baseline) and shadow (proof), and the transcripts go in `evidence/`.
4. **The flip** (AC-11, AC-8, and AC-9 and AC-10 again). Shadow becomes the only mount; the light
   path and the option go. Both walks run again on this branch's packages before it is queued.
   `docs/OGRAF.md` (Known limits, the Web Component section), `src/export/AGENTS.md`, §10 of
   docs/SPX_ON_A_REAL_SERVER.md and the starter guide's font paragraph (`src/ograf/guide.ts`, which
   says the `@font-face` rules are in the embedded CSS) are rewritten for the shadow mount.
   Rollback is a revert.

### AC-1: Array targets and `window.document` stay inside the graphic

Light mount, two graphics on one renderer page: two reveal designs whose code passes arrays of
selector strings each move and clear only their own elements, and a hand-written template that
reads `window.document.getElementById('f0')`, mounted after a neighbour that also has an `#f0`,
writes its own field, not the neighbour's. Both cases fail on the code before phase 1.

### AC-2: Every reader of a mounted graphic works in either mount

No spec or walk reads inside a mounted NoaCG graphic other than through `graphicBody`, or
`el.shadowRoot ?? el` for a stylesheet read (`git grep` in the phase's review finds none). In phase
2 the OGraf specs pass in the shadow mount with no further change to how they read; only the
structural assertions phase 2 lists change.

### AC-3: The shadow mount paints the light mount's frame, across the catalog

Every catalog design, the SVG corpus (`e2e/fixtures/svg-corpus`), a stretch design and a Lottie
design, built in both mounts: the settled frame and frames during the entrance, at the same
virtual-clock time, each differ by fewer than 1,000 pixels (the conformance spec's bound), and
two light mounts of each design agree within the same bound before that comparison counts. The
sweep lives in `e2e/catalog/`, and `src/export/targets/ograf.ts` joins the catalog triggers in
`scripts/e2e-affected.mjs`, so CI's catalog job runs it on every change to the wrapper, the flip
included, as well as the nightly on main. It fits that job's 25-minute cap beside the existing
catalog specs (measured in phase 2, and split if it does not). One design per category also runs
in the default suite. The sweep's record of light against the studio document goes in
`evidence/`.

### AC-4: A design's own fonts load in the shadow mount

A design on a bundled face and one on an imported face: each face is in `document.fonts` as
loaded, the text is painted in it (AC-3), and the font URLs resolve inside the package (the
conformance spec's "resolves its own fonts" case, in both mounts). A second copy adds no second
style, disposing one of two copies keeps it, and disposing the last removes it. A registered
`@property` applies.

### AC-5: Two copies of one design stay independent

Shadow mount, two copies of one imported SVG design on one renderer page: each recolours its own
referenced gradient and paints its own colour, each `updateAction` writes only its own fields, and
disposing the first leaves the second exactly as it was. The light mount's failure is recorded in
`evidence/`, not asserted.

### AC-6: A renderer page's rules do not reach into the graphic

On a renderer page that adds SPX's inherited text settings, a `*` reset, and bare element, class
and `!important` rules, a lower third, a scorebug, a ticker and an imported SVG design each paint
the frame they paint on a clean page (fewer than 1,000 differing pixels). The existing "SPX
1.4.1's renderer" case passes in both mounts.

### AC-7: The Web Component contract holds in the shadow mount

`ograf-conformance`, `ograf-isolation` and the OGraf cases of `exports` and `graphic-sound` pass
in both mounts, covering `skipAnimation`; concurrent, early and late actions; `load()` again on the
same element after `dispose()` (one shadow root, no second `attachShadow`); non-real-time
`goToTime`; custom actions; file-list paths; and sound. Their shadow run builds its package in
the page through `addOgrafPackage(..., { mount: 'shadow' })`. A template that appends a `<style>` to
`document.head` styles itself and leaves the renderer page as it was. `noacg validate` on a shadow
package benches it and shoots its frame (by hand, once, recorded in `evidence/`).

### AC-8: SPX, CasparCG and HTML5 output cannot change

In every phase, `git diff --name-only origin/main...HEAD -- src` lists nothing outside
`src/export/targets/ograf.ts`, `src/export/AGENTS.md` and the OGraf starter page `src/ograf/`, none
of which the SPX, CasparCG, HTML overlay or H2R targets import; `node scripts/check-catalog-emit.mjs`
passes; and the SPX, CasparCG, HTML overlay and H2R cases of `e2e/exports.spec.ts` pass unchanged.

### AC-9: Proven on SuperFly's OGraf server

`scripts/ograf-external-walk.mjs --mount shadow`, against a fresh build of SuperFlyTV/ograf-server
main, passes every beat it has today (load, play, the three custom actions lighting the drawn
states, stop) and two new ones: two copies of one design on two layers keep their own data and
artwork, and two different designs on two layers leave each other alone. `--mount light` is the
baseline. Transcripts and screenshots go in `evidence/`. Run in phase 3, and again on the phase 4
branch before it is queued.

### AC-10: Proven on SPX 1.4.1

`scripts/ograf-spx-walk.mjs` (new), against the 1.4.1 source build, drives an OGRAF-format project
through SPX's own endpoints and controls: three graphics on three layers as imported; Play,
Continue and Stop; the custom actions with `spx-custom-actions.js`; a file-list image; a second
graphic played during an entrance; two copies of one design on two layers; and the renderer's own
styles not reaching in. Every beat light packages pass, shadow packages pass. SPX's own gaps
(Update does nothing, actions carry no payload) are recorded as unchanged. Phase 3, and again on
the phase 4 branch.

### AC-11: The shadow root is the OGraf default

Every OGraf, LiveOS, dual and production OGraf package mounts in a shadow root, and no light mount
code or `mount` option remains. The parity sweep's reference is the studio document, with phase
2's exceptions listed. `docs/OGRAF.md` lists neither closed limit and does list the flex-gap one.
The AC-9 and AC-10 evidence comes from this branch, and its CI is green, the editor specs
included.

## Phase notes

(Each phase's pull request adds its notes here.)

### Phase 1 (2026-10-10)

- **Built.** `scopedGsap` resolves each string in an array target inside the graphic (nested
  arrays too; elements and objects pass through). `scopedWindow(names, doc)` answers `document`
  with the same scoped document `initTemplate` gets, so `window.document === document` inside the
  template. Phase 2 hands that one document the canvas and both follow.
- **AC-1.** Two cases in `e2e/ograf-isolation.spec.ts`: `aw01` and `wn01` on one renderer page, and
  a Hairline whose own `update` writes through `window.document`, mounted after a Hairline
  neighbour. On the wrapper before the change both failed: the winner's press showed the award's
  sealed subject (opacity 1), each design's replay emptied the other's inline state, and the
  probe's update wrote the neighbour's `#f0`. Both pass after it.
- **AC-2.** `graphicBody(el)` is `e2e/_graphicBody.ts`, a page global installed with
  `installGraphicBody(page)`; the walk installs the same script and imports it under Node 24. It
  is an e2e helper on purpose: `e2e/_*` is core in `scripts/e2e-affected.mjs`, while `scripts/`
  is ignored, so a helper there would run no spec when it changed. In a shadow mount it answers
  `el.shadowRoot.querySelector('[data-noacg-graphic]')`, so **phase 2's canvas must carry that
  attribute** (it does in "Behaviour after the last phase"), or the helper changes, not the
  readers. The review grep finds only the three dispose checks phase 2 rewrites (`exports`,
  `ograf-conformance`, `graphic-sound`). Already done here: `ograf-conformance` counts each
  graphic's own `#f0` instead of `#f0` document-wide, and reads its stylesheet through
  `el.shadowRoot ?? el` (its `@font-face` assertion still needs the phase 2 form, because the
  lift empties that stylesheet). The `body.children` expectation in `ograf-isolation` is phase 2's.
  The nine locator-only editor specs were re-read: no page-JS read inside a graphic.
- **AC-8.** The `src` diff is `src/export/targets/ograf.ts` and `src/export/AGENTS.md`;
  `node scripts/check-catalog-emit.mjs` passes (528 designs); `e2e/exports.spec.ts` passes whole.
- **For phase 2.** `dispose()` kills its elements' tweens but not the template's running timeline,
  so a step's call can fire after dispose and throw on a null lookup: main logs it in the exports
  quiz case and the conformance "timeline calls still fire" case. It is noise today; the shadow
  dispose should stop the runtime's timeline as well. Still open on purpose: `window.self`,
  `window.window`, `globalThis` and `document.defaultView` reach the real page. No generator
  emits them, and decision 1's list of escapes did not include them.
- **Not run.** The SuperFly walk (its read path changed; phase 3 runs it). Locally only the OGraf
  tests of the eight editor specs ran; CI runs them whole.
