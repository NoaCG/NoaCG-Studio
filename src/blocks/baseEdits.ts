// Base artwork edits share the existing source writers. Motion retains transform ownership.
import type { SpxTemplate } from '../model/types';
import { getTemplateParts, detectPrefix } from '../model/structure';
import { parseTransform } from '../assets/svgGeometry';
import { parseAnimData } from './animData';
import { addCatalogLine, appendCss, setCssDeclaration } from './edit';
import { addPlacedLine, placedLines, placeLine, placementCss, setLineFit } from './designLayout';

export interface BaseValues {
  selector: string; target: string; mode: 'placed' | 'svg' | 'flow' | 'absolute';
  x: number; y: number; originX: number; originY: number; scaled: boolean;
  scaleX: number; scaleY: number;
  scaleReason: string | null;
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const precise = (n: number) => Math.round(n * 1000) / 1000;
function declaration(css: string, selector: string, property: string): string | null {
  const rule = css.match(new RegExp(esc(selector) + '\\s*\\{([^}]*)\\}'));
  return rule?.[1].match(new RegExp('(?:^|[;}]|\\*/)[\\s]*' + esc(property) + '\\s*:\\s*([^;]+)'))?.[1].trim() ?? null;
}
function number(css: string, selector: string, property: string, fallback = 0) {
  return parseFloat(declaration(css, selector, property) ?? '') || fallback;
}
function length(css: string, selector: string, property: string) {
  const raw = declaration(css, selector, property);
  if (!raw) return null;
  if (raw === '0') return { value: 0, scaled: false };
  const match = raw.match(/^(?:calc\(\s*)?(-?[\d.]+)px(?:\s*\*\s*var\(--scale\)\s*\))?$/);
  return match ? { value: Number(match[1]), scaled: raw.includes('--scale') } : null;
}

/** Inspect matching authored rules without ever serializing CSSOM back into source.
 * Refuse competing constraints even in conditional rules: changing the viewport must
 * not silently change which placement or independent transform the editor owns. */
function matchingStyles(css: string, node: Element): CSSStyleDeclaration[] {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  const styles: CSSStyleDeclaration[] = [];
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && node.matches(rule.selectorText)) styles.push(rule.style);
      if (rule instanceof CSSGroupingRule) visit(rule.cssRules);
    }
  };
  visit(sheet.cssRules);
  return styles;
}

/** No inspection mutation: identifiers and all values are read from source. */
export function baseValues(template: SpxTemplate, selector: string): BaseValues {
  const part = getTemplateParts(template.html, template.fields).find(p => p.selector === selector);
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const nodes = doc.querySelectorAll(selector);
  if (!part || nodes.length !== 1) throw new Error('Select one uniquely addressable artwork layer.');
  const node = nodes[0];
  const placed = placedLines(template.html, template.css)[selector];
  const svg = node.namespaceURI === 'http://www.w3.org/2000/svg' && node.tagName.toLowerCase() !== 'svg';
  const target = placed ? '#' + placed.wrapperId : selector;
  const left = length(template.css, target, 'left'), top = length(template.css, target, 'top');
  const mode = placed ? 'placed' : svg ? 'svg' : left && top ? 'absolute' : part.kind === 'line' ? 'flow' : null;
  if (!mode) throw new Error('This layer has no supported base placement. Its source is preserved.');
  const styles = matchingStyles(template.css, doc.querySelector(target)!);
  const targetNode = doc.querySelector(target)!;
  const motion = parseAnimData(template.js);
  const owned = new Set(motion?.steps.flatMap(step => Object.entries(step.layers).flatMap(([key, tracks]) => {
    try { return targetNode.matches(key) ? Object.keys(tracks) : []; } catch { return []; }
  })) ?? []);
  const scaleReason = ['scale', 'scaleX', 'scaleY', 'transform'].some(key => owned.has(key))
    ? 'Scale is animated on this layer. Use its existing animation controls; base scaling would compete with that motion.' : null;
  if (svg && ['x', 'y', 'xPercent', 'yPercent', 'transform'].some(key => owned.has(key))) {
    throw new Error('This SVG position is animated. Use its existing animation controls to preserve that motion.');
  }
  // Existing independent transforms are not ours to replace. Our declarations are marked
  // by the readable custom properties, so reopening requires no hidden metadata.
  for (const property of ['translate', 'scale']) {
    if (styles.some(style => {
      const raw = style.getPropertyValue(property);
      return raw && raw !== 'none' && !raw.includes('--base-') && !raw.includes('--layout-');
    })) {
      throw new Error('This layer already owns CSS ' + property + '. Edit its source to preserve that transform.');
    }
  }
  if (mode === 'flow') {
    for (const style of styles) {
      if (style.position && !['static', 'relative'].includes(style.position)) {
        throw new Error('This layer owns a competing position; its source placement is preserved.');
      }
      if (style.display && !['block', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid'].includes(style.display)) {
        throw new Error('This display mode does not support independent artwork scaling.');
      }
      for (const property of ['inset', 'inset-inline', 'inset-block', 'left', 'top', 'right', 'bottom']) {
        const raw = style.getPropertyValue(property);
        if (raw && raw !== 'auto' && !raw.includes('--layout-')) {
          throw new Error('This layer owns an inset constraint; its source placement is preserved.');
        }
      }
    }
  }
  if (doc.querySelector(target)?.getAttribute('style')?.match(/(?:^|;)\s*(?:translate|scale|left|top|right|bottom)\s*:/)) {
    throw new Error('Inline placement needs a source edit; no competing rule was written.');
  }
  let originX = 0, originY = 0;
  if (svg) {
    const m = parseTransform(node.getAttribute('transform'));
    const x = parseFloat(node.getAttribute('x') ?? node.getAttribute('cx') ?? '0');
    const y = parseFloat(node.getAttribute('y') ?? node.getAttribute('cy') ?? '0');
    originX = m.a * x + m.c * y + m.e; originY = m.b * x + m.d * y + m.f;
  }
  return { selector, target, mode, scaleReason, scaled: placed?.scaled ?? left?.scaled ?? false,
    originX, originY,
    x: placed?.x ?? left?.value ?? originX + number(template.css, target, svg ? '--base-x' : '--layout-x'),
    y: placed?.y ?? top?.value ?? originY + number(template.css, target, svg ? '--base-y' : '--layout-y'),
    scaleX: Number(declaration(template.css, target, '--base-scale-x') ?? 1),
    scaleY: Number(declaration(template.css, target, '--base-scale-y') ?? 1) };
}
export interface BasePatch { x?: number; y?: number; scaleX?: number; scaleY?: number }
export function editBase(template: SpxTemplate, selector: string, patch: BasePatch): SpxTemplate {
  if (!Object.keys(patch).length || Object.values(patch).some(n => !Number.isFinite(n) || Math.abs(n!) > 100000)) {
    throw new Error('Enter finite artwork coordinates and scale.');
  }
  const base = baseValues(template, selector);
  const changeScale = patch.scaleX !== undefined && patch.scaleX !== base.scaleX || patch.scaleY !== undefined && patch.scaleY !== base.scaleY;
  if (changeScale && base.scaleReason) throw new Error(base.scaleReason);
  if (Object.entries(patch).every(([key, value]) => value === base[key as keyof BasePatch])) return template;
  const x = precise(patch.x ?? base.x), y = precise(patch.y ?? base.y);
  let css = template.css;
  if (!new RegExp(esc(base.target) + '\\s*\\{').test(css)) {
    css = appendCss(css, 'Base artwork placement; animation keeps ownership of transform.', base.target + ' {}');
  }
  if (patch.x !== undefined || patch.y !== undefined) {
    if (base.mode === 'placed' || base.mode === 'absolute') {
      css = setCssDeclaration(css, base.target, 'left', placementCss(x, base.scaled));
      css = setCssDeclaration(css, base.target, 'top', placementCss(y, base.scaled));
    } else {
      if (base.mode === 'svg') {
        css = setCssDeclaration(css, base.target, '--base-x', precise(x - base.originX) + 'px');
        css = setCssDeclaration(css, base.target, '--base-y', precise(y - base.originY) + 'px');
        css = setCssDeclaration(css, base.target, 'translate', 'var(--base-x) var(--base-y)');
      } else {
        css = setCssDeclaration(css, base.target, '--layout-x', x + 'px');
        css = setCssDeclaration(css, base.target, '--layout-y', y + 'px');
        css = setCssDeclaration(css, base.target, 'position', 'relative');
        css = setCssDeclaration(css, base.target, 'left', 'calc(var(--layout-x) * var(--scale, 1))');
        css = setCssDeclaration(css, base.target, 'top', 'calc(var(--layout-y) * var(--scale, 1))');
      }
    }
  }
  if (changeScale) {
    css = setCssDeclaration(css, base.target, '--base-scale-x', String(precise(patch.scaleX ?? base.scaleX)));
    css = setCssDeclaration(css, base.target, '--base-scale-y', String(precise(patch.scaleY ?? base.scaleY)));
    css = setCssDeclaration(css, base.target, 'scale', 'var(--base-scale-x) var(--base-scale-y)');
  }
  return { ...template, css };
}

export type CreationKind = 'text' | 'rectangle' | 'ellipse';
export interface Creation { shape: CreationKind; x: number; y: number; width: number; height: number; box?: boolean }
export function creationParent(template: SpxTemplate): string {
  const prefix = detectPrefix(template.html);
  if (!prefix) throw new Error('Drawing requires a supported graphic container.');
  // The panel may own a clip-path entrance. New artwork belongs to the graphic root,
  // so drawing outside that panel does not silently create clipped/invisible layers.
  return '.' + prefix;
}
/** Insert into a known unique HTML container without serializing the imported document. */
function elementRange(html: string, selector: string): { start: number; close: number; end: number } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const matches = doc.querySelectorAll(selector);
  if (matches.length !== 1) throw new Error('The graphic container is ambiguous.');
  const wanted = matches[0];
  const tags = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([\w:-]+)\b[^>]*>/gi;
  let depth = 0, found = false, start = 0;
  for (const match of html.matchAll(tags)) {
    if (!match[2] || match[2].toLowerCase() !== wanted.tagName.toLowerCase()) continue;
    const closing = match[0].startsWith('</');
    if (!found && !closing) {
      const tag = new DOMParser().parseFromString(match[0] + '</' + match[2] + '>', 'text/html').body.firstElementChild;
      if (tag?.matches(selector)) { found = true; depth = 1; start = match.index; }
    } else if (found) {
      depth += closing ? -1 : 1;
      if (!depth) return { start, close: match.index, end: match.index + match[0].length };
    }
  }
  throw new Error('The graphic container cannot be patched without rewriting source.');
}
function insertChild(html: string, selector: string, snippet: string): string {
  const { close } = elementRange(html, selector);
  return html.slice(0, close) + snippet + '\n' + html.slice(close);
}
export function createArtwork(template: SpxTemplate, spec: Creation): { template: SpxTemplate; selector: string } {
  if (!['text', 'rectangle', 'ellipse'].includes(spec.shape) ||
      ![spec.x, spec.y, spec.width, spec.height].every(n => Number.isFinite(n) && Math.abs(n) <= 100000) || spec.width <= 0 || spec.height <= 0) {
    throw new Error('Draw a positive, finite artwork size.');
  }
  const parent = creationParent(template);
  let next: SpxTemplate, selector: string;
  if (spec.shape === 'text') {
    const added = addPlacedLine(template, { title: 'Text', text: 'New text', ftype: 'textfield',
      at: { x: spec.x, y: spec.y }, fontSize: 48 }) ?? addCatalogLine(template, { title: 'Text', ftype: 'textfield' });
    if (!added) throw new Error('This source has no supported operator-text binding.');
    next = added.template; selector = '#' + added.fieldId;
    let place = placedLines(next.html, next.css)[selector];
    if (!place) {
      const wrapper = 'fw' + added.fieldId.slice(1);
      next = { ...next, html: next.html.replace(new RegExp('(<div\\b[^>]*)(>\\s*<span id="' + added.fieldId + '")'), '$1 id="' + wrapper + '"$2'),
        css: appendCss(next.css, 'Placed text; independent of sibling flow.', '#' + wrapper + ' { position: absolute; left: 0px; top: 0px; overflow: visible; }') };
      place = placedLines(next.html, next.css)[selector];
    }
    if (!place) throw new Error('The new text could not be placed.');
    // Reuse the field writer, but lift only its new wrapper out of the existing panel.
    // Neither the original artwork nor its masks are serialized or reparented.
    const range = elementRange(next.html, '#' + place.wrapperId);
    const markup = next.html.slice(range.start, range.end);
    next = { ...next, html: insertChild(next.html.slice(0, range.start) + next.html.slice(range.end), parent, markup) };
    // Drawing coordinates are CSS pixels of the containing block. Existing artwork may
    // multiply its authored units by --scale; the new layer's placement is explicit.
    next = placeLine(next, place.wrapperId, spec.x, spec.y, false);
    next = { ...next, css: setCssDeclaration(next.css, selector, 'font-size', placementCss(48, place.scaled)) };
    next = setLineFit(next, added.fieldId, { mode: spec.box ? 'wrap' : 'overflow', maxWidth: spec.width }) ?? next;
    let css = next.css;
    css = setCssDeclaration(css, '#' + place.wrapperId, 'overflow', 'visible');
    if (spec.box) {
      css = setCssDeclaration(css, '#' + place.wrapperId, 'max-width', spec.width + 'px');
      css = setCssDeclaration(css, '#' + place.wrapperId, 'width', spec.width + 'px');
      css = setCssDeclaration(css, '#' + place.wrapperId, 'height', spec.height + 'px');
    }
    next = { ...next, css };
  } else {
    let n = 1;
    const doc = new DOMParser().parseFromString(template.html, 'text/html');
    while (doc.getElementById(spec.shape + '-' + n)) n++;
    selector = '#' + spec.shape + '-' + n;
    const html = insertChild(template.html, parent, '\n<!-- Editable ' + spec.shape + ' -->\n<div id="' + selector.slice(1) + '" data-gfx></div>');
    next = { ...template, html, css: appendCss(template.css, 'Editable ' + spec.shape + '; base geometry in parent pixels.',
      selector + ' {\n  position: absolute;\n  left: ' + precise(spec.x) + 'px;\n  top: ' + precise(spec.y) + 'px;\n  width: ' + precise(spec.width) + 'px;\n  height: ' + precise(spec.height) + 'px;\n  background: #8bd5f6;\n  border-radius: ' + (spec.shape === 'ellipse' ? '50%' : '0') + ';\n}') };
  }
  return { template: next, selector };
}
