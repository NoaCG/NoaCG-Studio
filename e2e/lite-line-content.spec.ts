// covers: src/ai/**, src/templates/**
//
// A generated graphic must come back carrying every line it was given, and a graphic TYPE must
// never come back with fewer populated lines than it declares line fields.
//
// The reproduction (docs/AI_LITE_PLAN.md §5 step 4): a quiz board declares five line fields -
// the question and its four answers - and `specToTemplate` slices a spec's lines to
// `variant.maxLines`, which the quiz type hand-declared as 1. Four answers were dropped before
// `variant.create()` ever saw them, and the quiz assembler builds its fields from a baked
// content declaration rather than from `o.lines`, so what shipped was the catalog's own
// planets question with four planets as its answers - a generation that "succeeded" while
// answering a completely different brief.
//
// Measured across the type registry at the time, NINE types were in that class: the three
// answer boards (5, 4 and 3 line fields) and every sports board (4 to 6), all declaring a
// capacity of 1 and carrying NONE of the caller's lines. That is why the guard below is
// registry-wide rather than quiz-shaped: this is the last obstacle between Lite and every
// category past lower thirds, and the next type to grow a line field must not be able to
// rejoin the class silently.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';

type Page = import('@playwright/test').Page;

/** The five lines a quiz brief carries: the question and its four answers. */
const QUIZ_LINES = [
  { title: 'Question', sample: 'Which river runs through Vienna?' },
  { title: 'Answer A', sample: 'The Rhine' },
  { title: 'Answer B', sample: 'The Danube' },
  { title: 'Answer C', sample: 'The Elbe' },
  { title: 'Answer D', sample: 'The Seine' },
];

/** Compile a spec through the grounded path and report its line fields' values. */
async function compiledLineValues(page: Page, variantId: string, lines: { title: string; sample: string }[]) {
  return page.evaluate(async ({ variantId, lines }) => {
    const { specToTemplate } = await import('/src/ai/designSpec.ts');
    const spec = {
      fit: 'catalog',
      reason: 'pinned by e2e',
      name: 'Line content',
      summary: 'Line content',
      category: 'quiz',
      variantId,
      lines,
    } as unknown as Parameters<typeof specToTemplate>[0];
    const { template } = specToTemplate(spec);
    // The board's line fields are f0…f4; the trailing textfields are the hidden correct /
    // selected / audience data sources, which are not lines.
    return template.fields.slice(0, 5).map((f) => f.value);
  }, { variantId, lines });
}

/**
 * Compile every registered type's designs with one sentinel per declared line field and report
 * the ones that came back short.
 *
 * `mutate: 'leave-one-behind'` puts the pre-fix defect back by hand on the quiz board - its
 * second line field keeps the design's baked answer instead of the caller's line - so the same
 * measurement has to name it. A registry-wide "nothing came back short" is otherwise satisfied
 * by a check that can never fire.
 */
async function typesComingBackShort(page: Page, mutate: 'none' | 'leave-one-behind') {
  return page.evaluate(async (how) => {
    const { TYPES } = await import('/src/templates/types/registry.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const short: { type: string; design: string; declared: number; carried: number }[] = [];
    for (const type of TYPES) {
      const declared = type.fields.filter((f) => f.role === 'line');
      if (declared.length === 0) continue; // a logo mark has no lines to lose
      for (const design of type.designs) {
        const variant = variantById(design.id);
        if (!variant) continue;
        const lines = declared.map((f, i) => ({ title: f.label, sample: `SENTINEL${i}` }));
        let template = variant.create({ lines });
        if (how === 'leave-one-behind' && type.id === 'quiz-board') {
          template = {
            ...template,
            fields: template.fields.map((f, i) => (i === 1 ? { ...f, value: 'Venus' } : f)),
          };
        }
        // Positional by the type's own contract: declared line field i IS the template's i-th
        // field, which is what keeps the compiled fN ids in step with the assembler.
        const carried = template.fields
          .slice(0, declared.length)
          .filter((f, i) => f.value === `SENTINEL${i}`).length;
        if (carried < declared.length) {
          short.push({ type: type.id, design: design.id, declared: declared.length, carried });
        }
      }
    }
    return short;
  }, mutate);
}

test.describe('a generated graphic carries every line it was given', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a quiz spec compiles five populated answer lines', async ({ page }) => {
    expect(await compiledLineValues(page, 'qz02', QUIZ_LINES)).toEqual(QUIZ_LINES.map((l) => l.sample));
  });

  test("a spec with fewer lines keeps the board's own answers, never blanks", async ({ page }) => {
    // A fixed field contract cannot shrink: a quiz board with two of its four answers blanked
    // is not a smaller quiz, it is a broken one. The 'lines'-plan pad-with-empty rule is right
    // for a lower third and wrong here, which is why the field plan decides between them.
    const values = await compiledLineValues(page, 'qz02', QUIZ_LINES.slice(0, 2));
    expect(values.slice(0, 2)).toEqual(QUIZ_LINES.slice(0, 2).map((l) => l.sample));
    expect(values.slice(2).every((v) => v.trim().length > 0)).toBe(true);
  });
});

/** Compile a quiz spec carrying CONTENT and report every field's value, by title. */
async function compiledContent(page: Page, content: { key: string; value: string }[]) {
  return page.evaluate(async (content) => {
    const { specToTemplate } = await import('/src/ai/designSpec.ts');
    const spec = {
      fit: 'catalog', reason: 'pinned by e2e', name: 'Content', summary: 'Content',
      category: 'quiz', variantId: 'qz02',
      lines: [
        { title: 'Question', sample: 'Which river runs through Vienna?' },
        { title: 'Answer A', sample: 'The Rhine' },
        { title: 'Answer B', sample: 'The Danube' },
        { title: 'Answer C', sample: 'The Elbe' },
        { title: 'Answer D', sample: 'The Seine' },
      ],
      content,
    } as unknown as Parameters<typeof specToTemplate>[0];
    const { template } = specToTemplate(spec);
    return Object.fromEntries(template.fields.map((f) => [f.title, f.value]));
  }, content);
}

test.describe('a decision reaches the content a line cannot carry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('the quiz marks the answer the brief chose, not the chassis default', async ({ page }) => {
    // The defect this channel closes: the question and all four answers can be right while the
    // board still reveals qz02's own default row, which is a wrong graphic every gate passes.
    const fields = await compiledContent(page, [{ key: 'correctAnswer', value: 'C' }]);
    expect(fields['Correct answer']).toBe('C');
    expect(fields['Answer C']).toBe('The Elbe'); // the lines still land
  });

  test('a value the field does not offer is dropped, never written', async ({ page }) => {
    // 'E' is not a row on a four-answer board. Writing it would leave the reveal addressing a
    // row that does not exist - it would light nothing up, with no error anywhere.
    const fields = await compiledContent(page, [{ key: 'correctAnswer', value: 'E' }]);
    expect(fields['Correct answer']).toBe('B'); // qz02's own default survives
  });

  test('an unknown key changes nothing, and a label answers for its value', async ({ page }) => {
    const unknown = await compiledContent(page, [{ key: 'notAField', value: 'x' }]);
    expect(unknown['Correct answer']).toBe('B');
    // The quiz's options are labelled by the same letters they carry, so this pins the label
    // route on a field where the two differ nowhere else in the type: an audience string is
    // free text and must survive verbatim.
    const audience = await compiledContent(page, [{ key: 'audienceResults', value: '34 | 52 | 9 | 5' }]);
    expect(audience['Audience results']).toBe('34 | 52 | 9 | 5');
  });

  test('a hand-written variant ignores content rather than guessing', async ({ page }) => {
    // vs01 is not type-compiled, so it declares no logical keys. Writing by position would be
    // a guess at what its fN ids mean; the honest answer is to leave it alone.
    const same = await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const variant = variantById('vs01')!;
      const plain = variant.create({});
      const withContent = variant.create({ content: { anything: 'at all' } });
      return plain.html === withContent.html && JSON.stringify(plain.fields) === JSON.stringify(withContent.fields);
    });
    expect(same).toBe(true);
  });
});

test.describe('no graphic type comes back with fewer lines than it declares', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('every registered type carries every line field it declares', async ({ page }) => {
    expect(await typesComingBackShort(page, 'none')).toEqual([]);
  });

  test('a type that leaves a line behind is reported', async ({ page }) => {
    const short = await typesComingBackShort(page, 'leave-one-behind');
    expect(short.length).toBeGreaterThan(0);
    expect(short.every((s) => s.type === 'quiz-board' && s.carried === s.declared - 1)).toBe(true);
  });
});
