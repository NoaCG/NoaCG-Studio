// guards: src/export/targets/ografForeign.ts, src/model/foreignPackage.ts, src/export/targets/ografImport.ts, e2e/fixtures/ograf-library/**
//
// A STRANGER'S OGRAF PACKAGE AS A LIBRARY ENTRY (docs/work-specs/playout-ograf-rundown/spec.md, E3.1,
// AC-1): the two committed packages by two other authors import as foreign entries with their bytes
// untouched, their identity apart from every other id, and export back to the same revision; every
// archive bound refuses at its edge with its own words; hostile archives and references are refused
// before anything is kept; vendor metadata rides along byte for byte and gives no control; and the
// reading stays linear on hostile input (measured).
//
// No browser: zip in, record out. Rolldown bundles the real modules; JSZip is pointed at this copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import JSZip from 'jszip';
import { rawSuffix } from './rolldown-raw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(root, 'e2e/fixtures/ograf-library');

async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', external: ['jszip'], plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const code = output[0].code.replace(/from "jszip"/g, `from ${JSON.stringify(import.meta.resolve('jszip'))}`);
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

const foreign = await load(path.join(root, 'src/export/targets/ografForeign.ts'));
const model = await load(path.join(root, 'src/model/foreignPackage.ts'));
const contract = await load(path.join(root, 'src/control/ografContract.ts'));
const { importForeignOgraf, readOgrafArchive, foreignPackageZip, entryNameRefusal, withoutComments, OGRAF_ARCHIVE_LIMITS: L } = foreign;
const { verifyForeignPackage, readForeignPackage } = model;

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** A fixture's package files, as committed. */
function fixture(name) {
  const dir = path.join(FIXTURES, name, 'package');
  const files = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const full = path.join(d, e);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(path.relative(dir, full).split(path.sep).join('/'), readFileSync(full));
    }
  };
  walk(dir);
  return files;
}

/** A zip of `files` under `folder/` (none when ''), as an archiver would write it. */
async function zipOf(files, folder = 'pkg/', options = {}) {
  const zip = new JSZip();
  for (const [p, b] of files) zip.file(folder + p, b, options);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
}

/** The pinned hashes, read off PROVENANCE.md, so the table and the bytes cannot drift apart. */
const PINNED = Object.fromEntries(
  [...readFileSync(path.join(FIXTURES, 'PROVENANCE.md'), 'utf8').matchAll(/^\| `([^`]+\/package\/[^`]+)` \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1], m[2]]),
);

test('the committed packages are the bytes their provenance pins', () => {
  assert.equal(Object.keys(PINNED).length, 6);
  for (const [file, hash] of Object.entries(PINNED)) assert.equal(sha(readFileSync(path.join(FIXTURES, file))), hash, file);
  for (const name of ['ebu-scoreboard', 'nytamin-live-poll']) {
    assert.match(readFileSync(path.join(FIXTURES, name, 'LICENSE'), 'utf8'), /^MIT License/);
    for (const p of fixture(name).keys()) assert.ok(PINNED[`${name}/package/${p}`], `${name}/${p} is pinned`);
  }
});

test('two packages by two authors import as foreign entries: bytes untouched, no native scene, identity apart', async () => {
  for (const name of ['ebu-scoreboard', 'nytamin-live-poll']) {
    const files = fixture(name);
    const read = await importForeignOgraf(`${name}.zip`, await zipOf(files));
    assert.ok(read?.ok, `${name}: ${read?.reason}`);
    const { template, record } = read;
    assert.equal(template.html + template.css + template.js, '', 'no native scene');
    assert.deepEqual(template.fields, []);
    const manifest = JSON.parse(files.get(record.manifest).toString('utf8'));
    assert.equal(record.id, manifest.id);
    assert.equal(record.version, manifest.version);
    assert.deepEqual(template.ograf, { v: 1, manifest }, 'E1 reads the manifest as it came');
    // Every file kept, hashed, as an asset under its own path.
    assert.deepEqual(record.files.map((f) => f.path), [...files.keys()].sort());
    for (const f of record.files) assert.equal(f.sha256, sha(files.get(f.path)), f.path);
    const check = await verifyForeignPackage(template);
    assert.ok(check.ok, check.reason);
    for (const [p, b] of files) assert.equal(sha(Buffer.from(check.files.get(p))), sha(b), `${p} kept byte for byte`);
    // The revision is the bytes', not the archive's: another folder, another compression, the same.
    const again = await importForeignOgraf('x.zip', await zipOf(files, '', { compression: 'STORE' }));
    assert.equal(again.record.revision, record.revision);
    // One byte changed anywhere is another revision.
    const changed = new Map(files);
    const main = Buffer.from(changed.get(record.main));
    main[main.length - 1] ^= 1;
    changed.set(record.main, main);
    assert.notEqual((await importForeignOgraf('x.zip', await zipOf(changed))).record.revision, record.revision);
  }
});

test('an export is the package as imported, and re-imports to the same revision', async () => {
  for (const name of ['ebu-scoreboard', 'nytamin-live-poll']) {
    const files = fixture(name);
    const { template, record } = await importForeignOgraf(`${name}.zip`, await zipOf(files));
    const zip = await foreignPackageZip(template);
    const out = new Map();
    for (const e of Object.values(zip.files)) if (!e.dir) out.set(e.name, Buffer.from(await e.async('uint8array')));
    assert.deepEqual([...out.keys()].sort(), [...files.keys()].map((p) => `${record.id}/${p}`).sort());
    for (const [p, b] of files) assert.equal(sha(out.get(`${record.id}/${p}`)), sha(b), p);
    const back = await importForeignOgraf('back.zip', await zip.generateAsync({ type: 'uint8array' }));
    assert.equal(back.record.revision, record.revision);
    assert.equal(back.record.id, record.id);
  }
});

test('an entry whose bytes changed after import never loads or exports, and says which file', async () => {
  const { template } = await importForeignOgraf('s.zip', await zipOf(fixture('ebu-scoreboard')));
  const tampered = { ...template, assets: template.assets.map((a) => (a.path === 'graphic.mjs' ? { ...a, data: `data:text/javascript;base64,${Buffer.from('export default class {}').toString('base64')}` } : a)) };
  assert.deepEqual(await verifyForeignPackage(tampered), { ok: false, reason: 'its file graphic.mjs has changed since it was imported' });
  await assert.rejects(foreignPackageZip({ ...tampered, name: 'Scoreboard' }), /graphic\.mjs has changed/);
  const missing = { ...template, assets: template.assets.filter((a) => a.path !== 'thumbnail.webp') };
  assert.deepEqual(await verifyForeignPackage(missing), { ok: false, reason: 'its file thumbnail.webp is missing' });
  const relisted = { ...template, foreign: { ...template.foreign, files: template.foreign.files.filter((f) => f.path !== 'README.md') } };
  assert.deepEqual(await verifyForeignPackage(relisted), { ok: false, reason: 'its file list has changed since it was imported' });
  // A later record is read-only, an unreadable one too; neither is acted on.
  assert.deepEqual(readForeignPackage({ foreign: { ...template.foreign, v: 2 } }), { status: 'read-only', reason: 'was imported by a later version of NoaCG' });
  assert.equal(readForeignPackage({ foreign: { ...template.foreign, extra: 1 } }).status, 'read-only');
  assert.equal(readForeignPackage({ foreign: { ...template.foreign, main: 'nope.mjs' } }).status, 'read-only');
  assert.deepEqual(readForeignPackage({}), { status: 'absent' });
});

test('unknown vendor metadata is kept byte for byte and gives no control', async () => {
  const files = fixture('ebu-scoreboard');
  const manifest = JSON.parse(files.get('scoreboard.ograf.json').toString('utf8'));
  // A vendor's keys at the root, on a property and on an action, one of them shaped like SPX's
  // and one like NoaCG's own (without the sources that make a package ours).
  manifest.v_acme = { steps: 9, buttons: [{ id: 'explode' }], fields: { secret: 'textfield' } };
  manifest.v_spx = { playlayer: '3', out: 'manual', steps: '7' };
  manifest.v_noacg = { format: 'noacg-graphic', version: 1, type: 'lower-third' };
  manifest.schema.properties.homeShort.v_acme = { control: 'password' };
  manifest.customActions[0].v_acme = { hotkey: 'F1', destructive: true };
  const text = `${JSON.stringify(manifest, null, '\t')}\n`;
  const withVendor = new Map(files);
  withVendor.set('scoreboard.ograf.json', Buffer.from(text, 'utf8'));
  const read = await importForeignOgraf('s.zip', await zipOf(withVendor));
  assert.ok(read.ok, read.reason);
  const check = await verifyForeignPackage(read.template);
  assert.equal(Buffer.from(check.files.get('scoreboard.ograf.json')).toString('utf8'), text, 'the manifest bytes as they came');
  assert.equal(read.template.type, 'blank', 'no NoaCG type from a borrowed vendor block');
  assert.equal(read.template.html, '', 'and no native scene');
  // The operator surface is the same as without the vendor keys: no step, field or button more.
  const plain = contract.ografContract(JSON.parse(files.get('scoreboard.ograf.json').toString('utf8')));
  const vendored = contract.ografContract(manifest);
  assert.deepEqual(vendored.steps, plain.steps);
  assert.deepEqual(vendored.descriptors.map((d) => [d.id, d.kind]), plain.descriptors.map((d) => [d.id, d.kind]));
  assert.deepEqual(vendored.buttons.map((b) => b.id), plain.buttons.map((b) => b.id));
});

/** A minimal valid package, plus `extra` files and manifest changes. */
function minimal(extra = {}, manifest = {}) {
  const files = new Map([
    ['m.ograf.json', Buffer.from(JSON.stringify({ $schema: 'https://ograf.ebu.io/v1/specification/json-schemas/graphics/schema.json', id: 'acme-thing', name: 'Thing', main: 'graphic.mjs', supportsRealTime: true, supportsNonRealTime: false, ...manifest }))],
    ['graphic.mjs', Buffer.from("import './lib/a.mjs';\nexport default class extends HTMLElement {}\n")],
    ['lib/a.mjs', Buffer.from('export const a = 1;\n')],
  ]);
  for (const [p, b] of Object.entries(extra)) files.set(p, Buffer.isBuffer(b) ? b : Buffer.from(b));
  return files;
}
const reason = async (bytes) => {
  const r = await importForeignOgraf('x.zip', bytes);
  assert.equal(r?.ok, false, 'refused');
  return r.reason;
};

/** A zip with raw entry names JSZip would not write itself: built by hand, stored, one file each. */
function rawZip(entries) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data, mode } of entries) {
    const n = Buffer.from(name, 'utf8');
    const d = Buffer.from(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt32LE(crc(d), 14);
    h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    locals.push(h, n, d);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(mode ? 0x0314 : 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc(d), 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(mode ? (mode << 16) >>> 0 : 0, 38); c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, cd, end]));
}
const okEntries = () => [...minimal()].map(([name, data]) => ({ name: `pkg/${name}`, data }));

test('hostile entry names are refused before anything is kept', async () => {
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg/../../evil.mjs', data: 'x' }])), /"pkg\/\.\.\/\.\.\/evil\.mjs" climbs out of the archive with "\.\."/);
  assert.match(await reason(rawZip([...okEntries(), { name: '/etc/passwd', data: 'x' }])), /"\/etc\/passwd" is an absolute path/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'C:\\Windows\\x.dll', data: 'x' }])), /"C:\/Windows\/x\.dll" is an absolute path/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg\\..\\evil.mjs', data: 'x' }])), /climbs out/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg/a\u0000.mjs', data: 'x' }])), /control character/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg/./a.mjs', data: 'x' }])), /empty or "\." folder/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg/link', data: '/etc/passwd', mode: 0o120777 }])), /"pkg\/link" is a link/);
  assert.match(await reason(rawZip([...okEntries(), { name: 'pkg/LIB/A.MJS', data: 'x' }])), /"pkg\/LIB\/A\.MJS" is in the archive twice/);
  // The zip library would clean the first name into the second and keep only the later one: the
  // names are judged from the archive's own directory, before it does.
  assert.match(await reason(rawZip([{ name: 'pkg/../pkg/graphic.mjs', data: 'export default class {}' }, ...okEntries()])), /climbs out/);
  assert.match(await reason(rawZip([...okEntries(), { name: '../', data: '' }])), /"\.\.\/" climbs out/);
  // The same names, judged alone (the function the archive reader asks).
  assert.equal(entryNameRefusal('pkg/lib/a.mjs'), null);
  assert.equal(entryNameRefusal('pkg/lib/'), null, 'a folder entry');
});

test('every archive bound refuses one past its edge and admits its edge', async () => {
  // Path length.
  const long = (n) => `pkg/${'a'.repeat(n - 4)}`;
  assert.equal(entryNameRefusal(long(L.pathLength)), null);
  assert.match(entryNameRefusal(long(L.pathLength + 1)), /longer than 240 characters/);
  // Depth.
  const deep = (n) => `${Array.from({ length: n - 1 }, () => 'd').join('/')}/f`;
  assert.equal(entryNameRefusal(deep(L.pathDepth)), null);
  assert.match(entryNameRefusal(deep(L.pathDepth + 1)), /more than 16 folders deep/);
  // Entries: the package's three files plus filler, at the bound and one past it.
  const filler = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}.txt`, '']));
  assert.ok((await importForeignOgraf('x.zip', await zipOf(minimal(filler(L.entries - 4)), ''))).ok);
  assert.match(await reason(await zipOf(minimal(filler(L.entries - 3)), '')), /has 1001 entries; a package may have at most 1000/);
  // One file inflated: at the bound, and one byte past it (packed small, as a bomb is).
  const at = Buffer.alloc(L.fileBytes);
  assert.ok((await readOgrafArchive(await zipOf(new Map([['big.bin', at]])))).ok);
  assert.match(await reason(await zipOf(minimal({ 'big.bin': Buffer.alloc(L.fileBytes + 1) }))), /"pkg\/big\.bin" is larger than 16 MB unpacked/);
  // The whole extraction.
  const parts = Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`p${i}.bin`, Buffer.alloc(L.totalBytes / 3)]));
  assert.ok((await readOgrafArchive(await zipOf(new Map(Object.entries(parts)), ''))).ok);
  assert.match(await reason(await zipOf(minimal({ ...parts, 'one-more.bin': Buffer.alloc(1) }), '')), /unpacks to more than 48 MB/);
  // The archive itself.
  assert.match((await readOgrafArchive(new Uint8Array(L.archiveBytes + 1))).reason, /larger than 32 MB/);
  // Its references per file.
  const refs = (n) => Array.from({ length: n }, () => "import './lib/a.mjs';").join('\n');
  assert.ok((await importForeignOgraf('x.zip', await zipOf(minimal({ 'graphic.mjs': refs(L.referencesPerFile) })))).ok);
  assert.match(await reason(await zipOf(minimal({ 'graphic.mjs': refs(L.referencesPerFile + 1) }))), /graphic\.mjs names more than 2000 files/);
  // The values themselves, so a changed bound is a decision, not a drift.
  assert.deepEqual({ ...L }, { archiveBytes: 33554432, entries: 1000, fileBytes: 16777216, totalBytes: 50331648, pathLength: 240, pathDepth: 16, referencesPerFile: 2000 });
});

test('a lying end record, a zip64 one and garbage are refused with their reasons', async () => {
  const bytes = await zipOf(minimal(), '');
  const lying = new Uint8Array(bytes);
  lying[lying.length - 12] = 0xff; lying[lying.length - 11] = 0xff; // total entries 0xffff
  assert.match((await readOgrafArchive(lying)).reason, /Zip64/);
  const many = new Uint8Array(bytes);
  many[many.length - 12] = 0xe9; many[many.length - 11] = 0x03; // claims 1001
  assert.match((await readOgrafArchive(many)).reason, /1001 entries/);
  assert.match((await readOgrafArchive(new Uint8Array(100))).reason, /not a readable zip archive/);
});

test('references that leave the package or name nothing are refused with the file and the words', async () => {
  const cases = [
    [{ 'graphic.mjs': "import '../../secret.mjs';\nexport default class {}" }, /graphic\.mjs refers to "\.\.\/\.\.\/secret\.mjs", which is outside the package/],
    [{ 'graphic.mjs': "import x from '/api/me';\nexport default class {}" }, /graphic\.mjs refers to "\/api\/me", which is outside the package/],
    [{ 'graphic.mjs': "import x from './lib/%2e%2e/%2e%2e/x.mjs';\nexport default class {}" }, /outside the package/],
    [{ 'graphic.mjs': "const u = new URL('../peer/data.json', import.meta.url);\nexport default class {}" }, /outside the package/],
    [{ 'graphic.mjs': "const m = import('./nope.mjs');\nexport default class {}" }, /graphic\.mjs refers to "\.\/nope\.mjs", which the package does not contain/],
    [{ 'graphic.mjs': "import _ from 'lodash';\nexport default class {}" }, /graphic\.mjs imports "lodash", which is not a path inside the package/],
    [{ 'style.css': '@import "../theme.css";' }, /style\.css refers to "\.\.\/theme\.css", which is outside the package/],
    [{ 'style.css': '.a { background: url(img/x.png) }' }, /style\.css refers to "img\/x\.png", which the package does not contain/],
  ];
  for (const [extra, expected] of cases) assert.match(await reason(await zipOf(minimal(extra))), expected);
  assert.match(await reason(await zipOf(minimal({}, { main: '../graphic.mjs' }))), /main/);
  assert.match(await reason(await zipOf(minimal({}, { thumbnails: [{ file: 'shot.png', resolution: { width: 1, height: 1 } }] }))), /does not contain "shot\.png"/);
  assert.match(await reason(await zipOf(minimal({ 'm.ograf.json': '{ nope' }))), /m\.ograf\.json is not readable JSON/);
  // What is fine: other schemes, comments, and references inside the package.
  const fine = minimal({
    'graphic.mjs': "// import '../commented.mjs';\n/* import('../also.mjs') */\nimport { a } from './lib/a.mjs';\nconst u = 'http://x//y';\nconst img = new URL('./lib/a.mjs', import.meta.url);\nexport default class extends HTMLElement {}\n",
    'style.css': '.a { background: url(data:image/png;base64,AAAA); } .b { background: url("https://cdn.example/x.png") }',
  });
  const ok = await importForeignOgraf('x.zip', await zipOf(fine));
  assert.ok(ok.ok, ok.reason);
});

test('only a stranger\'s module Graphic takes this road; ours and an html page beside a manifest do not', async () => {
  const page = new Map([['board.html', Buffer.from('<html></html>')], ['board.ograf.json', Buffer.from(JSON.stringify({ id: 'x-y', main: 'graphic.mjs' }))]]);
  assert.equal(await importForeignOgraf('b.zip', await zipOf(page)), null, 'E1\'s html-with-manifest stays native');
  assert.equal(await importForeignOgraf('b.zip', await zipOf(new Map([['a.html', Buffer.from('<p>')]]))), null, 'an SPX zip');
  const ours = minimal({}, { v_noacg: { format: 'noacg-graphic', version: 1, type: 'lower-third', source: { html: 'a.html', css: 'a.css', js: 'a.js' } } });
  assert.equal(await importForeignOgraf('o.zip', await zipOf(ours)), null, 'a NoaCG dual package');
});

test('comments are stripped in one pass, strings kept', () => {
  assert.equal(withoutComments("a // b\nc /* d */ e 'f // g' \"h /* i\" `j // k`"), "a \nc  e 'f // g' \"h /* i\" `j // k`");
  assert.equal(withoutComments('a /* never closed'), 'a ');
});

/** Median of three runs of `fn`, in ms. */
async function time(fn) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await fn();
    runs.push(performance.now() - t);
  }
  return runs.sort((a, b) => a - b)[1];
}

test('reading hostile input stays linear: doubling the input at most about doubles the time', async () => {
  // Inputs built to make a careless reader quadratic: an unclosed comment opened over and over, an
  // import keyword with no specifier repeated, a huge run of name characters after `import`, and an
  // archive of many entries.
  const shapes = {
    comments: (n) => '/*'.repeat(n),
    imports: (n) => 'import '.repeat(n),
    names: (n) => `import ${'a '.repeat(n)}`,
    urls: (n) => 'url('.repeat(n),
  };
  for (const [label, make] of Object.entries(shapes)) {
    const ext = label === 'urls' ? 'style.css' : 'graphic.mjs';
    const run = (n) => async () => {
      const extra = { [ext]: make(n) };
      if (ext === 'graphic.mjs') extra[ext] += '\nexport default class {}';
      await importForeignOgraf('x.zip', await zipOf(minimal(extra), '', { compression: 'STORE' }));
    };
    const small = await time(run(50_000));
    const big = await time(run(100_000));
    assert.ok(big < small * 3 + 20, `${label}: ${small.toFixed(1)} ms then ${big.toFixed(1)} ms`);
    console.log(`  ${label}: 50k ${small.toFixed(1)} ms, 100k ${big.toFixed(1)} ms`);
  }
  const entries = (n) => async () => readOgrafArchive(await zipOf(new Map(Array.from({ length: n }, (_, i) => [`e${i}.txt`, Buffer.from('x')])), ''));
  const small = await time(entries(450));
  const big = await time(entries(900));
  assert.ok(big < small * 3 + 20, `entries: ${small.toFixed(1)} ms then ${big.toFixed(1)} ms`);
  console.log(`  entries: 450 ${small.toFixed(1)} ms, 900 ${big.toFixed(1)} ms`);
});

test('the bounds are this road\'s: an html zip past them is the native importer\'s, as before', async () => {
  const pack = new Map(Array.from({ length: L.entries + 5 }, (_, i) => [`t${i}.html`, Buffer.from('<p>')]));
  assert.equal(await importForeignOgraf('pack.zip', await zipOf(pack, '')), null);
  const video = new Map([['index.html', Buffer.from('<video src="clip.mp4">')], ['clip.mp4', Buffer.alloc(L.fileBytes + 1)], ['x.ograf.json', Buffer.from('{}')]]);
  assert.equal(await importForeignOgraf('video.zip', await zipOf(video, '')), null);
});
