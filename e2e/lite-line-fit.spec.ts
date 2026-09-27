// covers: src/ai/**
//
// An identity line must not wrap, and a headline may.
//
// The first production NoaCG Lite round shipped a five-line "lower third": the operator's job
// title wrapped onto three rows and every gate passed it, because a wrapped line does not
// escape its frame - the overflow sweep and the runtime bench's stress pass both ask that
// question, and the type floor measures font size (docs/AI_LITE_PLAN.md §1).
//
// The discriminator is the line's declared ROLE, which Lite's schema has always required. A
// person's role, organization or location belongs on one line; a story headline running to two
// lines over a one-line kicker was the best frame that round produced. So this spec pins all
// three outcomes together - a guard that only proves the error fires would be satisfied by a
// check that flags everything.
//
// It drives `compileLiteDecision` directly (the shared compile path both production and the
// benchmark are built from) rather than the wizard: no model call, no tokens, and no dependency
// on the AI step's UI.

import { expect, test } from '@playwright/test';

const LONG_ROLE = 'International Development Policy Research Fellow';
const SHORT_ROLE = 'Head Coach';

/** Compile one Lite decision and report the validation rules it raised. */
async function rulesFor(
  page: import('@playwright/test').Page,
  role: string,
  sample: string,
): Promise<string[]> {
  return page.evaluate(
    async ([lineRole, lineSample]) => {
      const mod = await import('/src/ai/lite/pipeline.ts');
      type Decision = Parameters<typeof mod.compileLiteDecision>[0];
      type Context = Parameters<typeof mod.compileLiteDecision>[1];
      // `role` is required on a LITE decision's lines and absent from the shared DesignSpec
      // type, which is exactly the asymmetry singleLineIdentityFields reads at runtime - so the
      // fixture is built as data and narrowed once, rather than typed as `any`.
      const decision = {
          fit: 'catalog',
          reason: 'pinned by e2e',
          name: 'Line fit',
          summary: 'Line fit',
          category: 'lower-third',
          // lt32 Scrim is the tightest audited chassis - 28 characters on one line, measured by
          // scripts/lite-line-capacity.mjs. Picking it makes the wrap reproducible without a
          // absurd string, and it is the design the round actually failed on.
          variantId: 'lt32',
          intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: lineRole },
          lines: [
            { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
            { title: 'Role', sample: lineSample, role: lineRole },
          ],
          flourish: null,
        } as unknown as Decision;
      const result = await mod.compileLiteDecision(decision, {} as Context);
      // Warnings, not errors - see the severity note in runtimeBench. Both lists are read so
      // the spec keeps passing if the severity is ever raised, and fails if the finding stops
      // being raised at all, which is the thing worth pinning.
      return [...result.validation.errors, ...result.validation.warnings].map((f) => f.rule);
    },
    [role, sample] as const,
  );
}

test.describe('a Lite identity line stays on one line', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a person-role too long for the chassis raises bench-line-wrap', async ({ page }) => {
    expect(await rulesFor(page, 'person-role', LONG_ROLE)).toContain('bench-line-wrap');
  });

  test('the same chassis stays quiet when the role fits', async ({ page }) => {
    // The other half of the guard: without this, a check that flagged every graphic would pass
    // the test above and nobody would notice until it blocked real work.
    expect(await rulesFor(page, 'person-role', SHORT_ROLE)).not.toContain('bench-line-wrap');
  });

  test('the same long copy is allowed to wrap when it is a story headline', async ({ page }) => {
    // Identical string, identical chassis - only the declared role differs. This is what proves
    // the check reads the role rather than just measuring height.
    expect(await rulesFor(page, 'story-headline', LONG_ROLE)).not.toContain('bench-line-wrap');
  });

  test('a real Lite GENERATION raises it too, not only the benchmark compile', async ({ page }) => {
    // The three cases above drive `compileLiteDecision`, which is the BENCHMARK's entry point.
    // Production goes through the provider, and the browser builds its injected validator
    // (AiStep) long before a decision exists - so for a while the wrap check and the type floor
    // were findings every round measured and no user ever saw. `liteValidator` in
    // claudeProvider composes them from the decision; this is the pin that it still does.
    await page.route('**/api/ai/lite/generations', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generationId: '22222222-2222-4222-8222-222222222222',
        decision: {
          status: 'ready',
          aiCategory: 'lower-third',
          spec: {
            fit: 'catalog',
            reason: 'pinned by e2e',
            name: 'Line fit through the provider',
            summary: 'Line fit through the provider',
            category: 'lower-third',
            variantId: 'lt32',
            intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
            lines: [
              { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
              { title: 'Role', sample: LONG_ROLE, role: 'person-role' },
            ],
            flourish: '',
          },
        },
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        attemptCount: 1,
        repairCount: 0,
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    }));
    await page.route('**/api/ai/lite/outcome', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: '{"recorded":true}',
    }));

    const rules = await page.evaluate(async () => {
      // `claudeProvider` directly, not `getAiProvider()`: the suite pins OFFLINE mode, where
      // the resolver hands back the stub provider, which has no Lite path at all - so the
      // assertion would pass or fail for a reason that has nothing to do with this contract.
      const { claudeProvider } = await import('/src/ai/claudeProvider.ts');
      const context = {
        images: [],
        palette: null,
        resolution: { width: 1920, height: 1080, label: '1080p' },
        fps: 50,
      };
      // NO `validate` is injected on purpose: the point is that the LITE path composes its own,
      // so a caller that supplies nothing still gets the identity-wrap and type-floor findings.
      const change = await claudeProvider.generate(
        'A documentary super for a policy researcher.',
        context as never,
        { profile: 'lite' } as never,
      );
      const v = change.validation;
      return [...(v?.errors ?? []), ...(v?.warnings ?? [])].map((f) => f.rule);
    });
    expect(rules).toContain('bench-line-wrap');
  });
});
