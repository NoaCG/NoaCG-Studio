import { createProject, enableAdvancedMode } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { awaitPreviewRebuild } from './_preview';
import { test, expect, type Page } from '@playwright/test';
import JSZip from 'jszip';

// The public-service pack: tickers, alerts and public-information panels.
//
// These templates make claims an ordinary catalog check cannot verify. A ticker claims to
// TRAVEL and to LOOP; an alert claims four severity STATES an operator drives on air; a
// two-language panel claims to alternate on its own and to be holdable. This spec drives the
// real emitted templates in a live iframe and checks each claim against what the graphic
// actually does — because "it renders and validates" would pass just as happily for a static
// strip wearing a ticker's name.
//
// It deliberately does not re-prove the shared machinery (the data-block interpreter, the
// preset bank, the export packaging): anim-engine, timeline-v2 and exports already do.

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape'); // close the creation wizard — these tests run in-page
}

/** Runs in the page: build a catalog variant and boot it into a hidden iframe. */
const HARNESS = `
  async function build(id, options) {
    const { variantById } = await import('/src/templates/catalog.ts');
    const v = variantById(id);
    if (!v) throw new Error('no variant ' + id);
    return v.create(options || {});
  }
  async function boot(tpl) {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 80));
    return f.contentWindow;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const opacity = (w, sel) => Number(w.getComputedStyle(w.document.querySelector(sel)).opacity);
  const trackX = (w) => {
    const el = w.document.querySelector('#ticker-track');
    const m = new w.DOMMatrixReadOnly(w.getComputedStyle(el).transform);
    return m.m41;
  };
  /** Poll until the read matches, or give up and return what it is — animations run on real
   *  wall time here, so a fixed sleep would make these a race rather than a check. */
  async function settled(read, want, budgetMs) {
    budgetMs = budgetMs || 4000;
    for (var waited = 0; waited < budgetMs; waited += 40) {
      if (read() === want) return read();
      await sleep(40);
    }
    return read();
  }
`;

// ── Tickers: travel, loop, speed, item lengths ───────────────────────────────

test('a ticker actually travels, loops endlessly, and answers the speed knob', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const out = {};
    for (const speed of [1, 1.5]) {
      const tpl = await build('tk11', { animation: { speed } });
      const w = await boot(tpl);
      w.play();
      await sleep(160);                    // let the strip's fade finish and the travel start
      const a = trackX(w);
      await sleep(700);
      const b = trackX(w);
      const tween = w.gsap.getTweensOf(w.document.querySelector('#ticker-track'))[0];
      out['s' + speed] = {
        moved: a - b,                      // travel is right-to-left, so a > b
        repeat: tween ? tween.repeat() : null,
        ease: tween ? String(tween.vars.ease) : null,
        // The set is rendered twice, which is what makes one set-width of travel seamless.
        items: w.document.querySelectorAll('.ticker-item').length,
      };
    }
    return out;
  })()`)) as Record<string, { moved: number; repeat: number | null; ease: string | null; items: number }>;

  // It moves, leftward, by a real distance.
  expect(r.s1.moved).toBeGreaterThan(40);
  // It loops for ever and never eases — the travel doctrine (DESIGN_LANGUAGE §4).
  expect(r.s1.repeat).toBe(-1);
  expect(r.s1.ease).toBe('none');
  // Four authored stories, rendered twice = eight items in the track.
  expect(r.s1.items).toBe(8);
  // The speed knob is real: 1.5× covers meaningfully more ground in the same window.
  expect(r['s1.5'].moved).toBeGreaterThan(r.s1.moved * 1.25);
});

test('a rotating ticker advances on its own timer and answers pause / resume / next', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    // Speed 1.5 shortens the type's 3.2s hold enough for a test to sit through two beats.
    const tpl = await build('tk18', { animation: { speed: 1.5 } });
    const w = await boot(tpl);
    const shown = () => w.document.querySelector('#ticker-track').textContent.trim();
    w.play();
    await sleep(200);
    const first = shown();
    // It advances with nobody pressing anything.
    await settled(() => shown() !== first, true, 6000);
    const afterTimer = shown();
    // Pause freezes it: the cycling state's armed timer is cancelled on the way out.
    w.noacgDispatch('pause');
    await sleep(200);
    const paused = shown();
    await sleep(3500);
    const stillPaused = shown();
    // Resume starts it moving again, and skip jumps ahead at once.
    w.noacgDispatch('resume');
    await sleep(150);
    w.noacgDispatch('skip');
    await sleep(500);
    return {
      first, afterTimer, paused, stillPaused, afterSkip: shown(),
      state: w.noacgMachineState().groups.main,
      // The name column the design splits each item into.
      hasServiceColumn: !!w.document.querySelector('.ticker-service'),
    };
  })()`)) as Record<string, string> & { hasServiceColumn: boolean };

  expect(r.first).not.toBe('');
  expect(r.afterTimer).not.toBe(r.first);   // the timer fired with no operator input
  expect(r.stillPaused).toBe(r.paused);     // and stopped firing once held
  expect(r.afterSkip).not.toBe(r.paused);   // resume + skip moved it on
  expect(r.hasServiceColumn).toBe(true);
});

test('tickers survive both extremes of item length: one very long story, and forty short ones', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const long = 'A single extremely long public notice that keeps going well past any sensible headline length in order to prove that the strip neither clips it nor lets it push the graphic off the frame, and then keeps going a little further still.';
    const many = Array.from({ length: 40 }, (_, i) => 'Short item number ' + (i + 1)).join('\\n');
    const out = {};
    // A CRAWL: the long story must travel past rather than wrap or overflow the frame.
    for (const [key, items] of [['crawlLong', long], ['crawlMany', many]]) {
      const tpl = await build('tk15');
      const w = await boot(tpl);
      w.update(JSON.stringify({ f0: items }));
      w.play();
      await sleep(250);
      const box = w.document.querySelector('.ticker-box').getBoundingClientRect();
      const view = w.document.querySelector('.ticker-viewport').getBoundingClientRect();
      out[key] = {
        boxWithinFrame: box.left >= -1 && box.right <= 1921 && box.top >= -1 && box.bottom <= 1081,
        // The strip clips its travel: the track is wider than its window, and that is fine.
        trackWider: w.document.querySelector('#ticker-track').scrollWidth > view.width,
        viewportClips: w.getComputedStyle(w.document.querySelector('.ticker-viewport')).overflow === 'hidden',
        moves: true,
      };
    }
    // A ROTATOR: the long story has nowhere to travel to, so it must WRAP and the strip grow.
    const tpl = await build('tk19');
    const w = await boot(tpl);
    w.update(JSON.stringify({ f0: long }));
    w.play();
    await sleep(250);
    const box = w.document.querySelector('.ticker-box').getBoundingClientRect();
    const item = w.document.querySelector('.ticker-item').getBoundingClientRect();
    out.rotatorLong = {
      wrapped: item.height > 60,             // more than one line of 28px type
      itemInsideBox: item.bottom <= box.bottom + 1 && item.right <= box.right + 1,
      boxWithinFrame: box.left >= -1 && box.right <= 1921 && box.top >= -1 && box.bottom <= 1081,
    };
    return out;
  })()`)) as Record<string, Record<string, boolean>>;

  for (const key of ['crawlLong', 'crawlMany']) {
    expect(r[key].boxWithinFrame, key).toBe(true);
    expect(r[key].trackWider, key).toBe(true);
    expect(r[key].viewportClips, key).toBe(true);
  }
  // The rotator does the opposite of the crawl, on purpose: it grows to fit.
  expect(r.rotatorLong.wrapped).toBe(true);
  expect(r.rotatorLong.itemInsideBox).toBe(true);
  expect(r.rotatorLong.boxWithinFrame).toBe(true);
});

// ── The KICKER (docs/TICKERS.md): the one mark a ticker's single field carries. These drive
// the EMITTED runtime rather than the parser - scripts/ticker-parser.test.mjs already runs the
// parser itself - because what has to hold is that the tag reaches the screen, keeps reaching
// it when the show switches design, and never eats a score or a clock.

test('a kicker is drawn on the strip, and one typed alone tags every story under it', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const tpl = await build('tk05');
    const w = await boot(tpl);
    w.update(JSON.stringify({ f0: [
      'SPORT: United win 3-0',
      'WEATHER:',
      'Storm warning issued for the coast',
      'Ferries cancelled until Thursday',
      '',
      'Full results after the break',
    ].join('\\n') }));
    w.play();
    await sleep(200);
    // The marquee renders the set twice for its seamless loop, so read the first set only.
    const items = Array.from(w.document.querySelectorAll('.ticker-item')).slice(0, 4);
    const kicker = w.document.querySelector('.ticker-kicker');
    return {
      kickers: items.map((el) => (el.querySelector('.ticker-kicker') || {}).textContent || ''),
      // The story survives intact beside its tag - the kicker is added, never substituted.
      firstStory: items[0].textContent,
      // A tag nobody can tell apart from the story is not a tag: read both colours off the
      // rendered frame rather than trusting the stylesheet to have been applied.
      kickerColour: w.getComputedStyle(kicker).color,
      storyColour: w.getComputedStyle(items[0]).color,
      // The tag rides INSIDE the item, which is what makes it travel with it.
      insideItem: !!items[0].querySelector('.ticker-kicker'),
    };
  })()`)) as { kickers: string[]; firstStory: string; kickerColour: string; storyColour: string; insideItem: boolean };

  // One inline kicker, then a kicker typed alone tagging BOTH stories beneath it, then a
  // blank line closing it so the last story carries no tag at all.
  expect(r.kickers).toEqual(['SPORT', 'WEATHER', 'WEATHER', '']);
  expect(r.firstStory).toContain('United win 3-0');
  expect(r.insideItem).toBe(true);
  // Drawn in the accent, which is the shared treatment every design gets for free - so the
  // tag reads as a different thing from the story beside it.
  expect(r.kickerColour).not.toBe(r.storyColour);
});

// THE DESIGN SET IS DISCOVERED, NEVER LISTED - the same rule the counting sweep states, for the
// same reason. The three tests around this one name tk05, tk13 and tk18 because each is making a
// point about that design. None of them is a claim about the CATEGORY, and the category is where
// the mark broke: the tag used to be glued onto the front of the story and the whole string
// handed to the strip's own row builder, which works only while a builder treats what it is
// handed as opaque. Six of the twenty-two read it - to find a price move, a score, a language
// break - so they matched their pattern against the SPAN. On tk14 "Market Board" the pattern took
// the tag's markup for an instrument and cut it inside the class attribute, and a viewer read
// class="ticker-kicker">OMXH25 scrolling across the strip (owner walk, 2026-08-28; tk04 and tk22
// broke the same way, tk06, tk13 and tk17 were one rundown away). Nothing in the tree measured
// it, because nothing asked the question of every design at once.
//
// THE RUNDOWN IS THE ONE THAT BREAKS THEM, not a friendly one: a short tag, a colon, and a story
// that still looks like the design's own content. And the reading is what a VIEWER sees - markup
// leaking into a strip shows up as text, which is the only symptom that matters.
test('every ticker design draws the tag as a tag, with no markup reaching the strip', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const rows = (await page.evaluate(`(async () => {
    ${HARNESS}
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const out = [];
    for (const variant of CATALOG.ticker || []) {
      const w = await boot(variant.create({}));
      w.update(JSON.stringify({ f0: 'OMXH25: 4218.60 +1.24%\\nMARKET REPORT: DAX 18422.15 -0.31%' }));
      w.play();
      await sleep(200);
      const track = w.document.getElementById('ticker-track');
      // A rotator shows one item at a time, so read whatever is in the track rather than
      // assuming both lines are on screen.
      const tag = track.querySelector('.ticker-kicker, .ticker-service');
      out.push({
        id: variant.id,
        read: (track.textContent || '').trim(),
        tag: tag ? (tag.textContent || '').trim() : null,
        story: (track.textContent || '').indexOf('4218.60') >= 0 || (track.textContent || '').indexOf('18422.15') >= 0,
      });
    }
    return out;
  })()`)) as { id: string; read: string; tag: string | null; story: boolean }[];

  // The floor, for the reason every sweep in this repo states it: a discovery pass that
  // discovers nothing passes every assertion under it. 22 ticker designs on 2026-09-03.
  expect(rows.length, 'ticker designs swept').toBeGreaterThan(15);

  // THE DEFECT: markup a viewer can read. An attribute, a tag name or an angle bracket in the
  // strip's own text is the whole symptom, on any design, whatever produced it.
  expect(
    rows.filter((r) => /class=|<span|ticker-kicker"?>/.test(r.read))
      .map((r) => `${r.id} airs markup: "${r.read.slice(0, 80)}"`),
    'ticker designs leaking markup into the strip',
  ).toEqual([]);

  // The mark still WORKS on every one of them - a strip that quietly dropped the tag would pass
  // the check above by showing nothing at all.
  expect(
    rows.filter((r) => r.tag !== 'OMXH25' && r.tag !== 'MARKET REPORT')
      .map((r) => `${r.id} drew its tag as ${JSON.stringify(r.tag)}`),
    'ticker designs not drawing the typed tag',
  ).toEqual([]);

  // …and the story is still beside it, not swallowed by the tag.
  expect(
    rows.filter((r) => !r.story).map((r) => `${r.id} lost the story beside its tag`),
    'ticker designs dropping the story',
  ).toEqual([]);
});

test('the same rundown keeps its tags in a design that draws them its own way', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    // The portability claim, measured: ONE rundown, two designs. tk05 draws the shared inline
    // tag; tk18 takes renderTickerKicked() and gives it a column. Before the mark existed,
    // tk18's service name was an em dash nothing else could read.
    const rundown = 'Northern line: delays of up to 20 minutes';
    const out = {};
    for (const id of ['tk05', 'tk18']) {
      const tpl = await build(id);
      const w = await boot(tpl);
      w.update(JSON.stringify({ f0: rundown }));
      w.play();
      await sleep(250);
      const tag = w.document.querySelector('.ticker-kicker, .ticker-service');
      out[id] = {
        tag: tag ? tag.textContent : null,
        story: w.document.querySelector('.ticker-item').textContent,
      };
    }
    return out;
  })()`)) as Record<string, { tag: string | null; story: string }>;

  for (const id of ['tk05', 'tk18']) {
    expect(r[id].tag, id).toBe('Northern line');
    expect(r[id].story, id).toContain('delays of up to 20 minutes');
    // The tag is not repeated inside the story text - it was lifted out, not duplicated.
    expect(r[id].story.indexOf('Northern line'), id).toBe(r[id].story.lastIndexOf('Northern line'));
  }
});

test('a score, a clock and a link are not kickers - the colon needs a space after it', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    // Every one of these ships in a real sample today. A length guard alone - which is all the
    // credit roll's colon rule has - would have made a tag of each.
    const tpl = await build('tk13');
    const w = await boot(tpl);
    w.update(JSON.stringify({ f0: [
      'NORTHERN UNITED 2:1 CITY ROVERS',
      'Polling stations close at 20:00',
      'Full results at https://example.org/results',
      'TRAVEL: the 20:45 service is cancelled',
    ].join('\\n') }));
    w.play();
    await sleep(200);
    const items = Array.from(w.document.querySelectorAll('.ticker-item')).slice(0, 4);
    return {
      kickers: items.map((el) => (el.querySelector('.ticker-kicker') || {}).textContent || ''),
      texts: items.map((el) => el.textContent),
      // The fixture's own score chip still works: the parser left the line alone.
      scoreChip: (w.document.querySelector('.ticker-score') || {}).textContent || null,
    };
  })()`)) as { kickers: string[]; texts: string[]; scoreChip: string | null };

  expect(r.kickers).toEqual(['', '', '', 'TRAVEL']);
  expect(r.texts[0]).toContain('CITY ROVERS');
  expect(r.texts[1]).toContain('20:00');
  expect(r.texts[2]).toContain('https://example.org/results');
  // …and the real tag on the fourth line survived the clock later in the same line.
  expect(r.texts[3]).toContain('20:45');
  expect(r.scoreChip).toBe('2:1');
});

test('the bilingual crawl splits both languages, and passes an untranslated item through whole', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const tpl = await build('tk17');
    const w = await boot(tpl);
    // Two translated items and one that has not been translated yet — the real newsroom case.
    w.update(JSON.stringify({ f0: [
      'Polling stations close at 20:00 | Vaalihuoneistot sulkeutuvat klo 20.00',
      'Bring photo identification | 写真付きの身分証明書をお持ちください',
      'Results follow at 21:00',
    ].join('\\n') }));
    w.play();
    await sleep(200);
    const items = Array.from(w.document.querySelectorAll('.ticker-item'));
    // The track renders the set twice for the loop; the first half is the authored order.
    const first = items.slice(0, 3);
    return {
      dividers: first.map((el) => el.querySelectorAll('.ticker-divider').length),
      texts: first.map((el) => el.textContent),
      // Neither language is dimmed: same computed colour on both halves of an item.
      colour: w.getComputedStyle(first[0]).color,
      dimColour: w.getComputedStyle(w.document.querySelector('.ticker-sep')).color,
    };
  })()`)) as { dividers: number[]; texts: string[]; colour: string; dimColour: string };

  expect(r.dividers).toEqual([1, 1, 0]);            // two split, the untranslated one whole
  expect(r.texts[1]).toContain('写真付きの身分証明書');  // non-Latin text survives intact
  expect(r.texts[2]).toContain('Results follow at 21:00');
  expect(r.colour).not.toBe(r.dimColour);           // the item ink is the primary one
});

// ── Alerts: the severity states are real ─────────────────────────────────────

test('an alert’s severity states are real: every level reachable, exactly one shown, word and colour agree', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const tpl = await build('al01');
    const w = await boot(tpl);
    w.play();
    await sleep(300);
    const sels = ['.alert-level-1', '.alert-level-2', '.alert-level-3', '.alert-level-4'];
    const shown = () => sels.map((s) => Math.round(opacity(w, s)));
    const out = { rest: shown(), restState: w.noacgMachineState().groups.level, steps: [] };
    // Walk the ramp up and back down, and jump two levels at once — an operator reading a
    // wire feed does all three.
    for (const ev of ['warning', 'emergency', 'advisory', 'watch', 'emergency', 'advisory']) {
      w.noacgDispatch(ev);
      await sleep(420);
      out.steps.push({ ev, shown: shown(), state: w.noacgMachineState().groups.level });
    }
    // The word on the visible slab, and its fill — colour must never be the only carrier.
    const at = out.steps[out.steps.length - 1].shown.indexOf(1);
    const el = w.document.querySelector(sels[at]);
    out.visibleWord = el.textContent.trim();
    out.visibleFill = w.getComputedStyle(el).backgroundColor;
    // play() re-establishes the resting level even after an escalation (the rest pose).
    w.noacgDispatch('emergency');
    await sleep(420);
    w.stop(); await sleep(400);
    w.play(); await sleep(400);
    out.afterReplay = shown();
    out.afterReplayState = w.noacgMachineState().groups.level;
    // The visual half of reset lands on the same picture.
    w.noacgDispatch('warning'); await sleep(420);
    w.noacgSnap(null, { timers: false }); await sleep(200);
    out.afterSnap = shown();
    return out;
  })()`)) as {
    rest: number[]; restState: string; visibleWord: string; visibleFill: string;
    steps: { ev: string; shown: number[]; state: string }[];
    afterReplay: number[]; afterReplayState: string; afterSnap: number[];
  };

  // It rests on the lowest level, and exactly one slab is ever painted.
  expect(r.rest).toEqual([1, 0, 0, 0]);
  expect(r.restState).toBe('advisory');
  const expected: Record<string, number[]> = {
    advisory: [1, 0, 0, 0], watch: [0, 1, 0, 0], warning: [0, 0, 1, 0], emergency: [0, 0, 0, 1],
  };
  for (const step of r.steps) {
    expect(step.state, step.ev).toBe(step.ev);           // the pointer went where it was told
    expect(step.shown, step.ev).toEqual(expected[step.ev]); // and so did the picture
  }
  // The level is spelled out, not merely coloured.
  expect(r.visibleWord).toBe('Advisory');
  expect(r.visibleFill).toBe('rgb(31, 95, 168)');
  // A replay and a visual reset both return to the resting level — no stale severity.
  expect(r.afterReplay).toEqual([1, 0, 0, 0]);
  expect(r.afterReplayState).toBe('advisory');
  expect(r.afterSnap).toEqual([1, 0, 0, 0]);
});

test('the alerts that claim no states have none, and the ones that do put them on the control page', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { eventButtons } = await import('/src/control/controlModel.ts');
    const out = {};
    for (const id of ['al01','al02','al03','al04','al05','al06','al07','al08','al09','al10']) {
      const tpl = variantById(id).create({});
      const data = parseAnimData(tpl.js);
      const level = data?.machine?.groups?.find((g) => g.id === 'level');
      out[id] = {
        hasFlag: tpl.html.includes('alert-flag'),
        levels: level ? level.states.map((s) => s.id) : null,
        buttons: (eventButtons(tpl.js) || []).map((b) => b.event),
      };
    }
    return out;
  })()`)) as Record<string, { hasFlag: boolean; levels: string[] | null; buttons: string[] }>;

  const withStates = ['al01', 'al02', 'al03', 'al04', 'al05', 'al06'];
  const withoutStates = ['al07', 'al08', 'al09', 'al10'];
  for (const id of withStates) {
    expect(r[id].hasFlag, id).toBe(true);
    expect(r[id].levels, id).toEqual(['advisory', 'watch', 'warning', 'emergency']);
    // A severity state nobody can reach from a control page is a claim, not a feature.
    expect(r[id].buttons, id).toEqual(['advisory', 'watch', 'warning', 'emergency']);
  }
  for (const id of withoutStates) {
    // The honesty rule: no flag, no machine, no buttons that would do nothing.
    expect(r[id].hasFlag, id).toBe(false);
    expect(r[id].levels, id).toBeNull();
    expect(r[id].buttons, id).toEqual([]);
  }
});

// ── Public information: the language machine ─────────────────────────────────

test('a two-language notice alternates on its own, holds where it is told, and greys the language already up', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { eventLegality, isEventLegal } = await import('/src/control/controlModel.ts');
    // Speed 1.5 shortens the type's 7s hold; the machine divides timers by speed.
    const tpl = variantById('pi08').create({ animation: { speed: 1.5 } });
    // The same precomputed guard a control page greys its buttons from.
    const legality = eventLegality(tpl.js);
    const w = await boot(tpl);
    const langs = () => [Math.round(opacity(w, '.public-info-lang-1')), Math.round(opacity(w, '.public-info-lang-2'))];
    const groups = () => w.noacgMachineState().groups;
    w.play();
    await sleep(300);
    const out = { rest: langs(), restLegal: {
      lang1: isEventLegal(legality, 'lang1', w.noacgMachineState()),
      lang2: isEventLegal(legality, 'lang2', w.noacgMachineState()),
    } };
    // It swaps with nobody pressing anything.
    await settled(() => langs().join(), '0,1', 9000);
    out.afterTimer = langs();
    out.afterTimerState = groups().main;
    // Hold freezes it where it is, for longer than a whole cycle.
    w.noacgDispatch('hold');
    await sleep(200);
    out.held = langs();
    out.heldState = groups().main;
    await sleep(6000);
    out.stillHeld = langs();
    // Resume moves to the OTHER language — never a re-fade of the one already up.
    w.noacgDispatch('resume');
    await sleep(700);
    out.afterResume = langs();
    // The operator override, and the structural guard behind it.
    w.noacgDispatch('lang2');
    await sleep(700);
    out.afterPick = langs();
    out.pickLegal = {
      lang1: isEventLegal(legality, 'lang1', w.noacgMachineState()),
      lang2: isEventLegal(legality, 'lang2', w.noacgMachineState()),
    };
    return out;
  })()`)) as {
    rest: number[]; restLegal: Record<string, boolean>; afterTimer: number[]; afterTimerState: string;
    held: number[]; heldState: string; stillHeld: number[]; afterResume: number[];
    afterPick: number[]; pickLegal: Record<string, boolean>;
  };

  expect(r.rest).toEqual([1, 0]);
  // Language 1 is up, so asking for it is structurally illegal — and language 2 is not.
  expect(r.restLegal).toEqual({ lang1: false, lang2: true });
  expect(r.afterTimer).toEqual([0, 1]);          // the timer swapped it unaided
  expect(r.afterTimerState).toBe('language-2');
  expect(r.held).toEqual([0, 1]);
  expect(r.heldState).toBe('hold-2');            // the hold remembers WHICH language it froze
  expect(r.stillHeld).toEqual([0, 1]);           // and nothing re-arms the timer
  expect(r.afterResume).toEqual([1, 0]);         // resume goes to the other language
  expect(r.afterPick).toEqual([0, 1]);           // and the operator can pick directly
  expect(r.pickLegal).toEqual({ lang1: true, lang2: false });
});

test('a public-information panel keeps its instruction numbering and its attribution', async ({ page }) => {
  await toApp(page);
  const r = (await page.evaluate(`(async () => {
    ${HARNESS}
    const tpl = await build('pi02');
    const w = await boot(tpl);
    w.play();
    await sleep(300);
    // The numbering is a CSS counter rather than text typed into the fields, so that removing
    // an instruction renumbers the rest instead of leaving a gap. A pseudo-element's RESOLVED
    // counter text is not readable from script (getComputedStyle hands back the specified
    // 'counter(...)' function), so the check is that the mechanism is live and painting: the
    // counter is reset on the list, incremented on every row, and each chip has real size.
    const steps = Array.from(w.document.querySelectorAll('.public-info-step'));
    const numbering = {
      reset: w.getComputedStyle(w.document.querySelector('.public-info-steps')).counterReset,
      increments: steps.map((el) => w.getComputedStyle(el).counterIncrement),
      chipWidths: steps.map((el) => parseFloat(w.getComputedStyle(el, '::before').width)),
    };
    const box = w.document.querySelector('.public-info-box').getBoundingClientRect();
    return {
      numbering,
      source: w.document.querySelector('.public-info-source').textContent.trim(),
      // The instruction line is the one that asks the viewer to act — never dimmed.
      stepColour: w.getComputedStyle(w.document.querySelector('.public-info-step')).color,
      bodyColour: w.getComputedStyle(w.document.querySelector('.public-info-source')).color,
      withinFrame: box.left >= -1 && box.right <= 1921 && box.top >= -1 && box.bottom <= 1081,
    };
  })()`)) as {
    numbering: { reset: string; increments: string[]; chipWidths: number[] };
    source: string; stepColour: string; bodyColour: string; withinFrame: boolean;
  };

  expect(r.numbering.reset).toContain('instruction');
  expect(r.numbering.increments).toEqual(['instruction 1', 'instruction 1', 'instruction 1']);
  for (const width of r.numbering.chipWidths) expect(width).toBeGreaterThan(20);
  expect(r.source).toBe('Civil Protection Authority');
  expect(r.stepColour).not.toBe(r.bodyColour);
  expect(r.withinFrame).toBe(true);
});

// ── Round trip and packaging ─────────────────────────────────────────────────

test('save, reload and reopen keeps a severity machine and a language machine intact', async ({ page }) => {
  await toApp(page);
  const saved = (await page.evaluate(`(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const out = {};
    for (const id of ['al01', 'pi08', 'tk18']) {
      const tpl = variantById(id).create({});
      const { doc } = createGraphic(tpl, { name: id });
      out[id] = doc.id;
    }
    return out;
  })()`)) as Record<string, string>;

  // Three saves accepted is not three saves LANDED (e2e/_durable.ts): each one hands IndexedDB
  // its own transaction, and reloading before they commit drops the last one or two - which is
  // how this test used to report a two-language panel with no machine at all.
  await settleDurableWrites(page);

  // A real reload: the library is read back from storage, not from memory.
  await page.reload();
  await page.keyboard.press('Escape');
  // Read the model directly, so the shell being on screen proves nothing about the mirror.
  await awaitDurableReady(page);
  const r = (await page.evaluate(`(async (ids) => {
    const { loadAllGraphics } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const docs = loadAllGraphics();
    const out = {};
    for (const [id, docId] of Object.entries(ids)) {
      const doc = docs.find((d) => d.id === docId);
      const data = doc ? parseAnimData(doc.template.js) : null;
      out[id] = {
        found: !!doc,
        ok: doc ? validateTemplate(doc.template).ok : false,
        groups: data?.machine ? data.machine.groups.map((g) => g.id + ':' + g.states.length) : null,
        controls: data?.machine?.controls?.map((c) => c.event) ?? null,
      };
    }
    return out;
  })(${JSON.stringify(saved)})`)) as Record<string, { found: boolean; ok: boolean; groups: string[] | null; controls: string[] | null }>;

  expect(r.al01.found).toBe(true);
  expect(r.al01.ok).toBe(true);
  expect(r.al01.groups).toEqual(['main:3', 'level:4']);
  expect(r.al01.controls).toEqual(['advisory', 'watch', 'warning', 'emergency']);
  expect(r.pi08.groups).toEqual(['main:7']);
  expect(r.pi08.controls).toEqual(['lang1', 'lang2', 'hold', 'resume']);
  expect(r.tk18.controls).toEqual(['pause', 'resume', 'skip']);
});

test('every export target packages the new categories with no dangling references', async ({ page }) => {
  await toApp(page);
  const GRAPHICS = ['tk15', 'al01', 'pi08'];
  const built = (await page.evaluate(`(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const out = [];
    for (const id of ${JSON.stringify(GRAPHICS)}) {
      const tpl = variantById(id).create({});
      for (const target of EXPORT_TARGETS) {
        const zip = await target.build(tpl);
        out.push({
          id, target: target.id,
          base64: await zip.generateAsync({ type: 'base64' }),
        });
      }
    }
    // How many targets there ARE is read here, in the same evaluation that built them, so
    // adding an export target cannot make this fail on arithmetic - only on a target that
    // produced no package.
    return { out, targets: EXPORT_TARGETS.length };
  })()`)) as { out: { id: string; target: string; base64: string }[]; targets: number };
  const packages = built.out;

  expect(built.targets, 'the export registry still has targets to package for').toBeGreaterThan(0);
  expect(packages).toHaveLength(GRAPHICS.length * built.targets);

  for (const pkg of packages) {
    const label = `${pkg.id}/${pkg.target}`;
    const zip = await JSZip.loadAsync(Buffer.from(pkg.base64, 'base64'));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    expect(names.length, label).toBeGreaterThan(0);

    // The graphic's own code file. Most targets ship an .html; OGraf and LiveOS ship the
    // Graphic as an ES module beside its manifest, so the check follows the target rather
    // than assuming everyone packages a page.
    const mainName = names.find((n) => /\.(html|mjs|js)$/i.test(n) && !/controlpanel|gsap\.min/i.test(n));
    expect(mainName, label).toBeTruthy();
    const html = await zip.file(mainName!)!.async('string');
    const htmlName = mainName;

    // No CDN: nothing the package LOADS may come off the network. XML namespace URIs
    // (xmlns="http://www.w3.org/2000/svg") are identifiers, never fetches, so the check is
    // scoped to the attributes and functions that actually retrieve something.
    // The OGraf/LiveOS targets ship the graphic as an ES module that carries its CSS as a JS
    // string, so quotes inside a url() arrive backslash-escaped — strip the escape before
    // resolving, or every one of them reads as a reference to a file called "\".
    // OGraf replaces its srcdoc-only base placeholder with the module URL before mounting it.
    const loads = [
      ...[...html.matchAll(/(?:src|href)=\\?"([^"\\]+)/g)].map((m) => m[1]),
      ...[...html.matchAll(/url\(\s*\\?['"]?([^'")\\]+)/g)].map((m) => m[1]),
    ].map((u) => u.trim()).filter((u) => u !== '' && u !== '__NOACG_BASE__');
    const external = loads.filter((u) => /^(https?:)?\/\//i.test(u) && !/^https?:\/\/127\.0\.0\.1(?::|\/)/i.test(u));
    expect(external, label).toEqual([]);

    // Every relative reference the package makes must be a file the package contains —
    // the dangling-reference defect class, which degrades silently on air.
    const dir = htmlName!.includes('/') ? htmlName!.slice(0, htmlName!.lastIndexOf('/') + 1) : '';
    for (const ref of loads) {
      if (/^(https?:|data:|#|\/\/)/.test(ref)) continue;
      const resolved = ref.startsWith('../') ? ref.replace(/^\.\.\//, '') : dir + ref.replace(/^\.\//, '');
      expect(names.some((n) => n === resolved || n.endsWith('/' + resolved)), `${label} -> ${ref}`).toBe(true);
    }

    // The graphic's own substance survived the packaging.
    if (pkg.id === 'al01') expect(html, label).toContain('alert-level-4');
    if (pkg.id === 'pi08') expect(html, label).toContain('public-info-lang-2');
    if (pkg.id === 'tk15') expect(html, label).toContain('ticker-track');

    // THE KICKER TRAVELS WITH THE PACKAGE (docs/TICKERS.md). A format the studio understands
    // and an offline export does not would be worse than no format at all: the operator types
    // "SPORT: United win 3-0" into a strip already running on a playout server. The parser and
    // its shared treatment are read across the WHOLE package rather than the page, because most
    // targets ship the runtime and the stylesheet as files of their own.
    if (pkg.id === 'tk15') {
      const bundle = (
        await Promise.all(names.map((n) => zip.file(n)!.async('string').catch(() => '')))
      ).join('\n');
      expect(bundle, `${label} carries the kicker parser`).toContain('parseTickerItems');
      expect(bundle, `${label} carries the shared kicker treatment`).toContain('.ticker-kicker');
    }
  }
});

// THE SAME RUNDOWN THROUGH THE OPERATOR'S OWN DOOR. A ticker is typed into on air, not in the
// wizard, so the mark has to survive the route a real update takes: a field value written from
// outside the graphic and pushed through the control path - which is the identical `update()`
// the playout dashboard's monitors, the browser-output renderer and an exported package all
// call. Proving it at the design-time preview alone would prove the parser and not the product.
test('a kicker typed on air reaches the strip through the control path', async ({ page }) => {
  await enableAdvancedMode(page);
  await createProject(page, 'House Wire');
  // The preview rebuilds on a debounce after the create; the control update has to land on the
  // NEW document rather than the one it is replacing (e2e/AGENTS.md).
  await awaitPreviewRebuild(page);

  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const store = useTemplateStore.getState();
    store.setSampleValue('f0', 'SPORT:\nUnited win 3-0\nCity held at home\n\nStorm warning issued');
    store.sendControl('update');
  });

  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.ticker-kicker').first()).toHaveText('SPORT', { timeout: 10_000 });
  // Two stories under one kicker, and the story after the blank line carrying none.
  const strip = await frame.locator('#ticker-track').textContent();
  expect(strip).toContain('United win 3-0');
  expect(strip).toContain('City held at home');
  expect(strip).toContain('Storm warning issued');
  expect((strip!.match(/SPORT/g) ?? []).length).toBeGreaterThanOrEqual(2);
});
