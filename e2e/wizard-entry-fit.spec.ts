import { test, expect, type Page } from '@playwright/test';

// The Entry step's HEIGHT BUDGET. Step 0 is the app's first screen, and it has to fit a
// short laptop window whole: `.wz-hero` carries the comment "every vertical margin here is
// budgeted - if you grow one, take the height from another", which nothing enforced until
// this spec. Growing a margin, a font size, or a card's padding past the budget shows up
// here as a scroller that overflows, or as the video strip clipped below the fold.
//
// The wizard auto-opens only on a first-ever visit (no autosaved project). Every test gets a
// fresh context, so a plain `goto('/app')` lands on the Entry step.

/** Open /app at a fixed window size and wait for the Entry step to be laid out. */
async function entryStepAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('[data-entry="video"]')).toBeVisible();
}

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
    await expect(page.locator('.wz-step button.primary')).toHaveText('Create');

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

  // THE ORDER IS THE RANKING (owner, 2026-09-27): your own AI coding agent, your own artwork,
  // a template, then the greyed video door. SAME SIZE AND SAME TREATMENT: no card is tinted
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
  expect(cards.map((c) => c.entry)).toEqual(['ai', 'import-graphic', 'template', 'video']);
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

test('the phone reads top to bottom: four equal cards, then the Playout row', async ({ page }) => {
  await entryStepAt(page, 375, 812);

  // The four-column row is a DESKTOP measure. On a phone the same four cards stack in the same
  // order, one size, each title on ONE line with its icon leading it - a wrapped title is what
  // turned these cards into screen-tall ragged blocks before - and the Playout row closes the
  // column with both actions side by side.
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
      actionsSideBySide: Math.abs(open.top - create.top) < 1 && open.right <= create.left + 0.5,
    };
  });
  const { cards } = layout;
  expect(cards.map((c) => c.entry)).toEqual(['ai', 'import-graphic', 'template', 'video']);
  expect(new Set(cards.map((c) => c.left)).size).toBe(1);
  expect(new Set(cards.map((c) => c.width)).size).toBe(1);
  expect(new Set(cards.map((c) => c.height)).size, `heights ${cards.map((c) => c.height)}`).toBe(1);
  for (let i = 1; i < cards.length; i++) expect(cards[i].top).toBeGreaterThanOrEqual(cards[i - 1].bottom);
  for (const c of cards) {
    expect(c.titleHeight, `${c.entry}: title wrapped`).toBeLessThan(c.titleLineHeight * 1.6);
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
  }
  // The Playout row comes after the last card and is flush with the column.
  expect(layout.playoutTop).toBeGreaterThan(cards[3].bottom);
  expect(layout.playoutLeft).toBe(cards[0].left);
  expect(layout.playoutWidth).toBe(cards[0].width);
  expect(layout.actionsSideBySide).toBe(true);
});

// ── WHAT THE STEP SAYS (re-design/handoff.md §2a) ───────────────────────────────────────
// The geometry above was brought over first and the CONTENT was not, so these pin the three
// differences that were closed - and, just as importantly, the three divergences from the
// reference that are DELIBERATE, so nobody restores the picture over the decision.

test('the hero names both routes to air and EVERY export target, in the sentence', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  const hero = page.locator('.wz-hero');
  // The landing page's headline, verbatim - the app repeating the promise word for word is
  // what makes the two surfaces read as one product.
  await expect(hero.locator('.wz-hero-title')).toHaveText('Make broadcast graphics. Run them live.');
  const sub = hero.locator('.wz-hero-sub');
  // THE CONTROLLER ROUTE IS NAMED, AND SO IS ITS MECHANISM. The step used to promise export
  // alone; naming the controller without saying how it reaches air reads as a platform the
  // studio has to move onto, when what it actually costs them is one browser source.
  await expect(sub).toContainText('Our controller runs the show live');
  await expect(sub).toContainText('one browser source your playout client loads once');
  // …and NOT as an "HTML overlay": that phrase is the name of an export TARGET (a folder of
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

/** Land on the Entry step with the Home row showing. The row appears only when there IS saved
 *  work - a first-ever visit gets no door to an empty room - so seed one graphic and reload. */
async function entryWithSavedWork(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
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
  const token = (property: string, value: string) =>
    page.evaluate(
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
  const amber = await token('border-color', 'var(--accent)');
  const fill = await token('background-color', 'var(--bg-2)');

  const IDENTITY = ['none', 'matrix(1, 0, 0, 1, 0, 0)'];
  const resting = await styleOf('.wz-continue-row');

  // THE REFERENCE: this is the answer the cards already give, stated first so everything below
  // is pinned to the CARDS' behaviour rather than merely to a pair of tokens. The `ai` card, not
  // the first one - `--primary` gives that one a tinted resting border of its own.
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

test('the video card is greyed and says in words that it is not recommended yet', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // Owner, 2026-09-27: the video door stays, the same size as the others, but greyed with a
  // short plain note. It makes a rendered FILE, not a live graphic, and says both.
  const card = page.locator('[data-entry="video"]');
  await expect(card.locator('.hint')).toContainText('Not recommended yet');
  await expect(card.locator('.hint')).toContainText('not a live graphic');
  // One signal, not two: the note replaces the old Beta tag.
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
    return { video: read('video'), other: read('import-graphic') };
  });
  expect(tone.video.title).not.toBe(tone.other.title);
  expect(tone.video.icon).not.toBe(tone.other.icon);
  expect(tone.video.fill).toBe('rgba(0, 0, 0, 0)');

  // Offline nothing is gated, so the greyed door still opens: greyed is "not yet", not broken.
  // Signed out (configured builds) the same button is `disabled` and its hint adds
  // "Sign in to try it." - the configured suite's anonymous visitor is where that state lives.
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
});

test('Open Playout goes to the productions list with none, and to the last used production', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // NONE: there is no production to open, so the list is the honest landing, where making one
  // is a press away.
  await page.locator('[data-entry="open-playout"]').click();
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
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="open-playout"]').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  expect(page.url()).toContain(`#/production/${lastId}`);
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

test('the AI door is marked Beta inside its title', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // The tag lives INSIDE the title, so the card's fixed-height title row is what has to absorb
  // it - a tag that wrapped the title would push this card's copy off the y its row-mates' sit
  // at. (The video door carried one too until it was greyed; its note replaced it.)
  await expect(page.locator('[data-entry="ai"] .wz-beta-tag')).toHaveText('Beta');
  const rows = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const strong = el.querySelector('strong')!;
      return {
        entry: (el as HTMLElement).dataset.entry,
        titleHeight: strong.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(strong).lineHeight),
        hintTop: Math.round(el.querySelector('.hint')!.getBoundingClientRect().top - el.getBoundingClientRect().top),
      };
    }),
  );
  for (const row of rows) {
    expect(row.titleHeight, `${row.entry}: title wrapped`).toBeLessThan(row.lineHeight * 1.6);
    expect(row.hintTop, `${row.entry}: description offset`).toBe(rows[0].hintTop);
  }
});

test('the AI door says in words that it is still in testing', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // Owner, 2026-08-29: "we should have a warning about the AI creations... they're still in
  // the testing phase". The Beta tag alone is a label a reader carries their own meaning into;
  // what this door owes them before they open it is that the RESULT is not settled. Plainest
  // words, one line, and it LEADS the description - a caution after two sentences of what the
  // door does is a caution nobody reaches.
  const note = page.getByTestId('ai-testing-note');
  await expect(note).toHaveText('Still in testing - results vary.');
  const hint = page.locator('[data-entry="ai"] .hint');
  await expect(hint).toContainText('Still in testing');
  expect((await hint.innerText()).trim().startsWith('Still in testing')).toBe(true);

  // IT COSTS THE ENTRY GRID NOTHING. The note is inline inside `.hint`, so the card's three
  // reserved description lines still hold the whole of the copy; a fourth line grows the row
  // and pushes the video strip below the fold (the budget every other test in this file
  // guards). Measure the hint against the reserve rather than trusting the copy to stay short.
  const fits = await hint.evaluate((el) => {
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
    return { lines: el.getBoundingClientRect().height / lineHeight, lineHeight };
  });
  expect(fits.lines, `the AI hint needs ${fits.lines.toFixed(2)} lines of its 3-line reserve`)
    .toBeLessThanOrEqual(3.05);

  // The door is still OPEN. The owner offered disabling it too; labelling was chosen, and a
  // disabled card would be a pillar quietly removed rather than a caution added.
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
