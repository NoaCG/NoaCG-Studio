// covers: none - no source path selected this spec when coverage moved into spec headers
// (2026-09-27); it runs when edited, on a full escalation and at night
//
// The static video validators, replayed over REAL model output.
//
// `e2e/fixtures/generations/` holds 57 compositions from a 42-generation benchmark that cost
// real money (docs/HYPERFRAMES_QUALITY.md) - both engines, seven briefs, the sources that
// SHIPPED and the ones a repair round rejected. They are checked in so that changing a
// validator rule or a prompt contract can be tested against genuine generations for free,
// instead of against the handful of documents someone writes by hand while holding the new
// rule in mind.
//
// It guards the failure this codebase keeps repeating: a pattern that matches something it
// was never meant to. `network-url` hit `xmlns="http://www.w3.org/2000/svg"`; `forbidden-api`
// hit `// deterministic, no repeat:-1`. Both looked correct in isolation, both made repair
// rounds unwinnable, and both would have been caught here in seconds - the rules they broke
// fire on documents that are otherwise perfectly legal, which is exactly what this corpus is
// full of.
//
// The baseline records the rules each file produces TODAY. A diff is not automatically a
// failure - it is the question "did you mean to change what these 57 documents report?".

import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'e2e/fixtures/generations');
const BASELINE = join(DIR, 'baseline.json');

/**
 * The one asset the benched briefs uploaded. It has to be here or every `asset:noacg-icon-512`
 * reference reads as unknown and the baseline fills with `asset-name` noise. The HyperFrames
 * validator takes real AssetFiles and derives the logical name from the PATH stem
 * (video/types.ts assetLogicalName); the Remotion one takes the already-described form.
 */
const ASSET_PATH = 'images/noacg-icon-512.png';
// An AssetFile is {path, data}; the mime is read back off the data URL, so it has to be one.
const ASSET_FILES = [{ path: ASSET_PATH, data: 'data:image/png;base64,iVBORw0KGgo=' }];
const ASSET_INFO = [{ name: 'noacg-icon-512', path: ASSET_PATH, mime: 'image/png' }];

const files = (engine: string, ext: string) =>
  readdirSync(join(DIR, engine))
    .filter((f) => f.endsWith(ext))
    .sort();

test('the static validators report the same findings over 57 real generations', async ({ page }) => {
  await page.goto('/app');

  const hyperframes = files('hyperframes', '.html').map((f) => ({
    file: `hyperframes/${f}`,
    source: readFileSync(join(DIR, 'hyperframes', f), 'utf8'),
  }));
  // Remotion declares its inputs in the emit tool, not in the code, so the saved .tsx alone
  // cannot exercise the `inputs` rule - the declared keys travel alongside it.
  const declared = JSON.parse(readFileSync(join(DIR, 'remotion-inputs.json'), 'utf8')) as Record<string, string[]>;
  const remotion = files('remotion', '.tsx').map((f) => ({
    file: `remotion/${f}`,
    source: readFileSync(join(DIR, 'remotion', f), 'utf8'),
    inputs: (declared[f] ?? []).map((key) => ({ key })),
  }));

  const actual = await page.evaluate(
    async ([hf, rm, assetFiles, assetInfo]) => {
      const { staticValidateHyperframes } = await import('/src/video/hyperframes/validate.ts');
      const { staticValidate } = await import('/src/video/compile.ts');
      const out: Record<string, string[]> = {};

      for (const { file, source } of hf as { file: string; source: string }[]) {
        // Settings come from the document's OWN declared duration, so `duration-mismatch`
        // does not fire across a corpus whose briefs ran at 3, 4 and 5 seconds - that rule is
        // about a project setting disagreeing with the code, which is not what is under test.
        const declared = Number(/data-duration="([0-9.]+)"/.exec(source)?.[1] ?? 5);
        const settings = {
          width: 1920,
          height: 1080,
          fps: 30,
          durationInFrames: Math.round(declared * 30),
          transparent: false,
        };
        out[file] = staticValidateHyperframes(source, assetFiles as never, settings)
          .map((i) => i.rule)
          .sort();
      }
      for (const { file, source, inputs } of rm as {
        file: string;
        source: string;
        inputs: { key: string }[];
      }[]) {
        out[file] = staticValidate(source, assetInfo as never, inputs)
          .map((i) => i.rule)
          .sort();
      }
      return out;
    },
    [hyperframes, remotion, ASSET_FILES, ASSET_INFO] as const,
  );

  // Deliberate act, never a convenience: regenerating means asserting that the new findings
  // over 57 real generations are the ones you intended.
  if (process.env.UPDATE_CORPUS_BASELINE) {
    writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
    test.info().annotations.push({ type: 'baseline', description: 'rewrote baseline.json' });
    return;
  }

  const expected = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, string[]>;
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());

  // Compare per file so a failure names the document and the rule, not a wall of JSON.
  const changed: string[] = [];
  for (const file of Object.keys(expected).sort()) {
    const before = (expected[file] ?? []).join(',');
    const after = (actual[file] ?? []).join(',');
    if (before !== after) changed.push(`${file}: [${before}] -> [${after}]`);
  }
  expect(changed, `findings changed over the real-generation corpus:\n${changed.join('\n')}`).toEqual([]);
});
