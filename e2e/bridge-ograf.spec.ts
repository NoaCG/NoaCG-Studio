// covers: none - its subject is the Bridge under cli/, which selects no e2e spec (the CLI's package
// tests gate it); it runs when edited, through the focus set and at night
//
// THE BRIDGE AS AN OGRAF CLIENT (docs/BRIDGE.md §3a): the real Bridge against a fake OGraf server,
// every verb's exact Server API request. It shares the playout protocol file with the two specs
// above, and nothing under cli/ selects a spec by itself, so without this line the
// browser-to-Bridge-to-server proof would never run in the merge gate. Three tests, no catalog.
// focus

import { test, expect, type Page } from '@playwright/test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { casparcgAdapter } from '../cli/src/playout/adapters/casparcg.ts';
import { createOgrafAdapter } from '../cli/src/playout/adapters/ograf.ts';
import { createBridgeServer } from '../cli/src/playout/server.ts';
import { startFakeOgrafServer } from './fixtures/ograf-server/server.mjs';

// NoaCG Bridge as an OGraf CLIENT (docs/BRIDGE.md §3a, docs/backlog/bridge-ograf-adapter.md).
// The REAL Bridge - its HTTP surface, its checks and the OGraf adapter - runs in this process,
// and a FAKE OGraf server (e2e/fixtures/ograf-server/) stands where SuperFly.tv's ograf-server or
// any other renderer would. Every call comes from a page on the studio's own origin, token in
// hand, the way the studio's own playout code calls the Bridge, so the CORS and origin checks
// are the real ones too. What is pinned is the EXACT Server API request each verb puts on the
// wire - route, method and body - the way playout-cues.spec.ts pins the CasparCG envelopes, and
// that a result the Bridge cannot be sure of comes back as uncertain and is never retried.
//
// The studio's settings and cue editor do not speak OGraf yet (the backlog item's parts 3-4), so
// this spec drives the protocol the page will speak rather than a control on the page.

const TOKEN = 'e2e-ograf-token';
const SLOT = { adapter: 'ograf', rendererId: 'renderer-0', renderTarget: { layerId: '2' } } as const;
const GRAPHIC = { kind: 'template', name: 'hairline-l3' } as const;
const AT = (route: string) => `/renderers/renderer-0/target/graphicInstance/${route}`;
const JSON_BODY = 'application/json';

type Fake = Awaited<ReturnType<typeof startFakeOgrafServer>>;
interface Rig {
  fake: Fake;
  bridge: string;
  target: { adapter: 'ograf'; baseUrl: string };
}

async function rig(timeoutMs = 10_000): Promise<Rig & { close(): Promise<void> }> {
  const fake = await startFakeOgrafServer();
  const server: Server = createBridgeServer(
    { token: TOKEN, origins: [], adapters: [casparcgAdapter, createOgrafAdapter({ timeoutMs })], version: 'e2e' },
    () => {},
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    fake,
    bridge: `http://127.0.0.1:${port}`,
    target: { adapter: 'ograf', baseUrl: fake.url },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await fake.close();
    },
  };
}

/** A page on the studio's origin: any same-origin document will do, and a still is the lightest. */
async function studioPage(page: Page): Promise<void> {
  await page.goto('/favicon-32.png');
}

/** One Bridge call from the studio's origin, as the page makes it. */
async function call(page: Page, r: Rig, route: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ({ url, token, payload }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return (await res.json()) as Record<string, unknown>;
    },
    { url: `${r.bridge}${route}`, token: TOKEN, payload: { target: r.target, ...body } },
  );
}

const act = (page: Page, r: Rig, action: Record<string, unknown>) => call(page, r, '/act', { action });

test('the Bridge names the OGraf adapter, and status and list read the server, its graphics and its renderers', async ({ page }) => {
  const r = await rig();
  try {
    await studioPage(page);
    const health = await page.evaluate(async (url) => (await fetch(url)).json(), `${r.bridge}/health`);
    expect(health).toMatchObject({ ok: true, agent: 'noacg-bridge', v: 2, adapters: ['casparcg', 'ograf'] });

    expect(await call(page, r, '/status', {})).toEqual({ ok: true, v: 2, version: 'Fake OGraf Server 1.0.0', raw: '200' });
    expect(r.fake.requests).toEqual([{ method: 'GET', path: '/' }]);

    r.fake.requests.length = 0;
    const listed = await call(page, r, '/list', { kind: 'template' });
    expect(listed.items).toEqual([
      { name: 'hairline-l3', kind: 'graphic', label: 'Hairline lower third' },
      { name: 'house-strap', kind: 'graphic', label: 'House strap' },
    ]);
    // Where they can play: the renderer, its schema for a render target, and the targets it has.
    expect(listed.renderers).toEqual([
      {
        id: 'renderer-0',
        name: 'Studio A',
        description: 'A layered renderer',
        renderTargetSchema: {
          type: 'object',
          properties: { layerId: { type: 'string', enum: ['1', '2', '3', '4', '5'] } },
          required: ['layerId'],
        },
        targets: ['1', '2', '3', '4', '5'].map((layerId) => ({ renderTarget: { layerId }, name: `Layer ${layerId}` })),
      },
    ]);
    expect(r.fake.requests).toEqual([
      { method: 'GET', path: '/graphics' },
      { method: 'GET', path: '/renderers' },
      { method: 'GET', path: '/renderers/renderer-0' },
    ]);
  } finally {
    await r.close();
  }
});

test('take, update, next, out and All out each put exactly the standard request on the wire', async ({ page }) => {
  const r = await rig();
  try {
    await studioPage(page);
    const on = (params: Record<string, unknown>) => ({ renderTarget: { layerId: '2' }, graphicInstanceId: 'gi-1', params });
    const targetRead = {
      method: 'GET',
      path: `/renderers/renderer-0/target?renderTarget=${encodeURIComponent('{"layerId":"2"}')}`,
      renderTarget: { layerId: '2' },
    };
    const step = async (action: Record<string, unknown>, wire: unknown[], raw: string) => {
      r.fake.requests.length = 0;
      const reply = await act(page, r, action);
      expect(reply, `${String(action.verb)} answered`).toEqual({ ok: true, v: 2, raw });
      expect(r.fake.requests, `${String(action.verb)} on the wire`).toEqual(wire);
    };

    // TAKE replaces what is on the render target, loads the graphic with the cue's data, and
    // plays it from its own first step.
    await step(
      { verb: 'take', item: GRAPHIC, slot: SLOT, data: { f0: 'Ada Lovelace', f1: 'Analyst' } },
      [
        { method: 'PUT', path: AT('clear'), body: { filters: [{ renderTarget: { layerId: '2' } }] }, contentType: JSON_BODY },
        {
          method: 'POST',
          path: AT('load'),
          body: { renderTarget: { layerId: '2' }, graphicId: 'hairline-l3', params: { data: { f0: 'Ada Lovelace', f1: 'Analyst' } } },
          contentType: JSON_BODY,
        },
        { method: 'POST', path: AT('playAction'), body: on({}), contentType: JSON_BODY },
      ],
      'load 200 Loaded OK (gi-1); playAction 200 Playing',
    );
    // The Bridge remembers nothing: each later verb asks the target what it holds.
    await step(
      { verb: 'update', slot: SLOT, data: { f0: 'Grace Hopper', f1: 'Admiral' } },
      [targetRead, { method: 'POST', path: AT('updateAction'), body: on({ data: { f0: 'Grace Hopper', f1: 'Admiral' } }), contentType: JSON_BODY }],
      'target 200 (1 loaded); updateAction 200 Updated',
    );
    await step(
      { verb: 'next', slot: SLOT, item: GRAPHIC },
      [targetRead, { method: 'POST', path: AT('playAction'), body: on({ delta: 1 }), contentType: JSON_BODY }],
      'target 200 (1 loaded); playAction 200 Playing',
    );
    await step(
      { verb: 'out', slot: SLOT, item: GRAPHIC },
      [targetRead, { method: 'POST', path: AT('stopAction'), body: on({}), contentType: JSON_BODY }],
      'target 200 (1 loaded); stopAction 200 Stopped',
    );
    // ALL OUT is the standard's clear, filtered to the render target.
    await step(
      { verb: 'clear', slot: SLOT },
      [{ method: 'PUT', path: AT('clear'), body: { filters: [{ renderTarget: { layerId: '2' } }] }, contentType: JSON_BODY }],
      'clear 200 (1 cleared)',
    );
    expect(r.fake.instances).toEqual([]);
  } finally {
    await r.close();
  }
});

test('a result the Bridge cannot be sure of is uncertain and never retried; what OGraf cannot do sends nothing', async ({ page }) => {
  const r = await rig(1_000);
  try {
    await studioPage(page);
    // The play is sent and its answer never comes: the graphic is loaded, and may be on air.
    r.fake.fault('playAction', 'hang');
    const take = await act(page, r, { verb: 'take', item: GRAPHIC, slot: SLOT });
    expect(take).toMatchObject({ ok: false, v: 2, error: { hop: 'target', code: 'uncertain' } });
    expect(String((take.error as { detail: string }).detail)).toContain('is loaded (gi-1) but did not play');
    expect(r.fake.requests.filter((q) => q.path === AT('playAction'))).toHaveLength(1);

    // The graphic itself throwing is a refusal, with the server's own words.
    r.fake.clearFaults();
    r.fake.fault('updateAction', { status: 550, body: { title: 'GraphicError', detail: 'updateAction() threw' } });
    expect(await act(page, r, { verb: 'update', slot: SLOT, data: { f0: 'x' } })).toMatchObject({
      ok: false,
      error: { hop: 'target', code: 'refused', raw: '550 GraphicError: updateAction() threw' },
    });

    // A clip, a web page, pause: none is an OGraf verb, and none reaches the server.
    r.fake.clearFaults();
    r.fake.requests.length = 0;
    for (const action of [
      { verb: 'take', item: { kind: 'media', name: 'GIORNO' }, slot: SLOT },
      { verb: 'take', item: { kind: 'url', name: 'https://noacg.studio/output' }, slot: SLOT },
      { verb: 'pause', slot: SLOT },
    ]) {
      expect(await act(page, r, action), JSON.stringify(action)).toMatchObject({ ok: false, error: { hop: 'agent', code: 'usage' } });
    }
    expect(r.fake.requests).toEqual([]);
  } finally {
    await r.close();
  }
});
