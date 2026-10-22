// guards: src/audience/sheetMessages.ts
// guards: src/audience/localAudience.ts
//
// A MESSAGE SHEET (audience-flow AC-8; sheet-data-flow AC-11; data-sources AC-10, AC-15, phase C3),
// in Node against the local provider. A row's identity is the hash of its Name, Message, Source and
// Reference cells plus an occurrence index for identical rows, never its position. Pinned: reorder
// changes nothing; delete and add are a leave and an arrival; an edit is both, never paired; two
// identical rows are two candidates and stay two; a vanished unused candidate leaves the inbox and a
// used one stays with its original, marked, and is unmarked when its row returns; a refresh never
// duplicates; a late read after stop revives nothing; at most 100 a call reach the operator door;
// only Name and Message become the candidate's text, Source and Reference stay provenance.

import assert from 'node:assert/strict';
import test from 'node:test';

const { createSheetInbox, rowHash, sheetMessagePrefix, sheetMessages, MESSAGE_SHEET_STARTER } = await import('../src/audience/sheetMessages.ts');
const { createLocalAudience } = await import('../src/audience/localAudience.ts');

const HEAD = ['Name', 'Message', 'Source', 'Reference'];
const ANA = ['Ana', 'When does the second half start?', 'WhatsApp', '+358 40 000 0001'];
const BO = ['Bo', 'Great show!', '', ''];
const CY = ['Cy', 'Hello from Turku', 'SMS', ''];

const ids = (rows) => sheetMessages('s1', 'Messages', [HEAD, ...rows]).items.map((i) => i.externalId);

/** A consumer over a fresh local provider, with every call to the operator door recorded. */
function inbox() {
  const backend = createLocalAudience({ productionName: 'Test' });
  const calls = [];
  const door = {
    addCandidates: (items) => (calls.push(['add', items.length]), backend.addCandidates(items)),
    settleImported: (prefix, present) => (calls.push(['settle', present.length]), backend.settleImported(prefix, present)),
  };
  const sheet = createSheetInbox({ sourceId: 's1', label: () => 'Messages', backend: () => door });
  const read = async (rows) => {
    sheet.take([HEAD, ...rows]);
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  const list = () => backend.list();
  return { backend, sheet, read, list, calls };
}

test('a row is its four cells, not its place: reordering changes no id', () => {
  const before = ids([ANA, BO, CY]);
  const after = ids([CY, ANA, BO]);
  assert.deepEqual([...after].sort(), [...before].sort());
  assert.equal(new Set(before).size, 3);
  for (const id of before) assert.match(id, /^sheet:s1:[0-9a-z]+#0$/);
});

test('every cell is part of the identity; an edit is a different id', () => {
  const [base] = ids([ANA]);
  for (let c = 0; c < 4; c += 1) {
    const edited = [...ANA];
    edited[c] += '!';
    assert.notEqual(ids([edited])[0], base, `cell ${HEAD[c]}`);
  }
  // Cells are not run together: moving a character across a boundary is another row.
  assert.notEqual(rowHash(['ab', 'c', '', '']), rowHash(['a', 'bc', '', '']));
  // Stable across runs and machines: the id is a pure function of the text.
  assert.equal(rowHash(['Ana', 'Hello', '', '']), rowHash(['Ana', 'Hello', '', '']));
});

test('identical rows are two candidates by occurrence; deleting one keeps one', () => {
  const two = ids([BO, ANA, BO]);
  assert.equal(two.length, 3);
  assert.equal(new Set(two).size, 3);
  assert.ok(two[0].endsWith('#0') && two[2].endsWith('#1'));
  assert.equal(two[0].replace(/#0$/, ''), two[2].replace(/#1$/, ''));
  const one = ids([ANA, BO]);
  assert.ok(one.includes(two[0]));
  assert.ok(!one.includes(two[2]));
});

test('identical text from two senders is two candidates', () => {
  const same = ids([['Ana', 'Hello'], ['Bo', 'Hello']]);
  assert.equal(new Set(same).size, 2);
});

test('only Name and Message become text; Source and Reference are provenance', () => {
  const [item] = sheetMessages('s1', 'Messages', [HEAD, ANA]).items;
  assert.equal(item.author, 'Ana');
  assert.equal(item.body, 'When does the second half start?');
  assert.equal(item.source, 'Sheet: Messages · WhatsApp');
  assert.equal(item.reference, '+358 40 000 0001');
  const [plain] = sheetMessages('s1', 'Guests', [HEAD, BO]).items;
  assert.equal(plain.source, 'Sheet: Guests');
  assert.equal(plain.reference, null);
});

test('headings are found by name in any order and case; a tab without Message says so', () => {
  const rows = [['reference', 'MESSAGE', 'from'], ['note', 'Hi', 'Dee']];
  const [item] = sheetMessages('s1', 'M', rows).items;
  assert.deepEqual([item.author, item.body, item.reference], ['Dee', 'Hi', 'note']);
  const none = sheetMessages('s1', 'M', [['Name', 'Value'], ['a', 'b']]);
  assert.equal(none.items.length, 0);
  assert.match(none.problem, /Message heading/);
  // Blank message rows are skipped and take no occurrence.
  assert.equal(sheetMessages('s1', 'M', [HEAD, ['Ana', '  '], BO]).items.length, 1);
});

test('the starter rows read as one message with the four headings', () => {
  const rows = MESSAGE_SHEET_STARTER.trim().split('\n').map((l) => l.split('\t'));
  assert.deepEqual(rows[0], HEAD);
  assert.equal(sheetMessages('s1', 'M', rows).items.length, 1);
});

test('the longest tab Messages follows is 2,000 messages, and the rest is said', () => {
  const rows = [HEAD, ...Array.from({ length: 2003 }, (_, i) => ['N', `Message ${i}`])];
  const read = sheetMessages('s1', 'M', rows);
  assert.equal(read.items.length, 2000);
  assert.match(read.problem, /first 2,000 messages are read; 3 more are not/);
});

test('rows arrive as candidates through the operator door, at most 100 a call', async () => {
  const h = inbox();
  await h.read(Array.from({ length: 250 }, (_, i) => ['N', `Message ${i}`]));
  assert.deepEqual(h.calls, [['add', 100], ['add', 100], ['add', 50], ['settle', 250]]);
  const rows = await h.list();
  assert.equal(rows.length, 250);
  assert.ok(rows.every((r) => r.status === 'new' && r.externalId.startsWith(sheetMessagePrefix('s1'))));
});

test('a refresh, a reorder or a reconnect never duplicates; an unchanged read costs nothing', async () => {
  const h = inbox();
  await h.read([ANA, BO, CY]);
  await h.read([ANA, BO, CY]);
  await h.read([CY, BO, ANA]);
  assert.equal((await h.list()).length, 3);
  assert.deepEqual(h.calls, [['add', 3], ['settle', 3]]);
  // A second consumer on the same inbox (a reload, a reconnect) adds nothing new.
  const again = createSheetInbox({ sourceId: 's1', label: () => 'Messages', backend: () => h.backend });
  again.take([HEAD, BO, ANA, CY]);
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
  assert.equal((await h.list()).length, 3);
});

test('a vanished row leaves an unused candidate and keeps a used one, marked, with its original', async () => {
  const h = inbox();
  await h.read([ANA, BO, CY]);
  const before = await h.list();
  const ana = before.find((r) => r.author === 'Ana');
  await h.backend.update(ana.id, { broadcastBody: 'When is half time?', usedAt: '2026-10-21T12:00:00Z' });
  // Ana's and Bo's rows are deleted, Dee's is added.
  await h.read([CY, ['Dee', 'New one']]);
  const after = await h.list();
  assert.deepEqual(after.map((r) => r.author).sort(), ['Ana', 'Cy', 'Dee']);
  const kept = after.find((r) => r.author === 'Ana');
  assert.equal(kept.id, ana.id);
  assert.equal(kept.body, 'When does the second half start?', 'the original stays');
  assert.equal(kept.broadcastBody, 'When is half time?', 'the prepared version stays');
  assert.ok(kept.withdrawnAt, 'marked no longer in the Sheet');
  assert.equal(after.find((r) => r.author === 'Cy').withdrawnAt ?? null, null);
  // The row comes back: the same candidate, unmarked, no copy.
  await h.read([CY, ['Dee', 'New one'], ANA]);
  const back = await h.list();
  assert.equal(back.length, 3);
  assert.equal(back.find((r) => r.author === 'Ana').withdrawnAt, null);
});

test('an edit is a leave and an arrival; nothing pairs them', async () => {
  const h = inbox();
  await h.read([ANA]);
  const [first] = await h.list();
  await h.backend.update(first.id, { usedAt: '2026-10-21T12:00:00Z' });
  await h.read([[ANA[0], 'When does the SECOND half start?', ANA[2], ANA[3]]]);
  const rows = await h.list();
  assert.equal(rows.length, 2);
  const old = rows.find((r) => r.id === first.id);
  assert.equal(old.body, 'When does the second half start?');
  assert.ok(old.withdrawnAt);
  const fresh = rows.find((r) => r.id !== first.id);
  assert.equal(fresh.usedAt, null);
  assert.equal(fresh.withdrawnAt ?? null, null);
});

test('settling one Sheet leaves another Sheet, a paste and a YouTube candidate alone', async () => {
  const h = inbox();
  await h.backend.addCandidates([
    { body: 'pasted', source: 'Pasted' },
    { body: 'other sheet', externalId: 'sheet:s2:abc#0' },
    { body: 'comment', externalId: 'yt:Ug1' },
    { body: 'prefix lookalike', externalId: 'sheet:s10:abc#0' },
  ]);
  await h.read([ANA]);
  await h.read([]);
  const bodies = (await h.list()).map((r) => r.body).sort();
  assert.deepEqual(bodies, ['comment', 'other sheet', 'pasted', 'prefix lookalike']);
});

test('after stop, a late read revives nothing and an add in flight goes no further', async () => {
  const h = inbox();
  await h.read([ANA]);
  h.sheet.stop();
  await h.read([ANA, BO]);
  assert.equal((await h.list()).length, 1);

  // Stopped between two batches: the second batch and the settle never run.
  const backend = createLocalAudience({ productionName: 'Test' });
  let sheet;
  const calls = [];
  const door = {
    addCandidates: async (items) => {
      calls.push('add');
      const added = await backend.addCandidates(items);
      sheet.stop();
      return added;
    },
    settleImported: async () => calls.push('settle'),
  };
  sheet = createSheetInbox({ sourceId: 's1', label: () => 'M', backend: () => door });
  sheet.take([HEAD, ...Array.from({ length: 150 }, (_, i) => ['N', `m${i}`])]);
  for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(calls, ['add']);
});

test('a refused add is said and tried again at the next read', async () => {
  const backend = createLocalAudience({ productionName: 'Test' });
  let refuse = true;
  const problems = [];
  const door = {
    addCandidates: async (items) => {
      if (refuse) throw new Error('offline');
      return backend.addCandidates(items);
    },
    settleImported: (p, present) => backend.settleImported(p, present),
  };
  const sheet = createSheetInbox({ sourceId: 's1', label: () => 'M', backend: () => door, onProblem: (p) => problems.push(p) });
  const read = async () => {
    sheet.take([HEAD, ANA]);
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  await read();
  assert.equal((await backend.list()).length, 0);
  assert.match(problems.at(-1), /not added: offline/);
  refuse = false;
  await read();
  assert.equal((await backend.list()).length, 1);
  assert.equal(problems.at(-1), null);
});

test('the local provider refuses a settle past 2,000 rows', async () => {
  const backend = createLocalAudience({ productionName: 'Test' });
  await assert.rejects(backend.settleImported('sheet:s1:', Array.from({ length: 2001 }, (_, i) => `sheet:s1:${i}`)), /At most 2000 rows/);
});
