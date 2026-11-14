import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { installDoor } from '../_door';
import { settleDurableWrites } from '../_durable';
import { publishProduction } from '../_publish';
import { openWorkspace } from '../_workspace';
import { clearPublishedShows, dismissWizard, E2E_EMAIL, E2E_PASSWORD, readyOf, SERVICE_ROLE_KEY, signInAs, SUPABASE_URL, wipeMyGraphics } from './_helpers';
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
// scene serves the configured spec (e2e/configured/five-people.spec.ts, a short run judged on
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
  minted: string[];
}

const SCORE_PATH = 'match.home.score';
const SCORE_START = 0;
const domain = () => E2E_EMAIL.slice(E2E_EMAIL.indexOf('@'));
/** The scene's own extra accounts, on the suite's throwaway domain (`@noacg.local` on the local stack). */
export const memberEmail = (i: number) => `e2e-five-${i}${domain()}`;

async function admin(path: string, init: RequestInit): Promise<Response> {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) throw new Error('the five-person scene mints accounts: only against a local stack');
  return fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  });
}

/** Create an account, or accept that it already exists. */
async function mint(email: string): Promise<void> {
  const res = await admin('users', { method: 'POST', body: JSON.stringify({ email, password: E2E_PASSWORD, email_confirm: true }) });
  if (res.ok) return;
  const body = await res.text();
  if (res.status === 422 && /exist|registered/i.test(body)) return;
  throw new Error(`could not mint ${email}: ${res.status} ${body}`);
}

/** Delete the scene's extra accounts (their documents go with them). Best effort. */
export async function dropMinted(emails: string[]): Promise<void> {
  if (!emails.length) return;
  const res = await admin('users?per_page=1000', { method: 'GET' }).catch(() => null);
  const users = ((await res?.json().catch(() => null)) as { users?: { id: string; email: string }[] } | null)?.users ?? [];
  for (const u of users) if (emails.includes(u.email)) await admin(`users/${u.id}`, { method: 'DELETE' }).catch(() => undefined);
}

const t0 = Date.now();
export const log = (...a: unknown[]) => console.log(`[five ${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const row = (page: Page, label: string) =>
  page.locator('.pd-cue').filter({ has: page.locator('.pd-cue-label > strong', { hasText: new RegExp(`^${label}$`) }) });

export async function selectCue(page: Page, label: string): Promise<void> {
  await row(page, label).getByTestId('select-cue').click();
  await expect(page.locator('.pd-cue.selected .pd-cue-label > strong')).toHaveText(label);
}

/** The cue editor's first text box: the cue's main text. */
const textBox = (page: Page) => page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').first();

/**
 * The owner builds the production: `takes` plain lower thirds for the taker, one per editor, and
 * a House Score whose home score is bound to the production's data; moves it into a new team and
 * publishes it from there.
 */
async function build(owner: Page, editors: number): Promise<Omit<Scene, 'people' | 'output' | 'outputContext' | 'minted' | 'slug' | 'key'>> {
  await signInAs(owner, E2E_EMAIL, E2E_PASSWORD);
  await dismissWizard(owner).catch(() => undefined);
  await clearPublishedShows(owner);
  await wipeMyGraphics(owner);
  await owner.goto('/app#/home');
  await expect(owner.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  const stamp = Date.now();
  const made = await owner.evaluate(
    async ({ name, editors, path }) => {
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
    { name: `Five people ${stamp}`, editors, path: SCORE_PATH },
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
  await publishProduction(owner);
  const panel = owner.getByTestId('production-status-panel');
  if (await panel.isVisible()) {
    await owner.getByTestId('production-status').click();
    await expect(panel).toBeHidden();
  }
  return { showId: made.id, teamId: team.id, code: team.code, takes: made.takes, edits: made.edits, score: made.score };
}

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
  const panel = page.getByTestId('production-status-panel');
  if (await panel.isVisible()) {
    await page.getByTestId('production-status').click();
    await expect(panel).toBeHidden();
  }
}

/** The service-role switch writes (`system_settings`), local stack only. */
export async function setSwitch(key: 'auto_publish' | 'partial_writes', on: boolean): Promise<void> {
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) throw new Error('switches are written only on a local stack');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/system_settings?on_conflict=key`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json', prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ key, value: { on } }),
  });
  if (!res.ok) throw new Error(`switch ${key}: ${res.status} ${await res.text()}`);
}

/**
 * Set the scene up: `pages` people (at least five: taker, messages, quick and two or more editors),
 * the first on the suite's own account (the team owner, who builds and publishes, then takes), the
 * second on the suite's teammate account, the rest minted. Opens one output and waits for it to hold
 * every graphic.
 */
export async function setUp(browser: Browser, owner: Page, pages: number): Promise<Scene> {
  if (pages < 5) throw new Error('the scene needs five people');
  const editors = pages - 3;
  const built = await build(owner, editors);
  log('built and published', built.showId);
  const roles: Person['role'][] = ['taker', 'messages', 'quick', ...Array.from({ length: editors }, () => 'editor' as const)];
  const emails = roles.map((_, i) => (i === 0 ? E2E_EMAIL : memberEmail(i)));
  const minted = emails.slice(1);
  for (const e of minted) await mint(e);
  const people: Person[] = [{ role: 'taker', email: E2E_EMAIL, context: owner.context(), page: owner }];
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
    const { productionDataKey, patchProductionData } = await __noacgImport('/src/control/productionDataApi.ts');
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
  await instrument(outputContext);
  await outputContext.addInitScript(FRAME_LOADS);
  const output = await outputContext.newPage();
  await output.goto(`/output?production=${encodeURIComponent(slug)}`);
  const graphics = built.takes.length + built.edits.length + 1;
  await expect
    .poll(async () => { const r = await readyOf(output); return r ? r.n === r.of && r.of >= graphics : false; }, { timeout: 180_000, intervals: [100] })
    .toBe(true);
  log('output holds every graphic');
  // MEASURE_NET=slow (the measurement only): every page and the output at 20 Mbit/s and 50 ms from
  // here on. Set-up is not timed. A page taken offline and back loses its throttle (one CDP setting).
  if (NET === 'slow') for (const p of [...people.map((x) => x.page), output]) await throttle(p, 'slow');
  return { ...built, slug, key, people, output, outputContext, minted };
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
  /** One tick: editors type together on it; the quick button presses on every other one. */
  tickMs?: number;
  /** Seconds between messages. */
  messageEveryMs?: number;
  /** Reload one editor's page at this fraction of the run, and take another offline at that one. */
  reloadAt?: number | null;
  offlineAt?: number | null;
  offlineMs?: number;
  /** false: only the taker runs (the single-page comparison). */
  everyone?: boolean;
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
      await selectCue(page, label);
      const before = await nowOn(page);
      await page.getByTestId('verb-take').click();
      const presses = (await readLpm(page)).presses.filter((p) => p.kind === 'click' && p.target === 'verb-take' && p.t >= before);
      const pressAt = presses[0]?.t ?? before;
      let ranAt: number | null = null;
      const deadline = Date.now() + 10_000;
      while (ranAt === null && Date.now() < deadline) {
        const plays = (await framePlays(scene.output)).flatMap((f) => f.plays).filter((p) => p.playAt > pressAt).sort((a, b) => a.playAt - b.playAt);
        if (plays.length) ranAt = plays[0].playAt;
        else await page.waitForTimeout(20);
      }
      report.takes.push({ pressAt, ranAt, label });
      await page.waitForTimeout(250);
      await page.getByTestId('verb-out').click();
      await page.waitForTimeout(400);
    }
  };

  const quickLoop = async (p: Person) => {
    const page = p.page;
    await selectCue(page, p.cue!);
    // The score goes on air once; from then on its Goal button is the quick button pressed.
    const goal = page.getByTestId('cue-action-goalA');
    if (!(await goal.isEnabled().catch(() => false))) await page.getByTestId('verb-take').click();
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
          await ws.getByTestId('message-paste-add').click();
          const r = ws.locator('.pd-aud-row', { hasText: body });
          await expect(r).toBeVisible({ timeout: 20_000 });
          await r.getByTestId('audience-prepare').click();
          const card = r.getByTestId('audience-choose-card').first();
          if (await card.isVisible({ timeout: 1_000 }).catch(() => false)) await card.click();
          await expect(ws.getByTestId('audience-note')).toContainText('It airs when you Take it', { timeout: 20_000 });
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
    let reloaded = false, wentOffline = false, backOnline: number | null = null;
    for (let k = 1; live(); k++) {
      await sleepUntil(page, start + k * tick);
      if (!live()) break;
      if (reloadAt !== null && !reloaded && Date.now() >= reloadAt) {
        reloaded = true;
        await page.reload();
        await openProduction(page, scene.showId);
        await selectCue(page, p.cue!);
        report.reloads += 1;
      }
      if (offlineAt !== null && !wentOffline && Date.now() >= offlineAt) {
        wentOffline = true;
        await p.context.setOffline(true);
        backOnline = Date.now() + (opts.offlineMs ?? 20_000);
        report.offline = { from: Date.now() - start, to: Date.now() - start + (opts.offlineMs ?? 20_000) };
      }
      if (backOnline !== null && Date.now() >= backOnline) {
        await p.context.setOffline(false);
        backOnline = null;
      }
      const text = `${p.cue} by ${n} #${k}`;
      await textBox(page).fill(text);
      record.typed.push(text);
    }
    if (backOnline !== null) await p.context.setOffline(false);
  };

  const loops: Promise<void>[] = [takerLoop().catch(fail('taker'))];
  if (everyone) {
    loops.push(quickLoop(by('quick')[0]).catch(fail('quick')));
    loops.push(messagesLoop(by('messages')[0]).catch(fail('messages')));
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
      const { data: row } = await sb.from('team_productions').select('doc').eq('id', id).maybeSingle();
      const doc = (row as { doc?: { cues?: { label: string; values?: Record<string, string> }[] } } | null)?.doc ?? {};
      const { data: pub } = await sb.from('control_shows').select('output').eq('id', id).maybeSingle();
      const state = await fetchProductionData(key);
      const score = Number((state?.data as { match?: { home?: { score?: unknown } } } | undefined)?.match?.home?.score);
      const cues: Record<string, string> = {};
      for (const c of doc.cues ?? []) cues[c.label] = Object.values(c.values ?? {})[0] ?? '';
      return { cues, labels: (doc.cues ?? []).map((c) => c.label), published: JSON.stringify((pub as { output?: unknown } | null)?.output ?? null), score };
    },
    { id: scene.showId, key: scene.key },
  );
  const conflicted: string[] = [];
  for (const p of scene.people) {
    const names = await p.page
      .evaluate(async () => {
        const { loadShows } = await __noacgImport('/src/model/shows.ts');
        return loadShows().map((s) => s.name).filter((n) => /conflicted copy/i.test(n));
      })
      .catch(() => [] as string[]);
    conflicted.push(...names.map((n) => `${p.email}: ${n}`));
  }
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
export async function tearDown(scene: Scene | null, owner: Page): Promise<void> {
  if (scene) {
    for (const p of scene.people.slice(1)) await p.context.close().catch(() => undefined);
    await scene.outputContext.close().catch(() => undefined);
    await owner
      .evaluate(async (teamId) => {
        const { deleteTeam } = await __noacgImport('/src/backend/teams.ts');
        await deleteTeam(teamId);
      }, scene.teamId)
      .catch(() => undefined);
    await dropMinted(scene.minted);
  }
  await clearPublishedShows(owner).catch(() => undefined);
}
