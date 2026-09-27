// covers: src/ai/pro/custom/**
//
// creative-routing covers the mode + intent ROUTER and the brief-satisfaction check, both
// of which live here - it was previously nightly-only for src/ai changes, which is exactly
// the surface it exists to protect.
// Phase A's composer (docs/NOACG_PRO_PLAN.md §15.5). Listed BEFORE the generic pro rule and
// union'd with it: the language path shares nothing with the concept-and-compile pipeline
// pro.spec.ts covers, so its guarantees had no gate at all until this spec existed.
// covers: src/ai/pro/language/**
//
// …and the platform HALF of that composer, which since Phase B (§15.9) is the graphic-type registry
// and two category assemblers rather than one. A Pro sponsor bug is compiled through
// `types/bugs.ts` and a Pro countdown through `types/clocks.ts`, and both take their mark placement
// from the shared logo slot - so a change to any of them can break a Pro package while every
// catalog spec stays green, which is exactly the mapping hole this file exists to close. Union'd
// with the `src/templates` covers line.
// covers: src/templates/{types/{bugs,clocks,graphicType,registry}.ts,shared/{logoSlot,standard}.ts,{cornerBug,gameTimers,lowerThirds}/shared.ts}
//
// The Pro brief bank feeds the spike runner and scripts/lite-on-pro-bank.mjs; the offline
// product flow it relates to is Phase A's composer, pinned by pro-language.spec.ts. (Until
// 2026-08-15 this pointed at pro.spec.ts and the fixture bank beside it - both belonged to the
// retired concept-and-reconstruct engine.)
// covers: benchmarks/pro/**
//
// PHASE A's COMPOSER, gated (docs/NOACG_PRO_PLAN.md §15.5, src/ai/pro/language/).
//
// WHY THIS EXISTS. The composer's whole claim is that the platform owns the panel, so the layout
// failure classes cannot occur - and until now that claim was checked only by control runs a
// human started by hand (`node scripts/pro-spike.mjs --control`). Nothing in CI would have caught
// a regression, and the faults this file pins are ones that ALREADY happened: an accent rule with
// no width to be, a block that stretched to the name's width, a supporting line too thin to read.
// Every one of them built green, and two of them reached a paid round.
//
// It composes the four hand-written languages in `stub.ts` because they are deliberately far
// apart - a solid edge-bar package, a carbon block strap, a panel-free serif super, a rounded
// blurred one - so a fault in any branch of the composer shows here rather than in whichever
// branch the house language happens to take.
//
// Free: no model call, no tokens. The instruments are the same ones a paid round is scored by.
//
// WHAT IS PROVEN AND WHAT IS NOT. Four of the five tests were mutation-checked against the code
// they guard, and each failed exactly its own test and nothing else: removing the accent rule's
// width, letting the accent block stretch instead of hugging, painting the block's ink in the
// panel colour again, dropping the supporting-weight floor, and breaking the padding's symmetry.
// **The stress test is NOT falsifiable from the design layer and says so here rather than
// pretending otherwise** - forcing a line to stop wrapping, fixing the box's width, and lengthening
// the name past the auto-fit cap all leave it green, because the assembler's mask and cap catch
// the overflow first. It is kept as a net for a STRUCTURAL change (removing the mask idiom, the
// `width: fit-content`, or the wrap cap), which is the only thing that could actually break it -
// and it is the one that would matter most.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** A wordmark, so the LOGO path is exercised: the shared slot gathers the design's lines into a
 *  plain block container, which is precisely where a cross-axis alignment stops working. */
const MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">'
  + '<rect x="0" y="26" width="64" height="14" fill="#ffffff"/>'
  + '<text x="90" y="76" font-family="Arial" font-size="58" font-weight="700" fill="#ffffff">Meridian</text></svg>';

interface Measured {
  name: string;
  panel: string | null;
  padding: { top: number; right: number; bottom: number; left: number } | null;
  escapes: { desc: string; side: string; px: number; isText: boolean }[];
  spacingCodes: string[];
  proportionCodes: string[];
  nearMisses: number;
  /** Widths of the two line masks, so "the block hugs its words" is measurable. */
  lineWidths: number[];
  /** The supporting line's painted colour and weight. */
  supporting: { color: string; weight: string } | null;
  /** The accent element's painted width, when the language draws one. */
  accentWidth: number | null;
  /** Lines whose text is wider than the mask holding it - CUT OFF at rest. */
  clipped: string[];
}

/**
 * Compose every stub language with a real mark seated, render it, and measure the settled frame
 * with the production instruments. One page evaluate for the whole set - mounting four iframes is
 * far cheaper than four round trips.
 */
async function measureLanguages(
  page: Page, options: { stress?: boolean; logo?: boolean } = {},
): Promise<Measured[]> {
  const { stress = false, logo = true } = options;
  return page.evaluate(async ([svg, useStress, useLogo]) => {
    const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts');
    const { composeFromLanguage } = await import('/src/ai/pro/language/compose.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts');
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts');

    const dataUrl = `data:image/svg+xml;base64,${btoa(svg as string)}`;
    // LONG ENOUGH TO PASS THE AUTO-FIT CAP on its own, which is the whole point of a stress
    // value: a name that still fits proves nothing about wrapping.
    const name = useStress ? 'Priya Raghunathan-Vasquez de la Cruz-Whittington' : 'Alexandra Riva';
    // A SHORT supporting line beside a long name: the case where a block that does not hug its
    // words shows it, and the case a two-line panel is widest on.
    const role = useStress ? 'Senior Research Fellow, Centre for Comparative Media Policy' : 'Host';

    const out = [];
    for (const language of STUB_LANGUAGES) {
      const { template } = composeFromLanguage(language, {
        lines: [{ title: 'Name', sample: name }, { title: 'Role', sample: role }],
        ...(useLogo ? { logo: { assetPath: 'images/mark.svg', images: [{ path: 'images/mark.svg', data: dataUrl }] } } : {}),
      });
      document.getElementById('pl-frame')?.remove();
      const frame = document.createElement('iframe');
      frame.id = 'pl-frame';
      frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
        + 'z-index:99999;background:#333;color-scheme:dark;';
      document.body.appendChild(frame);
      frame.srcdoc = composeDocument(template);
      await new Promise((resolve) => { frame.onload = resolve; });
      const win = frame.contentWindow as Window & {
        update: (json: string) => void;
        play: () => void;
      };
      const doc = frame.contentDocument as Document;
      try {
        win.update(JSON.stringify({ f0: name, f1: role }));
        win.play();
      } catch { /* a graphic that throws in its own lifecycle still paints - measure that */ }
      await doc.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 900));

      const spacing = measureSpacing(doc);
      const proportion = measureProportion(doc);
      const axis = measureAxes(doc);
      const masks = [...doc.querySelectorAll('.lower-third-mask')];
      const title = doc.getElementById('f1');
      const accent = doc.querySelector('.lower-third-accent');
      out.push({
        name: language.name,
        panel: spacing.panel,
        padding: spacing.padding,
        escapes: spacing.escapes,
        spacingCodes: spacing.findings.map((f) => f.code),
        proportionCodes: proportion.findings.map((f) => f.code),
        nearMisses: axis.nearMisses.length,
        lineWidths: masks.map((m) => Math.round(m.getBoundingClientRect().width)),
        supporting: title
          ? {
            color: win.getComputedStyle(title).color,
            weight: win.getComputedStyle(title).fontWeight,
          }
          : null,
        accentWidth: accent ? Math.round(accent.getBoundingClientRect().width) : null,
        // A mask exists so a line can animate in from behind its edge; at REST nothing should be
        // behind it. scrollWidth past clientWidth is the browser saying the words do not fit.
        clipped: masks.filter((m) => m.scrollWidth > m.clientWidth + 1)
          .map((m) => m.textContent?.trim().slice(0, 40) ?? ''),
      });
      frame.remove();
    }
    return out;
  }, [MARK, stress, logo] as [string, boolean, boolean]) as Promise<Measured[]>;
}

test.describe('the platform owns the Phase A panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  test('every language composes with no instrument finding, and its padding is symmetric', async ({ page }) => {
    const measured = await measureLanguages(page);
    expect(measured).toHaveLength(4);

    for (const m of measured) {
      // The claim §15.5 makes: the layout failure classes cannot occur, by construction.
      expect(m.spacingCodes, `${m.name} spacing`).toEqual([]);
      expect(m.proportionCodes, `${m.name} proportion`).toEqual([]);
      expect(m.escapes, `${m.name} escapes`).toEqual([]);
      expect(m.nearMisses, `${m.name} alignment near-misses`).toBe(0);

      // Opposite sides EQUAL, which is what retires padding-lopsided structurally rather than by
      // clearing a 2.6x limit. A panel-free super reports no padding at all, and that is correct.
      if (m.padding) {
        expect(m.padding.top, `${m.name} vertical padding`).toBeCloseTo(m.padding.bottom, 1);
        expect(m.padding.left, `${m.name} horizontal padding`).toBeCloseTo(m.padding.right, 1);
      }
    }
  });

  test('a long name and a long role wrap inside the panel instead of escaping it', async ({ page }) => {
    const measured = await measureLanguages(page, { stress: true });

    for (const m of measured) {
      // THE structural guarantee: the box is `width: fit-content` under the category's auto-fit
      // cap, so it is sized BY its text. Stress values make it wrap and grow, never overflow.
      expect(m.escapes, `${m.name} under stress`).toEqual([]);
      expect(m.spacingCodes, `${m.name} under stress`).not.toContain('text-escapes-panel');

      // AND NOTHING IS CUT OFF, which is the assertion with teeth. Escaping the panel is very
      // hard to cause from the design layer - the mask clips first, and the instrument now reads
      // the VISUAL rect, so a line too long for its box reports as cut off rather than as text on
      // the picture. That makes "cut off" the failure a regression here would actually produce:
      // a line that stops wrapping (one `white-space: nowrap`) grows to the auto-fit cap and
      // loses its tail, silently, on the longest names a real operator types.
      expect(m.clipped, `${m.name} lines cut off at rest`).toEqual([]);
    }
  });

  test('an accent the language asks for is actually painted', async ({ page }) => {
    // WITHOUT a logo, deliberately. The shared logo slot gathers the lines into a GRID, whose
    // items stretch by default - so the fault only exists in the flex-column arrangement a
    // markless graphic gets, and a spec that renders only the marked case cannot see it. That was
    // this very test, until a mutation of the accent's width failed to fail it.
    const measured = await measureLanguages(page, { logo: false });
    const withAccent = measured.filter((m) => m.accentWidth !== null);

    // Three of the four stub languages draw an accent ELEMENT (the fourth backs its supporting
    // line instead). Every one of them must have a width: an empty div in a flex column aligned
    // to the reading edge has nothing to be as wide as, and two of these rendered INVISIBLE
    // until the free control run put them on screen.
    expect(withAccent.length).toBeGreaterThan(0);
    for (const m of withAccent) {
      expect(m.accentWidth, `${m.name} accent`).toBeGreaterThan(0);
    }
  });

  test('the accent block hugs its own words and takes an ink measured against the accent', async ({ page }) => {
    const measured = await measureLanguages(page);
    // The one stub language whose accent form is `block` - it backs the supporting line, so it
    // draws no accent element and its second line is the thing carrying the accent colour.
    const block = measured.find((m) => m.accentWidth === null && m.supporting);
    expect(block, 'a block-accent language is in the stub set').toBeTruthy();

    // "Host" beside "Alexandra Riva": a block that stretches to the name's width is the fault the
    // blind read named ("the orange background should scale with the text length"). It relied on
    // a cross-axis alignment, which is inert once the shared logo slot gathers the lines into a
    // plain block container - which is exactly the arrangement this spec renders.
    expect(block!.lineWidths[1], `${block!.name} block width`).toBeLessThan(block!.lineWidths[0]);

    // …and its ink is the measured-readable neutral, never the panel colour.
    expect(['rgb(0, 0, 0)', 'rgb(255, 255, 255)']).toContain(block!.supporting!.color);
    // A label on a solid slab carries the block weight floor.
    expect(Number(block!.supporting!.weight)).toBeGreaterThanOrEqual(600);
  });

  /**
   * THE WEIGHT FLOOR IS NOT A FUNCTION OF SIZE, AND IT USED TO BE (docs/NOACG_PRO_PLAN.md §25.8.5).
   *
   * `medium` applied only below 30px, reasoning from the 2026-08-15 read that a hairline stroke is
   * a SMALL-text problem. Re-judging the paid corpus against the owner's ratified floor of 500 said
   * otherwise: 33 of the 40 readings rule 4 raised were the countdown's label at 38px weight 400 -
   * above the old boundary, therefore exempt - and two of the four rows he named are a 54px name
   * and an 80px clock, both at 400. So this pins the floor at every size, on BOTH lines: a spec
   * asserting the old exemption is what caught the change, which is the point of pinning it.
   */
  test('no informational line is set under the weight floor, whatever size it is', async ({ page }) => {
    const floors = await page.evaluate(async () => {
      const { resolveSpacing } = await import('/src/ai/pro/language/structure.ts');
      const { HOUSE_LANGUAGE } = await import('/src/ai/pro/language/contract.ts');
      const t = HOUSE_LANGUAGE.typography;
      const at = (step: 'subtle' | 'clear' | 'strong') => resolveSpacing({
        ...HOUSE_LANGUAGE,
        typography: {
          ...t, step, supportingWeight: 'regular', headingWeight: 'regular',
        },
      });
      const heavy = resolveSpacing({
        ...HOUSE_LANGUAGE,
        typography: { ...t, supportingWeight: 'bold', headingWeight: 'black' },
      });
      return {
        // 26px - the size the graphic the owner called illegible was set at.
        clear: { px: at('clear').supportingPx, weight: at('clear').supportingWeight },
        // 33px - above the boundary the floor USED to stop at.
        subtle: { px: at('subtle').supportingPx, weight: at('subtle').supportingWeight },
        // The heading carries it too: an 80px clock at weight 400 was one of the named rows.
        heading: { px: at('clear').headingPx, weight: at('clear').headingWeight },
        // …and the floor is a boundary, not a repair: a heavier ask is untouched.
        heavy: { supporting: heavy.supportingWeight, heading: heavy.headingWeight },
      };
    });

    expect(floors.clear.px).toBeLessThan(30);
    expect(floors.clear.weight, 'small supporting text is raised off regular').toBeGreaterThanOrEqual(500);
    expect(floors.subtle.px).toBeGreaterThanOrEqual(30);
    expect(floors.subtle.weight, 'and so is a supporting line above the old 30px boundary')
      .toBeGreaterThanOrEqual(500);
    expect(floors.heading.px).toBeGreaterThan(floors.clear.px);
    expect(floors.heading.weight, 'the heading carries the same floor at any size')
      .toBeGreaterThanOrEqual(500);
    expect(floors.heavy.supporting, 'a language asking for more keeps what it asked for').toBe(700);
    expect(floors.heavy.heading).toBe(900);
  });

  /**
   * THE MARK IS KNOCKED, NEVER PLATED (owner, 2026-08-16, §17.1).
   *
   * The read of the first accepted Pro set objected to the BOX, not to the repair: *"the
   * background of a logo should always be transparent… the logo could be on top of the banner
   * itself"*, while lt07's blue well and ls10's red well were both liked. A well the DESIGN draws
   * is composition; a neutral field the PLATFORM paints is a patch. So a single-ink mark that
   * cannot be read is recoloured to the one ink that can, and a full-colour mark keeps its
   * colours and waits for a design that offers it a well.
   *
   * The three probes below are the three cases the ruling turns on, and the middle one is the
   * whole reason the trigger can be trusted: an older MEAN-luminance signal flagged the coloured
   * roundel, a rendered A/B showed a field made it worse, and the owner's blind read had passed
   * it. `inkSpread` separates the two by two orders of magnitude, so a drift that widens the
   * single-ink band fails HERE rather than quietly knocking the colour out of somebody's logo.
   */
  test('the mark ink is knocked on the ink that vanishes, and a coloured mark is left alone', async ({ page }) => {
    const cases = await page.evaluate(async () => {
      const { composeFromLanguage } = await import('/src/ai/pro/language/compose.ts');
      const { HOUSE_LANGUAGE } = await import('/src/ai/pro/language/contract.ts');
      // A dark panel, which is what every one of the flagged cells had.
      const language = {
        ...HOUSE_LANGUAGE,
        palette: { ...HOUSE_LANGUAGE.palette, panel: '#101828' },
        shape: { ...HOUSE_LANGUAGE.shape, panel: 'solid' as const },
      };
      const compose = (
        probe: { inkLuminance: number; inkSpread?: number; backing?: 'transparent' | 'own-field' },
        markField?: boolean,
      ) => composeFromLanguage(language, {
        lines: [{ title: 'Name', sample: 'Alexandra Riva' }, { title: 'Role', sample: 'Host' }],
        logo: {
          assetPath: 'images/mark.svg',
          images: [{ path: 'images/mark.svg', data: 'data:image/svg+xml;base64,' }],
          backing: 'transparent' as const,
          ...probe,
        },
        ...(markField === undefined ? {} : { markField }),
      });
      const codes = (r: { adjustments: string[] }) => r.adjustments;
      return {
        // The institutional MONOGRAM: one dark ink on a dark panel, 1.00:1 - invisible.
        monogram: codes(compose({ inkLuminance: 0.02, inkSpread: 0.0004 })),
        // The consumer ROUNDEL: several inks, a mid-tone mean that measures badly and reads fine.
        roundel: codes(compose({ inkLuminance: 0.491, inkSpread: 0.2053 })),
        // A probe from before `inkSpread` existed: cannot tell, so do not touch it.
        older: codes(compose({ inkLuminance: 0.02 })),
        // …and the option is still an option, for an A/B or a re-ruling.
        monogramOptedOut: codes(compose({ inkLuminance: 0.02, inkSpread: 0.0004 }, false)),
        css: compose({ inkLuminance: 0.02, inkSpread: 0.0004 }).template.css,
        // The as-is screen's verdict on the knocked graphic, measured through the REAL screen on
        // the REAL emit rather than against a copy of the pattern kept here.
        integrity: await (async () => {
          const { assetIntegrityFindings } = await import('/src/ai/assetIntegrity.ts');
          const knocked = compose({ inkLuminance: 0.02, inkSpread: 0.0004 }).template;
          return assetIntegrityFindings(knocked, ['images/mark.svg']).map((f) => f.rule);
        })(),
      };
    });

    expect(cases.monogram, 'a single dark ink on a dark panel is knocked').toContain('mark_ink_knocked');
    expect(cases.roundel, 'a coloured mark keeps its colours').not.toContain('mark_ink_knocked');
    expect(cases.older, 'no spread means cannot tell, and cannot tell means do not touch it')
      .not.toContain('mark_ink_knocked');
    expect(cases.monogramOptedOut, 'markField:false still composes the un-repaired graphic')
      .not.toContain('mark_ink_knocked');
    // THE MARK SITS ON THE PANEL. Both halves are pinned, because the objection was to the box:
    // the recolour is emitted, and nothing paints a surface behind the artwork.
    expect(cases.css, 'the one ink that reads').toContain('filter: brightness(0) invert(1)');
    expect(cases.css, 'no plate, no band, no column of its own')
      .not.toMatch(/\.lower-third-logo[^{]*\{[^}]*background:/);
    // …and the exact shape the as-is screen admits. A knock that screen would refuse is a knock
    // that ships a blocking validation error on every branded Pro graphic - the two rules are
    // written in different files and only meet here.
    expect(cases.integrity, 'the platform\'s own knock passes the as-is screen').toEqual([]);
  });

  /**
   * DOES IT SURVIVE THE PICTURE (§17.2)?
   *
   * The defect this closes is one constant: `BROADCAST_BACKDROP` is a single near-black card, so
   * every contrast number in the repo was computed against the friendliest possible plate. The
   * owner read a panel-less super as unreadable over a busy mid-tone while every gate passed it.
   *
   * The MID-TONE case is the one pinned hardest, because it is the one a dark stand-in can never
   * see: a mid-grey ink passes on a night exterior AND on a blown-out sky, and vanishes in the
   * middle. An earlier version of this instrument required two failing plates and silenced
   * exactly this graphic; that is why the assertion below names the plate.
   */
  test('a graphic that only reads over kind footage says so, and a panelled one stays quiet', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const { composeFromLanguage } = await import('/src/ai/pro/language/compose.ts');
      const { HOUSE_LANGUAGE } = await import('/src/ai/pro/language/contract.ts');
      const lines = [{ title: 'Name', sample: 'Alexandra Riva' }, { title: 'Role', sample: 'Host' }];
      const notes = (language: Parameters<typeof composeFromLanguage>[0]) =>
        composeFromLanguage(language, { lines }).notes.filter((n) => n.startsWith('over the picture: '));
      return {
        // A mid-grey ink with NO surface under it - the shape that defeats a single dark stand-in.
        super: notes({
          ...HOUSE_LANGUAGE,
          palette: { ...HOUSE_LANGUAGE.palette, text: '#747453', textDim: '#8a8a85' },
          shape: { ...HOUSE_LANGUAGE.shape, panel: 'none' as const },
        }),
        // The same inks on a solid panel: the design knows its own backdrop, so nothing is owed.
        panelled: notes({
          ...HOUSE_LANGUAGE,
          palette: { ...HOUSE_LANGUAGE.palette, text: '#747453', textDim: '#8a8a85', panel: '#0d1117' },
          shape: { ...HOUSE_LANGUAGE.shape, panel: 'solid' as const },
        }),
        // A white super with no surface: fine on a night exterior, gone against a bright sky.
        whiteSuper: notes({
          ...HOUSE_LANGUAGE,
          palette: { ...HOUSE_LANGUAGE.palette, text: '#ffffff', textDim: '#f2f2f2' },
          shape: { ...HOUSE_LANGUAGE.shape, panel: 'none' as const },
        }),
      };
    });
    expect(out.super.join(' '), 'the mid-grey super names the MIDDLE plate')
      .toContain('a mid-tone shot');
    expect(out.super.length, 'both the heading and the supporting line are reported').toBe(2);
    expect(out.panelled, 'a solid panel is its own backdrop - nothing to report').toEqual([]);
    expect(out.whiteSuper.join(' '), 'a white super fails the bright plate, not the dark one')
      .toContain('a blown-out sky');
  });

  /**
   * THE LEDGER ROW CAN TELL A CLEAN GENERATION FROM A RESCUED ONE (§16, `gate.ts`).
   *
   * The defect this closes: the outcome report sent ERRORS only, so a graphic the platform had
   * repaired wrote an empty `validation_rule_codes` beside a `usable` status. The filter's two
   * halves are asymmetric on purpose and both are pinned - every error survives, and only
   * Pro's own warnings do.
   */
  test('the outcome carries every error and only the platform\'s own warnings', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { proRuleCodes, proLanguageFindings } = await import('/src/ai/pro/language/gate.ts');
      const codes = proRuleCodes({
        ok: false,
        errors: [{ rule: 'spx-missing-field', message: 'x' }, { rule: 'bench-overlap', message: 'y' }],
        warnings: [
          { rule: 'pro-palette-repaired', message: 'a' },
          { rule: 'bench-mark-unreadable', message: 'b' },
          { rule: 'bench-line-wrap', message: 'c' },
          { rule: 'pro-palette-repaired', message: 'a again' },
        ],
      });
      const findings = proLanguageFindings(
        {
          adjustments: ['palette_text_dim_lightness_clamped', 'mark_ink_knocked'],
          notes: ['mark ink knocked: the mark reads 1.01:1 on this panel'],
        },
        ['typography.fontId→space-grotesk'],
      );
      return { codes, findings: findings.map((f) => f.rule) };
    });

    // Errors: all of them, whoever raised them - an error is why the row says `failed`.
    expect(result.codes).toContain('spx-missing-field');
    expect(result.codes).toContain('bench-overlap');
    // Warnings: Pro's own, deduped; the chatty bench ones stay off a 30-slot wire.
    expect(result.codes).toContain('pro-palette-repaired');
    expect(result.codes.filter((c) => c === 'pro-palette-repaired')).toHaveLength(1);
    expect(result.codes).not.toContain('bench-mark-unreadable');
    expect(result.codes).not.toContain('bench-line-wrap');
    // …and every platform divergence the composer records becomes one of those codes.
    expect(result.findings).toEqual(
      expect.arrayContaining(['pro-palette-repaired', 'pro-mark-knocked', 'pro-language-fallback']),
    );
  });
});

// ── PHASE B: the language drives a PACKAGE (§15.9) ─────────────────────────────────────────
//
// Everything above measures ONE graphic type. The claim Pro is sold on is that a design language
// renders across every graphic type a show needs, and the tests below are the ones that fail if
// that stops being true: a new type composing dirty, a package whose members stop sharing the
// decisions that make them siblings, and a stated brand palette the model gets a vote on.
test.describe('one design language, the whole package', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await page.locator('.topbar').waitFor();
  });

  test('every graphic type composes clean under its own calibrated thresholds', async ({ page }) => {
    const rows = await page.evaluate(async () => {
      const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts');
      const { composeGraphic, packageLines, PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts');
      const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts');

      const show = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
      const out: { graphic: string; language: string; codes: string[] }[] = [];
      for (const spec of PRO_GRAPHIC_LIST) {
        for (const language of STUB_LANGUAGES) {
          const lines = packageLines(spec.id, show);
          const { template } = composeGraphic(spec.id, language, { lines });
          document.getElementById('pkg-frame')?.remove();
          const frame = document.createElement('iframe');
          frame.id = 'pkg-frame';
          frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;'
            + 'z-index:99999;background:#333;color-scheme:dark;';
          document.body.appendChild(frame);
          frame.srcdoc = composeDocument(template);
          await new Promise((resolve) => { frame.onload = resolve; });
          const win = frame.contentWindow as Window & { update: (j: string) => void; play: () => void };
          const doc = frame.contentDocument as Document;
          const data: Record<string, string> = {};
          template.fields
            .filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')
            .forEach((f, i) => { data[f.field] = lines[i]?.sample ?? String(f.value ?? ''); });
          try {
            win.update(JSON.stringify(data));
            win.play();
          } catch { /* a graphic that throws still paints - measure that */ }
          await doc.fonts.ready;
          await new Promise((resolve) => setTimeout(resolve, 700));
          // THE TYPE's OWN thresholds - every calibrated number in both instruments was read off
          // the lower-third catalog, and measured over the shipped bugs and timers half of them
          // fail a threshold that is simply not about them (§15.9).
          const codes = [
            ...measureSpacing(doc, { ...(spec.instruments.spacing ?? {}) }).findings.map((f) => f.code),
            ...measureProportion(doc, { ...(spec.instruments.proportion ?? {}) }).findings.map((f) => f.code),
          ];
          out.push({ graphic: spec.id, language: language.name, codes });
          frame.remove();
        }
      }
      return out;
    });

    // Every composable graphic type x four deliberately far-apart languages. The count is
    // asserted (not merely iterated) so a type silently dropping out of the loop cannot read
    // as a pass - four types today, and the number follows the list.
    expect(rows).toHaveLength(4 * 4);
    expect(new Set(rows.map((r) => r.graphic)).size, 'every declared type was measured').toBe(4);
    for (const row of rows) {
      expect(row.codes, `${row.graphic} in ${row.language}`).toEqual([]);
    }
  });

  test('the package shares the decisions that make its members siblings', async ({ page }) => {
    const sets = await page.evaluate(async () => {
      const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts');
      const { composeGraphic, packageLines, PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts');
      const { resolveSpacing } = await import('/src/ai/pro/language/structure.ts');

      const show = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
      return STUB_LANGUAGES.map((language) => ({
        name: language.name,
        members: PRO_GRAPHIC_LIST.map((spec) => {
          const { template } = composeGraphic(spec.id, language, {
            lines: packageLines(spec.id, show),
          });
          const s = resolveSpacing(language, spec.id);
          // Read off the emitted `:root` contract - what the graphic is actually drawn in,
          // never what it was asked for.
          const root = /:root\s*\{([\s\S]*?)\}/.exec(template.css)?.[1] ?? '';
          const varOf = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1].trim() ?? null;
          return {
            graphic: spec.id,
            accentPx: s.accentPx,
            cornerPx: s.cornerPx,
            accent: varOf('accent'),
            panelBg: varOf('panel-bg'),
            text: varOf('text-color'),
            font: varOf('font-heading'),
            // …and the anchor sizes must DIFFER, or "coherent" would just mean "identical".
            primaryPx: s.headingPx,
          };
        }),
      }));
    });

    for (const set of sets) {
      const [first, ...rest] = set.members;
      for (const member of rest) {
        // THE SIBLING RULE, made structural (DESIGN_LANGUAGE §8): the accent's weight and the
        // corner radius are resolved against the PACKAGE unit, not against each graphic's own
        // anchor, so all three carry one bar and one corner language.
        //
        // KNOWN LIMIT, and it is worth knowing what this assertion does NOT cover (§15.9, the
        // 2026-08-16 blind read): equal px is not equal PERCEIVED weight. The countdown's panel
        // is ~45% taller than the strap's, so the same 16px bar reads at 0.073 of its panel
        // against the strap's 0.106 - the owner saw it and this test passes straight through it.
        // Left as it is by his ruling (record, change nothing); a guard that pins the rule we
        // chose is still the right guard, as long as nobody reads it as pinning the appearance.
        expect(member.accentPx, `${set.name} ${member.graphic} accent weight`).toBe(first.accentPx);
        expect(member.cornerPx, `${set.name} ${member.graphic} corner radius`).toBe(first.cornerPx);
        // One palette and one typeface across the set - the same four roles, the same face.
        expect(member.accent, `${set.name} ${member.graphic} accent colour`).toBe(first.accent);
        expect(member.panelBg, `${set.name} ${member.graphic} surface`).toBe(first.panelBg);
        expect(member.text, `${set.name} ${member.graphic} text colour`).toBe(first.text);
        expect(member.font, `${set.name} ${member.graphic} typeface`).toBe(first.font);
      }
      // COHERENT IS NOT IDENTICAL. A corner mark's caption, a strap's name and a clock's digits
      // are three different sizes on purpose; if this ever collapsed, every assertion above would
      // still pass while the package had stopped being a package.
      const sizes = new Set(set.members.map((m) => m.primaryPx));
      expect(sizes.size, `${set.name} anchors differ per type`).toBe(set.members.length);
    }
  });

  test('a new type is composed THROUGH its registry declaration, machine and all', async ({ page }) => {
    const built = await page.evaluate(async () => {
      const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts');
      const { composeGraphic, packageLines } = await import('/src/ai/pro/language/graphics.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');

      const show = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
      const timer = composeGraphic('countdown', STUB_LANGUAGES[0], {
        lines: packageLines('countdown', show),
      });
      const bug = composeGraphic('sponsor-bug', STUB_LANGUAGES[0], {
        lines: packageLines('sponsor-bug', show),
      });
      const card = composeGraphic('topic-card', STUB_LANGUAGES[0], {
        lines: packageLines('topic-card', show),
      });
      const machine = parseAnimData(timer.template.js)?.machine ?? null;
      return {
        cardTypeId: card.variant.typeId,
        // The topic-card type's own contract: its declared line fields, no mark compiled when
        // none was supplied.
        cardFields: card.template.fields.map((f) => `${f.field}:${f.ftype}`),
        timerVariantId: timer.variant.id,
        timerTypeId: timer.variant.typeId,
        // The countdown type declares a PARALLEL pause/resume group and two control events. A
        // graphic composed through the category alone would carry neither.
        groupIds: machine?.groups.map((g) => g.id) ?? [],
        controlEvents: (machine?.controls ?? []).map((c) => c.event),
        // The type's own field contract, in the type's own order: a label then a duration.
        timerFields: timer.template.fields.map((f) => `${f.field}:${f.ftype}`),
        // …and the bug's: a caption, then the mark LAST (the shared slot derives its id from the
        // count of everything else).
        bugFields: bug.template.fields.map((f) => `${f.field}:${f.ftype}`),
        bugTypeId: bug.variant.typeId,
      };
    });

    expect(built.timerTypeId).toBe('countdown');
    expect(built.bugTypeId).toBe('sponsor-bug');
    expect(built.cardTypeId).toBe('topic-card');
    expect(built.cardFields, 'the topic-card type\'s own declared line fields')
      .toEqual(['f0:textfield', 'f1:textfield', 'f2:textfield']);
    expect(built.groupIds, 'the countdown carries its declared parallel clock group').toContain('clock');
    expect(built.controlEvents, 'and the buttons that drive it').toEqual(
      expect.arrayContaining(['pause', 'resume']),
    );
    expect(built.timerFields).toEqual(['f0:textfield', 'f1:number']);
    expect(built.bugFields).toEqual(['f0:textfield', 'f1:filelist']);
  });

  /**
   * THE TWO PACKAGE RULES CI CAN ACTUALLY REACH.
   *
   * The Pro DOOR exists only on a backend-configured deployment, so the wizard walk is pinned in
   * `e2e/configured/pro-wizard.spec.ts` - a suite that runs on demand with credentials and never
   * in CI. Anything whose only coverage lives there ships its regressions silently, which is why
   * both rules below were moved OUT of the AI step and into modules an offline spec can call:
   * `namedPackage` (graphics.ts) and the `proPackage` normalizer (settings.ts).
   */
  test('every member of a package is named for what it is, and a package of one is untouched', async ({ page }) => {
    const named = await page.evaluate(async () => {
      const { STUB_LANGUAGES } = await import('/src/ai/pro/language/stub.ts');
      const { composeGraphic, namedPackage, packageLines, PRO_GRAPHIC_LIST } = await import('/src/ai/pro/language/graphics.ts');
      const show = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
      const language = STUB_LANGUAGES[0];
      const members = PRO_GRAPHIC_LIST.map((spec) => ({
        id: spec.id,
        template: composeGraphic(spec.id, language, { lines: packageLines(spec.id, show) }).template,
      }));
      return {
        languageName: language.name,
        // Every composed graphic arrives carrying the LANGUAGE's name - which is the defect this
        // rule exists to fix, and asserting it is what stops the test passing vacuously.
        before: members.map((m) => m.template.name),
        set: namedPackage(members, language.name).map((m) => m.template.name),
        // A package of one has nothing to tell apart.
        alone: namedPackage(members.slice(0, 1), language.name).map((m) => m.template.name),
      };
    });

    // The premise: without the rule, every member is the same word.
    expect(new Set(named.before).size, 'a composed graphic takes the language name').toBe(1);
    // …and with it, each says which graphic it is. That name is the export slug and the template
    // FOLDER an operator reads in the playout server, so identical ones is not a caption
    // problem - it is a package that cannot be operated once it leaves the wizard. Asserted over
    // the FULL composable list, so the naming rule holds for a bench-only type (the topic card)
    // before it ever enters the default package.
    expect(named.set).toEqual([
      `${named.languageName} lower third`,
      `${named.languageName} sponsor bug`,
      `${named.languageName} countdown`,
      `${named.languageName} topic card`,
    ]);
    expect(new Set(named.set).size, 'no two members share a name').toBe(4);
    // A single result keeps the shipped behaviour: the language's own name, unsuffixed.
    expect(named.alone).toEqual([named.languageName]);
  });

  test('the stored package is normalized: known ids, package order, and empty means all', async ({ page }) => {
    const cases = await page.evaluate(async () => {
      const { loadAiSettings, saveAiSettings } = await import('/src/ai/settings.ts');
      // The PACKAGE ids, not everything the composer knows: a type between its two steps
      // (composable, read pending - the topic card today) must never enter a stored package.
      const { PRO_PACKAGE_IDS } = await import('/src/ai/pro/language/structure.ts');
      const read = (stored: unknown) => {
        localStorage.setItem('spx-gfx-ai', JSON.stringify({ proPackage: stored }));
        return loadAiSettings().proPackage;
      };
      const out = {
        // Nothing stored - every setting written before this field existed.
        missing: read(undefined),
        // The user unticked the last box, or a hand-edited value.
        empty: read([]),
        // Ticked out of order, an id from a build that offered something else, and a type that
        // COMPOSES but has not passed its read - both classes must normalize away identically.
        outOfOrder: read(['countdown', 'ghost-type', 'topic-card', 'lower-third']),
        all: [...PRO_PACKAGE_IDS],
        saved: [] as string[],
      };
      // The SAVE side normalizes too, or the stored value and the loaded one disagree.
      localStorage.setItem('spx-gfx-ai', '{}');
      saveAiSettings({ proPackage: [] });
      out.saved = JSON.parse(localStorage.getItem('spx-gfx-ai') ?? '{}').proPackage ?? [];
      localStorage.removeItem('spx-gfx-ai');
      return out;
    });

    // EMPTY MEANS THE WHOLE PACKAGE, never "make nothing": a generation that produces no graphic
    // is not a choice anyone means to express, and a stored value predating this field must not
    // turn Create into a no-op.
    expect(cases.missing).toEqual(cases.all);
    expect(cases.empty).toEqual(cases.all);
    expect(cases.saved).toEqual(cases.all);
    // Always in PACKAGE order and never an unknown id - the FIRST member is the graphic the step
    // previews and refines, so a tick further down the list must not be able to move it.
    expect(cases.outOfOrder).toEqual(['lower-third', 'countdown']);
  });

  /**
   * A REQUESTED BRAND PALETTE IS THE PLATFORM'S TO APPLY, NEVER THE MODEL'S TO RETURN.
   *
   * Ratified on Lite 2026-08-13 and missing from Pro until 2026-08-16 (§15.9). The three
   * assertions are the three silent failures the rule exists to close: a near-miss hex echoed
   * back, a palette the model simply did not return, and a legibility repair that used to delete
   * the whole bespoke package rather than move its furniture.
   */
  test('a stated brand palette is copied verbatim and its divergences are recorded', async ({ page }) => {
    const cases = await page.evaluate(async () => {
      const { composeGraphic, packageLines } = await import('/src/ai/pro/language/graphics.ts');
      const { HOUSE_LANGUAGE } = await import('/src/ai/pro/language/contract.ts');
      // A language whose own palette is nothing like the brand's, so an echo is unmistakable.
      const language = {
        ...HOUSE_LANGUAGE,
        palette: { accent: '#22ff88', panel: '#ffffff', text: '#000000', textDim: '#444444' },
        shape: { ...HOUSE_LANGUAGE.shape, panel: 'solid' as const },
      };
      // Identity the platform must keep, and a supporting tone that CANNOT read on that panel -
      // the Aldervale case: a brand's own "slate", specified for parchment, on navy.
      const brandPalette = {
        accent: '#c8a24a', panel: '#0b1522', text: '#ffffff', textDim: '#2a3444',
      };
      const show = { name: 'Priya Raghunathan', title: 'Senior Research Fellow', channel: 'Northgate Sport' };
      const rootOf = (css: string) => {
        const root = /:root\s*\{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
        const varOf = (name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(root)?.[1].trim() ?? null;
        return { accent: varOf('accent'), panel: varOf('panel-bg'), textDim: varOf('text-dim') };
      };
      const out: Record<string, unknown> = {};
      for (const graphic of ['lower-third', 'sponsor-bug', 'countdown'] as const) {
        const composed = composeGraphic(graphic, language, {
          lines: packageLines(graphic, show),
          brandPalette,
        });
        out[graphic] = { ...rootOf(composed.template.css), adjustments: composed.adjustments };
      }
      // …and with no brand stated, the language's own palette still carries.
      const unbranded = composeGraphic('lower-third', language, {
        lines: packageLines('lower-third', show),
      });
      out.unbranded = rootOf(unbranded.template.css);
      return out as Record<string, { accent: string; panel: string; textDim: string; adjustments?: string[] }>;
    });

    for (const graphic of ['lower-third', 'sponsor-bug', 'countdown']) {
      const c = cases[graphic];
      // IDENTITY, verbatim, on every member of the package - the model's #22ff88 gets no vote.
      // The language asks for a SOLID panel, so the surface is the brand's hex untouched; a
      // translucent or blurred treatment would wrap the same channels in an rgba().
      expect(c.accent, `${graphic} accent`).toBe('#c8a24a');
      expect(c.panel, `${graphic} surface`).toBe('#0b1522');
      // FURNITURE, repaired: #2a3444 cannot read on #0b1522, so it moves - and says so.
      expect(c.textDim, `${graphic} supporting colour`).not.toBe('#2a3444');
      expect(c.adjustments, `${graphic} divergence recorded`)
        .toEqual(expect.arrayContaining([expect.stringContaining('palette_')]));
    }
    // The unbranded path is untouched: no brand, no override, the language's own colours.
    expect(cases.unbranded.accent).toBe('#22ff88');
  });

  /**
   * PRO REPAIRS FURNITURE TO ITS OWN FLOOR, THROUGH LITE'S LADDER (§25.8.6).
   *
   * The ladder is shared on purpose - two implementations would be two answers about one
   * customer's colours - but the NUMBERS are not shared, because Lite and Pro are separate
   * projects that do not share a quality bar (src/ai/AGENTS.md). Lite repairs a supporting tone
   * to WCAG's large-text 3:1; the owner ratified 3.25:1 for Pro on 2026-08-20, after the line he
   * named on S-03 measured 3.04:1 and cleared 3 by four hundredths.
   *
   * So this pins the DIFFERENCE, on a tone chosen to land in the gap between the two floors: the
   * same palette through the same function must come back repaired for Pro and untouched for
   * Lite. A single shared constant would fail here, which is the point.
   */
  test('Pro repairs the supporting tone to its own floor, and Lite keeps hers', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const { clampLitePalette, LITE_CONTRAST_FLOOR } = await import('/src/ai/lite/contract.ts');
      const { resolvePalette } = await import('/src/ai/pro/language/paint.ts');
      const { HOUSE_LANGUAGE } = await import('/src/ai/pro/language/contract.ts');
      // WCAG contrast from first principles: the ladder's own helper is module-private, and
      // `cssVars.contrastRatio` takes parsed colours rather than hex. Six lines is cheaper than
      // widening an export purely so a test can see it.
      const contrastRatio = (a: string, b: string): number => {
        const chan = (hex: string, i: number) => {
          const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        const lum = (hex: string) => 0.2126 * chan(hex, 0) + 0.7152 * chan(hex, 1) + 0.0722 * chan(hex, 2);
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      // A supporting tone measured to sit BETWEEN the two floors against this panel. FOUND rather
      // than hand-picked: a hex guessed to land in a 0.25-wide contrast band is a spec that fails
      // for arithmetic reasons rather than for the reason it was written.
      const panel = '#0b1522';
      const ramp: string[] = [];
      for (let v = 0x30; v <= 0xd0; v += 1) {
        const c = v.toString(16).padStart(2, '0');
        ramp.push(`#${c}${c}${c}`);
      }
      const between = ramp.find((hex) => {
        const r = contrastRatio(hex, panel);
        return r >= 3.02 && r < 3.24;
      });
      if (!between) return { found: false as const };
      const palette = { accent: '#c8a24a', panel, text: '#ffffff', textDim: between };
      const lite = clampLitePalette(palette);
      const pro = resolvePalette({ ...HOUSE_LANGUAGE, palette });
      return {
        found: true as const,
        floorSecondary: LITE_CONTRAST_FLOOR.secondary,
        source: between,
        sourceRatio: contrastRatio(between, panel),
        lite: { textDim: lite.palette.textDim, adjustments: lite.adjustments },
        pro: {
          textDim: pro.palette.textDim,
          ratio: contrastRatio(pro.palette.textDim, panel),
          adjustments: pro.adjustments,
        },
      };
    });

    expect(out.found, 'a tone between the two floors exists to test with').toBe(true);
    if (!out.found) return;
    expect(out.floorSecondary, "Lite's own floor is unchanged by Pro's").toBe(3);
    // Lite clears its 3:1 already, so the ladder leaves the brand's tone exactly as given.
    expect(out.lite.textDim, 'Lite keeps a tone that clears 3:1').toBe(out.source);
    expect(out.lite.adjustments).toEqual([]);
    // Pro does not, so the same tone is repaired - and past its own floor, not merely past 3.
    expect(out.pro.textDim, 'Pro moves a tone that only clears 3:1').not.toBe(out.source);
    expect(out.pro.ratio ?? 0).toBeGreaterThanOrEqual(3.25);
    expect(out.pro.adjustments).toEqual(expect.arrayContaining([expect.stringContaining('palette_')]));
  });
});
