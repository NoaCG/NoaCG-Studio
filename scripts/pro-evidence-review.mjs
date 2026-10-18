#!/usr/bin/env node
// THE REVIEW PAGE - one page holding every picture this branch captured, for a human to READ.
//
//   node scripts/pro-evidence-review.mjs                     # from whatever is on disk
//   node scripts/pro-evidence-review.mjs --pro=pro-spike-out  # …plus a Pro round's graphics
//
// WHY IT EXISTS. Two separate pieces of work were verified numerically and never looked at: the
// Phase A Pro pipeline (docs/NOACG_PRO_PLAN.md §16 - "a graphic passed every gate and was
// unusable", so the human read is the one step that cannot be skipped) and the four marked straps
// whose mark handling changed (ls29, ls17, lt07, ls10, and the two that grew: lt49, lt53). Both
// were the same missing thing - a viewable frame - so both land on one page.
//
// IT JUDGES NOTHING. There is no verdict column, no pass/fail, no ranking. Every frame is shown
// with the words it carried and the raw measurement beside it; what it means is the reader's to
// say. A machine verdict printed next to a picture is how §16 happened.
//
// THE BACKDROP IS A STAND-IN AND SAYS SO. A broadcast graphic ships transparent and is judged
// over pictures, so the frames are captured WITH ALPHA and composited here over backdrops the
// page draws itself: a dark studio, a blown-out daylight plate, a busy mid-tone, plus a
// checkerboard that shows exactly where the alpha is. They are CSS, not footage - a legibility
// call made against them is a call about contrast, not about a real shot.
//
// Free. Reads files, writes one HTML file, calls nothing.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;

const EVIDENCE = path.resolve(arg('evidence') ?? 'benchmarks/pro/evidence');
const OUT = path.resolve(arg('out') ?? path.join(EVIDENCE, 'review.html'));
const PRO_DIR = arg('pro') ? path.resolve(arg('pro')) : null;

/** The designs this branch exists to show: the four whose mark handling changed, plus the two
 *  the sweep found growing taller. Everything else in the sweep is still on the page - this list
 *  only decides what the "the six" filter shows first. */
const HEADLINE = ['ls29', 'ls17', 'lt07', 'ls10', 'lt49', 'lt53'];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ── The mark sweeps ───────────────────────────────────────────────────────────────────────
const sweepFiles = (await readdir(EVIDENCE).catch(() => []))
  .filter((f) => f.startsWith('mark-clearance.') && f.endsWith('.json'));
const sweeps = [];
for (const file of sweepFiles) {
  const data = JSON.parse(await readFile(path.join(EVIDENCE, file), 'utf8'));
  sweeps.push(data);
}
// Square first, then the portrait crest: the sweep only ever ran the square one, which is why
// lt07 and ls10 read clean for so long, so the two belong beside each other in that order.
sweeps.sort((a, b) => (a.mark === 'badge-square' ? -1 : b.mark === 'badge-square' ? 1 : 0));

/** Every design id any sweep measured, in the order the first sweep swept them. */
const designIds = [];
for (const sweep of sweeps) {
  for (const row of sweep.rows) if (!designIds.includes(row.id)) designIds.push(row.id);
}

const rowFor = (sweep, id) => sweep.rows.find((r) => r.id === id) ?? null;
const frameSrc = (sweep, row, state) => {
  const frame = (row?.frames ?? []).find((f) => f.state === state);
  if (!frame || !sweep.frameDir) return null;
  // `frameDir` is written relative to the repo root; the page links relative to ITSELF, so the
  // two are joined through absolute paths rather than by assuming where either one sits.
  const rel = path.relative(path.dirname(OUT), path.resolve(sweep.frameDir));
  return `${rel.split(path.sep).join('/')}/${frame.file}`;
};

/** The numbers, printed raw. No thresholds are applied here on purpose: the sweep's own console
 *  output is where a flag lives, and a flag beside a picture answers the question the picture is
 *  being shown to ask. */
function measurementList(row) {
  if (!row) return '<p class="muted">not measured</p>';
  const px = row.markPx ? `${row.markPx.gap}px gap / ${row.markPx.height}px mark` : '-';
  const size = (s) => (s ? `${s.width}x${s.height}` : '-');
  const parts = row.markedParts ? `${row.markedParts.mark}px well / ${row.markedParts.words}px words` : '-';
  const items = [
    // THE LIVE READING FIRST, and the two retired ones named as retired. Both of the ratios this
    // list used to lead with are now superseded: the gap is measured from the mark's INK (not its
    // border box) and expressed in TYPE SIZES (not in the mark's own height, which divided a
    // design by its own generosity - `spacingCheck.ts` MARK_GAP_FLOOR_RATIO carries the account).
    // Leading with a superseded number beside a picture is how a frame gets read against a rule
    // nothing enforces any more.
    ['mark gap, type sizes (the live instrument)', row.typeRatio ?? '-'],
    ['…in mark heights (retired 2026-08-15)', row.inkRatio ?? '-'],
    ['…off the border box (retired earlier the same day)', row.borderRatio ?? '-'],
    ['raw', px],
    ['strap bare -> marked', `${size(row.bareSize)} -> ${size(row.markedSize)}`],
    ['box children (marked)', parts],
    ['text line boxes', `${row.bareLines ?? '-'} -> ${row.markedLines ?? '-'}`],
    ['panel found', row.panel ? 'yes' : 'no'],
    ['spacing codes (marked)', row.codes?.join(', ') || 'clean'],
    ['spacing codes (bare)', row.bareCodes?.join(', ') || 'clean'],
  ];
  if (row.own?.bare?.size) {
    items.push([`own lines (${row.own.count}) bare -> marked`,
      `${size(row.own.bare.size)} -> ${size(row.own.marked.size)}`]);
  }
  return `<dl class="measure">${items
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

/**
 * One frame on its plate. `flat` marks a capture that is NOT transparent - the spike runner
 * screenshots its hold inside the app, so those frames carry the bench's own grey card baked in.
 * Laying one over a backdrop would show a grey rectangle floating on a studio shot and read as a
 * design that paints a box it does not paint, so they keep their own ground and say so.
 */
function frameFigure(src, caption, note, flat = false) {
  if (!src) return `<figure class="missing"><div class="plate empty">no frame</div>`
    + `<figcaption>${esc(caption)}</figcaption></figure>`;
  return `<figure><div class="plate${flat ? ' flat' : ''}">`
    + `<img src="${esc(src)}" alt="${esc(caption)}" loading="lazy"></div>`
    + `<figcaption>${esc(caption)}${note ? ` <span class="muted">${esc(note)}</span>` : ''}</figcaption></figure>`;
}

const markSection = designIds.map((id) => {
  const bareShown = sweeps[0] ? frameSrc(sweeps[0], rowFor(sweeps[0], id), 'bare') : null;
  const content = sweeps.map((s) => rowFor(s, id)?.content).find(Boolean) ?? null;
  const probeWords = content?.probe?.map((l) => l.sample).join(' · ') ?? '';
  const ownWords = content?.own?.map((l) => l.sample).join(' · ') ?? '';

  const probeRow = [
    frameFigure(bareShown, 'no mark', 'the control'),
    ...sweeps.map((s) => frameFigure(frameSrc(s, rowFor(s, id), 'marked'),
      s.mark, s.markNatural ? `${s.markNatural.width}x${s.markNatural.height}` : '')),
  ].join('');

  const ownRow = sweeps.some((s) => frameSrc(s, rowFor(s, id), 'own-marked'))
    ? `<h4>the design's own lines <span class="muted">${esc(ownWords)}</span></h4>
    <div class="frames">${[
    frameFigure(sweeps[0] ? frameSrc(sweeps[0], rowFor(sweeps[0], id), 'own-bare') : null, 'no mark', 'the control'),
    ...sweeps.map((s) => frameFigure(frameSrc(s, rowFor(s, id), 'own-marked'), s.mark, '')),
  ].join('')}</div>`
    : '';

  const measures = sweeps.map((s) => `<div class="col"><h5>${esc(s.mark)}</h5>${measurementList(rowFor(s, id))}</div>`).join('');

  return `<section class="design${HEADLINE.includes(id) ? ' headline' : ''}" data-id="${esc(id)}">
  <h2>${esc(id)}${HEADLINE.includes(id) ? ' <span class="tag">changed here</span>' : ''}</h2>
  <h4>probe lines <span class="muted">${esc(probeWords)}</span></h4>
  <div class="frames">${probeRow}</div>
  ${ownRow}
  <div class="cols">${measures}</div>
</section>`;
}).join('\n');

// ── A Pro round, when one has been captured ───────────────────────────────────────────────
//
// Read from the spike runner's own ledger rather than re-derived: `results.json` is what the paid
// run wrote, and re-deriving anything here would be a second story about the same money.
let proSection = '';
let proLead = '';
if (PRO_DIR) {
  const ledger = JSON.parse(await readFile(path.join(PRO_DIR, 'results.json'), 'utf8'));
  const dir = path.relative(path.dirname(OUT), PRO_DIR).split(path.sep).join('/');
  // The brief TEXT is not in the ledger - the ledger keys by brief id - so it is joined back
  // from the committed bank. A picture with no brief beside it cannot be read for whether it
  // answered the question.
  const bank = await readFile(path.resolve('benchmarks/pro/v1/briefs.json'), 'utf8')
    .then((raw) => JSON.parse(raw).briefs ?? []).catch(() => []);
  const briefById = new Map(bank.map((b) => [b.id, b]));
  const results = ledger.results.filter((r) => !r.skipped && !r.error && r.kind === 'candidate');
  const brands = [...new Set(results.map((r) => r.brand).filter(Boolean))];
  const briefIds = [...new Set(results.map((r) => String(r.slug ?? '').split('.')[0]))];
  const spend = results.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  proLead = `<p class="lead"><strong>${results.length} Pro generations</strong> across `
    + `${briefIds.length} briefs and ${brands.length} brands`
    + `${spend ? ` · $${spend.toFixed(4)} of real provider spend` : ''}. Each one is the graphic the`
    + ` platform composed from the design language the model returned - one text call, no image.`
    + ` The <em>stress text</em> frame beside each hold is the same graphic driven with the long`
    + ` values, which is where a composition that only fits its own sample breaks.</p>`
    + (results.some((r) => r.alphaHold)
      ? `<p class="lead">These frames were RE-SHOT transparent from the round's own saved code`
        + ` (<code>pro-spike.mjs --alpha</code>, free), because the runner's own hold is`
        + ` screenshotted inside the app and carries the bench's grey card - a graphic composited`
        + ` onto grey cannot be laid over anything afterwards. Same code, same field values, no`
        + ` second generation.</p>`
      : `<p class="lead"><strong>These frames are NOT transparent</strong>, unlike the strap frames`
        + ` above: the runner screenshots its hold inside the app, so each carries the bench's own`
        + ` grey card and keeps that ground whatever backdrop is selected.</p>`);
  proSection = results.map((r) => {
    const briefId = String(r.slug ?? '').split('.')[0];
    const entry = briefById.get(briefId);
    const brief = entry?.brief ?? {};
    const words = [brief.name, brief.title].filter(Boolean).join(' / ');
    const briefText = [brief.brief, words && `words: ${words}`].filter(Boolean).join('  —  ');
    // The TRANSPARENT re-shoot when the round has one (`pro-spike.mjs --alpha`), because that is
    // the frame the backdrop switch means something for; the runner's own hold carries the bench's
    // grey card and keeps its own ground.
    // WHAT THE PLATFORM MAKES OF THAT LANGUAGE TODAY, when the round has been recomposed
    // (`pro-spike.mjs --recompose`, free). The paid frames stay reachable below on any cell the
    // composer has since changed, because "what that round produced" and "what it would produce
    // now" are two different questions and the second must not quietly replace the first.
    const hold = r.recomposedHold ?? r.alphaHold ?? r.hold;
    const stress = r.recomposedStress ?? r.alphaStressHold ?? r.stressHold;
    const flat = !r.alphaHold && !r.recomposedHold;
    const changed = Boolean(r.recomposedHold && r.alphaHold
      && (r.recomposedAdjustments ?? []).join() !== (r.languageAdjustments ?? []).join());
    const shots = [
      hold ? frameFigure(`${dir}/${hold}`, 'settled hold', flat ? 'on the bench card' : '', flat) : '',
      stress ? frameFigure(`${dir}/${stress}`, 'stress text', flat ? 'on the bench card' : '', flat) : '',
      // The paid frame kept beside it wherever the composer's answer moved, so a change to the
      // platform is visible as a change rather than as a different picture with no history.
      ...(changed && r.alphaHold
        ? [frameFigure(`${dir}/${r.alphaHold}`, 'as the paid round produced it',
          (r.languageAdjustments ?? []).join(', ') || 'no adjustments')]
        : []),
    ].join('');
    const errors = r.validation?.errors ?? [];
    const warnings = r.validation?.warnings ?? [];
    const facts = [
      ['brief', briefId],
      ['brand', r.brand ?? '-'],
      ['the language the model named', r.language?.name ?? '-'],
      ['its rationale', r.language?.rationale ?? '-'],
      ['palette', r.language?.palette
        ? Object.entries(r.language.palette).map(([k, v]) => `${k} ${v}`).join('  ') : '-'],
      ['typeface', r.language?.typography?.fontId ?? '-'],
      ['platform adjustments', (r.recomposedAdjustments ?? r.languageAdjustments ?? []).join(', ') || 'none'],
      ['model', r.model ?? r.route ?? '-'],
      ['cost', r.costUsd != null ? `$${r.costUsd.toFixed(4)}` : '-'],
      ['wall clock', r.ms != null ? `${(r.ms / 1000).toFixed(1)} s` : '-'],
      [r.recomposedHold ? 'validator errors (the paid round)' : 'validator errors', errors.length ? errors.join(' | ') : 'none'],
      [r.recomposedHold ? 'validator warnings (the paid round, before the composer changed)' : 'validator warnings', warnings.length ? warnings.join(' | ') : 'none'],
      ['field contract', r.contract?.scaffoldOk ? 'ok' : 'FAILED'],
      ['play() threw', r.playError ? r.playError : 'no'],
    ];
    return `<section class="design pro" data-id="${esc(r.slug ?? r.blindId ?? briefId)}">
  <h2>${esc(briefId)}${r.brand ? ` · ${esc(r.brand)}` : ''}${r.divergence ? ' <span class="tag">divergence cell</span>' : ''}</h2>
  <p class="brief">${esc(briefText)}</p>
  <div class="frames">${shots}</div>
  <div class="cols"><div class="col wide"><dl class="measure">${facts
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div></div>
</section>`;
  }).join('\n');
}

// ── The HOSTED generation - the one a person drove through the product ────────────────────
//
// Separate from the round above, and it earns its own section: those 18 ran through the bench's
// route, this one went through /api/ai/pro-generations with a real reservation, a real settle and
// a real ledger row. It is one graphic, so it is shown large.
let hostedSection = '';
const hostedDir = path.join(EVIDENCE, 'hosted-2026-08-16');
const hostedRun = await readFile(path.join(hostedDir, 'run.json'), 'utf8')
  .then((raw) => JSON.parse(raw)).catch(() => null);
if (hostedRun) {
  const rel = path.relative(path.dirname(OUT), hostedDir).split(path.sep).join('/');
  const facts = [
    ['brief typed into the wizard', hostedRun.brief],
    ['ledger row', hostedRun.ledger?.id ?? '-'],
    ['status', hostedRun.ledger?.status ?? '-'],
    ['provider cost', hostedRun.ledger?.cost != null ? `$${hostedRun.ledger.cost}` : '-'],
    ['model calls on the reservation', hostedRun.ledger?.calls ?? '-'],
    ['server runtime', hostedRun.ledger?.runtime != null ? `${(hostedRun.ledger.runtime / 1000).toFixed(1)} s` : '-'],
    ['wall clock, press to result card', `${(hostedRun.runtimeMs / 1000).toFixed(1)} s`],
    ['rule codes on the row', (hostedRun.ledger?.codes ?? []).join(', ') || 'none'],
    ['adjustments on the row', (hostedRun.ledger?.adjustments ?? []).join(', ') || 'none'],
    ['every /api/ai call the browser made', (hostedRun.calls ?? []).join('  →  ')],
    ['page errors', (hostedRun.pageErrors ?? []).join(' | ') || 'none'],
    ['what the result card said', hostedRun.proReport ?? '-'],
  ];
  hostedSection = `<h3>The hosted generation - one graphic, through the product</h3>
<p class="lead">Driven through the wizard on a configured deployment with <strong>nothing
stubbed</strong>: a real reservation, a real managed call, a real outcome and a real ledger row.
The composed document was saved and the screenshots taken BEFORE any assertion ran, and there was
no retry - the two rules this file's own history bought. The frames below are that saved document
re-rendered transparent.</p>
<section class="design pro hosted">
  <h2>hosted · ${esc(hostedRun.ledger?.id ?? 'run')}</h2>
  <div class="frames">${[
    frameFigure(`${rel}/hosted.hold.png`, 'settled hold', ''),
    frameFigure(`${rel}/hosted.stress.png`, 'stress text', ''),
  ].join('')}</div>
  <h4>and the product surface it was made on</h4>
  <div class="frames">${frameFigure(`${rel}/step-5-result.png`, 'the wizard at the moment it finished', '', true)}</div>
  <div class="cols"><div class="col wide"><dl class="measure">${facts
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div></div>
</section>`;
}

const markLead = sweeps.length
  ? `<p class="lead"><strong>${designIds.length} mark-capable lower thirds</strong>, each rendered `
    + `bare and then carrying ${sweeps.map((s) => esc(s.mark)).join(' and ')}. `
    + `A square and a portrait mark fail differently and the sweep only ever rendered the square one, `
    + `which is why two of these read clean for so long.</p>`
  : '';

const page = `<!doctype html><meta charset="utf-8">
<title>NoaCG Pro - the evidence page</title>
<style>
:root{--bg:#101216;--ink:#e8e9ec;--dim:#9aa0ab;--line:#2a2d34;--accent:#f6a623}
body{background:var(--bg);color:var(--ink);font:14px/1.55 system-ui;margin:0;padding:0 24px 80px}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);
  padding:14px 0 12px;margin-bottom:8px;z-index:5}
h1{font-size:19px;margin:0 0 8px} h2{font-size:15px;margin:0 0 4px}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);margin:36px 0 4px}
h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);font-weight:600;margin:14px 0 6px}
h5{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dim);margin:0 0 4px}
.lead{color:var(--dim);max-width:88ch;margin:6px 0}
.muted{color:var(--dim);font-weight:400;text-transform:none;letter-spacing:0}
.tag{color:var(--accent);font-size:11px;letter-spacing:.06em}
.design{border-top:1px solid var(--line);padding-top:16px;margin-top:26px}
.frames{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start}
figure{margin:0}
figcaption{color:var(--dim);font-size:11px;margin-top:3px}
/* The plate IS the backdrop: the frame is a transparent PNG laid over it, so switching the
   backdrop switches what every graphic on the page is being judged against. */
.plate{width:520px;aspect-ratio:16/9;background:#000;border:1px solid var(--line);overflow:hidden}
.plate img{width:100%;height:100%;display:block;transform-origin:4% 92%}
/* ZOOM keeps the same frame and the same backdrop and simply magnifies the corner the graphic
   sits in, so a detail read and a full-frame read are the same picture rather than two captures
   that could disagree. */
body[data-zoom="2"] .plate img{transform:scale(2)}
body[data-zoom="3"] .plate img{transform:scale(3)}
.plate.empty{display:flex;align-items:center;justify-content:center;color:var(--dim);font-size:12px}
/* An opaque capture keeps its own ground under every backdrop setting - see frameFigure. */
body .plate.flat{background:#333}
.cols{display:flex;gap:26px;flex-wrap:wrap;margin-top:10px}
.col{min-width:280px} .col.wide{max-width:1100px}
dl.measure{display:grid;grid-template-columns:auto 1fr;gap:1px 12px;margin:0;font-size:12px}
dl.measure dt{color:var(--dim)} dl.measure dd{margin:0;font-variant-numeric:tabular-nums}
.brief{max-width:88ch;color:var(--ink);margin:2px 0 8px}
label{color:var(--dim);font-size:12px;margin-right:14px}
select,input{background:#1a1d23;color:var(--ink);border:1px solid var(--line);padding:3px 6px;font:12px system-ui}
/* ── The backdrops. CSS, not footage - the page says so above. ────────────────────────── */
body[data-bd="studio"] .plate{background:
  radial-gradient(60% 70% at 72% 28%, #1d3554 0%, transparent 60%),
  radial-gradient(50% 60% at 20% 78%, #123028 0%, transparent 62%),
  radial-gradient(70% 90% at 50% 50%, #10151c 0%, #070a0e 100%)}
body[data-bd="daylight"] .plate{background:
  radial-gradient(40% 50% at 62% 12%, #ffffff 0%, rgba(255,255,255,0) 70%),
  linear-gradient(#cfe3f5 0%, #eef3f7 46%, #d9d2c4 62%, #b9ae99 100%)}
body[data-bd="busy"] .plate{background:
  repeating-linear-gradient(58deg, rgba(255,255,255,.10) 0 6px, rgba(0,0,0,.10) 6px 13px),
  repeating-linear-gradient(-32deg, rgba(255,255,255,.07) 0 9px, rgba(0,0,0,.09) 9px 19px),
  linear-gradient(120deg, #6d7f6a 0%, #8a7f63 40%, #4d5666 100%)}
body[data-bd="checker"] .plate{background:
  conic-gradient(#3a3f47 0 25%, #23262c 0 50%, #3a3f47 0 75%, #23262c 0) 0 0/48px 48px}
body[data-bd="black"] .plate{background:#000}
body[data-bd="white"] .plate{background:#fff}
body[data-only="1"] .design:not(.headline):not(.pro){display:none}
</style>
<body data-bd="studio">
<header>
  <h1>NoaCG Pro - the evidence page</h1>
  <label>backdrop
    <select id="bd">
      <option value="studio">studio (dark)</option>
      <option value="daylight">daylight (blown out)</option>
      <option value="busy">busy mid-tone</option>
      <option value="checker">checkerboard (shows the alpha)</option>
      <option value="black">black</option>
      <option value="white">white</option>
    </select>
  </label>
  <label>zoom
    <select id="zoom">
      <option value="">whole 1920x1080 frame</option>
      <option value="2">2x on the graphic</option>
      <option value="3">3x on the graphic</option>
    </select>
  </label>
  <label><input type="checkbox" id="only"> only the six designs that changed</label>
  <label>frame width <input type="range" id="w" min="380" max="1200" step="20" value="520"></label>
</header>

<p class="lead">Every frame here was captured at <strong>1920x1080 with its alpha intact</strong> and
is composited over the backdrop chosen above. The backdrops are drawn by this page in CSS - they
stand in for footage, they are not footage, so read them for contrast rather than as a real shot.
Nothing on this page carries a verdict: the measurement beside each picture is raw, and what it
means is yours to say.</p>

<h3>The marked straps</h3>
${markLead}
${markSection || '<p class="lead">No mark sweep on disk yet.</p>'}

${hostedSection}

${proSection ? `<h3>NoaCG Pro - Phase A generations</h3>\n${proLead}\n${proSection}` : ''}

<script>
var body = document.body;
document.getElementById('bd').onchange = function (e) { body.dataset.bd = e.target.value; };
document.getElementById('zoom').onchange = function (e) { body.dataset.zoom = e.target.value; };
document.getElementById('only').onchange = function (e) { body.dataset.only = e.target.checked ? '1' : ''; };
document.getElementById('w').oninput = function (e) {
  document.querySelectorAll('.plate').forEach(function (p) { p.style.width = e.target.value + 'px'; });
};
</script>
`;

await writeFile(OUT, page);
console.log(`Review page: ${OUT}`);
console.log(`  ${designIds.length} design(s) from ${sweeps.length} mark sweep(s)`
  + `${PRO_DIR ? `, plus the Pro round in ${path.basename(PRO_DIR)}` : ''}.`);
