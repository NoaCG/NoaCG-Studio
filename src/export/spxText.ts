// THE TEXT SPX HANDS A TEMPLATE, put back the way it was typed (issue #788).
//
// SPX 1.4.1 runs every value it plays through `cleanUpString` (utils/spx_server_functions.js): a
// line break becomes `<br>`, then & > < " ' \ become HTML entities. 1.2.1 aired the same
// `&lt;br&gt;`. SPX's own templates set values as HTML, so that renders. NoaCG templates set them
// as TEXT, so `Anna O'Brien & Sons` went on air as `Anna O&#039;Brien &amp; Sons` and a ticker's
// items were joined by a literal `&lt;br&gt;` (docs/SPX_ON_A_REAL_SERVER.md §11).
//
// The script wraps update() and decodes each string value once before the template sees it, so
// every reader of the payload gets the typed text: the field writer, and the runtimes that keep a
// copy (an infographic's count-up target, a scoreboard's changed-value test, the match clocks).
// It acts only in a template that has the contract's `setFieldValue` writer: the NoaCG contract
// writes field values as text and escapes anything it builds with innerHTML, so a decoded value
// still goes in as text. A template without that writer (the blank starter, an imported SPX
// template) sets values as HTML the way SPX expects, and is left exactly as it was.
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
export const SPX_TEXT_JS = `/* SPX sends field values HTML-escaped, with a line break as <br>: hand them over as typed. */
(function () {
  var update = window.update;
  if (typeof update !== 'function' || typeof window.setFieldValue !== 'function') return;
  var CHARS = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#92;': '\\\\' };
  function asTyped(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/&(?:amp|lt|gt|quot|#039|#92);/g, function (entity) { return CHARS[entity]; })
      .replace(/<br>/g, '\\n');
  }
  window.update = function (data) {
    var fields = data;
    if (typeof data === 'string') {
      try { fields = JSON.parse(data); } catch (e) { return update.apply(this, arguments); }
    }
    if (!fields || typeof fields !== 'object') return update.apply(this, arguments);
    var typed = {};
    for (var key in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, key)) typed[key] = asTyped(fields[key]);
    }
    return update.call(this, typeof data === 'string' ? JSON.stringify(typed) : typed);
  };
})();`;

/** The script tag an SPX package appends to the end of the template's body, after js/template.js. */
export function spxTextScript(): string {
  return `<script id="${SPX_TEXT_SCRIPT_ID}">\n${SPX_TEXT_JS}\n</script>`;
}
