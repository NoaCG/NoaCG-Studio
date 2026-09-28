// covers: src/components/home/{ProductionPage,CueRundown,ServerCueEditor,ClipClock}.tsx
// covers: src/control/{serverPlayout,serverState,playoutLink,playoutProtocol}.ts
// covers: src/model/{cuePlayback,shows}.ts
// focus
//
// PLAY NEXT (docs/CLIP_PLAYBACK_PLAN.md §6.4, §6.6 and §6.10, phase 3): a clip that plays the next
// clip on its layer, found in the rundown as it stands at the Take and named where the choice is
// made; one Take sends the whole run to NoaCG Bridge as a sequence; the clip clock counts TO STUDIO
// with every fade's overlap taken off; the server's own switch moves ON AIR down the rundown; and Out
// in the middle stops it. The Bridge is faked at the network layer, and its `/state` answers from a
// model of what the Bridge's runner does - each file after the one before, a fade in starting that
// long before the end - on a clock the test moves. The runner itself is tested against a stateful fake
// CasparCG in cli/test/runner.test.mjs.

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';

const BRIDGE = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';

async function seedSettings(page: Page): Promise<void> {
  await page.addInitScript(
    ([bridge, token]) => {
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({
          agentUrl: bridge,
          agentToken: token,
          host: '127.0.0.1',
          amcpPort: 5250,
          channel: 1,
          layer: 20,
          v: 1,
          channels: [
            { channel: 1, name: 'Graphics' },
            { channel: 2, name: 'Inserts' },
          ],
          clipChannel: 2,
        }),
      );
    },
    [BRIDGE, TOKEN] as const,
  );
}

interface Entry {
  file: string;
  cueId?: string;
  length: number;
  fadeIn: number;
  raw: unknown;
}

/** What the Bridge runs on one slot: the files, when the first started, and a pause. */
interface Run {
  entries: Entry[];
  startedAt: number;
  pausedAt?: number;
  instance: string;
}

interface Fake {
  session: string;
  generation: Record<string, number>;
  runs: Record<string, Run | undefined>;
  /** Moves the fake's clock ahead of the wall's, as a clip playing on would. */
  skew: number;
  actions: { verb: string; [k: string]: unknown }[];
  /** What the server's list (`CLS`) answers. */
  list: { name: string; kind: string; frames?: number; fps?: number }[];
}

async function fakeBridge(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const fake: Fake = { session: 'b5', generation: {}, runs: {}, skew: 0, actions: [], list: [], ...init };
  let count = 0;
  const now = () => Date.now() + fake.skew;
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  /** Which entry is on air after `t` seconds, and how far into it: each starts its fade in before the
   *  one before it ends, the last holds at its end. */
  const where = (run: Run, t: number) => {
    let start = 0;
    let k = 0;
    for (let i = 1; i < run.entries.length; i++) {
      const next = start + run.entries[i - 1].length - run.entries[i].fadeIn;
      if (t < next) break;
      start = next;
      k = i;
    }
    return { k, position: Math.min(run.entries[k].length, t - start) };
  };
  await page.route(`${BRIDGE}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/health') {
      return json(route, { ok: true, agent: 'noacg-bridge', v: 2, version: '0.5.0', adapters: ['casparcg'], features: ['state', 'playback', 'sequence'] });
    }
    const body = JSON.parse(req.postData() || '{}') as { channel?: number; kind?: string; action?: Record<string, unknown> & { verb: string; slot: { channel: number; layer: number } } };
    if (path === '/status') {
      return json(route, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK', capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence'] });
    }
    if (path === '/list') return json(route, { ok: true, v: 2, items: body.kind === 'media' ? fake.list : [] });
    if (path === '/state') {
      const channel = body.channel ?? 1;
      const slots = Object.entries(fake.runs)
        .filter(([addr]) => addr.startsWith(`${channel}-`))
        .map(([addr, run]) => {
          const common = { layer: Number(addr.split('-')[1]), generation: fake.generation[addr] ?? 0 };
          if (!run) return { ...common, producer: 'empty', paused: false, loop: false };
          const t = ((run.pausedAt ?? now()) - run.startedAt) / 1000;
          const { k, position } = where(run, t);
          const on = run.entries[k];
          const rest = run.entries.slice(k + 1);
          return {
            ...common,
            producer: 'video',
            file: on.file,
            segment: { start: 0, length: on.length },
            position,
            paused: run.pausedAt !== undefined,
            loop: false,
            instance: run.instance,
            ...(on.cueId ? { cueId: on.cueId } : {}),
            ...(rest.length ? { sequence: { next: rest.map((e) => e.raw) }, queued: { file: rest[0].file, auto: true } } : {}),
          };
        });
      return json(route, { ok: true, v: 2, channel, session: fake.session, observedAt: Date.now(), slots });
    }
    if (path === '/act') {
      const a = body.action!;
      fake.actions.push(a);
      const addr = `${a.slot.channel}-${a.slot.layer}`;
      if (a.verb === 'pause' || a.verb === 'resume') {
        const run = fake.runs[addr];
        if (run && a.verb === 'pause' && run.pausedAt === undefined) run.pausedAt = now();
        if (run && a.verb === 'resume' && run.pausedAt !== undefined) {
          run.startedAt += now() - run.pausedAt;
          run.pausedAt = undefined;
        }
      }
      if (a.verb !== 'update' && a.verb !== 'next') fake.generation[addr] = (fake.generation[addr] ?? 0) + 1;
      let instance: string | undefined;
      if (a.verb === 'take' || a.verb === 'sequence') {
        instance = `${fake.session}.${++count}`;
        const entries: Entry[] =
          a.verb === 'sequence'
            ? (a.entries as { item: { name: string }; cueId?: string; playback?: { fadeIn?: number }; media: { seconds: number } }[]).map((e) => ({
                file: e.item.name,
                cueId: e.cueId,
                length: e.media.seconds,
                fadeIn: e.playback?.fadeIn ?? 0,
                raw: e,
              }))
            : [{ file: (a.item as { name: string }).name, cueId: a.cueId as string | undefined, length: 10, fadeIn: 0, raw: null }];
        fake.runs[addr] = { entries, startedAt: now(), instance };
      }
      if (a.verb === 'out') fake.runs[addr] = undefined;
      return json(route, { ok: true, v: 2, raw: '202 OK', generation: fake.generation[addr], session: fake.session, ...(instance ? { instance } : {}) });
    }
    return json(route, { ok: true, v: 2, items: [] });
  });
  return fake;
}

/** A production: its graphic, then the given server media, each on its own item. */
async function production(page: Page, media: Record<string, unknown>[]): Promise<void> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Evening News');
  await evaluateInPage(
    page,
    async (list) => {
      const { loadShows, addPlayoutItem } = await import('/src/model/shows.ts');
      const show = loadShows().find((s) => s.name === 'Evening News')!;
      for (const m of list) addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', channel: 2, ...m } as never);
    },
    media,
  );
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1 + media.length);
}

const row = (page: Page, text: string) => page.locator('.pd-cue', { hasText: text });

async function select(page: Page, text: string): Promise<void> {
  await row(page, text).getByTestId('select-cue').click();
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
}

const clockTime = (page: Page) => page.getByTestId('clip-clock-time');
const clockThen = (page: Page) => page.getByTestId('clip-clock-then');

test('Play next names the clip it plays, past what it skips, and is off with the reason when none qualifies', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await production(page, [
    { name: 'OPENER', mediaKind: 'movie', frames: 375, fps: 25 },
    { name: 'STING', mediaKind: 'audio', frames: 75, fps: 25 },
    { name: 'GIORNO', mediaKind: 'movie', frames: 1500, fps: 25 },
    { name: 'BLIP', mediaKind: 'movie', frames: 25, fps: 25 },
    { name: 'LOGO', mediaKind: 'still' },
  ]);

  // OPENER on 2-10: the next clip on 2-10 is GIORNO, past the sting on 2-5 (owner, Q3).
  await select(page, 'OPENER');
  await expect(page.getByTestId('clip-end-next')).toBeEnabled();
  await page.getByTestId('clip-end-next').click();
  await expect(page.getByTestId('clip-end-hint')).toHaveText('Then plays GIORNO (cue 4, after a clip on 2-5)');
  await expect(row(page, 'OPENER').getByRole('img', { name: 'Plays the next clip on its layer' })).toBeVisible();

  // GIORNO: the next on its layer is a second and a half, too short to queue the one after it in time.
  await select(page, 'GIORNO');
  await expect(page.getByTestId('clip-end-next')).toBeDisabled();
  await expect(page.getByTestId('clip-end-next')).toHaveAttribute('title', 'Play next is off: the next clip is shorter than 2 seconds.');
  await expect(page.getByTestId('clip-end-hint')).toHaveText('Holds its last frame until Out · Play next is off: the next clip is shorter than 2 seconds');
  // BLIP: a still never ends, so nothing after it could play.
  await select(page, 'BLIP');
  await expect(page.getByTestId('clip-end-next')).toHaveAttribute('title', 'Play next is off: the next cue on 2-10 is a still, which never ends.');
  // The sting on 2-5 has nothing after it on its own layer.
  await select(page, 'STING');
  await expect(page.getByTestId('clip-end-next')).toHaveAttribute('title', 'Play next is off: no clip after this one plays on 2-5.');

  // A cue that already says Play next when the rundown no longer gives it a clip to play - set on
  // a production edited elsewhere - is not taken as a Hold in silence.
  await evaluateInPage(page, async () => {
    const { loadShows, setCuePlayback } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Evening News')!;
    const giorno = show.cues!.find((c) => c.label === 'GIORNO')!;
    setCuePlayback(show.id, giorno.id, { end: 'next' });
  });
  await settleDurableWrites(page);
  await page.reload();
  await select(page, 'GIORNO');
  // The taken cue's own Play next must be found: its Take is off, saying why, never taken as a Hold.
  await expect(page.getByTestId('playout-take-blocked')).toHaveText(
    'This cue plays the next clip, but the next clip is shorter than 2 seconds. Set another ending to take it.',
  );
  await expect(page.getByTestId('verb-take')).toBeDisabled();
});

test('one Take plays the run as a sequence: TO STUDIO less the overlaps, ON AIR follows the server, Out stops it', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, [
    { name: 'ALPHA', mediaKind: 'movie', frames: 250, fps: 25 },
    { name: 'BRAVO', mediaKind: 'movie', frames: 250, fps: 25 },
    { name: 'CHARLIE', mediaKind: 'movie', frames: 250, fps: 25 },
  ]);
  await select(page, 'ALPHA');
  await page.getByTestId('clip-end-next').click();
  await select(page, 'BRAVO');
  await page.getByTestId('clip-end-next').click();
  await page.getByTestId('clip-fade-in-long').click();
  await select(page, 'CHARLIE');
  await page.getByTestId('clip-end-clear').click();
  await page.getByTestId('clip-fade-in-long').click();
  await page.getByTestId('clip-fade-out-short').click();

  await select(page, 'ALPHA');
  await page.getByTestId('verb-take').click();
  await expect(row(page, 'ALPHA')).toContainText('ON AIR');
  // ONE action: the run, each file with its own settings and the last with its own ending.
  expect(fake.actions).toHaveLength(1);
  const cueIds = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return Object.fromEntries(loadShows()[0].cues!.map((c) => [c.label, c.id]));
  });
  expect(fake.actions[0]).toEqual({
    verb: 'sequence',
    slot: { adapter: 'casparcg', channel: 2, layer: 10 },
    entries: [
      { item: { kind: 'media', name: 'ALPHA' }, cueId: cueIds.ALPHA, media: { kind: 'movie', seconds: 10 } },
      { item: { kind: 'media', name: 'BRAVO' }, cueId: cueIds.BRAVO, playback: { fadeIn: 1 }, media: { kind: 'movie', seconds: 10 } },
      { item: { kind: 'media', name: 'CHARLIE' }, cueId: cueIds.CHARLIE, playback: { end: 'clear', fadeOut: 0.5, fadeIn: 1 }, media: { kind: 'movie', seconds: 10 } },
    ],
  });

  // Three 10-second clips joined by two 1-second fades end after 28 seconds, not 30 (§18 case 18).
  await expect(clockTime(page)).toHaveText(/^TO STUDIO -0:2[78]$/);
  await expect(clockThen(page)).toHaveText(/^clip -0:(09|10) · next BRAVO 0:10$/);
  await expect(row(page, 'BRAVO').getByTestId('cue-next-on-server')).toBeVisible();

  // The server switches to B by itself 9 seconds in: ON AIR moves with it, the clip's own time is B's.
  fake.skew += 9_500;
  await expect(row(page, 'BRAVO')).toContainText('ON AIR');
  await expect(row(page, 'ALPHA')).not.toContainText('ON AIR');
  await expect(clockTime(page)).toHaveText(/^TO STUDIO -0:1[89]$/);
  await expect(clockThen(page)).toHaveText(/^clip -0:(09|10) · next CHARLIE 0:10$/);
  // No timer on the page moved anything: the selection stays where the operator left it.
  await expect(row(page, 'ALPHA').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  // In its last seconds the warning is on TO STUDIO.
  fake.skew += 13_500;
  await expect(page.getByTestId('clip-clock')).toHaveAttribute('data-phase', 'final');

  // Out in the middle: the one on air goes, and nothing else is sent or airs.
  fake.skew -= 10_000;
  await expect(row(page, 'CHARLIE')).toContainText('ON AIR');
  await select(page, 'CHARLIE');
  await page.getByTestId('verb-out').click();
  await expect(row(page, 'CHARLIE')).not.toContainText('ON AIR');
  // With CHARLIE's own fade out: the Bridge mixes the layer to nothing, which also takes anything
  // queued behind it away (cli/test/runner.test.mjs).
  expect(fake.actions.at(-1)).toEqual({ verb: 'out', slot: { adapter: 'casparcg', channel: 2, layer: 10 }, item: { kind: 'media', name: 'CHARLIE' }, fadeOut: 0.5 });
  await expect(page.getByTestId('clip-clock')).toHaveCount(0);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('an older clip learns its kind from the server\'s list; one the list does not have cannot join a sequence', async ({ page }) => {
  // §18 case 5. Items saved before the kind was kept: the page asks the server's list once.
  await seedSettings(page);
  await fakeBridge(page, { list: [{ name: 'ALPHA', kind: 'movie', frames: 250, fps: 25 }] });
  await production(page, [
    { name: 'ALPHA', frames: 250, fps: 25 },
    { name: 'BRAVO', frames: 250, fps: 25 },
  ]);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { loadShows } = await import('/src/model/shows.ts');
        return loadShows()[0].playoutItems!.map((i) => i.mediaKind ?? null);
      }),
    )
    .toEqual(['movie', null]);
  await select(page, 'ALPHA');
  await expect(page.getByTestId('clip-end-next')).toHaveAttribute('title', "Play next is off: the next clip on 2-10 is not in the server's list yet, so its kind is not known.");
  // Named by the operator under Advanced, it can.
  await select(page, 'BRAVO');
  await page.getByTestId('clip-advanced-toggle').click();
  await page.getByTestId('clip-kind').selectOption('movie');
  await select(page, 'ALPHA');
  await expect(page.getByTestId('clip-end-next')).toBeEnabled();
});
