// guards: src/control/sheetSource.ts
//
// A GOOGLE SHEET AS A SOURCE (docs/work-specs/data-sources/spec.md phase C1b; sheet-data-flow
// AC-1, AC-5 browser-lease half, AC-6, AC-8; data-sources AC-1, AC-11), run in Node against the
// real module with a fake clock, fetch and lease storage.
//
// What is pinned: a pasted link becomes a stored id and tab and the reader builds its own address;
// a read fails with a fix and no rows; rows go through the graphic's own adapter (twelve rows are
// twelve ticker lines) or keyed values; a valid empty tab writes "" and a missing keyed row writes
// nothing; only connected paths whose cell changed are written, so an operator's override holds
// until its cell changes and Resume writes only what changed while paused; three missed reads
// mark the data stale and the next good read clears it; one reader per source under a lease, a
// second tab reads nothing, an expired lease is taken over with its snapshot, and an answer that
// arrives after a handover or after Disconnect writes nothing; the inbox consumer has no writer.

import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The Sheet reader's modules are the server tick's too (api/_lib/dataTick.ts), so they import each
// other by `.js`, as the functions' emit needs; Node strips the types but keeps the extension.
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL?.includes('/src/') && /^\.\.?\/.*\.js$/.test(spec)) {
      const ts = new URL(spec.replace(/\.js$/, '.ts'), ctx.parentURL);
      if (existsSync(fileURLToPath(ts))) return next(ts.href, ctx);
    }
    return next(spec, ctx);
  },
});

const {
  SHEET_LEASE_MS,
  SHEET_READ_MS,
  SHEET_TIMEOUT_MS,
  createSheetReader,
  fieldValue,
  initialStatus,
  missedStatus,
  pathValue,
  connectedFields,
  parseSheetLink,
  readSheet,
  sheetContent,
  sheetCsvUrl,
  sheetShapeFor,
  sheetWrites,
} = await import('../src/control/sheetSource.ts');

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

// ── The link ──────────────────────────────────────────────────────────────────

test('a share link, a tab address, an export and a published CSV each become an id and a tab', () => {
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`), { link: { sheetId: ID, gid: null } });
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1234`), { link: { sheetId: ID, gid: '1234' } });
  assert.deepEqual(parseSheetLink(` https://docs.google.com/spreadsheets/d/${ID}/edit?gid=7#gid=7 `), { link: { sheetId: ID, gid: '7' } });
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=0`), { link: { sheetId: ID, gid: '0' } });
  // Signed in to several Google accounts, the address bar carries `/u/<n>`.
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/u/1/d/${ID}/edit#gid=3`), { link: { sheetId: ID, gid: '3' } });
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/e/2PACX-${ID}/pub?gid=5&single=true&output=csv`), {
    link: { sheetId: `2PACX-${ID}`, gid: '5', published: true },
  });
  for (const bad of ['', 'not a link', `https://example.com/spreadsheets/d/${ID}/edit`, 'https://docs.google.com/document/d/abc/edit', 'https://docs.google.com/spreadsheets/d/short/edit']) {
    assert.match(parseSheetLink(bad).error, /not a Google Sheets link/, bad);
  }
});

test('the reader builds the export address itself, never fetching the pasted text', () => {
  assert.equal(sheetCsvUrl({ sheetId: ID, gid: '42' }), `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=42`);
  assert.equal(sheetCsvUrl({ sheetId: ID, gid: null }), `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`);
  assert.equal(sheetCsvUrl({ sheetId: 'e1234567890', gid: '3', published: true }), 'https://docs.google.com/spreadsheets/d/e/e1234567890/pub?output=csv&gid=3&single=true');
  // Whatever followed the id in the pasted link (a query, a fragment) is gone.
  const parsed = parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?x=<script>#gid=1`).link;
  assert.equal(sheetCsvUrl(parsed), `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=1`);
});

// ── One read ──────────────────────────────────────────────────────────────────

const answer = (status, text) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
const signal = () => new AbortController().signal;

test('a read returns the cells of a CSV, quotes and line breaks included', async () => {
  const csv = 'Name,Value\r\n"Smith, ""The Rock""",007\r\n"two\nlines",=1+1\r\n';
  const read = await readSheet(async () => answer(200, csv), { sheetId: ID, gid: '0' }, signal());
  assert.deepEqual(read, { ok: true, rows: [['Name', 'Value'], ['Smith, "The Rock"', '007'], ['two\nlines', '=1+1']] });
});

test('every failed read names a fix and carries no rows', async () => {
  const link = { sheetId: ID, gid: '9' };
  const cases = [
    [async () => answer(403, ''), /not shared/],
    [async () => answer(401, ''), /not shared/],
    [async () => answer(200, '<!DOCTYPE html><html>Sign in</html>'), /not shared/],
    [async () => answer(404, ''), /can’t find the tab/],
    [async () => answer(400, ''), /can’t find the tab/],
    [async () => answer(429, ''), /refused the read \(429\)/],
    [async () => { throw new TypeError('Failed to fetch'); }, /not shared, or offline/],
  ];
  for (const [fetcher, error] of cases) {
    const read = await readSheet(fetcher, link, signal());
    assert.equal(read.ok, false);
    assert.match(read.error, error);
    assert.ok(read.fix.length > 10, 'and a fix');
    assert.equal('rows' in read, false);
  }
  assert.match((await readSheet(async () => answer(404, ''), { sheetId: ID, gid: null }, signal())).error, /can’t find the Sheet/);
  const aborted = new AbortController();
  aborted.abort();
  assert.match((await readSheet(async () => { throw new Error('aborted'); }, link, aborted.signal)).error, /did not answer in 10 seconds/);
});

// ── What the rows write ───────────────────────────────────────────────────────

const ticker = { type: 'ticker', template: { js: '' } };

test('a graphic decides the shape: a ticker reads lines, a plain graphic keyed values', () => {
  assert.equal(sheetShapeFor(ticker), 'lines');
  assert.equal(sheetShapeFor({ type: 'end-credits', template: { js: '' } }), 'credits');
  assert.equal(sheetShapeFor({ type: 'results-board', template: { js: 'x-row-cells' } }), 'standings');
  assert.equal(sheetShapeFor({ type: 'lower-third', template: { js: '' } }), 'values');
});

test('twelve rows reach a ticker as twelve lines in sheet order, through its own adapter', () => {
  const rows = Array.from({ length: 12 }, (_, i) => (i === 3 ? ['SPORT', `Story ${i + 1}`] : [`Story ${i + 1} | plain`]));
  const content = sheetContent('lines', rows);
  const lines = content.leaves.lines.split('\n');
  assert.equal(lines.length, 12);
  assert.equal(lines[0], 'Story 1 | plain');
  assert.equal(lines[3], 'SPORT\tStory 4');
  assert.equal(lines[11], 'Story 12 | plain');
  assert.equal(content.empty, false);
});

test('standings write rows and headings together; an empty tab writes "", never an array', () => {
  const standings = sheetContent('standings', [['Team', 'P', 'PTS'], ['Liquid', '5', '12']]);
  assert.deepEqual(standings.leaves, { rows: 'Liquid | 5 | 12', headers: 'P | PTS' });
  for (const shape of ['lines', 'schedule', 'credits']) {
    const empty = sheetContent(shape, []);
    assert.deepEqual(empty.leaves, { lines: '' }, shape);
    assert.equal(empty.empty, true);
  }
  assert.deepEqual(sheetContent('standings', [['', '']]).leaves, { rows: '', headers: '' });
});

test('keyed values: the data template by Field ID, Name/Value rows by name; duplicates hold, an empty Value clears', () => {
  const template = sheetContent('values', [
    ['Field ID', 'Label', 'Value'],
    ['f1', 'Away', '2'],
    ['f0', 'Home', '007'],
    ['f2', 'Clock', ''],
    ['f3', 'Twice', 'a'],
    ['f3', 'Twice', 'b'],
  ]);
  // Reordered rows and labels change nothing: the id is the key.
  assert.deepEqual(template.leaves, { 'values.f1': '2', 'values.f0': '007', 'values.f2': '' });
  assert.equal(template.labels['values.f0'], 'Home');
  assert.deepEqual(template.problems, ['f3 is on rows 5 and 6, so it keeps its value']);

  const named = sheetContent('values', [['Name', 'Value'], ['Home score', '3'], ['match.clock', '12:00'], ['', 'x'], ['2024', 'y']]);
  assert.deepEqual(named.leaves, { 'values.Home score': '3', 'values.match clock': '12:00' });
  assert.equal(named.problems.length, 2, 'a row with no usable name is reported, not guessed');
  assert.deepEqual(sheetContent('values', [['Home score', '3']]).leaves, { 'values.Home score': '3' }, 'no header row');
});

test('a read writes only connected paths whose text changed since this reader last wrote them', () => {
  const content = { leaves: { 'values.f0': '3', 'values.f1': '1', 'values.f9': 'x' } };
  const connected = new Set(['sheet.s1.values.f0', 'sheet.s1.values.f1', 'sheet.s1.values.f2', 'sheet.s2.lines']);
  const first = sheetWrites('s1', content, connected, {});
  assert.deepEqual(first.patch, { sheet: { s1: { values: { f0: '3', f1: '1' } } } }, 'f9 is not connected; s2 is another source');
  assert.deepEqual(first.missing, ['values.f2'], 'a connected row missing from the tab is reported and writes nothing');

  // Nothing changed: nothing to write. An operator's ± on f0 meanwhile is not undone.
  assert.deepEqual(sheetWrites('s1', content, connected, first.snapshot).patch, {});
  // One cell changed: one path written.
  const moved = sheetWrites('s1', { leaves: { ...content.leaves, 'values.f1': '2' } }, connected, first.snapshot);
  assert.deepEqual(moved.patch, { sheet: { s1: { values: { f1: '2' } } } });
  // A newly connected path is written at once, though its cell did not change.
  const more = sheetWrites('s1', { leaves: { ...content.leaves, 'values.f1': '2', 'values.f2': '' } }, connected, moved.snapshot);
  assert.deepEqual(more.patch, { sheet: { s1: { values: { f2: '' } } } });
});

// ── The reader, with a fake clock ─────────────────────────────────────────────

/** A clock whose timers run when the test moves time, each after the promises before it. */
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
    /** Move time on by `ms`, running every timer due on the way. */
    async advance(ms) {
      const end = now + ms;
      await settle();
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].run();
        await settle();
        await settle();
      }
      now = end;
      await settle();
    },
  };
}

/** One browser: its lease storage, and a Sheet whose answers the test sets. */
function browser() {
  const clock = fakeClock();
  const leases = new Map();
  const sheet = { status: 200, csv: 'one\ntwo\n', fetches: 0, hold: null };
  const fetcher = async () => {
    sheet.fetches += 1;
    if (sheet.hold) await sheet.hold.promise;
    if (sheet.status === 0) throw new TypeError('Failed to fetch');
    return answer(sheet.status, sheet.csv);
  };
  const io = {
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    fetch: fetcher,
    readLease: (key) => (leases.has(key) ? structuredClone(leases.get(key)) : null),
    writeLease: (key, lease) => leases.set(key, structuredClone(lease)),
  };
  return { clock, leases, sheet, io };
}

/** A tab's reader of source s1, connected to `paths`, recording what it writes and says. */
function tab(b, name, { paths = ['sheet.s1.lines'], shape = 'lines', world = 'local', inbox, landed = true } = {}) {
  const t = { writes: [], statuses: [], paused: false, frozen: false, connected: new Set(paths) };
  // A tab whose page froze runs no timers, as a suspended tab does.
  const io = { ...b.io, setTimer: (run, ms) => b.io.setTimer(() => (t.frozen ? undefined : run()), ms) };
  t.reader = createSheetReader({
    key: 'prod-1:s1',
    sourceId: 's1',
    link: { sheetId: ID, gid: '0' },
    shape,
    tab: name,
    world,
    io,
    connected: () => t.connected,
    paused: () => t.paused,
    write: async (patch) => {
      t.writes.push(patch);
      return landed;
    },
    inbox,
    onStatus: (s) => t.statuses.push(s),
  });
  t.status = () => t.statuses.at(-1);
  return t;
}

test('a reader reads at once and then every 5 s, writing a changed cell once and an unchanged one never', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  assert.equal(b.sheet.fetches, 1);
  assert.deepEqual(a.writes, [{ sheet: { s1: { lines: 'one\ntwo' } } }]);
  assert.equal(a.status().state, 'ok');
  assert.equal(a.status().reader, 'this');
  const checked = a.status().checkedAt;

  await b.clock.advance(SHEET_READ_MS);
  assert.equal(b.sheet.fetches, 2);
  assert.equal(a.writes.length, 1, 'unchanged: nothing written');
  // Checked moves on, changed does not: unchanged content is not staleness.
  assert.equal(b.leases.get('prod-1:s1').status.checkedAt, checked + SHEET_READ_MS);
  assert.equal(b.leases.get('prod-1:s1').status.changedAt, checked);

  b.sheet.csv = 'one\ntwo\nthree\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { lines: 'one\ntwo\nthree' } } });
  assert.equal(a.writes.length, 2, 'a value changed once is written once');
  assert.equal(a.status().changedAt, checked + 2 * SHEET_READ_MS);
  a.reader.stop();
});

test('a valid empty tab writes "" and says empty; a failed read writes nothing and keeps the values', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  b.sheet.csv = '';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { lines: '' } } });
  assert.equal(a.status().state, 'empty');
  b.sheet.status = 403;
  const before = a.writes.length;
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, before, 'a failed read writes nothing');
  assert.equal(a.status().state, 'failing');
  assert.match(a.status().error, /not shared/);
  assert.ok(a.status().fix);
  a.reader.stop();
});

test('three missed reads mark the data stale with the time failing began; the next good read clears it, unchanged or not', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  b.sheet.status = 0;
  const since = b.clock.now() + SHEET_READ_MS;
  await b.clock.advance(SHEET_READ_MS);
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.status().stale, false, 'two misses are not stale yet');
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.status().missed, 3);
  assert.equal(a.status().stale, true, '15 seconds of misses');
  assert.equal(a.status().failingSince, since);
  b.sheet.status = 200; // the same content as before
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.status().stale, false);
  assert.equal(a.status().state, 'ok');
  assert.equal(a.status().failingSince, null);
  assert.equal(a.writes.length, 1, 'recovering with the same cells writes nothing');
  a.reader.stop();
});

test('a read that never answers is cut at 10 s and counts as missed', async () => {
  const b = browser();
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.io.fetch = async (url, { signal: s }) =>
    new Promise((_, reject) => s.addEventListener('abort', () => reject(new Error('aborted'))));
  const a = tab(b, 'A');
  await b.clock.advance(SHEET_TIMEOUT_MS);
  assert.equal(a.status().state, 'failing');
  assert.match(a.status().error, /10 seconds/);
  release();
  a.reader.stop();
});

test('a missing keyed row holds its value and is reported; an explicit empty Value clears', async () => {
  const b = browser();
  b.sheet.csv = 'Field ID,Label,Value\nf0,Home,3\nf1,Away,1\n';
  const a = tab(b, 'A', { shape: 'values', paths: ['sheet.s1.values.f0', 'sheet.s1.values.f1'] });
  await b.clock.advance(0);
  assert.deepEqual(a.writes, [{ sheet: { s1: { values: { f0: '3', f1: '1' } } } }]);
  b.sheet.csv = 'Field ID,Label,Value\nf0,Home,3\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, 1, 'the missing row writes nothing');
  assert.deepEqual(a.status().problems, ['f1 is missing from the tab, so it keeps its value']);
  b.sheet.csv = 'Field ID,Label,Value\nf0,Home,3\nf1,Away,\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { values: { f1: '' } } } });
  assert.deepEqual(a.status().problems, []);
  a.reader.stop();
});

test('a keyed row on two rows holds its value and is reported once, as doubled, not as missing', async () => {
  const b = browser();
  b.sheet.csv = 'Field ID,Label,Value\nf0,Home,3\nf1,Away,1\n';
  const a = tab(b, 'A', { shape: 'values', paths: ['sheet.s1.values.f0', 'sheet.s1.values.f1'] });
  await b.clock.advance(0);
  b.sheet.csv = 'Field ID,Label,Value\nf0,Home,3\nf1,Away,1\nf1,Away again,2\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, 1, 'the doubled row writes nothing');
  assert.deepEqual(a.status().problems, ['f1 is on rows 3 and 4, so it keeps its value']);
  a.reader.stop();
});

test('the operator wins: an override holds until its cell changes, Pause keeps it, Resume writes only what changed while paused', async () => {
  const b = browser();
  b.sheet.csv = 'Name,Value\nHome,3\nAway,1\n';
  const a = tab(b, 'A', { shape: 'values', paths: ['sheet.s1.values.Home', 'sheet.s1.values.Away'] });
  await b.clock.advance(0);
  assert.equal(a.writes.length, 1);
  // The operator presses + on Home (the tree now says 4); the Sheet still says 3, unchanged.
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, 1, 'the unchanged cell does not undo the press');

  a.paused = true;
  b.sheet.csv = 'Name,Value\nHome,3\nAway,2\n';
  const fetches = b.sheet.fetches;
  await b.clock.advance(3 * SHEET_READ_MS);
  assert.equal(b.sheet.fetches, fetches, 'paused: nothing is read');
  assert.equal(a.status().state, 'paused');
  a.paused = false;
  a.reader.poke();
  await b.clock.advance(0);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { values: { Away: '2' } } } }, 'only the cell that changed while paused');
  b.sheet.csv = 'Name,Value\nHome,5\nAway,2\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { values: { Home: '5' } } } }, 'a changed cell wins over the press');
  a.reader.stop();
});

test('a write that did not land is tried again at the next read', async () => {
  const b = browser();
  const a = tab(b, 'A', { landed: false });
  await b.clock.advance(0);
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, 2);
  assert.deepEqual(a.writes[0], a.writes[1]);
  a.reader.stop();
});

test('one reader per source: a second tab reads nothing and shows the owner’s status', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  const second = tab(b, 'B');
  await b.clock.advance(3 * SHEET_READ_MS);
  assert.equal(b.sheet.fetches, 4, 'only A read: once at once, then three times');
  assert.equal(second.writes.length, 0);
  assert.equal(second.status().reader, 'other');
  assert.equal(second.status().state, 'ok');
  a.reader.stop();
  second.reader.stop();
});

test('handover: an expired lease is read once by the next tab, with the old snapshot, so an unchanged cell keeps an override and a changed one wins', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  const second = tab(b, 'B');
  // A's page freezes (its timers stop) without letting go: its lease expires.
  a.frozen = true;
  const fetches = b.sheet.fetches;
  await b.clock.advance(SHEET_LEASE_MS);
  assert.equal(b.sheet.fetches - fetches, 1, 'the expired lease is read once, by B');
  assert.equal(second.status().reader, 'this');
  assert.deepEqual(second.writes, [], 'the unchanged cell does not overwrite what is in the tree');
  b.sheet.csv = 'one\nchanged\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(second.writes, [{ sheet: { s1: { lines: 'one\nchanged' } } }]);
  a.reader.stop();
  second.reader.stop();
});

test('an old owner’s answer after the lease moved writes nothing and cannot replace the new owner’s status or snapshot', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  // A's next read is held in flight.
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.sheet.csv = 'old answer\n';
  await b.clock.advance(SHEET_READ_MS);
  // The lease moves to B (A's claim lapsed), and B writes a newer value.
  const lease = b.leases.get('prod-1:s1');
  b.leases.set('prod-1:s1', { ...lease, until: 0 });
  b.sheet.hold = null;
  b.sheet.csv = 'newer\n';
  const second = tab(b, 'B');
  await b.clock.advance(0);
  assert.deepEqual(second.writes, [{ sheet: { s1: { lines: 'newer' } } }]);
  const newer = structuredClone(b.leases.get('prod-1:s1'));
  // Now A's old response arrives.
  release();
  await b.clock.advance(0);
  assert.equal(a.writes.length, 1, 'the old owner wrote nothing');
  assert.deepEqual(b.leases.get('prod-1:s1').snapshot, newer.snapshot);
  assert.equal(b.leases.get('prod-1:s1').owner, 'B');
  a.reader.stop();
  second.reader.stop();
});

test('a late read after Disconnect writes nothing, and Disconnect lets the lease go', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.sheet.csv = 'late\n';
  await b.clock.advance(SHEET_READ_MS);
  a.reader.stop();
  release();
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.writes.length, 1);
  assert.equal(b.leases.get('prod-1:s1').until, 0, 'another tab may take over at its next read');
});

test('publishing starts a fresh snapshot: the published tree is written in full', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  a.reader.stop();
  const published = tab(b, 'A', { world: 'slug-1' });
  await b.clock.advance(0);
  assert.deepEqual(published.writes, [{ sheet: { s1: { lines: 'one\ntwo' } } }]);
  published.reader.stop();
});

test('the inbox consumer receives rows and has no writer: a source that only feeds the inbox writes nothing', async () => {
  const b = browser();
  const seen = [];
  const inbox = (...args) => seen.push(args);
  const a = tab(b, 'A', { paths: [], inbox });
  await b.clock.advance(0);
  assert.equal(a.writes.length, 0, 'nothing reaches the tree');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].length, 1, 'the consumer is handed the rows and nothing else');
  assert.deepEqual(seen[0][0], [['one'], ['two']]);
  assert.ok(Object.isFrozen(seen[0][0][0]));
  // The same tab feeds both: one read, one reader, both consumers.
  const both = browser();
  const shared = [];
  const t2 = tab(both, 'A', { inbox: (rows) => shared.push(rows) });
  await both.clock.advance(0);
  assert.equal(both.sheet.fetches, 1);
  assert.equal(t2.writes.length, 1);
  assert.equal(shared.length, 1);
  a.reader.stop();
  t2.reader.stop();
});

test('Pause pressed while a read is in flight: its answer writes nothing, and the reader says paused', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.sheet.csv = 'changed\n';
  await b.clock.advance(SHEET_READ_MS);
  a.paused = true;
  release();
  await b.clock.advance(0);
  assert.equal(a.writes.length, 1, 'the held value stays');
  assert.equal(a.status().state, 'paused');
  a.reader.stop();
});

test('a page that slept past its lease with a read in flight writes nothing, and reads again by itself', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.sheet.csv = 'changed\n';
  await b.clock.advance(SHEET_READ_MS);
  // The lease lapses while the read is held (a sleeping laptop).
  const lease = b.leases.get('prod-1:s1');
  b.leases.set('prod-1:s1', { ...lease, until: 0 });
  b.sheet.hold = null;
  release();
  await b.clock.advance(0);
  assert.equal(a.writes.length, 1, 'the answer under the lapsed claim wrote nothing');
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { lines: 'changed' } } }, 'the reader claimed again and read');
  a.reader.stop();
});

test('a write that left a path out (not bound on the published row) retries that path only', async () => {
  const b = browser();
  b.sheet.csv = 'Name,Value\nA,1\nB,2\n';
  const a = tab(b, 'A', { shape: 'values', paths: ['sheet.s1.values.A', 'sheet.s1.values.B'], landed: ['sheet.s1.values.B'] });
  await b.clock.advance(0);
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes, [
    { sheet: { s1: { values: { A: '1', B: '2' } } } },
    { sheet: { s1: { values: { B: '2' } } } },
  ]);
  a.reader.stop();
});

test('a cell its field cannot hold writes nothing and is reported; what is written is the field’s own form of the cell', async () => {
  assert.equal(fieldValue({ kind: 'number' }, 'abc'), null);
  assert.equal(fieldValue({ kind: 'number' }, ' 3 '), '3');
  assert.equal(fieldValue({ kind: 'select', options: [{ value: 'A' }] }, 'B'), null);
  assert.equal(fieldValue({ kind: 'select', options: [{ value: 'A' }] }, ' A '), 'A', 'a padded option is the option');
  assert.equal(fieldValue({ kind: 'toggle' }, 'TRUE'), '1', 'TRUE is on, in the form the toggle reads');
  assert.equal(fieldValue({ kind: 'number' }, ''), '', 'empty clears');
  const b = browser();
  b.sheet.csv = 'Field ID,Label,Value\nf1,Score,3\nf2,Live,TRUE\n';
  const t = { writes: [], statuses: [] };
  const kinds = { 'sheet.s1.values.f1': { kind: 'number' }, 'sheet.s1.values.f2': { kind: 'toggle' } };
  const reader = createSheetReader({
    key: 'prod-1:s1', sourceId: 's1', link: { sheetId: ID, gid: '0' }, shape: 'values', tab: 'A', world: 'local', io: b.io,
    connected: () => new Set(Object.keys(kinds)),
    accept: (path, text) => fieldValue(kinds[path], text),
    paused: () => false,
    write: async (patch) => (t.writes.push(patch), true),
    onStatus: (s) => t.statuses.push(s),
  });
  await b.clock.advance(0);
  assert.deepEqual(t.writes, [{ sheet: { s1: { values: { f1: '3', f2: '1' } } } }]);
  b.sheet.csv = 'Field ID,Label,Value\nf1,Score,abc\nf2,Live,true\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(t.writes.length, 1, 'the bad cell wrote nothing, and "true" is still on');
  assert.match(t.statuses.at(-1).problems[0], /f1 holds “abc”, which not every field connected to it can show, so it keeps its value/);
  b.sheet.csv = 'Field ID,Label,Value\nf1,Score,4\nf2,Live,1\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(t.writes.at(-1), { sheet: { s1: { values: { f1: '4' } } } });
  reader.stop();
});

test('storage that refuses the lease does not silence the only open page: it keeps its lease in memory and reads', async () => {
  const b = browser();
  b.io.writeLease = () => false; // full, or private mode
  b.io.readLease = () => null;
  const a = tab(b, 'A');
  await b.clock.advance(0);
  assert.equal(b.sheet.fetches, 1);
  assert.deepEqual(a.writes, [{ sheet: { s1: { lines: 'one\ntwo' } } }]);
  assert.equal(a.status().reader, 'this');
  b.sheet.csv = 'three\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(a.writes.at(-1), { sheet: { s1: { lines: 'three' } } }, 'its snapshot lives in memory too');
  a.reader.stop();
});

test('one value feeding a toggle and a text field: TRUE is not decided by whichever field comes last', () => {
  const toggle = { kind: 'toggle' };
  const caption = { kind: 'text' };
  assert.equal(pathValue([toggle], 'TRUE'), '1');
  assert.equal(pathValue([caption], 'TRUE'), 'TRUE');
  assert.equal(pathValue([toggle, caption], 'TRUE'), null, 'their forms differ: held and reported');
  assert.equal(pathValue([caption, toggle], 'TRUE'), null, 'in either order');
  assert.equal(pathValue([toggle, caption], '1'), '1', 'a form both take is written');
  assert.equal(pathValue([{ kind: 'number' }, { kind: 'number' }], ' 3 '), '3');
  assert.equal(pathValue([], 'x'), 'x');
});

test('the fields on a path are read from each graphic as it is drawn now, and decide one value for all', () => {
  const bindings = { Board: { f1: 'sheet.s1.values.Live', f2: 'sheet.s1.values.Other' }, Caption: { f0: 'sheet.s1.values.Live' }, Gone: { f0: 'sheet.s1.values.Live' } };
  // Board's library version made f1 a toggle after it was pooled; the lookup is what the editor draws.
  const drawn = { Board: [{ key: 'f1', kind: 'toggle' }, { key: 'f2', kind: 'text' }], Caption: [{ key: 'f0', kind: 'text' }] };
  const fieldsOf = (g) => drawn[g] ?? null;
  const fields = connectedFields(bindings, 'sheet.s1.values.Live', fieldsOf);
  assert.deepEqual(fields.map((f) => f.kind), ['toggle', 'text'], 'a graphic that is gone adds nothing');
  assert.equal(pathValue(fields, 'TRUE'), null, 'the review and the reader both hold it');
  assert.equal(pathValue(connectedFields({ Board: bindings.Board }, 'sheet.s1.values.Live', fieldsOf), 'TRUE'), '1', 'the toggle alone takes 1');
});

// ── Published: the lease on the row, shared with the server tick (data-sources C2) ─────────────
// `row` stands in for migration 0097's read state behind control/hostedControl.ts
// `publishedLeaseDoor`, with the same rules: one owner, a claim that a handover changes, and a write
// that is refused in the same step once the claim has moved. The database half of these rules is
// the migration's own self-check and production-data-key-tick.spec.ts.

function row(clock) {
  const r = { owner: null, claim: null, until: 0, snapshot: {}, content: null, status: {}, tick: true, writes: [], n: 0, hold: null };
  const reader = () => (r.owner === 'tick' ? 'server' : 'other');
  r.door = (owner) => ({
    claim: async (claim) => {
      if (r.owner !== owner && r.until > clock.now()) return { held: false, status: { ...initialStatus(reader()), ...r.status, reader: reader() }, reader: reader() };
      const mine = r.owner === owner && r.claim === claim && r.until > clock.now();
      if (!mine) {
        r.owner = owner;
        r.claim = `${owner}:${(r.n += 1)}`;
      }
      r.until = clock.now() + SHEET_LEASE_MS;
      return {
        held: true,
        claim: r.claim,
        state: { snapshot: { ...r.snapshot }, content: r.content, status: { ...initialStatus('this'), ...r.status, reader: 'this', closedPage: r.tick } },
      };
    },
    settle: async (claim, writes, _patch, next) => {
      if (r.hold) await r.hold.promise;
      if (r.claim !== claim || r.until <= clock.now()) return false;
      if (Object.keys(writes).length > 0) r.writes.push({ owner, writes });
      Object.assign(r, { snapshot: next.snapshot, content: next.content, status: next.status });
      return true;
    },
    release: () => {
      if (r.owner === owner) r.until = clock.now();
    },
  });
  return r;
}

/** A published page's reader of s1, its lease on `r`. */
function page(b, r, name, { paths = ['sheet.s1.lines'] } = {}) {
  const t = { statuses: [], paused: false, connected: new Set(paths) };
  t.reader = createSheetReader({
    key: 'prod-1:s1',
    sourceId: 's1',
    link: { sheetId: ID, gid: '0' },
    shape: 'lines',
    tab: name,
    world: 'slug-1',
    io: { ...b.io, door: r.door(name) },
    connected: () => t.connected,
    paused: () => t.paused,
    write: async () => assert.fail('published, a reader writes through its lease, never the unpublished writer'),
    onStatus: (s) => t.statuses.push(s),
  });
  t.status = () => t.statuses.at(-1);
  return t;
}

test('published: the page reads under the row lease, writes changed cells once by path, and keeps its status on the row', async () => {
  const b = browser();
  const r = row(b.clock);
  const a = page(b, r, 'tab-a');
  await b.clock.advance(0);
  assert.deepEqual(r.writes, [{ owner: 'tab-a', writes: { 'sheet.s1.lines': 'one\ntwo' } }]);
  assert.equal(r.status.state, 'ok');
  assert.equal(a.status().reader, 'this');
  assert.equal(a.status().closedPage, true, 'the switch is on: the server reads once the pages close');
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(r.writes.length, 1, 'unchanged: nothing written');
  assert.equal(r.status.checkedAt, b.clock.now(), 'checked is on the row, for a reload and the tick');
  a.reader.stop();
  assert.equal(r.until, b.clock.now(), 'stopping lets the row lease go, so the tick reads at its next minute');
});

test('published: a page while the tick holds the lease reads nothing and says the server reads it; the switch off says closed-page reading is off', async () => {
  const b = browser();
  const r = row(b.clock);
  Object.assign(r, { owner: 'tick', claim: 'tick:1', until: b.clock.now() + 30_000, status: { ...initialStatus('server'), state: 'ok', checkedAt: b.clock.now() - 40_000 } });
  const a = page(b, r, 'tab-a');
  await b.clock.advance(0);
  assert.equal(b.sheet.fetches, 0);
  assert.equal(a.status().reader, 'server');
  assert.equal(a.status().checkedAt, b.clock.now() - 40_000, 'the tick’s own read, not one invented by the handover');
  // The tick lets go: the page takes over at its next read.
  r.until = b.clock.now();
  r.tick = false;
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(b.sheet.fetches, 1);
  assert.equal(a.status().reader, 'this');
  assert.equal(a.status().closedPage, false);
  a.reader.stop();
});

test('published handover from the tick: an unchanged cell keeps the operator’s override, a changed cell wins', async () => {
  const b = browser();
  const r = row(b.clock);
  // The tick wrote "one\ntwo" last; the operator has since typed over it in the tree.
  Object.assign(r, { snapshot: { 'sheet.s1.lines': 'one\ntwo' }, content: JSON.stringify({ lines: 'one\ntwo' }), owner: 'tick', claim: 'tick:1', until: 0 });
  const a = page(b, r, 'tab-a');
  await b.clock.advance(0);
  assert.equal(b.sheet.fetches, 1);
  assert.deepEqual(r.writes, [], 'the unchanged cell writes nothing over the override');
  b.sheet.csv = 'one\nchanged\n';
  await b.clock.advance(SHEET_READ_MS);
  assert.deepEqual(r.writes, [{ owner: 'tab-a', writes: { 'sheet.s1.lines': 'one\nchanged' } }]);
  a.reader.stop();
});

test('published: an old owner’s write held across a handover is refused, writes nothing and cannot replace the new owner’s snapshot or status', async () => {
  const b = browser();
  const r = row(b.clock);
  const a = page(b, r, 'tab-a');
  await b.clock.advance(0);
  // A's next write is held in flight.
  let release;
  r.hold = { promise: new Promise((resolve) => (release = resolve)) };
  b.sheet.csv = 'old answer\n';
  await b.clock.advance(SHEET_READ_MS);
  // The lease moves to the tick, which writes a newer value.
  r.hold = null;
  r.until = 0;
  const tick = r.door('tick');
  const held = await tick.claim(null);
  assert.equal(await tick.settle(held.claim, { 'sheet.s1.lines': 'newer' }, {}, { snapshot: { 'sheet.s1.lines': 'newer' }, content: 'n', status: { ...initialStatus('server'), state: 'ok' } }), true);
  const before = structuredClone({ snapshot: r.snapshot, status: r.status, content: r.content });
  const shown = a.statuses.length;
  release();
  await b.clock.advance(0);
  assert.deepEqual(r.writes.map((w) => w.owner), ['tab-a', 'tick'], 'the old owner’s answer wrote nothing');
  assert.deepEqual({ snapshot: r.snapshot, status: r.status, content: r.content }, before);
  assert.equal(a.statuses.length, shown, 'and the page invents no read it did not keep');
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(a.status().reader, 'server', 'at its next read it shows who holds the lease');
  a.reader.stop();
});

test('the status rules the tick shares: three missed minutes are stale, the time failing began is kept', () => {
  let status = { ...initialStatus('server'), state: 'ok', checkedAt: 1 };
  for (let i = 0; i < 3; i += 1) status = missedStatus(status, { error: 'can’t read it', fix: 'Share it.' }, 60_000 * (i + 1), 'server');
  assert.equal(status.stale, true);
  assert.equal(status.failingSince, 60_000);
  assert.equal(status.reader, 'server');
});
