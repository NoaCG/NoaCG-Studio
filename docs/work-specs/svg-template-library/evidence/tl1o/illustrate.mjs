// TL1o evidence, not product code: restyle the four downloaded pilot templates the way a designer
// would, then write each one out the way Adobe Illustrator 30 "Save a Copy > SVG" does (Use
// Artboards, Fonts: SVG, CSS: Style Elements, Object IDs: Layer Names), as the archived real
// exports in e2e/fixtures/illustrator-exports/ show it.
//
//   node illustrate.mjs <downloaded-svg-dir> <out-dir> <font.woff2>
//
// What a real Illustrator export does that this reproduces:
//   - the generator comment, one <defs><style> block of .stN classes, rules grouped by shared
//     declarations, short hex colours, no presentation attributes;
//   - names from the file's ids (Illustrator ignores inkscape:label on open), so `Track_1` is a
//     name with an underscore, written back escaped as `Track_x5F_1` with `data-name`;
//   - every text as `transform="translate(x y)"` with a `<tspan x="0" y="0">`, and NO text-anchor:
//     right or centred point text is written at its measured left edge;
//   - PostScript font names (`Sora-ExtraBold, Sora`) with the weight beside them;
//   - hidden groups as a `display: none` class; rounded rectangles with rx and ry;
//   - no <title>, <desc> or Inkscape namespace.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [dir, out, fontFile] = process.argv.slice(2);
if (!dir || !out || !fontFile) {
  console.error('usage: node illustrate.mjs <downloaded-svg-dir> <out-dir> <font.woff2>');
  process.exit(2);
}

// THE RESTYLE: one designer's pass over the Clean Studio files. Dark plum plates, a coral accent,
// Sora instead of Manrope, the cards moved and resized, new sample words. Layer names, live text
// and the hidden Moments stay as they are.
const C = { plate: '#17142A', accent: '#FF5A36', ink: '#FFFFFF', sub: '#B8B2D6', track: '#2E2A48', figure: '#FFB199', win: '#FFD23F' };
const rows = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1, i));

const EDITS = {
  'join-card': {
    attrs: {
      Panel: { x: 760, y: 640, width: 1040, height: 360, rx: 8, fill: C.plate },
      Accent: { x: 760, y: 640, width: 1040, height: 10, rx: 0, fill: C.accent },
      QR_plate: { x: 1480, y: 672, width: 296, height: 296, rx: 4, fill: '#FFFFFF' },
      'QR>rect': { x: 1498, y: 690, width: 260, height: 260, fill: C.plate },
    },
    text: {
      Label: { x: 800, y: 760, size: 56, fill: C.ink, text: 'Join us live' },
      Call_to_action: { x: 800, y: 828, size: 28, fill: C.sub, text: 'Point your camera here to vote' },
    },
  },
  'live-vote': {
    attrs: {
      Panel: { x: 160, y: 140, width: 1100, height: 820, rx: 0, fill: C.plate },
      Accent: { x: 160, y: 140, width: 10, height: 820, rx: 0, fill: C.accent },
      ...Object.fromEntries(rows(4, (n, i) => [`Track_${n}`, { x: 220, y: 440 + i * 118, width: 980, height: 14, rx: 7, fill: C.track }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Bar_${n}`, { x: 220, y: 440 + i * 118, width: 980, height: 14, rx: 7, fill: C.accent }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Winner_${n}>rect`, { x: 196, y: 372 + i * 118, width: 1028, height: 100, rx: 4, stroke: C.win }])),
      'Vote_badge>rect': { x: 1010, y: 180, width: 210, height: 46, rx: 4, fill: C.accent },
    },
    text: {
      Question: { x: 220, y: 290, size: 46, fill: C.ink, text: 'Which city hosts the final?' },
      ...Object.fromEntries(rows(4, (n, i) => [`Option_${n}`, { x: 220, y: 420 + i * 118, size: 34, fill: C.ink, text: ['Lisbon', 'Oslo', 'Turin', 'Leeds'][i] }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Percent_${n}`, { x: 1200, y: 420 + i * 118, size: 34, fill: C.figure }])),
      Total_votes: { x: 220, y: 910, size: 26, fill: C.sub },
      'Vote_badge>text': { x: 1115, y: 211, size: 20, fill: C.ink },
    },
  },
  'vote-results': {
    attrs: {
      Panel: { x: 100, y: 100, width: 640, height: 880, rx: 0, fill: C.plate },
      Accent: { x: 100, y: 100, width: 10, height: 880, rx: 0, fill: C.accent },
      ...Object.fromEntries(rows(4, (n, i) => [`Track_${n}`, { x: 160, y: 420 + i * 128, width: 520, height: 12, rx: 6, fill: C.track }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Bar_${n}`, { x: 160, y: 420 + i * 128, width: 520, height: 12, rx: 6, fill: C.accent }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Winner_${n}>rect`, { x: 136, y: 356 + i * 128, width: 568, height: 112, rx: 4, stroke: C.win }])),
      'Vote_badge>rect': { x: 160, y: 140, width: 230, height: 44, rx: 4, fill: C.accent },
    },
    text: {
      Question: { x: 160, y: 262, size: 36, fill: C.ink, text: 'Extra time tonight?' },
      ...Object.fromEntries(rows(4, (n, i) => [`Option_${n}`, { x: 160, y: 402 + i * 128, size: 30, fill: C.ink, text: ['Yes', 'No', 'Maybe', 'Skip'][i] }])),
      ...Object.fromEntries(rows(4, (n, i) => [`Percent_${n}`, { x: 680, y: 402 + i * 128, size: 30, fill: C.figure }])),
      Total_votes: { x: 160, y: 934, size: 22, fill: C.sub },
      'Vote_badge>text': { x: 275, y: 169, size: 18, fill: C.ink },
    },
  },
  message: {
    attrs: {
      From_box: { x: 620, y: 712, width: 460, height: 58, rx: 0, fill: C.accent },
      Message_box: { x: 620, y: 780, width: 1180, height: 210, rx: 0, fill: C.plate },
    },
    text: {
      From: { x: 648, y: 751, size: 26, fill: C.ink, text: 'Robin from Turin' },
      Message: { x: 660, y: 862, size: 34, fill: C.ink, text: 'Can you play the opening song again?' },
    },
  },
};

const font = readFileSync(fontFile).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<style>@font-face{font-family:'Sora';src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}</style><div id="host"></div>`);
await page.evaluate(() => document.fonts.load("800 40px 'Sora'"));
mkdirSync(out, { recursive: true });

for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
  const slug = file.replace(/\.svg$/, '');
  const edits = EDITS[slug];
  if (!edits) continue;
  const svg = readFileSync(path.join(dir, file), 'utf8');
  const written = await page.evaluate(({ svg, edits }) => {
    const host = document.getElementById('host');
    host.innerHTML = svg.replace(/^<\?xml[^>]*>\s*/, '');
    const root = host.querySelector('svg');
    const find = (key) => {
      const [id, child] = key.split('>');
      const el = root.querySelector(`[id="${id}"]`);
      return child ? el.querySelector(child) : el;
    };
    // 1. The restyle, on the drawing.
    for (const [key, a] of Object.entries(edits.attrs)) for (const [k, v] of Object.entries(a)) find(key).setAttribute(k, String(v));
    for (const [key, t] of Object.entries(edits.text)) {
      const el = find(key);
      el.setAttribute('x', String(t.x));
      el.setAttribute('y', String(t.y));
      el.setAttribute('font-size', String(t.size));
      if (t.fill) el.setAttribute('fill', t.fill);
      if (t.text) el.textContent = t.text;
    }
    for (const t of root.querySelectorAll('text')) t.setAttribute('font-family', 'Sora');

    // 2. Write it as Illustrator does.
    const num = (v) => String(Math.round(Number(v) * 100) / 100);
    const hex = (c) => {
      const m = /^#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3$/i.exec(c);
      return (m ? `#${m[1]}${m[2]}${m[3]}` : c).toLowerCase();
    };
    const face = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold' };
    const inherited = (el, name) => {
      for (let e = el; e && e !== root.parentElement; e = e.parentElement) if (e.getAttribute?.(name)) return e.getAttribute(name);
      return null;
    };
    const classes = new Map(); // declaration list (joined) -> class name
    const classOf = (decls) => {
      const key = decls.join(';');
      if (!classes.has(key)) classes.set(key, { name: `st${classes.size}`, decls });
      return classes.get(key).name;
    };
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const named = (el) => {
      const id = el.getAttribute('id');
      if (!id) return '';
      const escaped = id.replace(/_/g, '_x5F_').replace(/ /g, '_x20_');
      return escaped === id ? ` id="${id}"` : ` id="${escaped}" data-name="${esc(id)}"`;
    };
    const lines = [];
    const walk = (el, depth) => {
      const pad = '  '.repeat(depth);
      const tag = el.tagName.toLowerCase();
      if (tag === 'title' || tag === 'desc') return;
      if (tag === 'g') {
        const hidden = /display\s*:\s*none/.test(el.getAttribute('style') ?? '');
        const cls = hidden ? ` class="${classOf(['display: none'])}"` : '';
        lines.push(`${pad}<g${named(el)}${cls}>`);
        for (const c of el.children) walk(c, depth + 1);
        lines.push(`${pad}</g>`);
        return;
      }
      if (tag === 'rect') {
        const d = [];
        d.push(`fill: ${hex(el.getAttribute('fill') ?? '#000')}`);
        if (el.getAttribute('stroke')) d.push(`stroke: ${hex(el.getAttribute('stroke'))}`, 'stroke-miterlimit: 10', `stroke-width: ${num(el.getAttribute('stroke-width') ?? 1)}px`);
        const rx = Number(el.getAttribute('rx') ?? 0);
        const r = rx ? ` rx="${num(rx)}" ry="${num(rx)}"` : '';
        lines.push(`${pad}<rect${named(el)} class="${classOf(d)}" x="${num(el.getAttribute('x'))}" y="${num(el.getAttribute('y'))}" width="${num(el.getAttribute('width'))}" height="${num(el.getAttribute('height'))}"${r}/>`);
        return;
      }
      if (tag === 'text') {
        const size = Number(inherited(el, 'font-size'));
        const weight = Number(inherited(el, 'font-weight') ?? 400);
        const spacing = Number(inherited(el, 'letter-spacing') ?? 0);
        const d = [`fill: ${hex(inherited(el, 'fill') ?? '#000')}`, `font-family: Sora-${face[weight]}, Sora`, `font-size: ${num(size)}px`, `font-weight: ${weight}`];
        if (spacing) d.push(`letter-spacing: ${num(spacing / size)}em`);
        // Illustrator keeps no anchor: point text set right or centred is written at its left edge.
        const anchor = inherited(el, 'text-anchor') ?? 'start';
        const width = el.getComputedTextLength();
        const x = Number(el.getAttribute('x')) - (anchor === 'end' ? width : anchor === 'middle' ? width / 2 : 0);
        lines.push(`${pad}<text${named(el)} class="${classOf(d)}" transform="translate(${num(x)} ${num(el.getAttribute('y'))})"><tspan x="0" y="0">${esc(el.textContent)}</tspan></text>`);
        return;
      }
      throw new Error(`no Illustrator form written for <${tag}>`);
    };
    // Measure with the restyled font applied as Illustrator would have shown it.
    for (const t of root.querySelectorAll('text')) t.style.fontFamily = "'Sora'";
    for (const c of root.children) walk(c, 1);

    // Rules grouped the Illustrator way: classes sharing a run of declarations share one rule.
    const byDecl = new Map();
    for (const { name, decls } of classes.values()) for (const d of decls) byDecl.set(d, [...(byDecl.get(d) ?? []), name]);
    const rules = new Map();
    for (const [d, names] of byDecl) {
      const key = names.join(', ');
      rules.set(key, [...(rules.get(key) ?? []), d]);
    }
    const style = [...rules].map(([sel, ds]) => `      .${sel.split(', ').join(', .')} {\n${ds.map((d) => `        ${d};`).join('\n')}\n      }`).join('\n\n');
    const box = root.getAttribute('viewBox');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="${box}">`,
      '  <!-- Generator: Adobe Illustrator 30.1.0, SVG Export Plug-In . SVG Version: 2.1.1 Build 136)  -->',
      '  <defs>',
      '    <style>',
      style,
      '    </style>',
      '  </defs>',
      ...lines,
      '</svg>',
      '',
    ].join('\n');
  }, { svg, edits });
  writeFileSync(path.join(out, file), written);
  console.log(`${file}: ${written.length} bytes`);
}
await browser.close();
