// covers: src/ai/**
//
// The shortlist is RANKED over the catalog's own metadata and FILTERED by the structural anchor
// table, so a design added, renamed or re-declared moves what a brief retrieves.
// covers: src/templates/**

import { test, expect } from '@playwright/test';
import { toApp } from './_bench';

// RETRIEVAL - the adapt-first pivot's shortlist (src/ai/retrieval.ts, docs/ADAPT_FIRST_PLAN.md
// §3 Stage R) - plus the placement rule that goes with it (AssembleOptions.keepChassisZone).
//
// Driven at MODULE level rather than through the UI on purpose: retrieval sits inside the
// harness's design stage, which needs a model, and the e2e suite is offline by design. The
// module is pure and deterministic, so the fast-path technique (root AGENTS.md, "Logic checks
// without UI") measures exactly the thing that ships. Free - no tokens.

/** One well-formed StructuralIntent, written inline so a spec failure names the input. */
const intent = (families: string[], labels: string[], tone: string[] = []) =>
  JSON.stringify({
    version: 1,
    kind: 'family',
    families,
    confidence: 'high',
    summary: '',
    parts: [],
    fields: labels.map((label, i) => ({ key: `f${i}`, role: 'line', label })),
    tone,
    originalityRequested: false,
  });

test.describe('shortlist retrieval', () => {
  test('a brief retrieves the designs drawn for it, not the whole catalog', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { catalogDigest } = await import('/src/ai/designSpec.ts');
      const worship = shortlistFor(
        'worship service lower third with a scripture reference and the reader name',
        ${intent(['strap'], ['Reader', 'Scripture reference'], ['calm'])},
      );
      const esports = shortlistFor(
        'esports player card lower third with squad number and team',
        ${intent(['strap'], ['Player', 'Team', 'Squad number'], ['energetic'])},
      );
      return {
        worship: worship.variants.map((v) => v.id),
        worshipAnchor: worship.anchor,
        esports: esports.variants.map((v) => v.id),
        fullDigest: catalogDigest().length,
        worshipDigest: catalogDigest(worship.variants).length,
      };
    })()`);
    const r = res as {
      worship: string[]; worshipAnchor: string; esports: string[];
      fullDigest: number; worshipDigest: number;
    };

    // The designs drawn for this production lead. ls15 is "Scripture Reading", ls14 "Pulpit".
    expect(r.worship.slice(0, 2)).toEqual(['ls15', 'ls14']);
    expect(r.worshipAnchor).toBe('category:lower-third');
    // …and the sports straps that used to fill the tail are gone. This is the assertion that
    // fails if the relevance cut is removed: without it a worship brief was shown Squad Number,
    // Player Stats and Club Crest, which is a recommendation spent on an irrelevant design.
    for (const sporty of ['ls08', 'ls09', 'ls10', 'ls11']) expect(r.worship).not.toContain(sporty);

    // The same mechanism answers the opposite brief with exactly those designs.
    expect(r.esports.slice(0, 2)).toEqual(['ls08', 'lt41']);

    // The point of the exercise: the design stage stops reading the whole catalog.
    expect(r.fullDigest).toBeGreaterThan(60_000);
    expect(r.worshipDigest).toBeLessThan(r.fullDigest / 10);
  });

  test('the floor is topped up with designs the brief named, never with the residue', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const squad = shortlistFor(
        'squad number strap for a stadium match with the club crest',
        ${intent(['strap'], ['Squad number'])},
      );
      const worship = shortlistFor(
        'worship service lower third with a scripture reference and the reader name',
        ${intent(['strap'], ['Reader', 'Scripture reference'], ['calm'])},
      );
      return {
        squad: squad.variants.map((v) => v.id), squadReason: squad.reason,
        worship: worship.variants.map((v) => v.id), worshipReason: worship.reason,
      };
    })()`);
    const r = res as {
      squad: string[]; squadReason: string; worship: string[]; worshipReason: string;
    };

    // A shortlist is topped up to a floor of four, and WHICH designs fill it is the rule under
    // test. Here three clear the cut - Squad Number 172, Club Crest 41, Number Badge 37 against a
    // floor of 34 - so the fourth slot is a top-up. It goes to Track Cue, which "number" NAMED
    // (that term reaches 3 designs of 89), and not to House Handle, the highest-ranked design no
    // term reached at all. Fails if the top-up stops preferring a named design over an unreached
    // one.
    expect(r.squad).toEqual(['ls08', 'ls10', 'lt07', 'ls27']);
    expect(r.squadReason).toContain('1 topped up (1 named below the cut, 0 no term named)');

    // The other half of the rule, and why "prefer anything that scored above zero" is wrong: 80
    // of these 89 lower thirds carry a 2.2 residue under this brief, earned purely for having a
    // name field and being a lower third. Promoting that band puts Squad Number and Player Stats
    // in a worship shortlist - the defect the relevance cut exists to remove - so an unreached
    // house design outranks it. Fails if the residue is ever allowed to fill the floor.
    expect(r.worship).toEqual(['ls15', 'ls14', 'lt14', 'lt55']);
    expect(r.worshipReason).toContain('2 topped up (0 named below the cut, 2 no term named)');
  });

  test('every shortlisted design carries the structure the brief asked for', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { variantSatisfiesAnchor } = await import('/src/templates/structuralAnchor.ts');
      const list = shortlistFor(
        'a league standings table for the weekend fixtures',
        ${intent(['table'], ['Rows'])},
      );
      return {
        anchor: list.anchor,
        all: list.variants.every((v) => variantSatisfiesAnchor(v.id, list.anchor)),
        count: list.variants.length,
      };
    })()`);
    const r = res as { anchor: string; all: boolean; count: number };
    expect(r.anchor).toBe('category:results-board');
    expect(r.count).toBeGreaterThan(0);
    expect(r.all).toBe(true);
  });

  test('nothing to retrieve within degrades to the full catalog, never to an empty list', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor, FULL_CATALOG } = await import('/src/ai/retrieval.ts');
      const novel = shortlistFor('a graphic nobody has made before', {
        version: 1, kind: 'novel', novelDescription: 'x', confidence: 'low',
        summary: '', parts: [], fields: [], originalityRequested: false,
      });
      const noIntent = shortlistFor('anything at all', null);
      const deadAnchor = shortlistFor('anything at all', null, { anchor: 'category:not-a-category' });
      const pinned = shortlistFor('anything at all', null, { anchor: 'category:lower-third' });
      return {
        novel: novel.full, noIntent: noIntent.full, deadAnchor: deadAnchor.full,
        pinnedFull: pinned.full, pinnedCount: pinned.variants.length,
        fullIsEmpty: FULL_CATALOG.variants.length === 0 && FULL_CATALOG.full,
      };
    })()`);
    const r = res as Record<string, boolean | number>;
    expect(r.novel).toBe(true);
    expect(r.noIntent).toBe(true);
    // An anchor that resolves to nothing must NOT be treated as satisfied by everything -
    // variantSatisfiesAnchor answers true for a dead anchor by design, which is right for the
    // satisfaction check and would hand retrieval a meaningless shortlist.
    expect(r.deadAnchor).toBe(true);
    // A category the user pinned still retrieves, even though the intent call never ran.
    expect(r.pinnedFull).toBe(false);
    expect(r.pinnedCount).toBeGreaterThan(0);
    expect(r.fullIsEmpty).toBe(true);
  });

  test('a requested side is retrievable; the graphic’s own name is not a request', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { variantById } = await import('/src/templates/catalog.ts');
      const zones = (list) => list.variants.map((v) => variantById(v.id).defaultZone);
      const right = shortlistFor(
        'a presenter strap anchored on the right of the frame',
        ${intent(['strap'], ['Name', 'Role'])},
      );
      const worship = shortlistFor(
        'worship service lower third with a scripture reference and the reader name',
        ${intent(['strap'], ['Reader', 'Scripture reference'], ['calm'])},
      );
      return {
        rightZones: zones(right), rightReason: right.reason,
        worshipIds: worship.variants.map((v) => v.id), worshipReason: worship.reason,
      };
    })()`);
    const r = res as { rightZones: string[]; rightReason: string; worshipIds: string[]; worshipReason: string };

    // The chassis now keeps the zone it was drawn for, so a brief that asks for a side can only
    // be answered by RETRIEVING one. The word is not in the designs' names — "Line Handle" and
    // "Glass Tag" are right-anchored — so this is matched against `variant.defaultZone`.
    expect(r.rightZones.length).toBeGreaterThan(0);
    expect(r.rightZones.every((z) => z.endsWith('-right'))).toBe(true);
    expect(r.rightReason).toContain('placement requested');

    // …and "a lower third" NAMES THE GRAPHIC. Read as a bottom-placement request it matches 88
    // of 89 designs, which made the whole category relevant and handed back catalog order
    // wearing a rationale — the worship shortlist regressed to ten with a tail of club crests.
    expect(r.worshipReason).not.toContain('placement requested');
    expect(r.worshipIds.slice(0, 2)).toEqual(['ls15', 'ls14']);
    for (const sporty of ['ls08', 'ls09', 'ls10', 'ls11']) expect(r.worshipIds).not.toContain(sporty);
  });

  test('a refinement can always keep the design it is refining', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      // A worship graphic being refined with a request that names no design at all. Without
      // the keep rule the shortlist narrows the tool's variantId enum around the BRIEF, and
      // a sports strap the user never asked for is the only thing the model can name.
      const kept = shortlistFor('warmer colours and a calmer entrance', null, {
        anchor: 'category:lower-third', keep: 'ls15',
      });
      const without = shortlistFor('warmer colours and a calmer entrance', null, {
        anchor: 'category:lower-third',
      });
      // A design from another structure cannot be kept - that would offer the wrong KIND.
      const wrongKind = shortlistFor('warmer colours', null, {
        anchor: 'category:lower-third', keep: 'tk01',
      });
      return {
        keptIds: kept.variants.map((v) => v.id),
        keptReason: kept.reason,
        withoutIds: without.variants.map((v) => v.id),
        wrongKindIds: wrongKind.variants.map((v) => v.id),
        wrongKindReason: wrongKind.reason,
      };
    })()`);
    const r = res as Record<string, string[] | string>;

    // The incumbent is present AND leads: on a refinement it is the default answer.
    expect((r.keptIds as string[])[0]).toBe('ls15');
    expect(r.keptReason).toContain('keeping ls15');
    // Mutation check: without the rule this brief does NOT reach ls15, so the assertion above
    // is testing the rule rather than a coincidence of ranking.
    expect(r.withoutIds).not.toContain('ls15');
    // A ticker cannot be kept inside a lower-third shortlist, and the reason says so rather
    // than silently dropping it.
    expect(r.wrongKindIds).not.toContain('tk01');
    expect(r.wrongKindReason).toContain('not one of this structure');
  });

  test('the shortlist digest lists exactly the shortlisted designs', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { shortlistFor } = await import('/src/ai/retrieval.ts');
      const { catalogDigest } = await import('/src/ai/designSpec.ts');
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const list = shortlistFor(
        'esports player card lower third with squad number and team',
        ${intent(['strap'], ['Player', 'Team', 'Squad number'])},
      );
      const digest = catalogDigest(list.variants);
      const ids = list.variants.map((v) => v.id);
      const others = (CATALOG['lower-third'] || []).map((v) => v.id).filter((id) => !ids.includes(id));
      return {
        allShown: ids.every((id) => digest.includes('- ' + id + ' "')),
        noneExtra: others.every((id) => !digest.includes('- ' + id + ' "')),
        // The palette / font / zone / easing footer must survive the narrowing: the spec
        // schema still references those enums.
        hasFooter: digest.includes('Palettes:') && digest.includes('Fonts:') && digest.includes('Easings:'),
      };
    })()`);
    const r = res as Record<string, boolean>;
    expect(r.allShown).toBe(true);
    expect(r.noneExtra).toBe(true);
    expect(r.hasFooter).toBe(true);
  });
});

test.describe('the chassis keeps the zone it was drawn for', () => {
  test('keepChassisZone ignores a spec zone; without it the spec still wins', async ({ page }) => {
    await toApp(page);
    const res = await page.evaluate(`(async () => {
      const { specToTemplate } = await import('/src/ai/designSpec.ts');
      const { variantById } = await import('/src/templates/catalog.ts');
      const spec = {
        fit: 'catalog', reason: 'test', name: 'Zone Test', summary: 'test',
        category: 'lower-third', variantId: 'lt01', zone: 'top-right',
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }],
      };
      const kept = specToTemplate(spec, undefined, { keepChassisZone: true });
      const moved = specToTemplate(spec);
      return {
        drawnFor: variantById('lt01').defaultZone,
        kept: kept.diversity.zone,
        moved: moved.diversity.zone,
      };
    })()`);
    const r = res as { drawnFor: string; kept: string; moved: string };
    // Measured over 89 lower thirds: the rendered side agrees with the declared zone on 89 of
    // 89 (docs/ADAPT_FIRST_PLAN.md §1.1), so the harness assembles at the design's own zone.
    expect(r.kept).toBe(r.drawnFor);
    // …and the default is still permissive, which is what NoaCG Lite compiles under. This
    // asserts a PARAMETER DEFAULT and nothing more — the Lite path itself is pinned below,
    // because the first version of this spec claimed to protect Lite while only ever calling
    // specToTemplate, and Lite had in fact been opted in without the re-baseline §6.2 requires.
    expect(r.moved).toBe('top-right');
  });

  test('the assembly policy is the caller’s, so Lite keeps its own declared contract', async ({ page }) => {
    await toApp(page);
    // NoaCG Lite reaches `groundedResult` too (liteGroundedResult, with `profile` stripped), so
    // the adapt-first policy has to travel as an ARGUMENT. This drives the one compile path
    // both use with each caller's real options, rather than a parameter default.
    const res = await page.evaluate(async () => {
      const pipeline = (await import('/src/ai/lite/pipeline.ts' as string)) as {
        assembleGroundedTemplate: (s: unknown, c: unknown, o: unknown) => { template: { css: string } };
      };
      const catalog = (await import('/src/templates/catalog.ts' as string)) as {
        variantById: (id: string) => { defaultZone: string };
      };
      const base = {
        fit: 'catalog', reason: 'test', name: 'Policy Test', summary: 'test',
        category: 'lower-third', variantId: 'lt01',
        // Both halves of the policy in one spec: a zone lt01 was not drawn for, and a size
        // Lite's own schema allows (0.7-1.4) but the harness tool does not (0.85-1.2).
        zone: 'top-right', sizeScale: 1.35,
        lines: [{ title: 'Name', sample: 'Ada Lovelace' }],
      };
      const build = (options: unknown) => pipeline.assembleGroundedTemplate(base, undefined, options).template.css;
      const liteCss = build({});
      const harnessCss = build({ keepChassisZone: true, sizeScaleRange: [0.85, 1.2] });
      const rootRule = (css: string) => css.slice(css.indexOf('.lower-third'), css.indexOf('.lower-third') + 300);
      const scale = (css: string) => Number(/--scale:\s*([\d.]+)/.exec(css)?.[1]);
      return {
        drawnFor: catalog.variantById('lt01').defaultZone,
        liteScale: scale(liteCss), harnessScale: scale(harnessCss),
        liteRule: rootRule(liteCss), harnessRule: rootRule(harnessCss),
      };
    });

    // Lite honours its own declared range: 1.35 is legal there and survives into the CSS.
    expect(res.liteScale).toBe(1.35);
    // The harness clamps the same spec to what its own schema told the model.
    expect(res.harnessScale).toBe(1.2);
    // The zone half: Lite still moves to the requested top-right; the harness stays where lt01
    // was drawn. Asserted on the sides each anchor actually EMITS — a created template writes
    // only the sides its zone uses, so "contains bottom" would be true of neither.
    expect(res.drawnFor).toBe('bottom-left');
    expect(res.harnessRule).toMatch(/left:\s*120px/);
    expect(res.harnessRule).toMatch(/bottom:\s*\d+px/);
    expect(res.liteRule).toMatch(/right:\s*120px/);
    expect(res.liteRule).toMatch(/top:\s*\d+px/);
  });
});
