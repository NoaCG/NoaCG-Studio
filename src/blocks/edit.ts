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

type CssRuleBody = { body: string; start: number; end: number };
const CSS_SOURCE_TOKENS = /\/\*[\s\S]*?\*\/|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\\[\s\S]|[()[\]{}:;,&]/g;
const CSS_IDENTIFIER = /(?:[-\w]|\\(?:[0-9a-f]{1,6}(?:\r\n|[\t\n\f\r ])?|[^\n\f\r]))+/.source;
const cssWithoutComments = (value: string) => value.replace(/\/\*[\s\S]*?\*\//g, comment => ' '.repeat(comment.length));
const cssWithoutLiterals = (value: string) => value.replace(CSS_SOURCE_TOKENS, token => /^["']|^\/\*/.test(token) ? ' '.repeat(token.length) : token);
function cssName(source: string) {
  return source.replace(/\\(?:([0-9a-f]{1,6})(?:\r\n|[\t\n\f\r ])?|([^\n\f\r]))/gi, (_match, hex: string | undefined, escaped: string) => {
    if (!hex) return escaped;
    const code = parseInt(hex, 16);
    return code && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
  });
}

/** Custom property reads, including escaped identifiers and reads inside fallback expressions. */
export function cssVariableReads(value: string): string[] {
  if (!value.includes('(')) return [];
  const names = new Set<string>();
  const source = cssWithoutLiterals(value);
  const calls = new RegExp(`(${CSS_IDENTIFIER})\\(`, 'gi'), argument = new RegExp(`^\\s*(${CSS_IDENTIFIER})`, 'i');
  for (const match of source.matchAll(calls)) {
    if (cssName(match[1]).toLowerCase() !== 'var') continue;
    const name = cssName(source.slice(match.index! + match[0].length).match(argument)?.[1] ?? '');
    if (name.startsWith('--')) names.add(name);
  }
  return [...names];
}

function selectorBranches(selector: string) {
  const branches: string[] = [];
  let depth = 0, start = 0;
  for (const match of selector.matchAll(CSS_SOURCE_TOKENS)) {
    if (match[0] === '(' || match[0] === '[') depth++;
    else if (match[0] === ')' || match[0] === ']') depth--;
    else if (!depth && match[0] === ',') {
      branches.push(selector.slice(start, match.index).trim());
      start = match.index! + 1;
    }
  }
  return [...branches, selector.slice(start).trim()];
}

export type CssStyleSource = { selectorText: string; selectors: string[]; style: CSSStyleDeclaration; nested: boolean };
/** Read authored CSS without rewriting it or loading styles from outside the document. */
export function inspectCss(css: string, nativeNesting = true) {
  const visible = nativeNesting ? cssWithoutLiterals(css) : '';
  // A constructed sheet ignores @import. The structural owner must still account for it.
  let unresolved = [...visible.matchAll(new RegExp(`(?:^|[;}])\\s*@(${CSS_IDENTIFIER})`, 'gi'))]
    .some(match => cssName(match[1]).toLowerCase() === 'import');
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const rules: CssStyleSource[] = [], registrations = new Set<string>();
  const keyframes: { name: string; css: string }[] = [];
  const visit = (list: CSSRuleList, nested: boolean, parent?: string) => {
    for (const rule of list) {
      if (rule instanceof CSSStyleRule) {
        const selectors = selectorBranches(rule.selectorText).map(selector => {
          if (!parent) return selector;
          let explicit = false;
          const expanded = selector.replace(CSS_SOURCE_TOKENS, token => {
            if (token !== '&') return token;
            explicit = true;
            return `:is(${parent})`;
          });
          return explicit ? expanded : `:is(${parent}) ${selector}`;
        });
        rules.push({ selectorText: rule.selectorText, selectors, style: rule.style, nested });
        if (nativeNesting && rule.cssRules?.length) visit(rule.cssRules, true, selectors.join(', '));
      } else if (typeof CSSPropertyRule !== 'undefined' && rule instanceof CSSPropertyRule) {
        registrations.add(rule.name);
      } else if (nativeNesting && rule instanceof CSSKeyframesRule) {
        keyframes.push({ name: rule.name, css: rule.cssText });
      } else if (rule instanceof CSSGroupingRule) {
        if (nativeNesting && typeof CSSScopeRule !== 'undefined' && rule instanceof CSSScopeRule && rule.cssRules.length) unresolved = true;
        visit(rule.cssRules, true, parent);
      } else if (nativeNesting && parent && 'style' in rule) {
        // A conditional rule inside a style can expose declarations without a selector of its own.
        rules.push({ selectorText: parent, selectors: selectorBranches(parent), style: rule.style as CSSStyleDeclaration, nested: true });
      }
    }
  };
  visit(sheet.cssRules, false);
  return { rules, registrations, keyframes, unresolved };
}

/** Exact top-level rules, preserving the scanner used by the source readers. */
function* ruleBodies(css: string, selector: string): Generator<CssRuleBody> {
  let depth = 0, ruleStart = 0, start = 0, name = '';
  for (const match of css.matchAll(CSS_SOURCE_TOKENS)) {
    const token = match[0], at = match.index!;
    if (token === '{') {
      if (depth === 0) {
        name = cssWithoutComments(css.slice(ruleStart, at)).trim();
        start = at + 1;
      }
      depth++;
    } else if (token === '}') {
      depth--;
      if (depth === 0) {
        if (name === selector) yield { body: css.slice(start, at), start, end: at };
        ruleStart = at + 1;
      }
    } else if (token === ';' && !depth) {
      ruleStart = at + 1;
    }
  }
}

/** Body of the first exact top-level selector (comments stripped from the selector). */
export function findRuleBody(css: string, selector: string): CssRuleBody | null {
  return ruleBodies(css, selector).next().value ?? null;
}

/** Declarations and their source spans in one rule body. CSSOM keeps only the winner. */
export function cssDeclarations(body: string) {
  const declarations: { name: string; value: string; important: boolean; start: number; end: number }[] = [];
  let start = 0, colon = -1, depth = 0;
  const finish = (end: number) => {
    if (colon >= 0) {
      const head = cssWithoutComments(body.slice(start, colon));
      const name = cssName(head.trim()), raw = cssWithoutComments(body.slice(colon + 1, end)).trimEnd();
      const priority = /!\s*important$/i.exec(raw);
      const value = raw.slice(0, priority?.index).trimEnd();
      if (/^[-\w]+$/.test(name)) declarations.push({ name: name.startsWith('--') ? name : name.toLowerCase(),
        value: value.trimStart(), important: !!priority,
        start: colon + 1 + value.length - value.trimStart().length, end: colon + 1 + value.length });
    }
    start = end + 1;
    colon = -1;
  };
  for (const match of body.matchAll(CSS_SOURCE_TOKENS)) {
    const token = match[0], at = match.index!;
    if (token === '(' || token === '[' || token === '{') depth++;
    else if (token === ')' || token === ']' || token === '}') {
      depth--;
      if (!depth && token === '}' && !body.slice(start, colon).trimStart().startsWith('--')) {
        start = at + 1;
        colon = -1;
      }
    } else if (!depth && token === ':' && colon < 0) colon = at;
    else if (!depth && token === ';') finish(at);
  }
  finish(body.length);
  return declarations;
}

/**
 * Set the effective declaration among repeated exact top-level rules, or append to the first
 * rule when absent. Keep unrelated and nested rules intact, and retain important priority.
 */
export function setCssDeclaration(css: string, selector: string, prop: string, value: string): string {
  let rule: CssRuleBody | undefined;
  let chosen: { rule: CssRuleBody; declaration: ReturnType<typeof cssDeclarations>[number] } | undefined;
  const name = prop.startsWith('--') ? prop : prop.toLowerCase();
  for (const candidate of ruleBodies(css, selector)) {
    // New properties stay in the first owned rule, which anchor/group readers inspect.
    rule ??= candidate;
    for (const declaration of cssDeclarations(candidate.body)) {
      if (declaration.name === name && (!chosen || declaration.important || !chosen.declaration.important)) chosen = { rule: candidate, declaration };
    }
  }
  if (chosen) {
    const { start, end, important } = chosen.declaration;
    rule = chosen.rule;
    const next = important ? value.replace(/\s*!\s*important\s*$/i, '') : value;
    const space = rule.body[start - 1] === ':' ? ' ' : '';
    const body = rule.body.slice(0, start) + space + next + rule.body.slice(end);
    return css.slice(0, rule.start) + body + css.slice(rule.end);
  }
  if (rule) {
    const trimmed = rule.body.replace(/\s*$/, '');
    // A trailing comment annotates the declaration before it, which decides the separator.
    const last = trimmed.replace(/(?:\s*\/\*(?:[^*]|\*(?!\/))*\*\/)+$/, '');
    const sep = last.endsWith(';') || last === '' ? '' : ';';
    const body = `${trimmed}${sep}\n  ${prop}: ${value};\n`;
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
