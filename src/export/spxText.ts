// THE TEXT SPX HANDS A TEMPLATE, put back the way it was typed (issue #788).
//
// SPX runs every value it plays through `cleanUpString` (utils/spx_server_functions.js, since SPX
// 1.3.2): a line break becomes `<br>`, then & > < " ' \ become HTML entities. SPX's own templates
// set values as HTML, so that renders. NoaCG templates set them as TEXT, so `Anna O'Brien & Sons`
// went on air as `Anna O&#039;Brien &amp; Sons` and a ticker's items were joined by a literal
// `&lt;br&gt;` (measured on SPX 1.4.1 and 1.2.1, docs/SPX_ON_A_REAL_SERVER.md §11).
//
// The undo sits at the TEXT SINK, not in update(): the script wraps the template's
// `setFieldValue(el, value)`, the one writer the NoaCG contract has every update() use (text into
// textContent, a path into an <img> or SVG <image>). So a decoded value only ever goes in as text
// or as a path, never into innerHTML, and a template without that writer (the blank starter or an
// imported SPX template, which set values as HTML the way SPX expects) is left exactly as it was.
//
// Decoding reverses SPX's escaping exactly once, so text that arrives through SPX comes out as
// typed, even text that itself looked like an entity. A value that did NOT come through SPX (the
// bundled control panel, a CasparCG client) is decoded too; only text typed as a literal entity or
// a literal <br> changes there, which is the price of one rule for every caller.
//
// ES5, for CasparCG 2.3.x's Chromium 71 (SPX can play a template there). Dependency-free, so
// scripts/spx-text.test.mjs runs it in Node. Stripped on import by its id, like the Continue guard.

export const SPX_TEXT_SCRIPT_ID = 'noacg-spx-text';

/** The runtime, as the body of a classic script. */
export const SPX_TEXT_JS = `/* SPX sends field values HTML-escaped, with a line break as <br>: write them as typed. */
(function () {
  var write = window.setFieldValue;
  if (typeof write !== 'function') return;
  var CHARS = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#92;': '\\\\' };
  function asTyped(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/&(?:amp|lt|gt|quot|#039|#92);/g, function (entity) { return CHARS[entity]; })
      .replace(/<br>/g, '\\n');
  }
  window.setFieldValue = function (el, value) {
    return write.call(this, el, asTyped(value));
  };
})();`;

/** The script tag an SPX package appends to the end of the template's body, after js/template.js. */
export function spxTextScript(): string {
  return `<script id="${SPX_TEXT_SCRIPT_ID}">\n${SPX_TEXT_JS}\n</script>`;
}
