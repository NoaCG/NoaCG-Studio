import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { rolldown } from 'rolldown';
import { rawSuffix } from '../scripts/rolldown-raw.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const entry = resolve('.noacg/e1-pivot-paint-virtual.mjs');
const bundle = await rolldown({ input: entry, platform: 'browser', logLevel: 'silent', plugins: [{
  name: 'paint-control',
  resolveId(id) { return id === entry ? id : null; },
  load(id) {
    if (id !== entry) return null;
    return `export { applyAnimation, anchorKeyReason } from '../src/blocks/editorAnimation.ts';
      export { applyGroup } from '../src/blocks/editorGroups.ts';
      export { emitAnimRegion } from '../src/templates/shared/animRuntime.ts';`;
  },
}, rawSuffix] });
const { output } = await bundle.generate({ format: 'iife', name: 'PAINT_PROBE', codeSplitting: false });
await bundle.close();
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: output[0].code });
  const gsapCode = readFileSync(new URL('../src/assets/gsap.min.js', import.meta.url), 'utf8');
  const rows = await page.evaluate(gsapCode => {
    const api = window.PAINT_PROBE;
    const data = { version: 2, speed: 1, root: '#root', steps: [{ name: 'In', duration: 1, ease: 'none', layers: {} }, { name: 'Out', duration: .75, ease: 'none', layers: {} }] };
    const documentOf = (template, play) => {
      const frame = document.body.appendChild(document.createElement('iframe'));
      const doc = frame.contentDocument;
      doc.open(); doc.write(template.html.replace('</head>', '<style>' + template.css + '</style></head>')); doc.close();
      if (play) {
        for (const code of [gsapCode, template.js]) {
          const script = doc.createElement('script'); script.textContent = code; doc.body.appendChild(script);
        }
        const timeline = frame.contentWindow.buildStepTimeline(0);
        timeline.pause().time(.5, true);
      }
      return { read: (selector, property) => frame.contentWindow.getComputedStyle(doc.querySelector(selector)).getPropertyValue(property), close: () => frame.remove() };
    };
    const source = (body, css) => ({ name: 'Pivot paint', type: 'lower-third', resolution: { width: 1920, height: 1080 }, fps: 25,
      html: '<!doctype html><html><head></head><body><div id="root">' + body + '</div></body></html>',
      css, js: api.emitAnimRegion(data), fields: [], settings: { steps: '1' }, assets: [], layers: [] });
    const inspect = (label, template, owner, target, property, baseValues, channel = 'noacgAnchorX', play = false) => {
      const initial = documentOf(template, false), before = initial.read(target, property); initial.close();
      const reason = api.anchorKeyReason(template, owner);
      if (reason) return { label, before, reason };
      const key = (time, value) => ({ kind: 'animation.key', selector: owner, property: channel, step: 0, time, value, action: 'set', baseValues });
      try {
        const keyed = api.applyAnimation(template, key(0, baseValues.anchorX));
        const current = documentOf(play ? api.applyAnimation(keyed, key(.5, 80)) : keyed, play);
        const after = current.read(target, property); current.close();
        return { label, before, after };
      } catch (error) { return { label, before, refusal: error.message }; }
    };
    const positioned = '#box { position: absolute; left: 20px; top: 20px; width: 320px; height: 100px; }';
    const html = '<div id="box" data-gfx><span id="child">Child</span></div>';
    const baseValues = { anchorX: 160, anchorY: 50 };
    const groupSource = source('<svg width="960" height="270"><rect id="a" data-gfx width="90" height="60"/><rect id="b" data-gfx x="180" width="90" height="60"/></svg>', '#a { stroke-width: var(--base-anchor-x, 135px); }');
    const grouped = api.applyGroup(groupSource, { kind: 'group.create', selectors: ['#a', '#b'], box: { x: 0, y: 0, width: 270, height: 60 } }).template;
    return [
      inspect('HTML descendant', source(html, positioned + '#child { padding-left: var(--base-anchor-x, 10px); }'), '#box', '#child', 'padding-left', baseValues),
      inspect('HTML owner alias', source(html, positioned + '#box { --measure: var(--base-anchor-x, 10px); padding-left: var(--measure); }'), '#box', '#box', 'padding-left', baseValues),
      inspect('SVG presentation attribute', source('<svg class="imported-design-art" width="960" height="270"><text id="text" data-gfx x="20" y="60"><tspan id="child" stroke-width="var(--base-anchor-x, 3px)">Text</tspan></text></svg>', ''), '#text', '#child', 'stroke-width', { anchorX: 30, anchorY: 15 }),
      inspect('Canonical member motion', grouped, '#group-1', '#a', 'stroke-width', { anchorX: 135, anchorY: 30 }, '--base-anchor-x', true),
      inspect('Locally shielded HTML descendant', source(html, positioned + '#child { --base-anchor-x: 10px; padding-left: var(--base-anchor-x); }'), '#box', '#child', 'padding-left', baseValues),
    ];
  }, gsapCode);
  console.log(JSON.stringify({ head: git('rev-parse', 'HEAD'), rows }, null, 2));
  if (rows.some(row => row.before !== row.after && !row.reason)) process.exitCode = 1;
} finally { await browser.close(); }
