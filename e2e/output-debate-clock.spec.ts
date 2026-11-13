// A DEBATE BOARD'S TWO CLOCKS THROUGH A RESEND, ON A REAL OUTPUT (#2161). The real /output shell with
// its real boot, stage and machine, and the real dc01 document; only the backend is stood in for, as
// in output-typed-recovery.spec.ts, and it serves the rows a production page writes. Every Take and
// ✎ Update resends the cue's whole value set, and the cue keeps its plain allowance for both clocks.
// Each row's time is set back from now, so a minute of debate takes no minute of test.
// covers: src/output/main.ts, src/control/matchClockWire.ts, src/templates/scoreboards/debateFloor.ts

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';

const BACKEND = 'https://debate.supabase.test';
const CONFIG_MODULE = `
export function loadBackendConfig() { return { url: ${JSON.stringify(BACKEND)}, anonKey: 'anon-test-key' }; }
export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
`;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};
const EPOCH = '00000000-0000-4000-8000-0000000000d1';
const GRAPHIC = 'Debate';

type Spec = { html: string; css: string; js: string; resolution: { width: number; height: number; label: string }; fps: number };
type Row = { id: number; seq: number; graphic: string; msg: Record<string, unknown>; created_at: string };
type Report = { data: Record<string, string>; state: unknown; seq: number };

interface Debate {
  /** The cue's whole value set: what every Take and ✎ Update sends. */
  cue: Record<string, string>;
  /** Write a row to the log, `ago` milliseconds in the past. */
  write: (msg: Record<string, unknown>, ago?: number) => void;
  /** The output's last report of the board, handed back to an output that boots. */
  report: () => Report | null;
  /** The board is on air with this report, before any output has booted. */
  onAirWith: (report: Report) => void;
}

/** The real dc01 and its field defaults, and the stand-in backend following one growing log. */
async function openDebate(page: Page): Promise<Debate> {
  await page.goto('/app#/home');
  const { spec, cue } = await page.evaluate(async () => {
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const { seedValues } = await __noacgImport('/src/model/shows.ts');
    const template = variantById('dc01')!.create({});
    const { html, css, js, resolution, fps } = template;
    return { spec: { html, css, js, resolution, fps }, cue: seedValues(template.fields) as Record<string, string> };
  }) as { spec: Spec; cue: Record<string, string> };

  // There is no socket to join here, so rows arrive on the follow's poll floor (CONTROL_POLL_MS, 30 s).
  // The same poll, run more often in the shell's own document: never in a graphic's.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const every = window.setInterval.bind(window);
    window.setInterval = ((run: TimerHandler, ms?: number) => every(run, ms === 30_000 ? 200 : ms)) as typeof window.setInterval;
  });

  const rows: Row[] = [];
  let reported: Report | null = null;
  let on = false;
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (path.endsWith('/rpc/control_output_resolve')) {
      return json({
        id: '00000000-0000-4000-8000-0000000000d2',
        title: 'Debate Probe',
        output: {
          v: 1,
          resolution: spec.resolution,
          graphics: [{ key: GRAPHIC, ...spec, assets: [], layer: 20 }],
          cues: [],
          ver: { n: 1, at: new Date().toISOString(), h: 'abcdef0123456789', g: {} },
        },
        live: reported ? { [GRAPHIC]: { ...reported, event: 1000 + reported.seq } } : {},
        last_event_id: 0,
        epoch: EPOCH,
        legacy: false,
      });
    }
    if (path.endsWith('/rpc/control_output_tail_seq')) {
      const after = Number((req.postDataJSON() as { p_after?: number }).p_after ?? 0);
      const head = { seq: rows.length, graphics: on ? { [GRAPHIC]: { on: true } } : {} };
      return json({ epoch: EPOCH, rows: rows.filter((r) => r.seq > after).slice(0, 500), head });
    }
    if (path.endsWith('/rpc/control_output_report_seq')) {
      const b = req.postDataJSON() as { p_data: Record<string, string>; p_state: unknown; p_seq: number };
      reported = { data: b.p_data, state: b.p_state, seq: b.p_seq };
      return json(null);
    }
    return json([]);
  });
  return {
    cue,
    write: (msg, ago = 0) => {
      const seq = rows.length + 1;
      rows.push({ id: 1000 + seq, seq, graphic: GRAPHIC, msg, created_at: new Date(Date.now() - ago).toISOString() });
      if (msg.t === 'play') on = true;
      if (msg.t === 'stop') on = false;
    },
    report: () => reported,
    onAirWith: (report) => {
      reported = report;
      on = true;
    },
  };
}

const board = (page: Page) => page.frameLocator(`iframe[title="${GRAPHIC}"]`);
const clockA = (page: Page) => board(page).locator('#f5');
const clockB = (page: Page) => board(page).locator('#f6');
const round = (page: Page) => board(page).locator('#f0');

/** "04:20" -> 260. What is not a clock's time reads as NaN, so no bound passes on it. */
const seconds = (text: string | null): number => {
  const hit = /^(\d\d):(\d\d)$/.exec((text ?? '').trim());
  return hit ? Number(hit[1]) * 60 + Number(hit[2]) : Number.NaN;
};
const read = async (clock: ReturnType<typeof clockA>): Promise<number> => seconds(await clock.textContent());

/** On air at full time, and heard: the Take is the cue's whole set, then the entrance. */
async function takeTheBoard(page: Page, debate: Debate): Promise<void> {
  await page.goto('/output?production=debate-probe');
  await expect(page.locator(`iframe[title="${GRAPHIC}"]`)).toBeAttached({ timeout: 30_000 });
  debate.write({ t: 'update', data: debate.cue });
  debate.write({ t: 'play' });
  await expect(page.locator('body')).toHaveAttribute('data-plays', '1', { timeout: 30_000 });
  await expect(clockA(page)).toHaveText('05:00');
  await expect(clockB(page)).toHaveText('05:00');
}

/** A has spoken for a minute and banked 04:00; B took the floor 40 s ago and reads about 04:20. */
async function aThenB(page: Page, debate: Debate): Promise<void> {
  debate.write({ t: 'event', event: 'switch' }, 100_000);
  debate.write({ t: 'event', event: 'switch' }, 40_000);
  await expect(clockA(page)).toHaveText('04:00', { timeout: 20_000 });
  await expect.poll(() => read(clockB(page)), { timeout: 20_000 }).toBeLessThanOrEqual(260);
}

/** ✎ Update with a new round title: the title moves, and the cue's two plain times ride with it. */
async function updateTheRound(page: Page, debate: Debate, title: string, values: Record<string, string> = {}): Promise<void> {
  debate.write({ t: 'update', data: { ...debate.cue, ...values, f0: title } });
  await expect(round(page)).toHaveText(title, { timeout: 20_000 });
}

/** A Take on air: the cue's whole set, then the entrance, heard as the board's `plays`th. */
async function takeOnAir(page: Page, debate: Debate, plays: string): Promise<void> {
  debate.write({ t: 'update', data: debate.cue });
  debate.write({ t: 'play' });
  await expect(page.locator('body')).toHaveAttribute('data-plays', plays, { timeout: 20_000 });
}

/** The floor has passed from `from` to `to`, on the screen: `to` counts and `from` holds still. */
async function floorPassed(page: Page, from: ReturnType<typeof clockA>, to: ReturnType<typeof clockA>, startedAt: number): Promise<void> {
  await expect.poll(() => read(to), { timeout: 10_000, message: 'the speaker given the floor counts' }).toBeLessThan(startedAt);
  const held = await read(from);
  await page.waitForTimeout(1_200);
  expect(await read(from), 'the speaker who gave it up holds still').toBe(held);
}

/** Whose rail the floor's marker has grown: each is a stub until its speaker has the floor. */
const railsFavour = (page: Page): Promise<'a' | 'b' | 'neither'> =>
  board(page).locator('.scoreboard').evaluate((root) => {
    const width = (rail: string) => root.querySelector(`.scoreboard-rail-${rail}`)!.getBoundingClientRect().width;
    const [a, b] = [width('a'), width('b')];
    return a > b * 2 ? 'a' : b > a * 2 ? 'b' : 'neither';
  });

/** The floor has passed, on the wire and in the report: one stamp, on `to`, and the machine beside it. */
async function reportNames(debate: Debate, running: 'f5' | 'f6', floor: string): Promise<void> {
  const held = running === 'f5' ? 'f6' : 'f5';
  await expect.poll(() => {
    const report = debate.report();
    const groups = (report?.state as { groups?: Record<string, string> } | null)?.groups;
    return report ? [/@[1-9]/.test(report.data[running]), /@[1-9]/.test(report.data[held]), groups?.floor] : null;
  }, { timeout: 20_000 }).toEqual([true, false, floor]);
}

test('a Take on air in A\'s first turn: the next Switch hands over to B on the wire and on the screen', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  debate.write({ t: 'event', event: 'switch' }, 60_000);
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThanOrEqual(240);

  await takeOnAir(page, debate, '2');
  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockA(page), clockB(page), 300);
  await reportNames(debate, 'f6', 'speakerB');
});

test('a Take on air in A\'s second turn: the next Switch hands over to B on the wire and on the screen', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  debate.write({ t: 'event', event: 'switch' }, 10_000);
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThanOrEqual(230);

  await takeOnAir(page, debate, '2');
  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockA(page), clockB(page), 270);
  await reportNames(debate, 'f6', 'speakerB');
});

test('a Take on air with B speaking: the floor stays with B until the next Switch hands it to A', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  await expect.poll(() => railsFavour(page), { timeout: 5_000 }).toBe('b');

  await takeOnAir(page, debate, '2');
  await reportNames(debate, 'f6', 'speakerB');
  // The floor's marker says it too, once the entrance has settled.
  await expect.poll(() => railsFavour(page), { timeout: 10_000 }).toBe('b');
  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockB(page), clockA(page), 240);
  await reportNames(debate, 'f5', 'speakerA');
});

test('an output booting with no pose plays the board again: the running clock keeps counting, and the floor passes as the wire says', async ({ page }) => {
  // src/output/main.ts `onWithoutPose`: data from the report, then play(), and no data after it.
  const debate = await openDebate(page);
  debate.onAirWith({
    data: { ...debate.cue, f5: `04:00@${Date.now() - 20_000}/05:00/05:00`, f6: '04:30@/05:00/05:00' },
    state: null,
    seq: 0,
  });
  await page.goto('/output?production=debate-probe');
  await expect.poll(() => read(clockA(page)), { timeout: 30_000 }).toBeLessThanOrEqual(220);
  await expect(clockB(page)).toHaveText('04:30');
  const a = await read(clockA(page));
  await expect.poll(() => read(clockA(page)), { timeout: 5_000, message: 'play() has not stopped it' }).toBeLessThan(a);

  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockA(page), clockB(page), 270);
  await reportNames(debate, 'f6', 'speakerB');
});

/** What the production page sends for a Snap: the pose, then the cue's values (graphicVerbs.ts). */
async function snapTheBoard(page: Page, debate: Debate, snap: Record<string, string> | null, title: string): Promise<void> {
  debate.write({ t: 'snap', snap });
  debate.write({ t: 'update', data: { ...debate.cue, f0: title } });
  await expect(round(page)).toHaveText(title, { timeout: 20_000 });
}

/** The report says nobody is speaking, each clock at its time, and the machine at rest. */
async function reportRests(debate: Debate, a: string): Promise<void> {
  await expect.poll(() => {
    const report = debate.report();
    const groups = (report?.state as { groups?: Record<string, string> } | null)?.groups;
    return report ? [report.data.f5.split('@')[0], /@[1-9]/.test(report.data.f5), /@[1-9]/.test(report.data.f6), groups?.floor] : null;
  }, { timeout: 20_000 }).toEqual([a, false, false, 'armed']);
}

for (const [how, snap] of [['every group to its start', null], ['the floor to Armed', { floor: 'armed' }]] as const) {
  test(`a Snap of ${how} with A speaking lands at rest: nobody speaks, the clocks hold, and the next Switch opens with A`, async ({ page }) => {
    const debate = await openDebate(page);
    await takeTheBoard(page, debate);
    debate.write({ t: 'event', event: 'switch' }, 60_000);
    await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThanOrEqual(240);

    await snapTheBoard(page, debate, snap, 'SNAPPED');
    await expect.poll(() => railsFavour(page), { timeout: 10_000 }).toBe('neither');
    const held = await clockA(page).textContent();
    await page.waitForTimeout(1_200);
    await expect(clockA(page), 'nobody is counting').toHaveText(held!);
    await expect(clockB(page)).toHaveText('05:00');
    await reportRests(debate, held!);

    debate.write({ t: 'event', event: 'switch' });
    await floorPassed(page, clockB(page), clockA(page), seconds(held));
    await reportNames(debate, 'f5', 'speakerA');
  });
}

test('a Snap of the floor to the other speaker moves the wire with it', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  debate.write({ t: 'event', event: 'switch' }, 60_000);
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThanOrEqual(240);

  await snapTheBoard(page, debate, { floor: 'speakerB' }, 'TO B');
  await floorPassed(page, clockA(page), clockB(page), 300);
  await reportNames(debate, 'f6', 'speakerB');
  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockB(page), clockA(page), 240);
  await reportNames(debate, 'f5', 'speakerA');
});

test('a Snap that reaches a board already down brings it back: the next Switch names one speaker on the wire and on the screen', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  debate.write({ t: 'stop' });
  await expect.poll(() => debate.report()?.data.f5 ?? '', { timeout: 20_000 }).toContain('@out/');

  await snapTheBoard(page, debate, { floor: 'speakerB' }, 'BACK TO B');
  await expect.poll(() => read(clockB(page)), { timeout: 10_000 }).toBeLessThan(260);
  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockB(page), clockA(page), 240);
  await reportNames(debate, 'f5', 'speakerA');
});

test('a Snap to rest that reaches a board already down ends its off-air mark too: the next Switch opens with A on both', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  debate.write({ t: 'stop' });
  await expect.poll(() => debate.report()?.data.f5 ?? '', { timeout: 20_000 }).toContain('@out/');

  await snapTheBoard(page, debate, null, 'BACK AT REST');
  debate.write({ t: 'event', event: 'switch' });
  await expect.poll(() => read(clockA(page)), { timeout: 10_000 }).toBeLessThan(240);
  await reportNames(debate, 'f5', 'speakerA');
});

test('every floor state stays enterable by an instant Snap in the board itself, whichever speaker came before', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  const landed = await page.frameLocator(`iframe[title="${GRAPHIC}"]`).locator('.scoreboard').evaluate((root) => {
    const w = root.ownerDocument.defaultView as unknown as { noacgSnap: (a: Record<string, string> | null) => { groups: Record<string, string> } };
    return [
      w.noacgSnap({ floor: 'speakerA' }).groups.floor,
      w.noacgSnap({ floor: 'armed' }).groups.floor,
      w.noacgSnap({ floor: 'speakerB' }).groups.floor,
      w.noacgSnap(null).groups.floor,
      w.noacgSnap({ floor: 'speakerB' }).groups.floor,
      w.noacgSnap({ floor: 'speakerA' }).groups.floor,
    ];
  });
  expect(landed).toEqual(['speakerA', 'armed', 'speakerB', 'armed', 'speakerB', 'speakerA']);
});

test('a debate board whose animation region is hand-written, with no machine runtime, still loads and counts after an Out and a Take', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/app#/home');
  const after = await page.evaluate(async () => {
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const { composeDocument } = await __noacgImport('/src/preview/composeDocument.ts');
    const { ANIMATION_MARK_CLOSE, ANIMATION_MARK_OPEN } = await __noacgImport('/src/templates/lowerThirds/animPresets.ts');
    const template = variantById('dc01')!.create({});
    const start = template.js.indexOf(ANIMATION_MARK_OPEN);
    const end = template.js.indexOf(ANIMATION_MARK_CLOSE) + ANIMATION_MARK_CLOSE.length;
    const handWritten = 'function buildInTimeline() { return gsap.timeline(); }\nfunction buildOutTimeline() { return gsap.timeline(); }';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;border:0;';
    document.body.appendChild(frame);
    await new Promise((loaded) => {
      frame.onload = loaded;
      frame.srcdoc = composeDocument({ ...template, js: template.js.slice(0, start) + handWritten + template.js.slice(end) });
    });
    const w = frame.contentWindow as unknown as Record<string, (arg?: string) => void>;
    const read = () => frame.contentDocument!.querySelector('#f5')!.textContent;
    w.update(JSON.stringify({ f5: '04:00' }));
    w.play();
    w.runSpeakerA();
    w.stop();
    w.play();
    w.runSpeakerA();
    await new Promise((r) => setTimeout(r, 1_300));
    return { machine: typeof w.noacgMachinePlay, shown: read() };
  });
  expect(after.machine, 'this board has no machine runtime').toBe('undefined');
  expect(errors, 'nothing threw while the board loaded').toEqual([]);
  expect(seconds(after.shown), 'the speaker counts again after the Take').toBeLessThan(240);
});

test('the runtime bench presses every arrow of the floor, each from the state it starts in', async ({ page }) => {
  await page.goto('/app');
  const skipped = await page.evaluate(async () => {
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const bench = await __noacgImport('/src/validation/runtimeBench.ts');
    const result = await bench.benchTemplateRuntime(variantById('dc01')!.create({}), { fieldPaints: true });
    return [...result.errors, ...result.warnings].filter((f) => f.rule === 'bench-events-skipped').map((f) => f.message);
  });
  expect(skipped).toEqual([]);
});

test('a Switch that reaches a board already down starts nothing, and the Take after it starts over', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  debate.write({ t: 'stop' });
  debate.write({ t: 'event', event: 'switch' });
  await page.waitForTimeout(1_500);
  await takeOnAir(page, debate, '2');
  await expect(clockA(page)).toHaveText('05:00');
  await expect(clockB(page)).toHaveText('05:00');
  await page.waitForTimeout(1_500);
  await expect(clockA(page), 'nothing is counting').toHaveText('05:00');
  await expect(clockB(page)).toHaveText('05:00');

  debate.write({ t: 'event', event: 'switch' });
  await floorPassed(page, clockB(page), clockA(page), 300);
  await reportNames(debate, 'f5', 'speakerA');
});

test('the production page\'s own Re-take: the next Switch hands over on PROGRAM too', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Debate Floor' });
  await openProductionWithCurrent(page, 'Debate Retake');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  const a = program.locator('#f5');
  const b = program.locator('#f6');
  await page.getByTestId('verb-take').click();
  await expect(a).toHaveText('05:00');
  const pass = page.getByTestId('cue-action-switch');

  await pass.click();
  await expect.poll(() => read(a), { timeout: 10_000 }).toBeLessThan(300);
  await page.getByTestId('verb-retake').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Speaker A speaking');
  await pass.click();
  await expect.poll(() => read(b), { timeout: 10_000, message: 'B counts' }).toBeLessThan(300);
  const held = await read(a);
  await page.waitForTimeout(1_200);
  expect(await read(a), 'A holds still').toBe(held);
  await expect(page.getByTestId('machine-state-chip')).toContainText('Speaker B speaking');
});

test('an Update mid-debate leaves a waiting speaker\'s banked time where it stands, and the first speech running', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  await updateTheRound(page, debate, 'REBUTTAL');
  await expect(clockA(page), 'the waiting speaker keeps the time they banked').toHaveText('04:00');
  const b = await read(clockB(page));
  expect(b, 'the speaker on the floor keeps counting from their own time').toBeLessThanOrEqual(260);
  await expect.poll(() => read(clockB(page)), { timeout: 5_000, message: 'and the clock still runs' }).toBeLessThan(b);
});

test('an Update in a speaker\'s second turn leaves the running clock where it stands, still running', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  // A's clock no longer starts from what the cue sends, and no Update has touched it yet.
  debate.write({ t: 'event', event: 'switch' });
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThan(240);
  const banked = await read(clockB(page));
  expect(banked).toBeLessThanOrEqual(260);

  await updateTheRound(page, debate, 'CLOSING');
  const a = await read(clockA(page));
  expect(a, 'a running clock is not put back to the cue\'s time').toBeLessThan(240);
  await expect.poll(() => read(clockA(page)), { timeout: 5_000, message: 'and it does not stop' }).toBeLessThan(a);
  expect(await read(clockB(page))).toBe(banked);
});

test('a time retyped mid-debate still applies, on the running clock and the waiting one, and the floor passes as before', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  // The chair corrects the waiting speaker: held at the new time.
  await updateTheRound(page, debate, 'CORRECTED', { f5: '02:30' });
  await expect(clockA(page)).toHaveText('02:30');
  // …and the speaker on the floor: on from the new time, still running.
  await updateTheRound(page, debate, 'CORRECTED TWICE', { f5: '02:30', f6: '03:00' });
  await expect.poll(() => read(clockB(page)), { timeout: 5_000 }).toBeLessThanOrEqual(180);
  const b = await read(clockB(page));
  expect(b).toBeGreaterThan(170);
  await expect.poll(() => read(clockB(page)), { timeout: 5_000 }).toBeLessThan(b);

  // The next resend carries the corrected times: nothing moves, and A has not gone back to 05:00.
  await updateTheRound(page, debate, 'RESENT', { f5: '02:30', f6: '03:00' });
  await expect(clockA(page)).toHaveText('02:30');
  expect(await read(clockB(page))).toBeLessThanOrEqual(180);

  // The floor passes to A: the corrected clock was still the running one, and it banks.
  debate.write({ t: 'event', event: 'switch' });
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThan(150);
  const banked = await read(clockB(page));
  expect(banked).toBeLessThanOrEqual(180);
  await page.waitForTimeout(1_500);
  expect(await read(clockB(page)), 'B is held once the floor has passed').toBe(banked);
});

test('an output that reboots mid-debate keeps both clocks through the next Update', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  await updateTheRound(page, debate, 'BEFORE THE REBOOT');
  // The report that banks it has reached the backend, holding this Update.
  await expect.poll(() => debate.report()?.data.f0 ?? null, { timeout: 20_000 }).toBe('BEFORE THE REBOOT');

  await page.reload();
  await expect(round(page)).toHaveText('BEFORE THE REBOOT', { timeout: 30_000 });
  await expect(clockA(page)).toHaveText('04:00');
  await expect.poll(() => read(clockB(page)), { timeout: 20_000 }).toBeLessThanOrEqual(260);

  await updateTheRound(page, debate, 'AFTER THE REBOOT');
  await expect(clockA(page)).toHaveText('04:00');
  const b = await read(clockB(page));
  expect(b).toBeLessThanOrEqual(260);
  await expect.poll(() => read(clockB(page)), { timeout: 5_000 }).toBeLessThan(b);
});

test('a Take after an Out starts the board over from the cue\'s time, nobody speaking', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  // The Out holds B: two reads apart, the same time.
  debate.write({ t: 'stop' });
  let last = Number.NaN;
  await expect.poll(async () => {
    const was = last;
    last = await read(clockB(page));
    return last === was;
  }, { timeout: 20_000, intervals: [1_200] }).toBe(true);

  debate.write({ t: 'update', data: debate.cue });
  debate.write({ t: 'play' });
  await expect(page.locator('body')).toHaveAttribute('data-plays', '2', { timeout: 20_000 });
  await expect(clockA(page)).toHaveText('05:00');
  await expect(clockB(page)).toHaveText('05:00');

  // Nobody has the floor, so the next Switch opens with A, and B waits at its full time.
  debate.write({ t: 'event', event: 'switch' });
  await expect.poll(() => read(clockA(page)), { timeout: 20_000 }).toBeLessThan(300);
  await expect(clockB(page)).toHaveText('05:00');
});

test('a Take on air is a resend: neither clock moves, and the report says what is on screen', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  const before = await read(clockB(page));

  debate.write({ t: 'update', data: { ...debate.cue, f0: 'TAKEN AGAIN' } });
  debate.write({ t: 'play' });
  await expect(page.locator('body')).toHaveAttribute('data-plays', '2', { timeout: 20_000 });
  await expect(clockA(page)).toHaveText('04:00');
  const b = await read(clockB(page));
  expect(b).toBeLessThanOrEqual(before);
  await expect.poll(() => read(clockB(page)), { timeout: 5_000 }).toBeLessThan(b);

  // A's value is held where it banked, B's still says when it started: a reboot paints this.
  await expect.poll(() => debate.report()?.data.f0 ?? null, { timeout: 20_000 }).toBe('TAKEN AGAIN');
  expect(debate.report()!.data.f5).toMatch(/^04:00@\//);
  expect(debate.report()!.data.f6).toMatch(/^05:00@[1-9]/);
});

test('a page opened on air reads a debate clock\'s report as the cue holds it', async ({ page }) => {
  const debate = await openDebate(page);
  const asCue = await page.evaluate(async () => {
    const { reportAsCueHolds } = await __noacgImport('/src/control/matchClockWire.ts');
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    return reportAsCueHolds(variantById('dc01')!.create({}).html, { f0: 'ROUND', f5: '05:00@/05:00/05:00', f6: '05:00@1755600000000/05:00/05:00' });
  });
  expect(asCue).toEqual({ f0: 'ROUND', f5: '05:00', f6: '05:00' });
  expect(debate.cue.f5).toBe('05:00');
});

test('a penalty docks the running clock and keeps it running, and the next Update does not give the time back', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);
  const before = await read(clockB(page));

  debate.write({ t: 'event', event: 'penalty' });
  await expect.poll(() => read(clockB(page)), { timeout: 20_000 }).toBeLessThanOrEqual(before - 10);
  await updateTheRound(page, debate, 'DOCKED');
  const b = await read(clockB(page));
  expect(b).toBeLessThanOrEqual(before - 10);
  await expect.poll(() => read(clockB(page)), { timeout: 5_000 }).toBeLessThan(b);
  await expect(clockA(page)).toHaveText('04:00');
});

test('Reset returns both clocks to the allowance on screen, and the cue\'s older time does not undo it', async ({ page }) => {
  const debate = await openDebate(page);
  await takeTheBoard(page, debate);
  await aThenB(page, debate);

  await updateTheRound(page, debate, 'SIX EACH', { f7: '06:00' });
  debate.write({ t: 'event', event: 'reset' });
  await expect(clockA(page)).toHaveText('06:00', { timeout: 20_000 });
  await expect(clockB(page)).toHaveText('06:00');

  await updateTheRound(page, debate, 'A NEW ROUND', { f7: '06:00' });
  await expect(clockA(page)).toHaveText('06:00');
  await expect(clockB(page)).toHaveText('06:00');
});

test('the production page\'s own ✎ Update resends the clocks, and PROGRAM keeps them where they stand', async ({ page }) => {
  // The sender, not a row written here: the operator's real Take, Switch and ✎ Update.
  await bootstrapGraphic(page, { name: 'Debate Floor' });
  await openProductionWithCurrent(page, 'Debate Night');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  const a = program.locator('#f5');
  const b = program.locator('#f6');
  await page.getByTestId('verb-take').click();
  await expect(a).toHaveText('05:00');
  const pass = page.getByTestId('cue-action-switch');

  await pass.click();
  await expect.poll(() => read(a), { timeout: 10_000 }).toBeLessThan(300);
  await pass.click();
  await expect.poll(() => read(b), { timeout: 10_000 }).toBeLessThan(300);
  const banked = await a.textContent();
  expect(seconds(banked)).toBeLessThan(300);

  await page.getByTestId('cue-field-f0').fill('REBUTTAL');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('REBUTTAL');
  await expect(a, 'the waiting speaker keeps the time they banked').toHaveText(banked!);
  const running = await read(b);
  await expect.poll(() => read(b), { timeout: 5_000, message: 'and the other clock still runs' }).toBeLessThan(running);

  // A retype still applies.
  await page.getByTestId('cue-field-f5').fill('02:30');
  await page.getByTestId('verb-update').click();
  await expect(a).toHaveText('02:30');
});
