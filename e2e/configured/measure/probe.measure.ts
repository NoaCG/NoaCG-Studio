import { test, expect } from '@playwright/test';
import { buildFixture, outputSlugOf } from './_fixture';
import { FIXTURE, writeResult } from './_measure';
import { readyOf } from '../_helpers';

test('probe', async ({ page, context }) => {
  const fx = await buildFixture(page, FIXTURE);
  console.log(JSON.stringify(fx));
  const slug = await outputSlugOf(page, fx.showId);
  const out = await context.newPage();
  const t0 = Date.now();
  await out.goto(`/output?production=${encodeURIComponent(slug)}`);
  await expect.poll(async () => { const r = await readyOf(out); return r ? `${r.n}/${r.of}` : null; }, { timeout: 120_000 }).toBe(`${fx.graphics}/${fx.graphics}`);
  const imgs = [];
  for (const f of out.frames()) imgs.push(await f.evaluate(() => [...document.querySelectorAll('img.lp2-gen')].map((i) => (i as HTMLImageElement).naturalWidth)).catch(() => 'x'));
  console.log('ready ms', Date.now() - t0, JSON.stringify(imgs));
  writeResult('probe', { fx, imgs });
});
