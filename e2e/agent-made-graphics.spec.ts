import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// AN AGENT-AUTHORED MACHINE, DRIVEN FROM THE PRODUCTION PAGE.
//
// The fixture beside this file is the Elämäni biisi proof case (docs/CONTROL_PANEL_ANY_GRAPHIC.md
// §3a, §3b), authored through the CLI against the shipped `noacg-graphic` skill on 2026-09-15 and
// packed with `noacg pack`. Every other control-panel spec drives a graphic the STUDIO built from
// a type; this one drives one an agent wrote by hand, which is the claim the skill makes and the
// only way to find out whether the derived panel really comes from the graphic's own code.
//
// What it pins is the ⚡ block's whole contract for such a graphic: the authored control appears
// under the section word the author chose, it is GREY until the cue is on air and says why, its
// hover names the payload in the OPERATOR's words rather than as `f15`, and Take makes it live.
//
// The second test is a LAYOUT pin, and it is here rather than in layout.spec.ts because it is the
// same surface: the five transport verbs must not overlap. See its own comment for the failure.
const PACK = readFileSync(
  fileURLToPath(new URL('./fixtures/agent-made/elamani-biisi.noacgpack.json', import.meta.url)),
  'utf8',
);

/** Install the proof-case pack; it lands as a production with both cues ready to operate. */
async function importProofCase(page: import('@playwright/test').Page) {
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'elamani-biisi.noacgpack.json',
    mimeType: 'application/json',
    buffer: Buffer.from(PACK),
  });
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
}

test('an agent-authored machine brings its own button, greyed until the cue is on air', async ({ page }) => {
  await importProofCase(page);

  // The first cue is the votes board, so the ⚡ block is already showing its one control.
  const reveal = page.getByTestId('cue-action-reveal');
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveText('⚡ Reveal performer');

  // THE SECTION IS THE AUTHOR'S WORD. Nothing in the studio knows what "Song" means; the heading
  // is `machine.controls[0].section` read back out of the graphic's own NOACG_ANIM block.
  await expect(page.getByTestId('cue-actions').locator('.pd-actions-section h4')).toHaveText('Song');

  // GREY BEFORE TAKE, and it says why. A ⚡ button fires on the layer that is on air, so off air
  // there is nothing for it to fire at - and the surface has to say that rather than look broken.
  await expect(reveal).toBeDisabled();
  await expect(reveal).toHaveAttribute('title', 'The graphic is not on air. Take the cue first.');

  // TAKE, and the same button is live with its payload named in the operator's words. "Correct"
  // is the title the author gave f15; a field id here would tell an operator nothing, which is
  // the whole reason the hint is built from the descriptors (docs/PLAYOUT_DASHBOARD.md §7b).
  //
  // THIS IS THE ASSERTION THE WALK'S FIRST RUN FAILED. The control also `set`s f16, the hidden
  // reported field, and `adjustWords` used to fall back to the raw key for a field with no
  // operator label - so the hint read `moves f16 to revealed with it` and the payload was never
  // mentioned at all. Every graphic the skill teaches an agent to build carries such a holder,
  // so the wrong sentence was the common case. Mutation test it by putting `labelOf(key) ?? key`
  // back in src/control/controlModel.ts.
  await page.getByTestId('verb-take').click();
  await expect(reveal).toBeEnabled();
  await expect(reveal).toHaveAttribute(
    'title',
    "Fires Reveal performer on the live graphic, carrying this cue's Correct.",
  );
  expect(await reveal.getAttribute('title')).not.toMatch(/\bf\d+\b/);

  // The authored states reach the recovery picker too - proof the whole group came across, not
  // just the one arrow that has a button.
  await expect(page.getByTestId('cue-actions')).toContainText('Votes');
  await expect(page.getByTestId('cue-actions')).toContainText('Revealed');
});

test('the totals board declares eleven controls and every one of them renders in its own section', async ({ page }) => {
  await importProofCase(page);

  // The second cue is the totals board: five +1/−1 pairs and one destructive reset.
  await page.getByTestId('cue-list').locator('.pd-cue').nth(1).click();
  const actions = page.getByTestId('cue-actions');
  await expect(actions.locator('.pd-action')).toHaveCount(11);
  await expect(actions.locator('.pd-actions-section h4')).toHaveText([
    'Panelist 1',
    'Panelist 2',
    'Panelist 3',
    'Panelist 4',
    'Panelist 5',
    'Game',
  ]);

  // `destructive: true` is the author's own flag, and it is the only thing that makes New game
  // read differently from the ten presses beside it.
  await expect(page.getByTestId('cue-action-newGame')).toHaveClass(/destructive/);

  // An `adjust` control names the FIELD it moves, by title, and by how much. That field name is
  // also what tells this button from its four neighbours: every panelist's press is labelled "+1",
  // so "moves Points 3 +1" is the only part of the sentence that says which panelist. The hint
  // used to open with the machine's own `plus3` instead, which named the button at the cost of
  // naming it in a vocabulary no operator has seen.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('cue-action-plus3')).toHaveAttribute(
    'title',
    'Fires +1 on the live graphic and moves Points 3 +1 with it.',
  );
});

// THE TRANSPORT VERBS MUST NOT OVERLAP, AND THE DEFAULT VIEWPORT CANNOT SEE IT.
//
// `.pd-stagehead` puts the verb stack beside PROGRAM at and above 1366px. Its second track used
// to be `minmax(0, 1fr)` with no floor, while the monitors' width follows `--pd-monitor-h`, which
// grows with the viewport HEIGHT - so on a tall, not-especially-wide window the monitors took
// everything and the verb column measured 27px at 1440×900 and 0px at 1600×1000. The five buttons
// then overflowed their own track and painted in pairs: ✎ Update over ⟳ Re-take, ■ Out over
// » Next. A click on Next hit Out and took the graphic off air, which is the worst thing this
// surface can do. Measured 2026-09-15 on the production page during the proof-case walk.
//
// The suite's own viewport is Desktop Chrome's 1280×720, below the breakpoint, so this test sets
// the size that actually breaks. Mutation test it by putting `auto minmax(0, 1fr)` back.
test('the transport verbs keep their column on a tall window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await importProofCase(page);

  const VERBS = ['verb-take', 'verb-retake', 'verb-update', 'verb-next', 'verb-out'];
  const boxes = await Promise.all(
    VERBS.map(async (id) => ({ id, box: await page.getByTestId(id).boundingBox() })),
  );
  for (const { id, box } of boxes) expect(box, `${id} has no box`).not.toBeNull();

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].box!;
      const b = boxes[j].box!;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(
        overlapX <= 0 || overlapY <= 0,
        `${boxes[i].id} and ${boxes[j].id} overlap by ${Math.round(overlapX)}×${Math.round(overlapY)}px - a verb painted over another verb means a press lands on the wrong one`,
      ).toBe(true);
    }
  }

  // AND THE COLUMN KEPT ITS FLOOR. Non-overlapping boxes are the symptom; the floor is the
  // mechanism, and asserting it names the regression directly - any future change that lets the
  // monitors eat the track again fails here with a number rather than through a geometry riddle.
  //
  // The floor is what it is because of the margin it buys the LABELS: at the first cut's 186px
  // the tightest verb measured 90px of ink in a 90px box, so its padding was entirely spent.
  // That measurement is deliberately NOT asserted. It is font geometry, this laptop only ever
  // rasterises Windows faces, and the platform CI renders on is one no operator drives the
  // dashboard from - so a red there would say something about Linux metrics rather than about
  // the product (e2e/AGENTS.md, "An assertion on rendered TEXT geometry needs a BOUND"). The
  // reasoning and the numbers live in src/styles/playout-dashboard.css instead.
  const column = await page.locator('.pd-verbs').boundingBox();
  expect(Math.round(column!.width), 'the verb column lost its floor').toBeGreaterThanOrEqual(206);
});
