// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/svgBind.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  ['aliased HTML data navigation', `<a xmlns:link="${XLINK}" link:href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;"><text x="2" y="20">Click</text></a>`],
  ['local file navigation', '<a href="file:///tmp/untrusted.html"><text x="2" y="20">Click</text></a>'],
  ['CDATA at an HTML integration point', '<title><style><![CDATA[</style><img src="data:," onerror="window.svgSentinel++">]]></style></title>'],
  ['description integration point', '<desc><style>&lt;/style&gt;&lt;img src="data:," onerror="window.svgSentinel++"&gt;</style></desc>'],
  ['HTML font breakout', '<font COLOR="red"><form action="javascript:window.svgSentinel++"><input type="submit"/></form></font>'],
  ['aliased event handler', '<path xmlns:events="urn:events" events:onload="window.svgSentinel++"/>'],
  ['XML short comment reparsing', '<!---><img src="data:," onerror="window.svgSentinel++">-->'],
  ['XML comment reparsing', '<!--><img src="data:," onerror="window.svgSentinel++">-->'],
  ['XML processing instruction reparsing', '<?probe ><img src="data:," onerror="window.svgSentinel++">?>'],
];
const observations = await withBundledPage([
  { entry: fileURLToPath(new URL('../src/assets/svgImport.ts', import.meta.url)), globalName: 'SVG_IMPORT' },
  { entry: fileURLToPath(new URL('../src/templates/importedDesign/svg.ts', import.meta.url)), globalName: 'SVG_TEMPLATE' },
], async page => {
  await page.route('**/*', route => route.abort());
  const rows = [];
  for (const [name, markup] of cases) {
    rows.push(await page.evaluate(async ({ name, markup, SVG }) => {
      window.svgSentinel = 0;
      const observed = [];
      const append = document.body.append;
      const inspect = root => Array.from(root.querySelectorAll('*')).filter(node =>
        ['script', 'iframe', 'foreignobject', 'animate', 'set', 'form', 'input'].includes(node.localName.toLowerCase()) ||
        Array.from(node.attributes).some(attr => /^on/i.test(attr.localName) || (attr.localName.toLowerCase() === 'href' && (/^javascript:/i.test(attr.value.replace(/[\t\r\n]/g, '').trim()) || (node.localName === 'a' && !attr.value.startsWith('#')))))
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
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
  const aliases = await page.evaluate(({ SVG, XLINK }) => {
    const source = `<svg xmlns="${SVG}" xmlns:link="${XLINK}" width="100" height="40" xml:base="https://example.invalid/"><defs><path id="curve" d="M0 20H80"/></defs><use link:href="#curve"/><text><textPath link:href="#curve">Local text</textPath></text><image link:href="data:image/png;base64,AA==" width="1" height="1"/><a href="#primary" link:href="#fallback"/></svg>`;
    const result = window.SVG_IMPORT.importSvgMarkup(source);
    const doc = new DOMParser().parseFromString(result.markup, 'image/svg+xml');
    return { use: doc.querySelector('use').getAttribute('href'), textPath: doc.querySelector('textPath').getAttribute('href'), images: result.images.length, primary: doc.querySelector('a').getAttribute('href'), fallback: doc.querySelector('a').getAttributeNS(XLINK, 'href'), base: doc.documentElement.getAttribute('xml:base') };
  }, { SVG, XLINK });
  const envelope = await page.evaluate(source => {
    const result = window.SVG_IMPORT.importSvgMarkup(source);
    const doc = new DOMParser().parseFromString(result.markup, 'image/svg+xml');
    const rect = doc.querySelector('rect');
    return { text: result.candidates.map(row => row.sample), panel: ['x', 'y', 'width', 'height', 'fill'].map(name => rect.getAttribute(name)), privatePayloads: doc.getElementsByTagNameNS('*', 'pgf').length };
  }, readFileSync(new URL('../e2e/fixtures/svg-corpus/illustrator-save-as-foreignobject.svg', import.meta.url), 'utf8'));
  const precedence = await page.evaluate(({ SVG, XLINK }) => {
    return [
      'href="#curve" link:href="https://example.invalid/fallback"',
      'link:href="https://example.invalid/fallback" href="#curve"',
    ].map(attributes => {
      const source = `<svg xmlns="${SVG}" xmlns:link="${XLINK}" width="100" height="40"><defs><path id="curve" d="M0 20H80"/></defs><use ${attributes}/></svg>`;
      const result = window.SVG_IMPORT.importSvgMarkup(source);
      const use = new DOMParser().parseFromString(result.markup, 'image/svg+xml').querySelector('use');
      return use ? { href: use.getAttribute('href'), fallback: use.getAttributeNS(XLINK, 'href') } : null;
    });
  }, { SVG, XLINK });
  const labels = await page.evaluate(({ SVG }) => {
    const label = 'Guest --><b data-svg-label-marker>Example</b>';
    const attribute = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const read = window.SVG_IMPORT.importSvgMarkup(`<svg xmlns="${SVG}" width="100" height="40"><text data-name="${attribute}" x="0" y="30">5:00</text></svg>`);
    return ['clock', 'credits'].map(mode => {
      const designSvg = { ...read, fields: read.candidates.map(candidate => ({ candidateId: candidate.id, title: candidate.label, sample: candidate.sample, numeric: candidate.numeric, countdown: mode === 'clock' })), images: [], outlines: [], fonts: [], behaviour: mode === 'credits' ? { kind: 'recipe', recipe: 'credits', fields: { credits: 0 }, layers: {} } : undefined };
      const template = window.SVG_TEMPLATE.IMPORTED_SVG.create({ designSvg });
      const document = new DOMParser().parseFromString(template.html, 'text/html');
      return { mode, title: template.fields[0].title, markerCount: document.querySelectorAll('[data-svg-label-marker]').length, holder: document.getElementById('f0')?.tagName };
    });
  }, { SVG });
  const attributeText = await page.evaluate(({ SVG, XLINK }) => {
    const read = window.SVG_IMPORT.importSvgMarkup(`<svg xmlns="${SVG}" xmlns:link="${XLINK}" width="100" height="40"><a link:href="#&quot;&gt;&lt;b data-svg-link-marker&gt;"><text x="0" y="20">Local link</text></a></svg>`);
    const xml = new DOMParser().parseFromString(read.markup, 'image/svg+xml');
    const html = document.createElement('div');
    html.innerHTML = read.markup;
    return { xml: xml.querySelector('a').getAttribute('href'), html: html.querySelector('a').getAttribute('href'), markerCount: html.querySelectorAll('[data-svg-link-marker]').length };
  }, { SVG, XLINK });
  return { rows, control, aliases, envelope, precedence, labels, attributeText };
});

for (const row of observations.rows) test(`SVG import removes ${row.name} before live insertion and HTML reparse`, () => {
  assert.deepEqual(row, { name: row.name, observed: [], reparsed: [], executed: 0 },
    'imported SVG must not expose active content in either live DOM or execute code');
});
test('ordinary SVG artwork and internal image/definition references survive sanitization', () => {
  assert.deepEqual(observations.control, { notices: [], sample: ['Ordinary artwork'], gradient: 'url(#paint)', use: '#curve', textPath: '#curve', images: 1, style: '.label{fill:green}', size: [200, 100] });
});

test('aliased local references and image inventory survive, without a remote XML base', () => {
  assert.deepEqual(observations.aliases, { use: '#curve', textPath: '#curve', images: 1, primary: '#primary', fallback: null, base: null });
});

test('a safe SVG2 reference survives an unsafe XLink fallback in either attribute order', () => {
  assert.deepEqual(observations.precedence, [{ href: '#curve', fallback: null }, { href: '#curve', fallback: null }]);
});

test('uploaded layer titles stay text in exported clock and credits comments', () => {
  const label = 'Guest --><b data-svg-label-marker>Example</b>';
  assert.deepEqual(observations.labels, [
    { mode: 'clock', title: `${label} (minutes)`, markerCount: 0, holder: 'DIV' },
    { mode: 'credits', title: label, markerCount: 0, holder: 'DIV' },
  ]);
});

test('aliased fragment meta-characters stay attribute text across XML serialization and HTML parsing', () => {
  const value = '#"><b data-svg-link-marker>';
  assert.deepEqual(observations.attributeText, { xml: value, html: value, markerCount: 0 });
});

test('removing the Illustrator private editing payload preserves its text and panel geometry', () => {
  assert.deepEqual(observations.envelope, { text: ['Aino Virtanen', 'Student editor'], panel: ['190', '760', '880', '180', '#0D1017'], privatePayloads: 0 });
});
