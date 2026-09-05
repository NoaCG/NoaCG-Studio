#!/usr/bin/env node
// THE PRO HARNESS BENCH - the harness loop (src/ai/pro/harness/) driving the platform's own
// functions through a real browser (docs/PRO_HARNESS_PLAN.md §9).
//
//   node scripts/pro-harness-spike.mjs --control                  # FREE. Run FIRST. Proves the
//                                                                 # workbench: scaffold, patch,
//                                                                 # render, bench, instruments,
//                                                                 # findings - on a known-good
//                                                                 # spine and a forced defect, then
//                                                                 # the whole loop on a scripted
//                                                                 # model. No model call.
//   node scripts/pro-harness-spike.mjs --generate --route=vercel:<model> --max-cost=2 \
//       --out=pro-harness-out-<model> [--vision] [--strong=vercel:<model>] [--critic=vercel:<model>] \
//       [--max-rounds=4] [--resume] [brief-id,brief-id]      # PAID. Needs the owner's OK + a cap.
//
// WHAT THE WORKBENCH IS. The `Workbench` interface the harness's tools call, implemented over
// Playwright and the dev server: the type registry and the neutral scaffold (the same functions
// the /bridge page composes for the noacg CLI), the pure patch guard, `convertEmittedRegion`,
// `productionSpxValidator` (the static gate + the runtime bench + the safety screen), the spike
// instruments (spacing, proportion, axis, readability, ticker margins), and real screenshots of
// the hold and the long-string frame. Findings come back in the harness's one shape.
//
// THE MEASURE CORE IS THE ITERATE SPIKE'S (scripts/pro-iterate-spike.mjs) - the same mount, the
// same settle, the same instruments, the same blocking/advisory routing the owner's blind reads
// calibrated (docs/NOACG_PRO_PLAN.md §22.1, §23.1). It is a copy, stated as one: the two runners
// answer different questions (one-shot-then-iterate vs the tool loop) and the shared-rig item
// (docs/backlog/taste-review-shared-rig.md) is where the copies get folded into one.
//
// The bank is the CUSTOM type sweep's (benchmarks/pro/v1/custom/briefs.json): seven types, three
// briefs each, the same 21 the §22 and §23 rounds were read on - so a harness round can be held
// against the iterate loop's 21/21 and its $0.118 a graphic.
//
// Browser work: `npm run queue -- "node scripts/pro-harness-spike.mjs --control"`. The dev server
// for THIS checkout must be running (`npm run dev:worktree`).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { devPort } from './dev-port.mjs';
import { readEnvFile } from './ai-bench-server.mjs';
import { requireAllowedRoute } from './harness-route-policy.mjs';

const BASE = `http://localhost:${devPort()}`;
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const only = args.find((a) => !a.startsWith('--'))?.split(',').filter(Boolean) ?? null;

const control = flag('control');
const paid = flag('generate');
const resume = flag('resume');
const vision = flag('vision');
const MAX_ROUNDS = Number(value('max-rounds') ?? 4);
const OUT = path.resolve(value('out') ?? 'pro-harness-out');
const BANK = path.resolve(value('bank') ?? 'benchmarks/pro/v1/custom/briefs.json');

if (!control && !paid) {
  console.error('Pick a mode: --control (free, run this first) or --generate (PAID).');
  process.exit(1);
}

let route = null;
let strongRoute = null;
let criticRoute = null;
const maxCost = Number(value('max-cost') ?? 0);
if (paid) {
  route = requireAllowedRoute(value('route'), { flag: 'route', reason: value('frontier-reason') });
  if (value('strong')) strongRoute = requireAllowedRoute(value('strong'), { flag: 'strong', reason: value('frontier-reason') });
  if (value('critic')) criticRoute = requireAllowedRoute(value('critic'), { flag: 'critic', reason: value('frontier-reason') });
  if (!Number.isFinite(maxCost) || maxCost <= 0) {
    console.error('--max-cost must be a positive number of dollars. This run spends real money.');
    process.exit(1);
  }
  console.log(`PAID harness run: ${route.model}${strongRoute ? ` (strong: ${strongRoute.model})` : ''}${vision ? ', vision on' : ''}, max ${MAX_ROUNDS} round(s), ceiling $${maxCost.toFixed(2)}. This spends real tokens.`);
}

try {
  await fetch(`${BASE}/app`, { signal: AbortSignal.timeout(4000) });
} catch {
  console.error(`Dev server not reachable at ${BASE} - start it first (npm run dev:worktree).`);
  process.exit(1);
}

// ── The harness, compiled the way its own test compiles it ────────────────────────────────
const runtime = await buildApiRuntime(['src/ai/pro/harness/agent.ts', 'src/ai/pro/harness/patch.ts']);
function emitted(tail) {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const hit = walk(runtime.outputDir).find((p) => p.replaceAll('\\', '/').endsWith(tail));
  if (!hit) throw new Error(`emitted module not found: ${tail}`);
  return import(pathToFileURL(hit).href);
}
const harness = await emitted('harness/agent.js');
const patchModule = await emitted('harness/patch.js');
const findingsModule = await emitted('harness/findings.js');

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.log('  pageerror:', error.message));
await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
await page.locator('.topbar').waitFor();
await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
await page.keyboard.press('Escape');
await page.locator('.wz-modal').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);

async function shutdown(code) {
  await browser.close().catch(() => undefined);
  await runtime.cleanup().catch(() => undefined);
  process.exit(code);
}

// ── The Playwright workbench ──────────────────────────────────────────────────────────────

/** Which registered type each bank entry's `type` names; stat-panel has no type and goes
 *  typeless with the brief's own fields. */
const TYPE_OF = { 'lower-third': 'lower-third', scoreboard: 'scoreboard', 'quiz-board': 'quiz-board', ticker: 'ticker', countdown: 'countdown', 'podium-score': 'podium-score' };
/** The types whose instrument thresholds are calibrated (PRO_GRAPHICS); everything else takes
 *  the lower third's numbers as ADVISORY. */
const CALIBRATED = { 'lower-third': 'lower-third', countdown: 'countdown' };
const COLLISION_CODES = new Set(['text-over-rule', 'lines-crowded']);
/** Readability codes that describe the STYLESHEET (the same on every frame) rather than one
 *  rendered state; the safe-area readings stay per frame because a long string can leave it. */
const STYLESHEET_READINGS = new Set(['text-under-size-floor', 'text-size-warning-band', 'text-under-weight-floor', 'text-low-contrast', 'hairline-functional-stroke', 'text-decorative-assumed']);

const FILL = ['Wisniewska', 'district', 'provisional', 'afternoon', 'coverage', 'regional'];
function longValues(template) {
  const data = {};
  for (const f of template.fields) {
    if (f.ftype !== 'textfield' && f.ftype !== 'textarea') continue;
    const sample = String(f.value ?? '').trim();
    if (!sample) continue;
    let v = sample;
    const target = Math.max(sample.length + 8, Math.round(sample.length * 1.7));
    for (let i = 0; v.length < target; i += 1) v += ' ' + FILL[i % FILL.length];
    data[f.field] = v;
  }
  return data;
}
function sampleValues(template) {
  return Object.fromEntries(template.fields.map((f) => [f.field, String(f.value ?? '')]));
}
function edgeValues(template) {
  const text = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
  const numeric = template.fields.filter((f) => f.ftype === 'number');
  const data = {};
  for (const [i, f] of text.entries()) data[f.field] = i === 0 ? 'ÅSA KJÆRGÅRD-ÖSTRÖM' : i === text.length - 1 && text.length > 1 ? '' : String(f.value ?? '').toUpperCase();
  for (const f of numeric) data[f.field] = '0';
  return data;
}

/** Mount the composed document over the grey bed, write values, play, settle, measure every
 *  instrument, and shoot the frame. Returns the measurement and a downscaled JPEG. */
async function mountAndMeasure(template, data, opts) {
  const playError = await page.evaluate(async ({ template, data }) => {
    const bust = '?t=' + Date.now();
    const { composeDocument } = await import('/src/preview/composeDocument.ts' + bust);
    document.getElementById('harness-frame')?.remove();
    const frame = document.createElement('iframe');
    frame.id = 'harness-frame';
    frame.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;border:0;z-index:99999;background:#333;color-scheme:dark;';
    document.body.appendChild(frame);
    frame.srcdoc = composeDocument(template);
    await new Promise((resolve) => { frame.onload = resolve; });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const win = frame.contentWindow;
    let error = null;
    try {
      win.update(JSON.stringify(data));
      win.play();
    } catch (e) {
      error = String(e?.message ?? e).slice(0, 300);
    }
    await win.document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 1800));
    return error;
  }, { template, data });
  const measured = await measureFrame(opts);
  let image = null;
  if (opts.capture) {
    const png = await page.frameLocator('#harness-frame').locator('body').screenshot();
    image = await page.evaluate(async (pngB64) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 960;
        canvas.height = 540;
        canvas.getContext('2d').drawImage(img, 0, 0, 960, 540);
        resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = () => resolve(null);
      img.src = 'data:image/png;base64,' + pngB64;
    }), png.toString('base64'));
    if (opts.shotPath) await writeFile(opts.shotPath, png);
  }
  const steps = [];
  for (let k = 1; k <= (opts.steps ?? 0); k += 1) {
    const press = await page.evaluate(async () => {
      const win = document.getElementById('harness-frame')?.contentWindow;
      if (!win || typeof win.next !== 'function') return { missing: true };
      const before = win.document.body.innerHTML;
      try { win.next(); } catch (e) { return { error: String(e?.message ?? e).slice(0, 200) }; }
      return { before };
    });
    if (press.missing) { steps.push({ step: k, finding: `the graphic declares ${opts.steps} step(s) but window.next() does not exist` }); break; }
    if (press.error) { steps.push({ step: k, finding: `next() threw at step ${k}: ${press.error}` }); break; }
    await page.waitForTimeout(1400);
    const after = await page.evaluate(() => document.getElementById('harness-frame')?.contentWindow?.document.body.innerHTML ?? null);
    if (after !== null && after === press.before) { steps.push({ step: k, finding: `step ${k} of ${opts.steps} changed nothing on screen after next()` }); break; }
    steps.push({ step: k, measured: await measureFrame(opts) });
  }
  await page.evaluate(() => document.getElementById('harness-frame')?.remove());
  return { playError, measured, image, steps };
}

async function measureFrame(opts) {
  return page.evaluate(async ({ proType, ticker }) => {
    const bust = '?t=' + Date.now();
    const { measureAxes } = await import('/src/ai/spike/axisCheck.ts' + bust);
    const { measureSpacing } = await import('/src/ai/spike/spacingCheck.ts' + bust);
    const { measureProportion } = await import('/src/ai/spike/proportionCheck.ts' + bust);
    const { measureReadability } = await import('/src/validation/readabilityCheck.ts' + bust);
    const { measureTickerMargins } = await import('/src/validation/tickerCheck.ts' + bust);
    const doc = document.getElementById('harness-frame')?.contentDocument;
    if (!doc) return null;
    let spacingOpts = {};
    let proportionOpts = {};
    if (proType) {
      const { PRO_GRAPHICS } = await import('/src/ai/pro/language/graphics.ts' + bust);
      const inst = PRO_GRAPHICS[proType]?.instruments ?? {};
      spacingOpts = { ...(inst.spacing ?? {}) };
      proportionOpts = { ...(inst.proportion ?? {}) };
    }
    return {
      axis: measureAxes(doc),
      spacing: measureSpacing(doc, spacingOpts),
      proportion: measureProportion(doc, proportionOpts),
      readability: measureReadability(doc, { mode: 'standard', target: { profile: 'tv' } }),
      ticker: ticker ? measureTickerMargins(doc) : null,
    };
  }, { proType: opts.proType ?? null, ticker: Boolean(opts.ticker) });
}

/** One measured frame's instrument readings as harness findings. Collisions, text escapes,
 *  ticker margins and blocking readability BLOCK everywhere; calibrated spacing/proportion
 *  thresholds are advisory on types they were never calibrated for; alignment near-misses
 *  group into one advisory (§22.1). */
function instrumentFindings(measured, frame, advisoryInstruments) {
  const out = [];
  if (!measured) return out;
  const severity = advisoryInstruments ? 'advise' : 'block';
  for (const f of measured.spacing?.findings ?? []) {
    // An escape is reported from the instrument's own `escapes` list below, with the side, the
    // pixels and a fix hint; the finding-shaped copy of it would be the same defect twice.
    if (f.code === 'text-escapes-panel') continue;
    out.push({ source: 'instrument', code: `spacing-${f.code}`, severity: COLLISION_CODES.has(f.code) ? 'block' : severity, frame, locus: f.el ?? f.target ?? undefined, message: f.detail });
  }
  for (const e of measured.spacing?.escapes ?? []) {
    if (e.isText) out.push({ source: 'instrument', code: 'text-escapes-panel', severity: 'block', frame, locus: e.desc, message: `live text paints outside its panel: ${e.desc} by ${e.px}px past the ${e.side} edge`, fix: 'let the panel grow with the text (width: fit-content + a max-width cap), or wrap the text inside it' });
  }
  for (const f of measured.proportion?.findings ?? []) out.push({ source: 'instrument', code: `proportion-${f.code}`, severity, frame, message: f.detail });
  const misses = measured.axis?.nearMisses ?? [];
  if (misses.length) {
    const seen = new Set();
    const parts = [];
    for (const m of misses) {
      const key = [m.a.el, m.b.el].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(`${m.a.el} vs ${m.b.el} ${m.gapPx}px off on the ${m.side}`);
    }
    out.push({ source: 'instrument', code: 'axis-near-miss', severity: 'advise', frame, message: `${seen.size} alignment near-miss(es): ${parts.slice(0, 5).join('; ')}${seen.size > 5 ? ` (+${seen.size - 5} more)` : ''}`, fix: 'align exactly, or separate deliberately' });
  }
  for (const f of measured.readability?.findings ?? []) {
    // A size, weight or contrast reading is a property of the stylesheet rather than of the
    // frame it was read on, so it carries no frame in its identity - one defect, not three.
    const perFrame = !STYLESHEET_READINGS.has(f.code);
    out.push({ source: 'rules', code: `readability-${f.code}`, severity: f.severity === 'block' ? 'block' : 'advise', ...(perFrame ? { frame } : {}), locus: f.el ?? f.field ?? undefined, message: f.detail });
  }
  for (const f of measured.ticker?.findings ?? []) out.push({ source: 'instrument', code: `ticker-${f.code}`, severity: 'block', frame, message: f.detail });
  return out;
}

function createPlaywrightWorkbench({ proType, ticker, steps, shotsDir, tag }) {
  const advisoryInstruments = !CALIBRATED[proType ?? ''];
  return {
    async listTypes() {
      return page.evaluate(async () => {
        const bust = '?t=' + Date.now();
        const { typeIndex } = await import('/src/ai/pro/harness/typeSemantics.ts' + bust);
        return typeIndex();
      });
    },
    async describeType(id) {
      return page.evaluate(async (id) => {
        const bust = '?t=' + Date.now();
        const { typeSemantics } = await import('/src/ai/pro/harness/typeSemantics.ts' + bust);
        return typeSemantics(id);
      }, id);
    },
    async scaffold(request) {
      return page.evaluate(async (request) => {
        const bust = '?t=' + Date.now();
        const { typeById } = await import('/src/templates/types/registry.ts' + bust);
        const { neutralDesignFor, neutralSpineFor } = await import('/src/templates/types/neutralDesign.ts' + bust);
        const { variantFromType, variantsFromType } = await import('/src/templates/types/graphicType.ts' + bust);
        const { parseAnimData } = await import('/src/blocks/animData.ts' + bust);
        const { spxSteps } = await import('/src/blocks/animMachine.ts' + bust);
        const notes = [];
        let template;
        let prefix = 'graphic';
        const style = { ...(request.fontId ? { fontId: request.fontId } : {}), ...(request.zone ? { zone: request.zone } : {}) };
        if (request.typeId) {
          const type = typeById(request.typeId);
          if (!type) throw new Error(`Unknown graphic type "${request.typeId}".`);
          const design = neutralDesignFor(type);
          // The neutral spine first (anti-anchoring); a type whose category has its own
          // assembler falls back to its first catalog design, and says so.
          const variant = design ? variantFromType(type, design) : variantsFromType(type)[0];
          notes.push(design
            ? 'Neutral scaffold: the type\'s fields, machine, controls and runtime on a plain spine - the look is a placeholder, design it.'
            : `No neutral spine for this type yet; scaffolded on its catalog design "${variant.name}" - restyle it freely, keep the structure.`);
          template = variant.create(style);
          prefix = type.structure.prefix;
          const data = parseAnimData(template.js);
          if (data?.machine) notes.push('This type carries a STATE MACHINE in its ANIMATION region (operator buttons come from it). The animation region is platform-owned here: design css and markup, leave the motion to the type.');
        } else {
          template = neutralSpineFor(request.fields ?? [], { ...style, name: request.name });
          notes.push('Typeless graphic: every declared field is an operator input; Take/Update/Next/Out come from the implicit lifecycle machine.');
        }
        template.name = request.name;
        const data = parseAnimData(template.js);
        const steps = data ? spxSteps(data) : 1;
        return {
          template,
          prefix,
          fields: template.fields.map((f) => ({ id: f.field, label: f.title, kind: f.ftype, sample: String(f.value ?? '') })),
          steps: Number.isFinite(steps) ? steps : 1,
          notes,
        };
      }, request);
    },
    async apply(template, prefix, p) {
      // The animation region is platform-owned when the scaffold carries a machine.
      if (p.animation !== undefined) {
        const owned = await page.evaluate(async (js) => {
          const bust = '?t=' + Date.now();
          const { parseAnimData } = await import('/src/blocks/animData.ts' + bust);
          return Boolean(parseAnimData(js)?.machine);
        }, template.js);
        if (owned) return { ok: false, reasons: ['animation: this type\'s state machine lives in the ANIMATION region, so the region is platform-owned - design with css and boxHtml, and leave the motion to the type'] };
      }
      return patchModule.applyGraphicPatch(template, prefix, p);
    },
    async inspect(template, prefix, options) {
      // Normalize a COPY for rendering: an authored ANIMATION region converts to keyframe data
      // (the same importer every wizard category goes through); the working template keeps the
      // authoring grammar so the next patch edits what the model wrote.
      const { normalized, converted } = await page.evaluate(async (template) => {
        const bust = '?t=' + Date.now();
        const { convertEmittedRegion } = await import('/src/ai/claudeProvider.ts' + bust);
        const { parseAnimData } = await import('/src/blocks/animData.ts' + bust);
        const copy = structuredClone(template);
        const out = convertEmittedRegion(copy);
        return { normalized: out, converted: Boolean(parseAnimData(out.js)) };
      }, template);
      const raw = [];
      if (!converted) raw.push({ source: 'harness', code: 'animation-unconvertible', severity: 'block', message: 'the ANIMATION region could not be converted to keyframe data - stay inside the authoring grammar (var animSpeed/easeIn/easeOut, buildInTimeline/buildOutTimeline, tl.set/to/fromTo with literal values, durations as N / animSpeed)' });
      const validation = await page.evaluate(async ({ template, category }) => {
        const bust = '?t=' + Date.now();
        const { productionSpxValidator } = await import('/src/ai/lite/pipeline.ts' + bust);
        const validate = productionSpxValidator(null, [], { fieldPaints: true, ...(category ? { typeFloorCategory: category } : {}) });
        const result = await validate(template);
        return { errors: result.errors, warnings: result.warnings };
      }, { template: normalized, category: normalized.type ?? null });
      for (const e of validation.errors) raw.push({ source: e.rule.startsWith('bench-') ? 'runtime' : 'static', code: e.rule, severity: 'block', message: e.message, locus: locus(e.message) });
      for (const w of validation.warnings) {
        // The bench's `legibility-*` warnings are the readability instrument's findings phrased
        // for a person; the instrument pass below reports the same classes per frame with a
        // locus, so the bench's copy is dropped rather than shown twice.
        if (w.rule.startsWith('legibility-')) continue;
        // The one-state field paint read is the owner's "never ship a field that paints nothing"
        // rule, so it blocks (the Lite lesson); plate legibility blocks on the custom lane.
        const block = w.rule === 'bench-field-unpainted' || w.rule.startsWith('pro-plate-');
        raw.push({ source: w.rule.startsWith('bench-') ? 'runtime' : 'static', code: w.rule, severity: block ? 'block' : 'advise', message: w.message, locus: locus(w.message) });
      }
      const shots = shotsDir ? { hold: path.join(shotsDir, `${tag}.hold.png`), long: path.join(shotsDir, `${tag}.long.png`) } : {};
      const hold = await mountAndMeasure(normalized, sampleValues(normalized), { proType, ticker, steps, capture: options.capture, shotPath: shots.hold });
      if (hold.playError) raw.push({ source: 'runtime', code: 'play-threw', severity: 'block', frame: 'hold', message: `the template threw at play(): ${hold.playError}` });
      raw.push(...instrumentFindings(hold.measured, 'hold', advisoryInstruments));
      for (const s of hold.steps) {
        if (s.finding) raw.push({ source: 'runtime', code: 'step-contract', severity: 'block', frame: 'step', locus: `step-${s.step}`, message: s.finding });
        else raw.push(...instrumentFindings(s.measured, 'step', advisoryInstruments).map((f) => ({ ...f, locus: f.locus ? `${f.locus}@step-${s.step}` : `step-${s.step}` })));
      }
      const long = await mountAndMeasure(normalized, { ...sampleValues(normalized), ...longValues(normalized) }, { proType, ticker, capture: options.capture, shotPath: shots.long });
      raw.push(...instrumentFindings(long.measured, 'long', advisoryInstruments));
      const edge = await mountAndMeasure(normalized, { ...sampleValues(normalized), ...edgeValues(normalized) }, { proType, ticker, capture: false });
      raw.push(...instrumentFindings(edge.measured, 'edge', advisoryInstruments));
      const frames = [];
      if (options.capture && hold.image) frames.push({ kind: 'hold', image: { mediaType: 'image/jpeg', base64: hold.image } });
      if (options.capture && long.image) frames.push({ kind: 'long', image: { mediaType: 'image/jpeg', base64: long.image } });
      return { findings: findingsModule.normalizeFindings(raw), frames, costUsd: 0 };
    },
    async finish(template, name) {
      const normalized = await page.evaluate(async (template) => {
        const bust = '?t=' + Date.now();
        const { convertEmittedRegion } = await import('/src/ai/claudeProvider.ts' + bust);
        return convertEmittedRegion(structuredClone(template));
      }, template);
      const dir = path.join(OUT, 'code', tag);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), normalized.html);
      await writeFile(path.join(dir, 'template.css'), normalized.css);
      await writeFile(path.join(dir, 'template.js'), normalized.js);
      await writeFile(path.join(dir, 'template.json'), JSON.stringify({ ...normalized, name }, null, 2));
      return { template: normalized, location: dir };
    },
  };
}

function locus(message) {
  const field = /#?\b(f\d+)\b/.exec(message);
  if (field) return field[1];
  const sel = /(\.[a-z][a-z0-9-]*)/i.exec(message);
  return sel ? sel[1] : undefined;
}

// ── --control: the workbench and the loop, no model ───────────────────────────────────────
if (control) {
  const { MockLanguageModelV3 } = await import('ai/test');
  let failed = false;
  const shotsDir = path.join(OUT, 'control');
  await mkdir(shotsDir, { recursive: true });
  const wb = createPlaywrightWorkbench({ proType: 'lower-third', ticker: false, steps: 0, shotsDir, tag: 'control' });

  console.log('control 1: scaffold the lower third on its neutral spine');
  const scaffold = await wb.scaffold({ typeId: 'lower-third', name: 'Control strap' });
  console.log(`  prefix ${scaffold.prefix}, ${scaffold.fields.length} field(s), ${scaffold.steps} step(s): ${scaffold.fields.map((f) => `${f.id}=${f.label}`).join(', ')}`);
  if (scaffold.prefix !== 'lower-third' || scaffold.fields.length < 2) { console.error('  FAILED: unexpected scaffold shape'); failed = true; }

  console.log('control 2: inspect the untouched spine (a valid scaffold measures clean, bar the owner size table)');
  const clean = await wb.inspect(scaffold.template, scaffold.prefix, { capture: true });
  // THE OWNER TABLE MAY INDICT A SHIPPED SPINE (the neutral heading is 48px against a 50px floor):
  // audit evidence, never harness murk (docs/DESIGN_RULES_PLAN.md). Everything else loud on a
  // known-good spine is murk.
  const tableFinding = (f) => f.code.includes('size');
  const cleanBlocking = findingsModule.blocking(clean.findings);
  for (const f of clean.findings) console.log(`  ${f.severity === 'block' ? '-' : '~'} ${findingsModule.describeFinding(f)}`);
  const murk = cleanBlocking.filter((f) => !tableFinding(f));
  if (murk.length) { console.error(`  FAILED: ${murk.length} blocking finding(s) on a known-good spine that are not the owner size table.`); failed = true; }
  if (!clean.frames.length) { console.error('  FAILED: no frame captured.'); failed = true; }

  console.log('control 3: a forced overlap (the mask pulled over the primary line) must produce a blocking finding');
  const broken = wb.apply(scaffold.template, scaffold.prefix, { css: `.lower-third-mask:has(#f1) { margin-top: -52px; }` });
  const brokenResult = await broken;
  if (!brokenResult.ok) { console.error(`  FAILED: the mutation patch was refused: ${brokenResult.reasons.join('; ')}`); failed = true; }
  else {
    const bad = await wb.inspect(brokenResult.template, scaffold.prefix, { capture: false });
    const badBlocking = findingsModule.blocking(bad.findings).filter((f) => !tableFinding(f));
    for (const f of badBlocking) console.log(`  - ${findingsModule.describeFinding(f)}`);
    if (!badBlocking.length) { console.error('  MUTATION CHECK FAILED: the forced overlap produced no blocking finding.'); failed = true; }
    const diff = findingsModule.diffFindings(clean.findings, bad.findings);
    console.log(`  diff vs clean: ${diff.introduced.length} introduced, ${diff.fixed.length} fixed`);
    if (!diff.introduced.length) { console.error('  FAILED: the diff did not see the introduced defect.'); failed = true; }
  }

  console.log('control 4: the patch guard refuses a :root rewrite and keeps field ids');
  const refused = await wb.apply(scaffold.template, scaffold.prefix, { css: ':root { --accent: red; }' });
  if (refused.ok) { console.error('  FAILED: a :root patch was accepted.'); failed = true; } else console.log(`  refused: ${refused.reasons.join('; ')}`);

  console.log('control 5: a typeless scaffold from declared fields');
  const typeless = await wb.scaffold({ name: 'Now playing', fields: [{ label: 'Artist', kind: 'text', value: 'Anna Andersson' }, { label: 'Song', kind: 'text', value: 'Northern Lights' }, { label: 'Plays', kind: 'number', value: '12' }] });
  console.log(`  prefix ${typeless.prefix}, fields ${typeless.fields.map((f) => f.id).join(', ')}`);
  if (typeless.fields.length !== 3) { console.error('  FAILED: expected 3 fields'); failed = true; }

  console.log('control 6: the whole loop on a scripted model - scaffold, a design patch, finish or repair');
  const designCss = `
.lower-third-box { padding: calc(22px * var(--scale)) calc(30px * var(--scale)); border-left: calc(8px * var(--scale)) solid var(--accent); }
.lower-third-heading, [class*="lower-third"] span#f0 { font-size: calc(56px * var(--scale) * var(--type-scale)); font-weight: 700; letter-spacing: -0.01em; }
span#f1 { font-size: calc(26px * var(--scale) * var(--type-scale)); color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.12em; font-weight: 500; }
`;
  let n = 0;
  const script = [
    { toolName: 'inspectGraphicType', input: { typeId: 'lower-third' } },
    { toolName: 'startGraphic', input: { name: 'Control strap', typeId: 'lower-third' } },
    { toolName: 'applyDesign', input: { css: designCss, rationale: 'a heavier strap with an edge bar' } },
  ];
  const mock = new MockLanguageModelV3({
    modelId: 'mock/control',
    doGenerate: async (options) => {
      const forced = options.toolChoice?.type === 'tool' ? options.toolChoice.toolName : null;
      const entry = script[n] ?? (forced === 'finishGraphic' ? { toolName: 'finishGraphic', input: { summary: 'control run' } } : forced === 'stopGraphic' ? { toolName: 'stopGraphic', input: { reason: 'control run stopped' } } : { toolName: 'applyDesign', input: { css: designCss + `\n.lower-third-box { padding: calc(${22 + n}px * var(--scale)) calc(30px * var(--scale)); }`, rationale: `repair ${n}` } });
      n += 1;
      return {
        content: [{ type: 'tool-call', toolCallId: `c${n}`, toolName: entry.toolName, input: JSON.stringify(entry.input) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: { inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 0, text: 0, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  const loopWb = createPlaywrightWorkbench({ proType: 'lower-third', ticker: false, steps: 0, shotsDir, tag: 'control-loop' });
  const result = await harness.runProHarness({
    workbench: loopWb,
    models: { cheap: mock },
    request: { brief: 'A news strap.', typeId: 'lower-third' },
    budget: { maxRounds: 3, maxSteps: 8 },
    onEvent: (line) => console.log(`  ${line}`),
  });
  console.log(`  loop: ${result.status} after ${result.rounds.length} round(s), ${result.steps} step(s) - ${result.reason}`);
  if (!['delivered', 'refused'].includes(result.status) || result.rounds.length < 1) { console.error('  FAILED: the loop did not run a round.'); failed = true; }
  await writeFile(path.join(OUT, 'control-result.json'), JSON.stringify({ ...result, template: undefined }, null, 2));
  console.log(failed ? 'CONTROL FAILED - fix the workbench before spending anything.' : 'CONTROL OK.');
  await shutdown(failed ? 1 : 0);
}

// ── --generate: the paid round over the custom bank ──────────────────────────────────────
const fileEnv = await readEnvFile();
const apiKey = (process.env.AI_GATEWAY_API_KEY ?? fileEnv.AI_GATEWAY_API_KEY ?? '').trim();
if (!apiKey) { console.error('No AI_GATEWAY_API_KEY in the environment or .env.'); await shutdown(1); }
const { createGateway } = await import('ai');
const gateway = createGateway({ apiKey });
const cheapModel = gateway(route.model);
const strongModel = strongRoute ? gateway(strongRoute.model) : undefined;
const visionModel = vision ? gateway((criticRoute ?? route).model) : undefined;

const bank = JSON.parse(await readFile(BANK, 'utf8'));
const briefs = bank.briefs.filter((e) => !only || only.includes(e.id));
const ledgerPath = path.join(OUT, 'results.json');
const ledger = resume && existsSync(ledgerPath) ? JSON.parse(await readFile(ledgerPath, 'utf8')) : { route: route.model, strong: strongRoute?.model ?? null, vision, results: [] };
let spent = ledger.results.reduce((s, r) => s + (r.spentUsd ?? 0), 0);
await mkdir(path.join(OUT, 'shots'), { recursive: true });

for (const entry of briefs) {
  if (ledger.results.some((r) => r.id === entry.id)) { console.log(`skip ${entry.id} (resumed)`); continue; }
  if (spent >= maxCost) { console.log(`ceiling reached ($${spent.toFixed(3)} of $${maxCost}); stopping before ${entry.id}.`); break; }
  const typeId = TYPE_OF[entry.type] ?? null;
  const fields = entry.brief.fields?.map((f) => ({ label: f.title, kind: /^[\d.]+$/.test(f.sample) ? 'number' : 'text', value: f.sample })) ?? (entry.type === 'lower-third' ? [{ label: 'Name', kind: 'text', value: entry.brief.name }, { label: 'Title', kind: 'text', value: entry.brief.title }] : []);
  const briefText = [
    entry.brief.brief,
    entry.brief.name && !entry.brief.fields ? `Sample name: "${entry.brief.name}", sample title: "${entry.brief.title}".` : '',
    entry.brief.fields ? `The operator's fields and sample values: ${entry.brief.fields.map((f) => `${f.title} = "${f.sample}"`).join('; ')}.` : '',
    entry.brief.steps?.length ? `Operator steps, in order: ${entry.brief.steps.join(' -> ')}.` : '',
  ].filter(Boolean).join('\n');
  const tag = `${entry.id}.${route.model.replace(/[^a-z0-9.-]/gi, '_')}`;
  const wb = createPlaywrightWorkbench({ proType: CALIBRATED[entry.type] ?? null, ticker: entry.type === 'ticker', steps: Math.min(entry.brief.steps?.length ?? 0, 6), shotsDir: path.join(OUT, 'shots'), tag });
  console.log(`\n== ${entry.id} (${entry.type}) ==`);
  const started = Date.now();
  const result = await harness.runProHarness({
    workbench: wb,
    models: { cheap: cheapModel, ...(strongModel ? { strong: strongModel } : {}), ...(visionModel ? { vision: visionModel } : {}) },
    request: { brief: briefText, typeId, fields: fields.map((f) => ({ label: f.label, kind: f.kind })) },
    budget: { maxRounds: MAX_ROUNDS, maxUsd: Math.max(0.01, maxCost - spent) },
    capture: vision,
    providerOptions: { gateway: { zeroDataRetention: true, disallowPromptTraining: true, tags: ['surface:spike'] } },
    onEvent: (line) => console.log(`  ${line}`),
  });
  spent += result.spentUsd;
  const record = {
    id: entry.id,
    type: entry.type,
    status: result.status,
    reason: result.reason,
    rounds: result.rounds.map((r) => ({ round: r.round, model: r.model, blocking: findingsModule.blocking(r.findings).length, advisory: r.findings.length - findingsModule.blocking(r.findings).length, codes: r.findings.map((f) => f.id) })),
    bestRound: result.bestRound,
    steps: result.steps,
    escalated: result.escalated,
    critiquesUsed: result.critiquesUsed,
    spentUsd: result.spentUsd,
    seconds: Math.round((Date.now() - started) / 1000),
    events: result.events,
  };
  if (result.template) {
    const dir = path.join(OUT, 'code', tag);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), result.template.html);
    await writeFile(path.join(dir, 'template.css'), result.template.css);
    await writeFile(path.join(dir, 'template.js'), result.template.js);
  }
  ledger.results.push(record);
  await writeFile(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`  -> ${result.status} in ${record.rounds.length} round(s), $${result.spentUsd.toFixed(4)} (total $${spent.toFixed(3)})`);
}

const delivered = ledger.results.filter((r) => r.status === 'delivered').length;
console.log(`\n${delivered}/${ledger.results.length} delivered clean, $${spent.toFixed(3)} total, ${ledger.results.length ? (spent / ledger.results.length).toFixed(4) : '0'} per graphic. Ledger: ${ledgerPath}`);
await shutdown(0);
