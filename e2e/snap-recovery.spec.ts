// covers: src/control/**, src/templates/**
// focus
//
// The browser-output renderer (docs/CLOUD_PLAYOUT.md): its own MPA entry + the stage module.
// covers: src/output/**

import { test, expect } from '@playwright/test';

// SNAP is the recovery half nothing else exercises (docs/CLOUD_PLAYOUT.md §3,
// docs/STATE_MACHINE_SCHEMA.md): a renderer that boots into a live show writes the data, then
// SNAPS to the state it was in — no animation, because recovery is never something an audience
// should watch replay.
//
// Snap composes its pose by resetting the graphic first, and that reset clears every INLINE
// style. One of those is not the animation's to clear: an image field with no picture hides
// itself inline (`setFieldValue` removes the src and sets display:none), so the wipe put a 52px
// broken-image box on air beside the caption — seen in CasparCG on 2026-08-03, on recovery
// only, which is why no gate had ever noticed. Every design with a `filelist` field was
// exposed, three dozen of them.
//
// The invariant this pins is the general one, not that one symptom: **snap must not change what
// the DATA layer decided.** Whatever the fields made visible before the snap is what must be
// visible after it — for a picked picture and for an empty one alike. Absolute expectations
// ("a logo is always visible") would be wrong for half the catalog: a credits roll's image
// field is an input-only holder, and a scoreboard's crests belong to a later state.

const CHECK = `async () => {
  // The whole catalog: CATALOG is keyed by category, and variantsFor(null) answers [] by design.
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { composeDocument } = await import('/src/preview/composeDocument.ts');
  const everyVariant = Object.values(CATALOG).flatMap((list) => list || []);
  // A 1x1 transparent GIF: a picture that is unquestionably present and costs nothing.
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const boot = async (tpl) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 40));
    return { win: f.contentWindow, dispose: () => f.remove() };
  };

  /** Snap into the first state of the default path — "on air", however the design spells it. */
  const snapLive = (win) => {
    const group = win.noacgMachine && win.noacgMachine.groups && win.noacgMachine.groups[0];
    const live = group && group.defaultPath && group.defaultPath[0];
    if (!group || !live) return false;
    const assign = {};
    assign[group.id] = live;
    win.noacgSnap(assign, { timers: false });
    return true;
  };

  /** What the field's own element looks like — the data layer's decision, not the pose's. */
  const visibility = (win, id) => {
    const el = win.document.getElementById(id);
    if (!el) return 'missing';
    const box = el.getBoundingClientRect();
    return win.getComputedStyle(el).display === 'none' || box.width === 0 ? 'hidden' : 'shown';
  };

  const changedBySnap = [];
  const unsnappable = [];
  let checked = 0;
  let hiddenEmpties = 0;

  for (const variant of everyVariant) {
    let tpl;
    try { tpl = variant.create({}); } catch { continue; } // creation faults are other gates' business
    const image = tpl.fields.filter((f) => f.ftype === 'filelist').map((f) => f.field);
    if (image.length === 0) continue;
    checked += 1;

    // Both halves of the data layer's decision: no picture picked, and one picked.
    for (const picture of ['', PIXEL]) {
      const g = await boot(tpl);
      const values = {};
      for (const field of tpl.fields) values[field.field] = image.includes(field.field) ? picture : 'X';
      g.win.update(JSON.stringify(values));
      const before = image.map((field) => visibility(g.win, field));
      if (picture === '') hiddenEmpties += before.filter((v) => v === 'hidden').length;
      if (!snapLive(g.win)) unsnappable.push(variant.id);
      else {
        image.forEach((field, i) => {
          const after = visibility(g.win, field);
          if (after !== before[i]) {
            changedBySnap.push(variant.id + '#' + field + ': ' + before[i] + ' -> ' + after + (picture ? ' (picture picked)' : ' (no picture)'));
          }
        });
      }
      g.dispose();
    }
  }
  return { checked, changedBySnap, unsnappable, hiddenEmpties };
}`;

test('snapping into a live state never changes what the data fields decided to show', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape'); // the wizard modal — this test drives templates directly

  const report = (await page.evaluate(`(${CHECK})()`)) as {
    checked: number;
    changedBySnap: string[];
    unsnappable: string[];
    hiddenEmpties: number;
  };

  // The sweep is only meaningful if it found the image-bearing designs AND those designs really
  // do hide an empty picture before the snap — that is the state the reset used to destroy.
  expect(report.checked).toBeGreaterThan(20);
  expect(report.hiddenEmpties).toBeGreaterThan(20);
  expect(report.unsnappable, 'designs whose default path snap could not reach').toEqual([]);
  expect(report.changedBySnap, 'fields whose visibility the recovery snap altered').toEqual([]);
});
