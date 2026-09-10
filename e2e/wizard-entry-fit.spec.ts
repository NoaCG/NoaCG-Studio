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

test('the video strip is fully inside the scrollport at 1366x768', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // Geometry, not visibility: an element clipped away by a scrolling ancestor still reports
  // `toBeVisible()`, which is exactly how the strip shipped below the fold in the first place.
  const clipped = await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="wz-video-strip"]')!.getBoundingClientRect();
    const port = document.querySelector('.wz-step')!.getBoundingClientRect();
    return {
      above: strip.top < port.top - 0.5,
      below: strip.bottom > port.bottom + 0.5,
      left: strip.left < port.left - 0.5,
      right: strip.right > port.right + 0.5,
    };
  });
  expect(clipped).toEqual({ above: false, below: false, left: false, right: false });
});

test('the video card keeps a compact readable layout on mobile', async ({ page }) => {
  await entryStepAt(page, 390, 844);
  await page.locator('.wz-step').evaluate((el) => el.scrollTo(0, el.scrollHeight));

  const geometry = await page.locator('[data-entry="video"]').evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const icon = card.querySelector('.wz-entry-icon')!.getBoundingClientRect();
    const title = card.querySelector('strong')!.getBoundingClientRect();
    const hint = card.querySelector('.hint')!.getBoundingClientRect();
    return {
      cardHeight: rect.height,
      cardWidth: rect.width,
      hintWidth: hint.width,
      iconRight: icon.right,
      titleLeft: title.left,
      hintLeft: hint.left,
    };
  });

  expect(geometry.cardHeight).toBeLessThan(220);
  expect(geometry.hintWidth).toBeGreaterThan(geometry.cardWidth * 0.7);
  expect(geometry.iconRight).toBeLessThan(geometry.titleLeft);
  expect(Math.abs(geometry.titleLeft - geometry.hintLeft)).toBeLessThan(1);
});

test('the three mode cards fill the grid with no hole', async ({ page }) => {
  await entryStepAt(page, 1366, 768);

  // THE ALIGNMENT CONTRACT (re-design/handoff.md §2a). Before this, the icon sat on its own
  // line above the title and the grid sized each row to its tallest card, so the longest
  // description made row 1 taller than row 2 (measured: 179px against 138px) and every card's
  // copy began at a different offset. Geometry, because the defect is invisible to any
  // assertion about which elements exist.
  const cards = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const head = el.querySelector('.wz-entry-head').getBoundingClientRect();
      const icon = el.querySelector('.wz-entry-icon').getBoundingClientRect();
      const title = el.querySelector('strong').getBoundingClientRect();
      const hint = el.querySelector('.hint').getBoundingClientRect();
      return {
        entry: el.dataset.entry,
        left: r.left, width: r.width, height: r.height,
        // Where each block sits INSIDE its own card — the card-relative offsets are what has
        // to match across all four, since the two rows sit at different page positions.
        headTop: head.top - r.top,
        hintTop: hint.top - r.top,
        // Same row: the icon's box overlaps the title's vertically and precedes it.
        iconRight: icon.right, titleLeft: title.left,
        iconMidY: icon.top + icon.height / 2, titleMidY: title.top + title.height / 2,
      };
    }),
  );
  // THREE in the default studio since the kit card retired (its question moved into the
  // Browse step's build-mode switch); Advanced mode adds a fourth.
  expect(cards.map((c) => c.entry)).toEqual(['template', 'ai', 'import-graphic']);

  // NO HOLE. An odd count in a two-column grid would leave an empty cell that reads as a card
  // that failed to render, so the last card spans the row
  // (`.wz-entry-card:last-child:nth-child(odd)`).
  const round = (n: number) => Math.round(n);
  expect(round(cards[0].width)).toBe(round(cards[1].width));
  expect(round(cards[2].width)).toBeGreaterThan(round(cards[0].width) * 1.9);
  expect(round(cards[0].left)).toBe(round(cards[2].left));
  expect(round(cards[1].left)).toBeGreaterThan(round(cards[0].left));

  // THE PAIR SHARING A ROW ARE EQUAL; THE SPANNING CARD IS NOT MADE TO MATCH THEM. Equal
  // heights and the three-line description reserve both exist so cards SIDE BY SIDE line up.
  // A card that spans the row has no row-mate, so applying either to it is not alignment — it
  // is two empty lines of padding: "Import graphic" drew one line of copy inside a 130px box,
  // which reads as content that failed to load.
  expect(round(cards[0].height)).toBe(round(cards[1].height));
  expect(round(cards[2].height)).toBeLessThan(round(cards[0].height));

  for (const c of cards) {
    // The title row is one flex line: the icon precedes the title and shares its centreline.
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
    expect(Math.abs(c.iconMidY - c.titleMidY), `${c.entry}: icon on the title's line`).toBeLessThan(4);
    // Every card's copy starts at the same y INSIDE its own card — the whole point of the
    // fixed-height title row.
    expect(round(c.headTop), `${c.entry}: title row offset`).toBe(round(cards[0].headTop));
    expect(round(c.hintTop), `${c.entry}: description offset`).toBe(round(cards[0].hintTop));
  }

  // THE ROW-MATES STAY EQUAL WHEN ONE OUTGROWS THE RESERVE. With today's copy both fit the
  // three-line block, so the heights above would match even without `grid-auto-rows: 1fr` —
  // which would leave the rule that actually holds the row together unproven, and the day
  // someone writes a fourth line the ragged pair comes back. So force that day.
  const pair = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) => {
    els[0].querySelector('.hint').textContent = 'x '.repeat(220);
    return els.slice(0, 2).map((el) => Math.round(el.getBoundingClientRect().height));
  });
  expect(pair[1], `the row-mate followed: ${pair.join(', ')}`).toBe(pair[0]);
});

test('the mode cards stack into one column on a phone', async ({ page }) => {
  await entryStepAt(page, 390, 844);

  // The two-column grid is a DESKTOP measure. Left at two columns on a 390px screen each card
  // got a 164px column — about 110px of text beside the icon — so every title wrapped to two
  // lines with the icon floating against the middle of the block, and the descriptions ran
  // seven to eleven lines of two-word rows. Measured then: four cards 291px tall each.
  const cards = await page.locator('.wz-entry .wz-entry-card').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const title = el.querySelector('strong').getBoundingClientRect();
      const icon = el.querySelector('.wz-entry-icon').getBoundingClientRect();
      return {
        entry: el.dataset.entry,
        left: Math.round(r.left), width: Math.round(r.width), top: Math.round(r.top),
        titleHeight: title.height,
        titleLineHeight: parseFloat(getComputedStyle(el.querySelector('strong')).lineHeight),
        iconRight: icon.right, titleLeft: title.left,
      };
    }),
  );
  expect(cards).toHaveLength(3);

  // One column: every card shares a left edge and a width, and each starts below the last.
  expect(new Set(cards.map((c) => c.left)).size).toBe(1);
  expect(new Set(cards.map((c) => c.width)).size).toBe(1);
  const tops = cards.map((c) => c.top);
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);

  for (const c of cards) {
    // ONE line of title. This is the assertion that fails the day the column narrows again —
    // a wrapped title is what turns these cards back into screen-tall ragged blocks.
    expect(c.titleHeight, `${c.entry}: title wrapped`).toBeLessThan(c.titleLineHeight * 1.6);
    // And the icon still leads that line rather than floating beside a block.
    expect(c.iconRight, `${c.entry}: icon before title`).toBeLessThanOrEqual(c.titleLeft);
  }
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
  await expect(hero.locator('.wz-hero-title')).toHaveText('Create live graphics. Run the show.');
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

test('the Home row carries its two section shortcuts', async ({ page }) => {
  // The row appears only when there IS saved work - a first-ever visit gets no door to an
  // empty room. Seed one graphic, then reload onto Entry.
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
  const row = page.getByTestId('wz-continue');
  await expect(row).toBeVisible();

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

test('the video strip is one line, quieter than any shipped mode', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  const card = page.locator('[data-entry="video"]');
  // ONE LINE: icon, title, Beta tag and the hint all share a centreline. It was a full card
  // with a three-line hint, giving the BETA side-door more vertical weight than "Import
  // graphic", a shipped mode.
  const shape = await card.evaluate((el) => {
    const mid = (n: Element) => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; };
    return {
      height: el.getBoundingClientRect().height,
      titleMid: mid(el.querySelector('strong')!),
      hintMid: mid(el.querySelector('.hint')!),
      hintLines: el.querySelector('.hint')!.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el.querySelector('.hint')!).lineHeight),
    };
  });
  expect(Math.abs(shape.titleMid - shape.hintMid)).toBeLessThan(4);
  expect(shape.hintLines).toBeLessThan(shape.lineHeight * 1.6);
  // …and shorter than every mode card above it, which is what "quieter" means in geometry.
  const modeHeight = await page.locator('.wz-entry .wz-entry-card').first()
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(shape.height).toBeLessThan(modeHeight);

  // FLUSH WITH THE GRID, and no label outside the card. "Not a live graphic?" used to lead the
  // strip and indented the card 160px, so the one row that is not aligned with the cards above
  // was the row already set apart by a dashed rule - the offset read as a layout fault. The
  // distinction it carried is the first words of the card's own hint instead.
  await expect(page.locator('.wz-video-strip-label')).toHaveCount(0);
  await expect(card.locator('.hint')).toContainText('Not a live graphic');
  const edges = await page.evaluate(() => {
    const video = document.querySelector('[data-entry="video"]')!.getBoundingClientRect();
    const grid = document.querySelector('.wz-entry')!.getBoundingClientRect();
    return { videoLeft: Math.round(video.left), gridLeft: Math.round(grid.left),
             videoWidth: Math.round(video.width), gridWidth: Math.round(grid.width) };
  });
  expect(edges.videoLeft).toBe(edges.gridLeft);
  expect(edges.videoWidth).toBe(edges.gridWidth);
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
  await expect(hint).toContainText('Describe the graphic you need');
  await expect(hint).not.toContainText(/NoaCG Lite|Free with|included/);
});

test('both AI doors are marked Beta', async ({ page }) => {
  await entryStepAt(page, 1366, 768);
  // The video door has said Beta since it shipped; "Create with AI" is the same kind of
  // promise and was the only unmarked one. The tag lives INSIDE the title, so the card's
  // fixed-height title row is what has to absorb it - a tag that wrapped the title would
  // push this card's copy off the y its row-mate's sits at.
  for (const entry of ['ai', 'video']) {
    await expect(page.locator(`[data-entry="${entry}"] .wz-beta-tag`)).toHaveText('Beta');
  }
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
  // 500px, where this used to say 620: the §2a content pass shortened the step (the video
  // strip became one line, and the odd spanning card stopped reserving three lines of hint it
  // has no copy for), so 1280x620 now FITS and the premise below stopped being true. Measured
  // after the change: the step's content settles at 461px, so it overflows below ~560.
  await entryStepAt(page, 1280, 500);

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
