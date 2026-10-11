# Spikes behind the plan (2026-10-10)

**Command.** `shadow-spike.spec.ts.txt` in this folder was run as `e2e/zz-shadow-spike.spec.ts` on
branch `claude/ograf-shadow-root-plan-f9097f` at `316db2d64` (main of the day), one worker, through
the machine's e2e queue: `npx playwright test e2e/zz-shadow-spike.spec.ts --workers=1`. Chromium is
Playwright 1.61.1's bundled headless shell. The file was deleted afterwards; nothing of it landed.

**Method.** Each package was built in the app by the real `ografTarget.build` from a template the
real generators made. Its `graphic.mjs` was then rewritten as text into two variants (`patch()` in
the spike):

- **no fixes**: the shadow mount only (one `<style>` and one canvas element in an open shadow root;
  `scopedDocument`, `scopedWindow` and `scopedGsap` handed the canvas; dispose and the
  non-real-time iframe moved inside);
- **shadow**: the same plus the lift of `@font-face` rules into `document.head`, array targets
  resolved inside the graphic, `window.document` and `document.head` scoped.

The unmodified file is **light**. Packages were served from a fake origin to a minimal renderer page
(`#stage > * { position: absolute; inset: 0 }`, as `e2e/ograf-isolation.spec.ts` does), mounted the
way a renderer mounts them (import, define, append, `load`, `playAction`) and screenshotted at
1920x1080. Two frames are compared by counting pixels whose channels differ by more than 24, the
bound `e2e/ograf-conformance.spec.ts` uses.

## Results

**Catalog sample** (`catalog-sample.json`). 48 designs: the first two of every catalog category,
the imported raster and SVG designs among them, plus the reveal designs `aw01` and `aw02`.

- Settled frame (`playAction({ skipAnimation: true })`), shadow against light: **0 differing pixels
  for 47 designs**. `ig01` read 1,692. In that sweep all three variants shared one renderer page,
  one after another. Mounted again in three fresh pages per variant, `ig01` settled identically in
  both mounts, at load and 1.5 s later (0 pixels in all 11 comparisons against the first light
  frame). Its sweep reading is an artefact of the shared page, not of the mount.
- Every `load()` and `playAction()` answered 200 in all three variants.
- GSAP's "target ... not found" warning naming a selector appeared only in the **no fixes**
  variant, and only for `aw01` and `aw02`: `.reveal-subject,.reveal-note,.reveal-logo,.reveal-accent`.
  Their `gsap.set([...], { clearProps })` passes an ARRAY of selector strings, which `scopedGsap`
  passes through to GSAP, and GSAP resolves it against the document. With arrays resolved inside
  the graphic, the warning is gone. (Unnamed "target not found" warnings, from selectors that match
  nothing in a design, appear in light and shadow alike.)
- No fixes against light: `lt11` 7,172, `card01` 16,039, `gt02` 8,924, `sb01` 1,607 differing pixels.
  For `sb01` the difference was looked at: the score digits in the fallback face. The other three
  were not saved as images; the same cause is inferred. The other designs matched, by inference,
  because an earlier **shadow** mount in the same page had already lifted the same face into the
  head. The reach probe below is the clean reading.
- Wall-clock frames 3.5 s after a real `playAction()`: 16 designs differ by more than 1,000 pixels,
  all with motion that runs on the clock (credits rolls, tickers, clocks, pulsing accents).

**Fake page clock** (`fake-clock.json`). 19 designs, each mounted three times in a fresh page with
Playwright's clock installed (light, light again, shadow), sampled 0.4, 1.5 and 4 s after Play.
Light against shadow differs by the same order as light against light for every design (`lt01`
0/0/0 for both; `cr02` 0/11,262/35,325 against 0/10,860/16,571; `aw01` 6,012/0/0 against
1,664/6,477/6,477). What still moves under the page clock was not established; CSS animations,
which run on the compositor's time, are the likely part. Either way these frames are not a usable
comparison: a parity check needs `Date`, the timers and GSAP on a virtual clock, CSS animations
paused at the same time, and two light mounts that agree before light is compared with shadow.

**Reach probe** (`isolation-probes.json`, `reach`). A Hairline with code that reads
`window.document.getElementById(...)` and appends a `<style>` to `document.head`, one fresh page per
variant:

| | light | no fixes | shadow |
|---|---|---|---|
| `load()` | 200 | **500**, "Cannot read properties of null (reading 'setAttribute')" | 200 |
| the `window.document` lookup | found | not found | found |
| width the head `<style>` sets | 41px | **0px** | 41px |
| `document.fonts` | `Inter:loaded` | **empty** | `Inter:loaded` |

**`@property` and `@keyframes`** (the spike's `@property` case). A registered custom property
(`initial-value: 23px`) and a keyframes rule in the template's CSS: light 23px and 1px, shadow
**0px** and 1px. Chromium ignores `@property` declared in a shadow tree; `@keyframes` there works.

**Two copies of one design** (`isolation-probes.json`, `twoCopies`). One imported SVG design with an
Illustrator gradient, mounted twice on one renderer page, copy two offset 960 px; each copy then
recolours its own gradient's stops (white, blue), as a colour field or a picture swap in a pattern
would. Light: copy two painted **white**, copy one's colour, because `url(#SVGID_1_--noacg-quiz-board)`
resolves to the first such id in the document; blue only once copy one was disposed. Shadow: white
and blue, and still blue after copy one was disposed.

**Renderer page rules** (`isolation-probes.json`, `rendererRules`). A renderer page that adds SPX's
inherited text settings, a `*` reset, and bare element, class and `!important` rules for colour,
letter spacing, SVG fill and image opacity, against a clean page:

| design | light | shadow |
|---|---|---|
| `lt01` | 18,041 | 0 |
| `lt02` | 13,333 | 0 |
| `sb01` | 12,474 | 0 |
| `tk01` | 22,177 | 0 |
| imported SVG | 40,000 | 0 |

**Non-real-time.** `load({ renderType: 'non-realtime' })`, `setActionsSchedule`, `goToTime(3000)`:
200 in both mounts, frame painted.

**A masked Lottie** (the spike's Lottie case). One solid layer with a mask over its left half,
placed by `insertLottieElement`. Both mounts: left half red, right half the ground; lottie's mask
references (`url(#__lottie_element_N)`) resolve inside the shadow tree.

## Read from the renderers' source

- SPX 1.4.1, source build at `C:\spx\SPX_1_4_1_source` (tag `v.1.4.1`):
  `static/js/ograf_functions.js` `loadTheGraphic` defines the class once per `<id>-v<version>`,
  creates the element with class `ografRenderTarget`, appends it to `#divN`, awaits `load`, then
  `querySelector('iframe')` only to wait for an iframe's load, then `updateAction` and
  `playAction`. `views/view-renderer.handlebars` reads `.ografRenderTarget` then `iframe` only when
  a playout command carries `data.function`. A real-time NoaCG graphic has no iframe in either
  mount.
- SuperFly's ograf-server, local checkout `C:\ograf\dev\ograf-server` (commit `f4a1c6b`,
  2025-11-19; the walk must use current main): `packages/renderer-layer/src/lib/GraphicsCache.ts`
  defines the class once per graphic id; `LayerHandler.ts` creates the element, appends it to the
  layer, calls `load`, and on clear calls `dispose` and empties the layer's `innerHTML`.

## Limitations

- The sample is 48 of the catalog's designs, not all 528; Phase 2's sweep is the whole-catalog
  reading. Every category is in it.
- One browser engine (this machine's Chromium). No real SPX or SuperFly server was run: their
  behaviour above is read from their source.
- The shadow variants were text patches over the generated module, so the real implementation
  must be measured again, which is what AC-3 to AC-7 do.
- The flex-gap shim was not exercised: no engine here lacks flexbox `gap`.
