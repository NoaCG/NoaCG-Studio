# Phase 2 evidence (2026-10-10)

What phase 2 measured with the shadow mount it built, beyond what the specs assert. The specs
themselves are the gate; this file keeps the readings that are records, not assertions.

## The parity harness, made deterministic

`e2e/_ografParity.ts` mounts each design in four renderer pages (light, light again, shadow, the
studio's own document) on Playwright's page clock, paused, with GSAP's ticker detached and
`gsap.updateRoot` driven from that clock's animation frames, and every CSS animation paused at the
sample's time. Two more things were needed before two light mounts of one build agreed, both found
by measuring on this machine (Chromium 1.61.1 headless shell, one worker):

- **Faces before Play.** With only the clock controlled, `sb01` and `gt01` read 196 to 1,028
  pixels apart between two light mounts: a fit ran at Play against the fallback face in one page
  and the real face in another, because a face loads on the network's time. Loading every declared
  face (`document.fonts`, `FontFace.load()`) and decoding every picture before Play made both 0.
- **A fresh paint before each frame.** Then `aw01`, `ss01`, `vs01`, `qz01` and `sb01` still read
  41 to 6,020 pixels apart, a different page odd out on each run. Their DOM was identical in every
  page, every element's box to four decimals, every inline style, transform, opacity and font, so
  the difference was paint: Chromium moved a layer it had drawn earlier by a fraction of a pixel
  instead of drawing it again (the differences are glyph edges). Disabling LCD text, GSAP's 3D
  transforms (`force3D: false`) and `captureBeyondViewport` changed nothing; hiding and showing
  the stage before each frame made light, light again and shadow 0 pixels apart for every design,
  on two runs.

The studio document is still occasionally noisy (one run of 11 designs read 6 to 11,636 pixels
for six of them, the next run 0 for all). Its frames are a record here (decision 5); before the
flip makes it the reference, the cause needs the same treatment.

## AC-3: parity

Local runs on the final harness, one worker:

| Run | Designs | Not compared | Failing |
|---|---|---|---|
| Default slice (`e2e/ograf-parity.spec.ts`, three units) | 26 | 0 | 0 |
| Catalog units 1 and 2 of 24 (`e2e/catalog/ograf-parity.spec.ts`) | 44 | 0 | 0 |
| SVG corpus units 1 and 2, with the Lottie and stretch probes | 51 | 1 | 0 |

Every compared frame read 0 differing pixels, light against light again and light against
shadow. The one design not compared is `geometry-unescaped-ampersand`, which the import road
refuses on purpose (a bare `&`). About 2.2 to 2.7 seconds per design on one local worker.

On CI (the pull request's catalog job, 4 workers on ubuntu-latest), the whole sweep:

| Run | Designs | Not compared | Failing |
|---|---|---|---|
| Catalog, 24 units | 528 | 2 | 0 |
| SVG corpus, 2 units, with the probes | 51 | 1 | 0 |

Every compared frame read 0 pixels there too. The two catalog designs not compared are `sb21` and
`sb22`, which do not load in the light mount either, on main as on this branch: an OGraf defect
older than the shadow root (https://github.com/NoaCG/NoaCG-Studio/issues/964), listed as a known
exception in the harness. The catalog job took 9.2 minutes for every catalog spec together,
inside its 25-minute cap.

The light-against-studio record varies from run to run (see above), so it is not tabulated here;
the catalog job's log prints each unit's reading.

## AC-5: two copies of one design, in the light mount (recorded, not asserted)

One imported SVG design mounted twice, copy two 960 px to the right; copy one recolours its
gradient white, copy two blue (`e2e/ograf-isolation.spec.ts`):

| | copy one's gradient | copy two's gradient | copy two after copy one is disposed |
|---|---|---|---|
| light | 255, 255, 255 | **255, 255, 255** (copy one's) | 0, 0, 255 |
| shadow | 255, 255, 255 | 0, 0, 255 | 0, 0, 255 |

Each copy's `updateAction` wrote only its own `#f0` in both mounts.

## AC-6: a renderer page's rules, in the light mount (recorded, not asserted)

Differing pixels against the shadow mount on a clean page, per sample (300 ms, 800 ms, landed), on
a renderer page carrying SPX's inherited text settings, a `*` reset and bare element, class and
`!important` rules:

| design | light under the rules | shadow under the rules |
|---|---|---|
| `lt01` | 0, 17,711, 18,041 | under 1,000 (asserted) |
| `sb01` | 11,037, 12,474, 12,474 | under 1,000 |
| `tk01` | 21,969, 22,025, 22,088 | under 1,000 |
| imported SVG | 40,000, 40,000, 40,000 | under 1,000 |

## AC-7: `noacg validate` on a shadow package (by hand, once)

The Hairline's OGraf package built through `addOgrafPackage(..., { mount: 'shadow' })`, and the
same template's light package, each through the locally built CLI against this checkout's dev
server (`NOACG_URL=http://localhost:5228 node cli/dist/index.js validate <zip> --screenshots <dir>`):

```text
hairline-shadow.zip: a third-party OGraf Graphic (noacg-hairline) - manifest conformance + host bench
OK - 0 error(s)
Host: load -> 200, updateAction -> 200, playAction -> 200, stopAction -> 200, dispose -> 200
Operator surface: 2 input(s), 0 button(s), steps 1
```

The light package read the same. The two on-air frames, shot on `--background #1a2633`, differ by
0 pixels; the frame shows the name and title in the design's Inter face beside its accent bar.
