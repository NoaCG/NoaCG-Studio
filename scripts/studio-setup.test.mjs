// guards: src/control/studioSetup.ts
//
// THE STUDIO SETUP BETWEEN THE BROWSER AND NOACG BRIDGE (docs/work-specs/studio-day-playout AC-11,
// D17, D18): which copy wins for the server in use. The reading and writing around it is
// control/playoutLink.ts `syncStudio`, driven end to end in e2e/bridge-connect.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { DEFAULT_STUDIO, sameServer, sameStudio, studioFields, studioOf, studioStep } = await import('../src/control/studioSetup.ts');

const ours = {
  channels: [
    { channel: 1, name: 'Graphics' },
    { channel: 2, name: 'Inserts' },
  ],
  output: { channel: 1, layer: 20 },
  newMedia: 2,
};
const theirs = { ...ours, output: { channel: 2, layer: 30 } };
const server = (studio) => ({ host: '192.168.1.20', port: 5250, ...(studio ? { studio } : {}) });

test('the Bridge keeps nothing for a server it never connected to, so nothing moves', () => {
  assert.deepEqual(studioStep(ours, undefined, false), { kind: 'none' });
  assert.deepEqual(studioStep(ours, undefined, true), { kind: 'none' });
});

test("the Bridge's copy is the setup: a browser that differs takes it", () => {
  assert.deepEqual(studioStep(ours, server(theirs), false), { kind: 'pull', studio: theirs });
  // Even a browser still on the default: a second browser, or one that forgot, opens with the studio.
  assert.deepEqual(studioStep(DEFAULT_STUDIO, server(theirs), false), { kind: 'pull', studio: theirs });
  assert.deepEqual(studioStep(ours, server(ours), false), { kind: 'none' });
});

test('a change the Bridge has not confirmed goes to it rather than being replaced by its older copy', () => {
  assert.deepEqual(studioStep(ours, server(theirs), true), { kind: 'push' });
  // Already the same on both sides: nothing to send.
  assert.deepEqual(studioStep(ours, server(ours), true), { kind: 'none' });
  // A change back to the default is somebody's choice too, and goes.
  assert.deepEqual(studioStep(DEFAULT_STUDIO, server(theirs), true), { kind: 'push' });
  assert.deepEqual(studioStep(DEFAULT_STUDIO, server(), true), { kind: 'push' });
});

test('a server the Bridge keeps no setup for takes the one on screen, unless it is the untouched default', () => {
  assert.deepEqual(studioStep(ours, server(), false), { kind: 'push' });
  // The default is nobody's choice: giving it to the Bridge could overwrite the setup another browser
  // was about to give it.
  assert.deepEqual(studioStep(DEFAULT_STUDIO, server(), false), { kind: 'none' });
});

test('the default goes back and forth as the fields a fresh browser stores', () => {
  // PLAYOUT_DEFAULTS (playoutLink.ts) is made from DEFAULT_STUDIO, so this is what a fresh browser holds.
  assert.deepEqual(studioOf({ channel: 1, layer: 20, channels: [{ channel: 1, name: 'Channel 1' }], clipChannel: 1 }), DEFAULT_STUDIO);
  assert.deepEqual(studioFields(DEFAULT_STUDIO), { channel: 1, layer: 20, channels: [{ channel: 1, name: 'Channel 1' }], clipChannel: 1 });
});

test('what the browser gives the Bridge is always a setup the Bridge accepts', () => {
  const sent = studioOf({ channel: 1, layer: -4, channels: [{ channel: 2, name: 'x'.repeat(80) }], clipChannel: 2.6 });
  assert.equal(sent.output.layer, 0, 'a layer typed below zero goes as 0');
  assert.equal(sent.channels[0].name.length, 60, 'a name longer than the Bridge keeps is cut to its length');
  assert.equal(sent.newMedia, 3);
  assert.ok(sameStudio(studioOf(studioFields(ours)), ours), 'the two shapes go back and forth unchanged');
});

test('a server is its host in any case and its port', () => {
  assert.ok(sameServer({ host: 'Studio-PC', port: 5250 }, { host: 'studio-pc ', port: 5250 }));
  assert.ok(!sameServer({ host: 'studio-pc', port: 5250 }, { host: 'studio-pc', port: 5251 }));
});
