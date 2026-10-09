# The graphic package (what a NoaCG graphic is on disk)

One folder that is, at the same time, a valid **EBU OGraf v1** Graphic, the **SPX** package, and
the workspace you edit:

```
<slug>/
  SOURCES - edit these                     GENERATED - never edit; `noacg validate` / `save` rebuild them
    <slug>.html                               <slug>.ograf.json     the OGraf manifest (+ v_noacg)
    css/template.css                          graphic.mjs           the OGraf Web Component wrapping the runtime
    js/template.js                            FIELDS.md             the data contract (id -> field -> type -> default)
    js/gsap.min.js   (bundled, shared)        README.md  GETTING-ON-AIR.md
    images/  fonts/                           controlpanel.html     a local operator page (same-origin channel)
```

- An OGraf renderer reads `<slug>.ograf.json` + `graphic.mjs` (+ `js/gsap.min.js`, `fonts/`,
  `images/`) and ignores the rest. SPX / CasparCG read `<slug>.html` + `css/` + `js/` as an
  ordinary SPX template. NoaCG reads the sources, and the manifest's `v_noacg` block for the
  graphic TYPE; `zip` the folder and it imports through the studio's Import door.
- `v_noacg` (the OGraf standard's vendor-extension mechanism, `v_`-prefixed) carries only what
  plain OGraf cannot express about a NoaCG graphic: `{ format: "noacg-graphic", version: 1,
  type, source: { html, css, js }, sourceHash, generator }`. `sourceHash` is the content hash of the
  three source files when the generated half was written; when you edit sources and skip
  validate, a reader sees the generated half is STALE. There is no NoaCG manifest - the format IS
  OGraf plus SPX.
- The manifest's standard fields are derived from your sources: `schema` from the DataFields (one
  property per `fN`, typed string/number/boolean, `title` from the field title, `hidden` for
  input-only fields, plus a `v_noacg.kind` hint naming the control kind), `customActions` from the
  state machine's operator events (id, name, payload schema), `stepCount`, `actionDurations`
  measured off the NOACG_ANIM data, `renderRequirements` (the authored resolution/fps as `ideal`),
  `thumbnails` from the validate screenshot when one was taken.
- Asset conventions: images at `images/<file>`, fonts at `fonts/<file>`, referenced relatively from
  the html/css (`url("fonts/inter.woff2")`). A font you want is COPIED into `fonts/` and declared
  with `@font-face` in `template.css`; nothing is linked from the network.

`noacg scaffold --out <dir>` writes a complete package; `noacg validate <dir>` regenerates the
generated half after checking the sources; `noacg pack <dirs…> --name N --save` sends several
graphics as ONE package (layers + an optional `--rundown` of cues) to the user's Home →
Productions, where Install makes it a production; `--out <file.noacgpack.json>` writes the same
package as a file for the studio's Import a package card.
