// covers: src/ai/**, src/templates/**
//
// A NoaCG Lite graphic IS a catalog graphic.
//
// The doctrine (src/ai/AGENTS.md, docs/AI_LITE_PLAN.md) is that Lite never invents a layout: it
// picks a proven catalog design and adapts it, so what it produces must be operable in the
// control panel exactly like the same design picked by hand - the same data fields, the same
// operator event buttons, the same machine state groups. That is a claim about a whole pipeline
// (`compileLiteDecision` -> `specToTemplate` -> `variant.create`), and it is the kind of claim
// that quietly stops being true when one of those steps grows a Lite-shaped branch.
//
// So it is measured rather than argued, over every audited chassis, against
// `variantById(id).create({ lines })` - the exact adaptation the wizard makes when a user
// supplies the same content to a hand-picked design.
//
// The second test is the part that is easy to forget: for the ONLY category Lite ships, "the
// same event buttons" means "no event buttons", because no lower third in the catalog carries
// an authored operator event. It is pinned so that widening Lite into a category that DOES have
// machine behaviour (quiz, poll, game-timer) has to come here and say so.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

test.describe('a Lite result is the same graphic as the catalog design it adapted', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('every audited chassis compiles to the same operator surface as a hand-picked build', async ({ page }) => {
    test.setTimeout(120_000);
    const result = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const mod = await import('/src/ai/lite/pipeline.ts');
      const { LITE_CATALOG } = await import('/src/ai/lite/contract.ts');
      const control = await import('/src/control/controlModel.ts');
      type Decision = Parameters<typeof mod.compileLiteDecision>[0];
      type Context = Parameters<typeof mod.compileLiteDecision>[1];

      const surface = (template: { js: string; fields: { field: string; ftype: string }[] }) => ({
        fields: template.fields.map((f) => `${f.field}:${f.ftype}`),
        events: control.eventButtons(template.js).map((b) => b.event),
        groups: control.machineStateGroups(template.js).map((g) => `${g.id}:${g.states.join('/')}`),
      });

      const out = [];
      for (const entry of LITE_CATALOG) {
        const decision = {
          fit: 'catalog',
          reason: 'pinned by e2e',
          name: 'Parity',
          summary: 'Parity',
          category: 'lower-third',
          variantId: entry.variantId,
          intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
          lines: [
            { title: 'Name', sample: 'Alex Moreau', role: 'person-name' },
            { title: 'Role', sample: 'Head Coach', role: 'person-role' },
          ],
          flourish: null,
        } as unknown as Decision;
        // The resolution matters: `specToTemplate` reads width/height off the context, and a
        // missing one compiles `--scale: NaN` and `width: undefinedpx` - a template that still
        // "validates" statically and fails the live bench for a reason that looks like a Lite
        // defect. Cost an hour once; stated here so the next reader does not repeat it.
        const context = {
          images: [],
          palette: null,
          resolution: { width: 1920, height: 1080, label: '1080p' },
          fps: 50,
        } as unknown as Context;
        const compiled = await mod.compileLiteDecision(decision, context);
        const byHand = variantById(entry.variantId)!.create({ lines: decision.lines });
        out.push({
          variantId: entry.variantId,
          lite: surface(compiled.template),
          hand: surface(byHand),
          liteOk: compiled.validation.ok,
          liteErrors: compiled.validation.errors.map((e) => e.rule),
        });
      }
      return { rows: out, expectedCount: LITE_CATALOG.length };
    });

    expect(result.rows).toHaveLength(result.expectedCount);
    for (const row of result.rows) {
      expect(row.lite.fields, `${row.variantId} fields`).toEqual(row.hand.fields);
      expect(row.lite.events, `${row.variantId} event buttons`).toEqual(row.hand.events);
      expect(row.lite.groups, `${row.variantId} machine groups`).toEqual(row.hand.groups);
      // A grounded assembly has no repair loop, so one failing its own bench is a platform bug
      // (src/ai/AGENTS.md) - which makes it worth failing here rather than only in a paid round.
      expect(row.liteErrors, `${row.variantId} validation`).toEqual([]);
      expect(row.liteOk, `${row.variantId} validation`).toBe(true);
    }
  });

  test('no lower third carries an operator event, which is what makes that parity vacuous today', async ({ page }) => {
    const counts = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const control = await import('/src/control/controlModel.ts');
      const withEvents = (category: string) => (CATALOG[category as keyof typeof CATALOG] ?? [])
        .filter((v) => {
          try {
            return control.eventButtons(v.create({}).js).length > 0;
          } catch {
            return false;
          }
        }).length;
      return {
        lowerThird: withEvents('lower-third'),
        lowerThirdTotal: (CATALOG['lower-third'] ?? []).length,
        poll: withEvents('poll'),
        quiz: withEvents('quiz'),
      };
    });

    // Lite is `supportedCategories: ['lower-third']`, and this is what that costs: the control
    // page it produces has a transport and no event buttons, exactly like any catalog strap.
    expect(counts.lowerThird).toBe(0);
    expect(counts.lowerThirdTotal).toBeGreaterThan(50);
    // The other half of the guard - the check is capable of finding events where they exist,
    // so a future refactor that broke `eventButtons` could not pass the assertion above.
    expect(counts.poll).toBeGreaterThan(0);
    expect(counts.quiz).toBeGreaterThan(0);
  });
});
