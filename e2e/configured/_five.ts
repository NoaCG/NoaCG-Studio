import { expect, type Browser, type BrowserContext, type Frame, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { configuredTarget, isLocalStackUrl } from '../../scripts/configured-target.mjs';
import { installDoor } from '../_door';
import { settleDurableWrites } from '../_durable';
import { publishProduction } from '../_publish';
import { openWorkspace } from '../_workspace';
import { clearPublishedShows, deleteAccountByEmail, dismissWizard, E2E_EMAIL, E2E_PASSWORD, mintAccount, readyOf, SERVICE_ROLE_KEY, signInAs, SUPABASE_URL, wipeMyGraphics } from './_helpers';
import { shutStatusPanel } from './_panel';
import { FRAME_LOADS, framePlays, instrument, NET, nowOn, readLpm, throttle } from './measure/_measure';

// FIVE PEOPLE AT ONCE (docs/work-specs/live-publishing/spec.md, AC-6): one team production, each
// person a signed-in account in a browser context of its own, with automatic updates on. The roles,
// scripted to press at the same moments:
//
//   taker     takes and outs plain lower thirds, one after another; press to ran is measured
//   messages  pastes a message on the Interaction workspace and prepares a cue from it
//   quick     presses the score's Goal (a quick button on a score bound to the production's data)
//   editors   two (or more) people type into their own cue's text at the same instant each tick
//
// One editor's page reloads part way through and the other loses its connection for a while and
// gets it back. The run then waits for everything to settle and reports what it finds, so the same
// scene serves the configured spec (e2e/configured/teams.spec.ts, "five accounts at once", a short run judged on
// correctness) and the measurement (e2e/configured/measure/five.measure.ts: ten minutes, press to
// ran against a single page, and 10 and 15 pages). The judgement belongs to the caller.

/** A person in the scene: an account, its browser context and its production page. */
export interface Person {
  role: 'taker' | 'messages' | 'quick' | 'editor';
  email: string;
  context: BrowserContext;
  page: Page;
  /** The cue this person edits (an editor) or presses on (quick). */
  cue?: string;
}

export interface Scene {
  showId: string;
  teamId: string;
  code: string;
  slug: string;
  key: string;
  /** The taker's cues, by label. */
  takes: string[];
  /** One cue label per editor, in the order the editors were made. */
  edits: string[];
  score: string;
  people: Person[];
  output: Page;
  outputContext: BrowserContext;
  /** Output frames that had already played when set-up ended (the score): never a Take's "ran".
   *  Held as the frames themselves: every frame of the output has the same URL. */
  onAir: Frame[];
  minted: string[];
}

const SCORE_PATH = 'match.home.score';
const SCORE_START = 0;
const domain = () => E2E_EMAIL.slice(E2E_EMAIL.indexOf('@'));
/** The scene's own extra accounts, on the suite's throwaway domain (`@noacg.local` on the local stack). */
const memberEmail = (i: number) => `e2e-five-${i}${domain()}`;

/** The service client for the scene's own accounts: local stack only. */
function admin() {
  if (!writable()) throw new Error('the five-person scene mints accounts: only against a local stack or the declared staging project');
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Delete the scene's extra accounts (their documents go with them). */
async function dropMinted(emails: string[]): Promise<void> {
  const sb = admin();
  await Promise.all(emails.map((e) => deleteAccountByEmail(sb, e)));
}

/** True when the backend is a local stack: the only place this scene may mint accounts or write switches. */
export const isLocalStack = () => isLocalStackUrl(SUPABASE_URL);
/** PHASE 9 CLOUD (not for main): the scene may also mint accounts and write switches on the hosted
 *  staging project, admitted only by scripts/configured-target.mjs's declared route. */
export const writable = () => ['local', 'hosted-staging'].includes(configuredTarget(process.env).kind);

const t0 = Date.now();
export const log = (...a: unknown[]) => console.log(`[five ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const row = (page: Page, label: string) =>
  page.locator('.pd-cue').filter({ has: page.locator('.pd-cue-label > strong', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });

async function selectCue(page: Page, label: string): Promise<void> {
  await row(page, label).getByTestId('select-cue').click({ timeout: 15_000 });
  await expect(page.locator('.pd-cue.selected .pd-cue-label > strong')).toHaveText(label);
}

/** The cue editor's first text box: the cue's main text. */
const textBox = (page: Page) => page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').first();

/**
 * The owner builds the production: `takes` plain lower thirds for the taker, one per editor, and
 * a House Score whose home score is bound to the production's data; moves it into a new team and
 * publishes it from there.
 */
async function build(owner: Page, editors: number, fill = 0): Promise<Omit<Scene, 'people' | 'output' | 'outputContext' | 'minted' | 'slug' | 'key'>> {
  await signInAs(owner, E2E_EMAIL, E2E_PASSWORD);
  await dismissWizard(owner).catch(() => undefined);
  await clearPublishedShows(owner);
  await wipeMyGraphics(owner);
  await owner.goto('/app#/home');
  await expect(owner.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const stamp = Date.now();
  const made = await owner.evaluate(
    async ({ name, editors, path, fill }) => {
      const { CATALOG } = await __noacgImport('/src/templates/catalog.ts');
      const { initialDraft, mergeDraft, buildDraftTemplate } = await __noacgImport('/src/components/wizard/draft.ts');
      const { formatTemplate } = await __noacgImport('/src/format/formatCode.ts');
      const m = await __noacgImport('/src/model/shows.ts');
      const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
      const all = Object.values(CATALOG).flat();
      const template = async (variantName: string, name: string) => {
        const pick = all.find((v) => v.name === variantName)!;
        const draft = mergeDraft(initialDraft(), {
          variantId: pick.id,
          lines: pick.suggestedLines.map((l) => ({ ...l })),
          zone: null,
          logoEnabled: null,
          animation: { presetId: null, outPresetId: null },
          paletteId: null,
          customPalette: null,
          fontId: null,
        });
        return { ...(await formatTemplate(buildDraftTemplate(pick, draft))), name };
      };
      const { show, error: notCreated } = m.createShowNamedChecked(name);
      if (notCreated) throw new Error(notCreated);
      const add = (t: Parameters<typeof m.addGraphicToShow>[1]) => {
        const { error } = m.addGraphicToShow(show.id, t, {});
        if (error) throw new Error(error);
      };
      const takes = ['Five take A', 'Five take B', 'Five take C'];
      const edits = Array.from({ length: editors }, (_, i) => `Five edit ${String.fromCharCode(65 + i)}`);
      for (const n of [...takes, ...edits]) add(await template('Hairline', n));
      add(await template('House Score', 'Five score'));
      // Phase 9 step 7: a large production, filled with more lower thirds nobody touches.
      for (let i = 1; i <= fill; i++) add(await template('Hairline', `Five fill ${i}`));
      m.setFieldBindings(show.id, [{ graphic: 'Five score', fieldId: 'f1', path }]);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      const record = m.loadShows().find((s) => s.id === show.id)!;
      const labelOf = (g: string) => {
        const graphic = record.graphics.find((x) => x.name === g)!;
        return record.cues!.find((c) => c.sourceId === graphic.id)!.label;
      };
      return { id: show.id, takes: takes.map(labelOf), edits: edits.map(labelOf), score: labelOf('Five score') };
    },
    { name: `Five people ${stamp}`, editors, path: SCORE_PATH, fill },
  );
  // The team: `E2E team ` prefix, so teams.spec.ts's sweep removes it if this run dies.
  const team = await owner.evaluate(
    async ({ id, teamName }) => {
      const { createTeam } = await __noacgImport('/src/backend/teams.ts');
      const { moveProductionToTeam } = await __noacgImport('/src/backend/teamProductions.ts');
      const { loadShows } = await __noacgImport('/src/model/shows.ts');
      const { team, error } = await createTeam(teamName, 'Five owner');
      if (!team) throw new Error(`team: ${error}`);
      const moved = await moveProductionToTeam(loadShows().find((s) => s.id === id)!, team.id);
      if (moved.error) throw new Error(`move: ${moved.error}`);
      return { id: team.id, code: team.joinCode };
    },
    { id: made.id, teamName: `E2E team five ${new Date().toISOString().slice(11, 19)}` },
  );
  await owner.goto(`/app#/production/${made.id}`);
  await expect(owner.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  // PHASE 9 CLOUD: a large production can still be saving; do what the note says and publish again.
  publishLog.length = 0;
  const t0 = Date.now();
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1 && !(await owner.getByTestId('production-publish').isVisible())) {
      log(`publish button gone after ${Date.now() - t0} ms; status ${await owner.getByTestId('production-status').textContent({ timeout: 2_000 }).catch(() => '?')}`);
      break;
    }
    try {
      await publishProduction(owner);
      log(`published on attempt ${attempt} after ${Date.now() - t0} ms`);
      publishLog.push({ attempt, ms: Date.now() - t0, ok: true, note: '' });
      break;
    } catch (e) {
      const note = (await owner.getByTestId('production-note').first().textContent({ timeout: 2_000 }).catch(() => '')) ?? '';
      log(`publish attempt ${attempt} after ${Date.now() - t0} ms: ${note}`);
      publishLog.push({ attempt, ms: Date.now() - t0, ok: false, note: note.slice(0, 200) });
      if (attempt >= 12) throw e;
      await owner.keyboard.press('Escape').catch(() => undefined);
      await owner.waitForTimeout(10_000);
    }
  }
  await shutStatusPanel(owner);
  return { showId: made.id, teamId: team.id, code: team.code, takes: made.takes, edits: made.edits, score: made.score };
}

/** PHASE 9 RERUN: each publish attempt of the last set-up. */
export const publishLog: { attempt: number; ms: number; ok: boolean; note: string }[] = [];

/** Sign a member in, join the team by its code, and open the production. */
async function join(page: Page, email: string, code: string, showId: string, name: string): Promise<void> {
  await signInAs(page, email, E2E_PASSWORD);
  await dismissWizard(page).catch(() => undefined);
  const joined = await page.evaluate(
    async ({ code, name }) => {
      const { joinTeamByCode } = await __noacgImport('/src/backend/teams.ts');
      const { refreshTeams } = await __noacgImport('/src/backend/teamProductions.ts');
      const { error } = await joinTeamByCode(code, name);
      await refreshTeams();
      return error;
    },
    { code, name },
  );
  if (joined) throw new Error(`${email} could not join: ${joined}`);
  await openProduction(page, showId);
}

export async function openProduction(page: Page, showId: string): Promise<void> {
  await page.goto(`/app#/production/${showId}`);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 60_000 });
  await shutStatusPanel(page);
}

/** The service-role switch writes (`system_settings`), local stack only. */
export async function setSwitch(key: 'auto_publish' | 'partial_writes' | 'team_designs' | 'production_copies', on: boolean): Promise<void> {
  if (!writable()) throw new Error('switches are written only on a local stack or the declared staging project');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: { on } }),
  });
  if (!res.ok) throw new Error(`switch ${key}: ${res.status} ${await res.text()}`);
}

/**
 * Set the scene up: `pages` people (at least five: taker, messages, quick and two or more editors),
 * the first on the suite's own account (the team owner, who builds and publishes, then takes), every
 * other one minted on the local stack. Opens one output, waits for it to hold every graphic, and puts
 * the score on air, so that during a run the taker's Takes are the only ones the output plays.
 */
export async function setUp(browser: Browser, owner: Page, pages: number, opts: { fill?: number; roles?: Person['role'][] } = {}): Promise<Scene> {
  const roles: Person['role'][] = opts.roles ?? ['taker', 'messages', 'quick', ...Array.from({ length: pages - 3 }, () => 'editor' as const)];
  if (!opts.roles && pages < 5) throw new Error('the scene needs five people');
  const editors = roles.filter((r) => r === 'editor').length;
  const built = await build(owner, editors, opts.fill ?? 0);
  log('built and published', built.showId);
  const emails = roles.map((_, i) => (i === 0 ? E2E_EMAIL : memberEmail(i)));
  const minted = emails.slice(1);
  const sb = admin();
  await Promise.all(minted.map((e) => mintAccount(sb, e, E2E_PASSWORD)));
  const people: Person[] = [{ role: 'taker', email: E2E_EMAIL, context: owner.context(), page: owner }];
  const contexts: BrowserContext[] = [];
  try {
  await instrument(owner.context());
  await owner.reload();
  await openProduction(owner, built.showId);
  // Members join and open the production in parallel, a few at a time.
  const joiners = roles.slice(1).map((role, k) => ({ role, email: emails[k + 1], i: k + 1 }));
  const opened: Person[] = [];
  for (let at = 0; at < joiners.length; at += 4) {
    opened.push(
      ...(await Promise.all(
        joiners.slice(at, at + 4).map(async ({ role, email, i }) => {
          const context = await browser.newContext();
          contexts.push(context);
          await installDoor(context);
          const page = await context.newPage();
          await join(page, email, built.code, built.showId, `Five ${role} ${i}`);
          return { role, email, context, page } as Person;
        }),
      )),
    );
  }
  let editor = 0;
  for (const p of opened) {
    if (p.role === 'editor') p.cue = built.edits[editor++];
    if (p.role === 'quick') p.cue = built.score;
    people.push(p);
  }
  log('everyone is on the production page');
  const { slug, key } = await owner.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const { productionDataKey } = await __noacgImport('/src/control/productionDataApi.ts');
    const s = loadShows().find((x) => x.id === id)!;
    const key = await productionDataKey(id);
    return { slug: s.outputSlug ?? '', key: key ?? '' };
  }, built.showId);
  expect(slug, 'publishing mints an output slug').toBeTruthy();
  expect(key, 'publishing mints a data key').toBeTruthy();
  await owner.evaluate(
    async ({ key, start }) => {
      const { patchProductionData } = await __noacgImport('/src/control/productionDataApi.ts');
      await patchProductionData(key, { match: { home: { score: start } } });
    },
    { key, start: SCORE_START },
  );
  const outputContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  contexts.push(outputContext);
  await instrument(outputContext);
  await outputContext.addInitScript(FRAME_LOADS);
  const output = await outputContext.newPage();
  await output.goto(`/output?production=${encodeURIComponent(slug)}`);
  const graphics = built.takes.length + built.edits.length + 1;
  await expect
    .poll(async () => { const r = await readyOf(output); return r ? r.n === r.of && r.of >= graphics + (opts.fill ?? 0) : false; }, { timeout: 300_000, intervals: [100] })
    .toBe(true);
  log('output holds every graphic');
  const quick = people.find((p) => p.role === 'quick');
  if (quick) {
  await selectCue(quick.page, quick.cue!);
  await quick.page.getByTestId('verb-take').click();
  await expect(quick.page.getByTestId('cue-action-goalA')).toBeEnabled({ timeout: 20_000 });
  await expect.poll(async () => (await framePlays(output)).some((f) => f.plays.length > 0), { timeout: 20_000, message: 'the score is on air' }).toBe(true);
  }
  // MEASURE_NET=slow (the measurement only): every page and the output at 20 Mbit/s and 50 ms from
  // here on. Set-up is not timed. A page taken offline and back loses its throttle (one CDP setting).
  if (NET === 'slow') for (const p of [...people.map((x) => x.page), output]) await throttle(p, 'slow');
  const onAir = (await framePlays(output)).filter((f) => f.plays.length > 0).map((f) => f.frame);
  return { ...built, slug, key, people, output, outputContext, minted, onAir };
  } catch (e) {
    // The caller holds no scene to tear down yet: close what was opened, here.
    await tearDown({ teamId: built.teamId, people: [], outputContext: null, minted }, owner);
    for (const c of contexts) await c.close().catch(() => undefined);
    throw e;
  }
}

/** Everything the run did, for the caller to judge. */
export interface RunReport {
  ms: number;
  pages: number;
  takes: { pressAt: number; ranAt: number | null; label: string }[];
  goals: number;
  messages: { body: string; prepared: boolean; error?: string }[];
  edits: { cue: string; typed: string[]; by: string }[];
  reloads: number;
  offline: { from: number; to: number } | null;
  errors: string[];
}

export interface RunOptions {
  /** How long the roles run. */
  ms: number;
  /** One tick: editors type together on it; the quick button presses every three quarters of one. */
  tickMs?: number;
  /** Milliseconds between messages. */
  messageEveryMs?: number;
  /** Reload one editor's page at this fraction of the run, and take another offline at that one. */
  reloadAt?: number | null;
  offlineAt?: number | null;
  offlineMs?: number;
  /** false: only the taker runs (the single-page comparison). */
  everyone?: boolean;
  /** Phase 9 step 7: editors type key by key without pausing, a new text as soon as the last is typed. */
  keys?: boolean;
}

const sleepUntil = async (page: Page, at: number) => {
  const wait = at - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
};

/** Run the roles for `ms`. Each role keeps its own loop; a role's failure is recorded, not thrown,
 *  so the others keep going and the report says what broke. */
export async function run(scene: Scene, opts: RunOptions): Promise<RunReport> {
  const tick = opts.tickMs ?? 4_000;
  const start = Date.now();
  const end = start + opts.ms;
  const everyone = opts.everyone ?? true;
  const report: RunReport = { ms: opts.ms, pages: everyone ? scene.people.length : 1, takes: [], goals: 0, messages: [], edits: [], reloads: 0, offline: null, errors: [] };
  const live = () => Date.now() < end;
  const by = (role: Person['role']) => scene.people.filter((p) => p.role === role);
  const taker = by('taker')[0];
  const fail = (who: string) => (e: unknown) => { report.errors.push(`${who}: ${String(e).split('\n')[0].slice(0, 300)}`); };

  const takerLoop = async () => {
    const page = taker.page;
    for (let i = 0; live(); i++) {
      const label = scene.takes[i % scene.takes.length];
      try {
        await selectCue(page, label);
      } catch (e) {
        report.errors.push(`taker select at ${Date.now() - start} ms: ${String(e).split('\n')[0].slice(0, 160)}`);
        continue;
      }
      const before = await nowOn(page);
      await page.getByTestId('verb-take').click({ timeout: 15_000 });
      const presses = (await readLpm(page)).presses.filter((p) => p.kind === 'click' && p.target === 'verb-take' && p.t >= before);
      const pressAt = presses[0]?.t ?? before;
      let ranAt: number | null = null;
      const deadline = Date.now() + 10_000;
      while (ranAt === null && Date.now() < deadline) {
        const plays = (await framePlays(scene.output))
          .filter((f) => !scene.onAir.includes(f.frame))
          .flatMap((f) => f.plays)
          .filter((p) => p.playAt > pressAt)
          .sort((a, b) => a.playAt - b.playAt);
        if (plays.length) ranAt = plays[0].playAt;
        else await page.waitForTimeout(20);
      }
      report.takes.push({ pressAt, ranAt, label });
      await page.waitForTimeout(250);
      // PHASE 9 CLOUD: a Take the server never confirmed leaves Out disabled; record it and go on.
      await page.getByTestId('verb-out').click({ timeout: 15_000 }).catch(async (e) => {
        const note = (await page.locator('p', { hasText: 'Take is on this monitor only' }).first().textContent({ timeout: 1_000 }).catch(() => null)) ?? '';
        report.errors.push(`taker out at ${Date.now() - start} ms: ${String(e).split('\n')[0].slice(0, 120)} | ${note.slice(0, 160)}`);
      });
      await page.waitForTimeout(400);
    }
  };

  const quickLoop = async (p: Person) => {
    const page = p.page;
    await selectCue(page, p.cue!);
    // The score went on air in set-up; its Goal button is the quick button.
    const goal = page.getByTestId('cue-action-goalA');
    await expect(goal).toBeEnabled({ timeout: 20_000 });
    for (let k = 1; live(); k++) {
      await sleepUntil(page, start + k * tick * 0.75);
      if (!live()) break;
      await goal.click();
      report.goals += 1;
    }
  };

  const messagesLoop = async (p: Person) => {
    const ws = await openWorkspace(p.page, 'audience');
    try {
      for (let k = 1; live(); k++) {
        await sleepUntil(ws, start + k * (opts.messageEveryMs ?? 15_000));
        if (!live()) break;
        const body = `Five message ${k} ${start}`;
        const entry: RunReport['messages'][number] = { body, prepared: false };
        report.messages.push(entry);
        try {
          await ws.getByTestId('message-paste-body').fill(body);
          await ws.getByTestId('message-paste-add').click({ timeout: 20_000 });
          const r = ws.locator('.pd-aud-row', { hasText: body });
          await expect(r).toBeVisible({ timeout: 20_000 });
          await r.getByTestId('audience-prepare').click();
          const card = r.getByTestId('audience-choose-card').first();
          const note = ws.getByTestId('audience-note').filter({ hasText: 'It airs when you Take it' });
          await expect(card.or(note).first()).toBeVisible({ timeout: 20_000 });
          if (await card.isVisible()) await card.click();
          await expect(note).toBeVisible({ timeout: 20_000 });
          entry.prepared = true;
        } catch (e) {
          entry.error = String(e).split('\n')[0].slice(0, 200);
        }
      }
      await settleDurableWrites(ws).catch(() => undefined);
    } finally {
      await ws.close().catch(() => undefined);
    }
  };

  const editorLoop = async (p: Person, n: number) => {
    const record = { cue: p.cue!, typed: [] as string[], by: p.email };
    report.edits.push(record);
    const page = p.page;
    await selectCue(page, p.cue!);
    const reloadAt = opts.reloadAt != null && n === 0 ? start + opts.ms * opts.reloadAt : null;
    const offlineAt = opts.offlineAt != null && n === 1 ? start + opts.ms * opts.offlineAt : null;
    let reloaded = false, wentOffline = false;
    let back: Promise<void> | null = null;
    let isBack = false;
    for (let k = 1; live(); k++) {
      if (opts.keys) {
        const text = `${p.cue} by ${n} #${k}`;
        await textBox(page).selectText();
        await page.keyboard.type(text, { delay: 35 });
        record.typed.push(text);
        continue;
      }
      await sleepUntil(page, start + k * tick);
      if (!live()) break;
      // The editor that lost its connection stops once it is back, so its last text is one typed
      // offline: what reaches the record then is what the reconnect carried.
      if (isBack) break;
      const text = `${p.cue} by ${n} #${k}`;
      await textBox(page).fill(text);
      record.typed.push(text);
      if (reloadAt !== null && !reloaded && Date.now() >= reloadAt) {
        // Reload straight after typing, then find the text again on the reloaded page.
        reloaded = true;
        await page.reload();
        await openProduction(page, scene.showId);
        await expect.poll(async () => (await pageCues(page, scene.showId))[p.cue!], { timeout: 15_000, message: `the text typed before the reload (${text}) is still there` }).toBe(text);
        await selectCue(page, p.cue!);
        report.reloads += 1;
      }
      if (offlineAt !== null && !wentOffline && Date.now() >= offlineAt) {
        wentOffline = true;
        await p.context.setOffline(true);
        const window = { from: Date.now() - start, to: -1 };
        report.offline = window;
        // Back online on its own clock, not the next tick's, so the window is what it says.
        back = page.waitForTimeout(opts.offlineMs ?? 20_000).then(async () => {
          await p.context.setOffline(false);
          if (NET === 'slow') await throttle(page, 'slow');
          window.to = Date.now() - start;
          isBack = true;
        });
      }
    }
    if (back) await back;
  };

  const loops: Promise<void>[] = [takerLoop().catch(fail('taker'))];
  if (everyone) {
    if (by('quick').length) loops.push(quickLoop(by('quick')[0]).catch(fail('quick')));
    if (by('messages').length) loops.push(messagesLoop(by('messages')[0]).catch(fail('messages')));
    by('editor').forEach((p, n) => loops.push(editorLoop(p, n).catch(fail(`editor ${n}`))));
  }
  await Promise.all(loops);
  return report;
}

/** What the server holds once things settle: the team's record, its publication and the score. */
export interface Settled {
  /** Each cue's main text in the team's record, by label. */
  cues: Record<string, string>;
  /** Every cue label in the team's record. */
  labels: string[];
  /** The publication's whole text (it carries every cue's values). */
  published: string;
  score: number;
  /** Documents named "(conflicted copy)" in any account's library. */
  conflicted: string[];
}

export async function serverState(scene: Scene): Promise<Settled> {
  const owner = scene.people[0].page;
  const got = await owner.evaluate(
    async ({ id, key }) => {
      const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
      const { fetchProductionData } = await __noacgImport('/src/control/productionDataApi.ts');
      const sb = (await getSupabase())!;
      const [{ data: row }, { data: pub }, state] = await Promise.all([
        sb.from('team_productions').select('doc').eq('id', id).maybeSingle(),
        sb.from('control_shows').select('output').eq('id', id).maybeSingle(),
        fetchProductionData(key),
      ]);
      const doc = (row as { doc?: { cues?: { label: string; values?: Record<string, string> }[] } } | null)?.doc ?? {};
      const score = Number((state?.data as { match?: { home?: { score?: unknown } } } | undefined)?.match?.home?.score);
      const cues: Record<string, string> = {};
      for (const c of doc.cues ?? []) cues[c.label] = Object.values(c.values ?? {})[0] ?? '';
      return { cues, labels: (doc.cues ?? []).map((c) => c.label), published: JSON.stringify((pub as { output?: unknown } | null)?.output ?? null), score };
    },
    { id: scene.showId, key: scene.key },
  );
  const conflicted = (
    await Promise.all(
      scene.people.map(async (p) => {
        const names = await p.page
          .evaluate(async () => {
            const { loadShows } = await __noacgImport('/src/model/shows.ts');
            return loadShows().map((s) => s.name).filter((n) => /conflicted copy/i.test(n));
          })
          .catch(() => [] as string[]);
        return names.map((n) => `${p.email}: ${n}`);
      }),
    )
  ).flat();
  return { ...got, conflicted };
}

/** Each page's own copy of the cues' main text, by label: every page should converge. */
export async function pageCues(page: Page, showId: string): Promise<Record<string, string>> {
  return page.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id);
    const out: Record<string, string> = {};
    for (const c of s?.cues ?? []) out[c.label] = Object.values(c.values ?? {})[0] ?? '';
    return out;
  }, showId);
}

/** Take the scene down: the team (with its production) and the minted accounts. */
export async function tearDown(
  scene: (Pick<Scene, 'teamId' | 'people' | 'minted'> & { outputContext: BrowserContext | null }) | null,
  owner: Page,
): Promise<void> {
  if (scene) {
    await Promise.all([...scene.people.slice(1).map((p) => p.context), scene.outputContext].map((c) => c?.close().catch(() => undefined)));
    await owner
      .evaluate(async (teamId) => {
        const { deleteTeam } = await __noacgImport('/src/backend/teams.ts');
        await deleteTeam(teamId);
      }, scene.teamId)
      .catch(() => undefined);
    await dropMinted(scene.minted).catch(() => undefined);
  }
  await clearPublishedShows(owner).catch(() => undefined);
}

/** Switch automatic updates and partial writes on, then set the scene up (AC-6 runs with both on). */
export async function openScene(browser: Browser, owner: Page, pages: number): Promise<Scene> {
  await setSwitch('partial_writes', true);
  await setSwitch('auto_publish', true);
  return setUp(browser, owner, pages);
}

/** Take the scene down and switch both back off, whatever happened. */
export async function closeScene(scene: Scene | null, owner: Page): Promise<void> {
  await tearDown(scene, owner);
  // A switch left on breaks other configured specs (#2586), so a failed switch-off is reported.
  const failed = (await Promise.allSettled([setSwitch('auto_publish', false), setSwitch('partial_writes', false)])).filter((r) => r.status === 'rejected');
  if (failed.length) throw new Error(`a switch was left on: ${failed.map((r) => String((r as PromiseRejectedResult).reason)).join('; ')}`);
}

/** Each editor's last typed text, by cue. */
export const lastTexts = (report: RunReport) => Object.fromEntries(report.edits.map((e) => [e.cue, e.typed[e.typed.length - 1]]));
