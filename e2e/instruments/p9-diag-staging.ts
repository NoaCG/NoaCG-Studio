// DIAGNOSIS diag-load-9a (live-publishing run #2361), NOT FOR MAIN. Times the team save and the
// publish write on the hosted STAGING project by record size and by number of writers, with a
// small read as a stand-in for a Take, all as the workflow's signed-in staging test account. No
// browser. It makes one throwaway team (prefix "E2E team ", which the suite's sweep removes) and
// one team production, and deletes both at the end. It refuses production.
import { test } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { configuredTarget } from '../../scripts/configured-target.mjs';

const SHARD1 = (process.env.SHARD ?? '1/1').startsWith('1/');
const URL_ = process.env.VITE_SUPABASE_URL ?? '';
const ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const fx = JSON.parse(readFileSync(new URL('./diag-fixture.json', import.meta.url), 'utf8'));

type Json = Record<string, unknown>;
const pct = (v: number[], p: number) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? Math.round(s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]) : null;
};
/** A record of k graphics: the score and k-1 lower thirds, each with its own id, name and cue. */
const docOf = (k: number, tag = ''): Json => {
  const graphics: Json[] = [{ ...fx.score }];
  for (let i = 1; i < k; i++) graphics.push({ ...fx.hairline, id: `${fx.hairline.id.slice(0, 24)}${String(i).padStart(12, '0')}`, name: `Diag ${i}` });
  const cues = graphics.map((g, i) => ({ ...fx.cue, id: `${fx.cue.id.slice(0, 24)}${String(i).padStart(12, '0')}`, label: `Diag cue ${i}${i === 1 ? tag : ''}`, sourceId: g.id }));
  return { ...fx.base, graphics, cues };
};

test.describe.configure({ retries: 0 });

if (!SHARD1) test('idle shard', () => {});
else
  test('diag-load-9a: save and publish cost by size and writers', async () => {
    test.setTimeout(20 * 60_000);
    const t = configuredTarget(process.env);
    if (t.kind !== 'hosted-staging' && t.kind !== 'local') throw new Error(`staging or local only: ${t.kind}`);
    if (/kprolrchuldgfrzspthy/i.test(URL_)) throw new Error('production ref: refusing');
    const out: Json = { target: t.kind, at: new Date().toISOString() };
    const emit = () => {
      const line = JSON.stringify(out);
      console.log(`P9RESULT diag ${line}`);
      mkdirSync(test.info().outputDir, { recursive: true });
      writeFileSync(test.info().outputPath('diag.json'), line);
    };

    const tok = await (await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }),
    })).json();
    const H = { apikey: ANON, authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json', 'x-noacg-production-copies': '1' };
    const me = JSON.parse(Buffer.from(String(tok.access_token).split('.')[1], 'base64url').toString()).sub;
    const call = async (path: string, init: RequestInit = {}) => {
      const t0 = performance.now();
      try {
        const r = await fetch(`${URL_}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers as Json ?? {}) }, signal: AbortSignal.timeout(60_000) });
        const text = await r.text();
        return { ms: performance.now() - t0, status: r.status, text, bytes: text.length };
      } catch (e) {
        return { ms: performance.now() - t0, status: 0, text: String(e), bytes: 0 };
      }
    };
    const probe = async () => (await call('documents?select=id&limit=1')).ms;

    let teamId: string | null = null;
    const id = crypto.randomUUID();
    try {
      const idle: number[] = [];
      for (let i = 0; i < 20; i++) idle.push(await probe());
      out.idleProbe = { p50: pct(idle, 50), p95: pct(idle, 95) };

      const team = await call('teams?select=id,join_code', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ name: `E2E team diag ${Date.now()}` }) });
      const row = JSON.parse(team.text)[0];
      teamId = row.id;
      await call('rpc/team_join', { method: 'POST', body: JSON.stringify({ p_code: row.join_code, p_display_name: 'diag' }) });
      const ins = await call('team_productions?select=updated_at,rev', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ id, team_id: teamId, doc: docOf(6), updated_by: me }) });
      if (ins.status >= 300) throw new Error(`insert ${ins.status} ${ins.text.slice(0, 200)}`);
      let at: string = JSON.parse(ins.text)[0].updated_at;

      const save = async (doc: Json, expected: string) => {
        const r = await call('rpc/team_production_save', { method: 'POST', body: JSON.stringify({ p_id: id, p_expected: expected, p_doc: doc }) });
        let a: Json | null = null;
        try { a = JSON.parse(r.text); } catch { /* not JSON */ }
        return { ...r, saved: a?.saved === true, refused: a?.saved === false, at: (a?.updated_at as string) ?? null, err: r.status >= 300 || r.status === 0 ? String((a?.message as string) ?? r.text).slice(0, 120) : null };
      };

      // 1. One writer, by size.
      const sizes: Json[] = [];
      for (const k of [6, 15, 30, 60]) {
        const ms: number[] = [];
        const errs: string[] = [];
        for (let i = 0; i < 4; i++) {
          const r = await save(docOf(k, ` ${i}`), at);
          ms.push(r.ms);
          if (r.at) at = r.at;
          if (r.err) errs.push(`${Math.round(r.ms)} ms: ${r.err}`);
        }
        sizes.push({ graphics: k, bytes: JSON.stringify(docOf(k)).length, ms: ms.map(Math.round), errs });
      }
      out.saveBySize = sizes;
      emit();

      // 2. Writers at once on one record, each saving every 600 ms, with the probe beside them.
      const concurrent = async (k: number, writers: number, seconds: number) => {
        const end = Date.now() + seconds * 1000;
        const lat: number[] = [];
        const probes: number[] = [];
        const errs: Record<string, number> = {};
        let saved = 0, refused = 0, refusedBytes = 0;
        const first = await save(docOf(k), at);
        if (first.at) at = first.at;
        const writer = async (w: number) => {
          let mine = at, n = 0;
          while (Date.now() < end) {
            const r = await save(docOf(k, ` w${w} ${n++}`), mine);
            lat.push(r.ms);
            if (r.err) { errs[r.err] = (errs[r.err] ?? 0) + 1; await new Promise((s) => setTimeout(s, 600)); continue; }
            if (r.saved) saved++;
            if (r.refused) { refused++; refusedBytes += r.bytes; }
            if (r.at) mine = r.at;
            await new Promise((s) => setTimeout(s, 600));
          }
        };
        const prober = async () => { while (Date.now() < end) { probes.push(await probe()); await new Promise((s) => setTimeout(s, 500)); } };
        await Promise.all([...Array.from({ length: writers }, (_, w) => writer(w)), prober()]);
        const latest = await call(`team_productions?select=updated_at&id=eq.${id}`);
        at = JSON.parse(latest.text)[0]?.updated_at ?? at;
        return { graphics: k, writers, seconds, saves: lat.length, saved, refused, refusedMB: Math.round(refusedBytes / 1e5) / 10, errors: errs, saveP50: pct(lat, 50), saveP95: pct(lat, 95), saveMax: Math.round(Math.max(...lat)), probeP50: pct(probes, 50), probeP95: pct(probes, 95), probeMax: Math.round(Math.max(...probes)) };
      };
      out.concurrent = [];
      for (const [k, w] of [[6, 1], [6, 7], [60, 2]] as const) {
        (out.concurrent as Json[]).push(await concurrent(k, w, 30));
        emit();
        await new Promise((s) => setTimeout(s, 10_000));
      }

      // 3. The publish write, by size: one control_shows row written whole, on the stamp.
      const rev = JSON.parse((await call(`team_productions?select=rev&id=eq.${id}`)).text)[0].rev;
      const outOf = (k: number, n: number) => { const d = docOf(k); return { v: 1, ver: { n, r: rev, at: new Date().toISOString() }, cues: d.cues, graphics: d.graphics, resolution: { w: 1920, h: 1080 } }; };
      const pins = await call('control_shows', { method: 'POST', body: JSON.stringify({ id, title: 'diag', team_id: teamId, output: outOf(6, 1) }) });
      if (pins.status >= 300) throw new Error(`publish insert ${pins.status} ${pins.text.slice(0, 200)}`);
      let n = 1;
      const pubs: Json[] = [];
      for (const k of [6, 15, 30, 60]) {
        const ms: number[] = [];
        const errs: string[] = [];
        for (let i = 0; i < 3; i++) {
          const r = await call(`control_shows?id=eq.${id}&output->ver->>n=eq.${n}&select=id`, { method: 'PATCH', body: JSON.stringify({ output: outOf(k, n + 1) }) });
          ms.push(r.ms);
          if (r.status >= 300 || r.status === 0) errs.push(`${Math.round(r.ms)} ms: ${r.status} ${r.text.slice(0, 100)}`);
          else n++;
        }
        pubs.push({ graphics: k, bytes: JSON.stringify(outOf(k, n)).length, ms: ms.map(Math.round), errs });
      }
      out.publishBySize = pubs;
    } finally {
      await call(`control_shows?id=eq.${id}`, { method: 'DELETE' });
      await call(`team_productions?id=eq.${id}`, { method: 'DELETE' });
      if (teamId) await call(`teams?id=eq.${teamId}`, { method: 'DELETE' });
      out.cleanedUp = JSON.parse((await call(`team_productions?select=id&id=eq.${id}`)).text).length === 0;
      emit();
    }
  });
