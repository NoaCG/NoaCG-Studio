// AI quality bench: run REAL generations for a bank of template-less briefs, screenshot
// each result over a video-like backdrop, and build a review gallery. This is the raw
// material for iterating the system prompt in src/ai/claudeProvider.ts.
//
//   node scripts/ai-bench.mjs [out-dir] [count | id,id,…]
//
// Requirements: the dev server (this checkout's port - scripts/dev-port.mjs) started with
// the server-only key for whichever provider VITE_AI_PROVIDER names. The run pins that
// route and reports it; the key never enters this browser process or its storage.
// SPENDS REAL TOKENS - roughly a few cents per brief with
// the default model; the third arg limits the run to the first N briefs, or to a
// comma-separated list of brief ids (e.g. "karaoke-line,weather-now").
//
// Beyond validation, every result gets a RUNTIME LAYOUT CHECK in the settled frame:
// pairwise text-element overlap detection (unintentional stacking is the #1 taste bug).

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import { outDir } from './out-dir.mjs';
import * as rules from './rules.mjs';

// A paid run never belongs in CI: it needs a dev server and real credentials, and it spends money.
if (process.env.CI) {
  console.error(`[ai-bench] refused in CI. ${rules.text('ai/keep-paid-runs-out-they-require')}`);
  process.exit(1);
}

const BASE = `http://localhost:${devPort()}`;
const OUT = outDir(process.argv[2], './bench-out', 'Usage: node scripts/ai-bench.mjs [out-dir]');
const FILTER = process.argv[3] ?? '';
mkdirSync(OUT, { recursive: true });

// ── The brief bank: deliberately OFF-catalog graphics (no starting template) ──
const BRIEFS = [
  ['election-bars', 'Election results panel: three candidates as horizontal bars that grow to their percentage on play. Fields: three candidate names, three party names, three percentages. Counted-up numbers at the bar ends. Serious, newsroom-clean, bottom-center.'],
  ['weather-now', 'A "weather now" side panel: big temperature, a condition line, wind and humidity as small rows, city name as a caps kicker. Fields for all values. Calm and airy, mid-right, gentle slide-in.'],
  ['timing-tower', 'A motorsport timing tower, top-left: positions 1-5 as compact rows (position number on an accent chip, driver three-letter code, gap time). One textarea field, one line per driver "VER +0.000". Rows cascade in fast. Condensed, high-contrast.'],
  ['breaking-stinger', 'A full-width BREAKING NEWS stinger: a red band slams in across the lower third with the word BREAKING, then a headline field slides up under it. Urgent but controlled, fast snap, no bounce.'],
  ['recipe-card', 'A cooking-show ingredient card, mid-left: dish name heading, then a textarea of ingredients rendered as a tidy checklist with accent bullets. Warm, friendly, soft corners; items cascade in.'],
  ['donation-counter', 'A charity telethon total counter, bottom-center: a big euro amount counting up to the field value on each update while on air, a "TOTAL RAISED" kicker, and a progress bar toward a goal field. Celebratory but tasteful.'],
  ['karaoke-line', 'A karaoke lyric line, bottom-center: current line + next line smaller and dimmed. The current line wipes to the accent color left-to-right over 4 seconds after play. Playful, rounded.'],
  ['versus-card', 'A fullscreen match-up card: two team names and logo image fields around a big VS, event/date line underneath. Both sides slide in from their edges and meet in the middle. Dark arena mood.'],
  ['stock-strip', 'A financial index strip, top of screen: five index names with values and up/down arrows colored by direction, from one textarea field "DAX 18123 +0.4". Values update in place. Precise, tabular, no decoration.'],
  ['poll-donut', 'A live poll result: a donut/ring that fills to a percentage field on play, the percentage counted up in the middle, question text above. One accent, clean strokes, mid-center.'],
  ['schedule-board', 'A "coming up tonight" schedule board: three rows of time + show name from a textarea ("20:00 | News"), a header field on top. Elegant fullscreen-lite panel, rows reveal one by one.'],
  ['quote-card', 'A quote/attribution card for a talk show: a large quotation with typographic quote marks, the speaker name and role underneath. Fields: quote, name, role. Literary, generous whitespace, mid-center.'],
  // Corpus-derived (docs/SPX_EXAMPLES_CORPUS.md workstream 3): a real concert-hall graphic
  // described in our own words. Structure judged by our own gates, never visual similarity
  // to the licensed original.
  ['programme-loop', 'A concert programme board that pages by itself: works grouped under their composer from one textarea ("Sibelius | Finlandia | 8 min"), the composer as a heading above each group, and the performer credits as a second block that advances a page every few seconds while the board stays on air. Concert-hall restraint, one saturated accent, mid-center.'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
// Pin the route the SERVER was configured with (VITE_AI_PROVIDER / VITE_AI_MODEL) rather
// than a hardcoded one. This used to save provider:'anthropic', model:'claude-sonnet-5' -
// and because saved settings outrank env, that silently forced every run onto Anthropic
// whatever the server was started with, which would have made a model comparison compare
// one model with itself. Fallbacks are cleared so a failing route cannot be rescued by
// another and credited with the result.
// A managed key only counts as available to a SIGNED-IN caller once a backend is
// configured (api/ai/config.ts), and a fresh Playwright context has no session - so this
// bench refused to start with a perfectly good key. Sign in the same way the configured
// e2e suite does when credentials are present; without them the run fails with the honest
// message below rather than silently having no route.
const CREDS = {
  email: (process.env.E2E_EMAIL ?? '').trim(),
  password: (process.env.E2E_PASSWORD ?? '').trim(),
};
if (CREDS.email && CREDS.password) {
  try {
    await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    // WAIT for the creation wizard before dismissing it. Pressing Escape on load raced the
    // modal: it mounted afterwards and then swallowed the click on the topbar's Sign in.
    await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 });
    await page.keyboard.press('Escape');
    await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 });
    await page.getByRole('button', { name: 'Sign in', exact: true }).click({ timeout: 10_000 });
    await page.locator('#auth-email').fill(CREDS.email);
    await page.locator('#auth-pass').fill(CREDS.password);
    await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.locator('.auth-status').waitFor({ state: 'visible', timeout: 20_000 });
    console.log('Signed in for the managed route.');
  } catch (error) {
    console.error(`Sign-in failed (${error.message?.split('\n')[0]}) - continuing signed out.`);
  }
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
}

const route = await page.evaluate(async () => {
  const { refreshAiConfiguration, saveAiSettings, loadAiSettings, aiConfigured } = await import('/src/ai/settings.ts');
  await refreshAiConfiguration();
  const env = loadAiSettings(); // a fresh context has no saved settings, so this is the env route
  saveAiSettings({ provider: env.provider, model: env.model, fallbacks: [] });
  return { ok: aiConfigured(), provider: env.provider, model: env.model };
});
if (!route.ok) {
  console.error(`No server-managed route is available for ${route.provider}:${route.model}.`);
  console.error('Start the dev server with the matching server-only provider key.');
  await browser.close();
  process.exit(1);
}
console.log(`Route: ${route.provider}:${route.model}`);
await page.waitForTimeout(800);

const selected = /^[a-z-]+(,[a-z-]+)*$/.test(FILTER)
  ? BRIEFS.filter(([id]) => FILTER.split(',').includes(id))
  : BRIEFS.slice(0, Number(FILTER) || Infinity);

const results = [];
for (const [id, brief] of selected) {
  process.stdout.write(`▸ ${id} … `);
  try {
    const r = await page.evaluate(
      async ({ brief: b }) => {
        const { claudeProvider } = await import('/src/ai/claudeProvider.ts');
        const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
        const { benchTemplateRuntime, mergeResults } = await import('/src/validation/runtimeBench.ts');
        // The app's exact configuration: the runtime bench injected, findings drive repairs.
        const validate = async (t) => mergeResults(validateTemplate(t), await benchTemplateRuntime(t));
        const change = await claudeProvider.generate(
          b,
          {
            images: [],
            palette: null,
            resolution: { width: 1920, height: 1080, label: '1080p' },
            fps: 25,
          },
          { validate },
        );
        const v = change.validation ?? validateTemplate(change.template);
        return {
          name: change.template.name,
          summary: change.summary,
          route: change.path ?? null,
          ok: v.ok,
          errors: v.errors.map((e) => `${e.rule}: ${e.message}`),
          template: change.template,
        };
      },
      { brief },
    );

    // Screenshot the settled graphic over a video-like backdrop (same recipe as the sweeps).
    await page.evaluate(async ({ template }) => {
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      document.body.innerHTML = '';
      document.body.style.cssText =
        'margin:0;width:1920px;height:1080px;overflow:hidden;position:relative;' +
        'background: radial-gradient(1200px 700px at 30% 20%, #2a3648 0%, #141b26 45%, #0a0e15 100%);';
      const f = document.createElement('iframe');
      f.id = 'shot';
      f.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
      await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(template); document.body.appendChild(f); });
      f.contentWindow.play();
    }, { template: r.template });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/${id}.png` });

    // Runtime layout check: unintentional text-on-text overlap in the settled frame.
    const overlaps = await page.evaluate(() => {
      const doc = document.getElementById('shot').contentDocument;
      const texts = [...doc.querySelectorAll('body *')].filter((el) => {
        const cs = doc.defaultView.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return false;
        return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      });
      const label = (el) => `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> "${el.textContent.trim().slice(0, 24)}"`;
      const found = [];
      for (let i = 0; i < texts.length; i++) {
        for (let j = i + 1; j < texts.length; j++) {
          const a = texts[i]; const b = texts[j];
          if (a.contains(b) || b.contains(a)) continue;
          // Identical text stacked on itself is deliberate layering (karaoke wipes,
          // glow copies) — only DIFFERENT information colliding is a bug.
          if (a.textContent.trim() === b.textContent.trim()) continue;
          const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
          const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
          const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
          if (ix > 4 && iy > 4) {
            const inter = ix * iy;
            const smaller = Math.min(ra.width * ra.height, rb.width * rb.height);
            // >15% of the smaller element covered = a real collision, not line-height kissing.
            if (smaller > 0 && inter / smaller > 0.15) found.push(`${label(a)} ⇄ ${label(b)}`);
          }
        }
      }
      return found.slice(0, 5);
    });

    results.push({ id, brief, name: r.name, summary: r.summary, route: r.route, ok: r.ok, errors: r.errors, overlaps });
    console.log(
      (r.ok ? `OK  (${r.name})` : `INVALID (${r.errors.length} errors)`) +
        (r.route ? `  [${r.route}]` : '') +
        (overlaps.length ? `  ⚠ ${overlaps.length} text overlap(s)` : ''),
    );

    // Back to the app for the next round.
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
  } catch (e) {
    results.push({ id, brief, name: null, summary: null, ok: false, errors: [String(e.message || e)], overlaps: [] });
    console.log('FAILED: ' + (e.message || e));
  }
}

// The route rides the results file: a wrapper comparing candidates must be able to check
// what the run ACTUALLY used, not what it resolved in a different browser beforehand.
writeFileSync(`${OUT}/results.json`, JSON.stringify({ route, results }, null, 2));

// ── The review gallery ──
const rows = results
  .map(
    (r) => `
  <figure class="${r.ok && !(r.overlaps ?? []).length ? 'ok' : 'bad'}">
    <img src="${r.id}.png" alt="${r.id}" loading="lazy">
    <figcaption>
      <strong>${r.name ?? r.id}</strong> <em>${r.ok ? '✓ valid' : '✗ ' + r.errors.join(' · ')}</em>
      ${(r.overlaps ?? []).length ? `<p class="warn">⚠ overlap: ${r.overlaps.join(' · ')}</p>` : ''}
      <p>${r.summary ?? ''}</p>
      <details><summary>brief</summary><p>${r.brief}</p></details>
    </figcaption>
  </figure>`,
  )
  .join('\n');
writeFileSync(
  `${OUT}/review.html`,
  `<!doctype html><meta charset="utf-8"><title>AI bench review</title>
<style>
  body{background:#10141b;color:#e8ecf2;font:14px/1.5 system-ui;margin:0;padding:32px}
  h1{font-size:20px} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(430px,1fr));gap:16px}
  figure{margin:0;border:1px solid #242c38;border-radius:10px;overflow:hidden;background:#171d26}
  figure.bad{border-color:#7a2e2e} img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}
  figcaption{padding:10px 12px} em{color:#8b95a5;font-style:normal;font-size:12px;margin-left:6px}
  figure.bad em{color:#ff8484} p{margin:6px 0 0;color:#8b95a5;font-size:13px} p.warn{color:#ffb35c} summary{cursor:pointer;color:#8b95a5;font-size:12px;margin-top:6px}
</style>
<h1>AI quality bench — ${results.filter((r) => r.ok).length}/${results.length} valid</h1>
<div class="grid">${rows}</div>`,
);

await browser.close();
console.log(`\nDone: ${results.filter((r) => r.ok).length}/${results.length} valid → ${OUT}/review.html`);
