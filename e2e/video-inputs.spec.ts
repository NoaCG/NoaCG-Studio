// covers: src/ai/video/**, src/video/**, src/components/video/**, api/{ai/**,_lib/ai*{,/**}}
// covers: src/components/{fields/**,SampleDataPanel.tsx,ControlPanel.tsx,HostedControlPage.tsx}
//
// The video project's editable inputs (its Template Definition) across an AI refinement.
// The Anthropic API is mocked at the network level, so the whole real provider path runs -
// motion plan, module emit, validation, apply - without a key or cost.
//
// The case that matters: a refinement re-emits the COMPLETE module and therefore re-declares
// its inputs. A model that forgets to repeat the array (schema-legal: `inputs` may be []) must
// NOT empty the user's Content panel and revert their text to the code default. Values the
// user typed are theirs; only an explicit content change may take them away.

import { test, expect } from '@playwright/test';
import { createVideoProject, mockClaude, player, useFakeAiKey } from './_video';

const HEADLINE_DEFAULT = 'Prime Time';

/** A valid composition (compiles, passes the static contract, renders every probed frame). */
function moduleTsx(exitFrames: number): string {
  return `import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

export default function Composition({ fields = {} }: { fields?: Record<string, string | number> }) {
  const frame = useCurrentFrame();
  const headline = fields.headline ?? '${HEADLINE_DEFAULT}';
  const enter = interpolate(frame, [0, ${exitFrames}], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: '#0b0d10' }}>
      <div style={{ opacity: enter, color: '#f4f4f5', fontFamily: 'sans-serif', fontSize: 72 }}>
        {headline}
      </div>
    </AbsoluteFill>
  );
}
`;
}

/** The generation: a module that declares one editable headline. */
const MODULE_WITH_INPUTS = {
  summary: 'A headline that fades up.',
  tsx: moduleTsx(15),
  inputs: [{ key: 'headline', type: 'text', label: 'Headline', default: HEADLINE_DEFAULT }],
};

/** The refinement: the same module edited - and the inputs array dropped to []. */
const MODULE_NO_INPUTS = {
  summary: 'Snappier entrance.',
  tsx: moduleTsx(8),
  inputs: [],
};

test.beforeEach(async ({ page }) => {
  await useFakeAiKey(page);
});

test('a refinement that re-emits no inputs keeps the ones the user is editing', async ({ page }) => {
  const { emits } = await mockClaude(page, [MODULE_WITH_INPUTS, MODULE_NO_INPUTS]);
  await createVideoProject(page);

  // The generation lands: its declared input shows up in the Content panel at its default.
  await page.getByTestId('video-tab-content').click();
  const headline = page.getByTestId('video-input-headline');
  await expect(headline).toHaveValue(HEADLINE_DEFAULT);

  // The user makes it theirs - and the live preview follows through the set-props channel.
  await headline.fill('Cup Final Tonight');
  await expect(player(page).getByText('Cup Final Tonight')).toBeVisible({ timeout: 10_000 });

  // Now a refinement about MOTION, whose emit forgets to re-declare the inputs.
  await page.getByTestId('video-tab-chat').click();
  await page.getByTestId('video-chat-field').fill('make the entrance snappier');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('.ai-msg.assistant').nth(1)).toBeVisible({ timeout: 15_000 });
  expect(emits()).toBe(2); // the refinement really did re-emit the module

  // The input survives, still carrying the user's value - not wiped, not reverted to the
  // code default. (Before the fix: the Content panel emptied and the preview said "Prime Time".)
  await page.getByTestId('video-tab-content').click();
  await expect(page.getByTestId('video-content-empty')).toHaveCount(0);
  await expect(page.getByTestId('video-input-headline')).toHaveValue('Cup Final Tonight');
  await expect(player(page).getByText('Cup Final Tonight')).toBeVisible({ timeout: 10_000 });
});

test('an asset keeps its logical name when another asset is deleted', async ({ page }) => {
  // The name is what the composition's code and an image input's value point at, so it must
  // never move under an asset the user didn't touch. Two files whose names differ only by
  // extension used to collide on the stem and get told apart by POSITION: deleting the first
  // renamed the second, silently breaking every reference to it.
  await mockClaude(page, [MODULE_WITH_INPUTS]);
  await createVideoProject(page);

  await page.getByTestId('video-tab-assets').click();
  const svg = (fill: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${fill}"/></svg>`;
  await page.locator('input[type=file]').setInputFiles([
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg('#ff0000')) },
    { name: 'logo.png', mimeType: 'image/svg+xml', buffer: Buffer.from(svg('#00ff00')) },
  ]);

  // Distinct names, settled at upload: the stem collision is resolved in the PATH.
  const names = page.locator('.video-asset-list code');
  await expect(names).toHaveCount(2);
  await expect(names.nth(0)).toHaveText('logo');
  await expect(names.nth(1)).toHaveText('logo-2');

  // Delete the FIRST. The survivor keeps the name everything already points at.
  await page.locator('.video-asset-list li').first().getByRole('button', { name: '✕' }).click();
  await expect(names).toHaveCount(1);
  await expect(names.nth(0)).toHaveText('logo-2');
});

test('a field written by hand into the code becomes editable in the Content panel', async ({ page }) => {
  // The code is the source of truth, so it decides what is editable. A pro who opens the
  // composition and reads `fields.subtitle ?? '...'` has declared an input just as the AI
  // would have - the panel reads it straight back out of the module.
  await mockClaude(page, [MODULE_WITH_INPUTS]);
  await createVideoProject(page);

  // Hand-write a module that reads TWO fields the AI never declared: a subtitle and a colour.
  // (Through the store - Monaco isn't reliably driveable headless, and the store is what it
  // writes to.)
  await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    useVideoProjectStore.getState().setSource(`
import { AbsoluteFill } from 'remotion';

export default function Composition({ fields = {} }: { fields?: Record<string, string | number> }) {
  const subtitle = fields.subtitle ?? 'Live tonight';
  const barColor = fields.barColor ?? '#f6a623';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', background: barColor }}>
      <div style={{ color: '#fff', fontSize: 80 }}>{subtitle}</div>
    </AbsoluteFill>
  );
}
`);
  });
  await expect(player(page).getByText('Live tonight')).toBeVisible({ timeout: 10_000 });

  // Both reads show up as fields, typed from the code's own fallback: text and colour.
  await page.getByTestId('video-tab-content').click();
  const subtitle = page.getByTestId('video-input-subtitle');
  await expect(subtitle).toHaveValue('Live tonight');
  await expect(page.getByTestId('video-input-barColor')).toHaveValue('#f6a623');
  await expect(subtitle).toHaveAttribute('type', 'text');
  await expect(page.getByTestId('video-input-barColor')).toHaveAttribute('type', 'color');

  // Editing one adopts it into the project and drives the live preview, like any other field.
  await subtitle.fill('Kickoff 20:00');
  await expect(player(page).getByText('Kickoff 20:00')).toBeVisible({ timeout: 10_000 });
  const adopted = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.inputs.map((i) => `${i.key}=${i.value}`);
  });
  expect(adopted).toContain('subtitle=Kickoff 20:00');
});
