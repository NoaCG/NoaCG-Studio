# What `noacg validate` measures

Every finding is `rule: message`. ERRORs block saving/exporting (the graphic would not play or
would not be editable); WARNINGs are measurements to read and judge. Resolve the cause, not the
message. Rules come from three instruments: the static gate (reads the code), the share-safety
screen (what the code DOES), and the live bench (runs the graphic in a real browser the way
playout will).

## The static gate (`validateTemplate`)

| rule | error/warn | what it checks | how authors resolve it |
|---|---|---|---|
| `files` | error (html/js), warn (css) | a pane is empty | write it |
| `runtime` | error | `play`, `stop`, `update` globals exist (or `spxRenderer.on(`) | define the four globals (contract §3) |
| `definition` | error | `window.SPXGCTemplateDefinition` parses out of the html | the `<script id="spx-template-definition">` with a valid object literal |
| `field-mapping` | warn | a DataField `fN` has no element `id="fN"` in the html | add the element (a hidden holder for input-only values) - the operator's value goes nowhere otherwise |
| `fields` | warn | the definition declares no DataFields | declare what the operator will change |
| `absolute-path` | error | a `/`-rooted `src`/`href`/`url()` | make it relative |
| `external-dependency` | warn (error for sharing) | an `http(s)://` or `//` reference | bundle it (fonts under `fonts/`, images under `images/`) |
| `missing-asset` | warn (error for sharing) | a relative `images/…`/`lottie/…` reference the package does not carry | put the file in the package |
| `syntax` | error | `template.js` does not compile | fix the JS (and keep it ES5) |
| `step-target` | warn | a `stepGroups` selector matches nothing | the selector, or drop the step |
| `machine` | error | the NOACG_ANIM machine is off-shape, or machine data sits under an interpreter that predates it | take the machine from a type scaffold; never hand-edit the interpreter |
| `anim-data` | warn | a `NOACG_ANIM` block exists but does not parse | regenerate from a scaffold, or let validate re-convert the authoring shape |
| `anim-data-target` | warn | a keyframe layer / reveal selector matches nothing | the selector matches an element of your markup (the spine's classes) |
| `anim-data-call` | warn | a step `calls` a function the JS does not define | define it in the runtime outside the markers, or remove the call |
| `anim-data-dynamic` | warn | a measured-motion builder is not defined | same |
| `svg` / `svg-binding` | error | inline SVG with `<script>`, `<foreignObject>`, `on*=`, network hrefs; an SVG-bound field lost its id | remove them; restore the id |
| `preview` | error | the preview threw a runtime error | read the message; it is the template's own exception |

## The share-safety screen (`templateBench`) - what the code DOES

| rule | what it refuses |
|---|---|
| `unsafe-js-network` | `fetch(`, `XMLHttpRequest`, `WebSocket(`, `EventSource(`, `sendBeacon(`, `import(`, `new Worker(`, `serviceWorker` |
| `unsafe-js-code` | `eval(`, `new Function(` |
| `unsafe-js-data` | `document.cookie`, `localStorage`, `sessionStorage`, `indexedDB` |
| `unsafe-js-frame` | reaching `parent` / `top` / `opener` |
| `too-large`, `too-many-assets`, `assets-too-large`, `asset-not-serializable` | >512 KB code, >24 assets, >12 MB of data URLs, a non-string asset |

A template that fails this screen is NOT benched (the bench executes it). A live graphic needs
none of these; data arrives through `update()`.

## The live bench (`benchTemplateRuntime`) - the graphic run the way playout runs it

| rule | error/warn | what it measures | how authors resolve it |
|---|---|---|---|
| `bench-editability` | error (warn on a hand-crafted region) | the studio editability contract: the `.<prefix>-box` spine, a readable `NOACG_ANIM` block, `:root` `--accent`/`--scale` | keep the spine + the `:root` variables; let validate convert your ANIMATION region |
| `bench-binding` | error | `update()` with a marker value reaches each field's element | `update` writes every `fN` into `id="fN"` (text -> textContent, img -> src) |
| `bench-preplay` | error | nothing is visible BEFORE `play()` (a keyed graphic shows nothing before its cue) | the root starts hidden (`opacity: 0` / `visibility: hidden`); `play()` reveals it |
| `bench-entrance` | error | the graphic is on air within 2 s of `play()` | the entrance reveals the root and finishes |
| `bench-overlap` | error (>=25% box overlap) / warn | two text elements collide in the settled state or under stress | give distinct information distinct space (flow/flex + gap, not colliding absolutes) |
| `bench-overflow` | error / warn | text clips at its panel, escapes the canvas, leaves the title-safe area; warn when a line's own mask cuts its end off | `width: fit-content` + a `max-width` cap so text wraps; stay inside the safe area |
| `bench-occluded` | warn | a text element is hidden under another box | stacking/order |
| `bench-unbacked-text` | warn | text sits on nothing (video) - a legibility risk | a plate, a shadow, or accept it deliberately |
| `bench-line-wrap` | warn (opt-in) | an identity line wrapped | shorten, or let it wrap on purpose |
| `bench-type-floor` | warn | a text FIELD renders below the category floor (20px at 1080p; 16px for a corner bug) | larger type |
| `legibility-*` | warn | the on-air design rules: size per role (supporting text under about 24px at 1080p, more strongly under 20px), contrast, protection over video (a panel, glass included, a scrim, a shadow or an outline), safe area | read each message; they are measured numbers |
| `bench-mark-unreadable` | warn | a brand mark's ink does not read on the surface it sits on | the mark's surface/ink |
| `bench-field-unpainted` | warn | a declared text field reaches NO pixel in ANY of the machine's states | the field's element is visible where the operator expects the value to appear. A `hidden` field in a `noacg-data-source` holder is a REPORTED field and is exempt - it is read, never drawn. A field on the `.<prefix>-clock` element is driven with a time, which is what a match clock reads |
| `bench-events-skipped` | warn | the bench pressed fewer than all of the machine's operator arrows (a ceiling of 24, or a from-state it could not enter) and names the ones it left | press them by hand before air, or give the graphic fewer arrows - a control surface an operator can read is smaller than that. A from-state it could not enter is a real defect: an arrow nobody can ever press |
| `bench-hidden` | error | the graphic is off air within 2 s of `stop()` | the exit hides the root and finishes |
| `bench-replay` | error | `play()` after `stop()` is on air again | entrances are `fromTo`, state resets |
| `bench-stress` | error / warn | the three layout checks again with every text doubled and numbers widened | make panels grow/wrap/shrink; the stress frame is what an operator will type |
| `bench-timeout` | error | the whole run exceeded its budget - usually a busy wait at load | event-driven setup only |
| `bench-runtime` | error | the document threw | the template's own exception |

## Readiness rows

`fields` · `lifecycle` · `layout` · `legibility` · `stress` · `editable` · `export` - each PASS /
WARN / FAIL / UNTESTED (untested = the bench did not run). All PASS/WARN = the graphic is
saveable and will play; a FAIL names the row to fix first.

## The frames (`--screenshots <dir>`)

`off.png`, `onair.png`, `stress.png`, then one frame per machine state the graphic's events reach
from the Take (`pp-b.png`, `result-final.png`, `timer-running.png`), each listed with the
`--event` presses that reproduce it. The rules above measure; these frames are for judging, so
open every one. Add `--background video` (or a colour, `checker`, or your own still) to judge
them on the ground they will air on: a transparent PNG shows on white in most viewers. For a
state at a later moment, `noacg screenshot <dir> --event <name>... --at <time> --out <png>`
(a clock 2 minutes on, a timer that ran out). A declared state the walk did not reach (it stops
at three presses) is named after the frames; reach it with `--event`.

Over MCP the same frames come back as images: `{ "command": "validate", "path": "<dir>",
"screenshots": true, "background": "video" }`, and one state with `{ "command": "screenshot",
"path": "<dir>", "events": ["startTimer"], "at": "4s", "background": "video" }`. A frame on a
background is JPEG there (a transparent one stays PNG), and a validate answer carries at most six
state frames, naming the states it left out.
