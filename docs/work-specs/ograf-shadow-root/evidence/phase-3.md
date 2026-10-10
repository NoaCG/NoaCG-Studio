# Phase 3 evidence (2026-10-10)

The two renderer walks, run on light packages (the baseline) and shadow packages (the proof).
Each run's transcript, console verdicts and frames are in `phase-3/<renderer>-<mount>/`, with
local paths replaced by `<repo>` and `<SPX_1_4_1_source>`.

## SPX 1.4.1 (AC-10)

`node scripts/ograf-spx-walk.mjs --spx <SPX_1_4_1_source> --mount light|shadow`, against the 1.4.1
source build at commit `220dbfa`, Node 24.13, Playwright's Chromium headless. The packages are the
target's own build of Hairline (`lt01`), Clean Quiz (`qz04`), House Scorebug (`sb05`) and Glass
Mark (`bug01`), the shadow ones written again with `addOgrafPackage(..., { mount: 'shadow' })`.

**How a beat is judged.** Each graphic on SPX's `/renderer` is read once it stops moving: its
visible text, and per element its box relative to the template's body, opacity, visibility,
colour, font size and family (`readGraphic` in `scripts/ograf-walk-common.mjs`, read through
`graphicBody`). The same package is then mounted on SPX's blank `/templates/empty.html`, sized as
SPX sizes its element, and driven with the calls SPX makes (`load`, `updateAction` and
`playAction` with the item's data, then `playAction()`, `customAction({ id })` or
`stopAction({})`), settling after each. The two readings must be identical.

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
  in its `updateItem()` and the graphic keeps its old name, as §10 of
  docs/SPX_ON_A_REAL_SERVER.md found.
- **A custom action carries no payload.** The controller posts
  `{"command":"customAction","id":"select","webplayout":"4"}`.

**The comparison catches a leak.** With one rule added to the renderer page,
`div, span { letter-spacing: 12px !important; }`, the light run failed ten beats (every layout
comparison: the three on air, the quiz's actions, Continue, both Stops, the picture, both copies)
and kept the ten that judge text, state and wiring. The shadow run with the same rule passed every
beat (`phase-3/spx-shadow-injected-rule/transcript.json`). SPX's own renderer rules do not reach
into a light graphic either, since the `all: initial` guard of §10, so on SPX the shadow root's
gain is against rules a page adds, as the spikes measured.

## SuperFly.tv ograf-server (AC-9)

Not run yet. The source of `SuperFlyTV/ograf-server` main was fetched on 2026-10-10; its
dependencies were not installed in this session.

Found while extending the walk: the renderer names a graphic's element `ograf-<id>`
(`getCustomElementName` in renderer-layer's `GraphicsCache.ts`), not the manifest id. The walk
looked the element up by the manifest id, found nothing and read `data-noacg-role` across the
whole page instead, which works in the light DOM and finds nothing inside a shadow root. It now
finds the Graphic on a layer by its `data-noacg-graphic` stamp and the layer div's z-index.
