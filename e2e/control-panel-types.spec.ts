import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

// EVERY INTERACTIVE TYPE'S CONTROL PAGE, DRIVEN.
//
// `#/control/<id>` is the surface that AIRS a saved graphic (docs/CONTROL_LAYER.md, the
// per-graphic panel), and until this spec nothing in the merge gate opened it on a graphic that
// HAS a machine. What was covered was the model layer (e2e/lite-parity.spec.ts compares field /
// event / group lists) and the EXPORTED panel (e2e/control.spec.ts drives the quiz over the
// BroadcastChannel) - neither of which touches this page's own greying, its state chip, or the
// command channel it drives the sandboxed preview through.
//
// The claim under test is the one docs/GRAPHIC_TYPES.md makes: a type declares its states and its
// operator events, `attachMachine` puts them on the template inside `variant.create()`, and the
// control page is GENERATED from that with no per-type code. So each case below states only what
// the TYPE authored - the walk, and which buttons the structural guard leaves pressable at each
// step - and the spec drives it.
//
// Legality is asserted at every step rather than at the end, because the failure this catches is
// a button that is pressable one state too early: it produces a correct-looking final state and a
// wrong picture on air in between.

interface Step {
  /** Event to fire, or a lifecycle press. */
  press: string | 'play' | 'next' | 'stop';
  /** The state chip's expected text afterwards - the state's NAME, since that is what an
   *  operator surface shows (controlModel.ts formatMachineState); several groups prefix the
   *  group id, because with a clock and a flag running at once the name alone does not say
   *  which of them moved. */
  state: string;
  /** Which event buttons must be pressable afterwards; every other one must be greyed. */
  legal: string[];
}

interface TypeCase {
  /** Catalog variant id - the design the type ships in the house family. */
  variantId: string;
  name: string;
  /** Every event button the type declares, in declared order. */
  buttons: string[];
  /** The state chip once the page has settled, before anything is pressed. */
  settled: string;
  legalAtRest: string[];
  walk: Step[];
}

const CASES: TypeCase[] = [
  {
    // The far end of the model: one group, four branches, and a lock that is STRUCTURAL - after
    // it there is no `select` arrow, so a late pick is impossible rather than refused.
    variantId: 'qz02',
    name: 'quiz board',
    buttons: ['select', 'lock', 'revealChoice', 'judge', 'audience'],
    settled: 'Question',
    legalAtRest: ['select', 'lock', 'judge'],
    walk: [
      { press: 'play', state: 'Question', legal: ['select', 'lock', 'judge'] },
      { press: 'select', state: 'Answer selected', legal: ['select', 'lock'] },
      { press: 'lock', state: 'Locked in', legal: ['judge'] },
      { press: 'judge', state: 'Reveal', legal: ['audience'] },
      { press: 'audience', state: 'Audience result', legal: [] },
    ],
  },
  {
    // The hidden-pick flow: locking straight from the question is a DIFFERENT on-air moment from
    // locking a visible pick, and which one you are in must not depend on how you got there.
    variantId: 'qz02',
    name: 'quiz board, hidden pick',
    buttons: ['select', 'lock', 'revealChoice', 'judge', 'audience'],
    settled: 'Question',
    legalAtRest: ['select', 'lock', 'judge'],
    walk: [
      { press: 'play', state: 'Question', legal: ['select', 'lock', 'judge'] },
      { press: 'lock', state: 'Locked, choice hidden', legal: ['revealChoice', 'judge'] },
      { press: 'revealChoice', state: 'Locked in', legal: ['judge'] },
    ],
  },
  {
    // Two ways to close a vote, and a winner that can only be called off a board already showing
    // its figures.
    variantId: 'pl01',
    name: 'live vote',
    buttons: ['close', 'result', 'call'],
    settled: 'Enter',
    legalAtRest: ['close', 'result'],
    walk: [
      { press: 'play', state: 'Enter', legal: ['close', 'result'] },
      { press: 'close', state: 'Voting closed', legal: ['result'] },
      { press: 'result', state: 'Result', legal: ['call'] },
      { press: 'call', state: 'Winner called', legal: [] },
    ],
  },
  {
    // Three independent pointers instead of eight combined states. The chip names all three, and
    // a match does not un-finish. A goal is legal from BOTH flag states (a second goal while the
    // flag is still up replays it and bumps again - the self-transition), so the goal buttons
    // never grey while the graphic is up; only Clear flag follows the flag.
    variantId: 'sb03',
    name: 'scoreboard',
    buttons: ['goalA', 'goalB', 'clearFlag', 'final'],
    settled: 'Enter · No flag · Live',
    legalAtRest: ['goalA', 'goalB', 'final'],
    walk: [
      { press: 'goalA', state: 'Enter · Flag · Live', legal: ['goalA', 'goalB', 'clearFlag', 'final'] },
      { press: 'goalB', state: 'Enter · Flag · Live', legal: ['goalA', 'goalB', 'clearFlag', 'final'] },
      { press: 'clearFlag', state: 'Enter · No flag · Live', legal: ['goalA', 'goalB', 'final'] },
      { press: 'final', state: 'Enter · No flag · Final', legal: ['goalA', 'goalB'] },
      // Stop rests every group at its INITIAL state, which is what makes `final` offerable again.
      { press: 'stop', state: 'Off · No flag · Live', legal: ['goalA', 'goalB', 'final'] },
    ],
  },
  {
    // The cheapest honest parallel group: a clock the operator can hold, running alongside a walk
    // that knows nothing about it.
    variantId: 'gt05',
    name: 'countdown',
    buttons: ['pause', 'resume'],
    settled: 'Enter · Running',
    legalAtRest: ['pause'],
    walk: [
      { press: 'play', state: 'Enter · Running', legal: ['pause'] },
      { press: 'pause', state: 'Enter · Paused', legal: ['resume'] },
      { press: 'resume', state: 'Enter · Running', legal: ['pause'] },
    ],
  },
];

/** Save a catalog design to the library and open its control page. */
async function openControlPage(page: Page, variantId: string, name: string): Promise<void> {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();
  const id = await page.evaluate(async ([vid, gname]) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const variant = variantById(vid);
    if (!variant) throw new Error(`no catalog variant ${vid}`);
    // `create({})` is the wizard's own call - and for a typed design it is the wrapper that runs
    // attachMachine, which is exactly the step this spec exists to prove reaches the page.
    const { doc, error } = createGraphic(variant.create({}), { name: gname });
    if (error) throw new Error(error);
    return doc.id;
  }, [variantId, name] as const);
  await settleDurableWrites(page);
  await page.goto(`/app#/control/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
}

/** The chip, once the 500 ms machine-state poll has answered at least once. */
async function expectState(page: Page, state: string): Promise<void> {
  await expect
    .poll(async () => ((await page.getByTestId('control-state').textContent()) ?? '').replace(/^[●◇]\s*/, '').trim())
    .toBe(state);
}

async function expectLegality(page: Page, buttons: string[], legal: string[]): Promise<void> {
  for (const event of buttons) {
    const button = page.getByTestId(`control-event-${event}`);
    if (legal.includes(event)) await expect(button, `${event} should be pressable`).toBeEnabled();
    else await expect(button, `${event} should be greyed`).toBeDisabled();
  }
}

for (const c of CASES) {
  test(`the control page drives a ${c.name} by its own machine`, async ({ page }) => {
    await openControlPage(page, c.variantId, `Control ${c.name}`);

    // Every declared control event is a button, wearing the label the TYPE gave it.
    for (const event of c.buttons) {
      await expect(page.getByTestId(`control-event-${event}`)).toBeVisible();
    }

    // At rest the page has SETTLED the preview at its on-air pose, so the guard already applies.
    await expectState(page, c.settled);
    await expectLegality(page, c.buttons, c.legalAtRest);

    for (const step of c.walk) {
      if (step.press === 'play') await page.getByTestId('control-play').click();
      else if (step.press === 'next') await page.getByTestId('control-next').click();
      else if (step.press === 'stop') await page.getByTestId('control-stop').click();
      else await page.getByTestId(`control-event-${step.press}`).click();
      await expectState(page, step.state);
      await expectLegality(page, c.buttons, step.legal);
    }
  });
}

test('an event fired with no entry selected keeps the values already on air', async ({ page }) => {
  // The payload's values live in an ENTRY on this surface, and a freshly saved graphic has
  // none. Building the payload from `values[key] ?? ''` therefore sent an empty string for
  // every payload field and the machine applied it - so ⚡ Select answer WIPED the pick rather
  // than making one, on the surface that airs. The guard is about the event, never the value,
  // so nothing else was ever going to catch it.
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();
  const id = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { setFieldDefault } = await import('/src/blocks/edit.ts');
    // A board whose pick is already C - the state an operator reaches by exporting the graphic
    // with its data, or by ★ making an entry the default. Nothing on the page can re-type it,
    // which is exactly why an event must not silently replace it.
    const template = setFieldDefault(variantById('qz02')!.create({}), 'f6', 'C');
    const { doc, error } = createGraphic(template, { name: 'Control payload' });
    if (error) throw new Error(error);
    return doc.id;
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/control/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  const frame = page.frameLocator('iframe[title="Graphic preview"]');

  await page.getByTestId('control-play').click();
  await expectState(page, 'Question');
  await page.getByTestId('control-update').click();
  await expect(frame.locator('#f6')).toHaveText('C');

  // No entry is selected, so the event carries nothing and the pick on air survives it.
  await page.getByTestId('control-event-select').click();
  await expectState(page, 'Answer selected');
  await expect(frame.locator('#f6')).toHaveText('C');
  await expect(frame.locator('.quiz-option.quiz-sel')).toHaveCount(1);
});

test('a graphic with no machine gets a transport and no event buttons', async ({ page }) => {
  // The simplicity guard, from the operator's side: a lower third persists no machine, so the
  // page must offer the four lifecycle presses and nothing else. This is also what makes
  // "Lite has control-panel parity" vacuous today (e2e/lite-parity.spec.ts says why).
  await openControlPage(page, 'lt11', 'Control strap');
  await expect(page.getByTestId('control-play')).toBeVisible();
  await expect(page.getByTestId('control-update')).toBeVisible();
  await expect(page.getByTestId('control-next')).toBeVisible();
  await expect(page.getByTestId('control-stop')).toBeVisible();
  await expect(page.locator('[data-testid^="control-event-"]')).toHaveCount(0);
  // No sections either - a machine-less graphic has nothing to group.
  await expect(page.locator('.ctl-event-section')).toHaveCount(0);
  // And the chip still reads as a word: with no machine key the names come from the DERIVED
  // machine, which takes them from the step names ("Enter"), not from the slugged ids.
  await expectState(page, 'Enter');
});

test('event buttons carry the sections the type declared', async ({ page }) => {
  // Every other renderer of this vocabulary groups by `machine.controls[].section`; this page
  // laid all of them in one flat transport row, so a quiz put nine controls in a single line
  // with no grouping and no order cue.
  await openControlPage(page, 'sb03', 'Control sections');
  const sections = page.locator('.ctl-event-section');
  await expect(sections).toHaveCount(2); // the scoreboard declares Goal and Result
  await expect(sections.nth(0).locator('h4')).toHaveText('Goal');
  await expect(sections.nth(1).locator('h4')).toHaveText('Result');
  // The buttons live INSIDE their section, not beside the transport.
  await expect(sections.nth(0).getByTestId('control-event-goalA')).toBeVisible();
  await expect(sections.nth(1).getByTestId('control-event-final')).toBeVisible();
});
