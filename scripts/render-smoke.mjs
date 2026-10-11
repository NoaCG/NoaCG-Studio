// Full-loop render smoke test against the RUNNING dev server: build a tiny real manifest
// in-page, POST /api/render/start, poll /api/render/status to completion, download the
// file, verify it. Exercises the exact modules production deploys (handlers + executor +
// worker) with the local executor — no Vercel, no Supabase, so it costs CPU and nothing else.
//
// Four jobs: an html-kind render, a kind:'remotion' render, a png-still whose PIXELS must
// contain the fixture's orange dot, and a throwing module that must fail with a real message.
// The dot phase is the only one that looks at what was actually drawn; the others can only
// tell you a job finished, which is not the same claim.
//
//   node scripts/render-smoke.mjs            (dev server must be running)

import { chromium } from '@playwright/test';
import { devPort } from './dev-port.mjs';
import {
  BACKDROP_RGB,
  DOT_DISPLAY_PX,
  DOT_RGB,
  dotOpacityAt,
  dotRenderedRgbAt,
  rgbHex,
} from './render-fixture-dot.mjs';
import { decodePng, findPixelsNear } from './png-decode.mjs';

const BASE = `http://localhost:${devPort()}`;
const fail = (msg) => { console.error('SMOKE FAIL:', msg); process.exit(1); };

// 1) A small, fast manifest from a real catalog template. Scale must stay 1: layout is
//    authored at template resolution, so a short duration is what keeps this quick.
//
//    THE TOTAL MUST EXCEED THE TEMPLATE'S MEASURED FIXED ANIMATION TIME, or the renderer
//    refuses the job outright — "unrenderable timing" — and the smoke never reaches the
//    phases below it. A hardcoded total rots the moment the design's motion grows: 2000 ms
//    sat here while lt01's in+out reached 2.1 s, which left the whole script red at its
//    first job. So the total is DERIVED from the measurement the manifest already carries
//    (`estimatedDurations`, the same numbers the refusal message quotes), and only the HOLD
//    margin is a constant.
/** How much HOLD to add on top of the measured animation time - the whole of the extra render. */
const HOLD_MARGIN_MS = 1000;

const browser = await chromium.launch();
let manifest;
try {
  const page = await browser.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  manifest = await page.evaluate(async (holdMarginMs) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const v = Object.values(CATALOG).flat().find((x) => x.id === 'lt01');
    const tpl = v.create();
    const data = {};
    for (const f of tpl.fields) data[f.field] = f.value;
    const { buildRenderManifest } = await import('/src/render/buildManifest.ts');
    const options = { format: 'mp4', totalDurationMs: holdMarginMs, epochMs: 0 };
    const { manifest: built, measured } = await buildRenderManifest(tpl, data, options);
    // The manifest carries no baked schedule — the renderer builds it from `timing` plus these
    // same measured durations — so raising the total in place is exactly a rebuild at the
    // longer duration, without measuring the document twice.
    const fixedMs = measured.inMs + measured.stepMs.reduce((a, b) => a + b, 0) + measured.outMs;
    built.timing.totalDurationMs = Math.ceil(fixedMs) + holdMarginMs;
    return built;
  }, HOLD_MARGIN_MS);
} finally {
  await browser.close();
}
console.log(`manifest: ${manifest.projectName} ${manifest.output.format} ${(manifest.documentHtml.length / 1024).toFixed(0)} kB doc`);

// 2) start
const startRes = await fetch(`${BASE}/api/render/start`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ manifest }),
});
if (startRes.status !== 202) fail(`start -> ${startRes.status}: ${await startRes.text()}`);
const { jobId, jobToken, pollIntervalMs, totalFrames } = await startRes.json();
console.log(`job ${jobId} started (${totalFrames} frames)`);

// 3) poll to terminal
const t0 = Date.now();
let status;
for (;;) {
  if (Date.now() - t0 > 5 * 60_000) fail('timed out after 5 minutes');
  await new Promise((r) => setTimeout(r, pollIntervalMs));
  const res = await fetch(`${BASE}/api/render/status?id=${jobId}`, {
    headers: { authorization: `Bearer ${jobToken}` },
  });
  if (!res.ok) fail(`status -> ${res.status}: ${await res.text()}`);
  status = await res.json();
  console.log(`  ${status.state} ${status.percent}%` +
    (status.frames ? ` (${status.frames.rendered}/${status.frames.total})` : ''));
  if (['complete', 'failed', 'cancelled', 'expired'].includes(status.state)) break;
}
if (status.state !== 'complete') fail(`terminal state ${status.state}: ${JSON.stringify(status.error)}`);
if (!status.output?.url) fail('complete but no output url');

// 4) download and sanity-check the file
const dl = await fetch(`${BASE}${status.output.url}&token=${jobToken}`);
if (!dl.ok) fail(`download -> ${dl.status}`);
const buf = Buffer.from(await dl.arrayBuffer());
if (buf.byteLength < 10_000) fail(`file suspiciously small: ${buf.byteLength} bytes`);
if (buf.byteLength !== status.output.bytes) fail(`size mismatch: ${buf.byteLength} != ${status.output.bytes}`);
// MP4 sniff: 'ftyp' at offset 4.
if (buf.subarray(4, 8).toString('ascii') !== 'ftyp') fail('downloaded file is not an MP4');

// 5) wrong-token probes must 404
const bad = await fetch(`${BASE}/api/render/status?id=${jobId}`, { headers: { authorization: 'Bearer nope' } });
if (bad.status !== 404) fail(`bad token -> ${bad.status}, expected 404`);

console.log(`html-kind PASS: ${buf.byteLength} bytes in ${((Date.now() - t0) / 1000).toFixed(1)}s, token gating OK`);

// ── Phase 2: kind:'remotion' — an authored composition module through the same service ──

const { execFileSync } = await import('node:child_process');
const { readFileSync, mkdirSync } = await import('node:fs');
mkdirSync('.render-dev', { recursive: true });
execFileSync('node', ['scripts/make-remotion-manifest.mjs', '.render-dev/smoke-remotion.json', '40', 'mp4'], { windowsHide: true });
const remotionManifest = JSON.parse(readFileSync('.render-dev/smoke-remotion.json', 'utf8'));

// The smoke submits 4 jobs total but the anonymous quota is 2/h - give each phase-2 job
// its own synthetic principal (ipHash reads x-forwarded-for; fine against the local dev
// server, which is the only place this script runs).
let smokeIp = 0;
const runJob = async (manifestBody) => {
  const res = await fetch(`${BASE}/api/render/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.99.0.${++smokeIp}` },
    body: JSON.stringify({ manifest: manifestBody }),
  });
  if (res.status !== 202) fail(`remotion start -> ${res.status}: ${await res.text()}`);
  const started = await res.json();
  const begun = Date.now();
  for (;;) {
    if (Date.now() - begun > 5 * 60_000) fail('remotion job timed out after 5 minutes');
    await new Promise((r) => setTimeout(r, started.pollIntervalMs));
    const s = await fetch(`${BASE}/api/render/status?id=${started.jobId}`, {
      headers: { authorization: `Bearer ${started.jobToken}` },
    });
    if (!s.ok) fail(`remotion status -> ${s.status}`);
    const st = await s.json();
    if (['complete', 'failed', 'cancelled', 'expired'].includes(st.state)) return { status: st, jobToken: started.jobToken };
  }
};

const rem = await runJob(remotionManifest);
if (rem.status.state !== 'complete') fail(`remotion terminal state ${rem.status.state}: ${JSON.stringify(rem.status.error)}`);
const remDl = await fetch(`${BASE}${rem.status.output.url}&token=${rem.jobToken}`);
const remBuf = Buffer.from(await remDl.arrayBuffer());
if (remBuf.subarray(4, 8).toString('ascii') !== 'ftyp') fail('remotion output is not an MP4');
console.log(`remotion-kind PASS: ${remBuf.byteLength} bytes`);

// ── Phase 3: THE ORANGE DOT — the image must be in the rendered PIXELS ─────────────────
//
// The phases above assert that jobs COMPLETE and that the bytes look like the container they
// claim to be. That is exactly what let the image leg pass while proving nothing: the fixture
// was a malformed PNG, every reader in the chain drew whatever fell out, and no check ever
// looked at a pixel. `render-fixture.test.mjs` now proves the fixture is a picture, for free,
// on every build. THIS proves the picture survives manifest -> asset delivery -> render.
//
// A still, not the MP4, because a PNG is decodable here with zlib alone - no ffmpeg, no video
// decoder, nothing this script does not already need. It is also the cheapest render in the
// service: one frame.
const stillManifest = { ...remotionManifest, output: { format: 'png-still' } };
const still = await runJob(stillManifest);
if (still.status.state !== 'complete') {
  fail(`png-still terminal state ${still.status.state}: ${JSON.stringify(still.status.error)}`);
}
if (!still.status.output?.url) fail('png-still complete but no output url');
const stillDl = await fetch(`${BASE}${still.status.output.url}&token=${still.jobToken}`);
if (!stillDl.ok) fail(`png-still download -> ${stillDl.status}`);
const stillPng = decodePng(Buffer.from(await stillDl.arrayBuffer()));
if (stillPng.width !== remotionManifest.width || stillPng.height !== remotionManifest.height) {
  fail(`still is ${stillPng.width}x${stillPng.height}, expected ${remotionManifest.width}x${remotionManifest.height}`);
}

// What the dot must look like WHERE IT LANDS. `png-still` renders the middle frame (see
// render-worker/render.mjs), and the fixture fades the image in across the composition, so the
// rendered colour is the fixture orange composited over the fixture backdrop at that frame's
// opacity. Every number comes from `render-fixture-dot.mjs`, which is also what the composition
// is built from - a size or a fade written down twice is a check that reports "the image never
// arrived" for a render that was perfectly fine.
const stillFrame = Math.round(remotionManifest.durationInFrames / 2);
const expectedDot = dotRenderedRgbAt(stillFrame, remotionManifest.durationInFrames);

// Require most of the image's pixels AND that they form a block of about its size, so a scatter
// of coincidentally-coloured pixels cannot stand in for a picture. The bar is a different hue
// entirely (FIXTURE_ACCENT), so no amount of its edge blending lands in this tolerance.
// Measured 2026-09-01: 2304/2304 pixels in a 48x48 block at (616,417) of a 1280x720 frame.
const DOT_PIXELS = DOT_DISPLAY_PX * DOT_DISPLAY_PX;
const dot = findPixelsNear(stillPng, expectedDot, 4);
const wanted =
  `${rgbHex(expectedDot)} (the fixture's ${rgbHex(DOT_RGB)} at opacity ` +
  `${dotOpacityAt(stillFrame, remotionManifest.durationInFrames).toFixed(2)} over ${rgbHex(BACKDROP_RGB)})`;
if (dot.count < DOT_PIXELS * 0.6) {
  fail(
    `the orange dot is NOT in the rendered frame: only ${dot.count} of ~${DOT_PIXELS} pixels match ` +
      `${wanted}. The image input or asset delivery dropped it - and the job still COMPLETED, ` +
      'which is why this check reads pixels instead of an exit code.',
  );
}
if (dot.box.width > DOT_DISPLAY_PX * 1.5 || dot.box.height > DOT_DISPLAY_PX * 1.5) {
  fail(
    `pixels matching ${wanted} are scattered over ${dot.box.width}x${dot.box.height}, not drawn as ` +
      `the ~${DOT_DISPLAY_PX}x${DOT_DISPLAY_PX} image - that is a coincidence, not the dot.`,
  );
}
console.log(
  `image-input PASS: ${dot.count}/${DOT_PIXELS} pixels of ${rgbHex(expectedDot)} in a ` +
    `${dot.box.width}x${dot.box.height} block at (${dot.box.minX},${dot.box.minY})`,
);

// A throwing module must FAIL the job with the real message (never hang or lie).
const broken = { ...remotionManifest, compiledJs: 'exports.default = function C(){ throw new Error("smoke boom"); };' };
const brk = await runJob(broken);
if (brk.status.state !== 'failed') fail(`broken module ended ${brk.status.state}, expected failed`);
if (!JSON.stringify(brk.status.error ?? {}).includes('boom') && !JSON.stringify(brk.status.error ?? {}).toLowerCase().includes('composition')) {
  fail(`broken module error lacks a useful message: ${JSON.stringify(brk.status.error)}`);
}
console.log('remotion failure-path PASS:', brk.status.error?.message?.slice(0, 80));

console.log('SMOKE PASS (html + remotion kinds, orange dot verified in the rendered pixels)');
