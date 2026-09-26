// Sweep the FULL HARNESS brief bank across candidate models and build one comparison
// gallery (docs/AI_PLATFORM_PLAN.md §8, "Code/template suite").
//
//   npm run bench:harness -- <out-dir> --candidates=<model,model,...>
//                            [--briefs=<n|id,id>] [--confirm-spend]
//
// SPENDS REAL TOKENS, and far more per brief than the Lite benches: the full harness sends
// the whole-catalog digest on every design call, writes real HTML/CSS through the coder
// path, and may repair twice. Dry run is the default.
//
// WHY THIS SUITE AND NOT LITE. Lite is one category and six chassis
// (LITE_AI_CATEGORIES = ['lower-third']), and its model only picks a chassis and fills
// fields - the deterministic assemblers draw every pixel, so two models that pick the same
// chassis produce IDENTICAL output and no visual review can tell them apart. The brief bank
// here is deliberately off-catalog: the model writes the graphic, so the differences are
// real and worth looking at.
//
// ROUTE IDENTITY. The harness route is CLIENT configuration (VITE_AI_PROVIDER /
// VITE_AI_MODEL), and saved localStorage settings outrank it. Either could silently leave
// every candidate running the default model, which would turn ordinary run-to-run variance
// into a fake model difference - the worst failure this bench could have. So the effective
// route is read back out of the app and must match the candidate before any brief runs.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { BASE, killTree, readEnvFile, settlePort, startServer } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const OUT = path.resolve(args.find((a) => !a.startsWith('--')) || './harness-bench-out');
const CANDIDATES = (flag('candidates') ?? '').split(',').map((c) => c.trim()).filter(Boolean);
const BRIEFS = flag('briefs') ?? '';
const CONFIRMED = args.includes('--confirm-spend');
const MAX_COST_USD = 2.0;

if (!CANDIDATES.length) {
  console.error('Name candidates: --candidates=<model,model,...>');
  process.exit(1);
}

// The whole-catalog digest dominates the input, and the coder path writes a full template;
// a repair round roughly doubles both. These are ESTIMATES - /api/ai/generate keeps no
// ledger (the documented asymmetry in plan §1.3), so unlike the Lite benches this one
// cannot report what it actually spent. Treat the printed figure as a budget, not a bill.
const EST_INPUT_TOKENS = 40_000;
const EST_OUTPUT_TOKENS = 12_000;
const PRICES = JSON.parse(await readFile(path.resolve('scripts/ai-bench-prices.json'), 'utf8')
  .catch(() => '{}'));

const briefCount = Number(BRIEFS) || (BRIEFS ? BRIEFS.split(',').length : 12);
const estimateFor = (model) => {
  const price = PRICES[model];
  if (!price) return null;
  return (EST_INPUT_TOKENS * price.in + EST_OUTPUT_TOKENS * price.out) / 1e6 * briefCount;
};
const estimates = CANDIDATES.map((m) => ({ model: m, usd: estimateFor(m) }));
const known = estimates.filter((e) => e.usd !== null);
const total = known.reduce((sum, e) => sum + e.usd, 0);

console.log(`Plan: ${CANDIDATES.length} candidate(s) x ${briefCount} brief(s) = `
  + `${CANDIDATES.length * briefCount} generation(s), each with repairs.\n`);
for (const e of estimates) {
  console.log(`  ${e.model.padEnd(44)} ${e.usd === null ? 'price unknown' : `~$${e.usd.toFixed(3)}`}`);
}
console.log(`\nEstimated total: ~$${total.toFixed(2)}`
  + `${known.length < estimates.length ? ' (plus the unpriced routes above)' : ''}`
  + `  |  budget ceiling $${MAX_COST_USD}`);
console.log('This is an ESTIMATE: /api/ai/generate writes no ledger, so the run cannot');
console.log('report its own spend. Check the provider dashboard afterwards.');

if (total > MAX_COST_USD) {
  console.error('\nEstimate exceeds the ceiling. Reduce candidates or --briefs.');
  process.exit(1);
}
if (!CONFIRMED) {
  console.log('\nDRY RUN - nothing spent, nothing started. Re-run with --confirm-spend.');
  process.exit(0);
}

/** Read the route the APP resolved, not the one we hoped to inject. */
async function effectiveRoute() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    return await page.evaluate(async () => {
      const { loadAiSettings } = await import('/src/ai/settings.ts');
      const s = loadAiSettings();
      return { provider: s.provider, model: s.model };
    });
  } finally {
    await browser.close();
  }
}

// Test-account credentials for the bench subprocess sign-in - read from .env, never
// loaded into this process beyond passing them on.
const fileEnv = await readEnvFile();

await mkdir(OUT, { recursive: true });
const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').slice(0, 48);
const runs = [];

for (const model of CANDIDATES) {
  const label = slug(model);
  const runDir = path.join(OUT, label);
  console.log(`\n=== ${model}`);
  const server = startServer({
    VITE_AI_PROVIDER: 'vercel',
    VITE_AI_MODEL: model,
  });
  try {
    // Wait for the app itself; the harness path needs no auth, so there is no status
    // endpoint to poll - a served page IS the readiness signal here.
    const deadline = Date.now() + 90_000;
    let up = false;
    while (Date.now() < deadline && !up) {
      try {
        const response = await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
        up = response.ok;
      } catch { /* booting */ }
      if (!up) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!up) throw new Error('dev server never served /app');

    const route = await effectiveRoute();
    if (route.model !== model) {
      // Refuse rather than record: a run under the wrong route would be reported as this
      // candidate's result and quietly poison the comparison.
      throw new Error(`route mismatch - app resolved ${route.provider}:${route.model}, expected ${model}`);
    }
    // The candidate names a MODEL; the provider comes from the app's own saved settings, so the
    // policy is checked on the RESOLVED pair - the only point where this rig knows which
    // provider it is about to bill (scripts/harness-route-policy.mjs; AI_PLATFORM_PLAN §7a).
    // The refusal names the setting rather than a flag, because no flag produced this value.
    requireAllowedRoute(`${route.provider}:${route.model}`, {
      source: "the app's saved AI provider setting",
      reason: flag('frontier-reason'),
    });
    console.log(`  route verified: ${route.provider}:${route.model}`);

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/ai-bench.mjs', runDir, BRIEFS, '--confirm-spend'].filter(Boolean), {
        stdio: 'inherit',
        // The bench signs itself in: a managed key is only available to a signed-in caller
        // once a backend is configured, and it runs in a fresh context with no session.
        env: { ...process.env, E2E_EMAIL: fileEnv.E2E_EMAIL ?? '', E2E_PASSWORD: fileEnv.E2E_PASSWORD ?? '' },
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`bench exited ${code}`))));
      child.on('error', reject);
    });

    const parsed = JSON.parse(await readFile(path.join(runDir, 'results.json'), 'utf8'));
    const results = parsed.results ?? parsed;
    // The check that counts: the route the RUN recorded, not the one resolved in a
    // separate browser beforehand. The bench pins its own settings, and saved settings
    // outrank env - so a mismatch here means the results belong to another model.
    if (parsed.route && parsed.route.model !== model) {
      throw new Error(`run recorded route ${parsed.route.provider}:${parsed.route.model}, expected ${model}`);
    }
    runs.push({
      model,
      label,
      valid: results.filter((r) => r.ok).length,
      clean: results.filter((r) => r.ok && !(r.overlaps ?? []).length).length,
      total: results.length,
      results,
    });
  } catch (error) {
    console.error(`  FAILED: ${error.message}`);
    runs.push({ model, label, error: String(error.message ?? error) });
  } finally {
    killTree(server);
    await settlePort();
  }
}

await writeFile(path.join(OUT, 'harness-compare.json'),
  JSON.stringify({ at: new Date().toISOString(), candidates: CANDIDATES, runs }, null, 2), 'utf8');

console.log('\n\nHarness comparison\n');
console.log('  model                                        valid   clean   briefs');
for (const r of runs) {
  if (r.error) { console.log(`  ${r.model.padEnd(44)} FAILED (${r.error})`); continue; }
  console.log(`  ${r.model.padEnd(44)} ${String(r.valid).padStart(5)}   ${String(r.clean).padStart(5)}   ${r.total}`);
}

// One page, every candidate side by side per brief - the comparison a per-run gallery
// cannot show, since taste questions are answered by looking at the same brief twice.
const briefIds = [...new Set(runs.flatMap((r) => (r.results ?? []).map((x) => x.id)))];
const sections = briefIds.map((id) => {
  const cells = runs.filter((r) => r.results).map((r) => {
    const row = r.results.find((x) => x.id === id);
    if (!row) return '';
    const bad = !row.ok || (row.overlaps ?? []).length;
    return `<figure class="${bad ? 'bad' : 'ok'}">
      <img src="${r.label}/${id}.png" alt="${id}" loading="lazy">
      <figcaption><strong>${r.model}</strong>
      <em>${row.ok ? '&#10003; valid' : '&#10007; ' + row.errors.join(' &middot; ')}</em>
      ${(row.overlaps ?? []).length ? `<p class="warn">&#9888; overlap</p>` : ''}</figcaption></figure>`;
  }).join('');
  return `<section><h2>${id}</h2><div class="grid">${cells}</div></section>`;
}).join('\n');

await writeFile(path.join(OUT, 'compare.html'),
  `<!doctype html><meta charset="utf-8"><title>Harness model comparison</title>
<style>
 body{background:#10141b;color:#e8ecf2;font:14px/1.5 system-ui;margin:0;padding:32px}
 h1{font-size:20px} h2{font-size:15px;color:#8b95a5;margin:28px 0 10px;font-weight:600}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px}
 figure{margin:0;border:1px solid #242c38;border-radius:10px;overflow:hidden;background:#171d26}
 figure.bad{border-color:#7a2e2e} img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover}
 figcaption{padding:9px 11px;font-size:12px} em{color:#8b95a5;font-style:normal;margin-left:6px}
 figure.bad em{color:#ff8484} p.warn{color:#ffb35c;margin:4px 0 0}
</style>
<h1>Harness model comparison &mdash; same brief, every candidate</h1>${sections}`, 'utf8');

console.log(`\nSide-by-side gallery: ${path.join(OUT, 'compare.html')}`);
console.log('Same brief across candidates on one row - that is the comparison a per-run');
console.log('gallery cannot show, and the one a taste question actually needs.');
