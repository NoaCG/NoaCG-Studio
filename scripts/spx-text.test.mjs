// guards: src/export/spxText.ts
//
// SPX HANDS EVERY VALUE OVER HTML-ESCAPED (issue #788, docs/SPX_ON_A_REAL_SERVER.md §11): its
// `cleanUpString` turns a line break into <br> and then & > < " ' \ into entities, and NoaCG
// templates write values as text, so the codes went on air. These run the text script the SPX
// package appends, in a context of its own, against a template's update() written the way the
// NoaCG contract writes it, and feed it values the way SPX delivers them.

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const { SPX_TEXT_JS, spxTextJs, spxTextScript, SPX_TEXT_SCRIPT_ID } = await import('../src/export/spxText.ts');

/** SPX 1.4.1's cleanUpString (utils/spx_server_functions.js), verbatim, minus its log line. */
function cleanUpString(str) {
  let temp1 = str.replace(/\n/g, '<br>');
  let temp2 = temp1.replace(/\r/g, '');
  temp2 = temp2.replace(/&/g, '&amp;');
  temp2 = temp2.replace(/>/g, '&gt;');
  temp2 = temp2.replace(/</g, '&lt;');
  temp2 = temp2.replace(/"/g, '&quot;');
  temp2 = temp2.replace(/'/g, '&#039;');
  temp2 = temp2.replace(/\\/g, '&#92;');
  return temp2;
}

/** A page with js/template.js loaded (the contract's setFieldValue and update), then, when asked,
 *  the SPX package's text script after it, as the package's HTML orders them. */
function page({ withScript = true, script = SPX_TEXT_JS, templateJs } = {}) {
  const elements = {};
  const el = (id, tagName = 'DIV') =>
    (elements[id] = {
      id, tagName, textContent: '', innerHTML: '', src: '', style: {}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = String(value); },
      removeAttribute(name) { delete this.attributes[name]; },
    });
  const context = { document: { getElementById: (id) => elements[id] ?? null } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    templateJs ??
      `function setFieldValue(el, value) {
        if (el.tagName === 'IMG') { el.src = value || ''; return; }
        el.textContent = value == null ? '' : String(value);
      }
      function update(data) {
        var fields = (typeof data === 'string') ? JSON.parse(data) : data;
        for (var key in fields) { var el = document.getElementById(key); if (el) setFieldValue(el, fields[key]); }
      }`,
    context,
  );
  if (withScript) vm.runInContext(script, context);
  /** What SPX does on Play or Update: escape each value, send the fields as a JSON string. */
  const spxUpdate = (fields) =>
    context.update(JSON.stringify(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, cleanUpString(v)]))));
  return { context, el, elements, spxUpdate };
}

test('a value SPX escaped goes on air as typed', () => {
  const { el, spxUpdate } = page();
  const name = el('f0');
  const items = el('f1');
  const path = el('f2');
  spxUpdate({ f0: "Anna O'Brien & Sons", f1: 'Line one\nLine two <b> "quoted" C:\\path', f2: 'C:\\images\\a&b.png' });
  assert.equal(name.textContent, "Anna O'Brien & Sons");
  assert.equal(items.textContent, 'Line one\nLine two <b> "quoted" C:\\path');
  assert.equal(path.textContent, 'C:\\images\\a&b.png');
});

test('the measured failure is what happens without the script', () => {
  // docs/SPX_ON_A_REAL_SERVER.md §11: Hairline aired `Anna O&#039;Brien &amp; Sons`.
  const { el, spxUpdate } = page({ withScript: false });
  const name = el('f0');
  spxUpdate({ f0: "Anna O'Brien & Sons" });
  assert.equal(name.textContent, 'Anna O&#039;Brien &amp; Sons');
});

test('a ticker\'s items arrive one per line, with no tag between them', () => {
  const { el, spxUpdate } = page();
  const items = el('f0');
  spxUpdate({ f0: 'First story\nSecond story\nThird story' });
  assert.deepEqual(items.textContent.split('\n'), ['First story', 'Second story', 'Third story']);
  assert.doesNotMatch(items.textContent, /br|&/);
});

test('SPX\'s escaping is undone exactly once', () => {
  // Text that itself looks like an entity is escaped again by SPX, so it comes back as typed.
  const { el, spxUpdate } = page();
  const f0 = el('f0');
  spxUpdate({ f0: 'AT&amp;T &lt;br&gt; &#039;' });
  assert.equal(f0.textContent, 'AT&amp;T &lt;br&gt; &#039;');
});

test('an image path is decoded like text, and a value that is not a string passes through', () => {
  const { el, context, spxUpdate } = page();
  const logo = el('f0', 'IMG');
  const score = el('f1');
  spxUpdate({ f0: 'images/rock&roll.png' });
  assert.equal(logo.src, 'images/rock&roll.png');
  context.update({ f1: 3 });
  assert.equal(score.textContent, '3');
});

test('a runtime that keeps its own copy of the payload gets the typed text too', () => {
  // The infographics keep each value in data-target for their count-up, which restores it on air.
  const templateJs = `function setFieldValue(el, value) { el.textContent = String(value); }
  function update(data) {
    var fields = (typeof data === 'string') ? JSON.parse(data) : data;
    for (var key in fields) {
      var el = document.getElementById(key);
      if (el) { setFieldValue(el, fields[key]); el.target = fields[key]; }
    }
  }`;
  const { el, spxUpdate } = page({ templateJs });
  const stat = el('f0');
  spxUpdate({ f0: "40% & rising, 5 o'clock" });
  assert.equal(stat.textContent, "40% & rising, 5 o'clock");
  assert.equal(stat.target, "40% & rising, 5 o'clock");
});

test('a payload that is not JSON reaches the template untouched', () => {
  const templateJs = `function setFieldValue() {} var seen; function update(data) { seen = data; }`;
  const { context } = page({ templateJs });
  context.update('<templateData/>');
  assert.equal(context.seen, '<templateData/>');
});

test('a template without the contract\'s text writer is left as it was', () => {
  // The blank starter and an imported SPX template set values as HTML, the way SPX expects:
  // SPX's entities and <br> render there, and decoding would turn text into markup.
  const templateJs = `function update(data) {
    var fields = (typeof data === 'string') ? JSON.parse(data) : data;
    for (var key in fields) { var el = document.getElementById(key); if (el) el.innerHTML = fields[key]; }
  }`;
  const { el, context, spxUpdate } = page({ templateJs });
  const f0 = el('f0');
  spxUpdate({ f0: '<img src=x onerror=alert(1)>' });
  assert.equal(f0.innerHTML, '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(context.setFieldValue, undefined);
});

/** The Picture graphic's update() as templates/picture.ts writes it, and as every Picture saved in
 *  a production carries it: the path goes into the src attribute, and there is no setFieldValue. */
const PICTURE_JS = `function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  var img = document.getElementById('f0');
  if (!img) return;
  if (Object.prototype.hasOwnProperty.call(fields, 'f0')) {
    var src = fields.f0 ? String(fields.f0) : '';
    if (src) { img.setAttribute('src', src); img.style.display = 'block'; }
    else { img.removeAttribute('src'); img.style.display = 'none'; }
  }
}`;

test('a picture SPX picked by a name with & or \' gets its path as named', () => {
  // Issue #888: SPX hands the filelist value over as `images/Q&amp;A.jpg`, a file that is not
  // there, so the picture was blank on air.
  const { el, spxUpdate } = page({ script: spxTextJs(['f0']), templateJs: PICTURE_JS });
  const img = el('f0', 'IMG');
  spxUpdate({ f0: 'images/Q&A.jpg' });
  assert.equal(img.attributes.src, 'images/Q&A.jpg');
  spxUpdate({ f0: "./images/O'Brien.png" });
  assert.equal(img.attributes.src, "./images/O'Brien.png");
});

test('the measured Picture failure is what a script that knows no filelist field does', () => {
  const { el, spxUpdate } = page({ script: SPX_TEXT_JS, templateJs: PICTURE_JS });
  const img = el('f0', 'IMG');
  spxUpdate({ f0: 'images/Q&A.jpg' });
  assert.equal(img.attributes.src, 'images/Q&amp;A.jpg');
});

test('without the contract\'s writer only a filelist path is decoded, never text written as HTML', () => {
  const templateJs = `function update(data) {
    var fields = (typeof data === 'string') ? JSON.parse(data) : data;
    document.getElementById('f0').setAttribute('src', fields.f0);
    document.getElementById('f1').innerHTML = fields.f1;
  }`;
  const { el, spxUpdate } = page({ script: spxTextJs(['f0']), templateJs });
  const logo = el('f0', 'IMG');
  const caption = el('f1');
  spxUpdate({ f0: 'images/rock&roll.png', f1: '<b>bold</b>' });
  assert.equal(logo.attributes.src, 'images/rock&roll.png');
  assert.equal(caption.innerHTML, '&lt;b&gt;bold&lt;/b&gt;');
});

test('the package names the template\'s filelist fields to the script', () => {
  const fields = [
    { field: 'f0', ftype: 'filelist' },
    { field: 'f1', ftype: 'textfield' },
    { field: 'f2', ftype: 'filelist' },
  ];
  assert.match(spxTextScript({ fields }), /var FILES = \["f0","f2"\];/);
  assert.match(spxTextScript({ fields: [] }), /var FILES = \[\];/);
  assert.match(spxTextJs(['</script>']), /var FILES = \["\\u003c\/script>"\];/);
});

test('the script tag carries the id the import door strips it by', () => {
  assert.equal(SPX_TEXT_SCRIPT_ID, 'noacg-spx-text');
  assert.match(spxTextScript({ fields: [] }), /^<script id="noacg-spx-text">\n[\s\S]*\n<\/script>$/);
  // ES5 for CasparCG 2.3.x's Chromium 71: no arrows, let/const, template strings or optional chaining.
  assert.doesNotMatch(spxTextJs(['f0']), /=>|\blet\b|\bconst\b|`|\?\./);
});

