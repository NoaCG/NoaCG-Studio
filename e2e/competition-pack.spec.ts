import { enableAdvancedMode, bootstrapGraphic, skipOldEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';

// THE COMPETITION PACK (docs/COMPETITION_PACK.md) — the esports, competition, result and
// reveal graphics.
//
// graphic-types.spec.ts already holds every type to the conformance bar (it parses, it
// validates, its machine is sound, its control events are authored, its fields bind). This
// suite covers what that one cannot: the BEHAVIOUR the pack was built for — every branch and
// its guard, the reset/reuse path, an empty data source, the derived step counts, save/load,
// and the export targets.

const CATEGORIES = ['esports-score', 'matchup', 'results-board', 'reveal'] as const;

/** Boot a hidden iframe running one catalog variant, and return a handle to drive it. */
const HARNESS = `
  async function boot(id, options) {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    document.querySelectorAll('.pack-frame').forEach((f) => f.remove());
    const tpl = variantById(id).create(options || {});
    const f = document.createElement('iframe');
    f.className = 'pack-frame';
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 80));
    return { tpl, win: f.contentWindow, doc: f.contentDocument };
  }
  // Let a dispatched event's timeline settle (they are all well under 700 ms).
  const settle = () => new Promise((r) => setTimeout(r, 700));
`;

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape');
}

test('the pack ships its four categories, and every design creates and validates', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { CATEGORIES } = await import('/src/model/wizard.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const out = { counts: {}, missingCategory: [], problems: [] };
    for (const id of ${JSON.stringify(CATEGORIES)}) {
      const info = CATEGORIES.find((c) => c.id === id);
      if (!info || !info.available) out.missingCategory.push(id);
      const variants = CATALOG[id] ?? [];
      out.counts[id] = variants.length;
      for (const v of variants) {
        const tpl = v.create({});
        const verdict = validateTemplate(tpl);
        if (!verdict.ok) out.problems.push(v.id + ': ' + verdict.errors.map((e) => e.rule).join(','));
        // Every design of the pack is a data block with a machine the runtime can drive.
        const data = parseAnimData(tpl.js);
        if (!data) out.problems.push(v.id + ': no animation data');
        else if (!data.machine) out.problems.push(v.id + ': no machine');
      }
    }
    return out;
  })()`) as { counts: Record<string, number>; missingCategory: string[]; problems: string[] };

  expect(report.problems).toEqual([]);
  expect(report.missingCategory).toEqual([]);
  // Every category carries designs, and every design of every one of them creates, validates and
  // carries a machine - which is the claim. The COUNTS deliberately are not asserted: they moved
  // the moment the (type x family) matrix was filled (docs/KIT_MATRIX_GAPS.md), and a spec that
  // pins today's number fails on catalog growth while catching nothing a missing design would
  // not also trip through `problems`.
  for (const id of CATEGORIES) expect(report.counts[id]).toBeGreaterThan(0);
});

test('the match-up walks neutral -> selected -> locked, and the lock is structural', async ({ page }) => {
  await toApp(page);
  const walk = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('mu01');
    const state = () => win.noacgMachineState().groups.main;
    const winnerOf = () => {
      const el = doc.querySelector('.matchup-win');
      return el ? el.getAttribute('data-side') : null;
    };
    const out = {};
    win.play();
    await settle();
    out.afterPlay = { state: state(), winner: winnerOf() };

    // The pick is DATA: the same event carries either side.
    win.noacgDispatch('select', { f5: 'A' });
    await settle();
    out.selectedA = { state: state(), winner: winnerOf() };

    // Changing the pick is a SELF-transition, not a second state.
    win.noacgDispatch('select', { f5: 'B' });
    await settle();
    out.selectedB = { state: state(), winner: winnerOf() };

    // Clearing goes to its own state and repaints the neutral card.
    win.noacgDispatch('clear');
    await settle();
    out.cleared = { state: state(), winner: winnerOf() };

    win.noacgDispatch('select', { f5: 'A' });
    await settle();
    win.noacgDispatch('lock');
    await settle();
    out.locked = { state: state(), winner: winnerOf(), locked: doc.querySelector('.matchup').classList.contains('matchup-locked') };

    // THE GUARD: no select arrow leaves 'locked', so a late pick is dropped WITH its payload.
    win.noacgDispatch('select', { f5: 'B' });
    await settle();
    out.afterLatePick = { state: state(), winner: winnerOf(), field: doc.getElementById('f5').textContent };
    return out;
  })()`) as Record<string, { state: string; winner: string | null; locked?: boolean; field?: string }>;

  expect(walk.afterPlay.winner).toBe(null);
  expect(walk.selectedA).toMatchObject({ state: 'selected', winner: 'A' });
  expect(walk.selectedB).toMatchObject({ state: 'selected', winner: 'B' });
  expect(walk.cleared).toMatchObject({ state: 'neutral', winner: null });
  expect(walk.locked).toMatchObject({ state: 'locked', winner: 'A', locked: true });
  // The late pick moved nothing — not the pointer, and not the field it carried.
  expect(walk.afterLatePick).toMatchObject({ state: 'locked', winner: 'A', field: 'A' });
});

test('the scorebug runs pre-match -> live -> final, and the pause group is independent', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('es01');
    const root = () => doc.querySelector('.esports-score');
    const status = () => doc.querySelector('.esports-score-status').textContent;
    const groups = () => win.noacgMachineState().groups;
    const out = {};
    win.play();
    await settle();
    out.pre = { phase: groups().phase, pause: groups().pause, status: status() };

    win.noacgDispatch('goLive');
    await settle();
    out.live = { phase: groups().phase, status: status(), cls: root().classList.contains('esports-score-live') };

    // A technical pause moves its OWN pointer and leaves the phase alone.
    win.noacgDispatch('pause');
    await settle();
    out.paused = { phase: groups().phase, pause: groups().pause, status: status() };
    win.noacgDispatch('resume');
    await settle();
    out.resumed = { phase: groups().phase, pause: groups().pause, status: status() };

    win.noacgDispatch('final');
    await settle();
    out.final = { phase: groups().phase, status: status(), cls: root().classList.contains('esports-score-final') };

    // The next map of the series: final -> live again.
    win.noacgDispatch('nextMap');
    await settle();
    out.nextMap = { phase: groups().phase, status: status() };

    // Scores are DATA: writing one repaints a number and moves no pointer anywhere.
    win.update(JSON.stringify({ f1: '2' }));
    await settle();
    out.afterScore = { phase: groups().phase, pause: groups().pause, score: doc.getElementById('f1').textContent };

    // Reset is two operations. The VISUAL half first…
    win.noacgSnap(null);
    await settle();
    out.afterSnap = { phase: groups().phase, score: doc.getElementById('f1').textContent };
    // …and a replay clears the marks the last run left.
    win.play();
    await settle();
    out.afterReplay = { phase: groups().phase, status: status(), cls: root().className };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.pre).toMatchObject({ phase: 'pre', pause: 'running', status: 'PRE-MATCH' });
  expect(run.live).toMatchObject({ phase: 'live', status: 'LIVE', cls: true });
  expect(run.paused).toMatchObject({ phase: 'live', pause: 'paused', status: 'PAUSE' });
  expect(run.resumed).toMatchObject({ phase: 'live', pause: 'running', status: 'LIVE' });
  expect(run.final).toMatchObject({ phase: 'final', status: 'FINAL', cls: true });
  expect(run.nextMap).toMatchObject({ phase: 'live', status: 'LIVE' });
  // The score write repainted the digit and moved neither pointer.
  expect(run.afterScore).toMatchObject({ phase: 'live', pause: 'running', score: '2' });
  // Snap resets the visual state; the DATA survives it, because they are two operations.
  expect(run.afterSnap).toMatchObject({ phase: 'pre', score: '2' });
  expect(run.afterReplay).toMatchObject({ phase: 'pre', status: 'PRE-MATCH' });
  expect(String(run.afterReplay.cls)).not.toContain('esports-score-final');
});

test('map veto and tabletop initiative reuse parameterized machines with snap recovery', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const veto = await boot('mr04');
    veto.win.play();
    await settle();
    const vetoMarks = () => [...veto.doc.querySelectorAll('.esports-score-row-mark')]
      .map((el) => el.textContent);
    const vetoCurrent = () => veto.doc.querySelector('.esports-score-current')?.getAttribute('data-map') || null;
    const out = {
      vetoDefaults: {
        title: veto.doc.getElementById('f0').textContent,
        rows: vetoMarks(),
      },
    };

    veto.win.noacgDispatch('advance', { f2: '3' });
    await settle();
    out.vetoAdvanced = {
      state: veto.win.noacgMachineState().groups.main,
      row: vetoCurrent(),
    };
    veto.win.noacgDispatch('seriesFinal');
    await settle();
    out.vetoComplete = {
      state: veto.win.noacgMachineState().groups.main,
      cls: veto.doc.querySelector('.esports-score').classList.contains('esports-score-decided'),
    };

    // Recovery is instant: the cursor state repaints from the operator's current-row field.
    veto.win.update(JSON.stringify({ f2: '2' }));
    veto.win.noacgSnap({ main: 'advanced' }, { timers: false });
    out.vetoSnap = {
      state: veto.win.noacgMachineState().groups.main,
      row: vetoCurrent(),
    };

    const turn = await boot('rs04');
    turn.win.play();
    await settle();
    const focused = () => turn.doc.querySelector('.results-board-row-on')?.getAttribute('data-row') || null;
    out.turnDefaults = {
      title: turn.doc.getElementById('f0').textContent,
      encounter: turn.doc.getElementById('f1').textContent,
      names: [...turn.doc.querySelectorAll('.results-board-row-name')].map((el) => el.textContent),
      notes: [...turn.doc.querySelectorAll('.results-board-row-note')].map((el) => el.textContent),
    };

    turn.win.noacgDispatch('spotlight', { f3: '3' });
    await settle();
    out.turnMoved = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    turn.win.update(JSON.stringify({ f3: '4' }));
    turn.win.noacgSnap({ main: 'spotlight' }, { timers: false });
    out.turnSnap = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    turn.win.noacgDispatch('clear');
    await settle();
    out.turnCleared = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.vetoDefaults).toMatchObject({
    title: 'MAP VETO - GRAND FINAL',
    rows: [
      'BAN - TEAM LIQUID',
      'BAN - NATUS VINCERE',
      'PICK - TEAM LIQUID',
      'PICK - NATUS VINCERE',
      'PENDING',
    ],
  });
  expect(run.vetoAdvanced).toMatchObject({ state: 'advanced', row: '3' });
  expect(run.vetoComplete).toMatchObject({ state: 'decided', cls: true });
  expect(run.vetoSnap).toMatchObject({ state: 'advanced', row: '2' });
  expect(run.turnDefaults).toMatchObject({
    title: 'INITIATIVE ORDER',
    encounter: 'THE SUNKEN CITADEL - LOWER VAULT',
    names: [
      'SERAPHINA MOONWHISPER',
      'CAPTAIN ALDRIC VON STURM',
      'ANCIENT CRIMSON OWLBEAR',
      'THANE IRONHEART',
    ],
    notes: ['18 HP', 'CONCENTRATING', 'BLOODIED', 'DODGING'],
  });
  expect(run.turnMoved).toMatchObject({ state: 'spotlight', row: '3' });
  expect(run.turnSnap).toMatchObject({ state: 'spotlight', row: '4' });
  expect(run.turnCleared).toMatchObject({ state: 'level', row: null });
});

test('the verdict card is ONE judged state carrying either ruling', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('vd01');
    const root = () => doc.querySelector('.reveal');
    const mark = () => doc.querySelector('.reveal-mark').textContent;
    const out = {};
    win.play();
    await settle();
    out.unjudged = { state: win.noacgMachineState().groups.main, mark: mark() };

    win.noacgDispatch('judge', { f3: 'correct' });
    await settle();
    out.correct = { state: win.noacgMachineState().groups.main, mark: mark(), cls: root().classList.contains('reveal-correct') };

    // A correction: the same state, the other value.
    win.noacgDispatch('judge', { f3: 'incorrect' });
    await settle();
    out.incorrect = {
      state: win.noacgMachineState().groups.main,
      mark: mark(),
      correctCls: root().classList.contains('reveal-correct'),
      incorrectCls: root().classList.contains('reveal-incorrect'),
    };

    win.noacgDispatch('clear');
    await settle();
    out.cleared = { state: win.noacgMachineState().groups.main, mark: mark(), cls: root().className };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.unjudged).toMatchObject({ mark: '' });
  expect(run.correct).toMatchObject({ state: 'judged', mark: '✓', cls: true });
  expect(run.incorrect).toMatchObject({ state: 'judged', mark: '✕', correctCls: false, incorrectCls: true });
  expect(run.cleared).toMatchObject({ state: 'unjudged', mark: '' });
  expect(String(run.cleared.cls)).not.toContain('reveal-incorrect');
});

test('the nominee reveal holds for suspense and then names the winner from its field', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { tpl, win, doc } = await boot('nm01');
    const wonName = () => {
      const el = doc.querySelector('.reveal-won .reveal-nominee-name');
      return el ? el.textContent : null;
    };
    const out = { steps: tpl.settings.steps };
    win.play();
    await settle();
    out.nominees = doc.querySelectorAll('.reveal-nominee').length;

    win.noacgDispatch('suspense');
    await settle();
    out.suspense = doc.querySelector('.reveal').classList.contains('reveal-suspense');

    // The winner is DATA — the reveal carries whichever nominee the field names.
    win.noacgDispatch('reveal', { f3: '3' });
    await settle();
    out.revealed = { won: wonName(), out: doc.querySelectorAll('.reveal-out').length };

    // A replay starts from the nominees again: the reveal's marks AND its inline styles go.
    win.play();
    await settle();
    out.afterReplay = { won: wonName(), revealed: doc.querySelector('.reveal').classList.contains('reveal-revealed') };
    return out;
  })()`) as { steps: string; nominees: number; suspense: boolean; revealed: { won: string; out: number }; afterReplay: { won: string | null; revealed: boolean } };

  // In + Reveal + Out is three steps, so SPX gets two presses — DERIVED, never hard-coded.
  expect(run.steps).toBe('2');
  expect(run.nominees).toBe(4);
  expect(run.suspense).toBe(true);
  expect(run.revealed.won).toBe('M0NESY');
  expect(run.revealed.out).toBe(3);
  expect(run.afterReplay).toMatchObject({ won: null, revealed: false });
});

test('next() alone still walks a reveal card end to end (the playout-server contract)', async ({ page }) => {
  await toApp(page);
  const walk = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('wn01');
    const shown = () => doc.querySelector('.reveal').classList.contains('reveal-result-shown');
    win.play();
    await settle();
    const before = shown();
    const first = win.next();
    await settle();
    const after = shown();
    win.stop();
    await settle();
    return { before, after, advanced: first !== null, opacity: doc.querySelector('.reveal').style.opacity };
  })()`) as { before: boolean; after: boolean; advanced: boolean; opacity: string };

  expect(walk.before).toBe(false);
  expect(walk.advanced).toBe(true);
  expect(walk.after).toBe(true);
  expect(walk.opacity).toBe('0'); // stop() takes it fully off air, ready to play again
});

test('the boards spotlight a row from data, and a decided table survives a replay clean', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('st01');
    const lit = () => {
      const el = doc.querySelector('.results-board-row-on');
      return el ? el.getAttribute('data-row') : null;
    };
    const out = {};
    win.play();
    await settle();
    out.rows = doc.querySelectorAll('.results-board-row').length;
    out.columns = doc.querySelectorAll('.results-board-col').length;

    win.noacgDispatch('highlight', { f4: '2' });
    await settle();
    out.highlighted = { state: win.noacgMachineState().groups.main, row: lit() };

    // Moving the highlight is the same state with a new number.
    win.noacgDispatch('highlight', { f4: '4' });
    await settle();
    out.moved = { state: win.noacgMachineState().groups.main, row: lit() };

    win.noacgDispatch('final');
    await settle();
    out.final = { state: win.noacgMachineState().groups.main, cls: doc.querySelector('.results-board').classList.contains('results-board-final') };

    win.play();
    await settle();
    out.afterReplay = { row: lit(), cls: doc.querySelector('.results-board').className };
    return out;
  })()`) as Record<string, Record<string, unknown> | number>;

  expect(run.rows).toBe(5);
  expect(run.columns).toBe(4);
  expect(run.highlighted).toMatchObject({ state: 'highlighted', row: '2' });
  expect(run.moved).toMatchObject({ state: 'highlighted', row: '4' });
  expect(run.final).toMatchObject({ state: 'final', cls: true });
  expect((run.afterReplay as Record<string, unknown>).row).toBe(null);
  expect(String((run.afterReplay as Record<string, unknown>).cls)).not.toContain('results-board-final');
});

test('a board with no data, and an image field with no file, degrade quietly', async ({ page }) => {
  await toApp(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('rs01');
    win.play();
    await settle();
    // Empty the rows source the way an operator would, mid-show.
    win.update(JSON.stringify({ f2: '' }));
    await settle();
    const emptied = { rows: doc.querySelectorAll('.results-board-row').length, html: doc.getElementById('results-board-rows').innerHTML };
    // A spotlight that names a row which no longer exists must not throw or lie.
    win.noacgDispatch('spotlight', { f3: '3' });
    await settle();
    const afterGhost = { spotlit: doc.querySelector('.results-board').classList.contains('results-board-spotlit') };
    // The crest slot with no file: hidden image, no broken icon, placeholder styling intact.
    const img = doc.getElementById('f4');
    const slot = { display: img.style.display, hasSrc: img.hasAttribute('src'), parentHasImage: img.parentNode.classList.contains('has-image') };
    // And a file that IS picked shows up.
    win.update(JSON.stringify({ f4: 'images/crest.png' }));
    await settle();
    const withFile = { hasSrc: img.hasAttribute('src'), parentHasImage: img.parentNode.classList.contains('has-image') };
    return { emptied, afterGhost, slot, withFile };
  })()`) as {
    emptied: { rows: number; html: string };
    afterGhost: { spotlit: boolean };
    slot: { display: string; hasSrc: boolean; parentHasImage: boolean };
    withFile: { hasSrc: boolean; parentHasImage: boolean };
  };

  expect(run.emptied.rows).toBe(0);
  expect(run.emptied.html).toBe('');
  // No row to spotlight = no spotlight, rather than a board dimmed with nothing lit.
  expect(run.afterGhost.spotlit).toBe(false);
  expect(run.slot).toMatchObject({ display: 'none', hasSrc: false, parentHasImage: false });
  expect(run.withFile).toMatchObject({ hasSrc: true, parentHasImage: true });
  expect(errors).toEqual([]);
});

test('every design exports to all six targets with its runtime intact', async ({ page }) => {
  test.setTimeout(240_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const problems = [];
    let packages = 0;
    // What "every design" means is READ from the catalog, so the assertion below stays "each of
    // them built for each target" rather than "there are still 44 of them".
    let expected = 0;
    for (const id of ${JSON.stringify(CATEGORIES)}) expected += (CATALOG[id] ?? []).length * EXPORT_TARGETS.length;
    for (const id of ${JSON.stringify(CATEGORIES)}) {
      for (const variant of CATALOG[id] ?? []) {
        const tpl = variant.create({});
        for (const target of EXPORT_TARGETS) {
          try {
            const zip = await target.build(tpl);
            const names = Object.keys(zip.files);
            packages++;
            // Every package must carry the graphic's own JS somewhere — the machine engine
            // and the design runtime travel with it or the export is a picture.
            const js = names.filter((n) => n.endsWith('.js') || n.endsWith('.html'));
            if (js.length === 0) problems.push(variant.id + '/' + target.id + ': no html or js in the package');
          } catch (e) {
            problems.push(variant.id + '/' + target.id + ': ' + String(e));
          }
        }
      }
    }
    return { problems, packages, expected };
  })()`) as { problems: string[]; packages: number; expected: number };

  expect(report.problems).toEqual([]);
  expect(report.packages).toBe(report.expected);
  expect(report.expected).toBeGreaterThan(0);
});

test('a pack graphic saves to the library and reloads with its machine and marks working', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'reveal', name: 'House Award' });
  const round = await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createGraphic, graphicById } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const before = useTemplateStore.getState().template;
    const doc = createGraphic(before, { name: 'Award reveal', baseline: before }).doc;
    const reloaded = graphicById(doc.id);
    const tpl = reloaded.template;
    const data = parseAnimData(tpl.js);

    // Boot the RELOADED template and run its moment, to prove the round trip kept the runtime.
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 120));
    const win = f.contentWindow;
    win.play();
    await new Promise((r) => setTimeout(r, 700));
    win.next();
    await new Promise((r) => setTimeout(r, 700));
    const opened = f.contentDocument.querySelector('.reveal').classList.contains('reveal-open');
    win.noacgDispatch('celebrate');
    await new Promise((r) => setTimeout(r, 700));
    return {
      sameHtml: tpl.html === before.html,
      sameJs: tpl.js === before.js,
      events: data.machine.groups[0].transitions.filter((t) => t.trigger === 'operator').map((t) => t.event).sort(),
      steps: tpl.settings.steps,
      opened,
      state: win.noacgMachineState().groups.main,
    };
  })()`) as { sameHtml: boolean; sameJs: boolean; events: string[]; steps: string; opened: boolean; state: string };

  expect(round.sameHtml).toBe(true);
  expect(round.sameJs).toBe(true);
  expect(round.steps).toBe('2');
  expect([...new Set(round.events)].sort()).toEqual(['celebrate', 'next', 'open', 'settle']);
  expect(round.opened).toBe(true);
  expect(round.state).toBe('celebrating');
});

test('the pack is discoverable in the wizard and creates from a category card', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'esports-score', name: 'House Series' });
  const frame = page.frameLocator('iframe.preview-frame');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect.poll(async () => frame.locator('.esports-score').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await expect(frame.locator('#f0')).toHaveText('TEAM LIQUID');
  // The generated control page's buttons come from the machine — the phase events are there.
  const events = await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { allOperatorEvents } = await import('/src/blocks/animMachine.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js);
    return allOperatorEvents(data.machine).sort();
  })()`) as string[];
  expect(events).toEqual(['final', 'goLive', 'nextMap', 'pause', 'resume']);
});
