# How SPX wants an HTML template

This is our working reference for the SPX Graphics HTML template format, derived from the official
examples in [`example_projects/`](../example_projects/) (the premium **Template_Pack_1.1** and the
simple **bw_simple** project) and from docs.spxgraphics.com. The builder generates code that follows
this format. Keep this file in sync if SPX changes.

> TL;DR — An SPX template is a plain HTML file that (1) defines a global
> `window.SPXGCTemplateDefinition` object describing the operator's data fields, and (2) exposes
> global `play()`, `stop()`, `update(data)`, and `next(data)` functions. SPX calls `update(data)`
> with a JSON string; your code writes those values into the DOM.

---

## 1. File anatomy

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My graphic</title>

  <!-- Animation library, bundled locally (no internet on the playout machine). -->
  <script src="js/gsap.min.js"></script>

  <!-- Styles + logic. In SPX these are separate files; the builder can inline them for preview. -->
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>

  <!-- The template definition: what the operator sees + playout settings. -->
  <script id="spx-template-definition" type="text/javascript">
  window.SPXGCTemplateDefinition = { /* ...see below... */ };
  </script>
</head>
<body>
  <!-- Your visible graphic. Each data field "fN" maps to one element with id="fN". -->
  <div id="graphic">
    <div id="f0">Firstname Lastname</div>
    <div id="f1">Title / role</div>
  </div>
</body>
</html>
```

All paths are **relative** (`js/…`, `css/…`, `assets/…`) so the folder is portable. The canvas is
sized in CSS to the output resolution (e.g. `1920×1080`) with a `transparent` background — broadcast
graphics render over video.

---

## 2. `SPXGCTemplateDefinition`

A single global object. Top-level keys are **playout settings**; `DataFields` is the array of
operator inputs.

```js
window.SPXGCTemplateDefinition = {
  "description": "Lower third",   // name shown in SPX
  "playserver":  "OVERLAY",       // target play-out server
  "playchannel": "1",             // CasparCG channel
  "playlayer":   "1",             // layer (higher = on top)
  "webplayout":  "1",             // web renderer/output id
  "out":         "manual",        // "manual" | "none" | milliseconds (auto-out)
  "steps":       "1",             // number of animation PHASES; >=2 enables Continue/next()
  "dataformat":  "json",          // how data is passed to update() — normally "json"
  "uicolor":     "7",             // color label for the template card (cosmetic, "1".."7")
  "DataFields": [
    { "field": "f0", "ftype": "textfield", "title": "Name",  "value": "Firstname Lastname" },
    { "field": "f1", "ftype": "textfield", "title": "Title", "value": "Title / role" }
  ]
};
```

#### Counting `steps` (the one that is easy to get wrong)

`steps` counts **phases**, not button presses. Phase 1 is the in-animation; phases 2..n are the
ones an operator reaches with **Continue**. The exit is not a phase — Stop plays it. So:

| The graphic | `steps` | Continue presses |
|---|---|---|
| plain in / out | `"1"` | 0 (Continue disabled) |
| in → reveal → out | `"2"` | 1 |
| in → reveal A → reveal B → out | `"3"` | 2 |

**Presses = `steps` − 1.** This project derives the value rather than authoring it:
`blocks/animMachine.ts` `spxSteps()` = the default path's length − 1, which is the same number
(the path's last waypoint is the exit, reached by `stop()`).

### DataField keys

| Key           | Meaning |
|---------------|---------|
| `field`       | Unique id, usually `f0`, `f1`, …  Links the input to a DOM element (see §4). |
| `ftype`       | The kind of input SPX shows the operator (see table below). |
| `title`       | Label shown next to the input in the SPX rundown. |
| `value`       | Default / example value. |
| `prvar`       | Optional "project variable" name shared across templates. |
| `items`       | For `dropdown`: array of `{ "text": "...", "value": "..." }`. |
| `assetfolder` | For `filelist`: folder to list files from (e.g. `"./themes/"`). |
| `extension`   | For `filelist`: file extension filter (e.g. `"css"`). |

A field can also be informational only (no `field` id), e.g. an `instruction` or `divider`.

### ftypes

| ftype         | Operator sees |
|---------------|---------------|
| `textfield`   | Single-line text |
| `textarea`    | Multi-line text |
| `number`      | Numeric input |
| `dropdown`    | Select from `items` |
| `filelist`    | Pick a file from `assetfolder` |
| `checkbox`    | Boolean toggle |
| `color`       | Color picker |
| `button`      | Triggers a template function (`fcall`) |
| `instruction` | Read-only help text |
| `caption`     | Section caption |
| `hidden`      | Stored but not shown |
| `divider` / `spacer` | Visual separators in the form |

---

## 3. Runtime functions

SPX (via CasparCG / the web renderer) calls these **global** functions. Define them in
`js/template.js`:

| Function        | When SPX calls it | Typical job |
|-----------------|-------------------|-------------|
| `update(data)`  | When data is sent (and before play) | Parse `data` (a JSON string) and write values into the DOM. |
| `play()`        | Take the graphic **on air** | Animate in. |
| `stop()`        | Take the graphic **off air** | Animate out. |
| `next(data)`    | Advance a multi-step graphic (`steps` >= 2) | Go to the next state. |

`data` is a **JSON string**, e.g. `{"f0":"Ada","f1":"Engineer"}`. Always `JSON.parse` it (guard for
non-JSON in case the renderer sends an empty/placeholder value).

---

## 4. How field data reaches the DOM

**SPX does not write to the DOM itself — your `update()` does.** The link between a `DataField` and
an element is entirely your choice. Two conventions exist:

### Direct ids (what this builder uses — simplest)

Give the visible element `id="fN"` and write straight into it:

```html
<div id="f0">Firstname Lastname</div>
```
```js
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);   // field "f0" -> element id="f0"
    if (el) el.innerHTML = fields[key];
  }
}
```

An input-only value (e.g. a countdown duration) can live in a hidden element the template reads:
`<div id="f1" style="display:none">300</div>`.

### Split style (`#fN` → `#fN_gfx`) — used by the premium Template Pack

SPX writes into a hidden holder `#fN`, then a `runTemplateUpdate()` step copies it (often via
`htmlDecode`) into a separate **display** element `#fN_gfx`. This buys you `htmlDecode`,
hide-empty-field logic, and animating the display element independently — at the cost of more code:

```html
<div id="f0_gfx"></div>          <!-- visible -->
<div id="f0" style="opacity:0"></div>  <!-- SPX writes here -->
```
```js
function runTemplateUpdate() {
  e('f0_gfx').innerHTML = htmlDecode(e('f0').innerText);
}
```

Use the split style only when you need those extra behaviors; otherwise prefer direct ids.

---

## 5. Helpers seen in real templates

The premium pack ships a `js/spx_interface.js` with small utilities (not required, but handy):

- `e(id)` → `document.getElementById(id)`
- `htmlDecode(txt)` → decode HTML entities in operator text
- `validString(str)` → false for `""`, `"undefined"`, `"null"`
- GSAP frame-rate sync to the renderer:
  ```js
  if (window.top.spxRenderer && window.top.spxRenderer.fps) {
    gsap.ticker.fps(window.top.spxRenderer.fps);
  }
  ```
- Error reporting via `window.onerror`.

---

## 6. Packaging checklist

- HTML, CSS, and JS files exist; `play()`, `stop()`, `update(data)` are defined.
- `window.SPXGCTemplateDefinition` is present and valid.
- Every data `field` that should show maps to a DOM element `id` (direct-id convention).
- All asset paths are **relative** (`assets/…`, `js/…`, `css/…`).
- Dependencies (GSAP, fonts) are **bundled locally** — no internet at playout.
- The graphic renders on a transparent canvas at the intended resolution.

---

## 7. Real-world dialects (measured from production templates)

A 2026-08 sweep of ~200 real production templates (broadcaster shows, orchestra packages, SmartPX's
own packs — the local `spx_examples/` corpus, `docs/SPX_EXAMPLES_CORPUS.md`) shows how far
templates in the wild drift from the clean form above. **The importer and validator must
accept all of this; the generator emits none of it.**

**Definition syntax is loose.** The object literal appears in `<head>`, in `<body>`, even
after `</body>`; keys quoted or unquoted; trailing commas everywhere. Header comments name
`SPXGCTemplateDefinition` in prose *before* the real assignment, so parsing must anchor on
the assignment, not the first mention (`model/spxDefinition.ts` does; the corpus is what
caught it).

**Settings in practice.** `playserver` is `"OVERLAY"` essentially always (`"-"` marks a
non-graphic device-command item); `webplayout` always equals `playlayer`; `out` is
`"manual"` almost everywhere. `steps` semantics vary wildly: `"1"` as default noise,
`"2"` with a real phase machine, and `"500"`/`"999"`/`"9999"` meaning "unbounded
Continue" — where `next()` sometimes *re-fetches data* rather than advancing.

**The hidden-holder pattern dominates** (~70% of corpus files): `update()` writes invisible
holder elements, a template-owned `runTemplateUpdate()` composes the visible DOM (§4's
split style, generalized — target ids are arbitrary, not just `fN_gfx`). In the newest
lineage **`update()` drives the IN animation and `play()` is a no-op** (SPX sends
update-then-play), usually behind a 50–200 ms "let the DOM settle" `setTimeout`; the older
lineage animates from `play()`. Assume neither.

**Data quirks.** CasparCG delivers `"undefined"`/`"null"` as literal strings — every robust
template guards for them. Multi-line textarea values arrive with literal `<br>` separators,
so parsers split on `"<br>"` (after an `htmlDecode` round-trip), never `"\n"`.

**Fields beyond the table above.** Reserved names: `comment` (rundown item label, no DOM
element) and `epochID` (SPX-injected item id — templates use it to stop their own rundown
item via `fetch('/api/v1/item/stop/' + id)` when a credits roll finishes). `f99` is a
de-facto theme-selector convention (a `filelist` over `./themes/*.css` repointing a
`<link>`). Non-`fN` named fields ship too (`pos`, `styleSelector`). `instruction` and
`spacer` entries legitimately have **no `field` key at all**. `dropdown` item values are
chosen to be directly usable as CSS values or class names. `button` + `fcall` calls an
arbitrary global. Definitions may also carry `function_onPlay`/`function_onStop`
(`"Name|param|delayMs|field"`) invoking server-side SPX extensions.

**No text auto-fit exists in the wild.** Overflow is handled by measured marquee scroll
(duration ≈ overflow px × 6–8 ms), char-count truncation, or plain clipping — our
runtime bench and auto-fit are stricter than production practice, which is intentional.

---

### Sources
- `example_projects/Template_Pack_1.1/` — official premium pack (split `#fN`/`#fN_gfx` style,
  `js/spx_interface.js` runtime).
- `example_projects/bw_simple/` — minimal template writing data straight into `.f0`/`.f1`.
- docs.spxgraphics.com — Graphic Templates / Formats / HTML, and the "My first HTML template" guide.
- `spx_examples/` (local-only, licence-restricted) — ~200 real production templates;
  analysis and exemplar index in `docs/SPX_EXAMPLES_CORPUS.md`, coverage measured by
  `scripts/spx-corpus-sweep.mjs`.
