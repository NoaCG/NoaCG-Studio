// PHASE 9 CLOUD (live-publishing run #2361): shared pieces of the staging instruments. Not for main:
// these files run only through hosted-latency.yml's `spec` dispatch, on the hosted staging project.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { configuredTarget } from '../../scripts/configured-target.mjs';
import { E2E_EMAIL, E2E_PASSWORD, SERVICE_ROLE_KEY, SUPABASE_URL, signInAs } from '../configured/_helpers';
import { lastTexts, pageCues, serverState, setSwitch, type RunReport, type Scene, type Settled } from '../configured/_five';

/** Only shard 1 runs the work; the others run one empty test so their job reads green. */
export const SHARD1 = (process.env.SHARD ?? '1/1').startsWith('1/');

/** Refuse anything but the declared staging project (or a local stack, for a dry run here). */
export function admitStaging(): string {
  const t = configuredTarget(process.env);
  if (t.kind !== 'hosted-staging' && t.kind !== 'local') throw new Error(`phase 9 cloud runs only on hosted staging: ${t.kind} ${'reason' in t ? t.reason : ''}`);
  if (/kprolrchuldgfrzspthy/i.test(SUPABASE_URL)) throw new Error('production ref: refusing');
  return t.kind;
}

/** One line per result in the job log, and a file in test-results (uploaded as an artifact). */
export function emit(name: string, data: unknown): void {
  const line = JSON.stringify(data);
  console.log(`P9RESULT ${name} ${line}`);
  const path = test.info().outputPath(`${name}.json`);
  mkdirSync(test.info().outputDir, { recursive: true });
  writeFileSync(path, line);
}

const service = (path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

/** The switch rows as the staging project holds them. */
export async function readSwitches(): Promise<Record<string, unknown>> {
  const r = await service('system_settings?select=key,value&key=in.(auto_publish,partial_writes,production_copies)');
  const rows = (await r.json()) as { key: string; value: unknown }[];
  return Object.fromEntries(rows.map((x) => [x.key, x.value]));
}

/** What the two state functions answer, asked as the signed-in owner (the role the app asks as). */
export async function states(page: Page): Promise<{ auto: unknown; partial: unknown }> {
  return page.evaluate(async () => {
    const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
    const sb = (await getSupabase())!;
    const [a, p] = await Promise.all([sb.rpc('auto_publish_state'), sb.rpc('partial_writes_state')]);
    return { auto: a.error ? { error: a.error.message } : a.data, partial: p.error ? { error: p.error.message } : p.data };
  });
}

/** The states as the owner sees them, from a context of its own: the scene's build signs the owner's page in itself. */
export async function ownerStates(browser: Browser): Promise<{ auto: unknown; partial: unknown }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInOwner(page);
    return await states(page);
  } finally {
    await context.close();
  }
}

export async function signInOwner(page: Page): Promise<void> {
  await signInAs(page, E2E_EMAIL, E2E_PASSWORD);
}

/** Both new switches off, production_copies back to what it was; reported, never thrown. */
export async function restoreSwitches(before: Record<string, unknown>): Promise<Record<string, unknown>> {
  const errors: string[] = [];
  for (const key of ['auto_publish', 'partial_writes'] as const) await setSwitch(key, false).catch((e) => errors.push(`${key}: ${String(e)}`));
  // Staging held no production_copies row before phase 9 (it reads as off), so the runs leave it off.
  void before;
  await setSwitch('production_copies', false).catch((e) => errors.push(`production_copies: ${String(e)}`));
  const after = await readSwitches().catch((e) => ({ error: String(e) }));
  return { after, errors };
}

/** Wait until the server and every page hold each editor's last text, or the time is up. */
export async function settle(s: Scene, report: RunReport, timeoutMs = 90_000, needPublished = true) {
  const lastOf = lastTexts(report);
  const began = Date.now();
  const end = began + timeoutMs;
  let state!: Settled;
  const pages: Record<string, Record<string, string>> = {};
  const read = async () => {
    const [got, ...each] = await Promise.all([serverState(s), ...s.people.map((p) => pageCues(p.page, s.showId).catch(() => ({})))]);
    state = got;
    s.people.forEach((p, i) => (pages[p.email] = each[i]));
  };
  const ok = () => Object.entries(lastOf).every(([cue, text]) => state.cues[cue] === text && (!needPublished || state.published.includes(text)) && Object.values(pages).every((c) => c[cue] === text));
  await read();
  while (!ok() && Date.now() < end) {
    await s.people[0].page.waitForTimeout(2_000);
    await read();
  }
  const stood = Object.entries(lastOf).map(([cue, text]) => ({
    cue,
    typed: text,
    record: state.cues[cue],
    published: state.published.includes(text),
    pagesHolding: Object.values(pages).filter((c) => c[cue] === text).length,
    pages: Object.keys(pages).length,
  }));
  return { ok: ok(), settledInMs: Math.min(Date.now() - began, timeoutMs), stood, score: state.score, conflicted: state.conflicted, labels: state.labels };
}

/** Each editor's own page: box, record, team save state (#2589). */
export async function probe(s: Scene) {
  return Promise.all(
    s.people
      .filter((p) => p.role === 'editor')
      .map(async (p) => {
        const box = await p.page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').first().inputValue({ timeout: 2_000 }).catch(() => null);
        const state = await p.page
          .evaluate(
            async ({ id, cue }) => {
              const { getTeamState, teamEditOwed } = await __noacgImport('/src/backend/teamProductions.ts');
              const { loadShows } = await __noacgImport('/src/model/shows.ts');
              const team = getTeamState();
              const c = loadShows().find((x) => x.id === id)?.cues?.find((x) => x.label === cue);
              return { record: c ? Object.values(c.values ?? {})[0] ?? '' : null, saving: team.saving[id] ?? null, note: team.notes[id] ?? null, owed: teamEditOwed(id) };
            },
            { id: s.showId, cue: p.cue! },
          )
          .catch((e) => ({ error: String(e).split('\n')[0] }));
        return { cue: p.cue, box, ...state };
      }),
  );
}

export const ranOf = (r: RunReport) => r.takes.filter((t) => t.ranAt !== null).map((t) => Math.round((t.ranAt! - t.pressAt) * 10) / 10);
export const pct = (v: number[], p: number) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
export const stats = (v: number[]) => ({ n: v.length, p50: pct(v, 50), p95: pct(v, 95), max: v.length ? Math.max(...v) : null });

/** A screenshot into test-results (uploaded). */
export const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(`${name}.png`) }).catch(() => undefined);

export { expect };
