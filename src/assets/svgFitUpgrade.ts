// THE SCORE-SIZE FIX FOR GRAPHICS SAVED BEFORE IT (#2355).
//
// An imported SVG carries its text-fit runtime as code, written into the graphic when it was
// imported (templates/importedDesign/runtime/svgFit.js), and nothing rebuilds a saved graphic from its
// SVG. So a scoreboard imported before #2355 kept the fit that painted "10" at 59% of its drawn size
// and "100" at 37%. This swaps the two passages #2355 changed, and only when the graphic carries both
// exactly as that runtime wrote them: any other text (a newer runtime, an older one, an author's own
// edit) is left as it is. Every preview, save and export applies it through prepareOutRuntime
// (blocks/animMigration.ts). The new passages are pinned against the live runtime by
// scripts/svg-fit-upgrade.test.mjs, so the two cannot drift apart.

/** The panel search before #2355: a line held by its full font box. */
export const SVG_FIT_CONTAINER_V1 = "function svgFitContainer(el) {\n  var art = document.querySelector('.imported-design-art');\n  if (!art) return null;\n  var box = el.getBoundingClientRect();\n  var shapes = art.querySelectorAll('rect, path, polygon, ellipse, circle');\n  var best = null;\n  var bestArea = 0;\n  for (var i = 0; i < shapes.length; i++) {\n    var r = shapes[i].getBoundingClientRect();\n    // Contains the line, and is genuinely bigger than it - a highlight rule under a word is\n    // not the panel the word sits in.\n    if (r.left > box.left + 1 || r.right < box.right - 1) continue;\n    if (r.top > box.top + 1 || r.bottom < box.bottom - 1) continue;\n    if (r.width * r.height <= box.width * box.height) continue;\n    if (!best || r.width * r.height < bestArea) { best = shapes[i]; bestArea = r.width * r.height; }\n  }\n  return best;\n}\n\n";

/** The panel search since #2355, with the two helpers it brought: held by the em box. */
export const SVG_FIT_CONTAINER_V2 = "function svgFitContainer(el) {\n  var art = document.querySelector('.imported-design-art');\n  if (!art) return null;\n  var box = el.getBoundingClientRect();\n  // HELD BY ITS EM BOX, NOT ITS LINE BOX. A text's rectangle runs from the font's ascent to its\n  // descent - about one and a half ems in Oswald - and a figure drawn big in a snug plate is\n  // the normal case for a score: the downloadable scoreboard's 60px \"0\" sits in a 90px plate\n  // with its ink well inside, and its line box poked 2.7px over the top. The line then had NO\n  // panel, its room was its own drawn width, and \"10\" painted at 59% of its size.\n  var trim = svgEmTrim(el);\n  var top = box.top + trim;\n  var bottom = box.bottom - trim;\n  var shapes = art.querySelectorAll('rect, path, polygon, ellipse, circle');\n  var best = null;\n  var bestArea = 0;\n  for (var i = 0; i < shapes.length; i++) {\n    var r = shapes[i].getBoundingClientRect();\n    // Contains the line, and is genuinely bigger than it - a highlight rule under a word is\n    // not the panel the word sits in.\n    if (r.left > box.left + 1 || r.right < box.right - 1) continue;\n    if (r.top > top + 1 || r.bottom < bottom - 1) continue;\n    if (r.width * r.height <= box.width * box.height) continue;\n    if (!best || r.width * r.height < bestArea) { best = shapes[i]; bestArea = r.width * r.height; }\n  }\n  return best;\n}\n\n/** How far, in screen px, a line's box overhangs its EM box at each of its top and bottom: half\n *  of what the font's ascent plus descent adds to the type size. Zero where it cannot be read. */\nfunction svgEmTrim(el) {\n  // The size of the run holding the first character, which is the one the cell is read off: an\n  // exporter often sizes the inner tspan and leaves the text at the default.\n  var run = el;\n  while (run.firstElementChild) run = run.firstElementChild;\n  var size = parseFloat(getComputedStyle(run).fontSize) || 0;\n  var cell = el.getNumberOfChars && el.getNumberOfChars() > 0 ? el.getExtentOfChar(0).height : 0;\n  var ctm = el.getScreenCTM ? el.getScreenCTM() : null;\n  var scale = ctm ? Math.sqrt(ctm.a * ctm.a + ctm.b * ctm.b) : 1;\n  return Math.max(0, (cell - size) / 2) * (scale || 1);\n}\n\n/** A FIGURE: a value of digits and the marks a score or a clock carries, and no letters. */\nfunction svgIsFigure(value) {\n  var s = String(value == null ? '' : value);\n  return /[0-9]/.test(s) && !/[^0-9\\s:.,'+%\\u2212\\u2013-]/.test(s);\n}\n\n";

/** A centred line's room before #2355: half its type kept as a margin, figures included. */
export const SVG_FIT_CENTRED_V1 = "        var open = svgReach(align.h, align.anchor, box, halfType);\n";

/** Since #2355: a figure keeps no margin but its own bearings. */
export const SVG_FIT_CENTRED_V2 = "        var margin = svgIsFigure(svgFitDrawn[el.id]) ? 0 : halfType;\n        var open = svgReach(align.h, align.anchor, box, margin);\n";

/** The saved graphic's code with the score-size fix, or the code unchanged where it does not carry
 *  both pre-#2355 passages exactly. */
export function upgradeSvgFitRuntime(js: string): string {
  const normalized = js.replace(/\r\n/g, '\n');
  if (!normalized.includes(SVG_FIT_CONTAINER_V1) || !normalized.includes(SVG_FIT_CENTRED_V1)) return js;
  return normalized.replace(SVG_FIT_CONTAINER_V1, () => SVG_FIT_CONTAINER_V2).replace(SVG_FIT_CENTRED_V1, () => SVG_FIT_CENTRED_V2);
}
