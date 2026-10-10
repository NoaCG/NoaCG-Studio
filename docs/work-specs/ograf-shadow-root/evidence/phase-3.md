# Phase 3 evidence (2026-10-10)

The two renderer walks, run on light packages (the baseline) and shadow packages (the proof), on
the branch's final code on the night of 2026-10-10, one walk at a time. Each run's transcript and
console verdicts are in `phase-3/<renderer>-<mount>/`, with frames where they show something, and
local paths replaced by `<repo>`, `<SPX_1_4_1_source>` and `<ograf-server-main>`.

## SPX 1.4.1 (AC-10)

`node scripts/ograf-spx-walk.mjs --spx <SPX_1_4_1_source> --mount light|shadow`, against the 1.4.1
source build at commit `220dbfa`, Node 24.13, Playwright's Chromium headless. The packages are the
target's own build of Hairline (`lt01`), Clean Quiz (`qz04`), House Scorebug (`sb05`) and Glass
Mark (`bug01`), the shadow ones written again with `addOgrafPackage(..., { mount: 'shadow' })`.

**How a beat is judged.** Each graphic on SPX's `/renderer` is read once it stops moving: its
visible text, and per element its box relative to the template's body, opacity, visibility,
colour, font size and family (`readGraphic` in `scripts/ograf-walk-common.mjs`, read through
`graphicBody`). An init script on the renderer page records every Web Component call SPX sends
the element, with its argument (SPX's own `rundownData` left out). The same package is then
mounted on SPX's blank `/templates/empty.html`, sized as SPX sizes its element, and sent those
calls in order, settling after each one that follows Play. The two readings must be identical.

| Beat | Light | Shadow |
|---|---|---|
| Hairline, Clean Quiz and House Scorebug import on layers 2, 4 and 5 | pass | pass |
| A name saved in the controller goes on air | pass | pass |
| The three on air together, each painting as on the bare page (SPX's `font-size: 3em`, `*` reset and sizing rules do not reach in) | pass | pass |
| Clean Quiz finishes its entrance with the scorebug played 0.3 s into it | pass | pass |
| Select, Lock it in and Reveal correct through SPX's buttons and `spx-custom-actions.js` | pass | pass |
| House Scorebug's clock: `clockStart` runs it (0:01, then 0:03), `clockStop` holds it | pass | pass |
| Continue takes the quiz to its next step; Stop takes Hairline and the quiz off air | pass | pass |
| Glass Mark's file-list picture, picked in SPX's own list, loads from inside the package | pass | pass |
| Two Hairlines on layers 2 and 3 (moved with SPX's layer button), each with its own name; taking the first off air leaves the second identical | pass | pass |
| The renderer page throws nothing until the Update beat | pass | pass |
| Each graphic is in the mount the run asked for (`shadowRoot` absent, present) | pass | pass |

Recorded, unchanged in both mounts, SPX's own:

- **Update does nothing.** The renderer throws `Cannot read properties of null (reading 'value')`
  in its `updateItem()`, the graphic keeps its old name, and the recorded calls show why: after
  Play's `load`, `updateAction` and `playAction`, Update sends the graphic nothing. As §10 of
  docs/SPX_ON_A_REAL_SERVER.md found.
- **A custom action carries no payload.** The controller posts
  `{"command":"customAction","id":"select","webplayout":"4"}`.

**The comparison catches a leak, and only the shadow root holds against it.** With
`--renderer-css "div, span { letter-spacing: 12px !important; }"`, a rule on the renderer page,
the light run failed ten beats (every layout comparison: the three on air, the quiz's actions,
Continue, both Stops, the picture, both copies) and kept the ten that judge text, state and wiring
(`phase-3/spx-light-renderer-css/`). The shadow run with the same rule passed every beat
(`phase-3/spx-shadow-renderer-css/`). SPX's own renderer rules do not reach into a light graphic
either, since the `all: initial` guard of §10, so on SPX the shadow root's gain is against rules a
page adds, as the spikes measured.

## SuperFly.tv ograf-server (AC-9)

`node scripts/ograf-external-walk.mjs --server <ograf-server-main> --mount light|shadow`, against
`SuperFlyTV/ograf-server` main fetched on 2026-10-10 (version 1.0.0, `yarn install` and
`yarn build` with corepack's yarn 4.9.1, Node 24.13). The board is `docs/svg-samples/quiz-board.svg`
through the import wizard and Finish's "Export it" door; the light package is the export window's
download, the shadow one the same graphic built in the page with the mount. The second design is
the catalog's Hairline. Transcripts in `phase-3/superfly-<mount>/`, with the frames of the layer
beats (the renderer page is transparent, so the Hairline's white type does not show in them; its
text is in the transcript's readings).

| Beat | Light | Shadow |
|---|---|---|
| Upload, list, load, play (the graphic in the mount the run asked for) | pass | pass |
| `select`, `lock`, `revealChoice`, `judge` each answer 200 and light the drawn states (`answer.selected/B`, then `locked`, then `answer.correct/B` and three `answer.wrong`) | pass | pass |
| An unknown action answers 400 with our message; stop; clear | pass | pass |
| Two copies on `layer-0` and `layer-1`, each with its own question | pass | pass |
| `select` on copy one lights copy one only; copy two reads identical (text, boxes, lit states) | pass | pass |
| Clearing copy one leaves copy two identical | pass | pass |
| The board and a Hairline on two layers: the Hairline's arrival leaves the board identical, the board's action and its clearing leave the Hairline identical | pass | pass |

The walk sends `judge` its answer key as payload, the second choice (B), which is why B lights
as correct although the board loaded with C: the walk's choice, the same in both mounts.

The light mount passes the two-copies beats here because the board's artwork has no
id-referenced paint; two copies recolouring their own gradients, which the light mount fails,
stay with `e2e/ograf-isolation.spec.ts` (AC-5).

Found while extending the walk: the renderer names a graphic's element `ograf-<id>`
(`getCustomElementName` in renderer-layer's `GraphicsCache.ts`), not the manifest id. The walk
looked the element up by the manifest id, found nothing and read `data-noacg-role` across the
whole page instead, which works in the light DOM and finds nothing inside a shadow root. It now
finds the Graphic on a layer by its `data-noacg-graphic` stamp and the layer div's z-index.

Also found: the walk could not have run since 2026-09-24. It ended the import wizard on
"Create project" and exported from the old editor's Export tab, and both went when the old editor
closed. It now takes Finish's "Export it" door, which saves the graphic and opens the export
window, and downloads from there.
