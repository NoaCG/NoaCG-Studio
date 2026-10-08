// LIVE VALUES SURVIVE A FIELD CHANGE ON AN ON-AIR GRAPHIC (docs/work-specs/per-graphic-replacement
// spec AC-3, G3). A publish that renames, adds or removes a field leaves the graphic on air running
// its old body (G1), while the control surfaces already speak the new version's fields. A rename
// keeps the field id (src/blocks/edit.ts `setFieldTitle`), so it reaches the old body unchanged.
// What reaches it differently is an Update that LACKS a removed field and one that CARRIES a field
// only the new version has. This drives exactly those two into every category's own `update()`
// on air and reads the result: no error, no "undefined", the removed field keeping its on-air value,
// and every other field still updating.
//
// One variant per category here; `NOACG_FIELD_CHANGE_ALL=1` drives every catalog variant (the
// evidence run). Same-origin frames, so the spec reads each document's rendered text directly.
// covers: src/templates/*/shared.ts, src/templates/shared/base.ts

import { test, expect } from '@playwright/test';

const ALL = process.env.NOACG_FIELD_CHANGE_ALL === '1';

type Finding = { id: string; problem: string };

test('every category keeps its live values across a renamed, added or removed field', async ({ page }) => {
  test.setTimeout(ALL ? 900_000 : 120_000);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  const targets: { id: string; cat: string }[] = await page.evaluate(async (all) => {
    const cat = await import('/src/templates/catalog.ts');
    const out: { id: string; cat: string }[] = [];
    for (const [category, variants] of Object.entries(cat.CATALOG)) {
      for (const v of (variants ?? []).slice(0, all ? undefined : 1)) out.push({ id: v.id, cat: category });
    }
    return out;
  }, ALL);
  expect(targets.length).toBeGreaterThan(10);
  // A rename keeps the field's id, so an Update of the renamed field reaches the body on air.
  const renamed = await page.evaluate(async (id) => {
    const cat = await import('/src/templates/catalog.ts');
    const { setFieldTitle } = await import('/src/blocks/edit.ts');
    const tpl = cat.variantById(id)!.create({});
    const first = tpl.fields[0];
    const after = setFieldTitle(tpl, first.field, 'Renamed on air');
    return { before: tpl.fields.map((f) => f.field), after: after.fields.map((f) => f.field), title: after.fields[0].title };
  }, targets[0].id);
  expect(renamed.after).toEqual(renamed.before);
  expect(renamed.title).toBe('Renamed on air');

  const findings: Finding[] = [];
  let checked = 0;
  for (let at = 0; at < targets.length; at += 8) {
    const batch = targets.slice(at, at + 8).map((t) => t.id);
    const result: { findings: Finding[]; checked: number } = await page.evaluate(async (ids) => {
      const cat = await import('/src/templates/catalog.ts');
      const comp = await import('/src/preview/composeDocument.ts');
      const types = await import('/src/model/types.ts');
      const { sentinelFor } = await import('/src/validation/fieldPaint.ts');
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
      type Field = Parameters<typeof sentinelFor>[0];
      /** Round B's text and numbers are round A's index plus this, so the page text says which. */
      const ROUND_B = 500;
      /** A value nobody would type ("ZQ3X", or "ZQ503X" in round B), or null for a type the page
       *  cannot show as text: those are still sent, and must not break the others. */
      const sentinel = (f: Field, i: number, round: 'A' | 'B'): string | null => {
        switch (f.ftype) {
          case 'checkbox':
            return f.value === 'true' ? 'false' : 'true';
          case 'color':
            return round === 'A' ? '#ff00ff' : '#00ffff';
          case 'dropdown':
            return (f.items ?? []).find((it) => it.value !== f.value)?.value ?? null;
          case 'filelist':
            return null;
          default:
            return sentinelFor(f, round === 'A' ? i : i + ROUND_B);
        }
      };
      document.body.innerHTML = '';
      const docs = ids.map((id) => {
        const v = cat.variantById(id)!;
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
        const loaded = new Promise((r) => frame.addEventListener('load', r));
        let tpl: ReturnType<typeof v.create> | null = null;
        let err: string | null = null;
        try {
          tpl = v.create({});
          frame.srcdoc = comp.composeDocument(tpl);
        } catch (e) {
          err = String((e as Error)?.message ?? e);
        }
        document.body.appendChild(frame);
        return { id, frame, tpl, err, loaded };
      });
      await Promise.race([Promise.all(docs.map((d) => d.loaded)), pause(5000)]);
      // On air, and past the entrance: a count-up entrance writes its field while it runs.
      for (const { frame } of docs) {
        try {
          (frame.contentWindow as (Window & { play?: () => void }) | null)?.play?.();
        } catch {
          // a template without a working play() is another gate's problem; update() is this one's
        }
      }
      await pause(2500);
      const findings: { id: string; problem: string }[] = [];
      let checked = 0;
      // Each document is its own window: they are driven side by side.
      await Promise.all(docs.map(async ({ id, frame, tpl, err }) => {
        if (err || !tpl) {
          findings.push({ id, problem: `did not build: ${err}` });
          return;
        }
        const win = frame.contentWindow as (Window & { update?: (d: string) => void }) | null;
        if (!win || typeof win.update !== 'function') return;
        const thrown: string[] = [];
        win.addEventListener('error', (e) => thrown.push(String(e.message)));
        win.addEventListener('unhandledrejection', (e) => thrown.push(String((e as PromiseRejectionEvent).reason)));
        const text = () => (frame.contentDocument?.body.innerText ?? '');
        const junk = (s: string) => (s.match(/undefined|NaN|\[object Object\]/g) ?? []).length;
        const send = async (data: Record<string, string>) => {
          try {
            win.update!(JSON.stringify(data));
          } catch (e) {
            thrown.push(String((e as Error)?.message ?? e));
          }
          await pause(60);
          return text();
        };
        const fields = tpl.fields.map((f, i) => ({ f, i })).filter(({ f }) => types.DATA_FTYPES.includes(f.ftype));
        const base: Record<string, string> = {};
        for (const { f, i } of fields) {
          const s = sentinel(f, i, 'A');
          if (s !== null) base[f.field] = s;
        }
        // Sent twice, as on air (a Take, then Updates that resend the cue's whole value set), and
        // read once a runtime has repainted what it computes: only a typed value that stays on
        // screen is one this probe can follow. A debate board's clock fields read a sentinel that
        // is not a time as a half-typed edit and repaint it on the resend; a real time stays.
        await send(base);
        await pause(500);
        await send(base);
        await pause(500);
        const before = text();
        const junkBefore = junk(before);
        const tagOf = (field: string, round: 'A' | 'B') => {
          const i = fields.find(({ f }) => f.field === field)?.i ?? -1;
          return `ZQ${round === 'A' ? i : i + ROUND_B}X`;
        };
        const shows = (s: string, field: string) => s.includes(tagOf(field, 'A'));
        const textFields = Object.keys(base).filter((field) => shows(before, field));
        // A field only the published version has: the on-air body is sent it and must not mind.
        const added = await send({ ...base, f999: 'ZQNEWFIELDX' });
        if (junk(added) > junkBefore) findings.push({ id, problem: 'an unknown field made it print undefined/NaN' });
        for (const field of textFields) if (!shows(added, field)) findings.push({ id, problem: `an unknown field cleared ${field}` });
        // A field the published version removed: every Update from now on lacks it.
        for (const removed of Object.keys(base)) {
          await send(base);
          const partial: Record<string, string> = {};
          for (const { f, i } of fields) {
            if (f.field === removed || base[f.field] === undefined) continue;
            const s = sentinel(f, i, 'B');
            if (s !== null) partial[f.field] = s;
          }
          const after = await send(partial);
          if (junk(after) > junkBefore) findings.push({ id, problem: `without ${removed} it printed undefined/NaN` });
          if (textFields.indexOf(removed) >= 0 && !shows(after, removed)) findings.push({ id, problem: `without ${removed} its on-air value was lost` });
          for (const field of Object.keys(partial)) {
            if (textFields.indexOf(field) >= 0 && !after.includes(tagOf(field, 'B'))) findings.push({ id, problem: `without ${removed}, ${field} stopped updating` });
          }
        }
        for (const message of thrown) findings.push({ id, problem: `threw: ${message.slice(0, 120)}` });
        checked += 1;
      }));
      // Answer from a later task: the frames' timers are still running (e2e/async-whose-last-act-starts-work).
      await pause(0);
      return { findings, checked };
    }, batch);
    findings.push(...result.findings);
    checked += result.checked;
  }
  console.log(`live field change: ${checked} variants driven of ${targets.length}, ${findings.length} finding(s)`);
  expect(findings).toEqual([]);
});
