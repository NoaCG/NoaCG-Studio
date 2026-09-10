# OGraf export (EBU Open Graphics, v1)

NoaCG Studio exports any graphic as an **OGraf v1 Graphic** - the EBU's open standard for
web-based broadcast graphics. This page is for the engineer who has to load one of our packages
into their renderer: what we emit, what maps to what, and where the limits are.

> **Where this sits.** OGraf is one of six export targets, beside SPX, CasparCG, an OBS/vMix
> overlay, H2R and LiveOS, and more will follow. The product is not an OGraf generator any more
> than it is an SPX generator: you make a graphic in NoaCG and take it wherever it has to run.
> OGraf gets this much attention because it is the open standard, because it is the one target
> that also lets a graphic come back IN, and because EBU/YLE are the first customers who asked
> for it - not because a NoaCG graphic is an OGraf graphic underneath. It is not. The code is the
> source of truth, and every target is an adapter off it.

## The free starters page (`/ograf`)

**<https://noacg.studio/ograf>** hands out six curated catalog graphics as free OGraf starter
packages - the shareable answer to "we want editable base templates to teach our staff on"
(the Yle ask, 2026-08-20; `docs/GOALS_ARCHIVE.md` "the SVG road"). It is a public, indexable page
(`ograf.html` + `src/ograf/`, vanilla TS): the card copy is static, and each download is built
**by the real exporter at click time** - `ografTarget.build()` on `variant.create()` - so a
starter can never drift from what the product ships, and every package passes the same
schema gate below on its way out. The one addition over an ordinary export is **GUIDE.md**
(`src/ograf/guide.ts`): the modification walkthrough - how to load it, drive its data, restyle
the `:root` contract, and edit the `NOACG_ANIM` motion - generated from the template itself.
The starters are exported with LIVE intent (the post-production gate rightly refuses
content-driven motion such as the ticker's crawl). Pinned by `e2e/ograf-starters.spec.ts`,
including that every named card still resolves against the catalog - a design rename must
break that spec, not the page.

- Specification: <https://ograf.ebu.io/v1/specification/docs/Specification.html>
- Manifest schema: <https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json>
- Spec version targeted: **v1**. There is no vendor dialect - a package is plain OGraf. The one
  NoaCG-specific thing a manifest may carry is the standard's own extension mechanism:
  `v_`-prefixed vendor fields. Every export writes a per-property `v_noacg.kind` hint inside
  `schema` (the control kind the property came from, since the JSON-schema type is a 3-way
  collapse) and a per-action `v_noacg` (the button's section / destructive flag / adjust deltas); the **dual
  graphic package** (`src/export/noacgPackage.ts`, docs/AGENT_CLI.md) additionally writes a root
  `v_noacg` block naming the graphic TYPE, the editable SPX-layout SOURCES shipped beside the
  component, and their content hash. Any renderer ignores all of it; NoaCG's reader
  (`src/export/targets/ografImport.ts`, `src/model/importTemplate.ts`) uses it to re-import the
  package losslessly and to tell a stale generated half from a fresh one.

The same package is also the **LiveOS (NetOn.Live)** export; that target is this package with
NetOn.Live install steps in its README, because the LiveOS HTML5 graphics engine is
OGraf-compliant.

## Playing a NoaCG production on an OGraf renderer, today

The question this section answers is the practical one: I have graphics in NoaCG and a renderer
that speaks OGraf - what do I actually do? Every step below was walked on 2026-08-26; where
something does not exist yet it says so rather than describing an intention.

**The short version: NoaCG is the authoring and packaging side, and the renderer is the playout
and control side.** You download a folder per graphic and hand it to the renderer. From that point
the renderer owns loading, cueing and data - the export dialog says exactly that, "Controlled by
your OGraf renderer". NoaCG's own hosted control page and its `/output?production=<slug>` URL are
the OTHER playout route (a browser source in OBS, vMix or CasparCG); they do not drive an OGraf
renderer, and there is no NoaCG-to-renderer control link today.

### 1. Get the package

Four doors, all producing the same shape of folder:

| Door | What you do | What you get |
|---|---|---|
| **`/ograf`**, the free starters page | Click **⬇ OGraf package** on a card | `<slug>-ograf.zip`, one folder inside: the manifest, `graphic.mjs`, `lib/gsap.min.js`, `fonts/` (with its `FONT_LICENSES.md`), `FIELDS.md`, `README.md` and `GUIDE.md`. No account, nothing installed. Built by the real exporter at click time |
| **one graphic from the studio** | Finish the wizard and press **Export it** (or **Export…** in the library), pick **OGraf (EBU) export**, press **Validate & download** | the same folder for YOUR graphic. The button names the target back to you, and validation is the gate - a graphic with errors does not download |
| **a whole production** | On the production, **Export…** → **OGraf (EBU) export** → **Validate & download** | one zip, **one folder per graphic in the production**. Same-named graphics get suffixed (`House Ident 2` → `house_ident_2/`, id `noacg-house-ident-2`) so no two manifests collide in a renderer |
| **the `noacg` CLI** | `noacg scaffold …` then `noacg validate <dir>` (docs/AGENT_CLI.md) | the dual package: the OGraf half beside the editable SPX sources. A renderer reads the manifest and `graphic.mjs` and ignores the rest |

"Download the template" is that first column, and it is the whole step: there is no separate
publish, no key, and no account involved in producing an OGraf package.

### 2. Give it to the renderer

Two rules decide everything about this step, and both are properties of the standard rather than
of NoaCG:

- **`graphic.mjs` is an ES module, so the package has to be served over `http(s)`.** Browsers
  refuse module imports over `file://`. Opening the folder from a disk path will not work in any
  renderer, and that is not a bug in the package. (Our single-file targets - CasparCG, OBS/vMix,
  H2R - are the ones that run from a bare file; that is what they are for.)
- **The renderer decides how a Graphic is installed.** There is no standard install verb. In
  SuperFly.tv's OGraf server, the renderer used for both external rounds recorded below, it is a
  zip upload endpoint, and the Graphic then appears by its manifest `id`. Another renderer may
  want the folder in a directory it watches, or a URL. Read its documentation - OGraf standardises
  what a Graphic IS, not how it arrives.

### 3. Drive it

The renderer's control API or automation system drives it, using the vocabulary the manifest
declares:

- `load` with a data object, then `playAction` to bring it on, `stopAction` to take it off.
- **Data keys are `f0`, `f1`, …**, not labels - `schema` in the manifest, and `FIELDS.md` in the
  package is the table that translates them. This trips people up: the operator-facing name is in
  `title`, and the key is what you send.
- `updateAction` writes changed fields and never causes a state change. That is a house rule and
  an OGraf one.
- `customAction({id, payload})` fires one of the graphic's own operator events - the buttons a
  scoreboard or a quiz needs. `customActions` in the manifest lists them.
- Repeated `playAction` walks the default path when `stepCount` is above 1. An operator who only
  ever presses play/next/stop gets a coherent graphic, whatever the machine underneath does.

### What you do NOT get on this route

Stated plainly, because the alternative is finding out during a show:

- **NoaCG's control page does not reach the renderer.** The generated control panel, the audience
  plane, the cue rundown and the hosted command log all belong to NoaCG's own output URL. On an
  OGraf renderer the operator surface is the renderer's.
- **A production is a bag of graphics here, not a rundown.** The production export writes one
  folder per graphic; the cue order, the layers and the timing live in NoaCG and do not travel in
  an OGraf package. To move those too, the graphics pack (`docs/GRAPHICS_PACKS.md`) is the
  re-importable file, and it only means anything to NoaCG.
- **A round trip is one-way in practice.** NoaCG can re-import its own OGraf package losslessly
  (that is what the `v_noacg` block is for), but a graphic edited inside somebody else's renderer
  is not coming back.

### Working the other way: a graphic NoaCG has never seen

The door goes both ways, which is the part that surprises people. `noacg inspect <dir|zip>` reads
ANY OGraf package and prints the operator surface NoaCG would derive from it - an input per
`schema` property, a button per `customAction`, the step semantics - and `noacg validate` mounts
it and drives its whole lifecycle. Neither consults a category. `e2e/ograf-contract.spec.ts`
renders the real control components from a hand-written third-party manifest.

## What is in the package

```
<graphic>/
  <graphic>.ograf.json     the manifest (the entry point)
  graphic.mjs              default-exports the Graphic Web Component class
  lib/gsap.min.js          bundled GSAP (no CDN, ever)
  lib/lottie.min.js        only when the graphic uses a Lottie animation
  fonts/*.woff2            every face the CSS references
  fonts/FONT_LICENSES.md   OFL 1.1 + the per-font copyright notices, beside the bytes they cover
  images/*                 the graphic's own assets, at the paths its markup uses
  FIELDS.md                the data contract: id -> field -> type -> default
  README.md                how to load it
```

Everything is referenced relatively and nothing is fetched from the network at runtime. The
package is validated before it is written: an invalid manifest, or a manifest naming a file the
package does not contain, fails the export rather than shipping.

## The manifest

| Field | What we emit |
| --- | --- |
| `$schema` | the exact OGraf v1 schema URL |
| `id` | `noacg-<slug>` - a legal custom element name (see below) |
| `version` | `"1.0.0"` |
| `name` / `description` | the graphic's name and its SPX template description |
| `main` | `"graphic.mjs"` |
| `supportsRealTime` | `true` unless the export was made post-production-only |
| `supportsNonRealTime` | `true` when the export declares post-production intent (see below) |
| `stepCount` | the number of steps on the graphic's default path |
| `schema` | one property per data field, keyed by its SPX id (`f0`, `f1`, …) |
| `customActions` | one action per operator event the graphic's state machine declares |
| `actionDurations` | play/stop/update durations in ms, read off the graphic's own timeline |
| `renderRequirements` | the authored resolution and frame rate, as `ideal` constraints |

**`schema`** is the public state model. Each property carries `type` (`string`, `number` or
`boolean`, from the field type), `title` (the operator-facing label), a `default` typed to match,
`enum` for a dropdown, and `hidden: true` for an SPX hidden field. The keys are ids, not labels -
`FIELDS.md` in the package is the table that translates them.

**`renderRequirements`** states the canvas the graphic was designed for as `ideal`, never `exact`.
It is a declaration, not a refusal: the graphic scales, and an exact constraint would tell a
1080p renderer to reject a 4K-authored graphic that would have rendered fine.

**`actionDurations`** are measured, not estimated. Our timeline is data (`NOACG_ANIM`), so the
entrance, each step, and the exit all have a known length; the value is speed-corrected into
milliseconds. Custom actions are declared `-1` (dynamic) because how long one takes depends on
which state the machine is in when it fires. A graphic whose motion is hand-written GSAP that we
cannot read emits no `actionDurations` at all - the spec's answer to "unknown" is silence, not a
guess.

## The Graphic Web Component

`graphic.mjs` default-exports a class extending `HTMLElement`. It embeds the graphic's own
runtime unchanged - the same `play()` / `stop()` / `update()` / `next()` an SPX host would call -
and maps the OGraf actions onto it.

| OGraf | What happens |
| --- | --- |
| `load({data, renderType, renderCharacteristics})` | injects the CSS + markup into the element (light DOM), loads GSAP, runs the graphic's own script, applies `data`. Resolves when the graphic is ready for actions. |
| `playAction({goto, delta, skipAnimation})` | first call plays the entrance (step 0); further calls walk the default path with `next()`. Returns `currentStep`, or `undefined` once the graphic has gone to the end. |
| `stopAction({skipAnimation})` | plays the exit. |
| `updateAction({data, skipAnimation})` | writes the changed fields. Data never causes a state change - that is a house rule and an OGraf one. |
| `customAction({id, payload, skipAnimation})` | fires that operator event through the graphic's own serial event queue. An unknown id answers `400`. |
| `dispose()` | kills tweens, clears the element. |
| `goToTime({timestamp})` | non-real-time only - see below. |
| `setActionsSchedule({schedule})` | non-real-time only - see below. |

Contract details worth knowing:

- **Every method returns a `ReturnPayload`** - `{statusCode, statusMessage?, currentStep?}` -
  and never rejects. An action before `load()` resolves, or after `dispose()`, answers `409`; an
  internal failure answers `500` with the message. A renderer can log a status code; it cannot
  log an unhandled promise rejection.
- **Concurrent calls are honoured, in arrival order.** The spec requires a Graphic to accept an
  action while a previous one is still pending. All actions run through one internal chain, so
  two updates issued back to back land in the order they were sent rather than racing.
- **`skipAnimation` lands the action instantly.** The action still happens; it just arrives at
  its settled frame with no tween. The graphic's own runtime does this natively (it composes any
  state's pose with animation callbacks suppressed), so a skipped play is pixel-identical to a
  finished one.
- **Steps are our default path.** A NoaCG graphic is a state machine whose main group has an
  ordered walk; step `i` of that walk owns timeline `i`. That walk *is* the OGraf step model, and
  it is the same ordered walk SPX and CasparCG drive with Continue - one contract, three hosts.
  A graphic with a branching machine still degrades to that walk: an operator who only ever
  presses play/next/stop gets a coherent graphic.
- **Custom actions are structurally guarded.** An event only fires if the author drew that arrow
  from the state the graphic is currently in. An illegal event is dropped along with its payload;
  the action still answers `200`, because "the operator pressed a button that does nothing right
  now" is not a transport error. The returned `currentStep` tells you where the graphic actually
  is.

## Non-real-time (offline) rendering

Export the graphic with post-production intent and the manifest advertises
`supportsNonRealTime: true`, which obliges `goToTime()` and `setActionsSchedule()`. Seeks are
deterministic: each one rebuilds an isolated document and replays the schedule against a virtual
clock, so asking for 5.6 s, then 0.12 s, then 5.6 s again gives the identical frame all three
times.

That mode is gated by a conservative compatibility check, and the export is refused with the
reason if the graphic uses anything a virtual clock cannot own: wall-clock CSS animations,
`Math.random()`, Web Animations API calls, `<video>`/`<audio>`, a live network dependency, or a
timeline we cannot read. Better a refusal at export than a render farm producing frames that
disagree with each other.

## Known limits

- **`thumbnails` only where a raster exists.** The spec allows a preview image per Graphic. The
  in-app export does not rasterise one, so hosts that show a preview tile show a placeholder
  there; the `noacg` CLI's `validate --screenshots` (docs/AGENT_CLI.md) shoots the settled on-air
  frame and writes it into the dual package as `thumbnail.png` + the manifest's `thumbnails[0]`.
- **No `author`.** A graphic in NoaCG has no author field to fill it from; adding the tool's own
  name there would misdescribe what the field means.
- **`id` is `noacg-<slug>`**, not a reverse-DNS name and not the bare slug. The spec only says an
  id is any unicode except `/`, but a renderer may register the Graphic as
  `customElements.define(manifest.id, class)` - SuperFly.tv's OGraf server does - and the HTML
  standard requires such a name to start with an ASCII lowercase letter and to contain a hyphen.
  The prefix supplies the hyphen whatever the design is called, survives a name that starts with
  a digit, keeps the id clear of HTML's reserved element names, and gives the namespace the
  spec's reverse-DNS recommendation is really after. Folder and file names keep the plain slug,
  the way SPX and CasparCG expect. **Uniqueness comes from the NAME, not from a separate id
  register.** No two CATALOG designs share a name (five pairs had drifted together by
  2026-08-19 and were renamed; `e2e/catalog-baseline.spec.ts` holds the rule), but a production
  reaches two same-named graphics the ordinary way - by adding one design twice, which is what
  a show does the moment it needs two straps of one look. The
  whole-show export resolves that by suffixing the graphic's name (`House Ident 2`) before any
  target packages it, and the id derives from that same renamed template - so the folder, the
  file and the manifest id carry the suffix together (`house_ident_2/`, `noacg-house-ident-2`).
  Keep the id derived from `template.name`: giving it its own source would let the folder and
  the id disagree, and a repeat id makes a renderer's `customElements.define(manifest.id, class)`
  throw before the second graphic is ever mounted. Pinned by `e2e/ograf-conformance.spec.ts`.
- **Custom action durations are `-1`.** Honest rather than wrong: the length depends on the
  machine's current state.
- **Light DOM, not shadow DOM.** The graphic's markup is injected into the element directly so
  its own `getElementById` lookups behave exactly as under SPX. Host page CSS that targets bare
  element selectors could therefore reach into a graphic, exactly as before this was scoped - a
  pre-existing, unchanged limit. The other direction is closed for the TEMPLATE'S STYLESHEET:
  `template.css` is re-addressed from the document to the graphic's own element before it is
  injected (`scopeCssToGraphic` in `src/export/targets/ograf.ts`) - `html, body` and `:root`
  become the element, `*` its subtree, every other rule is nested under it at zero specificity -
  and the export refuses (browser-parsed, fail-closed) if any rule would still address the
  document. So a graphic's stylesheet never restyles the renderer's page, and two designs on two
  layers no longer fight over `body` or `--accent` through it. NOT covered yet: a `<style>`
  block inside the MARKUP (an imported SVG carries the artwork's own, with Illustrator's shared
  `.st0` names) is injected as written and stays document-global -
  `docs/backlog/ograf-markup-inline-styles.md`. The element is authored-size: a block of the
  authored resolution, `position: relative` so px-positioned designs lay out against it as
  against the SPX page (viewport units - `vw`, `vh`, `vmax` - still resolve against the
  renderer's viewport, as they always did), and it is `body` and `documentElement` for the
  template's own code. A renderer must place and scale that box itself; `load()` does not read
  `renderCharacteristics` yet (`docs/backlog/ograf-render-characteristics-box.md`). Pinned by
  `e2e/ograf-conformance.spec.ts` ("leaves the renderer's page as it was").
- **One instance of a given DESIGN per document.** Several *different* graphics in one document
  are fine, which is the arrangement a Web Component renderer actually uses: each Graphic runs
  against a `document` scoped to itself, so its `getElementById('fN')` lookups cannot reach a
  neighbour's identically-named field, and disposing one leaves the others running. Two instances
  of the *same* design still collide, because the design's motion is keyed on its own class names
  and those are shared by both copies. Give the second copy its own document or frame.
- **`graphic.mjs` is an ES module**, so a renderer must load the package over `http(s)` - browsers
  refuse module imports over `file://`. Our single-file targets (CasparCG, OBS/vMix, H2R) are the
  ones that run from a bare file on disk.

## What an external renderer said

Conformance checked against our own reading of the spec proves only that we read it the way we
wrote it. On **2026-08-18** an exported package was loaded into a renderer nobody here wrote:

- **SuperFly.tv's [OGraf Simple Rendering System](https://github.com/SuperFlyTV/ograf-server)**,
  the "play OGraf Graphics in a browser" server the EBU's own repository README points at. Built
  from source and run locally: package uploaded through its zip endpoint, the renderer page opened
  in a browser, and every action driven through the server's HTTP control API rather than by
  calling our class directly.
- Separately, every manifest the catalog can emit - **1470 of them**, each design in all three
  export intents - was validated against the **EBU's published JSON-Schema files** with a real
  JSON-Schema engine (ajv, draft 2020-12) instead of our transcription of them.

### What it refused, and what changed

Three defects. Every one of them passed our own gate, and two were invisible rather than loud.

1. **The manifest `id` was not a legal custom element name.** The renderer registers a Graphic
   with `customElements.define(manifest.id, class)`, and the HTML standard requires such a name to
   start with an ASCII lowercase letter and contain a hyphen. Our ids were the graphic's slug -
   lowercase with underscores - so the load failed with
   `"hairline" is not a valid custom element name` before the Graphic was ever mounted. **No NoaCG
   package could load in that renderer at all.** The spec does not say an id must be usable this
   way, but every example graphic the EBU ships has a hyphen in its id, and the reverse-DNS form
   the spec recommends has one too. Ids are now `noacg-<slug>`, and the export gate refuses an id
   `customElements.define` would reject.
2. **Bundled fonts and images resolved against the renderer's directory, not the package.** A
   Graphic is a component inside somebody else's document, so the injected CSS's
   `url("fonts/inter.woff2")` was requested from `/renderer/renderer-layer/fonts/inter.woff2`.
   It 404'd, `font-display: swap` painted the fallback, and the graphic aired in Arial with no
   error anywhere - `document.fonts` reported `Inter: error` and nothing else did. Under SPX and
   CasparCG that same relative path is correct, because there the template *is* the document,
   which is why nothing local had ever caught it. Every relative reference in the injected CSS and
   markup is now resolved against the package's own URL before injection.
3. **Two graphics in one document wrote into each other.** The renderer mounts every layer as a
   Web Component in one document - the arrangement the standard exists for. Our field convention
   is one element per field addressed as `getElementById('fN')`, and those ids are the same in
   every design, so `document.getElementById('f0')` answered with whichever graphic came first:
   updating the Public Notice on layer 1 rewrote the Hairline on layer 0, while the notice's own
   field kept its default. The prior claim here - that different designs cannot collide because
   each carries its own class prefix - was true of the CSS and false of the fields. Each Graphic's
   runtime now runs against a `document` scoped to its own element (the template's code is
   unchanged; only the `document` it sees is), and `dispose()` no longer kills tweens
   document-wide.

### What it confirmed

With those fixed, driven entirely through the external server's API:

- `load` with data, `playAction` walking the default path (`currentStep` 0, then 1, then absent
  once the graphic has gone past the end), `updateAction`, `stopAction`, and `customAction` for a
  graphic whose machine declares `escalate` / `standDown` - all answering `200`.
- `skipAnimation` accepted on play, stop and custom actions.
- An unknown custom action answered **`400`** and our own message came back through the foreign
  host verbatim: `This graphic defines no custom action "no-such-action".`
- The bundled Inter face fetched from inside the package and reported `loaded`.
- Two different graphics on two layers updated independently, each keeping its own field values.
- All 1470 manifests valid against the EBU's schema files. The ajv harness was mutation-tested
  first, so "0 rejected" is a result and not a harness that accepts anything: a vendor field
  without the `v_` prefix, a missing `main`, a `default` typed against its property, a `null`
  where a number belongs, an unknown constraint key, a fractional duration and `stepCount: -2`
  were each rejected with the expected message.

### 2026-08-22: the dual package, in the same renderer

The agent door's workspace (`docs/AGENT_CLI.md` - one folder that is the SPX package AND an OGraf
package, the manifest carrying `v_noacg`) was put through the same server: scaffolded and validated
by the `noacg` CLI against a dev server, zipped, uploaded through the zip endpoint, the renderer
page opened in a browser, every action driven through the HTTP control API. Upload `200` and the
graphic listed as `noacg-football-scoreboard`; the served manifest carried `name`, three
`customActions` (then `flag`, `clearFlag`, `final`; the scoreboard type now exports `goalA`/`goalB`/`clearFlag`/`final`, the goals carrying their score as a schema property and the `+1` as `v_noacg.adjust`) and the `v_noacg` block untouched; `load` with data,
`updateAction`, `playAction`, all three custom actions, `stopAction` and `clear` answered `200`;
the unknown action answered `400` with our message; the frame showed the updated score in the
bundled Inter, so the package-relative font resolved from inside the package. The SPX-layout
sources beside the manifest are simply ignored by the renderer, as the design intends. The walk
also found the bug the gate could not: a scaffold named with `--name` carried the design's own
name in its sources, so the first `validate` regenerated under a second slug and the folder held
two manifests - fixed at the source (the name now lives in `<title>` and the definition), with the
CLI removing a previous name's generated pair when the graphic is retitled.

Two things this round could **not** settle. The renderer drops a Graphic's instance when the layer
is cleared, so it never calls an action after `dispose()` - the `409` for that case remains our own
guarantee rather than something this host exercised. And the community **OGraf DevTool** could not
be run here: it serves graphics through a Service Worker, which the browser used for this round
would not register.

### 2026-08-26: the same claim, checked mechanically

Both rounds above are hand walks, which means they are repeated when somebody remembers to repeat
them. This one is the same claim taken apart into two checks that a machine performs, on a package
the CLI itself produced that day (`noacg scaffold --type scoreboard --design neutral`, then
`noacg validate`), so "the dual package is simultaneously valid" stops resting on 2026-08-22.

**The manifest, against the EBU's published schema files.** All seven fetched from `ograf.ebu.io`
and loaded into ajv (draft 2020-12) - the published files, not `ografSchema.ts`'s transcription of
them. **Valid.** Mutation-tested in the same run so that verdict is a result rather than a rubber
stamp: an un-prefixed vendor field, a missing `main`, a `default` typed against its property, a
`null` where a number belongs, an unknown constraint key, a fractional duration and
`stepCount: -2` were each rejected.

One mutation was **not** rejected, and it is worth writing down because it is a limit of the
standard's schema rather than of the harness: **a duplicate `customActions` id passes the
published schema.** JSON Schema cannot express uniqueness across a keyed array, so nothing in the
spec's own files catches two actions called `goalA`. Our validator does
(`e2e/ograf-conformance.spec.ts` item 2 pins it), and it should keep doing so - a renderer that
registers actions by id would silently lose one, which is the same shape of fault as the id defect
the 2026-08-18 round found.

**The OGraf half alone, read as a stranger's package.** The point of a dual package is that a
renderer can ignore the SPX sources; the way to test that is to delete them. A copy was reduced to
what a renderer actually reads - the manifest, `graphic.mjs`, `js/gsap.min.js`, `fonts/` - and the
root `v_noacg` block was removed too, so nothing marked it as ours. `noacg validate` then read that
copy as a **third-party** OGraf Graphic (the code path that knows nothing about NoaCG templates)
and drove it in the OGraf host: `load`, `updateAction`, all four `customAction`s, `playAction`,
`stopAction`, `dispose` - **nine actions, every one `200`** - and the on-air frame painted in the
bundled Inter, fetched from inside the package rather than from the host page, which is the
2026-08-18 font defect staying fixed.

What this round does not replace: it drives OUR host, so it proves the package satisfies the
contract, not that any given renderer behaves. The external walks above are what covers that, and
this is what makes it cheap to notice when the generated component or the manifest changes shape.

## How conformance is checked

Not by review. `src/export/targets/ografSchema.ts` transcribes the published JSON Schema (all
seven files of it) into a validator, and it runs on every OGraf and LiveOS export before the
manifest is written. `e2e/ograf-conformance.spec.ts` then proves three things on every CI run:

1. every graphic in the catalog produces a manifest with zero violations, in all three export
   intents;
2. the validator actually refuses the mistakes the spec is strict about (an un-prefixed vendor
   field, a `default` typed against its property, a duplicate action id, a duration for an action
   that does not exist, a `main` the package does not contain) **and the ones a renderer is strict
   about that the schema is not** - an id `customElements.define` would reject;
3. a real exported package, served over HTTP and driven like a renderer would drive it, honours
   the lifecycle - including `skipAnimation`, concurrent calls, and the status codes for calling
   an action too early or after `dispose()`;
4. that package's injected CSS points at the package for its fonts and images rather than at the
   host page, and two different graphics mounted in one document leave each other's fields alone;
5. a mounted graphic's timeline CALLS still fire - an operator action is judged on whether the
   graphic painted, not on the 200 it answered.

Items 2, 4 and 5 exist because an external renderer found what the transcription could not: a rule
the schema does not encode is still a rule the operator sees broken. The external round itself is
not automated - it is a hand check whose result is the section above, to be repeated when the
generated Web Component or the manifest changes shape.

### 2026-09-09: a student's own drawing, with behaviour, in the same renderer

Both rounds above drove a package NoaCG designed: a catalog graphic, then a CLI scaffold. The
graphic the 25 September session actually promises is neither. It is an SVG somebody drew in
Illustrator, imported here, carrying behaviour proposed from its own layer names - and it had
never been in a renderer nobody here wrote. `docs/DEMO_2026-09-25.md` beat A7 said so.

The walk is a script now rather than a memory: **`scripts/ograf-external-walk.mjs`**. It drives
the real import door and the real export dialog in the app, uploads the package through the
server's own zip endpoint, opens the renderer page, and drives the graphic only through the
server's HTTP control API. The exact commands, from an empty directory:

```bash
# The renderer, built from source. Not vendored here - it is their release cadence, and a
# pinned copy would only ever check a renderer frozen on the day it was pinned.
curl -sSL -o ograf-server.tar.gz \
  https://codeload.github.com/SuperFlyTV/ograf-server/tar.gz/refs/heads/main
tar -xzf ograf-server.tar.gz
cd ograf-server-main && corepack enable && yarn && yarn build

# The walk. Browser work, so it is enqueued rather than run beside a suite.
npm run queue -- "node scripts/ograf-external-walk.mjs --server <ograf-server-main>"
node scripts/jobs.mjs wait <id>
```

It writes the zip, one PNG per beat and a transcript of every request and response into
`ograf-external-out/`, which is gitignored: the frames are a run's output and are rebuilt by
re-running it. Built here at version 1.0.0 of `ograf-server`, main branch, on Node 24 and
yarn 4.9.1.

Two things about the server that cost an hour and are written down so they do not again: the
renderer page is **`/renderer/default/`**, not `/renderer/renderer-layer/` - its route matcher
reads the renderer's TYPE and the only type it serves is `default` - and `clear` takes
`{filters: [{renderTarget}]}` rather than a bare render target.

#### What it refused: every operator action answered 200 and painted nothing

The board loaded, the bundled Archivo and Inter came from inside the package, `playAction` put
the question and four answers on air, and the render target's layer was the renderer's own. Then
`select`, `lock`, `revealChoice` and `judge` were fired in turn. **All four answered `200`, `judge`
moved `currentStep` from 0 to 1, and the frame never changed.** Thirteen drawn states were in the
DOM and not one ever lit. There was no console error, no rejected promise and no status code
anywhere that said so.

The cause is how a step's lifecycle **calls** and its measured-motion **builders** are resolved:
by NAME, through `window[name]`, never eval - `blocks/animData.ts` states that rule as absolute.
Under SPX and CasparCG the template owns the page, so a top-level `function noacgRepaint()` IS
`window.noacgRepaint` and a bare name is enough. Inside an OGraf Graphic the same code runs inside
`initTemplate()` - which is what scopes each Graphic's `document` to its own element - so those
declarations are LOCAL, the renderer's window has never heard of them, and every call resolved to
`undefined` and was skipped in silence. Nothing local had ever caught it for the same reason the
font defect of 2026-08-18 was never caught locally: under every other target the template IS the
document.

This was never only about imported artwork. **A catalog quiz, a clock, a competition board and a
ticker's measured travel are all equally dead** in an OGraf renderer, and the two earlier rounds
missed it because a scoreboard's custom actions write FIELD text, which travels by the data path
and paints without a timeline call.

The fix is `scopedWindow()` in `src/export/targets/ograf.ts`, the twin of the `scopedDocument()`
the 2026-08-18 round produced: `initTemplate` now takes a `window` as well, the export lists the
names that graphic's timeline can fire (`timelineFunctionNames`, read off its own animation data)
and hands them over after the template's code has declared them. Reads of anything else - gsap,
`getComputedStyle`, the viewport - pass through to the real window; a WRITE lands in the scoped
object, so the SPX definition object and the stage-fit caches a template parks on `window` became
per-graphic too, which closes the same class of collision for `window` that scoping the ids closed
for `document`.

`e2e/ograf-conformance.spec.ts` pins it on every CI run ("a mounted Graphic's timeline calls still
fire"): a catalog quiz is exported, mounted, driven through `customAction('select')`, and the
assertion is that a row is MARKED - not that the action answered 200. It drives with
`skipAnimation` so the verdict never depends on a ticker.

#### The trap that nearly made this round lie, twice

**A browser throttles `requestAnimationFrame` in a page that is not the visible one.** GSAP rides
that clock, so a graphic in a background page freezes part-way through its entrance and never
finishes a state change - which reads exactly like the defect above: the actions answer `200`, the
machine moves, the drawn states never appear. The first two runs of the walk reported a dead board
for that reason alone, and a third, driven the same way in a page that was in front, was correct.

So the fix above is not "the thing that was different when it finally worked". It was isolated by
an A/B in the same foregrounded renderer, one package at a time: the package as this branch emits
it, then the same package with `scopedWindow` stripped back to what `main` emits. Same renderer,
same data, same walk.

| | machine after `select` | drawn states lit |
|---|---|---|
| as `main` emits it | `main/selected` | none |
| with `scopedWindow` | `main/selected` | `answer.selected/B` |

`scripts/ograf-external-walk.mjs` now calls `page.bringToFront()` before it drives and before
every frame, and says why. Anything measuring MOTION in a hidden page is measuring the throttle.

#### What it confirmed, with the fix in

Driven entirely through the external server's HTTP control API, on the imported `quiz-board.svg`:

- upload `200`, listed as `noacg-imported-svg-design`, the served manifest carrying seven fields,
  four custom actions, `stepCount: 2`, measured `actionDurations` and the `v_noacg` hints;
- `load` with the operator's data, then `playAction`;
- `select` carrying `{f6: "B"}` - the Doha row takes the designer's own selected treatment;
- `lock` - the drawn **LOCKED IN** badge appears and the pick stays up, which is the moment
  itself: `answer.selected/B` and `locked` lit together;
- `judge` - Santiago (the key, C) lights as correct and the other three take the wrong
  treatment: `answer.correct/C`, `answer.wrong/A`, `answer.wrong/B`, `answer.wrong/D`;
- `stopAction` and `clear`, both `200`;
- an unknown custom action answered **`400`** with our own message through the foreign host:
  `This graphic defines no custom action "no-such-action".`

Every lit state above was read out of the renderer's own DOM after the action, not judged by eye,
and each was seen on the renderer's page as well. `skipAnimation` is the honest way to photograph
a settled frame while driving from outside the browser, and it is part of the contract rather than
a workaround.

What this round does not settle: the renderer drops a Graphic's instance when its layer is
cleared, so it still never calls an action after `dispose()` - the `409` for that case remains
our own guarantee, exactly as after 2026-08-22.

### 2026-09-10: the walk, run end to end, with the fix in

The round above stopped short: `scopedWindow()` landed as `1ab04a20` and the walk had not been
run to completion since - the confirmation above came from DOM reads and screen viewing during
three partial runs, not from the script exiting green. That gap is now closed.

`npm run queue -- "node scripts/ograf-external-walk.mjs --server <ograf-server-main>"`, queued as
`j-1000` and read to a verdict with `node scripts/jobs.mjs wait j-1000` (exit 0). Built the same
way as the 2026-09-09 round: fetched from `SuperFlyTV/ograf-server` main, `yarn && yarn build`,
Node 24. Every beat in the transcript answered as the contract says it should, including the one
this row exists to settle:

```
ok   the operator actions light the drawn states the designer named
```

The full sequence: upload `200`, `load`, `playAction`, `select` (`answer.selected/B`), `lock`
(`answer.selected/B` and `locked` lit together), `revealChoice`, `judge`
(`answer.correct/C`, `answer.wrong/A`, `answer.wrong/B`, `answer.wrong/D`), an unknown custom
action answering `400` with our own message, `stopAction`, and `clear`. The frames, the uploaded
zip and the full transcript are in `ograf-external-out/` (gitignored, rebuilt by re-running the
walk) - `ograf-external-out/transcript.json` and `ograf-external-out/frames/`.

**Verdict: PASS.** The beat "the operator actions light the drawn states the designer named"
passes against `main` as of `4b7a121f`, with the `bringToFront` fix in and exercised end to end.

### 2026-08-29: the community checker's 83 rules

The EBU schema is the gate; the community's de-facto bar for a *complete* package is the 83-rule
checker at <https://ograf.dev/check>, which goes well past the schema into README/LICENSE/preview
presence, font licensing, shadow-DOM portability and 14 sandboxed runtime rules. All six `/ograf`
starters were put through it, plus a post-production package for the two rules gated on
`supportsNonRealTime`. **The per-rule record is `docs/backlog/ograf-checker-83-rules.md`** - every
one of the 83 with a verdict, and an argument for each finding not acted on. It is a hand check:
the tool is browser-only, so it cannot join CI.

Zero static errors before and after. Three warnings were fixed at the source, each independently
correct rather than a concession: the bundled-font licence moved to `fonts/FONT_LICENSES.md`
(beside the bytes, which is what OFL §2 asks and where two of the rules look), a parameterless
custom action now declares `schema: null` (the published `lib/action.json` says so in words), and
the generated lifecycle methods are declared `async` (they always returned Promises).

Two runtime failures are **the checker's**, argued in full in that file: its harness sends a
custom action's id as `payload.action` where the spec puts a top-level `id`, so every conformant
graphic's actions fail R-12 - and, as a side effect, its R-06 ("an unknown action returns 4xx")
can never fail for anybody. It also calls `load({data})` without the required `renderType`, so a
`goToTime()` seek is refused by our real-time mount, which is the answer that keeps
non-real-time frames deterministic. Both are contribution candidates the day outreach opens
(gated, `docs/OGRAF_ECOSYSTEM.md` §5); neither is a reason to change the export.

`node scripts/ograf-starters-emit.mjs --unpack` rebuilds the six packages headlessly - the page
builds them at click time, which is right for the page and useless for checking.

### The transcription against the published files, weekly

A transcription has one failure mode: it drifts from what it transcribes. That drift is
TIME-driven - it happens when the EBU publishes, never when anyone here commits - so nothing
commit-driven can see it, and the transcription is the export gate, which means drift ships
invalid packages while CI stays green.

`npm run check:ograf-schema` (`scripts/check-ograf-schema.mjs`) is that check, kept rather than
thrown away a third time. It runs in the weekly audit workflow and in `npm run check:freshness`,
never in the build gate, because it fetches ograf.ebu.io and a build must not depend on somebody
else's web server. It reports three things:

1. **Drift** - a sha256 per published file against `scripts/ograf-schema-baseline.json`, the bytes
   `ografSchema.ts` was transcribed from. The seven files are DISCOVERED by following `$ref` from
   the root schema, so a spec revision that splits a file is followed rather than silently skipped.
   Re-record with `--record` after reading the diff.
2. **Corpus** - every `*.ograf.json` in the repo, validated by ajv (draft 2020-12) against the
   published files. `--from <dir>` adds an exported package.
3. **Agreement** - the corpus plus the eight-mutation battery from the 2026-08-26 round, through
   BOTH validators, reporting any disagreement. The duplicate-`customActions`-id case is encoded as
   an EXPECTED disagreement: the published schema structurally cannot express it, ours must, and
   the report goes red if ours ever stops.

First run, 2026-08-29: seven files fetched, corpus clean, all eight mutations behaving exactly as
the hand round recorded them.
