---
v: 2
source: derived
kind: finding
raised: 2026-10-02
state: unstarted
found: "SPX HTML-escapes every field value it plays (and turns a newline into <br> first), and NoaCG templates show the escaped text: O'Brien & Sons went on air as O&#039;Brien &amp; Sons on SPX 1.4.1, and a ticker's items were joined by a literal &lt;br&gt; on 1.4.1 and 1.2.1 (docs/SPX_ON_A_REAL_SERVER.md §11)"
serves: NOW
size: small
touches: src/templates/shared/base.ts
needs-owner: none
---

# Field values with ' & < > " or a line break show as HTML entities in SPX

**Filed:** 2026-10-02. **Source:** the SPX rundown walk, [`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §11.

## Why

A name like O'Brien, a title with "&", or a ticker with more than one item goes on air wrong in
every NoaCG graphic played from SPX, by any route that hands SPX the values: the exported rundown,
values typed in SPX's own controller, or the template's defaults. The operator sees the right text
in SPX and the wrong text on air.

## What it would take

- SPX 1.4.1 runs every played value through `cleanUpString` (`utils/spx_server_functions.js`):
  `\n` becomes `<br>`, then `&`, `<`, `>`, `"`, `'` and `\` become entities. SPX's own templates
  set the values as HTML, so the entities and the `<br>` render; NoaCG's set text.
- Decode the entities in the template's SPX data path (`update()` in the shared template base), and
  turn `<br>` back into the line break the field held, only for values arriving from SPX, so a
  value typed with a literal `&amp;` elsewhere is not changed. The output embed already undoes
  `&amp;` for its URL field (`src/export/outputEmbed.ts`); that would become one shared rule.
- Recheck on both servers with a name containing `'` and `&`, and a two-item ticker.

## Evidence

- Measured on SPX 1.4.1: Hairline with f0 `Anna O'Brien & Sons` and f1 `Line one\nLine two <b>`
  rendered `Anna O&#039;Brien &amp; Sons` and `Line one&lt;br&gt;Line two &lt;b&gt;`.
- News Strip's default items (one per line) showed `&lt;br&gt;` between items on 1.4.1 and 1.2.1.
