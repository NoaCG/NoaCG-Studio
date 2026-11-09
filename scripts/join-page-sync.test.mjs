// guards: src/control/joinPageSync.ts
//
// Phones follow the production's page between publishes (interaction spec phase 2, rules P1 to P4
// in the module's header). The fakes below are a server that holds one brand and a production
// that changes; the expected outcome is read off the rules, not off the algorithm: whatever the
// order of slow and fast work, phones end on the latest saved page, and nothing is sent that
// phones already have.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { syncJoinPage, joinPageSyncSettled } = await import('../src/control/joinPageSync.ts');

let seq = 0;
/** A fresh production id per test: the module keeps one queue per production. */
const freshId = () => `show-${++seq}`;

function rig({ title = 'Quiz Night', logo = null, server = null } = {}) {
  const show = { id: freshId(), joinPage: { title }, look: undefined, logoUrl: logo };
  const state = { server, sends: [], errors: [] };
  const io = {
    readShow: () => ({ ...show }),
    readBrand: async () => state.server,
    publishLogo: async (s) => s.logoUrl ?? null,
    send: async (brand) => {
      state.sends.push(brand);
      state.server = brand;
    },
    onError: (e) => state.errors.push(e),
  };
  return { show, state, io };
}

const page = (title, logo = null) => ({ accent: null, text: null, panel: null, font: null, logo, title, waiting: null });

test('P1: phones that already have the page get nothing; a difference is sent once', async () => {
  const same = rig({ server: page('Quiz Night') });
  syncJoinPage(same.show.id, same.io, 0);
  await joinPageSyncSettled(same.show.id);
  assert.deepEqual(same.state.sends, []);

  const stale = rig({ server: page('Old title') });
  syncJoinPage(stale.show.id, stale.io, 0);
  await joinPageSyncSettled(stale.show.id);
  assert.deepEqual(stale.state.sends, [page('Quiz Night')]);
});

test('P2: a change is sent after its wait with nobody left to ask again', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night') });
  show.joinPage = { title: 'Back after the break' };
  syncJoinPage(show.id, io, 20);
  // The asking surface is gone now; nothing else calls in.
  await joinPageSyncSettled(show.id);
  assert.deepEqual(state.server, page('Back after the break'));
});

test('P3: several changes inside the wait send the last one, once', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night') });
  for (const title of ['A', 'AB', 'ABC']) {
    show.joinPage = { title };
    syncJoinPage(show.id, io, 20);
  }
  await joinPageSyncSettled(show.id);
  assert.deepEqual(state.sends, [page('ABC')]);
});

test('P3: a slow logo upload superseded by a removal never reaches phones', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night', 'https://x/old.png') });
  let release;
  const slow = new Promise((r) => (release = r));
  io.publishLogo = async (s) => {
    if (s.logoUrl === 'https://x/new.png') await slow;
    return s.logoUrl ?? null;
  };
  // A new logo: its upload is slow.
  show.logoUrl = 'https://x/new.png';
  syncJoinPage(show.id, io, 0);
  await new Promise((r) => setTimeout(r, 10));
  // Meanwhile the logo is removed.
  show.logoUrl = null;
  syncJoinPage(show.id, io, 0);
  release();
  await joinPageSyncSettled(show.id);
  assert.deepEqual(state.server, page('Quiz Night', null), 'phones end on the removal');
  assert.ok(!state.sends.some((b) => b.logo === 'https://x/new.png'), 'the superseded upload was never sent');
});

test('P4: a logo that cannot be published keeps the one phones have, and the words still go', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night', 'https://x/kept.png') });
  show.joinPage = { title: 'New title' };
  io.publishLogo = async () => {
    throw new Error('offline');
  };
  syncJoinPage(show.id, io, 0);
  await joinPageSyncSettled(show.id);
  assert.deepEqual(state.server, page('New title', 'https://x/kept.png'), 'the new words, the kept logo');
  assert.equal(state.errors.length, 1, 'and the failure is reported');
});

test('P4: when what phones have cannot be read and the logo cannot be published, nothing is sent', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night', 'https://x/kept.png') });
  show.joinPage = { title: 'New title' };
  io.readBrand = async () => null;
  io.publishLogo = async () => {
    throw new Error('offline');
  };
  syncJoinPage(show.id, io, 0);
  await joinPageSyncSettled(show.id);
  assert.deepEqual(state.sends, [], 'a send now could clear the logo phones have');
  assert.equal(state.errors.length, 1);
});

test('the logo phones have is handed to the publisher, so a known file is not uploaded again', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night', 'https://x/same.png') });
  const asked = [];
  io.publishLogo = async (_s, known) => {
    asked.push(known);
    return known;
  };
  syncJoinPage(show.id, io, 0);
  await joinPageSyncSettled(show.id);
  assert.deepEqual(asked, ['https://x/same.png']);
  assert.deepEqual(state.sends, []);
});

test('P5: publish waits its turn, reads the page when it runs, and an edit during its slow upload is what phones end on', async () => {
  const { show, state, io } = rig({ server: page('Quiz Night', 'https://x/old.png') });
  let release;
  const slow = new Promise((r) => (release = r));
  const publishIo = {
    ...io,
    publishLogo: async (s) => {
      if (s.logoUrl === 'https://x/new.png') await slow;
      return s.logoUrl ?? null;
    },
  };
  // Publish starts with a new logo whose upload is slow.
  show.logoUrl = 'https://x/new.png';
  const published = syncJoinPage(show.id, publishIo, 0);
  await new Promise((r) => setTimeout(r, 10));
  // Meanwhile the title changes in Interaction, which asks the same queue.
  show.joinPage = { title: 'Changed during publish' };
  syncJoinPage(show.id, io, 0);
  release();
  await published;
  assert.deepEqual(state.server, page('Changed during publish', 'https://x/new.png'), 'publish settles only once phones have the latest page');
});

test('an ask that a later one replaced still settles, once the later one has run', async () => {
  const { show, state, io } = rig({ server: page('Old') });
  show.joinPage = { title: 'First' };
  const first = syncJoinPage(show.id, io, 30);
  show.joinPage = { title: 'Second' };
  const second = syncJoinPage(show.id, io, 0);
  await Promise.all([first, second]);
  assert.deepEqual(state.sends, [page('Second')]);
});
