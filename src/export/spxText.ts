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
// It decodes every value in a template that has the contract's `setFieldValue` writer: the NoaCG
// contract writes field values as text and escapes anything it builds with innerHTML, so a decoded
// value still goes in as text. A template without that writer (the blank starter, an imported SPX
// template) sets values as HTML the way SPX expects, and its text values are left exactly as they
// were. A filelist value is decoded in every template: it is a file's path, never markup, and SPX
// escapes it all the same. The Picture graphic (templates/picture.ts) sets its path as the src
// attribute without that writer, so a picked `Q&A.jpg` arrived as `Q&amp;A.jpg` and the picture
// was blank on air (issue #888). The exporter names the filelist fields from the template's
// definition, so a Picture saved in a production, which keeps the runtime it was made with, is
// covered too.
//
// Decoding reverses SPX's escaping exactly once, so text that arrives through SPX comes out as
// typed, even text that itself looked like an entity. A value that did NOT come through SPX (the
// bundled control panel, a CasparCG client) is decoded too; only text typed as a literal entity or
// a literal <br> changes there, which is the price of one rule for every caller.
//
// Every SPX-layout package carries it, and so does the CasparCG single file, whose guide says how
// to play it from SPX. It is always its own script tag at the end of the body, never part of the
// template's JS, so the import door strips it by its id and a re-exported graphic carries it once:
// a second copy would decode twice and turn a typed `&amp;` into `&`.
//
// The OGraf package gets the same treatment from SPX 1.4, which escapes an OGraf item's values
// the same way before handing them to load() and updateAction() (issue #1047). Its wrapper
// (targets/ograf.ts) embeds SPX_TYPED_JS below, the same rule, and applies it only when SPX's own
// `rundownData` came with load(), so another OGraf renderer's values are left as they were sent.
//
// ES5, for CasparCG 2.3.x's Chromium 71 (SPX can play a template there). Dependency-free, so
// scripts/spx-text.test.mjs runs it in Node.

import type { SpxTemplate } from '../model/types';

export const SPX_TEXT_SCRIPT_ID = 'noacg-spx-text';

/** The rule, as one ES5 declaration of the only name it adds: `spxTyped(fields, asText, files)`
 *  returns a copy of `fields` with SPX's escaping undone once in every string value when `asText`
 *  (the template writes values as text), and in the `files` (filelist field ids) always. */
export const SPX_TYPED_JS = `var spxTyped = (function () {
  var CHARS = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#92;': '\\\\' };
  function asTyped(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/&(?:amp|lt|gt|quot|#039|#92);/g, function (entity) { return CHARS[entity]; })
      .replace(/<br>/g, '\\n');
  }
  return function (fields, asText, files) {
    var typed = {};
    for (var key in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
      typed[key] = asText || files.indexOf(key) !== -1 ? asTyped(fields[key]) : fields[key];
    }
    return typed;
  };
})();`;

/** The runtime, as the body of a classic script. `fileFields` are the ids of the template's
 *  filelist fields, whose paths are decoded whatever writer the template has. */
export function spxTextJs(fileFields: string[] = []): string {
  // JSON inside a script element: no field id may close the tag.
  const files = JSON.stringify(fileFields).replace(/</g, '\\u003c');
  return `/* SPX sends field values HTML-escaped, with a line break as <br>: hand them over as typed. */
(function () {
  var update = window.update;
  var asText = typeof window.setFieldValue === 'function';
  var FILES = ${files};
  if (typeof update !== 'function' || (!asText && !FILES.length)) return;
${SPX_TYPED_JS.replace(/^/gm, '  ')}
  window.update = function (data) {
    var fields = data;
    if (typeof data === 'string') {
      try { fields = JSON.parse(data); } catch (e) { return update.apply(this, arguments); }
    }
    if (!fields || typeof fields !== 'object') return update.apply(this, arguments);
    var typed = spxTyped(fields, asText, FILES);
    return update.call(this, typeof data === 'string' ? JSON.stringify(typed) : typed);
  };
})();`;
}

/** The runtime for a template without filelist fields. */
export const SPX_TEXT_JS = spxTextJs();

/** The script tag a package appends to the end of the template's body, after the template's JS. */
export function spxTextScript(template: Pick<SpxTemplate, 'fields'>): string {
  const files = template.fields.filter((f) => f.ftype === 'filelist').map((f) => f.field);
  return `<script id="${SPX_TEXT_SCRIPT_ID}">\n${spxTextJs(files)}\n</script>`;
}
