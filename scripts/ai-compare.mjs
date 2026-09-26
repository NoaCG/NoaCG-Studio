// The harness value proof — same brief, same model, four arms side by side.
//
//   node scripts/ai-compare.mjs --provider=<id> --model=<model id> [out-dir] [count | id,id,…]
//
// The product's central claim is that the NoaCG harness beats "just asking Claude/Codex to
// make the same graphic" — and each harness stage must EARN its cost. Arms:
//
//   A  RAW          one shot, a generic "make a broadcast graphic" system prompt. No taste
//                   teaching, no example, no layout-safety rules, no validation repair. This
//                   is roughly what a person gets from a bare prompt.
//   B  RAW+ITERATE  arm A, then N generic self-critique rounds ("review your own work as a
//                   broadcast designer, fix overlaps/contrast/hierarchy, re-emit"). This is a
//                   competent person iterating with vanilla Claude — THE REAL BAR.
//   D  PRE-HARNESS  the previous product: the full house-contract system prompt + worked
//                   example + the validated repair loop, but NO design-spec stage — every
//                   brief goes to the free-form coder. The stage-ablation arm.
//   C  HARNESS      claudeProvider.generate as shipped: design-spec router → grounded catalog
//                   assembly (+ deterministic design adjustments, optional bounded polish) or
//                   the validated custom path — with the runtime bench injected, exactly as
//                   the app runs it.
//
// Per arm the scorecard tracks: static validity, the NEUTRAL runtime bench (lifecycle,
// binding, overlap/overflow, doubled-text stress — house-editability checks OFF so the bar
// is arm-agnostic), the motion-sampled overlap count, EDITABILITY (house-shaped: prefix +
// readable NOACG_ANIM + :root vars — a product criterion, clearly biased toward D/C),
// model calls, repair rounds, tokens, and wall time. C additionally reports its ROUTE
// (grounded / grounded+polish / custom) and variant diversity.
//
// HONEST HANDICAP: arms A and B are TOLD the SPX format basics (definition, fN↔id, runtime
// functions, relative refs, gsap global) so their output renders and can pass the validator on
// format grounds — any C/D win is a TASTE / LAYOUT / RELIABILITY win, not format knowledge.
// The neutral cross-arm scores are the runtime bench, the overlap count, and the screenshots.
//
// Requirements: the dev server (this checkout's port - scripts/dev-port.mjs) started with
// the server-only key for the chosen --provider. Keys never enter this browser process or
// its storage.
// SPENDS REAL TOKENS - roughly
// count × (1 raw + ROUNDS_B + pre-harness 1-3 + harness 1-4) calls. Third arg limits to the
// first N briefs or a comma-separated id list.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { devPort } from './dev-port.mjs';
import * as rules from './rules.mjs';

// A paid run never belongs in CI: it needs a dev server and real credentials, and it spends money.
if (process.env.CI) {
  console.error(`[ai-compare] refused in CI. ${rules.text('ai/keep-paid-runs-out-they-require')}`);
  process.exit(1);
}

const BASE = `http://localhost:${devPort()}`;
const ARGS = process.argv.slice(2);
const flag = (name) => ARGS.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const POS = ARGS.filter((a) => !a.startsWith('--'));
const OUT = POS[0] || './compare-out';
const FILTER = POS[1] ?? '';
// A paid run names its route EXPLICITLY - no silent default onto an expensive proprietary
// model. Same-model-all-arms stays the rig's rule; only WHICH model is the runner's call.
const PROVIDER = flag('provider') ?? '';
const MODEL = flag('model') ?? '';
if (!PROVIDER || !MODEL) {
  console.error('ai-compare SPENDS TOKENS and requires an explicit route: --provider=<provider id> --model=<model id>.');
  process.exit(1);
}
const ROUNDS_B = 2; // arm B: 1 generation + this many self-critique improvement rounds
mkdirSync(OUT, { recursive: true });

// Two groups. CATALOG-SHAPED briefs with a deliberate genre spread (the harness should
// route these grounded, and their density/weight/motion answers should DIFFER — repeated
// variants/compositions across them is the named "sameness" failure). STRUCTURE briefs are
// genuinely off-catalog shapes (a labeled comparison grid, a connector-linked sequence, a
// line/area chart, a knockout tree, mirrored diverging bars): the catalog carries none of
// them, so the harness should route them custom, measuring the validated free-form path (and
// its deterministic region conversion) against the baselines. REFRESHED 2026-07-17 — the
// previous structure briefs (growing bars, data rows, dual-slides) were silently ABSORBED
// once the catalog gained ig07/the versus category, so they had stopped exercising the custom
// route at all; keep this group ahead of the catalog or it stops testing what it claims to.
const BRIEFS = [
  // Catalog-shaped, genre spread:
  ['news-lt', 'A serious evening-news lower third for a national broadcaster: presenter name and role. Restrained, credible, quick unobtrusive entrance.'],
  ['esports-rank', 'An energetic esports ranking strap for a tournament: player nickname and team. Aggressive, fast, high contrast, sharp angles.'],
  ['kids-timer', "A countdown timer for a children's game show: playful, big, friendly, bouncy motion."],
  ['finance-ticker', 'A financial index ticker for a business channel: continuously scrolling index names with values from one textarea. Quiet, precise, endless linear travel.'],
  ['glam-card', 'An entertainment show info card announcing a special guest: name and one teaser line. Glamorous but tasteful, airy spacing, elegant thin typography.'],
  ['brutal-lt', 'A brutalist lower third: massive black heading, tight tracking, sharp corners, no panel decoration at all. Name and title.'],
  // Structure briefs (off-catalog — see the note above; keep these ahead of the catalog):
  ['spec-compare', 'A product comparison card for a tech review segment: two products side by side as columns, four spec rows (Price, Battery, Weight, Screen) with each product\'s value in its own cell, under a header row naming the two products. Fields: the two product names and a textarea "Spec | Product A | Product B", one row per line. Clean, precise, neutral. Mid-center.'],
  ['process-flow', 'A four-step "how it works" explainer across the lower third: four numbered nodes in a horizontal row joined by thin arrows, each node a short title over a one-line description. Steps reveal left to right, arrows drawing between them. One textarea field, one "Title | description" per line. Friendly, modern, confident. Bottom-center band.'],
  ['trend-line', 'A single-metric trend graphic for a business channel: a rising line with a soft area fill that draws across a small plotted grid on play, a big current value and metric label to the left, and a small change chip. Fields: metric label, current value, change, and a textarea of plotted points (one number per line). Calm, precise, data-desk. Mid-right.'],
  ['bracket', 'A knockout bracket for a tournament: four teams in two semi-final pairings on the left feeding a single final on the right, thin connector lines joining each round. Fields: four team names and the two finalists advancing. Pairings fade in, then connectors draw and the finalists slide into the final. Sporty, high-contrast, dark. Full-frame.'],
  ['head-to-head', 'A player head-to-head stat panel: two athletes named at the top, then four stat rows, each stat labelled in the centre with a bar growing outward left for player one and right for player two (mirrored/diverging). Fields: two player names and a textarea "Stat | left | right". Bold sports-analysis look. Mid-center.'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 0.5 });
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
const configured = await page.evaluate(async ({ provider, model }) => {
  const { refreshAiConfiguration, saveAiSettings, aiConfigured } = await import('/src/ai/settings.ts');
  await refreshAiConfiguration();
  saveAiSettings({ provider, model, fallbacks: [] });
  return aiConfigured();
}, { provider: PROVIDER, model: MODEL });
if (!configured) {
  console.error(`No server-managed ${PROVIDER} route is available. Start the dev server with the matching server-only key.`);
  await browser.close();
  process.exit(1);
}
console.log(`Route: ${PROVIDER}:${MODEL} (all four arms).`);
await page.waitForTimeout(800);

const selected = /^[a-z-]+(,[a-z-]+)*$/.test(FILTER)
  ? BRIEFS.filter(([id]) => FILTER.split(',').includes(id))
  : BRIEFS.slice(0, Number(FILTER) || Infinity);

// ── Generate all four arms for one brief (browser context) ───────────────────
// Returns { A, B, D, C } each { name, summary, html/css/js, ok, benchOk, editable,
// errors, benchErrors, ms, calls, repairs, tokensIn, tokensOut, route?, variantId? }.
async function generateArms(brief, roundsB) {
  return page.evaluate(
    async ({ brief: b, roundsB: rounds }) => {
      const { callClaudeDetailed } = await import('/src/ai/anthropic.ts');
      const { claudeProvider, plainGenerate } = await import('/src/ai/claudeProvider.ts');
      const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
      const { benchTemplateRuntime, mergeResults } = await import('/src/validation/runtimeBench.ts');
      const { clearAiRuns, aiRunRecords } = await import('/src/ai/telemetry.ts');
      const { detectPrefix } = await import('/src/model/structure.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { parseDefinition } = await import('/src/model/spxDefinition.ts');
      const { RESOLUTIONS, DEFAULT_SETTINGS } = await import('/src/model/types.ts');

      const RES = RESOLUTIONS[0];
      const CTX = { images: [], palette: null, resolution: RES, fps: 25 };
      // The app's injected validation pipeline — arms D and C run exactly as shipped.
      const validate = async (t) => mergeResults(validateTemplate(t), await benchTemplateRuntime(t));

      // The emit tool — same three-file structured output the pipeline uses, so rendering is
      // identical across arms. Defined here (not imported) to keep the arms self-contained.
      const EMIT = {
        name: 'emit_template',
        description: 'Return the complete SPX template as its three code files.',
        input_schema: {
          type: 'object',
          required: ['name', 'type', 'summary', 'html', 'css', 'js'],
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            summary: { type: 'string' },
            html: { type: 'string' },
            css: { type: 'string' },
            js: { type: 'string' },
          },
        },
      };

      // The baseline system prompt: FORMAT ONLY. No taste, no example, no layout-safety rules,
      // no motion doctrine — the honest "generic competent user who knows the file format".
      const BASE_SYSTEM =
        'You make broadcast graphics as SPX / CasparCG HTML templates. Return the complete ' +
        'template as three files via the emit_template tool.\n\n' +
        'Format basics (so it runs in playout):\n' +
        '- index.html defines window.SPXGCTemplateDefinition with DataFields named f0, f1, …; ' +
        'each field maps to one element with the same id. Field types: textfield, textarea, ' +
        'number, filelist (for images).\n' +
        '- template.js (loaded in <head>) defines global update(data /* a JSON string */), ' +
        'play(), stop(), next().\n' +
        '- External references are relative: css/template.css, js/template.js, js/gsap.min.js. ' +
        'GSAP is available as the global "gsap" (the only library). No CDN or absolute paths.\n' +
        '- Each tool field is the PURE contents of that one file: "html" is the full document ' +
        '(doctype…</html>, and the SPXGCTemplateDefinition <script> lives here); "css" is CSS ' +
        'only; "js" is JavaScript only — no <script> tags, no HTML.\n\n' +
        'Return ONLY via the emit_template tool.';

      const briefText =
        `Create a broadcast graphics template.\n\nUser brief: ${b}\n\n` +
        `Canvas: ${RES.width}×${RES.height} @ 25 fps.`;

      function toTemplate(emitted) {
        const parsed = parseDefinition(emitted.html);
        return {
          name: emitted.name || 'AI template',
          type: emitted.type || 'blank',
          resolution: RES,
          fps: 25,
          html: emitted.html,
          css: emitted.css,
          js: emitted.js,
          fields: (parsed && parsed.fields) || [],
          settings: (parsed && parsed.settings) || { ...DEFAULT_SETTINGS, description: emitted.name },
          assets: [],
          layers: [],
        };
      }

      // Shared deterministic scoring — the SAME bar for every arm. The runtime bench runs
      // NEUTRAL (houseContract off): lifecycle/binding/overlap/stress are arm-agnostic.
      // Editability (house-shaped output every panel can edit) is reported separately —
      // a product criterion, openly biased toward the arms that know the house contracts.
      async function scored(t, summary, metrics, extra) {
        const v = validateTemplate(t);
        const bench = await benchTemplateRuntime(t, { houseContract: false });
        const editable = Boolean(
          detectPrefix(t.html) && parseAnimData(t.js) && t.css.includes('--accent:') && t.css.includes('--scale:'),
        );
        return {
          name: t.name,
          summary,
          html: t.html,
          css: t.css,
          js: t.js,
          ok: v.ok,
          errors: v.errors.map((e) => `${e.rule}: ${e.message}`),
          benchOk: bench.ok,
          benchErrors: bench.errors.map((e) => `${e.rule}: ${e.message}`).slice(0, 4),
          editable,
          ...metrics,
          ...(extra ?? {}),
        };
      }

      // Telemetry → per-run metrics (arms D and C record their runs).
      function metricsFrom(rec, ms) {
        const stages = rec?.stages ?? [];
        return {
          ms,
          calls: stages.filter((s) => s.model).length,
          repairs: rec?.repairRounds ?? 0,
          tokensIn: stages.reduce((a, s) => a + (s.usage?.inputTokens ?? 0), 0),
          tokensOut: stages.reduce((a, s) => a + (s.usage?.outputTokens ?? 0), 0),
        };
      }

      // Arm A — one raw shot, no repair.
      let t0 = Date.now();
      const rawA = await callClaudeDetailed({
        system: BASE_SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: briefText }] }],
        tool: EMIT,
      });
      const emitA = rawA.output;
      const aMs = Date.now() - t0;
      const A = await scored(toTemplate(emitA), emitA.summary, {
        ms: aMs,
        calls: 1,
        repairs: 0,
        tokensIn: rawA.usage.inputTokens,
        tokensOut: rawA.usage.outputTokens,
      });

      // Arm B — start from A's generation, then N generic self-critique rounds.
      // Its metrics include A's call: that's the true cost of "iterate from a raw shot".
      t0 = Date.now();
      let curB = emitA;
      let bIn = rawA.usage.inputTokens;
      let bOut = rawA.usage.outputTokens;
      for (let i = 0; i < rounds; i++) {
        const raw = await callClaudeDetailed({
          system: BASE_SYSTEM,
          messages: [
            { role: 'user', content: [{ type: 'text', text: briefText }] },
            { role: 'assistant', content: 'Here is my template.' },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    'You are a senior broadcast graphics designer reviewing your OWN work above. ' +
                    'Find and fix every problem that would embarrass you on air: text overlapping ' +
                    'other text, weak contrast or unreadable colours, clumsy or missing hierarchy, ' +
                    'text that clips or escapes its box, motion that bounces when it should be crisp, ' +
                    'and anything that looks generic or AI-generated. Then re-emit the COMPLETE, ' +
                    'improved template.\n\n' +
                    `=== index.html ===\n${curB.html}\n=== template.css ===\n${curB.css}\n=== template.js ===\n${curB.js}`,
                },
              ],
            },
          ],
          tool: EMIT,
        });
        curB = raw.output;
        bIn += raw.usage.inputTokens;
        bOut += raw.usage.outputTokens;
      }
      const B = await scored(toTemplate(curB), curB.summary, {
        ms: aMs + (Date.now() - t0),
        calls: 1 + rounds,
        repairs: 0,
        tokensIn: bIn,
        tokensOut: bOut,
      });

      // Arm D — the pre-harness product: house prompt + example + the validated repair
      // loop, but NO design-spec stage (every brief goes to the free-form coder).
      clearAiRuns();
      t0 = Date.now();
      const changeD = await plainGenerate(b, CTX, { validate });
      const D = await scored(changeD.template, changeD.summary, metricsFrom(aiRunRecords().at(-1), Date.now() - t0));

      // Arm C — the harness as shipped (design-spec router, grounded assembly or validated
      // custom, bench-injected), exactly the app's configuration.
      clearAiRuns();
      t0 = Date.now();
      const changeC = await claudeProvider.generate(b, CTX, { validate });
      const recC = aiRunRecords().at(-1);
      const C = await scored(changeC.template, changeC.summary, metricsFrom(recC, Date.now() - t0), {
        route: changeC.path ?? null,
        variantId: recC?.diversity?.variantId ?? null,
      });

      return { A, B, D, C };
    },
    { brief, roundsB },
  );
}

// Neutral text-overlap detector, run inside the iframe. Two kinds of collision:
//   - DIFFERENT text overlapping (>15% of the smaller box) — always a bug.
//   - SAME text overlapping but NOT near-coincident — a MISALIGNED layered wipe/glow.
// A perfectly-coincident duplicate (a real karaoke wipe over its base, a glow copy) is
// intentional and allowed; an offset one is the exact bug the old whitelist hid.
const OVERLAP_FN = () => {
  const host = document.getElementById('shot');
  if (!host || !host.contentDocument) return [];
  const doc = host.contentDocument;
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
      const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix <= 4 || iy <= 4) continue;
      const inter = ix * iy;
      const areaA = ra.width * ra.height, areaB = rb.width * rb.height;
      const smaller = Math.min(areaA, areaB);
      if (smaller <= 0) continue;
      if (a.textContent.trim() === b.textContent.trim()) {
        // Intentional layer ONLY when the two copies are near-coincident (IoU high AND
        // centres within a few px). Offset identical text = a misaligned wipe = a bug.
        const union = areaA + areaB - inter;
        const iou = union > 0 ? inter / union : 0;
        const dx = Math.abs((ra.left + ra.right) / 2 - (rb.left + rb.right) / 2);
        const dy = Math.abs((ra.top + ra.bottom) / 2 - (rb.top + rb.bottom) / 2);
        if (!(iou > 0.8 && dx < 6 && dy < 6)) found.push(`${label(a)} ⇄ ${label(b)} (misaligned)`);
      } else if (inter / smaller > 0.15) {
        found.push(`${label(a)} ⇄ ${label(b)}`);
      }
    }
  }
  return found;
};

// ── Render one arm's template and capture screenshot + neutral overlap check ──
async function shoot(arm, id, tpl) {
  await page.evaluate(async ({ template }) => {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    document.body.innerHTML = '';
    document.body.style.cssText =
      'margin:0;width:1920px;height:1080px;overflow:hidden;position:relative;' +
      'background: radial-gradient(1200px 700px at 30% 20%, #2a3648 0%, #141b26 45%, #0a0e15 100%);';
    const f = document.createElement('iframe');
    f.id = 'shot';
    f.style.cssText = 'position:absolute;inset:0;width:1920px;height:1080px;border:0;background:transparent';
    await new Promise((res) => {
      f.onload = res;
      f.srcdoc = composeDocument(template);
      document.body.appendChild(f);
    });
    try {
      f.contentWindow.play();
    } catch {
      // A broken arm may throw on play() — the screenshot still shows what it produced.
    }
  }, { template: { ...tpl, resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25, fields: [], settings: {}, assets: [], layers: [] } });
  // Sample DURING motion (mid-animation) and again once settled — a transient collision
  // while bars grow / rows cascade / a lyric wipes is just as real as one in the final frame.
  await page.waitForTimeout(1000);
  const mid = await page.evaluate(OVERLAP_FN);
  await page.waitForTimeout(1600); // ~2.6s total after play()
  await page.screenshot({ path: `${OUT}/${id}-${arm}.png` });
  const late = await page.evaluate(OVERLAP_FN);
  return [...new Set([...mid, ...late])].slice(0, 5);
}

// ── Run ──────────────────────────────────────────────────────────────────────
const ARMS = [
  ['A', 'Raw (one shot)'],
  ['B', `Raw + iterate (${ROUNDS_B} rounds)`],
  ['D', 'Pre-harness (house prompt + checks)'],
  ['C', 'The harness'],
];
const results = [];
for (const [id, brief] of selected) {
  process.stdout.write(`▸ ${id} … generating A/B/D/C `);
  let arms;
  try {
    arms = await generateArms(brief, ROUNDS_B);
  } catch (e) {
    console.log('FAILED: ' + (e.message || e));
    results.push({ id, brief, arms: null, error: String(e.message || e) });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    continue;
  }

  const row = { id, brief, arms: {} };
  for (const [key] of ARMS) {
    const tpl = arms[key];
    // Dump the raw three files so the design can be judged from the code, not just the shot.
    writeFileSync(
      `${OUT}/${id}-${key}.code.txt`,
      `=== index.html ===\n${tpl.html}\n\n=== template.css ===\n${tpl.css}\n\n=== template.js ===\n${tpl.js}\n`,
    );
    let overlaps;
    try {
      overlaps = await shoot(key, id, tpl);
    } catch (e) {
      overlaps = [`render error: ${e.message || e}`];
    }
    row.arms[key] = {
      name: tpl.name,
      summary: tpl.summary,
      ok: tpl.ok,
      errors: tpl.errors,
      benchOk: tpl.benchOk,
      benchErrors: tpl.benchErrors,
      editable: tpl.editable,
      ms: tpl.ms,
      calls: tpl.calls,
      repairs: tpl.repairs,
      tokensIn: tpl.tokensIn,
      tokensOut: tpl.tokensOut,
      route: tpl.route ?? null,
      variantId: tpl.variantId ?? null,
      overlaps,
    };
    process.stdout.write(`${key}${tpl.ok && tpl.benchOk ? '✓' : '✗'}${overlaps.length ? '⚠' + overlaps.length : ''} `);
  }
  results.push(row);
  console.log('');
  // Persist incrementally — a long run that dies mid-way keeps every finished brief.
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));

// ── Scoreboard ──
const done = results.filter((r) => r.arms);
const tally = (key) => {
  let valid = 0, benchOk = 0, clean = 0, editable = 0, overlaps = 0, ms = 0, calls = 0, repairs = 0, tokIn = 0, tokOut = 0;
  const variants = {};
  for (const r of done) {
    const a = r.arms[key];
    if (a.ok) valid++;
    if (a.benchOk) benchOk++;
    if (a.ok && a.benchOk && !a.overlaps.length) clean++;
    if (a.editable) editable++;
    overlaps += a.overlaps.length;
    ms += a.ms ?? 0;
    calls += a.calls ?? 0;
    repairs += a.repairs ?? 0;
    tokIn += a.tokensIn ?? 0;
    tokOut += a.tokensOut ?? 0;
    if (a.variantId) variants[a.variantId] = (variants[a.variantId] ?? 0) + 1;
  }
  const n = done.length || 1;
  return {
    valid, benchOk, clean, editable, overlaps, total: done.length,
    avgSec: ms / n / 1000, avgCalls: calls / n, avgRepairs: repairs / n,
    avgTokIn: Math.round(tokIn / n), avgTokOut: Math.round(tokOut / n),
    // Diversity tripwire: the most-repeated chassis across the suite (sameness watch).
    topVariant: Object.entries(variants).sort((x, y) => y[1] - x[1])[0] ?? null,
  };
};
const board = Object.fromEntries(ARMS.map(([k]) => [k, tally(k)]));

// ── Gallery: four columns per brief, scoreboard on top ──
const armHead = ARMS.map(
  ([k, label]) =>
    `<th>${label}<br><span class="sb">${board[k].clean}/${board[k].total} clean · ${board[k].valid} valid · ${board[k].benchOk} bench · ${board[k].editable} editable · ${board[k].overlaps} overlaps<br>` +
    `avg ${board[k].avgCalls.toFixed(1)} calls · ${board[k].avgRepairs.toFixed(1)} repairs · ${board[k].avgTokIn}/${board[k].avgTokOut} tok · ${board[k].avgSec.toFixed(1)}s` +
    `${board[k].topVariant ? ` · top chassis ${board[k].topVariant[0]}×${board[k].topVariant[1]}` : ''}</span></th>`,
).join('');

const rows = done
  .map((r) => {
    const cells = ARMS.map(([k]) => {
      const a = r.arms[k];
      const cls = a.ok && a.benchOk && !a.overlaps.length ? 'ok' : 'bad';
      return `<td class="${cls}">
        <img src="${r.id}-${k}.png" alt="${r.id} ${k}" loading="lazy">
        <div class="meta"><strong>${a.name ?? ''}</strong>
          <em>${a.ok ? '✓ valid' : '✗ ' + (a.errors[0] ?? 'invalid')}</em>
          <em>${a.benchOk ? '✓ bench' : '✗ ' + (a.benchErrors?.[0] ?? 'bench failed')}</em>
          ${a.editable ? '<em>⧉ editable</em>' : ''}
          ${a.route ? `<em>route ${a.route}${a.variantId ? ' · ' + a.variantId : ''}</em>` : ''}
          <p class="mono">${a.calls} call${a.calls === 1 ? '' : 's'} · ${a.repairs} repair${a.repairs === 1 ? '' : 's'} · ${a.tokensIn}/${a.tokensOut} tok · ${((a.ms ?? 0) / 1000).toFixed(1)}s</p>
          ${a.overlaps.length ? `<p class="warn">⚠ ${a.overlaps.length} overlap: ${a.overlaps.join(' · ')}</p>` : ''}
          <p>${a.summary ?? ''}</p>
          <p><a href="${r.id}-${k}.code.txt">view code</a></p>
        </div></td>`;
    }).join('');
    return `<tr><th class="brief">${r.id}<p>${r.brief}</p></th>${cells}</tr>`;
  })
  .join('\n');

writeFileSync(
  `${OUT}/review.html`,
  `<!doctype html><meta charset="utf-8"><title>Harness comparison</title>
<style>
  body{background:#0b0f17;color:#e8ecf2;font:14px/1.5 system-ui;margin:0;padding:28px}
  h1{font-size:20px;margin:0 0 4px} .lead{color:#8b95a5;max-width:980px;margin:0 0 20px}
  .lead b{color:#f0b429}
  table{border-collapse:collapse;width:100%} th,td{vertical-align:top;padding:8px;border:1px solid #1c2532}
  thead th{background:#141b26;position:sticky;top:0} .sb{font-weight:400;color:#8b95a5;font-size:11px}
  th.brief{width:170px;text-align:left;font-weight:600} th.brief p{font-weight:400;color:#8b95a5;font-size:12px;margin:6px 0 0}
  td{width:21%} td.bad{background:#1a1113} td img{width:100%;display:block;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:#000}
  .meta{padding:8px 2px 0} em{color:#7fd18a;font-style:normal;font-size:12px;margin-left:6px} td.bad em{color:#ff8484}
  .meta p{margin:5px 0 0;color:#8b95a5;font-size:12px} p.warn{color:#ffb35c} p.mono{font-family:ui-monospace,monospace;font-size:11px} a{color:#5aa9e6}
</style>
<h1>Harness comparison — does the NoaCG harness beat asking the model directly?</h1>
<p class="lead">Same brief, same model, four arms. <b>A</b> is one raw shot; <b>B</b> is a
competent iterator (${ROUNDS_B} generic self-critique rounds) — the real bar; <b>D</b> is the
pre-harness product (house prompt + validated repair, no design-spec stage) — the stage
ablation; <b>C</b> is the harness as shipped (design-spec router → grounded assembly or
validated custom, runtime bench injected). The neutral cross-arm scores are the <b>runtime
bench</b>, the <b>text-overlap count</b>, and the screenshots — <b>valid</b> and
<b>editable</b> are openly biased toward D/C, which know the house contracts. Judge
quality-per-token, diversity (watch the top-chassis counter), and brief adherence together.
If C doesn't clearly beat B here, the harness has not earned its place.</p>
<table><thead><tr><th>brief</th>${armHead}</tr></thead><tbody>${rows}</tbody></table>`,
);

await browser.close();
console.log('\nScoreboard (out of ' + done.length + '):');
for (const [k, label] of ARMS) {
  const b = board[k];
  console.log(
    `  ${k} ${label.padEnd(36)} clean ${b.clean}/${b.total} · valid ${b.valid} · bench ${b.benchOk} · editable ${b.editable} · overlaps ${b.overlaps} · ` +
      `avg ${b.avgCalls.toFixed(1)} calls / ${b.avgRepairs.toFixed(1)} repairs / ${b.avgTokIn}+${b.avgTokOut} tok / ${b.avgSec.toFixed(1)}s`,
  );
}
console.log(`\nDone → ${OUT}/review.html`);
