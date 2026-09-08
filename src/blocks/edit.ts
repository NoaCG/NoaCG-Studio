// Small, deterministic helpers used by building blocks to edit the visible template code.
// Blocks return readable, well-commented code so users learn from the result.

import { replaceDefinitionInHtml } from '../model/spxDefinition';
import { detectPrefix } from '../model/structure';
import { lineClassFor } from '../templates/shared/standard';
import type { SpxField, SpxTemplate, TemplateLayer } from '../model/types';

/** Next free field id (f0, f1, f2...) given the current fields. */
export function nextFieldId(fields: SpxField[]): string {
  let max = -1;
  for (const f of fields) {
    const m = /^f(\d+)$/.exec(f.field);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `f${max + 1}`;
}

/** Insert an HTML snippet just before </body>. */
export function insertGraphicHtml(html: string, snippet: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${snippet}\n</body>`);
  }
  return html + snippet;
}

/** Append a CSS block (with a comment header) to the stylesheet. */
export function appendCss(css: string, header: string, body: string): string {
  return `${css}\n\n/* ${header} */\n${body}\n`;
}

/** Append a JS block (with a comment header) to the template script. */
export function appendJs(js: string, header: string, body: string): string {
  return `${js}\n\n// ${header}\n${body}\n`;
}

/** Add a field to the definition and re-serialize it back into the HTML. */
export function addFieldToDefinition(template: SpxTemplate, field: SpxField): SpxTemplate {
  const fields = [...template.fields, field];
  const html = replaceDefinitionInHtml(template.html, template.settings, fields);
  return { ...template, html, fields };
}

/** Minimal HTML text escaping for content written into an element's body. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** One catalog-line add: the patched template plus the minted field id (the caller selects
 *  the new layer with it). */
export interface CatalogLineAdd {
  template: SpxTemplate;
  fieldId: string;
}

/**
 * The Data panel's add-field on a CATALOG template. Detected from the CODE, never the
 * category: the standard contract's line idiom is
 * `<div class="{p}-mask"><span id="fN" class="{p}-name|-title|-extra">…</span></div>`, and a
 * template carrying it gets a REAL line in exactly that shape, right after the last one — so
 * update() has an element to write into and the canvas, timeline and Inspector pick the new
 * layer up like any wizard-made line (the definition-only add used to leave a field no
 * element answered, a silent on-air no-op).
 *
 * The class follows the assembler's own ladder (lineClassFor); when the design ships no rule
 * for that class — a two-line design gaining its first `-extra` — the new line borrows the
 * LAST line's class so it is never unstyled. The span class must speak the ladder's
 * vocabulary, which is what keeps fixed contracts out: a scoreboard's cells share the mask
 * wrapper but are `{p}-team`/`{p}-score`, a quiz's rows are their own shape, and data-driven
 * categories (tickers, credits) keep their hidden textarea sources. All of those return null
 * here, and the caller REFUSES the add with the reason - there is no definition-only fallback
 * (components/SampleDataPanel.tsx addField).
 */
export function addCatalogLine(
  template: SpxTemplate,
  opts: { title: string; ftype: 'textfield' | 'number' },
): CatalogLineAdd | null {
  // Designs lay the same idiom out one-per-line or with the span on its own line — the
  // match tolerates both, and the NEW line is cloned from the last one's exact markup, so
  // it lands in whichever layout the file already speaks.
  const lineRe =
    /([ \t]*)<div class="([a-z0-9-]+)-mask">\s*<span id="f\d+" class="(\2-(?:name|title|extra))">[^<]*<\/span>\s*<\/div>/g;
  // A project can hold an INSERTED graphic (blocks/templateInsert.ts), whose lines carry its
  // own namespaced prefix — this add belongs to the HOST design, so only the host's lines are
  // candidates. Without the filter an insertion silently downgraded every later add-field to
  // the definition-only path: a field no element answers, the exact on-air no-op this exists
  // to end.
  const host = detectPrefix(template.html);
  const found = [...template.html.matchAll(lineRe)];
  const matches = host ? found.filter((m) => m[2] === host) : found;
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const prefix = last[2];
  // One graphic per template — every line mask must agree on the prefix, or the shape is
  // not the one this transform knows.
  if (matches.some((m) => m[2] !== prefix)) return null;
  const indent = last[1];
  const fieldId = nextFieldId(template.fields);
  const canonical = lineClassFor(prefix, matches.length);
  const cls = new RegExp(`\\.${escapeRe(canonical)}\\s*[,{]`).test(template.css) ? canonical : last[3];
  const sample = opts.ftype === 'number' ? '0' : opts.title;
  // `--` would close the HTML comment early; the definition (JSON) keeps the exact title.
  const commentTitle = opts.title.replace(/--/g, '-');
  const insertAt = last.index! + last[0].length;
  const line = last[0]
    .replace(/id="f\d+"/, `id="${fieldId}"`)
    .replace(/(<span\b[^>]*class=")[^"]*(")/, `$1${cls}$2`)
    .replace(/>[^<]*(<\/span>)/, `>${escapeHtml(sample)}$1`);
  const snippet =
    `\n${indent}<!-- ${commentTitle} (${fieldId}) — SPX writes this field's value straight into the element. -->` +
    `\n${line}`;
  const html = template.html.slice(0, insertAt) + snippet + template.html.slice(insertAt);
  const field: SpxField = { field: fieldId, ftype: opts.ftype, title: opts.title, value: sample };
  return { template: addFieldToDefinition({ ...template, html }, field), fieldId };
}

/**
 * Set a field's DEFAULT value: updates the SPX definition's DataField `value` (what an SPX
 * operator sees as the starting value) AND the element's static text in the markup, so the
 * pre-play preview and the hidden-source categories (credits/tickers/timers) stay in sync.
 * Used by the canvas inline text editor — one deterministic, undoable template patch.
 */
export function setFieldDefault(template: SpxTemplate, fieldId: string, value: string): SpxTemplate {
  const fields = template.fields.map((f) => (f.field === fieldId ? { ...f, value } : f));
  let html = replaceDefinitionInHtml(template.html, template.settings, fields);
  // The static text inside the element with this id (a visible <span> or a hidden source
  // <div>). [^<]* also matches newlines, so multi-line textarea sources are covered.
  html = html.replace(
    new RegExp(`(<(?:span|div)\\b[^>]*\\bid="${fieldId}"[^>]*>)[^<]*`),
    (_m, open: string) => `${open}${escapeHtml(value)}`,
  );
  return { ...template, html, fields };
}

/**
 * Rename a field's operator-facing LABEL: the definition's DataField `title` plus the
 * template's layer metadata (the registry names the layer's row and chip from it). The
 * element id — and with it every binding, rule, and keyframe track — never changes.
 */
export function setFieldTitle(template: SpxTemplate, fieldId: string, title: string): SpxTemplate {
  const fields = template.fields.map((f) => (f.field === fieldId ? { ...f, title } : f));
  const html = replaceDefinitionInHtml(template.html, template.settings, fields);
  const layers = template.layers.map((l) => (l.fieldId === fieldId ? { ...l, label: title } : l));
  return { ...template, html, fields, layers };
}

/**
 * Append a structured layer entry to the template's model. Layers are best-effort
 * metadata describing the visual elements — authoritative when produced by templates,
 * building blocks, or the AI. They prepare the architecture for future visual editing
 * without driving the live render (the code remains the source of truth).
 */
export function addLayer(template: SpxTemplate, layer: TemplateLayer): SpxTemplate {
  return { ...template, layers: [...template.layers, layer] };
}

/** How many block-inserted elements already exist (tagged data-gfx), used to stagger new ones. */
export function gfxCount(html: string): number {
  return (html.match(/data-gfx/g) || []).length;
}

/** Last opening tag matching `re` (with its source index), or null. */
function lastTagMatch(html: string, re: RegExp): { text: string; index: number } | null {
  const g = new RegExp(re.source, 'g');
  let m: RegExpExecArray | null;
  let last: { text: string; index: number } | null = null;
  while ((m = g.exec(html))) last = { text: m[0], index: m.index };
  return last;
}

const GFX_TAG = /<[a-zA-Z][^>]*\bdata-gfx\b[^>]*>/;
const GRAPHIC_TAG = /<[a-zA-Z][^>]*\bid=["']graphic["'][^>]*>/;

/**
 * The element an animation block should target: the most recently inserted block element
 * (tagged data-gfx), else the template root (#graphic). Returns a CSS selector.
 */
export function animationSelector(html: string): string {
  const tag = lastTagMatch(html, GFX_TAG) ?? lastTagMatch(html, GRAPHIC_TAG);
  if (tag) {
    const idM = /\bid=["']([^"']+)["']/.exec(tag.text);
    if (idM) return `#${idM[1]}`;
    const clM = /\bclass=["']([^"']+)["']/.exec(tag.text);
    if (clM) return `.${clM[1].trim().split(/\s+/)[0]}`;
  }
  return '#graphic';
}

/** Add a class to a single opening tag string (extends class="" or inserts it). */
function addClassToTag(tag: string, className: string): string {
  if (/\bclass=["'][^"']*["']/.test(tag)) {
    return tag.replace(/\bclass=["']([^"']*)["']/, (_m, c) => `class="${c} ${className}"`);
  }
  const selfClose = /\/>\s*$/.test(tag);
  const inner = tag.replace(/\s*\/?>\s*$/, '');
  return `${inner} class="${className}"${selfClose ? ' />' : '>'}`;
}

/**
 * Apply a CSS class to the element an animation should run on (last data-gfx element, else
 * #graphic), so a CSS @keyframes animation actually runs. Returns html unchanged if no target.
 */
export function applyAnimationClass(html: string, className: string): string {
  const tag = lastTagMatch(html, GFX_TAG) ?? lastTagMatch(html, GRAPHIC_TAG);
  if (!tag) return html;
  return html.slice(0, tag.index) + addClassToTag(tag.text, className) + html.slice(tag.index + tag.text.length);
}

/** Insert a line of code right after the opening brace of `function <name>(...) {`. */
export function insertIntoFunction(js: string, fnName: string, line: string): string {
  const re = new RegExp(`(function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{)`);
  if (!re.test(js)) return js;
  return js.replace(re, `$1\n  ${line}`);
}

/** Selector for the most recently inserted block element (last data-gfx). Null if none. */
export function lastInsertedSelector(html: string): string | null {
  const tag = lastTagMatch(html, GFX_TAG);
  if (!tag) return null;
  const idM = /\bid=["']([^"']+)["']/.exec(tag.text);
  if (idM) return `#${idM[1]}`;
  const clM = /\bclass=["']([^"']+)["']/.exec(tag.text);
  if (clM) return `.${clM[1].trim().split(/\s+/)[0]}`;
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Body of the rule whose selector list exactly equals `selector` (comments stripped). */
function findRuleBody(css: string, selector: string): { body: string; start: number; end: number } | null {
  let i = 0;
  let ruleStart = 0;
  while (i < css.length) {
    if (css[i] === '{') {
      const sel = css.slice(ruleStart, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      if (sel === selector) return { body: css.slice(i + 1, j - 1), start: i + 1, end: j - 1 };
      i = j;
      ruleStart = j;
      continue;
    }
    i++;
  }
  return null;
}

/**
 * Insert/replace a single `prop: value` declaration inside the rule for `selector`, creating the
 * rule if it doesn't exist. Deterministic; preserves the rest of the stylesheet. Used by the
 * Blocks panel's suggested-property chips.
 */
export function setCssDeclaration(css: string, selector: string, prop: string, value: string): string {
  const rule = findRuleBody(css, selector);
  if (rule) {
    // A declaration may be preceded by the PREVIOUS line's trailing comment (generated rules
    // annotate every declaration — zoneCssText, the imported-design placement rules), so a
    // closing `*/` counts as a boundary too. Without it the replace never matched such a
    // declaration and this fell through to append — a silent duplicate whose stale twin
    // stayed in the rule forever.
    const re = new RegExp(`(^|;|\\{|\\*\\/)(\\s*)${escapeRe(prop)}\\s*:[^;}]*`, 'i');
    let body = rule.body;
    if (re.test(body)) {
      body = body.replace(re, `$1$2${prop}: ${value}`);
    } else {
      const trimmed = body.replace(/\s*$/, '');
      const sep = trimmed.endsWith(';') || trimmed === '' ? '' : ';';
      body = `${trimmed}${sep}\n  ${prop}: ${value};\n`;
    }
    return css.slice(0, rule.start) + body + css.slice(rule.end);
  }
  return `${css.replace(/\s*$/, '')}\n\n${selector} {\n  ${prop}: ${value};\n}\n`;
}

/**
 * A sensible lower-left, action-safe position for a newly inserted element. Staggers upward
 * (raising `bottom`) when other inserted elements exist so they don't pile up or overlap.
 * Returns template px for the current resolution.
 */
export function positionForNewElement(template: SpxTemplate): { left: number; bottom: number } {
  const { width, height } = template.resolution;
  const left = Math.round(width * 0.062); // ~action-safe inset from the left
  const baseBottom = Math.round(height * 0.13); // lower-third band
  const step = Math.round(height * 0.11);
  const bottom = baseBottom + gfxCount(template.html) * step;
  return { left, bottom: Math.min(bottom, height - 120) };
}

/**
 * Rich, commented CSS for a broadcast text element. Includes the genuinely useful properties
 * (position, color, font, line-height, letter-spacing, white-space, text-shadow) each briefly
 * commented so the generated code teaches. `extra` adds block-specific lines.
 */
export function textCssRule(
  selector: string,
  opts: { left: number; bottom?: number; top?: number; fontSize: number; fontWeight?: number; color?: string; extra?: string },
): string {
  const { left, bottom, top, fontSize, fontWeight = 700, color = '#ffffff', extra } = opts;
  const vertical =
    bottom != null
      ? `  bottom: ${bottom}px;             /* distance from the bottom edge of frame */`
      : `  top: ${top ?? 80}px;             /* distance from the top edge of frame */`;
  return `${selector} {
  position: absolute;          /* place freely on the canvas */
  left: ${left}px;             /* distance from the left edge */
${vertical}
  color: ${color};             /* text colour */
  font-family: "Open Sans", Arial, sans-serif;  /* swap in a brand font via the Brand tab */
  font-size: ${fontSize}px;    /* large enough to read on screen */
  font-weight: ${fontWeight};  /* 400 normal · 700 bold · up to 900 */
  line-height: 1.15;           /* spacing between wrapped lines */
  letter-spacing: 0.01em;      /* subtle tracking */
  white-space: nowrap;         /* keep a lower third on one line */
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);  /* legibility over video */${extra ? '\n' + extra : ''}
}`;
}
