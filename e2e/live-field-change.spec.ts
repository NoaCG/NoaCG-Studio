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

  const findings: Finding[] = [];
  let checked = 0;
  for (let at = 0; at < targets.length; at += 8) {
    const batch = targets.slice(at, at + 8).map((t) => t.id);
    const result: { findings: Finding[]; checked: number } = await page.evaluate(async (ids) => {
      const cat = await import('/src/templates/catalog.ts');
      const comp = await import('/src/preview/composeDocument.ts');
      const types = await import('/src/model/types.ts');
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
      type Field = { field: string; ftype: string; value?: string; items?: { value: string }[] };
      /** A value nobody would type, tagged so the page text says which field and round it is. */
      const sentinel = (f: Field, i: number, round: string): string | null => {
        switch (f.ftype) {
          case 'number':
            return String((round === 'A' ? 900000 : 800000) + i);
          case 'checkbox':
            return f.value === 'true' ? 'false' : 'true';
          case 'color':
            return round === 'A' ? '#ff00ff' : '#00ffff';
          case 'dropdown': {
            const other = (f.items ?? []).find((it) => it.value !== f.value);
            return other ? other.value : null;
          }
          case 'filelist':
            return null;
          default: {
            const tag = `ZQ${round}${i}X`;
            const value = String(f.value ?? '');
            if (value.includes('\n') || value.includes('|')) {
              return value.split('\n').map((line, li) => line.split('|').map((_, ci) => `${tag}${li}_${ci}`).join(' | ')).join('\n');
            }
            return tag;
          }
        }
      };
      document.body.innerHTML = '';
      const docs = ids.map((id) => {
        const v = cat.variantById(id)!;
        const frame = document.createElement('iframe');
        frame.style.cssText = 'width:1920px;height:1080px;border:0;position:fixed;left:-5000px;top:0';
        let tpl: ReturnType<typeof v.create> | null = null;
        let err: string | null = null;
        try {
          tpl = v.create({});
          frame.srcdoc = comp.composeDocument(tpl);
        } catch (e) {
          err = String((e as Error)?.message ?? e);
        }
        document.body.appendChild(frame);
        return { id, frame, tpl, err };
      });
      await pause(900);
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
      for (const { id, frame, tpl, err } of docs) {
        if (err || !tpl) {
          findings.push({ id, problem: `did not build: ${err}` });
          continue;
        }
        const win = frame.contentWindow as (Window & { update?: (d: string) => void }) | null;
        if (!win || typeof win.update !== 'function') continue;
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
        const fields = (tpl.fields as Field[]).map((f, i) => ({ f, i })).filter(({ f }) => types.DATA_FTYPES.includes(f.ftype as never));
        const base: Record<string, string> = {};
        for (const { f, i } of fields) {
          const s = sentinel(f, i, 'A');
          if (s !== null) base[f.field] = s;
        }
        const before = await send(base);
        const junkBefore = junk(before);
        const shows = (s: string, field: string) => {
          const i = fields.findIndex(({ f }) => f.field === field);
          return s.includes(`ZQA${i}X`);
        };
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
            const i = fields.findIndex(({ f }) => f.field === field);
            if (textFields.indexOf(field) >= 0 && !after.includes(`ZQB${i}X`)) findings.push({ id, problem: `without ${removed}, ${field} stopped updating` });
          }
        }
        for (const message of thrown) findings.push({ id, problem: `threw: ${message.slice(0, 120)}` });
        checked += 1;
      }
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
