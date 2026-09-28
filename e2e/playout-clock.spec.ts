// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,ClipClock}.tsx
// covers: src/components/home/{serverThumbnail,clipLength}.ts
// covers: src/control/{playoutLink,playoutProtocol,serverPlayout,serverPlayoutStore,serverState,playoutSlots}.ts
// covers: src/components/playoutKeys.ts
// focus
//
// THE CLIP CLOCK AND THE SERVER'S TRUTH (docs/CLIP_PLAYBACK_PLAN.md §6.3, §6.4 and §6.7, phase 2):
// the page asks NoaCG Bridge what each channel holds twice a second and draws the answer - the
// clock under the verbs, the rows' remaining time, NEXT ON SERVER, a cue replaced on the server,
// unidentified items, and a clip's STILL on the monitors. The Bridge and the server are faked at
// the network layer, as playout-cues.spec.ts fakes them: `/state` answers from a small model of the
// server's slots that each test moves by hand, so what is under test is the page's reading of it.
// What the Bridge itself reads off a real CasparCG is pinned in cli/test/state.test.mjs against
// captured INFO answers.

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';

const BRIDGE = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';
/** A 1x1 PNG, the shape THUMBNAIL RETRIEVE answers with. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** A studio with graphics on channel 1 and clips on channel 2, paired with the fake Bridge. */
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

/** One slot of the fake server: what plays there, and where it stood when. */
interface FakeSlot {
  file: string;
  /** The segment, seconds. */
  start: number;
  length: number;
  position: number;
  /** When `position` was true, on Node's clock. */
  at: number;
  paused: boolean;
  loop: boolean;
  instance?: string;
  cueId?: string;
  queued?: { file: string; auto: boolean };
  /** Readings left in which the clip is not on the layer yet: the real server answers PLAY before
   *  it is, and the Bridge keeps vouching for its instance meanwhile (cli/src/playout/slots.ts). */
  arriving?: number;
}

interface Fake {
  /** A Bridge from before phase 2: no `features`, no `capabilities`, no `/state`. */
  old: boolean;
  /** Nothing listening: the Bridge was closed. */
  gone: boolean;
  session: string;
  generation: Record<string, number>;
  slots: Record<string, FakeSlot | undefined>;
  stateCalls: number;
  /** Hold the next `/state` answer until released: a reading from before a Take landing after it. */
  holdNext: boolean;
  hold: { release: () => void } | null;
  /** How many readings after a take show the layer still empty while the clip loads. */
  arriveAfter: number;
  /** A server with no media scanner running: THUMBNAIL gives nothing. */
  noThumbnails: boolean;
}

/** The clips' lengths, as the server's list would give them. */
const LENGTHS: Record<string, number> = { OPENER: 15, GIORNO: 60 };

async function fakeBridge(page: Page, init: Partial<Fake> = {}): Promise<Fake> {
  const fake: Fake = { old: false, gone: false, session: 'b0a1', generation: {}, slots: {}, stateCalls: 0, holdNext: false, hold: null, arriveAfter: 0, noThumbnails: false, ...init };
  let count = 0;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const json = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const positionOf = (s: FakeSlot) => {
    const p = s.position + (s.paused ? 0 : (Date.now() - s.at) / 1000);
    return s.loop ? p % s.length : Math.min(s.length, p);
  };
  await page.route(`${BRIDGE}/**`, async (route) => {
    if (fake.gone) return route.abort('connectionrefused');
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/health') {
      return json(route, {
        ok: true,
        agent: 'noacg-bridge',
        v: 2,
        version: fake.old ? '0.4.1' : '0.4.2',
        adapters: ['casparcg'],
        ...(fake.old ? {} : { features: ['state'] }),
      });
    }
    const body = JSON.parse(req.postData() || '{}') as {
      channel?: number;
      action?: { verb: string; slot: { channel: number; layer: number }; item?: { name: string }; loop?: boolean; cueId?: string };
    };
    if (path === '/status') {
      return json(route, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK', ...(fake.old ? {} : { capabilities: ['state'] }) });
    }
    if (path === '/thumbnail') {
      if (fake.noThumbnails) {
        return json(route, { ok: false, v: 2, error: { hop: 'target', code: 'no-media-scanner', detail: 'The media scanner is not running.', raw: '501 THUMBNAIL FAILED' } });
      }
      return json(route, { ok: true, v: 2, png: PNG });
    }
    if (path === '/state') {
      fake.stateCalls += 1;
      if (fake.old) return json(route, { ok: false, v: 2, error: { hop: 'agent', code: 'usage', detail: 'No route /state.' } });
      const channel = body.channel ?? 1;
      // Every layer the server holds on the channel, and - as the real Bridge does - every layer
      // it acted on that holds nothing now, so the page still receives that slot's generation.
      const layers = new Set([...Object.keys(fake.slots), ...Object.keys(fake.generation)].filter((a) => a.startsWith(`${channel}-`)));
      const slots = [...layers].map((addr) => {
        const s = fake.slots[addr];
        const common = { layer: Number(addr.split('-')[1]), generation: fake.generation[addr] ?? 0 };
        if (!s) return { ...common, producer: 'empty', paused: false, loop: false };
        if (s.arriving) {
          s.arriving -= 1;
          return { ...common, producer: 'empty', paused: false, loop: false, instance: s.instance, cueId: s.cueId };
        }
        return {
          ...common,
          producer: 'video',
          file: s.file,
          segment: { start: s.start, length: s.length },
          position: positionOf(s),
          paused: s.paused,
          loop: s.loop,
          ...(s.queued ? { queued: s.queued } : {}),
          ...(s.instance ? { instance: s.instance } : {}),
          ...(s.cueId ? { cueId: s.cueId } : {}),
        };
      });
      const reply = { ok: true, v: 2, channel, session: fake.session, observedAt: Date.now(), slots };
      if (fake.holdNext) {
        fake.holdNext = false;
        await new Promise<void>((release) => (fake.hold = { release }));
      }
      return json(route, reply);
    }
    if (path === '/act') {
      const a = body.action!;
      const addr = `${a.slot.channel}-${a.slot.layer}`;
      if (a.verb === 'take' || a.verb === 'out') fake.generation[addr] = (fake.generation[addr] ?? 0) + 1;
      let instance: string | undefined;
      if (a.verb === 'take' && a.item) {
        instance = `${fake.session}.${++count}`;
        fake.slots[addr] = {
          file: a.item.name,
          start: 0,
          length: LENGTHS[a.item.name] ?? 30,
          position: 0,
          at: Date.now(),
          paused: false,
          loop: !!a.loop,
          instance,
          ...(a.cueId ? { cueId: a.cueId } : {}),
          ...(fake.arriveAfter ? { arriving: fake.arriveAfter } : {}),
        };
      }
      if (a.verb === 'out') fake.slots[addr] = undefined;
      const s = fake.slots[addr];
      if (s && (a.verb === 'pause' || a.verb === 'resume')) {
        s.position = positionOf(s);
        s.at = Date.now();
        s.paused = a.verb === 'pause';
      }
      return json(route, { ok: true, v: 2, raw: '202 OK', generation: fake.generation[addr] ?? 0, session: fake.session, ...(instance ? { instance } : {}) });
    }
    return json(route, { ok: true, v: 2, items: [], raw: '202 OK' });
  });
  return fake;
}

/** A production holding a graphic and two server clips on 2-10: OPENER (15 s) and GIORNO (60 s). */
async function productionWithClips(page: Page): Promise<void> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Evening News');
  // evaluateInPage: the function ends in a store mutation, the window e2e/_evaluate.ts closes.
  await evaluateInPage(page, async () => {
    const { loadShows, addPlayoutItem } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Evening News')!;
    addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', name: 'OPENER', frames: 375, fps: 25, channel: 2 });
    addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', name: 'GIORNO', frames: 1500, fps: 25, channel: 2 });
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(3);
}

const row = (page: Page, text: string) => page.locator('.pd-cue', { hasText: text });

async function select(page: Page, text: string) {
  await row(page, text).getByTestId('select-cue').click();
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
}

async function take(page: Page, text: string) {
  await select(page, text);
  await page.getByTestId('verb-take').click();
  await expect(row(page, text)).toContainText('ON AIR');
}

/** Move the fake server's clip on a slot so that this many seconds of it remain. */
function leave(fake: Fake, addr: string, remaining: number) {
  const s = fake.slots[addr]!;
  s.position = s.length - remaining;
  s.at = Date.now();
}

const clock = (page: Page) => page.getByTestId('clip-clock');
const clockTime = (page: Page) => page.getByTestId('clip-clock-time');

test('the clock counts the segment the server reports, warns at 10 and 5, then holds and counts up', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'OPENER');

  await expect(clock(page)).toBeVisible();
  await expect(clock(page)).toContainText('ON AIR 2-10');
  await expect(clock(page)).toHaveAttribute('data-phase', 'counting');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');
  await expect(page.getByTestId('clip-clock-then')).toHaveText('then holds the last frame');

  // A TRIMMED clip: the server reports a 7.5 s segment 5 s into a longer file, and the clock counts
  // the segment, never the file. The row's length column counts with it.
  Object.assign(fake.slots['2-10']!, { start: 5, length: 7.5, position: 0, at: Date.now() });
  await expect(clockTime(page)).toHaveText(/^-0:0[678]$/);
  await expect(clock(page)).toHaveAttribute('data-phase', 'warning');
  await expect(row(page, 'OPENER').getByTestId('cue-length')).toHaveText(/^-0:0[5-8]$/);

  leave(fake, '2-10', 4.2);
  await expect(clock(page)).toHaveAttribute('data-phase', 'final');
  await expect(clockTime(page)).toHaveText(/^-0:0[2345]$/);

  // At the end it holds the last frame: amber, counting up, and still on air.
  leave(fake, '2-10', 0);
  await expect(clock(page)).toHaveAttribute('data-phase', 'holding');
  await expect(clockTime(page)).toHaveText(/^HOLDING \+0:0\d$/);
  await expect(clockTime(page)).toHaveText('HOLDING +0:01', { timeout: 4000 });
  await expect(page.getByTestId('verb-out')).toBeEnabled();
});

test('a clip the server has not put on the layer yet stays ON AIR, counting from the Take', async ({ page }) => {
  // Measured on the real 2.5.0: the first reading after `202 PLAY OK` can show the layer empty.
  // The Bridge still vouches for its instance then, and the page keeps the clip up; treating that
  // reading as "ended" took every freshly taken clip off air on the real server.
  await seedSettings(page);
  const fake = await fakeBridge(page, { arriveAfter: 3 });
  await productionWithClips(page);
  // Watch the row itself, from before the Take: once ON AIR, it must not leave it for a single
  // moment while the clip arrives. (Watching from after the Take would miss a first reading that
  // lands at once, and a later one that puts the row back would hide it.)
  await row(page, 'OPENER').evaluate((el) => {
    const w = window as unknown as { droppedOffAir: number };
    w.droppedOffAir = 0;
    let wasOn = false;
    new MutationObserver(() => {
      if (el.classList.contains('on-air')) wasOn = true;
      else if (wasOn) w.droppedOffAir += 1;
    }).observe(el, { attributes: true, attributeFilter: ['class'] });
  });
  await take(page, 'OPENER');
  const calls = fake.stateCalls;
  await expect.poll(() => fake.stateCalls, { timeout: 15_000 }).toBeGreaterThan(calls + 3);
  expect(await page.evaluate(() => (window as unknown as { droppedOffAir: number }).droppedOffAir), 'times the row left ON AIR').toBe(0);
  await expect(row(page, 'OPENER')).toContainText('ON AIR');
  await expect(clock(page)).toHaveAttribute('data-phase', 'counting');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');
  await expect(page.getByTestId('verb-out')).toBeEnabled();
});

test('PAUSED stops the count and Resume moves it on; a looping clip never warns', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'GIORNO');
  leave(fake, '2-10', 9.5);
  await expect(clock(page)).toHaveAttribute('data-phase', 'warning');

  await page.getByTestId('playout-pause').click();
  await expect(clock(page)).toHaveAttribute('data-phase', 'paused');
  await expect(clockTime(page)).toHaveText(/^PAUSED -0:(08|09|10)$/);
  const paused = await clockTime(page).textContent();
  // Readings keep landing while paused, and none moves the number.
  const calls = fake.stateCalls;
  await expect.poll(() => fake.stateCalls).toBeGreaterThan(calls + 2);
  await expect(clockTime(page)).toHaveText(paused!);

  await page.getByTestId('playout-resume').click();
  await expect(clock(page)).not.toHaveAttribute('data-phase', 'paused');

  // Looping: its own time, small, and never a warning, even in its last seconds.
  fake.slots['2-10']!.loop = true;
  leave(fake, '2-10', 3);
  await expect(clock(page)).toHaveAttribute('data-phase', 'looping');
  await expect(page.getByTestId('clip-clock-then')).toHaveText('loops until Out');
});

test('a Bridge from before phase 2: the clock counts from the Take, and says it is estimated', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page, { old: true });
  await productionWithClips(page);
  await take(page, 'OPENER');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'true');
  await expect(page.getByTestId('clip-clock-estimated')).toBeVisible();
  await expect(clockTime(page)).toHaveText(/^-0:1[345]$/);
  // It never asks an old Bridge for a state it cannot give.
  expect(fake.stateCalls).toBe(0);
});

test('the Bridge gone mid-clip: the count carries on, and says estimated after three seconds', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'GIORNO');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');
  await expect(page.getByTestId('clip-clock-estimated')).toHaveCount(0);
  fake.gone = true;
  await expect(clock(page)).toHaveAttribute('data-estimated', 'true', { timeout: 6000 });
  await expect(clockTime(page)).toHaveText(/^-0:5\d$/);
});

test('a reading from before a Take that lands after it is ignored', async ({ page }) => {
  // Plan §18, case 14. Without the generation check the held reading - OPENER, under the
  // generation before GIORNO's Take - would say GIORNO's slot holds somebody else's clip.
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'OPENER');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');
  fake.holdNext = true;
  await expect.poll(() => fake.hold !== null).toBe(true);
  await take(page, 'GIORNO');
  fake.hold!.release();
  fake.hold = null;
  // Readings after the stale one land too, and GIORNO stays ON AIR, never "replaced".
  const calls = fake.stateCalls;
  await expect.poll(() => fake.stateCalls).toBeGreaterThan(calls + 2);
  await expect(row(page, 'GIORNO')).toContainText('ON AIR');
  await expect(row(page, 'GIORNO').getByTestId('cue-replaced')).toHaveCount(0);
  await expect(clock(page)).toContainText('GIORNO');
});

test('the clock and the rows move with the server; the page does not re-render with them', async ({ page }) => {
  // Plan §18, case 15. The page re-renders on timers of its own (the header's session clock once a
  // second, the monitors' state polls), and React folds updates together, so counting renders over
  // a stretch of real time cannot tell a reading's render from a timer's. So every timer on the
  // page is FROZEN (Playwright's clock) and readings are driven one at a time - a tab coming back
  // into view reads the server at once - so the only thing that can render anything is a reading.
  // Each one redraws the clock and none redraws the page. Mutation-tested by subscribing the page
  // to the timing part: the page then renders with every reading and this fails.
  await page.clock.install();
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  const pageRenders = () => page.getByTestId('production-page').evaluate((el) => Number(el.getAttribute('data-renders')));
  const clockRenders = () => clock(page).evaluate((el) => Number(el.getAttribute('data-renders')));

  await take(page, 'GIORNO');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');
  // With time running, readings arrive twice a second and the clock redraws with them.
  const [c0, calls0] = [await clockRenders(), fake.stateCalls];
  await expect.poll(() => fake.stateCalls, { timeout: 4000 }).toBeGreaterThanOrEqual(calls0 + 4);
  expect((await clockRenders()) - c0).toBeGreaterThanOrEqual(4);

  // Now freeze every timer, let whatever was in flight land, and read six times by hand.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const settled = fake.stateCalls;
  await expect.poll(async () => {
    const before = await pageRenders();
    await page.waitForTimeout(300);
    return (await pageRenders()) - before;
  }).toBe(0);
  const p0 = await pageRenders();
  for (let i = 0; i < 6; i += 1) {
    const [calls, drawn] = [fake.stateCalls, await clockRenders()];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => fake.stateCalls).toBeGreaterThan(calls);
    await expect.poll(clockRenders, { message: 'the clock redraws with a reading' }).toBeGreaterThan(drawn);
  }
  expect(fake.stateCalls - settled).toBeGreaterThanOrEqual(6);
  const moved = (await pageRenders()) - p0;
  expect(moved, `the page rendered ${moved} times over six readings`).toBe(0);
});

test('a clip ended on the server takes the row, Out and All out with it', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'GIORNO');
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();

  // Somebody stops 2-10 from another client: nothing of this rundown is up any more.
  fake.slots['2-10'] = undefined;
  await expect(row(page, 'GIORNO')).not.toContainText('ON AIR');
  await expect(clock(page)).toHaveCount(0);
  await expect(page.getByTestId('verb-out')).toBeDisabled();
  await expect(page.getByTestId('verb-out-all')).toBeDisabled();
  await expect(page.getByTestId('playout-on-air')).toHaveCount(0);
});

test('a reload finds its own clip by instance; another client\'s take is "replaced", a restarted Bridge\'s unidentified', async ({ page }) => {
  // Plan §18, case 17.
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'OPENER');

  // RELOAD mid-clip: the Bridge still knows the instance and its cue, so the row and the clock
  // come back exactly - matched by the instance, never by the file's name.
  await page.reload();
  await expect(row(page, 'OPENER')).toContainText('ON AIR');
  await expect(clock(page)).toContainText('OPENER');
  await expect(clock(page)).toHaveAttribute('data-estimated', 'false');

  // The same file taken again from another client: the Bridge no longer vouches for it.
  await select(page, 'OPENER');
  fake.slots['2-10']!.instance = undefined;
  await expect(row(page, 'OPENER').getByTestId('cue-replaced')).toBeVisible();
  await expect(row(page, 'OPENER')).not.toContainText('ON AIR');
  await expect(page.getByTestId('verb-out')).toBeDisabled();
  await expect(clock(page)).toHaveCount(0);

  // Taking it again puts it back as this page's own.
  await page.getByTestId('verb-take').click();
  await expect(row(page, 'OPENER')).toContainText('ON AIR');
  await expect(row(page, 'OPENER').getByTestId('cue-replaced')).toHaveCount(0);

  // A restarted Bridge: a new session, and an instance it never minted. What plays is listed as
  // unidentified, and no cue is guessed from the file's name.
  fake.session = 'c0ffee';
  await page.reload();
  await expect(page.getByTestId('server-unidentified')).toContainText('Unidentified item on 2-10');
  await expect(page.getByTestId('server-unidentified')).toContainText('OPENER');
  await expect(row(page, 'OPENER')).not.toContainText('ON AIR');
  await expect(clock(page)).toHaveCount(0);
});

test('NEXT ON SERVER: a clip waiting behind another on its slot says so', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'OPENER');
  await expect(row(page, 'GIORNO').getByTestId('cue-next-on-server')).toHaveCount(0);
  fake.slots['2-10']!.queued = { file: 'GIORNO', auto: true };
  await expect(row(page, 'GIORNO').getByTestId('cue-next-on-server')).toHaveText('NEXT ON SERVER');
  await expect(row(page, 'OPENER').getByTestId('cue-next-on-server')).toHaveCount(0);
});

test('a server clip shows as a STILL: its picture and length on PREVIEW, its picture under PROGRAM', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await productionWithClips(page);
  await select(page, 'OPENER');
  await expect(page.getByTestId('preview-still-tag')).toHaveText('STILL');
  await expect(page.getByTestId('preview-length')).toHaveText('0:15');
  await expect(page.getByTestId('program-still-tag')).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('program-still-tag')).toHaveText('STILL');
  // PROGRAM shows no time: the clock beside it does.
  await expect(page.locator('.pd-pgm [data-testid="preview-length"]')).toHaveCount(0);
});

test('with no picture to show, PROGRAM names the server clip instead of standing blank', async ({ page }) => {
  // A server whose media scanner is not running has no thumbnails (measured on the real 2.5.0).
  await seedSettings(page);
  await fakeBridge(page, { noThumbnails: true });
  await productionWithClips(page);
  await take(page, 'OPENER');
  const program = page.locator('.pd-pgm');
  await expect(program).toContainText('OPENER plays on the server');
  await expect(program).not.toContainText('Nothing on air');
  await expect(page.getByTestId('program-still-tag')).toHaveCount(0);
  await expect(page.getByTestId('preview-server')).toContainText('OPENER');
});

test('the tab coming back into view reads the server at once', async ({ page }) => {
  // Plan §18, case 16. A hidden tab's timers are slowed by the browser, so a return re-reads.
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await productionWithClips(page);
  // Nothing on air: the idle pace is three seconds, so a reading straight after one is the wake.
  const before = fake.stateCalls;
  await expect.poll(() => fake.stateCalls).toBeGreaterThan(before);
  const after = fake.stateCalls;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => fake.stateCalls, { timeout: 800 }).toBeGreaterThan(after);
});

test('on a phone the clock sits in the stacked column, and the verbs stay pinned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSettings(page);
  await fakeBridge(page);
  await productionWithClips(page);
  await take(page, 'GIORNO');
  await expect(clock(page)).toBeVisible();
  const [monitors, clockBox, rail] = await Promise.all([
    page.locator('.pd-monitors').boundingBox(),
    clock(page).boundingBox(),
    page.locator('#pd-rundown').boundingBox(),
  ]);
  expect(clockBox!.y, 'under the monitors').toBeGreaterThanOrEqual(monitors!.y + monitors!.height - 1);
  expect(clockBox!.y + clockBox!.height, 'above the rundown').toBeLessThanOrEqual(rail!.y + 1);
  // Never inside the verb bar pinned to the bottom of the screen.
  expect(await page.getByTestId('production-verbs').locator('[data-testid="clip-clock"]').count()).toBe(0);
});
