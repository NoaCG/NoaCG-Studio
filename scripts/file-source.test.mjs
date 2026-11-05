// guards: src/control/fileSource.ts, src/control/sheetSource.ts, src/model/productionData.ts, src/model/shows.ts
//
// A LOCAL FILE AS A SOURCE (issue #2184), run in Node against the real module with fake file
// handles, a fake clock and lease storage.
//
// What is pinned: a CSV file reads like a Sheet tab (quoted fields with commas, quotes and line
// breaks, a BOM, the semicolons European Excel writes, blank rows kept where they are); an .xlsx
// workbook's first sheet reads as the same rows (shared and inline strings, numbers without float
// noise, booleans, dates and times as text, missing rows and cells empty); the rows go through the
// same adapters and matching as a Sheet's, under `file.<id>.`; the reader reads every 5 s and
// parses the file only when its lastModified or size moved, so a changed file writes once and an
// unchanged one never; a file over 1 MB is refused and writes nothing; a reload's lost permission
// and a computer without the file each say so, keep the values, and go stale after three reads.

import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import './lib/tsResolve.mjs';

const { FILE_MAX_BYTES, FILE_NOT_HERE, FILE_PERMISSION, createFileReader, fileAsk, fileFormatOf, fileRead, parseCsvFile, parseXlsx } = await import('../src/control/fileSource.ts');
const { offeredValues, sheetContent, SHEET_READ_MS } = await import('../src/control/sheetSource.ts');
const { isSourcePath, proposeMapping, sourceIdOf, sourcePrefix } = await import('../src/model/productionData.ts');
const { fillsFields, sourceKindWord } = await import('../src/model/shows.ts');

/** A clock whose timers run when the test moves time (scripts/feed-source.test.mjs). */
function fakeClock() {
  let now = 1_000_000;
  let seq = 0;
  const timers = new Map();
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    now: () => now,
    setTimer: (run, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        for (let i = 0; i < 6; i += 1) await settle();
      }
      now = end;
      await settle();
    },
  };
}

/** A file handle over text the test changes, as Chrome's would be. */
function fakeHandle(name, body, { lastModified = 1, permission = 'granted' } = {}) {
  const h = {
    name,
    body,
    lastModified,
    permission,
    opened: 0,
    missing: false,
    size: undefined,
    queryPermission: async () => h.permission,
    requestPermission: async () => (h.permission = 'granted'),
    getFile: async () => {
      if (h.missing) throw Object.assign(new Error('gone'), { name: 'NotFoundError' });
      h.opened += 1;
      const bytes = typeof h.body === 'string' ? new TextEncoder().encode(h.body) : h.body;
      return {
        name,
        size: h.size ?? bytes.byteLength,
        lastModified: h.lastModified,
        text: async () => new TextDecoder().decode(bytes),
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      };
    },
    /** Save the file: new content, a later lastModified. */
    save(next) {
      h.body = next;
      h.lastModified += 1000;
    },
  };
  return h;
}

/** A minimal .xlsx: the parts Excel writes, with the cells given as sheet XML. */
async function workbook(sheetRows, { shared = [], styles = null, date1904 = false } = {}) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${date1904 ? ' date1904="1"' : ''}/><sheets><sheet name="Results" sheetId="1" r:id="rId7"/><sheet name="Other" sheetId="2" r:id="rId8"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="x" Target="worksheets/sheet2.xml"/><Relationship Id="rId7" Type="x" Target="worksheets/results.xml"/></Relationships>',
  );
  zip.file('xl/worksheets/results.xml', `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`);
  zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>');
  if (shared.length > 0) zip.file('xl/sharedStrings.xml', `<sst>${shared.map((s) => `<si>${s}</si>`).join('')}</sst>`);
  if (styles) zip.file('xl/styles.xml', styles);
  return zip.generateAsync({ type: 'uint8array' });
}

const signal = () => new AbortController().signal;

// ── Parsing ───────────────────────────────────────────────────────────────────

test('a CSV file reads like a Sheet tab: quoted fields, a BOM, semicolons, blank rows where they are', () => {
  assert.deepEqual(parseCsvFile('﻿Team,Score\r\n"Smith, J","He said ""go""\nnow"\r\n'), [
    ['Team', 'Score'],
    ['Smith, J', 'He said "go"\nnow'],
  ]);
  // European Excel writes semicolons, with commas as decimal points.
  assert.deepEqual(parseCsvFile('﻿Name;Value\nTemp;21,5\nWind;"3;4"\n'), [
    ['Name', 'Value'],
    ['Temp', '21,5'],
    ['Wind', '3;4'],
  ]);
  // A blank row stays where it is: a list reads an interior one as a section break, as in a Sheet.
  const rows = parseCsvFile('One\n\nTwo\n\n');
  assert.deepEqual(rows, [['One'], [''], ['Two'], ['']]);
  assert.deepEqual(sheetContent('lines', rows).leaves, sheetContent('lines', [['One'], [''], ['Two'], ['']]).leaves);
  assert.equal(sheetContent('lines', parseCsvFile('\n\n')).empty, true);
});

test('a file’s format comes from its name', () => {
  assert.equal(fileFormatOf('Results.CSV'), 'csv');
  assert.equal(fileFormatOf('league.xlsx'), 'xlsx');
  assert.equal(fileFormatOf('old.xls'), null);
  assert.equal(fileFormatOf('notes'), null);
});

test('an .xlsx workbook’s first sheet reads as the rows a Sheet’s CSV would give', async () => {
  const styles = `<styleSheet><numFmts count="2"><numFmt numFmtId="164" formatCode="hh:mm"/><numFmt numFmtId="165" formatCode="&quot;Day &quot;0"/></numFmts>
    <cellXfs count="5"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="9"/></cellXfs></styleSheet>`;
  const bytes = await workbook(
    `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Note</t></is></c></row>
     <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>0.30000000000000004</v></c><c r="C2" t="b"><v>1</v></c></row>
     <row r="4" spans="1:4"><c r="A4" s="1"><v>46332</v></c><c r="B4" s="2"><v>0.8125</v></c><c r="C4" s="3"><v>7</v></c><c r="D4" s="4"><v>0.25</v></c></row>
     <row r="5"><c r="A5" t="str"><f>A1</f><v>Team &amp; co</v></c><c r="B5"/></row>
     <row r="6"><c r="A6"/></row>`,
    { shared: ['<t>Team</t>', '<r><t>Sc</t></r><r><t xml:space="preserve">ore</t></r><rPh><t>x</t></rPh>', '<t>Line_x000D_\nTwo</t>'], styles },
  );
  const read = await parseXlsx(bytes);
  assert.equal(read.ok, true);
  assert.deepEqual(read.rows, [
    ['Team', 'Score', '', 'Note'],
    ['Line\nTwo', '0.3', 'TRUE', ''],
    ['', '', '', ''],
    ['2026-11-06', '19:30', '7', '25%'],
    ['Team & co', '', '', ''],
  ]);
  // The 1904 date system, which old Mac workbooks use.
  const mac = await parseXlsx(await workbook('<row r="1"><c r="A1" s="1"><v>44870</v></c></row>', { styles, date1904: true }));
  assert.deepEqual(mac.rows, [['2026-11-06']]);
});

test('something that is not a workbook says so', async () => {
  const read = await parseXlsx(new TextEncoder().encode('Team,Score\n'));
  assert.equal(read.ok, false);
  assert.match(read.error, /Excel workbook/);
});

// ── The source in the shared model ────────────────────────────────────────────

test('a file’s rows match fields as a Sheet’s do, under its own `file.<id>.` paths', async () => {
  assert.equal(sourcePrefix('f1', 'file'), 'file.f1');
  assert.equal(isSourcePath('f1', 'file.f1.values.Home'), true);
  assert.equal(sourceIdOf('file.f1.lines'), 'f1');
  const source = { id: 'f1', kind: 'file', label: 'scores.xlsx', config: { name: 'scores.xlsx', format: 'xlsx', shape: 'values' } };
  assert.equal(fillsFields(source), true);
  assert.equal(sourceKindWord(source), 'File');

  const rows = (await parseXlsx(await workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>Home</t></is></c><c r="B1"><v>3</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Away</t></is></c><c r="B2"><v>1</v></c></row>'))).rows;
  const offers = offeredValues('f1', 'values', sheetContent('values', rows), 'file');
  assert.deepEqual(offers.map((o) => [o.path, o.sample]), [['file.f1.values.Home', '3'], ['file.f1.values.Away', '1']]);
  const fields = [{ key: 'f0', label: 'Home', kind: 'number' }, { key: 'f1', label: 'Away', kind: 'number' }];
  const mapping = proposeMapping(fields, offers, {}, () => null, () => true);
  assert.deepEqual(mapping.map((r) => [r.fieldId, r.path]), [['f0', 'file.f1.values.Home'], ['f1', 'file.f1.values.Away']]);
});

// ── The reader ────────────────────────────────────────────────────────────────

function reader(handle, { format = 'csv', shape = 'lines', paths = ['file.f1.lines'], have = () => handle, clock = fakeClock(), leases = new Map(), tab = 'tab-1' } = {}) {
  const r = { clock, writes: [], statuses: [] };
  r.reader = createFileReader({
    key: 'prod:f1',
    sourceId: 'f1',
    tab,
    world: 'local',
    shape,
    format,
    handle: async () => have(),
    io: {
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
      fetch: async () => {
        throw new Error('a file source never fetches');
      },
      readLease: (key) => (leases.has(key) ? structuredClone(leases.get(key)) : null),
      writeLease: (key, lease) => leases.set(key, structuredClone(lease)),
    },
    connected: () => new Set(paths),
    paused: () => false,
    write: async (patch) => {
      r.writes.push(patch);
      return true;
    },
    onStatus: (s) => r.statuses.push(s),
  });
  r.status = () => r.statuses.at(-1);
  return r;
}

test('a changed lastModified yields one new revision; an unchanged file yields none and is not parsed again', async () => {
  const handle = fakeHandle('ticker.csv', 'First\nSecond\n');
  const r = reader(handle);
  await r.clock.advance(0);
  assert.deepEqual(r.writes, [{ file: { f1: { lines: 'First\nSecond' } } }]);
  assert.equal(r.reader.parses(), 1);

  // Read every 5 s, the file untouched: looked at, never parsed or written again.
  await r.clock.advance(4 * SHEET_READ_MS);
  assert.equal(r.writes.length, 1);
  assert.equal(r.reader.parses(), 1);
  assert.ok(handle.opened >= 5);
  assert.equal(r.status().state, 'ok');

  // Saved with a new line: exactly one write at the next read, then quiet again.
  handle.save('First\nSecond\nThird\n');
  await r.clock.advance(SHEET_READ_MS);
  assert.deepEqual(r.writes.at(-1), { file: { f1: { lines: 'First\nSecond\nThird' } } });
  assert.equal(r.writes.length, 2);
  await r.clock.advance(3 * SHEET_READ_MS);
  assert.equal(r.writes.length, 2);
  assert.equal(r.reader.parses(), 2);

  // Saved again with the same content (Excel's Save): parsed, but nothing changed to write.
  handle.save('First\nSecond\nThird\n');
  await r.clock.advance(SHEET_READ_MS);
  assert.equal(r.writes.length, 2);
  assert.equal(r.reader.parses(), 3);
  r.reader.stop();
});

test('an .xlsx file is read by the same reader', async () => {
  const handle = fakeHandle('lines.xlsx', await workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>Breaking</t></is></c></row>'));
  const r = reader(handle, { format: 'xlsx' });
  // Unzipping takes real turns of the event loop, not the fake clock's.
  const unzip = () => new Promise((resolve) => setTimeout(resolve, 50));
  await r.clock.advance(0);
  await unzip();
  assert.deepEqual(r.writes, [{ file: { f1: { lines: 'Breaking' } } }]);
  handle.save(await workbook('<row r="1"><c r="A1" t="inlineStr"><is><t>Update</t></is></c></row>'));
  await r.clock.advance(SHEET_READ_MS);
  await unzip();
  assert.deepEqual(r.writes.at(-1), { file: { f1: { lines: 'Update' } } });
  r.reader.stop();
});

test('a file over 1 MB is refused and writes nothing; the list holds and goes stale', async () => {
  const handle = fakeHandle('big.csv', 'One\n');
  const r = reader(handle);
  await r.clock.advance(0);
  assert.equal(r.writes.length, 1);
  handle.save('Two\n');
  handle.size = FILE_MAX_BYTES + 1;
  await r.clock.advance(SHEET_READ_MS);
  assert.equal(r.writes.length, 1);
  assert.equal(r.status().state, 'failing');
  assert.match(r.status().error, /larger than 1 MB/);
  await r.clock.advance(2 * SHEET_READ_MS);
  assert.equal(r.status().stale, true);
  // Back under the limit: read, written, fresh.
  handle.size = undefined;
  await r.clock.advance(SHEET_READ_MS);
  assert.deepEqual(r.writes.at(-1), { file: { f1: { lines: 'Two' } } });
  assert.equal(r.status().stale, false);
  r.reader.stop();
});

test('after a reload Chrome wants permission again: the read says so and writes nothing until it is allowed', async () => {
  const handle = fakeHandle('ticker.csv', 'One\n', { permission: 'prompt' });
  const r = reader(handle);
  await r.clock.advance(0);
  assert.equal(r.writes.length, 0);
  assert.equal(handle.opened, 0);
  assert.equal(r.status().error, FILE_PERMISSION);
  assert.equal(fileAsk(r.status().error), 'allow');
  await handle.requestPermission({ mode: 'read' });
  r.reader.poke();
  await r.clock.advance(0);
  assert.deepEqual(r.writes, [{ file: { f1: { lines: 'One' } } }]);
  assert.equal(r.status().state, 'ok');
  r.reader.stop();
});

test('a computer without the file, or a file gone from its folder, says so and keeps the values', async () => {
  let have = null;
  const handle = fakeHandle('ticker.csv', 'One\n');
  const r = reader(handle, { have: () => have });
  await r.clock.advance(0);
  assert.equal(r.status().error, FILE_NOT_HERE);
  assert.equal(fileAsk(r.status().error), 'choose');
  have = handle;
  r.reader.poke();
  await r.clock.advance(0);
  assert.equal(r.writes.length, 1);
  handle.missing = true;
  await r.clock.advance(SHEET_READ_MS);
  assert.match(r.status().error, /can’t find the file/);
  // Choosing it again under the same source keeps every connection.
  assert.equal(fileAsk(r.status().error), 'choose');
  assert.equal(r.writes.length, 1);
  r.reader.stop();
});

test('a page that cannot read the file never holds the lease, so the page that can reads it', async () => {
  // Two pages sharing one lease, as two computers share a published production's row: the one
  // without the file opens first and must not keep the other from reading.
  const clock = fakeClock();
  const leases = new Map();
  const handle = fakeHandle('ticker.csv', 'One\n');
  const without = reader(null, { have: () => null, clock, leases, tab: 'laptop' });
  await clock.advance(0);
  assert.equal(without.status().error, FILE_NOT_HERE);
  assert.equal(without.status().reader, 'this');
  const held = () => [...leases.values()].some((l) => l.until > clock.now());
  assert.equal(held(), false, 'it keeps no lease');
  // Nothing reads: its reason counts as a miss, and the data goes stale after three.
  await clock.advance(2 * SHEET_READ_MS);
  assert.equal(without.status().stale, true);
  assert.equal(fileAsk(without.status().error), 'choose');
  const withFile = reader(handle, { clock, leases, tab: 'studio' });
  await clock.advance(SHEET_READ_MS);
  assert.deepEqual(withFile.writes, [{ file: { f1: { lines: 'One' } } }]);
  assert.equal(withFile.status().state, 'ok');
  handle.save('Two\n');
  await clock.advance(3 * SHEET_READ_MS);
  assert.deepEqual(withFile.writes.at(-1), { file: { f1: { lines: 'Two' } } });
  assert.equal(without.writes.length, 0);
  // The page without the file now shows the reading page's healthy status, with no button.
  assert.equal(without.status().reader, 'other');
  assert.equal(without.status().state, 'ok');
  assert.equal(without.status().stale, false);
  // A page that held the lease and then lost the file's permission lets it go.
  handle.permission = 'prompt';
  await clock.advance(SHEET_READ_MS);
  assert.equal(withFile.status().error, FILE_PERMISSION);
  assert.equal(held(), false, 'the lease was let go');
  // Now nothing reads: both pages count their misses and the data goes stale on each.
  await clock.advance(3 * SHEET_READ_MS);
  assert.equal(without.status().stale, true);
  assert.equal(withFile.status().stale, true);
  assert.equal(fileAsk(withFile.status().error), 'allow');
  without.reader.stop();
  withFile.reader.stop();
});

test('a workbook that unpacks past the limit is refused before it is inflated', async () => {
  const zip = new JSZip();
  zip.file('xl/workbook.xml', '<workbook><sheets><sheet r:id="rId1"/></sheets></workbook>');
  zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData/></worksheet>');
  zip.file('xl/sharedStrings.xml', `<sst><si><t>${'a'.repeat(21_000_000)}</t></si></sst>`);
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  assert.ok(bytes.byteLength < FILE_MAX_BYTES, 'small on disk');
  const read = await parseXlsx(bytes);
  assert.equal(read.ok, false);
  assert.match(read.error, /too large/);
});

test('a sparse workbook cannot grow into a grid past the cell limit', async () => {
  // A formatting-only cell far to the right sizes nothing.
  const styled = await parseXlsx(await workbook('<row r="1"><c r="XFD1" s="1"/></row><row r="3"><c r="A3" t="inlineStr"><is><t>Only</t></is></c></row>'));
  assert.deepEqual(styled.rows, [[''], [''], ['Only']]);
  // A value far right and another far down would fill 16,384 × 1,000 cells: refused.
  const spread = await parseXlsx(await workbook('<row r="1"><c r="XFD1" t="inlineStr"><is><t>x</t></is></c></row><row r="1000"><c r="A1000" t="inlineStr"><is><t>y</t></is></c></row>'));
  assert.equal(spread.ok, false);
  assert.match(spread.error, /too large/);
});

test('a file read that stalls past the timeout is a missed read, and reading carries on', async () => {
  const handle = fakeHandle('ticker.csv', 'One\n');
  const r = reader(handle);
  await r.clock.advance(0);
  assert.equal(r.writes.length, 1);
  // The next save's text never arrives (a disk or a sync client that hangs).
  handle.save('Two\n');
  const getFile = handle.getFile;
  handle.getFile = async () => ({ ...(await getFile()), text: () => new Promise(() => {}) });
  await r.clock.advance(SHEET_READ_MS + 10_000);
  assert.equal(r.status().state, 'failing');
  assert.match(r.status().error, /did not open in 10 seconds/);
  assert.equal(r.writes.length, 1);
  // The reader is not stuck on the stalled read: once the file answers, reading goes on.
  handle.getFile = getFile;
  await r.clock.advance(SHEET_READ_MS + 10_000);
  assert.deepEqual(r.writes.at(-1), { file: { f1: { lines: 'Two' } } });
  assert.equal(r.status().state, 'ok');
  r.reader.stop();
});

test('a file whose opening hangs (a network share, a cloud placeholder) goes stale and reading carries on', async () => {
  const handle = fakeHandle('ticker.csv', 'One\n');
  const r = reader(handle);
  await r.clock.advance(0);
  assert.equal(r.writes.length, 1);
  const getFile = handle.getFile;
  handle.getFile = () => new Promise(() => {});
  // Each turn: the check gives up at 10 s, the read gives up at 10 s, a miss; three make it stale.
  await r.clock.advance(4 * (SHEET_READ_MS + 20_000));
  assert.equal(r.status().state, 'failing');
  assert.equal(r.status().stale, true);
  assert.equal(r.writes.length, 1);
  handle.getFile = getFile;
  handle.save('Two\n');
  await r.clock.advance(SHEET_READ_MS + 20_000);
  assert.deepEqual(r.writes.at(-1), { file: { f1: { lines: 'Two' } } });
  assert.equal(r.status().stale, false);
  r.reader.stop();
});

test('the review reads a file once, through the reader’s own read', async () => {
  const handle = fakeHandle('a.csv', 'Name,Value\nHome,2\n');
  const read = await fileRead({ handle: async () => handle, format: 'csv' }).read(signal());
  assert.deepEqual(read, { ok: true, rows: [['Name', 'Value'], ['Home', '2']] });
});
