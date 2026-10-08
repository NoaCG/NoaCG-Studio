// covers: src/components/wizard/**, !src/components/wizard/import/**
// focus

import { test, expect, type Page } from '@playwright/test';
import { contrastRatio, parseCssColor } from '../src/model/cssVars';
import { evaluateInPage } from './_evaluate';

// The Entry step's HEIGHT BUDGET. Step 0 is the app's first screen, and it has to fit a
// short laptop window whole: `.wz-hero` carries the comment "every vertical margin here is
// budgeted - if you grow one, take the height from another", which nothing enforced until
// this spec. Growing a margin, a font size, or a card's padding past the budget shows up
// here as a scroller that overflows, or as the Playout row clipped below the fold.
//
// The wizard auto-opens only on a first-ever visit (no autosaved project). Every test gets a
// fresh context, so a plain `goto('/app')` lands on the Entry step.

/**
 * Every navigation here is a COLD APP BOOT, and a boot is not a UI reaction: wait for main.tsx to
 * hand the app to React (`__noacgBootStage`, app.html) on a boot's own budget, then assert the UI
 * on the ordinary 7 s one.
 *
 * Measured 2026-10-08 under the dev server: a boot fetches about 1,200 modules (650 of them the
 * catalog's templates) and shows the wizard in 2.1 s alone, but in 7.1 s at the median (7.7 s
 * max) when six start together - which is exactly how this file starts, because its first tests
 * are picked up at once by workers freed together (wizard-brand's tests skip instantly). The page
 * is blank, not stuck: it mounts at 13 s with four busy cores and at 34 s with ten. Waiting only
 * the 7 s `expect` default turned that into "creation-wizard not found" on the 2026-10-07 waves.
 */
const COLD_BOOT_MS = 30_000;
async function awaitBoot(page: Page) {
  await page.waitForFunction(
    () => (window as { __noacgBootStage?: string }).__noacgBootStage === 'mounted',
    undefined,
    { timeout: COLD_BOOT_MS },
  );
}

/** Open /app at a fixed window size and wait for the Entry step to be laid out. */
async function entryStepAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/app');
  await awaitBoot(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="video"]')).toBeVisible();
}

/** The start cards in the owner's order (2026-09-28): make graphics first - a template, your own
 *  artwork, AI - then the greyed video door. Desktop row and phone stack alike. */
const OWNER_ORDER = ['template', 'import-graphic', 'ai', 'video'];
const OWNER_TITLES = ['Start from a template', 'Import graphics', 'Create with AI', 'Video or animation'];

/** How far `.wz-step`'s content exceeds its scrollport. 0 means the whole step is on screen. */
async function stepOverflowPx(page: Page): Promise<number> {
  return page.locator('.wz-step').evaluate((el) => el.scrollHeight - el.clientHeight);
}

for (const [width, height] of [[1366, 768], [1440, 900]] as const) {
  test(`the entry step fits a ${width}x${height} window without scrolling`, async ({ page }) => {
    await entryStepAt(page, width, height);
    expect(await stepOverflowPx(page)).toBe(0);
  });
}

for (const [label, width, height] of [['desktop', 1366, 768], ['phone', 390, 844]] as const) {
  test(`creation navigation starts only after a card is opened on ${label}`, async ({ page }) => {
    await entryStepAt(page, width, height);

    // Entry is a menu before a creation path exists. The whole rail - not merely its labels -
    // stands down, and the main column receives the complete body measure.
    await expect(page.locator('.wz-rail')).toHaveCount(0);
    await expect(page.locator('.wz-dots')).toHaveCount(0);
    const entryWidths = await page.evaluate(() => ({
      body: document.querySelector('.wz-body')!.getBoundingClientRect().width,
      main: document.querySelector('.wz-main')!.getBoundingClientRect().width,
    }));
    expect(Math.abs(entryWidths.body - entryWidths.main)).toBeLessThan(1);

    await page.locator('[data-entry="ai"]').click();
    const rail = page.locator('.wz-rail');
    await expect(rail).toBeVisible();
    await expect(rail.locator('.wz-dot')).toHaveCount(3);
    // The step opens on the coding-agent route alone; the generator's Create waits behind it.
    await expect(page.getByTestId('ai-agent-route')).toBeVisible();

    const layout = await page.evaluate(() => {
      const railRect = document.querySelector('.wz-rail')!.getBoundingClientRect();
      const mainRect = document.querySelector('.wz-main')!.getBoundingClientRect();
      return {
        railRight: railRect.right,
        railBottom: railRect.bottom,
        mainLeft: mainRect.left,
        mainTop: mainRect.top,
      };
    });
    if (label === 'desktop') {
      expect(layout.railRight).toBeLessThanOrEqual(layout.mainLeft + 0.5);
    } else {
      expect(layout.railBottom).toBeLessThanOrEqual(layout.mainTop + 0.5);
    }
  });
}

test('the whole step, Playout row included, is inside the scrollport at 1366x768', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // Geometry, not visibility: an element clipped away by a scrolling ancestor still reports
  // `toBeVisible()`, which is exactly how the old video strip shipped below the fold. The
  // Playout row is the last thing on the step, so it is the one that would go first.
  const clipped = await page.evaluate(() => {
    const port = document.querySelector('.wz-step')!.getBoundingClientRect();
    const out = (sel: string) => {
      const r = document.querySelector(sel)!.getBoundingClientRect();
      return r.top < port.top - 0.5 || r.bottom > port.bottom + 0.5 || r.left < port.left - 0.5 || r.right > port.right + 0.5;
    };
    return {
      video: out('[data-entry="video"]'),
      playout: out('[data-testid="wz-playout"]'),
      openPlayout: out('[data-entry="open-playout"]'),
      newProduction: out('[data-entry="new-production"]'),
    };
  });
  expect(clipped).toEqual({ video: false, playout: false, openPlayout: false, newProduction: false });
});

test('the four start cards are one row of equal cards, in the owner order', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // THE ORDER IS THE RANKING (owner, 2026-09-28): make graphics first - a template, your own
  // artwork, AI - then the greyed video door. SAME SIZE AND SAME TREATMENT: no card is tinted
  // as the primary any more - the old tinted template border made one card of four look
  // different, which is what the owner reported. Geometry, because a ragged row is invisible
  // to any assertion about which elements exist.
  const cards = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const head = el.querySelector('.wz-entry-head')!.getBoundingClientRect();
      const icon = el.querySelector('.wz-entry-icon')!;
      const iconRect = icon.getBoundingClientRect();
      const title = el.querySelector('strong')!.getBoundingClientRect();
      const hint = el.querySelector('.hint')!.getBoundingClientRect();
      return {
        entry: (el as HTMLElement).dataset.entry,
        primary: el.classList.contains('wz-entry-card--primary'),
        top: r.top, width: r.width, height: r.height,
        // Where each block sits INSIDE its own card.
        headTop: head.top - r.top,
        hintTop: hint.top - r.top,
        // ONE DRAWN SET: every icon is an inline SVG at one size, never a Unicode glyph.
        iconTag: icon.tagName.toLowerCase(),
        iconSize: `${Math.round(iconRect.width)}x${Math.round(iconRect.height)}`,
        iconRight: iconRect.right, titleLeft: title.left,
        iconMidY: iconRect.top + iconRect.height / 2, titleMidY: title.top + title.height / 2,
      };
    }),
  );
  expect(cards.map((c) => c.entry)).toEqual(OWNER_ORDER);
  await expect(page.locator('.wz-entry .wz-entry-card strong')).toHaveText(OWNER_TITLES);
  expect(cards.some((c) => c.primary)).toBe(false);

  const round = (n: number) => Math.round(n);
  for (const c of cards) {
    // One row, one size: every card shares the first card's top, width and height.
    expect(round(c.top), `${c.entry}: row`).toBe(round(cards[0].top));
    expect(round(c.width), `${c.entry}: width`).toBe(round(cards[0].width));
    expect(round(c.height), `${c.entry}: height`).toBe(round(cards[0].height));
    expect(c.iconTag, `${c.entry}: drawn icon`).toBe('svg');
    expect(c.iconSize, `${c.entry}: icon size`).toBe(cards[0].iconSize);
    // The title row is one flex line: the icon precedes the title and shares its centreline.
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
    expect(Math.abs(c.iconMidY - c.titleMidY), `${c.entry}: icon on the title's line`).toBeLessThan(4);
    // Every card's copy starts at the same y INSIDE its own card.
    expect(round(c.headTop), `${c.entry}: title row offset`).toBe(round(cards[0].headTop));
    expect(round(c.hintTop), `${c.entry}: description offset`).toBe(round(cards[0].hintTop));
  }

  // THE ROW STAYS EQUAL WHEN ONE CARD OUTGROWS THE RESERVE. With today's copy every card fits
  // the three-line block, so the heights above would match even without `grid-auto-rows: 1fr`;
  // force the day someone writes a fourth line.
  const grown = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) => {
    els[0].querySelector('.hint')!.textContent = 'x '.repeat(220);
    return els.map((el) => Math.round(el.getBoundingClientRect().height));
  });
  expect(new Set(grown).size, `the row followed: ${grown.join(', ')}`).toBe(1);
});

// THE NARROWEST FOUR-COLUMN WIDTH. Titles are `nowrap`, so a title too long for its column does
// not wrap, it runs past the card's border. Four columns hold from 1101px, where the cards are at
// their narrowest; measured 2026-09-28, the longest title ("Start from a template") keeps 11px
// of room there, and the titles would first touch the padding near 1055px.
for (const width of [1101, 1125, 1150]) {
  test(`every start card title fits its card at ${width}px`, async ({ page }) => {
    await entryStepAt(page, width, 768);
    await page.evaluate(() => document.fonts.ready);
    const fit = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        const inner = el.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
        const range = document.createRange();
        range.selectNodeContents(el.querySelector('strong')!);
        const textRight = Math.max(...[...range.getClientRects()].map((r) => r.right));
        return { entry: (el as HTMLElement).dataset.entry, room: inner - textRight, top: Math.round(el.getBoundingClientRect().top) };
      }),
    );
    expect(fit.length).toBe(4);
    expect(new Set(fit.map((c) => c.top)).size, 'four columns, one row').toBe(1);
    for (const c of fit) expect(c.room, `${c.entry}: title room ${c.room.toFixed(1)}px`).toBeGreaterThanOrEqual(0);
  });
}

test('the phone reads top to bottom: four equal cards, then the Playout row', async ({ page }) => {
  await entryStepAt(page, 375, 812);

  // The four-column row is a DESKTOP measure. On a phone the same four cards stack in the same
  // order, one size, each title on ONE line with its icon leading it - a wrapped title is what
  // turned these cards into screen-tall ragged blocks before - and the Run the show card closes
  // the column, stacked like the Home row: its copy, then New production full width under it.
  const layout = await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('.wz-entry .wz-entry-card')].map((el) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector('strong')!;
      const icon = el.querySelector('.wz-entry-icon')!.getBoundingClientRect();
      return {
        entry: el.dataset.entry,
        left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height),
        top: Math.round(r.top), bottom: Math.round(r.bottom),
        titleHeight: title.getBoundingClientRect().height,
        titleLineHeight: parseFloat(getComputedStyle(title).lineHeight),
        iconRight: icon.right, titleLeft: title.getBoundingClientRect().left,
      };
    });
    const playout = document.querySelector('[data-testid="wz-playout"]')!.getBoundingClientRect();
    const open = document.querySelector('[data-entry="open-playout"]')!.getBoundingClientRect();
    const create = document.querySelector('[data-entry="new-production"]')!.getBoundingClientRect();
    return {
      cards,
      playoutTop: Math.round(playout.top),
      playoutLeft: Math.round(playout.left),
      playoutWidth: Math.round(playout.width),
      newProductionUnderCopy:
        create.top >= open.bottom - 0.5 && Math.abs(create.width - open.width) < 1,
    };
  });
  const { cards } = layout;
  expect(cards.map((c) => c.entry)).toEqual(OWNER_ORDER);
  expect(new Set(cards.map((c) => c.left)).size).toBe(1);
  expect(new Set(cards.map((c) => c.width)).size).toBe(1);
  expect(new Set(cards.map((c) => c.height)).size, `heights ${cards.map((c) => c.height)}`).toBe(1);
  for (let i = 1; i < cards.length; i++) expect(cards[i].top).toBeGreaterThanOrEqual(cards[i - 1].bottom);
  for (const c of cards) {
    expect(c.titleHeight, `${c.entry}: title wrapped`).toBeLessThan(c.titleLineHeight * 1.6);
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
  }
  // Run the show comes after the last card and is flush with the column.
  expect(layout.playoutTop).toBeGreaterThan(cards[3].bottom);
  expect(layout.playoutLeft).toBe(cards[0].left);
  expect(layout.playoutWidth).toBe(cards[0].width);
  expect(layout.newProductionUnderCopy).toBe(true);
});

// ── WHAT THE STEP SAYS (re-design/handoff.md §2a) ───────────────────────────────────────
// The geometry above was brought over first and the CONTENT was not, so these pin the three
// differences that were closed - and, just as importantly, the three divergences from the
// reference that are DELIBERATE, so nobody restores the picture over the decision.

test('the hero intro is the owner copy: make graphics, then every route to air and EVERY export target', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  const hero = page.locator('.wz-hero');
  // The landing page's headline, verbatim - the app repeating the promise word for word is
  // what makes the two surfaces read as one product.
  await expect(hero.locator('.wz-hero-title')).toHaveText('Create live graphics. Run the show.');
  const sub = hero.locator('.wz-hero-sub');
  // THE INTRO IS THE OWNER'S, VERBATIM (2026-09-28): the product flow in reading order - make
  // graphics first, then use them however the production works. It names every route to air:
  // the browser source NoaCG plays itself, NoaCG Playout driving CasparCG through NoaCG Bridge,
  // and the downloaded templates.
  await expect(sub).toHaveText(
    'Start from a template, create graphics with AI, or import your own SVGs. Then use them ' +
      'however your production works: play them directly from NoaCG through a browser source, ' +
      'connect NoaCG Playout to CasparCG with NoaCG Bridge, or download the graphics as HTML ' +
      'templates for OGraf, CasparCG, SPX Graphics, H2R Graphics, LiveOS, OBS and vMix.',
  );
  // …and the live route is NOT an "HTML overlay": that phrase is the name of an export TARGET (a folder of
  // files), so reusing it for the live URL would make one term mean two products on one screen.
  await expect(sub).not.toContainText('HTML overlay');
  // EVERY TARGET, not a sample of three: naming SPX, CasparCG and OGraf alone read as the whole
  // list, and told an OBS, vMix, H2R or LiveOS user this was not for them. The list here is the
  // export registry's six targets (src/export/targets/), so a NEW target updates both.
  for (const target of ['SPX Graphics', 'CasparCG', 'OGraf', 'H2R Graphics', 'LiveOS', 'OBS', 'vMix']) {
    await expect(sub, `the hero names ${target}`).toContainText(target);
  }
  // The targets are a PROMISE in the subtitle. As a row of small bordered pills they read as
  // filters or as status, which is what a row of pills means everywhere else in this app.
  await expect(hero.locator('.wz-hero-tags')).toHaveCount(0);
  // And no second brand mark: the wizard's own topbar already wears one, two inches higher.
  await expect(hero.locator('svg, img')).toHaveCount(0);
  await expect(page.locator('.wz-header .brand-home')).toBeVisible();
});

/** What a CSS value resolves to, read off a throwaway element rather than a real control, whose
 *  transitioned border or fill could be sampled mid-fade. */
function resolveToken(page: Page, property: string, value: string) {
  return page.evaluate(
    ([p, v]) => {
      const probe = document.createElement('div');
      probe.style.setProperty(p, v);
      document.body.append(probe);
      const resolved = getComputedStyle(probe).getPropertyValue(p);
      probe.remove();
      return resolved;
    },
    [property, value],
  );
}

/** Land on the Entry step with the Home row showing. The row appears only when there IS saved
 *  work - a first-ever visit gets no door to an empty room - so seed one graphic and reload. */
async function entryWithSavedWork(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
  await awaitBoot(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('wz-continue')).toHaveCount(0);
  await page.evaluate(async () => {
    const { createGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    createGraphic(useTemplateStore.getState().template, { name: 'Seeded strap' });
    await commitDurableWrites();
  });
  await page.goto('/app');
  await awaitBoot(page);
  await expect(page.getByTestId('wz-continue')).toBeVisible();
}

test('the Home row carries its two section shortcuts', async ({ page }) => {
  await entryWithSavedWork(page);
  const row = page.getByTestId('wz-continue');

  // ONE ROW: the body button and the two shortcuts share a line, and the shortcuts are
  // SIBLINGS of the body button - a button nested in a button is invalid markup.
  const geometry = await row.evaluate((el) => {
    const body = el.querySelector('[data-entry="continue"]')!.getBoundingClientRect();
    const graphics = el.querySelector('[data-entry="continue-graphics"]')!.getBoundingClientRect();
    const productions = el.querySelector('[data-entry="continue-productions"]')!.getBoundingClientRect();
    return {
      nested: !!el.querySelector('[data-entry="continue"] button'),
      bodyBeforeShortcuts: body.right <= graphics.left + 0.5,
      sameLine: Math.abs(body.top + body.height / 2 - (graphics.top + graphics.height / 2)) < 4,
      inOrder: graphics.right <= productions.left + 0.5,
      spansRow: Math.round(el.getBoundingClientRect().width),
      gridWidth: Math.round(document.querySelector('.wz-entry')!.getBoundingClientRect().width),
    };
  });
  expect(geometry.nested).toBe(false);
  expect(geometry.bodyBeforeShortcuts).toBe(true);
  expect(geometry.sameLine).toBe(true);
  expect(geometry.inOrder).toBe(true);
  // Full width, like the reference draws it - not a card sharing the grid.
  expect(geometry.spansRow).toBe(geometry.gridWidth);

  // Each shortcut lands on its own Home section, not on the dashboard.
  await row.locator('[data-entry="continue-productions"]').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(page.url()).toContain('#/home/productions');
});

test('the Home row answers a hover like an entry card, and its shortcuts do not', async ({ page }) => {
  // The owner's report, the same one e2e/wizard-shell.spec.ts answers for the HEADER: the cards
  // light up amber and the thing beside them stays grey. The Home row was the last of it. Its
  // body button gives its border, fill and lift up to the ROW so the three controls read as one
  // object, and nothing had taken over answering for it - so the one full-width thing on the
  // step sat dead under the pointer while every card beside it lit up.
  await entryWithSavedWork(page);

  const styleOf = (sel: string) =>
    page.evaluate((s) => {
      const cs = getComputedStyle(document.querySelector(s)!);
      return { border: cs.borderColor, background: cs.backgroundColor, transform: cs.transform };
    }, sel);

  // The two values the tokens resolve to, read off a THROWAWAY element - the same probe
  // e2e/wizard-shell.spec.ts uses, and for the same reason. Border and background are both
  // transitioned here, so reading a real control to learn what "the answer" is captures a
  // mid-fade: this spec first asked the hovered card and got `rgb(235,160,36)` on its way to
  // `rgb(246,166,35)`, and then held every later assertion to the wrong colour. No literal is
  // written down either way, so a repaint of the palette moves the test with it.
  const amber = await resolveToken(page, 'border-color', 'var(--accent)');
  const fill = await resolveToken(page, 'background-color', 'var(--bg-2)');

  const IDENTITY = ['none', 'matrix(1, 0, 0, 1, 0, 0)'];
  const resting = await styleOf('.wz-continue-row');

  // THE REFERENCE: this is the answer the cards already give, stated first so everything below
  // is pinned to the CARDS' behaviour rather than merely to a pair of tokens. The `ai` card is
  // the first full-strength card (the greyed video card answers in a quieter border).
  await page.hover('[data-entry="ai"]');
  await expect
    .poll(async () => {
      const { border, background } = await styleOf('[data-entry="ai"]');
      return { border, background };
    })
    .toEqual({ border: amber, background: fill });
  const card = await styleOf('[data-entry="ai"]');

  // THE BODY GETS THAT ANSWER, both properties.
  await page.hover('[data-entry="continue"]');
  await expect
    .poll(async () => {
      const { border, background } = await styleOf('.wz-continue-row');
      return { border, background };
    })
    .toEqual({ border: amber, background: fill });

  // …BUT NOT THE LIFT. `translateY(-2px)` says "a card you pick up"; on a 1180x72 shelf it reads
  // as the whole band twitching, and the two shortcuts ride INSIDE the row - so the button about
  // to be clicked would move under the cursor. The card keeps its lift, which is what makes this
  // a deliberate difference rather than a rule that was forgotten.
  expect(IDENTITY).toContain((await styleOf('.wz-continue-row')).transform);
  expect(IDENTITY).not.toContain(card.transform);

  // OVER A SHORTCUT THE ROW STANDS DOWN. A hover says what a CLICK will do: a shortcut opens a
  // section rather than Home, and it already answers in amber for itself - an amber row wrapped
  // around an amber button is two highlights for one target and neither owns the click.
  // Both read in ONE evaluate, so the row and the shortcut are sampled in the same frame rather
  // than either side of a transition tick.
  await page.hover('[data-entry="continue-graphics"]');
  await expect
    .poll(async () =>
      page.evaluate((amberValue) => {
        const row = getComputedStyle(document.querySelector('.wz-continue-row')!);
        const shortcut = getComputedStyle(document.querySelector('[data-entry="continue-graphics"]')!);
        return {
          rowAmber: row.borderColor === amberValue,
          rowFill: row.backgroundColor,
          shortcut: shortcut.borderColor,
        };
      }, amber),
    )
    .toEqual({ rowAmber: false, rowFill: resting.background, shortcut: amber });

  // THE KEYBOARD GETS THE SAME ANSWER, and the inner button's own ring goes. It is ARRIVED AT
  // BY A REAL TAB PRESS: `.focus()` on the button lands there without the keyboard modality, so
  // `:focus-visible` never matches and every assertion below would pass against the resting
  // state. Counting Tab presses from the top does not work either - the wizard is an overlay and
  // HOME STAYS MOUNTED UNDERNEATH IT, so ten of the page's twenty-two focusables belong to the
  // page behind and the count moves with whatever is saved. Seeding focus on the control
  // before the hero, then passing the Alpha shortcut, is stable whatever is behind. (That the overlay
  // does not trap focus at all is a separate, pre-existing thing.)
  await page.locator('.wz-header .gallery-close').evaluate((el: HTMLElement) => el.focus());
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Open editor Alpha', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.entry ?? null),
  ).toBe('continue');
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const row = getComputedStyle(document.querySelector('.wz-continue-row')!);
        const body = getComputedStyle(document.querySelector('[data-entry="continue"]')!);
        return { border: row.borderColor, background: row.backgroundColor, outline: body.outlineStyle };
      }),
    )
    .toEqual({ border: amber, background: fill, outline: 'none' });
});

test('Run the show is a card you press, on the Home row chassis, and still fits 1366x768', async ({ page }) => {
  // The owner (2026-09-28): "Run the show" was a text row with two small buttons beside four
  // cards you press, which broke the screen. It is now the Home row's pressable card: the body
  // opens the latest production and NAMES it, New production is a sibling button beside it.
  // Seeded with saved work AND a production whose name is long enough to need the ellipsis, the
  // heaviest the step gets: Home row, four cards and this card must all still fit.
  await entryWithSavedWork(page);
  await evaluateInPage(page, async () => {
    const { createShowNamedChecked } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    createShowNamedChecked('Friday night studio magazine with the regional news and the weather after it');
    await commitDurableWrites();
  });
  await page.goto('/app');
  await awaitBoot(page);
  await expect(page.locator('[data-entry="open-playout"]')).toContainText('your latest production');
  expect(await stepOverflowPx(page)).toBe(0);

  const shape = await page.evaluate(() => {
    const home = document.querySelector('[data-testid="wz-continue"] .wz-continue-row')!;
    const run = document.querySelector('[data-testid="wz-playout"]')!;
    const look = (el: Element) => {
      const cs = getComputedStyle(el);
      return {
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        radius: cs.borderTopLeftRadius,
        background: cs.backgroundColor,
        padding: cs.padding,
        height: Math.round(el.getBoundingClientRect().height),
        width: Math.round(el.getBoundingClientRect().width),
      };
    };
    const body = run.querySelector('[data-entry="open-playout"]')!.getBoundingClientRect();
    const create = run.querySelector('[data-entry="new-production"]')!.getBoundingClientRect();
    const name = run.querySelector<HTMLElement>('.wz-playout-name')!;
    return {
      home: look(home),
      run: look(run),
      gridWidth: Math.round(document.querySelector('.wz-entry')!.getBoundingClientRect().width),
      nested: !!run.querySelector('[data-entry="open-playout"] button'),
      buttons: run.querySelectorAll('button').length,
      bodyBeforeCreate: body.right <= create.left + 0.5,
      sameLine: Math.abs(body.top + body.height / 2 - (create.top + create.height / 2)) < 4,
      nameClipped: name.scrollWidth > name.clientWidth,
    };
  });
  // THE SAME CARD as the Home row: border, corner, fill, padding, height and full grid width.
  expect(shape.run).toEqual(shape.home);
  expect(shape.run.width).toBe(shape.gridWidth);
  // Two controls, siblings - a button nested in a button is invalid markup.
  expect(shape.nested).toBe(false);
  expect(shape.buttons).toBe(2);
  expect(shape.bodyBeforeCreate).toBe(true);
  expect(shape.sameLine).toBe(true);
  // A long name stops at an ellipsis rather than growing the card out of the budget.
  expect(shape.nameClipped).toBe(true);

  const amber = await resolveToken(page, 'border-color', 'var(--accent)');
  const fill = await resolveToken(page, 'background-color', 'var(--bg-2)');
  const rowStyle = () =>
    page.evaluate(() => {
      const row = getComputedStyle(document.querySelector('[data-testid="wz-playout"]')!);
      const body = getComputedStyle(document.querySelector('[data-entry="open-playout"]')!);
      const create = getComputedStyle(document.querySelector('[data-entry="new-production"]')!);
      return { border: row.borderColor, background: row.backgroundColor, outline: body.outlineStyle, create: create.borderColor };
    });
  const resting = await rowStyle();

  // HOVER answers as the Home row does: the body lights the whole card, New production lights
  // only itself.
  await page.hover('[data-entry="open-playout"]');
  await expect.poll(async () => {
    const { border, background } = await rowStyle();
    return { border, background };
  }).toEqual({ border: amber, background: fill });
  await page.hover('[data-entry="new-production"]');
  await expect.poll(async () => {
    const { border, background, create } = await rowStyle();
    return { rowAmber: border === amber, background, create };
  }).toEqual({ rowAmber: false, background: resting.background, create: amber });
  await page.mouse.move(0, 0);

  // THE KEYBOARD: one stop for the body, one for New production, then out of the card. Reached
  // by real Tab presses from the video card (see the Home row test for why not `.focus()`).
  await page.locator('[data-entry="video"]').evaluate((el: HTMLElement) => el.focus());
  const active = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.entry ?? null);
  await page.keyboard.press('Tab');
  expect(await active()).toBe('open-playout');
  await expect.poll(rowStyle).toEqual({ border: amber, background: fill, outline: 'none', create: resting.create });
  await page.keyboard.press('Tab');
  expect(await active()).toBe('new-production');
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('[data-testid="wz-playout"]')),
  ).toBe(false);
});

test('the video card is greyed, and the grey is its whole caveat', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // Owner, 2026-09-27: the video door stays, the same size as the others, but greyed. It makes
  // a rendered FILE, not a live graphic, and says so. Owner, 2026-09-28: no "Not recommended
  // yet" sentence - the grey says "not yet", and a second caveat in words hedged the first screen.
  const card = page.locator('[data-entry="video"]');
  await expect(card.locator('.hint')).toHaveText('Renders a video file, not a live graphic.');
  await expect(card.locator('.hint')).not.toContainText(/recommend/i);
  await expect(card.locator('.wz-beta-tag')).toHaveCount(0);

  // GREYED means quieter than its row-mates in the two things a reader scans: the title and
  // the icon are dimmer than the Import card's, and the card has no fill of its own.
  const tone = await page.evaluate(() => {
    const read = (entry: string) => {
      const el = document.querySelector(`[data-entry="${entry}"]`)!;
      return {
        title: getComputedStyle(el.querySelector('strong')!).color,
        icon: getComputedStyle(el.querySelector('.wz-entry-icon')!).color,
        fill: getComputedStyle(el).backgroundColor,
      };
    };
    // The hint's colour and the first painted background behind it (the card is transparent).
    const hint = document.querySelector('[data-entry="video"] .hint')!;
    let behind = 'rgb(0, 0, 0)';
    for (let el: Element | null = hint; el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (!/^rgba\(.*,\s*0\)$/.test(bg)) { behind = bg; break; }
    }
    return { video: read('video'), other: read('import-graphic'), hintColor: getComputedStyle(hint).color, behind };
  });
  const hintContrast = contrastRatio(parseCssColor(tone.hintColor)!, parseCssColor(tone.behind)!);
  expect(tone.video.title).not.toBe(tone.other.title);
  expect(tone.video.icon).not.toBe(tone.other.icon);
  expect(tone.video.fill).toBe('rgba(0, 0, 0, 0)');
  // …BUT ITS WORDS STAY READABLE. The description is the card's only explanation, and signed
  // out it ends in "Sign in to try it.", the door itself, so it meets the 4.5:1 body text needs
  // (the fainter hint grey it once wore measured 3.7:1).
  expect(hintContrast, `video hint contrast ${hintContrast}:1`).toBeGreaterThanOrEqual(4.5);

  // Offline nothing is gated, so the greyed door still opens: greyed is "not yet", not broken.
  // Known signed out (configured builds) the same button opens the sign-in dialog instead and
  // its hint adds "Sign in to try it."; while auth is still loading it behaves as signed in.
  await expect(card).toBeEnabled();
  await expect(card.locator('.hint')).not.toContainText('Sign in');
});

test('New production from a fresh profile opens an empty production, ready to add graphics', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // Nobody should have to make a graphic before they can have a rundown (owner, 2026-09-27).
  // A first-ever visit has zero graphics and zero productions, and the action still works: it
  // makes one production and lands on its page with an empty rundown and the rundown's own
  // add-graphics controls in reach.
  await page.locator('[data-entry="new-production"]').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
  expect(page.url()).toMatch(/#\/production\/[^/]+$/);
  await expect(page.getByText('No cues yet.')).toBeVisible();
  await expect(page.getByTestId('production-new-graphic')).toBeVisible();

  const shows = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().map((s) => ({ id: s.id, name: s.name, graphics: s.graphics.length }));
  });
  expect(shows).toHaveLength(1);
  expect(shows[0]).toMatchObject({ name: 'Untitled production', graphics: 0 });
  expect(page.url()).toContain(shows[0].id);

  // It SURVIVES A RELOAD. The door waits for the durable write like every other create path,
  // so the production the page just opened is still there, and still this one, after a reload.
  await page.reload();
  await awaitBoot(page);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByText('No cues yet.')).toBeVisible();
  const afterReload = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().map((s) => s.id);
  });
  expect(afterReload).toEqual([shows[0].id]);
});

test('Run the show opens the productions list with none, and names and opens the last used production', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  const card = page.locator('[data-entry="open-playout"]');
  // NONE: there is no production to open, so the list is the honest landing, where making one
  // is a press away - and the card says so before the press rather than surprising anyone.
  await expect(card).toContainText('Run the show');
  await expect(card).toContainText('You have no production yet, so this opens your productions list.');
  await card.click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(page.url()).toContain('#/home/productions');

  // SOME: the one saved most recently opens, whichever order they were made in.
  const lastId = await page.evaluate(async () => {
    const { createShowNamedChecked, upsertShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const older = createShowNamedChecked('Older show').show;
    createShowNamedChecked('Newer show');
    // The older one is the one edited last: its stamp moves past the newer one's.
    upsertShow({ ...older, updatedAt: new Date(Date.now() + 60_000).toISOString() });
    await commitDurableWrites();
    return older.id;
  });
  await page.goto('/app#/new');
  await awaitBoot(page);
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // The card NAMES what the press opens, so it is not a guess.
  await expect(card).toContainText('Open “Older show”, your latest production');
  await expect(card).not.toContainText('no production yet');
  await card.click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  expect(page.url()).toContain(`#/production/${lastId}`);
});

test('Run the show follows a production that arrives while the step is open', async ({ page }) => {
  // Team productions land from the server AFTER the step mounts. A card that read the list once
  // would keep saying "no production yet", or name one that has since gone, and open the wrong
  // thing; it re-reads on every data change, as Home does.
  await entryStepAt(page, 1366, 768);
  const card = page.locator('[data-entry="open-playout"]');
  await expect(card).toContainText('no production yet');
  const id = await evaluateInPage(page, async () => {
    const { createShowNamedChecked } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { show } = createShowNamedChecked('Arrived later');
    await commitDurableWrites();
    return show.id;
  });
  await expect(card).toContainText('Open “Arrived later”');
  await card.click();
  expect(page.url()).toContain(`#/production/${id}`);
});

test('the Import card names the file types its own drop zone takes', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // A finished .html / .zip template goes through THIS door (ImportDesignStep's `accept` takes
  // image/*, .svg, .html, .htm and .zip). It was named only on the AI card, so the one user who
  // arrives holding a finished graphic had to guess that the AI door - the door they have
  // every reason to avoid - was the way in.
  await expect(page.locator('[data-entry="import-graphic"] .hint')).toContainText('.html or .zip');
  // And SVG is named FIRST, because it is the import the Design step calls the best one - its
  // text layers arrive as fields on their own - and it is how artwork gets in for the September
  // goal. A card that says only "image" reads as the raster road to anyone holding a drawing.
  await expect(page.locator('[data-entry="import-graphic"] .hint')).toContainText('SVG');
  await expect(page.locator('[data-entry="ai"] .hint')).not.toContainText('.zip');
});

test('the AI card carries no tier or paid-edition copy', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // The entry grid has a measured height budget, and the hosted route has no edition name or
  // marketing clause in any build state. Configured mode pins the same absence in
  // e2e/configured/anonymous.spec.ts.
  const hint = page.locator('[data-entry="ai"] .hint');
  await expect(hint).toContainText('NoaCG CLI');
  await expect(hint).not.toContainText(/NoaCG Lite|free with|included|free account/i);
});

test('no start card carries a caveat, and every card holds its copy in the reserve', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // Owner, 2026-09-28: the first screen must be understandable at once, so Create with AI lost
  // its Beta tag and its "Still in testing - results vary." line (and the Video card its "Not
  // recommended yet"). A caveat on one door of four reads as "this one is different" - the same
  // report that took the tinted border off the Import card.
  const row = page.locator('.wz-entry');
  await expect(row.locator('.wz-beta-tag')).toHaveCount(0);
  await expect(page.getByTestId('ai-testing-note')).toHaveCount(0);
  await expect(row.locator('.wz-testing-note')).toHaveCount(0);
  await expect(page.locator('[data-entry="ai"] strong')).toHaveText('Create with AI');
  await expect(row).not.toContainText(/beta|still in testing|results vary|not recommended/i);

  // Every description fits the card's three reserved lines at the budget width: a fourth line
  // grows the row and pushes the Playout row below the fold (the budget every other test here
  // guards). Measured, rather than trusting the copy to stay short.
  const lines = await row.locator('.wz-entry-card .hint').evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)),
  );
  for (const [i, n] of lines.entries()) {
    expect(n, `${OWNER_ORDER[i]} hint needs ${n.toFixed(2)} lines of its 3-line reserve`).toBeLessThanOrEqual(3.05);
  }

  // Dropping the caveat never meant closing the door: Create with AI is open.
  await expect(page.locator('[data-entry="ai"]')).toBeEnabled();
});

test('the deliberate divergences from the reference hold', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // NO KIT CARD: a kit is the same walk over a whole set, so the question is asked at the top
  // of Browse where designs are chosen. The entry copy is the only thing that says so.
  await expect(page.locator('[data-entry="kit"]')).toHaveCount(0);
  await expect(page.locator('[data-entry="template"]')).toContainText('kit');
  // NO BLANK CARD outside Advanced mode (docs/GOALS_ARCHIVE.md "Student release" step 4).
  await expect(page.locator('[data-entry="blank"]')).toHaveCount(0);
  // CARDS ACT ON CLICK - no radio dot, no Continue button. One press, not two.
  await expect(page.locator('.wz-entry input[type="radio"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
  await page.locator('[data-entry="template"]').click();
  await expect(page.locator('.wz-browse-search')).toBeVisible();
});

test('a window too short for the step cues its overflow', async ({ page }) => {
  // 440px: the four start cards share one row since the 2026-09-27 entry pass, so the step's
  // scroll height at 1280 wide settles near 420px and a 500px window only just overflows
  // (measured: 2px). The premise below needs a window that is clearly too short.
  await entryStepAt(page, 1280, 440);

  // The premise: this window really is too short. Without it the two assertions below would
  // pass vacuously the day the step grows a scrollbar it should not have.
  expect(await stepOverflowPx(page)).toBeGreaterThan(0);

  const step = page.locator('.wz-step');
  await expect(step).toHaveAttribute('data-overflow');
  await expect(page.locator('.wz-step-fade')).toHaveCSS('opacity', '1');

  // Scrolled to the bottom there is nothing left to cue, so the fade retires.
  await step.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(step).not.toHaveAttribute('data-overflow');
  await expect(page.locator('.wz-step-fade')).toHaveCSS('opacity', '0');
});
