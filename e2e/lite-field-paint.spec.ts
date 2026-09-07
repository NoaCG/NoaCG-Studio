// Every field a NoaCG Lite graphic declares must reach the screen.
//
// The defect, from the 2026-08-08 quality round (benchmarks/lite/ROUND-2026-08-08-QUALITY.md
// §4): one generation shipped a lower third that painted the name, reserved a wide band under
// it, and drew nothing there. `fieldCount` said 2. Driving the graphic with fresh data through
// `update()` changed nothing on screen. Static validation, the runtime bench, the type floor and
// the wrap check were all silent, because every one of them asks about an element that IS drawn.
//
// The question that answers it already existed - `structuralIntentCheck` drives every field to a
// sentinel and re-reads the painted frame - and it could not run here: it needs a StructuralIntent,
// and Lite runs no intent stage at all, so `withStructuralFindings` returns early on every Lite
// result. The drive now lives in `src/validation/fieldPaint.ts`, shared by both, and the bench
// exposes it as the opt-in `fieldPaints` that Lite's validator turns on.
//
// Three tests, because a gate that only proves it can fire is satisfied by a check that flags
// everything, and a gate nobody enables is decoration:
//   1. an ordinary Lite compile stays quiet;
//   2. a template whose field genuinely cannot paint raises it (the mutation half);
//   3. it is OFF unless a caller asks - a hand-written template may hide whatever it likes.
//
// THE MULTI-STATE HALF (added 2026-08-09, docs/CONTROL_PANEL_PARITY.md §6) is the last three.
// The drive used to read the frame ONCE, at the settled default path, which is the whole answer
// only for a graphic that has no states - so a field a later operator event reveals read as
// unreachable and would have failed a correct graphic. That was the standing blocker on running
// this check for any interactive category, and it is not hypothetical: the quiz board's audience
// percentages are painted only on entry to its `audience` branch, three events past settled.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** Compile one ordinary Lite decision through the shared grounded path. */
async function rulesFor(page: Page, mutate: 'none' | 'hide-second-field'): Promise<string[]> {
  return page.evaluate(async (how) => {
    const pipeline = await import('/src/ai/lite/pipeline.ts');
    const bench = await import('/src/validation/runtimeBench.ts');
    type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
    type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
    const decision = {
      fit: 'catalog', reason: 'pinned by e2e', name: 'Field paint', summary: 'Field paint',
      category: 'lower-third', variantId: 'lt11',
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
      lines: [
        { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
        { title: 'Role', sample: 'Head Coach', role: 'person-role' },
      ],
      flourish: null,
    } as unknown as Decision;
    const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
    const template = compiled.template;
    if (!template) return ['NO TEMPLATE'];
    if (how === 'none') {
      // The real path: whatever `compileLiteDecision` decided, read at its own severity.
      return [...compiled.validation.errors, ...compiled.validation.warnings].map((f) => f.rule);
    }
    const second = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea')[1];
    if (!second) return ['NO SECOND FIELD'];
    // `display: none` is the crudest form of the defect and the one the drive is specified
    // against (`visibleText` skips display:none and visibility:hidden, and deliberately does
    // NOT consult opacity - a region a later step reveals is transparent and perfectly
    // reachable). A colour that vanishes into the panel is the same finding by a different
    // route, and is not pinned here because it would be testing the browser's compositor.
    const hidden = { ...template, css: `${template.css}\n#${second.field} { display: none !important; }\n` };
    const result = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
    return [...result.errors, ...result.warnings].map((f) => f.rule);
  }, mutate);
}

test.describe('a Lite graphic paints every field it declares', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('an ordinary Lite compile raises nothing', async ({ page }) => {
    // `compileLiteDecision` turns `fieldPaints` on, so this is the check running on a real
    // result - a gate that fired on the platform's own output would be worse than no gate.
    expect(await rulesFor(page, 'none')).not.toContain('bench-field-unpainted');
  });

  test('a field that cannot paint raises bench-field-unpainted', async ({ page }) => {
    expect(await rulesFor(page, 'hide-second-field')).toContain('bench-field-unpainted');
  });

  test('the drive is off unless a caller asks, and leaves the default data behind it', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const pipeline = await import('/src/ai/lite/pipeline.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
      type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
      const decision = {
        fit: 'catalog', reason: 'x', name: 'x', summary: 'x',
        category: 'lower-third', variantId: 'lt11',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'Head Coach', role: 'person-role' },
        ],
        flourish: null,
      } as unknown as Decision;
      const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
      const hidden = {
        ...compiled.template,
        css: `${compiled.template.css}\n#f1 { display: none !important; }\n`,
      };
      // Same broken template, twice: once with the option and once without.
      const off = await bench.benchTemplateRuntime(hidden, {});
      const on = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
      return {
        off: [...off.errors, ...off.warnings].map((f) => f.rule),
        on: [...on.errors, ...on.warnings].map((f) => f.rule),
      };
    });

    expect(out.off).not.toContain('bench-field-unpainted');
    expect(out.on).toContain('bench-field-unpainted');
    // The drive replaces the frame's data with sentinels, and the exit, replay and stress
    // phases run after it. If the restore were dropped, those phases would silently start
    // measuring `ZQ0X` instead of the real copy - so the two runs must otherwise agree.
    const others = (rules: string[]) => rules.filter((r) => r !== 'bench-field-unpainted').sort();
    expect(others(out.on)).toEqual(others(out.off));
  });
});

test.describe('the drive asks the whole machine, not one state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a field only a later branch paints is NOT reported unreachable', async ({ page }) => {
    // The quiz board is the case the widening exists for. `audienceResults` (f7) is painted by
    // applyAudienceResult(), which runs on entry to the `audience` branch - three operator events
    // past the settled default path. Read at settled it paints nothing, and the check used to
    // call a perfectly correct catalog graphic broken.
    const out = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = variantById('qz02')!.create({});
      // The field's own default is empty (nobody has picked yet), and an empty value paints
      // nothing anywhere - the drive replaces every value with a sentinel, which is the whole
      // point, but the SAMPLE has to be reachable for the graphic to be worth measuring.
      const result = await bench.benchTemplateRuntime(template, { fieldPaints: true });
      return [...result.errors, ...result.warnings]
        .filter((f) => f.rule === 'bench-field-unpainted')
        .map((f) => f.message);
    });
    expect(out).toEqual([]);
  });

  test('a machine-bearing graphic still reports a field that paints in NO state', async ({ page }) => {
    // The mutation half of the widening: unioning across states must not turn the check into one
    // that can never fire. Same quiz, one field hidden in every state.
    const out = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = variantById('qz02')!.create({});
      const hidden = { ...template, css: `${template.css}\n#f7, .quiz-aud { display: none !important; }\n` };
      const result = await bench.benchTemplateRuntime(hidden, { fieldPaints: true });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });
    expect(out).toContain('bench-field-unpainted');
  });

  test('no shipped machine is anywhere near the walk cap', async ({ page }) => {
    // MAX_WALKED_STATES bounds a graph an author controls, and a bound that silently truncated
    // would decide the answer instead of measuring it. This measures the real maximum across the
    // whole catalog, so the cap can never quietly start biting as types are added.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { MAX_WALKED_STATES } = await import('/src/validation/fieldPaint.ts');
      let worst = { id: '', states: 0 };
      for (const variants of Object.values(CATALOG)) {
        for (const variant of variants) {
          let machine;
          try {
            machine = parseAnimData(variant.create({}).js)?.machine;
          } catch {
            continue; // a variant that refuses its own defaults is another spec's finding
          }
          if (!machine) continue;
          const states = machine.groups.reduce((n, g) => n + g.states.length, 0);
          if (states > worst.states) worst = { id: variant.id, states };
        }
      }
      return { worst, cap: MAX_WALKED_STATES };
    });
    expect(out.worst.states).toBeGreaterThan(0); // the measurement itself works
    expect(out.worst.states, `${out.worst.id} is the largest machine in the catalog`)
      .toBeLessThan(out.cap);
  });
});

test.describe('a declared input-only holder is not a field that failed to paint', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('every shipped game-timer passes, though its minutes field is never drawn', async ({ page }) => {
    // The 2026-09-06 Pro Harness round refused every countdown it generated on
    // `bench-field-unpainted`, for markup the root `AGENTS.md` prescribes verbatim:
    // `<span id="f1" class="noacg-data-source">`, hidden by a stylesheet rule, read by the clock
    // engine, never drawn. The whole shipped family does the same thing, so the check as written
    // refused NoaCG's own work - the signature src/ai/pro/AGENTS.md names, an instrument whose
    // false positives are the good designs.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const rows: Array<{ id: string; findings: string[] }> = [];
      for (const variant of CATALOG['game-timer']) {
        const result = await bench.benchTemplateRuntime(variant.create({}), { fieldPaints: true });
        rows.push({
          id: variant.id,
          findings: [...result.errors, ...result.warnings]
            .filter((f) => f.rule === 'bench-field-unpainted')
            .map((f) => f.message),
        });
      }
      return rows;
    });
    expect(out.length).toBeGreaterThan(0); // the family is still there to measure
    expect(out.filter((r) => r.findings.length)).toEqual([]);
  });

  test('the same holder WITHOUT the class is still reported', async ({ page }) => {
    // The mutation half: what clears the finding is the author's DECLARATION, not the fact that a
    // value is hidden. Strip the class (keeping the element hidden by its own rule) and the field
    // is an ordinary hidden holder again - which is the defect the check exists for.
    const out = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      const template = CATALOG['game-timer'][0].create({});
      const stripped = {
        ...template,
        html: template.html.replace(/ class="noacg-data-source"/g, ''),
        css: `${template.css}
#f1 { display: none !important; }
`,
      };
      const result = await bench.benchTemplateRuntime(stripped, { fieldPaints: true });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });
    expect(out).toContain('bench-field-unpainted');
  });
});
