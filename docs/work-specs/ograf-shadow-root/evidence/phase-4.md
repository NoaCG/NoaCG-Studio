# Phase 4 evidence (2026-10-11)

The flip: the shadow root is the only mount. Both renderer walks ran on this branch at `031dfb585`
(the wrapper, `src/export/targets/ograf.ts`, is unchanged since `8b7a2d361`), one walk at a time.
Each run's console verdicts and transcript are in `phase-4/<renderer>/`, with frames where they
show something, and local paths replaced by `<repo>`, `<SPX_1_4_1_source>` and
`<ograf-server-main>`. How a beat is judged is unchanged from `phase-3.md`; the walks no longer
take `--mount`, and the packages are the exporter's own.

## SPX 1.4.1 (AC-10)

`node scripts/ograf-spx-walk.mjs --spx <SPX_1_4_1_source>`, against the 1.4.1 source build at
`220dbfa`, Node 24.13, Playwright's Chromium headless. Hairline (`lt01`), Clean Quiz (`qz04`),
House Scorebug (`sb05`) and Glass Mark (`bug01`), built by `ografTarget.build` in the app page.

| Run | Judged beats | Result |
|---|---|---|
| Plain renderer (`phase-4/spx/`) | 20 | all pass |
| `--renderer-css "div, span { letter-spacing: 12px !important; }"` (`phase-4/spx-renderer-css/`) | 20 | all pass |

The beats are phase 3's: the three graphics on layers 2, 4 and 5 as imported, painting as on a
bare page; a saved name on air; the quiz's entrance surviving the scorebug's Play; Select, Lock
and Reveal correct through SPX's buttons and `spx-custom-actions.js`; the scorebug's clock
started and stopped; Continue and both Stops; Glass Mark's file-list picture loading from inside
the package; two Hairline copies on layers 2 and 3 each with its own name, the second left
exactly as it was when the first goes off air; and nothing thrown on the renderer page until the
Update beat. Each graphic is in its own shadow root (`true, true, true`).

SPX's own gaps read as before: Update sends the graphic nothing and the renderer throws
`Cannot read properties of null (reading 'value')` in `updateItem()`, and a custom action carries
no payload (`{"command":"customAction","id":"select","webplayout":"4"}`).

## SuperFly.tv ograf-server (AC-9)

`node scripts/ograf-external-walk.mjs --server <ograf-server-main>`, against the main build of
2026-10-10 (version 1.0.0, Node 24.13). The board is `docs/svg-samples/quiz-board.svg` through the
import wizard, Finish's "Export it" door and the export window's own download, which now builds
the shadow package; the second design is the catalog's Hairline (`phase-4/superfly/`).

**30 beats, all pass**: upload, load and play with the graphic in its own shadow root; `select`,
`lock`, `revealChoice` and `judge` each answering 200 and lighting the drawn states; an unknown
action's 400; stop and clear; two copies of the board on two layers, each with its own question,
copy one's action and its clearing leaving copy two exactly as it was; the board and a Hairline on
two layers, each arrival, action and clearing leaving the other as it was.

## AC-11: the parity sweep against the studio document

On #985's CI, the catalog job's whole-catalog sweep (528 designs in 24 units) and the SVG corpus
(51, with the Lottie and stretch probes):

| Run | Not compared (studio unstable) | Failing | Known exceptions |
|---|---|---|---|
| Before the harness fixes (nightly on main, light against studio, recorded only) | - | 167 of the 528 differ from the studio | - |
| `8b7a2d361`: the iframe's GSAP on the host page's frames | 9 | 15 | `sb21`, `sb22` |
| `0104dac12`: the studio document on the host page's clock | 0 | 5 (`pl01`, `pl02`, `tt01`, `tt02`, `ig04`) | `sb21`, `sb22` |
| `169466748` and after: the five listed (#986) | 0 | 0 | `sb21`, `sb22` (#964); the five (#986) |

Catalog units only; in the SVG corpus every run refuses `geometry-unescaped-ampersand` at import, on purpose, and compares the rest clean. The five count-up
designs read the same pixel counts on every run (`pl01` 2101 at 300 ms, `tt01` 1316 at 800 ms,
`ig04` 36 and 2178), on main with the light mount as well, and match on Windows; one of them
matched on Linux in the default slice, where it follows other designs on the renderer page, so the
difference depends on what the page mounted earlier (#986).

## Not done

The ograf.dev community checker was not re-run by hand on a starter (the spec lists it as
evidence, not a gate). The phase 3 walk folders `noacg_walk_light`, `noacg_walk_shadow` and the
projects `NoaCG_Walk_light`, `NoaCG_Walk_shadow` are still in the local SPX install; the walk now
writes `noacg_walk` and `NoaCG_Walk`.
