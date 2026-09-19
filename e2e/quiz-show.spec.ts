import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { chooseType, pickDesign } from './_browse';

// THE QUIZ SHOW SET: a quiz board whose answer count is a FIELD, a two-player score, and the
// three game-show looks they ship in (sticker, showtime, arcade).
//
// The board's arc is three moments - the question, the contestant's pick, the correct answer -
// and the operator builds the graphic ONCE in the wizard, then duplicates it in the rundown per
// question. That is why "how many answers" cannot be baked into the markup the way the classic
// two-, three- and four-answer boards bake it: it has to travel with each copy's data.

const QUIZ_DESIGNS = ['qz13', 'qz14', 'qz15'];
const SCORE_DESIGNS = ['sb26', 'sb27', 'sb28'];

/** Build a catalog design, load it into a frame, and drive it with operator events. The GSAP
 *  ticker is ticked by hand after each wait, so the arc is the same on a throttled runner. */
async function drive(
  page: Page,
  id: string,
  options: Record<string, unknown>,
  events: [string, Record<string, string>?][],
) {
  return page.evaluate(
    async ({ id, options, events }) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
      const template = variantById(id)!.create(options);
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px';
      document.body.appendChild(frame);
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = composeDocument(template); });
      const doc = frame.contentDocument!;
      const win = frame.contentWindow as unknown as {
        play(): void;
        noacgDispatch(event: string, payload?: Record<string, string>): void;
        noacgMachineState(): { groups: Record<string, string> };
        gsap: { ticker: { tick(): void } };
        onerror: unknown;
      };
      const errors: string[] = [];
      win.onerror = (message: unknown) => { errors.push(String(message)); };
      const settle = async () => {
        for (let i = 0; i < 4; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 200));
          win.gsap.ticker.tick();
        }
      };
      const snapshot = () => ({
        rows: [...doc.querySelectorAll('.quiz-option')].map((row) =>
          [...row.classList].filter((name) => /^quiz-(sel|correct|wrong|dim|option-off)$/.test(name)).sort().join(' ')),
        answers: doc.querySelector('.quiz')?.getAttribute('data-answers') ?? null,
        root: doc.querySelector('.scoreboard')?.className ?? null,
        scores: [doc.getElementById('f1')?.textContent ?? '', doc.getElementById('f3')?.textContent ?? ''],
        groups: win.noacgMachineState().groups,
      });
      win.play();
      await settle();
      const steps = [snapshot()];
      for (const [event, payload] of events) {
        win.noacgDispatch(event, payload);
        await settle();
        steps.push(snapshot());
      }
      frame.remove();
      return {
        valid: validateTemplate(template).ok,
        errors,
        js: template.js,
        fields: template.fields.map((field) => `${field.title}=${field.value}`),
        steps,
      };
    },
    { id, options, events },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

for (const id of QUIZ_DESIGNS) {
  test(`${id}: the pick lights up and can move, the reveal marks right and wrong, and a late pick is dropped`, async ({ page }) => {
    const run = await drive(page, id, {}, [
      ['pickC', { f6: 'C' }],
      ['pickA', { f6: 'A' }],
      ['clearPick', { f6: '' }],
      ['pickA', { f6: 'A' }],
      ['judge'],
      ['pickD', { f6: 'D' }],
    ]);
    expect(run.valid).toBe(true);
    expect(run.errors).toEqual([]);
    const [question, pickedC, pickedA, cleared, again, verdict, late] = run.steps;
    expect(question.rows).toEqual(['', '', '', '']);
    expect(pickedC.rows).toEqual(['', '', 'quiz-sel', '']);
    // Moving the pick is a self-transition on ONE state, never a state per answer.
    expect(pickedA.rows).toEqual(['quiz-sel', '', '', '']);
    expect(pickedA.groups.main).toBe('selected');
    expect(cleared.rows).toEqual(['', '', '', '']);
    expect(again.rows).toEqual(['quiz-sel', '', '', '']);
    // The board's default correct answer is B: A was the pick, so it is marked WRONG, not dimmed.
    expect(verdict.rows).toEqual(['quiz-wrong', 'quiz-correct', 'quiz-dim', 'quiz-dim']);
    expect(verdict.groups.main).toBe('reveal');
    // Nothing leaves the reveal on a pick event, so the verdict cannot be repainted by one.
    expect(late.rows).toEqual(verdict.rows);
  });

  test(`${id}: "Answers shown" hides the rows a question does not use, and they cannot be picked`, async ({ page }) => {
    const run = await drive(page, id, { content: { answerCount: '3', correctAnswer: 'C' } }, [
      ['pickD', { f6: 'D' }],
      ['pickB', { f6: 'B' }],
      ['judge'],
    ]);
    expect(run.fields).toContain('Answers shown=3');
    const [question, pickedHidden, pickedB, verdict] = run.steps;
    // Hidden at LOAD, before the entrance - which is what the wizard's preview shows.
    expect(question.answers).toBe('3');
    expect(question.rows).toEqual(['', '', '', 'quiz-option-off']);
    expect(pickedHidden.rows).toEqual(['', '', '', 'quiz-option-off']);
    expect(pickedB.rows).toEqual(['', 'quiz-sel', '', 'quiz-option-off']);
    expect(verdict.rows).toEqual(['quiz-dim', 'quiz-wrong', 'quiz-correct', 'quiz-dim quiz-option-off']);
  });

  test(`${id}: a count changed ON AIR resizes the board both ways and never shrinks an answer`, async ({ page }) => {
    // The operator duplicates the graphic per question, so the count arrives by update() on a
    // board whose stage fit has already measured it. Two things went wrong here and both were
    // silent: the panel's reserved height is a floor, so four answers -> two kept a four-answer
    // panel; and a row hidden with display:none has no box to measure, so two answers -> four
    // fitted the returning answers into nothing and shipped them small.
    const sizes = await page.evaluate(async (id) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px';
      document.body.appendChild(frame);
      const template = variantById(id)!.create({ content: { answerCount: '2' } });
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = composeDocument(template); });
      const doc = frame.contentDocument!;
      const win = frame.contentWindow as unknown as { update(data: string): void; play(): void };
      await doc.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 400));
      win.update('{}');
      win.play();
      const measure = () => ({
        box: Math.round(doc.querySelector('.quiz-box')!.getBoundingClientRect().height),
        fonts: [1, 2, 3, 4].map((n) => parseFloat(getComputedStyle(doc.getElementById(`f${n}`)!).fontSize)),
      });
      const two = measure();
      win.update(JSON.stringify({ f7: '4' }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const four = measure();
      win.update(JSON.stringify({ f7: '2' }));
      await new Promise((resolve) => setTimeout(resolve, 200));
      const twoAgain = measure();
      frame.remove();
      return { two, four, twoAgain };
    }, id);
    expect(sizes.four.box).toBeGreaterThan(sizes.two.box);
    expect(sizes.twoAgain.box).toBe(sizes.two.box);
    // Every answer keeps the size the design drew it at, including the two that came back.
    expect(new Set(sizes.four.fonts).size).toBe(1);
    expect(sizes.four.fonts).toEqual(sizes.two.fonts);
  });

  test(`${id}: the emitted runtime carries no lock and no audience result`, async ({ page }) => {
    const run = await drive(page, id, {}, []);
    // A function no arrow can ever call reads as though it works, and the generated file is
    // the user's to read.
    expect(run.js).not.toMatch(/function applyLock\b/);
    expect(run.js).not.toMatch(/function applyAudienceResult\b/);
    expect(run.js).toMatch(/function applyAnswerCount\b/);
  });
}

for (const id of SCORE_DESIGNS) {
  test(`${id}: a point moves the score and the leader, the final call marks the winner, a new game clears both`, async ({ page }) => {
    const run = await drive(page, id, {}, [
      ['pointA', { f1: '1' }],
      ['pointB', { f3: '1' }],
      ['pointB', { f3: '2' }],
      ['final'],
      ['newGame', { f1: '0', f3: '0' }],
    ]);
    expect(run.valid).toBe(true);
    expect(run.errors).toEqual([]);
    const [start, aLeads, tied, bLeads, final, fresh] = run.steps;
    expect(start.root).toBe('scoreboard');
    // The payload never passes through update(), so the leader mark proves scorePoint ran.
    expect(aLeads.root).toContain('scoreboard-lead-a');
    expect(tied.root).not.toMatch(/scoreboard-lead-/);
    expect(bLeads.scores).toEqual(['1', '2']);
    expect(bLeads.root).toContain('scoreboard-lead-b');
    // Scoring never moves the main group: the strip does not re-enter on every point.
    expect(bLeads.groups.main).toBe(start.groups.main);
    expect(final.root).toContain('scoreboard-final');
    expect(final.groups.result).toBe('final');
    // A show has rounds: the same press that zeroes the scores takes the result back to live.
    expect(fresh.scores).toEqual(['0', '0']);
    expect(fresh.groups.result).toBe('live');
    expect(fresh.root).toBe('scoreboard');
  });
}

test('the wizard offers the answer count and the correct answer, and not the contestant\'s pick', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Quiz');
  await pickDesign(page, 'Sticker Quiz');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields

  const setup = page.getByTestId('wz-setup');
  await expect(setup.getByTestId('wz-setup-correctAnswer')).toBeVisible();
  // The pick is written by the Pick buttons (`set`), which makes it live state exactly as a
  // carried payload is - it is not something to decide while building the graphic.
  await expect(setup.getByTestId('wz-setup-selectedAnswer')).toHaveCount(0);
  await setup.getByTestId('wz-setup-answerCount-opt-2').click();

  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return Object.fromEntries(useTemplateStore.getState().template.fields.map((f) => [f.title, f.value]));
  });
  expect(fields['Answers shown']).toBe('2');
});

test('each game-show family is a Browse style chip holding its three graphics', async ({ page }) => {
  const families = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const all = Object.values(CATALOG).flat();
    return Object.fromEntries(
      ['sticker', 'showtime', 'arcade'].map((family) => [
        family,
        all.filter((variant) => variant.styleTag === family).map((variant) => variant.category).sort(),
      ]),
    );
  });
  for (const family of ['sticker', 'showtime', 'arcade']) {
    expect(families[family]).toEqual(['lower-third', 'quiz', 'scoreboard']);
  }
});
