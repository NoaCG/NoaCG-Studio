// covers: src/export/targets/ograf.ts
// covers: src/templates/**
//
// THE SHADOW MOUNT PAINTS THE LIGHT MOUNT'S FRAME, in the default suite: the first design of every
// catalog category, the Lottie and stretch probes, and the shipped quiz-board SVG. The whole
// catalog and the SVG corpus run in e2e/catalog/ograf-parity.spec.ts. How frames are taken and
// compared, and why on a virtual clock: e2e/_ografParity.ts (AC-3 of
// docs/work-specs/ograf-shadow-root/spec.md).

import { test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectParity, paritySweep, STRETCH_PROBE, type ParitySource } from './_ografParity';
import { QUIZ_SVG } from './_svg-import';

/** The default suite's slice, in this many parallel units. */
const UNITS = 3;

for (let unit = 0; unit < UNITS; unit++) {
  test(`the shadow mount paints the light mount's frame: one design per category, part ${unit + 1} of ${UNITS}`, async ({ page, browser }) => {
    test.setTimeout(240_000);
    await page.goto('/app');
    const firsts = await page.evaluate(async () => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      return Object.values(CATALOG).map((variants) => variants?.[0]?.id).filter((id): id is string => !!id);
    });
    const all: ParitySource[] = [
      ...firsts.map((id) => ({ kind: 'design' as const, id })),
      { kind: 'lottie' },
      STRETCH_PROBE,
      { kind: 'svg', name: 'Quiz Board', source: readFileSync(QUIZ_SVG, 'utf8') },
    ];
    const sources = all.filter((_, i) => i % UNITS === unit);
    await expectParity(`default slice part ${unit + 1}`, await paritySweep(page, browser, sources), sources.length);
  });
}
