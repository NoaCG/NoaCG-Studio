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
import './lib/tsResolve.mjs';

const {
  SHEET_LEASE_MS,
  SHEET_READ_MS,
  SHEET_TIMEOUT_MS,
  createSheetReader,
  fieldValue,
  initialStatus,
  latestWriter,
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

test('an old owner’s late read after the lease moved feeds the inbox nothing (data-sources C3)', async () => {
  const b = browser();
  const seen = [];
  const a = tab(b, 'A', { paths: [], inbox: (rows) => seen.push(rows) });
  await b.clock.advance(0);
  assert.equal(seen.length, 1);
  // A's next read is held in flight while the lease moves to B, which reads a newer tab.
  let release;
  b.sheet.hold = { promise: new Promise((r) => (release = r)) };
  b.sheet.csv = 'old answer\n';
  await b.clock.advance(SHEET_READ_MS);
  const lease = b.leases.get('prod-1:s1');
  b.leases.set('prod-1:s1', { ...lease, until: 0 });
  b.sheet.hold = null;
  b.sheet.csv = 'newer\n';
  const fresh = [];
  const second = tab(b, 'B', { paths: [], inbox: (rows) => fresh.push(rows) });
  await b.clock.advance(0);
  assert.deepEqual(fresh.at(-1), [['newer']]);
  release();
  await b.clock.advance(0);
  assert.equal(seen.length, 1, 'the old owner’s answer reaches no inbox');
  assert.equal(a.reader.holds(), false, 'and it knows it no longer holds the lease');
  assert.equal(second.reader.holds(), true);
  a.reader.stop();
  second.reader.stop();
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
    settle: async (claim, writes, next) => {
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
  assert.equal(await tick.settle(held.claim, { 'sheet.s1.lines': 'newer' }, { snapshot: { 'sheet.s1.lines': 'newer' }, content: 'n', status: { ...initialStatus('server'), state: 'ok' } }), true);
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

test('a page going away lets its lease go, so the reloaded page reads at once, not after the lease', async () => {
  const b = browser();
  const a = tab(b, 'A');
  await b.clock.advance(0);
  a.frozen = true;
  // pagehide: the page goes without its cleanup; it lets the lease go on the way out.
  a.reader.release();
  const again = tab(b, 'A-reloaded');
  const fetches = b.sheet.fetches;
  await b.clock.advance(0);
  assert.equal(b.sheet.fetches - fetches, 1, 'the new page read at once');
  assert.equal(again.status().reader, 'this');
  again.reader.stop();
});

test('published: a lease that cannot be reached is a missed read, said as one, and three make it stale', async () => {
  const b = browser();
  const r = row(b.clock);
  const door = r.door('tab-a');
  let down = false;
  const claim = door.claim;
  door.claim = async (c) => {
    if (down) throw new Error('Could not find the function public.control_source_lease');
    return claim(c);
  };
  const t = { statuses: [] };
  const reader = createSheetReader({
    key: 'prod-1:s1', sourceId: 's1', link: { sheetId: ID, gid: '0' }, shape: 'lines', tab: 'tab-a', world: 'slug-1',
    io: { ...b.io, door }, connected: () => new Set(['sheet.s1.lines']), paused: () => false,
    write: async () => true, onStatus: (s) => t.statuses.push(s),
  });
  await b.clock.advance(0);
  assert.equal(t.statuses.at(-1).state, 'ok');
  down = true;
  await b.clock.advance(3 * SHEET_READ_MS);
  const status = t.statuses.at(-1);
  assert.equal(status.state, 'failing');
  assert.match(status.error, /published production did not answer/);
  assert.equal(status.stale, true);
  reader.stop();
});

test('published: a Pause on the row from another page holds this page too, and it says paused without reading', async () => {
  const b = browser();
  const r = row(b.clock);
  const door = r.door('tab-a');
  const claim = door.claim;
  door.claim = async (c) => ({ ...(await claim(c)), paused: true });
  const t = { statuses: [] };
  const reader = createSheetReader({
    key: 'prod-1:s1', sourceId: 's1', link: { sheetId: ID, gid: '0' }, shape: 'lines', tab: 'tab-a', world: 'slug-1',
    io: { ...b.io, door }, connected: () => new Set(['sheet.s1.lines']), paused: () => false,
    write: async () => true, onStatus: (s) => t.statuses.push(s),
  });
  await b.clock.advance(SHEET_READ_MS);
  assert.equal(b.sheet.fetches, 0);
  assert.equal(t.statuses.at(-1).state, 'paused');
  reader.stop();
});

test('published on an instance without the row lease: the page falls back to its own lease and the operator door', async () => {
  const b = browser();
  const door = {
    claim: async () => {
      throw Object.assign(new Error('Could not find the function public.control_source_lease'), { code: 'no_lease' });
    },
    settle: async () => assert.fail('the row lease is not there'),
    release: () => {},
  };
  const writes = [];
  const reader = createSheetReader({
    key: 'prod-1:s1', sourceId: 's1', link: { sheetId: ID, gid: '0' }, shape: 'lines', tab: 'tab-a', world: 'slug-1',
    io: { ...b.io, door }, connected: () => new Set(['sheet.s1.lines']), paused: () => false,
    write: async (patch) => {
      writes.push(patch);
      return true;
    },
    onStatus: () => {},
  });
  await b.clock.advance(0);
  assert.deepEqual(writes, [{ sheet: { s1: { lines: 'one\ntwo' } } }]);
  assert.equal(b.leases.get('prod-1:s1').owner, 'tab-a', 'this browser holds the lease');
  reader.stop();
});

// ── The page's writer of the published row's sources (data-sources C2) ────────────────────────

test('the sources writer sends one write at a time and the newest value last: Pause then Resume ends resumed', async () => {
  const clock = fakeClock();
  const row = { value: null, sent: [], release: [] };
  const w = latestWriter(
    (value) =>
      new Promise((resolve) => {
        row.sent.push(value);
        row.release.push(() => {
          row.value = value;
          resolve();
        });
      }),
    { setTimer: clock.setTimer, clearTimer: clock.clearTimer, retryMs: 10_000, failed: () => {} },
  );
  w.push('paused');
  w.push('resumed');
  assert.deepEqual(row.sent, ['paused'], 'the second waits for the first');
  row.release[0]();
  await clock.advance(0);
  assert.deepEqual(row.sent, ['paused', 'resumed']);
  row.release[1]();
  await clock.advance(0);
  assert.equal(row.value, 'resumed', 'the row ends on the newest value');
  // Values pushed while one is in flight collapse to the newest.
  w.push('a');
  w.push('b');
  w.push('c');
  row.release[2]();
  await clock.advance(0);
  assert.deepEqual(row.sent.slice(2), ['a', 'c']);
  w.stop();
});

test('the sources writer tries a failed write again, and a newer value waiting replaces it', async () => {
  const clock = fakeClock();
  const sent = [];
  const failures = [];
  let fail = true;
  const w = latestWriter(
    async (value) => {
      sent.push(value);
      if (fail) throw new Error('offline');
    },
    { setTimer: clock.setTimer, clearTimer: clock.clearTimer, retryMs: 10_000, failed: (e) => failures.push(e.message) },
  );
  w.push('one');
  await clock.advance(0);
  assert.deepEqual(failures, ['offline']);
  // Before the retry, the operator changes it again: the newest goes at once, and the retry that
  // follows has nothing older to send.
  fail = false;
  w.push('two');
  await clock.advance(10_000);
  assert.deepEqual(sent, ['one', 'two']);
  // Failing with nothing newer waiting, the same value is tried again after the interval.
  fail = true;
  w.push('three');
  await clock.advance(0);
  fail = false;
  await clock.advance(10_000);
  assert.deepEqual(sent, ['one', 'two', 'three', 'three']);
  assert.deepEqual(failures, ['offline', 'offline']);
  w.stop();
});

// ── Over real HTTP, against a local fake of the export (jev-svg-import row 25, AC-14) ─────────
//
// The same reader, on the real clock, reading a real HTTP server on loopback that answers as
// Google's export does and as it fails (e2e/fixtures/jev-sheet-server.mjs): a denial, a read that
// never answers, a dropped connection, a sign-in page, a 500, then good rows again. Each graphic
// kind a linked Sheet feeds is walked: a ticker's ordered lines, an imported credits list (the
// credits adapter) and a multiline text value (keyed by Field ID). A failure writes nothing, so
// the last good value holds; three misses mark it stale; the next good read reconnects, writing
// the newest rows once. The reads go to the Sheet's export address and nowhere else, so a
// refresh asks no model anything. Short intervals keep it quick: the rules are the cadence's,
// not its length (5 s, 10 s and three misses are pinned on the fake clock above).

const { startSheetServer, csvOf } = await import('../e2e/fixtures/jev-sheet-server.mjs');
const { mergePatch } = await import('../src/model/productionData.ts');

const EVERY = 120;
const CUT = 300;

/** Poll `probe` until it returns true, on the real clock. */
async function until(probe, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    if (await probe()) return;
    if (Date.now() > end) assert.fail(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/** One page's reader of a tab on the fake, writing into its own tree; every request counted. */
function liveReader(server, { id, shape, paths }) {
  const leases = new Map();
  const asked = [];
  const out = { tree: {}, writes: [], statuses: [], paused: false };
  const through = server.fetchFor();
  out.reader = createSheetReader({
    key: `live:${id}`,
    sourceId: 's1',
    link: { sheetId: id, gid: '0' },
    shape,
    tab: 'A',
    world: 'local',
    everyMs: EVERY,
    timeoutMs: CUT,
    io: {
      now: () => Date.now(),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (t) => clearTimeout(t),
      fetch: (url, init) => {
        asked.push(String(url));
        return through(url, init);
      },
      readLease: (key) => (leases.has(key) ? structuredClone(leases.get(key)) : null),
      writeLease: (key, lease) => leases.set(key, structuredClone(lease)),
    },
    connected: () => new Set(paths),
    paused: () => out.paused,
    write: async (patch) => {
      out.writes.push(patch);
      out.tree = mergePatch(out.tree, patch);
      return true;
    },
    onStatus: (s) => out.statuses.push(s),
  });
  out.asked = asked;
  out.value = (p = paths[0]) => p.split('.').reduce((at, k) => (at == null ? undefined : at[k]), out.tree);
  out.status = () => out.statuses.at(-1);
  return out;
}

/** The failures a live Sheet meets, each said with its fix and none writing anything. */
const FAILURES = [
  ['deny', /^can’t read it \(not shared\)$/],
  ['hang', /^Google did not answer in 10 seconds$/],
  ['reset', /^can’t read it \(not shared, or offline\)$/],
  ['signin', /^can’t read it \(not shared\)$/],
  ['error', /^Google refused the read \(500\)$/],
  ['missing', /^can’t find the tab$/],
];

/**
 * Walk one kind: good rows, every failure (the last good value holds, stale after three misses),
 * a reconnect to newer rows, malformed rows (`malformed` says what they write), an empty tab
 * (clears) and rows again.
 */
async function walkFailures({ id, shape, path, first, firstValue, newer, newerValue, malformed, empty }) {
  const server = await startSheetServer();
  server.set(id, first);
  const page = liveReader(server, { id, shape, paths: [path] });
  try {
    await until(() => page.value() === firstValue, 3000, 'the first good read');
    assert.equal(page.status().state, 'ok');

    for (const [mode, error] of FAILURES) {
      const writes = page.writes.length;
      server.mode(id, mode);
      // Two reads under this failure: the first has answered (reads never overlap).
      const reads = server.reads(id);
      await until(() => server.reads(id) >= reads + 2, 3000, `${mode} read twice`);
      assert.equal(page.status().state, 'failing', mode);
      assert.match(page.status().error, error, mode);
      assert.ok(page.status().fix, `${mode}: the line says what to do`);
      assert.equal(page.writes.length, writes, `${mode}: a failed read writes nothing`);
      assert.equal(page.value(), firstValue, `${mode}: the last good value holds`);
    }
    assert.equal(page.status().stale, true, 'three misses in a row and more: stale');
    const since = page.status().failingSince;
    assert.ok(since > 0, 'the time failing began is kept');

    // Reconnect: the newest rows arrive in one write, and stale clears.
    const writes = page.writes.length;
    server.set(id, newer);
    await until(() => page.value() === newerValue, 3000, 'the reconnect');
    assert.equal(page.status().state, 'ok');
    assert.equal(page.status().stale, false);
    assert.equal(page.status().failingSince, null);
    const reads = server.reads(id);
    await until(() => server.reads(id) >= reads + 3, 3000, 'three more reads');
    assert.equal(page.writes.length, writes + 1, 'unchanged after the reconnect: written once');

    // Malformed rows, as the tab holds them.
    server.set(id, malformed.csv);
    await until(() => malformed.reached(page), 3000, 'the malformed read');

    // Empty clears on purpose; rows again come back.
    server.set(id, empty);
    await until(() => page.value() === '', 3000, 'an empty tab clears');
    server.set(id, first);
    await until(() => page.value() === firstValue, 3000, 'filled again');

    // Every request was a read of this tab's export address: no other service was asked.
    assert.ok(page.asked.length > 10);
    for (const url of page.asked) assert.equal(url, `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`);
    assert.ok(server.hits.every((h) => h.id === id), 'the fake saw nothing but reads of the tab');
  } finally {
    page.reader.stop();
    await server.close();
  }
}

test('over HTTP, a ticker’s ordered lines keep the last good read through denial, timeout, reset, sign-in, 500 and 404, and reconnect to the newest rows', async () => {
  await walkFailures({
    id: '1NoaCGLiveTicker000000000',
    shape: 'lines',
    path: 'sheet.s1.lines',
    first: csvOf([['Polls close at 20:00'], ['Turnout 61%'], ['Results from 22:00']]),
    firstValue: 'Polls close at 20:00\nTurnout 61%\nResults from 22:00',
    // Reordered, one replaced, one deleted.
    newer: csvOf([['Results from 22:00'], ['Turnout 64%']]),
    newerValue: 'Results from 22:00\nTurnout 64%',
    // A read cut inside a quoted cell imports what it has (model/csv.ts), so a truncated answer
    // still writes its whole rows in order.
    malformed: { csv: 'Results from 22:00\n"Turnout 64%, still counting\n', reached: (p) => p.value() === 'Results from 22:00\nTurnout 64%, still counting' },
    empty: '',
  });
});

test('over HTTP, an imported credits list keeps the last good roles and names through every failure, reconnects, and an emptied tab clears', async () => {
  await walkFailures({
    id: '1NoaCGLiveCredits00000000',
    shape: 'credits',
    path: 'sheet.s1.lines',
    first: csvOf([['Role', 'Name'], ['Research', 'Nia Vale'], ['', 'Tomas Fen'], ['Sound', 'Ari Moss']]),
    firstValue: 'Research | Nia Vale\nTomas Fen\nSound | Ari Moss',
    newer: csvOf([['Role', 'Name'], ['Camera', 'Jonas Berg'], ['Director', 'Alex Rivera']]),
    newerValue: 'Camera | Jonas Berg\nDirector | Alex Rivera',
    // A role waiting for its names is a valid row of the native grammar, and is kept.
    malformed: { csv: csvOf([['Role', 'Name'], ['Camera', 'Jonas Berg'], ['Grip', '']]), reached: (p) => p.value() === 'Camera | Jonas Berg\nGrip:' },
    // A header row alone is a list with nobody in it.
    empty: csvOf([['Role', 'Name']]),
  });
});

test('over HTTP, a multiline text value keyed by Field ID keeps its last good lines through every failure, and a row without a usable Field ID writes nothing', async () => {
  const tab = (body) => csvOf([['Field ID', 'Label', 'Value'], ['f0', 'Title', 'COMMUNITY NOTICE'], ['f1', 'Body', body]]);
  await walkFailures({
    id: '1NoaCGLiveNotice000000000',
    shape: 'values',
    path: 'sheet.s1.values.f1',
    first: tab('Doors open at 18:00\nEntry from the courtyard'),
    firstValue: 'Doors open at 18:00\nEntry from the courtyard',
    newer: tab('Doors open at 19:00\nTickets at the door\nStep-free access east'),
    newerValue: 'Doors open at 19:00\nTickets at the door\nStep-free access east',
    // The body's row lost its Field ID: it is reported, writes nothing, and the field keeps its
    // newest good lines.
    malformed: {
      csv: csvOf([['Field ID', 'Label', 'Value'], ['f0', 'Title', 'COMMUNITY NOTICE'], ['', 'Body', 'Wrong row']]),
      reached: (p) => p.status().problems.some((t) => /no usable Field ID/.test(t)) && p.status().problems.some((t) => /f1 is missing/.test(t)) && p.value() === 'Doors open at 19:00\nTickets at the door\nStep-free access east',
    },
    empty: tab(''),
  });
});

// ── One controlled public-sheet probe (jev-svg-import row 25): the cadence on a real Sheet ─────
//
// Run by hand, never in CI: `NOACG_SHEET_PROBE=1 node --test --test-name-pattern=probe
// scripts/sheet-source.test.mjs`. It needs the controlled synthetic Sheets the readiness file
// names (NOACG_TEST_SHEET_IDS, the first one) and their service account
// (GOOGLE_SERVICE_ACCOUNT_JSON), read from the checkout's .env as scripts/production-page-keys.mjs
// reads them. The account adds a temporary tab, edits one cell ten times, and deletes the tab in
// the end; the edits are read the way an operator's page reads them, signed out, through Google's
// public export address: by the reader itself at its own 5-second cadence, and by a 100 ms poll
// that times how long an edit takes to show in the export. It prints only timings, never an id,
// an address or a credential.

test('probe: a controlled public Sheet, read as the page reads it, edit to export and edit to write', { skip: process.env.NOACG_SHEET_PROBE !== '1' }, async () => {
  const { createSign } = await import('node:crypto');
  const { ambientEnv } = await import('./read-dotenv.mjs');
  const env = ambientEnv(new URL('..', import.meta.url).pathname);
  const sheetId = (env.NOACG_TEST_SHEET_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0];
  const account = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? 'null');
  assert.ok(sheetId && account?.client_email, 'UNAVAILABLE: the controlled Sheet or its service account is not configured here');
  const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const aud = account.token_uri ?? 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const claim = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud, iat: now, exp: now + 900 })}`;
  const assertion = `${claim}.${createSign('RSA-SHA256').update(claim).sign(account.private_key, 'base64url')}`;
  const signIn = await fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  assert.equal(signIn.status, 200, 'UNAVAILABLE: the service account could not sign in');
  const headers = { Authorization: `Bearer ${(await signIn.json()).access_token}`, 'content-type': 'application/json' };
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;
  const title = `noacg-probe-${Date.now()}`;
  const added = await fetch(`${api}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }) });
  assert.equal(added.status, 200, 'the temporary tab was added');
  // The tab is found again by its title in the end, whatever happens in between.
  const gid = String((await added.json().catch(() => null))?.replies?.[0]?.addSheet?.properties?.sheetId ?? '');
  const write = async (text) => {
    const r = await fetch(`${api}/values/${encodeURIComponent(`'${title}'!A1`)}?valueInputOption=RAW`, { method: 'PUT', headers, body: JSON.stringify({ values: [[text]] }) });
    assert.equal(r.status, 200);
    return Date.now();
  };
  const leases = new Map();
  const reads = [];
  const written = [];
  let reader = null;
  try {
    assert.ok(gid, 'the temporary tab has an id');
    await write('probe 0');
    reader = createSheetReader({
      key: 'probe',
      sourceId: 'p',
      link: { sheetId, gid },
      shape: 'lines',
      tab: 'probe',
      world: 'probe',
      io: {
        now: () => Date.now(),
        setTimer: (run, ms) => setTimeout(run, ms),
        clearTimer: (t) => clearTimeout(t),
        fetch: async (url, init) => { reads.push(Date.now()); return fetch(url, init); },
        readLease: (k) => (leases.has(k) ? structuredClone(leases.get(k)) : null),
        writeLease: (k, l) => leases.set(k, structuredClone(l)),
      },
      connected: () => new Set(['sheet.p.lines']),
      paused: () => false,
      write: async (patch) => { written.push({ at: Date.now(), text: patch.sheet.p.lines }); return true; },
      onStatus: () => {},
    });
    await until(() => written.some((w) => w.text === 'probe 0'), 30_000, 'the first read of the probe tab');
    const exportUrl = sheetCsvUrl({ sheetId, gid });
    const toExport = [];
    const toWrite = [];
    for (let k = 1; k <= 10; k++) {
      const text = `probe ${k}`;
      const at = await write(text);
      for (;;) {
        const body = await (await fetch(exportUrl)).text();
        if (body.trim() === text) { toExport.push(Date.now() - at); break; }
        if (Date.now() - at > 30_000) assert.fail(`edit ${k} never reached the export`);
        await new Promise((r) => setTimeout(r, 100));
      }
      await until(() => written.some((w) => w.text === text), 30_000, `edit ${k} written by the reader`);
      toWrite.push(written.find((w) => w.text === text).at - at);
    }
    const gaps = reads.slice(1).map((t, i) => t - reads[i]);
    const stat = (xs) => { const s = [...xs].sort((a, b) => a - b); return `min ${s[0]} ms, median ${s[Math.floor(s.length / 2)]} ms, max ${s.at(-1)} ms (n=${s.length})`; };
    console.log(`probe: edit -> public export: ${stat(toExport)}`);
    console.log(`probe: edit -> reader write: ${stat(toWrite)}`);
    console.log(`probe: reader read interval: ${stat(gaps)}`);
    assert.ok(Math.max(...gaps) < SHEET_READ_MS + 2_000, 'the reader kept its 5-second cadence');
    assert.ok(Math.max(...toWrite) < SHEET_READ_MS + SHEET_TIMEOUT_MS, 'every edit was written within one read and its timeout');
  } finally {
    reader?.stop();
    const listed = async () => (await (await fetch(`${api}?fields=sheets.properties(sheetId,title)`, { headers })).json()).sheets?.map((s) => s.properties) ?? [];
    const mine = (await listed()).find((p) => p.title === title);
    const removed = mine ? await fetch(`${api}:batchUpdate`, { method: 'POST', headers, body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: mine.sheetId } }] }) }) : { status: 200 };
    const titles = (await listed()).map((p) => p.title);
    console.log(`probe: temporary tab deleted ${removed.status === 200 && !titles.includes(title) ? 'and confirmed gone' : 'FAILED: remove it by hand'}`);
    assert.equal(removed.status, 200);
    assert.ok(!titles.includes(title), 'the temporary tab is gone');
  }
});
