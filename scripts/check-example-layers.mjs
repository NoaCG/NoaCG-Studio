#!/usr/bin/env node
// gate: build
// guards: public/docs/examples/**, docs/tutorials/**, src/templates/behaviours/layer-names.json, src/templates/behaviours/words.json, docs.html, docs/SVG_AUTHORING.md, cli/skill/noacg-graphic/references/contract.md, cli/plugin/skills/noacg-graphic/references/contract.md, .agents/skills/noacg-graphic-local/SKILL.md, .claude/skills/noacg-graphic-local/SKILL.md
//
// EVERY EXAMPLE SVG FOLLOWS THE ONE LAYER-NAMING SYSTEM, AND EVERY PAGE THAT TEACHES IT CARRIES
// THE SAME FIVE LINES.
//
//   node scripts/check-example-layers.mjs            # part of `npm run build`
//   node scripts/check-example-layers.mjs <dir>...   # check the SVGs under these folders instead
//   node scripts/check-example-layers.mjs --write    # rewrite the cheat-sheet blocks in place
//
// WHY. The system landed on 2026-09-21 and drifted within three days: every agent that drew a
// graphic layered and named it a little differently, because only the public page taught the
// system and nothing checked the files a student copies (the retired owner rulings, 2026-09-24). The
// importer stays loose on purpose - it reads every spelling and synonym in words.json - so the
// importer can never be what holds the EXAMPLES to one spelling. This is.
//
// WHAT IT READS. The system itself is src/templates/behaviours/layer-names.json (the three
// layers, the background name, the plate word, the fixed-word prefix, the simple types' field
// sets and the five-line cheat sheet). The words a behaviour binds come from words.json AT RUN
// TIME and are never copied here, so a word added there (a credits role, say) is accepted by
// this check the day it lands.
//
// WHAT IT COVERS. Every SVG under public/docs/examples/, docs/tutorials/*/import-ready/ and
// docs/tutorials/*/SVG/, except the folders in EXEMPT, each with its reason.
//
// THE RULES, one function each below, each named in its own failure message:
//   layers   the top-level groups are Text, Moments and Board, in that order from the top of the
//            Layers panel (the LAST in the file is the top), Text always, the other two only when
//            they hold something - Illustrator's SVG save drops an empty layer, so an empty
//            Moments layer cannot be required (measured 2026-09-24, the retired owner rulings).
//   text     Text holds named text objects (and `f:` pictures) only, each spelled the one taught
//            way: a word, then the row last after a space. A name the importer reads as a
//            behaviour role must be that role's taught spelling (`Answer A`, never `Vastaus A`).
//            A simple type (title, name tag, credits) uses its field set and nothing else.
//   moments  Moments holds hidden groups named for a behaviour's moment (`Selected A`), or a
//            gauge bar drawn at full length (`Bar 1`), and every row it names exists in Text.
//   board    Board text is `static:`. Of the shapes under every text, the background is the one
//            named `Panel` (else the first painted), and it is `Panel`. A shape at any depth under
//            exactly one text is that text's plate and one of its plates is named for it:
//            `Answer A` sits on `Answer box A`. A shape named `... box` is under the text it
//            names. A layer this graphic's behaviour binds by name (`Row 1` in the standings)
//            is left alone. Anything else is free decoration.
//   english  Every name is plain ASCII: no Finnish or Swedish letters in a taught name.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeHtml, matchesRole, rowTokenOf } from './behaviour-docs.mjs';
import { measured } from './measured.mjs';
import * as rules from './rules.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYSTEM_FILE = 'src/templates/behaviours/layer-names.json';
const WORDS_FILE = 'src/templates/behaviours/words.json';

/** Folders the check does not hold to the system, and why. A reason is required. */
export const EXEMPT = new Map([
  [
    'docs/tutorials/talk-show-set',
    'the 2026-09-24 talk-show set predates the settled Board rule (Show name, Background, Role 1 and ' +
      'Person 1) and the owner removes it himself; it is never edited to pass',
  ],
]);

export function readSystem(root = ROOT) {
  return {
    system: JSON.parse(readFileSync(path.join(root, SYSTEM_FILE), 'utf8')),
    words: JSON.parse(readFileSync(path.join(root, WORDS_FILE), 'utf8')),
  };
}

// ── The files ────────────────────────────────────────────────────────────────────────────────

const svgsIn = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.svg$/i.test(e.name))
        .map((e) => path.join(dir, e.name))
    : [];

/** Every covered SVG under `root`, repo-relative with forward slashes, and the exempt ones. */
export function coveredFiles(root = ROOT) {
  const dirs = [path.join(root, 'public', 'docs', 'examples')];
  const tutorials = path.join(root, 'docs', 'tutorials');
  if (existsSync(tutorials)) {
    for (const e of readdirSync(tutorials, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      for (const sub of ['import-ready', 'SVG']) dirs.push(path.join(tutorials, e.name, sub));
    }
  }
  const covered = [];
  const exempt = [];
  for (const file of dirs.flatMap(svgsIn)) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const folder = [...EXEMPT.keys()].find((f) => rel.startsWith(`${f}/`));
    (folder ? exempt : covered).push(rel);
  }
  return { covered, exempt };
}

// ── A small SVG reader ───────────────────────────────────────────────────────────────────────
//
// Plain Node has no DOMParser and the repo carries no XML package, so this is the smallest reader
// that the files in question need: elements, their attributes, and the text of <style>. It skips
// the XML declaration, comments, a DOCTYPE with or without an internal subset (older Illustrator
// writes one full of ENTITY lines), and keeps CDATA as text.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeEntities = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === '#'
      ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : ENTITIES[e] ?? m,
  );

export function parseSvg(src) {
  const root = { tag: '#root', attrs: {}, children: [], text: '', parent: null };
  let node = root;
  let i = 0;
  const skipTo = (marker) => {
    const end = src.indexOf(marker, i);
    if (end < 0) throw new Error(`unterminated markup at offset ${i}`);
    i = end + marker.length;
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    node.text += decodeEntities(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) skipTo('-->');
    else if (src.startsWith('<?', i)) skipTo('?>');
    else if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i);
      node.text += src.slice(i + 9, end);
      i = end + 3;
    } else if (/^<!DOCTYPE/i.test(src.slice(i, i + 9))) {
      const bracket = src.indexOf('[', i);
      const close = src.indexOf('>', i);
      if (bracket >= 0 && bracket < close) {
        i = bracket;
        skipTo(']');
      }
      skipTo('>');
    } else if (src[i + 1] === '/') {
      const end = src.indexOf('>', i);
      const tag = src.slice(i + 2, end).trim();
      if (tag !== node.tag) throw new Error(`</${tag}> closes <${node.tag}>`);
      node = node.parent;
      i = end + 1;
    } else {
      const open = /^<([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(src.slice(i));
      if (!open) throw new Error(`cannot read the tag at offset ${i}`);
      const attrs = {};
      for (const a of open[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
      const el = { tag: open[1], attrs, children: [], text: '', parent: node };
      node.children.push(el);
      if (!open[3]) node = el;
      i += open[0].length;
    }
  }
  if (node !== root) throw new Error(`<${node.tag}> is never closed`);
  const svg = root.children.find((c) => c.tag === 'svg');
  if (!svg) throw new Error('no <svg> element');
  return svg;
}

// ── Names, the importer's way ────────────────────────────────────────────────────────────────

/** svgImport.ts `isGeneratedId` and `isDefaultObjectName`, in plain JS: an id an editor minted. */
function isGeneratedId(id) {
  return (
    /^(?:svg|g|layer|text|textPath|tspan|flowRoot|flowRegion|flowPara|path|rect|circle|ellipse|line|polyline|polygon|use|image|symbol|pattern|clipPath|mask|defs|marker|linearGradient|radialGradient|stop|filter)[-_]?\d+$/i.test(id) ||
    /^(?:frame|group|rectangle|ellipse|line|vector|polygon|star|arrow|union|subtract|intersect|exclude|slice|layer|path|shape|component|instance|mask group|clip path group)(?:\s+\d+)?$/i.test(id)
  );
}

/** svgImport.ts `layerName`, in plain JS and kept in step by hand: data-name, the Inkscape
 *  label, Affinity's serif:id, else the decoded Illustrator id. Empty when unnamed. */
export function layerName(el) {
  for (const key of ['data-name', 'inkscape:label', 'serif:id']) {
    const v = el.attrs[key]?.trim();
    if (v) return v;
  }
  const id = el.attrs.id?.trim();
  if (!id || isGeneratedId(id)) return '';
  return id
    .replace(/_x([0-9A-Fa-f]{2})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/_\d{8,}$/, '')
    .replace(/_/g, ' ')
    .trim();
}

/** The class names a <style> block hides: Illustrator's Save a Copy writes a hidden layer as a
 *  class carrying `display: none` rather than as an attribute. */
function hiddenClassesOf(svg) {
  const css = [];
  const walk = (el) => {
    if (el.tag === 'style') css.push(el.text);
    el.children.forEach(walk);
  };
  walk(svg);
  const hidden = new Set();
  for (const rule of css.join('\n').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/display\s*:\s*none|visibility\s*:\s*hidden/i.test(rule[2])) continue;
    for (const cls of rule[1].matchAll(/\.([\w-]+)/g)) hidden.add(cls[1]);
  }
  return hidden;
}

function isHidden(el, hiddenClasses) {
  const a = el.attrs;
  if (a.display === 'none' || a.visibility === 'hidden') return true;
  if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style ?? '')) return true;
  return (a.class ?? '').split(/\s+/).some((c) => hiddenClasses.has(c));
}

// ── Geometry: where a text sits and what a shape covers ──────────────────────────────────────

const IDENTITY = [1, 0, 0, 1, 0, 0];
const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const numbers = (s) => (String(s ?? '').match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** An element's own `transform` as one matrix. */
function ownMatrix(el) {
  let m = IDENTITY;
  for (const [, fn, args] of String(el.attrs.transform ?? '').matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args);
    let n = IDENTITY;
    if (fn === 'matrix' && v.length === 6) n = v;
    else if (fn === 'translate') n = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
    else if (fn === 'scale') n = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = ((v[0] ?? 0) * Math.PI) / 180;
      const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
      n = multiply(multiply([1, 0, 0, 1, cx, cy], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === 'skewX') n = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
    else if (fn === 'skewY') n = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
    m = multiply(m, n);
  }
  return m;
}

/** The matrix from an element's own space to the SVG's: every ancestor's transform, then its own. */
function matrixOf(el) {
  const chain = [];
  for (let e = el; e && e.tag !== '#root'; e = e.parent) chain.unshift(e);
  return chain.reduce((m, e) => multiply(m, ownMatrix(e)), IDENTITY);
}

/** The points a path passes through or is pulled toward (its control points), absolute. A curve
 *  stays inside the hull of its control points, so their box holds the curve; an arc is read by
 *  its end points, which is close enough to tell which text a plate sits under. */
function pathPoints(d) {
  const tokens = String(d ?? '').match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const pts = [];
  let [x, y, sx, sy] = [0, 0, 0, 0];
  let cmd = '';
  let k = 0;
  const num = () => Number(tokens[k++]);
  while (k < tokens.length) {
    if (/[a-z]/i.test(tokens[k])) cmd = tokens[k++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T':
        [x, y] = [ox + num(), oy + num()];
        if (cmd.toUpperCase() === 'M') {
          [sx, sy] = [x, y];
          cmd = rel ? 'l' : 'L';
        }
        pts.push([x, y]);
        break;
      case 'H':
        x = (rel ? x : 0) + num();
        pts.push([x, y]);
        break;
      case 'V':
        y = (rel ? y : 0) + num();
        pts.push([x, y]);
        break;
      case 'C':
        pts.push([ox + num(), oy + num()], [ox + num(), oy + num()]);
        [x, y] = [ox + num(), oy + num()];
        pts.push([x, y]);
        break;
      case 'S':
      case 'Q':
        pts.push([ox + num(), oy + num()]);
        [x, y] = [ox + num(), oy + num()];
        pts.push([x, y]);
        break;
      case 'A':
        k += 5;
        [x, y] = [ox + num(), oy + num()];
        pts.push([x, y]);
        break;
      case 'Z':
        [x, y] = [sx, sy];
        break;
      default:
        k++;
    }
  }
  return pts;
}

/** The corner points of one element in its own space, or [] for something with no area. */
function ownPoints(el) {
  const a = el.attrs;
  const n = (v) => Number.parseFloat(v ?? '0') || 0;
  switch (el.tag) {
    case 'rect':
    case 'image':
    case 'use':
      return [[n(a.x), n(a.y)], [n(a.x) + n(a.width), n(a.y) + n(a.height)], [n(a.x) + n(a.width), n(a.y)], [n(a.x), n(a.y) + n(a.height)]];
    case 'circle':
      return [[n(a.cx) - n(a.r), n(a.cy) - n(a.r)], [n(a.cx) + n(a.r), n(a.cy) + n(a.r)]];
    case 'ellipse':
      return [[n(a.cx) - n(a.rx), n(a.cy) - n(a.ry)], [n(a.cx) + n(a.rx), n(a.cy) + n(a.ry)]];
    case 'line':
      return [[n(a.x1), n(a.y1)], [n(a.x2), n(a.y2)]];
    case 'polygon':
    case 'polyline': {
      const v = numbers(a.points);
      return v.flatMap((_, i) => (i % 2 === 0 ? [[v[i], v[i + 1]]] : []));
    }
    case 'path':
      return pathPoints(a.d);
    default:
      return [];
  }
}

const NOT_DRAWN = new Set(['defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'style', 'title', 'desc', 'metadata', 'text']);

/** The box a shape or a group covers on the page, or null for one that covers nothing. Text is
 *  not a plate, so it adds nothing to a group's box. */
export function boxOf(el) {
  const pts = [];
  const walk = (e) => {
    if (NOT_DRAWN.has(e.tag)) return;
    const m = matrixOf(e);
    for (const p of ownPoints(e)) pts.push(apply(m, p));
    e.children.forEach(walk);
  };
  walk(el);
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Where a text object sits: its own x and y (or its first line's) through every transform. That
 *  is the point on its baseline the text is anchored to, which is inside the plate it sits on. */
export function anchorOf(text) {
  const first = (v) => numbers(v)[0];
  let x = first(text.attrs.x);
  let y = first(text.attrs.y);
  const line = text.children.find((c) => c.tag === 'tspan');
  if (x === undefined) x = first(line?.attrs.x) ?? 0;
  if (y === undefined) y = first(line?.attrs.y) ?? 0;
  return apply(matrixOf(text), [x, y]);
}

const holds = (box, [x, y]) => box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

// ── The rules ────────────────────────────────────────────────────────────────────────────────

/** A taught name: words of ASCII letters and digits split by single spaces, starting with a
 *  capital or a digit, the row (one letter or one number) last. `static:` and `f:` may lead. */
const NAME_SHAPE = /^[A-Z0-9][A-Za-z0-9]*(?: [A-Za-z0-9]+)*$/;

function prefixOf(name) {
  const m = /^(static|f|field):\s*(.*)$/i.exec(name);
  return m ? { prefix: m[1].toLowerCase(), bare: m[2] } : { prefix: '', bare: name };
}

/** Why a name is not spelled the taught way, or null. */
function shapeProblem(name) {
  if (/[^\x20-\x7e]/.test(name)) return `"${name}" is not plain English - write every layer name in English`;
  const { bare } = prefixOf(name);
  if (!NAME_SHAPE.test(bare)) return `"${name}" is not spelled the taught way - words split by single spaces, starting with a capital: "Answer A", "Full time"`;
  const tokens = bare.split(' ');
  const keys = tokens.filter((t) => /^(?:[A-Za-z]|\d+)$/.test(t));
  if (keys.length > 1) return `"${name}" carries two rows - one letter or one number, once`;
  if (keys.length === 1 && /^[a-z]$/.test(keys[0])) return `"${name}" writes its row in lower case - a row letter is a capital`;
  if (keys.length === 1 && tokens[tokens.length - 1] !== keys[0]) return `"${name}" puts its row first - the row goes last, after a space: "${tokens.filter((t) => t !== keys[0]).join(' ')} ${keys[0]}"`;
  return null;
}

/** The word of a name without its row: "Answer box A" -> "Answer box". */
const headOf = (name) => rowTokenOf(name).head;
const rowOf = (name) => rowTokenOf(name).key;

/** The plate name of a text: its word, then "box", then its row. */
export const plateName = (textName, word = 'box') => {
  const { key, head } = rowTokenOf(textName);
  return key ? `${head} ${word} ${key}` : `${head} ${word}`;
};

/** The words a text object reads, its runs joined, whitespace collapsed. */
function textOf(el) {
  return (el.text + el.children.map(textOf).join(' ')).replace(/\s+/g, ' ').trim();
}

/** The role of a drawn layer a behaviour binds by its name (`Selected A`, `Strike 1`, the
 *  standings' `Row 1`), spelled the taught way: a per-row role is its taught word plus a row,
 *  any other role is its taught name exactly. */
function drawnRoleOf(name, drawnRoles) {
  const row = rowOf(name);
  return drawnRoles.find((r) => (r.perRow ? row !== null && r.head === headOf(name) : r.teach === name));
}

/** Every role in words.json, flattened, with its taught word. */
function rolesOf(words) {
  return Object.entries(words)
    .filter(([id]) => id !== '_')
    .flatMap(([type, entry]) => entry.roles.map((role) => ({ ...role, type, head: role.countdown ? null : headOf(role.teach) })));
}

/** Find the three layers: the SVG's top-level groups, or one wrapper group's children when the
 *  file went through Illustrator as a single layer holding the three as groups. */
function layersOf(svg, names) {
  const groups = svg.children.filter((c) => c.tag === 'g');
  if (groups.length === 1 && !names.includes(layerName(groups[0])) && groups[0].children.some((c) => c.tag === 'g' && names.includes(layerName(c)))) {
    return { host: groups[0], groups: groups[0].children.filter((c) => c.tag === 'g') };
  }
  return { host: svg, groups };
}

const DRAWABLE = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'image', 'use']);

/**
 * Every way one SVG breaks the system, as `<rule>: <what>` lines; [] when it follows it.
 * Pure over the text, so the mutation test drives it with edited copies of the real files.
 */
export function auditSvg(src, { system, words }) {
  const out = [];
  const fail = (rule, what) => out.push(`${rule}: ${what}`);
  let svg;
  try {
    svg = parseSvg(src);
  } catch (error) {
    return [`parse: ${error.message}`];
  }
  const [TEXT, MOMENTS, BOARD] = system.layers;
  const hiddenClasses = hiddenClassesOf(svg);
  const roles = rolesOf(words);

  // layers
  const { host, groups } = layersOf(svg, system.layers);
  for (const stray of host.children.filter((c) => DRAWABLE.has(c.tag))) {
    fail('layers', `a <${stray.tag}>${layerName(stray) ? ` "${layerName(stray)}"` : ''} sits outside the three layers - put it in ${BOARD}`);
  }
  const byName = new Map();
  for (const g of groups) {
    const name = layerName(g);
    if (!system.layers.includes(name)) fail('layers', `the top-level layer "${name || '(unnamed)'}" is not one of ${system.layers.join(', ')}`);
    else if (byName.has(name)) fail('layers', `there are two "${name}" layers`);
    else byName.set(name, g);
  }
  if (!byName.has(TEXT)) fail('layers', `there is no "${TEXT}" layer - it holds what the operator types`);
  // Top of the Layers panel first = LAST in the file first.
  const order = groups.map(layerName).filter((n) => system.layers.includes(n)).reverse();
  const expected = system.layers.filter((n) => order.includes(n));
  if (order.join() !== expected.join()) fail('layers', `the layers run ${order.join(', ')} from the top - they go ${expected.join(', ')}`);
  for (const [name, g] of byName) if (g.children.length === 0) fail('layers', `the "${name}" layer is empty - leave it out`);

  // text
  const textLayer = byName.get(TEXT);
  const texts = [];
  for (const child of textLayer?.children ?? []) {
    const name = layerName(child);
    if (child.tag !== 'text' && !(child.tag === 'image' && prefixOf(name).prefix === 'f')) {
      fail('text', `"${name || child.tag}" in ${TEXT} is a <${child.tag}> - ${TEXT} holds text objects only; drawing goes in ${BOARD}, hidden groups in ${MOMENTS}`);
      continue;
    }
    if (!name) {
      fail('text', `a text object in ${TEXT} has no name - name it for what it is`);
      continue;
    }
    const shape = shapeProblem(name);
    if (shape) fail('english', shape);
    if (prefixOf(name).prefix === 'static') {
      fail('text', `"${name}" is fixed words - it belongs in ${BOARD}`);
      continue;
    }
    if (child.tag === 'text') texts.push({ name, el: child, anchor: anchorOf(child) });
  }
  const simple = system.simpleTypes;
  const simpleFields = new Set(simple.flatMap((t) => t.fields));
  const textRoles = roles.filter((r) => r.pool === 'text' && r.head);
  const taughtText = new Set(textRoles.map((r) => r.head));
  // A graphic with moments, or with a clock drawn as its sample (the countdown's readout has no
  // name word of its own), is a behaviour graphic even when no text name is a behaviour word.
  const moments = byName.get(MOMENTS)?.children ?? [];
  let readsAsBehaviour = moments.length > 0 || texts.some(({ el }) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(textOf(el)));
  for (const { name } of texts) {
    if (simpleFields.has(name)) continue;
    const head = headOf(name);
    const reading = textRoles.filter((r) => matchesRole(r, name));
    if (reading.length > 0) readsAsBehaviour = true;
    if (reading.length > 0 && !taughtText.has(head)) {
      const r = reading[0];
      const taught = r.perRow ? `${r.head} ${rowOf(name) ?? rowOf(r.teach)}` : r.teach;
      fail('text', `"${name}" reads as the ${r.type} ${r.label.toLowerCase()} - spell it "${taught}"`);
    }
  }
  // A simple type's field set is closed: once a graphic with no behaviour uses one of its names,
  // every text is one of that set, and the first of the set is there.
  if (!readsAsBehaviour) {
    const used = simple.filter((t) => texts.some(({ name }) => t.fields.includes(name)));
    if (used.length > 1) fail('text', `the texts mix ${used.map((t) => t.type).join(' and ')} names - a graphic is one of them`);
    for (const type of used.length === 1 ? used : []) {
      for (const { name } of texts) if (!type.fields.includes(name)) fail('text', `"${name}" is not a ${type.type} field - a ${type.type} graphic has ${type.fields.join(' and ')}`);
      if (!texts.some(({ name }) => name === type.fields[0])) fail('text', `a ${type.type} graphic has a "${type.fields[0]}" text`);
    }
  }

  // moments
  const drawnRoles = roles.filter((r) => r.pool === 'drawn' && r.head);
  const textRows = new Set(texts.map(({ name }) => rowOf(name)).filter(Boolean));
  for (const child of moments) {
    const name = layerName(child);
    if (!name) {
      fail('moments', `a <${child.tag}> in ${MOMENTS} has no name - name it for its moment: "Selected A", "Full time"`);
      continue;
    }
    const shape = shapeProblem(name);
    if (shape) fail('english', shape);
    const role = drawnRoleOf(name, drawnRoles);
    if (!role) {
      fail('moments', `"${name}" is not a moment NoaCG knows - ${MOMENTS} holds the moments of words.json ("Selected A", "Flash 1", "Full time") and bars drawn full`);
      continue;
    }
    // A gauge bar is drawn at full length and a plate that travels with its row (`place`) is
    // drawn where it starts: both stay visible. Every other moment starts switched off.
    const drawnVisible = (role.paint ?? []).some((paint) => paint === 'gauge' || paint === 'place');
    if (!drawnVisible && (child.tag !== 'g' || !isHidden(child, hiddenClasses))) fail('moments', `"${name}" must be a hidden group - a moment starts switched off`);
    if (drawnVisible && isHidden(child, hiddenClasses)) fail('moments', `"${name}" is drawn as it stands - draw a bar at full length and leave it visible`);
    if (role.perRow && !textRows.has(rowOf(name))) fail('moments', `"${name}" belongs to row ${rowOf(name)}, and no text in ${TEXT} has that row`);
  }

  // board
  const board = byName.get(BOARD);
  // Fixed words may have a plate of their own too (`Letter box A` under `static:Letter A`), so
  // they can own a plate NAME; they never count toward which plate sits under an operator text.
  const fixedTexts = [];
  const walkBoard = (el) => {
    for (const child of el.children) {
      const name = layerName(child);
      if (name && /[^\x20-\x7e]/.test(name)) fail('english', `"${name}" is not plain English - write every layer name in English`);
      if (child.tag === 'text') {
        const { prefix, bare } = prefixOf(name);
        const shape = shapeProblem(name);
        if (prefix !== 'static') fail('board', `the text "${name || '(unnamed)'}" in ${BOARD} is not ${system.fixed} - fixed words start with ${system.fixed}, and a text the operator types goes in ${TEXT}`);
        else if (shape) fail('english', shape);
        else fixedTexts.push({ name: bare, anchor: anchorOf(child) });
        continue;
      }
      if (child.tag === 'image' && prefixOf(name).prefix === 'f') fail('board', `"${name}" is a picture field - put it in ${TEXT}`);
      if (child.tag === 'g') walkBoard(child);
    }
  };
  if (board) walkBoard(board);

  // Every shape and group on the Board, at any depth, in paint order: Illustrator users group
  // their plates, and a plate inside a group is still a plate. A layer a behaviour of THIS
  // graphic binds by name (the standings' `Row 1` beside `Name 1`) belongs to the behaviour and
  // is never a plate to rename; the same `Row A` under a quiz answer is the drift this catches.
  const typesRead = new Set(texts.flatMap(({ name }) => textRoles.filter((r) => matchesRole(r, name)).map((r) => r.type)));
  const ownDrawnRoles = drawnRoles.filter((r) => typesRead.has(r.type));
  const parts = [];
  const collect = (el) => {
    for (const child of el.children) {
      if (child.tag === 'text' || NOT_DRAWN.has(child.tag)) continue;
      const name = layerName(child);
      if (!drawnRoleOf(name, ownDrawnRoles)) parts.push({ el: child, name, box: boxOf(child) });
      collect(child);
    }
  };
  if (board) collect(board);
  // The background is under every text. A shadow or a frame drawn around it holds every text
  // too, so the one named Panel wins; with none named, the first one painted is the background.
  const holdsAll = texts.length > 0 ? parts.filter((p) => texts.every((t) => holds(p.box, t.anchor))) : [];
  const background = holdsAll.find((p) => p.name === system.background) ?? holdsAll[0];
  if (background && background.name !== system.background) {
    fail('board', `"${background.name || '(unnamed)'}" is the background, under every text - name it "${system.background}"`);
  }
  if (texts.length > 0) {
    for (const p of parts) {
      if (p !== background && p.name === system.background) fail('board', `there is one "${system.background}", the background under every text - give this one another name`);
    }
  }
  const plateWord = new RegExp(`^(.*) ${system.plate}(?: ([A-Za-z]|\\d+))?$`);
  for (const t of texts) {
    const under = parts.filter((p) => p !== background && holds(p.box, t.anchor) && texts.every((o) => o === t || !holds(p.box, o.anchor)));
    if (under.length > 0 && !under.some((p) => p.name === plateName(t.name, system.plate))) {
      const names = under.map((p) => `"${p.name || '(unnamed)'}"`).join(', ');
      fail('board', `${names} ${under.length === 1 ? 'sits' : 'sit'} under "${t.name}" alone - name its plate "${plateName(t.name, system.plate)}"`);
    }
  }
  for (const p of parts) {
    const m = plateWord.exec(p.name);
    if (!m) continue;
    const owner = [...texts, ...fixedTexts].find((t) => plateName(t.name, system.plate) === p.name);
    if (!owner) fail('board', `"${p.name}" is named as a plate, and there is no "${m[2] ? `${m[1]} ${m[2]}` : m[1]}" text for it to sit under`);
    else if (!holds(p.box, owner.anchor)) fail('board', `"${p.name}" is named as the plate of "${owner.name}", and that text does not sit on it`);
  }
  return out;
}

// ── The cheat sheet ──────────────────────────────────────────────────────────────────────────

const CHEAT_MARK = 'layer-cheat-sheet';
const CHEAT_NOTE = `generated by scripts/check-example-layers.mjs from ${SYSTEM_FILE}; edit the JSON, then \`npm run write:layer-cheat-sheet\``;
const CHEAT_TITLE = 'Layer names in 30 seconds';

/** Where the five lines go, and in which form. Both skill contract copies are listed: the plugin's
 *  is otherwise a byte copy the skill build writes, and this keeps the two identical. */
export const CHEAT_TARGETS = [
  { file: 'docs.html', form: 'html' },
  { file: 'docs/SVG_AUTHORING.md', form: 'md' },
  { file: 'cli/skill/noacg-graphic/references/contract.md', form: 'md' },
  { file: 'cli/plugin/skills/noacg-graphic/references/contract.md', form: 'md' },
  { file: '.agents/skills/noacg-graphic-local/SKILL.md', form: 'md' },
  { file: '.claude/skills/noacg-graphic-local/SKILL.md', form: 'md' },
];

export function cheatBlock(lines, form, eol = '\n') {
  if (form === 'html') {
    const items = lines.map((l) => `<li>${escapeHtml(l).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`);
    return [
      `<!-- ${CHEAT_MARK}:start - ${CHEAT_NOTE} -->`,
      `<div class="callout doc-cheat" id="svg-layers-cheat">`,
      `<span class="lbl">${CHEAT_TITLE}</span>`,
      '<ul>',
      ...items,
      '</ul>',
      '</div>',
      `<!-- ${CHEAT_MARK}:end -->`,
    ].join(eol);
  }
  return [
    `<!-- ${CHEAT_MARK}:start - ${CHEAT_NOTE} -->`,
    `**${CHEAT_TITLE}** (drawing an SVG to import into NoaCG; the full system is https://noacg.studio/docs#svg-layers):`,
    '',
    ...lines.map((l) => `- ${l}`),
    `<!-- ${CHEAT_MARK}:end -->`,
  ].join(eol);
}

export function renderCheat(page, lines, form) {
  const re = new RegExp(`<!-- ${CHEAT_MARK}:start[^\\n]*-->[\\s\\S]*?<!-- ${CHEAT_MARK}:end -->`);
  if (!re.test(page)) return null;
  const eol = page.includes('\r\n') ? '\r\n' : '\n';
  return page.replace(re, () => cheatBlock(lines, form, eol));
}

// ── The run ──────────────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const dirs = args.filter((a) => !a.startsWith('--'));
  const { system, words } = readSystem();
  let failed = false;

  if (system.cheatSheet.length !== 5) {
    console.error(`check-example-layers: the cheat sheet in ${SYSTEM_FILE} is ${system.cheatSheet.length} lines - it is five, read in 30 seconds`);
    failed = true;
  }

  // The five lines, everywhere they are taught. Skipped when checking other folders.
  if (dirs.length === 0) {
    measured(CHEAT_TARGETS.length, 'cheat-sheet copies');
    for (const target of CHEAT_TARGETS) {
      const file = path.join(ROOT, target.file);
      const page = readFileSync(file, 'utf8');
      const rendered = renderCheat(page, system.cheatSheet, target.form);
      if (rendered === null) {
        console.error(`check-example-layers: ${target.file} has no <!-- ${CHEAT_MARK}:start --> ... :end --> block`);
        failed = true;
      } else if (write) {
        if (rendered !== page) writeFileSync(file, rendered);
        console.log(`check-example-layers: ${rendered === page ? 'already current' : 'written'} - ${target.file}`);
      } else if (rendered !== page) {
        console.error(`check-example-layers: the cheat sheet in ${target.file} differs from ${SYSTEM_FILE} - run \`npm run write:layer-cheat-sheet\``);
        failed = true;
      }
    }
  }
  if (write) process.exit(failed ? 1 : 0);

  // The files.
  const files = dirs.length
    ? dirs.flatMap((d) => svgsIn(path.resolve(d)).map((f) => path.relative(ROOT, f).replace(/\\/g, '/')))
    : coveredFiles().covered;
  if (dirs.length === 0) for (const [folder, why] of EXEMPT) console.log(`check-example-layers: exempt ${folder} - ${why}`);
  measured(files.length, 'example SVGs');
  for (const file of files) {
    const problems = auditSvg(readFileSync(path.resolve(ROOT, file), 'utf8'), { system, words });
    if (problems.length === 0) {
      console.log(`check-example-layers: ok ${file}`);
      continue;
    }
    failed = true;
    console.error(`check-example-layers: ${file} breaks the layer-naming system (docs.html#svg-layers):`);
    for (const p of problems) console.error(`  - ${p}`);
  }
  if (failed) {
    console.error(rules.text('templates/name-every-layer-svg-you-draw'));
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
