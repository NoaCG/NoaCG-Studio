// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/svgBind.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';
const cases = [
  ['prefixed script', `<s:script xmlns:s="${SVG}">window.svgSentinel++</s:script>`],
  ['prefixed foreign content', `<s:foreignObject xmlns:s="${SVG}"><iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="&lt;script&gt;parent.svgSentinel++&lt;/script&gt;"/></s:foreignObject>`],
  ['foreign namespace iframe', '<iframe xmlns="http://www.w3.org/1999/xhtml" srcdoc="&lt;script&gt;parent.svgSentinel++&lt;/script&gt;"/>'],
  ['HTML parser breakout', '<p><iframe srcdoc="&lt;script&gt;parent.svgSentinel++&lt;/script&gt;"/></p>'],
  ['prefixed animation', `<s:set xmlns:s="${SVG}" attributeName="href" to="javascript:window.svgSentinel++"/>`],
  ['aliased executable URL', `<a xmlns:link="${XLINK}" link:href="jav&#x09;ascript:window.svgSentinel++"><text x="2" y="20">Click</text></a>`],
  ['encoded URL whitespace', '<a href="java&#x0a;script:window.svgSentinel++"><text x="2" y="20">Click</text></a>'],
];
const observations = await withBundledPage([{ entry: fileURLToPath(new URL('../src/assets/svgImport.ts', import.meta.url)), globalName: 'SVG_IMPORT' }], async page => {
  await page.route('**/*', route => route.abort());
  const rows = [];
  for (const [name, markup] of cases) {
    rows.push(await page.evaluate(async ({ name, markup, SVG }) => {
      window.svgSentinel = 0;
      const observed = [];
      const append = document.body.append;
      const inspect = root => Array.from(root.querySelectorAll('*')).filter(node =>
        ['script', 'iframe', 'foreignobject', 'animate', 'set'].includes(node.localName.toLowerCase()) ||
        Array.from(node.attributes).some(attr => attr.localName.toLowerCase() === 'href' && /^javascript:/i.test(attr.value.replace(/[\t\r\n]/g, '').trim()))
      ).map(node => node.outerHTML);
      document.body.append = function (...nodes) {
        for (const node of nodes) if (node instanceof Element) observed.push(...inspect(node));
        return append.apply(this, nodes);
      };
      let result;
      try { result = window.SVG_IMPORT.importSvgMarkup(`<svg xmlns="${SVG}" width="100" height="40">${markup}<path d="M1 1L20 20"/></svg>`); }
      finally { document.body.append = append; }
      const rendered = document.createElement('div');
      rendered.innerHTML = result.markup;
      const reparsed = inspect(rendered);
      document.body.append(rendered);
      await new Promise(resolve => setTimeout(resolve, 0));
      const executed = window.svgSentinel;
      rendered.remove();
      return { name, observed, reparsed, executed };
    }, { name, markup, SVG }));
  }
  const control = await page.evaluate(({ SVG, XLINK }) => {
    const source = `<svg xmlns="${SVG}" xmlns:xlink="${XLINK}" width="200" height="100"><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient><path id="curve" d="M5 50L180 50"/></defs><style>.label{fill:green}</style><rect width="200" height="100" fill="url(#paint)"/><use xlink:href="#curve"/><text class="label"><textPath href="#curve">Ordinary artwork</textPath></text><image href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=" width="1" height="1"/></svg>`;
    const result = window.SVG_IMPORT.importSvgMarkup(source);
    const doc = new DOMParser().parseFromString(result.markup, 'image/svg+xml');
    return { notices: result.notices, sample: result.candidates.map(row => row.sample), gradient: doc.querySelector('rect').getAttribute('fill'), use: doc.querySelector('use').getAttributeNS(XLINK, 'href'), textPath: doc.querySelector('textPath').getAttribute('href'), images: result.images.length, style: doc.querySelector('style').textContent, size: [result.width, result.height] };
  }, { SVG, XLINK });
  return { rows, control };
});

for (const row of observations.rows) test(`SVG import removes ${row.name} before live insertion and HTML reparse`, () => {
  assert.deepEqual(row.observed, [], 'active content reached the live import measurement');
  assert.deepEqual(row.reparsed, [], 'active content survived XML serialization and HTML parsing');
  assert.equal(row.executed, 0, 'the imported SVG executed code');
});
test('ordinary SVG artwork and internal image/definition references survive sanitization', () => {
  assert.deepEqual(observations.control, { notices: [], sample: ['Ordinary artwork'], gradient: 'url(#paint)', use: '#curve', textPath: '#curve', images: 1, style: '.label{fill:green}', size: [200, 100] });
});
