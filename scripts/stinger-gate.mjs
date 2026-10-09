#!/usr/bin/env node
// THE STINGER GATES (docs/NOACG_VIDEO_PLAN.md §2.2 / §4.2), measured on real rendered pixels.
//
// Three things kill a stinger on air and none of them is visible in a still:
//   1. the first or last frame is not fully transparent, so the graphic pops on or off the
//      live picture instead of appearing out of it;
//   2. the frame is not covered on some frame of the declared cut window, so the outgoing
//      feed flashes through the transition it exists to hide;
//   3. the timeline outlives the last rendered frame, so the exit is still playing when the
//      clip ends.
//
// The in-page geometry check on the review rig hit-tests boxes, which cannot see a hairline
// seam or a fading edge. This drives a real browser, seeks the composition's own paused
// timeline exactly as the renderer does, screenshots every frame WITH ALPHA, and measures the
// alpha plane PER PIXEL - never an average, because an average passes a one-pixel transparent
// seam down the middle of the frame and that seam is visible on air.
//
// It shares its measurement with scripts/stinger-teardown.mjs, which reads commercial clips:
// our stingers are judged by the same instrument as the ones people buy
// (benchmarks/video/v1/STINGER-REFERENCE-TEARDOWN.md).
//
// Usage:
//   node scripts/stinger-gate.mjs                 # every corpus stinger at 50 fps
//   node scripts/stinger-gate.mjs --fps 25        # a different delivery standard
//   node scripts/stinger-gate.mjs --only ink-sweep
//   node scripts/stinger-gate.mjs --mark the-ledger --keep-frames
//   node scripts/stinger-gate.mjs --mp4        # + an on-air clip and a clean clip per stinger
//
// Exit code 1 if any gate fails. Needs ffmpeg; spends no tokens and reaches no network.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import {
  alphaStats, buildSheet, isAirablyCovered, isClear, isFullyOpaque, longestRun, pct,
} from './lib/stingerAlpha.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS = path.join(ROOT, 'src/ai/video/corpus/stingers');
const PAGES = path.join(ROOT, 'stinger-review-out');
const OUT = path.join(ROOT, 'stinger-gate-out');
const W = 1920, H = 1080;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const FPS = Number(arg('fps', '50'));
const ONLY = arg('only');
const MARK = arg('mark');
const KEEP = has('keep-frames');
const MP4 = has('mp4');

/** Pre-roll and post-roll around the stinger in the on-air clip, in seconds. */
const PRE = 0.7, POST = 1.3;

/**
 * Two MP4s per stinger, because they answer different questions.
 *
 * `-oncut.mp4` is THE TEST: the graphic keyed over MOVING footage, with the programme cut from
 * one source to a visibly different one at exactly the Trigger Point we tell the operator to
 * set. If the cut is hidden, the stinger works; if you can see it, the cover window is wrong
 * no matter what the gate says. Two synthetic sources rather than real footage - they are
 * deterministic, carry no licence, and being obviously different is the whole point: a cut
 * that survives THESE is hidden behind anything.
 *
 * `-alpha.mp4` is the graphic alone over a checkerboard, for judging the motion itself without
 * a background arguing with it.
 *
 * Both are browser captures, one screenshot per frame off the composition's own paused
 * timeline - the same seek-per-frame model the render worker uses, but NOT the production
 * render path. Verifying that path is its own item.
 */
function renderMp4s(seq, id, fps, frames, triggerFrame) {
  const dur = frames / fps;
  const tc = (PRE + triggerFrame / fps).toFixed(4);
  const total = (PRE + dur + POST).toFixed(4);
  const outCut = path.join(OUT, `${id}-oncut.mp4`);
  const outAlpha = path.join(OUT, `${id}-alpha.mp4`);

  // TWO PASSES, NOT ONE GRAPH. Building the programme and compositing the graphic onto it in a
  // single filter graph DEADLOCKS: `concat` will not pull from its second segment until the
  // first is exhausted, so the second source's frames pile up while `overlay` waits on the
  // first - measured running for 100 seconds on a four second clip and producing nothing. Each
  // half on its own finishes in about two seconds.
  //
  // Both programme sources are cheap on purpose. mandelbrot at 1080p50 was the first choice and
  // it ate a gigabyte of memory without finishing; testsrc2 and gradients render in real time
  // and differ enough in brightness and colour that an exposed cut is impossible to miss.
  const prog = path.join(OUT, `_prog-${id}.mp4`);
  const passes = [
    ['ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${fps}:duration=${total}`,
      '-f', 'lavfi', '-i',
      `gradients=size=${W}x${H}:rate=${fps}:duration=${total}:c0=0x0B3D2E:c1=0x8FA9C4:x0=200:y0=120:x1=1700:y1=980:speed=0.04`,
      '-filter_complex',
      `[0:v]trim=0:${tc},setpts=PTS-STARTPTS[a];` +
      `[1:v]trim=${tc}:${total},setpts=PTS-STARTPTS[b];` +
      `[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-t', total, prog]],
    // tpad and NOT setpts on the graphic: shifting an overlay's timestamps forward makes
    // `overlay` hold every main frame until the overlay stream produces its first, buffering
    // the whole programme in RGBA. Padding with real transparent frames keeps both streams
    // starting at zero and running the same length.
    ['ffmpeg', ['-v', 'error', '-y', '-i', prog, '-framerate', String(fps), '-i', seq,
      '-filter_complex',
      `[1:v]format=rgba,tpad=start_duration=${PRE}:start_mode=add:color=0x00000000` +
      `:stop_duration=${POST}:stop_mode=add[gfx];` +
      `[0:v][gfx]overlay=format=auto,format=yuv420p[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-t', total, outCut]],
    // The graphic alone over a checkerboard, so transparency reads as transparency.
    ['ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=0x2A2F38:size=${W}x${H}:rate=${fps}:duration=${total}`,
      '-framerate', String(fps), '-i', seq,
      '-filter_complex',
      `[0:v]drawgrid=w=80:h=80:t=fill:c=0x3A404B@1[bg];` +
      `[1:v]format=rgba,tpad=start_duration=${PRE}:start_mode=add:color=0x00000000` +
      `:stop_duration=${POST}:stop_mode=add[gfx];` +
      `[bg][gfx]overlay=format=auto,format=yuv420p[v]`,
      '-map', '[v]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-t', total, outAlpha]],
  ];

  const errors = [];
  for (const [bin, args] of passes) {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 120_000, windowsHide: true });
    if (r.status !== 0) errors.push((r.stderr || r.error?.message || 'timed out').trim().split('\n').pop());
  }
  fs.rmSync(prog, { force: true });
  return errors.length
    ? { oncut: `FAILED: ${errors[0]}`, alpha: `FAILED: ${errors[0]}` }
    : { oncut: outCut, alpha: outAlpha };
}

/** What the composition itself declares. The gate reads the SOURCE, never the page, so it
 *  cannot be fooled by a rig that decided its own window. */
function declaration(file) {
  const src = fs.readFileSync(file, 'utf8');
  const num = (attr) => {
    const m = new RegExp(`${attr}="([\\d.]+)"`).exec(src);
    return m ? Number(m[1]) : NaN;
  };
  return { duration: num('data-duration'), cutStart: num('data-cut-start'), cutEnd: num('data-cut-end') };
}

async function capture(page, url, frames, fps, dir) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__stingerSeek === 'function', null, { timeout: 15000 });
  // Fonts must be resolved before the first capture or the type moves between frames - the
  // render worker gates on document.fonts for exactly this reason.
  await page.evaluate(() => document.fonts && document.fonts.ready);
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.__stingerSeek(t), f / fps);
    await page.screenshot({
      path: path.join(dir, `f_${String(f + 1).padStart(4, '0')}.png`),
      clip: { x: 0, y: 0, width: W, height: H },
      omitBackground: true,
    });
  }
}

function verdicts(stats, decl, fps, frames) {
  const first = stats[0];
  const last = stats[stats.length - 1];
  const f0 = Math.ceil(decl.cutStart * fps);
  const f1 = Math.floor(decl.cutEnd * fps);
  const window = stats.slice(f0, f1 + 1);
  const worst = window.reduce((a, s, i) => (s.opaqueFrac < a.opaqueFrac ? { ...s, frame: f0 + i } : a),
    { ...window[0], frame: f0 });
  const uncovered = window.filter((s) => !isAirablyCovered(s)).length;
  const covered = longestRun(stats, isAirablyCovered);
  const strict = longestRun(stats, isFullyOpaque);

  return {
    head: {
      pass: isClear(first),
      detail: isClear(first) ? 'frame 0 fully transparent'
        : `frame 0 paints ${pct(1 - first.clearFrac)} of the frame (mean alpha ${first.meanAlpha.toFixed(3)})`,
    },
    tail: {
      pass: isClear(last),
      detail: isClear(last) ? `frame ${frames - 1} fully transparent`
        : `frame ${frames - 1} paints ${pct(1 - last.clearFrac)} of the frame (mean alpha ${last.meanAlpha.toFixed(3)})`,
    },
    coverage: {
      pass: uncovered === 0 && window.length > 0,
      detail: window.length === 0 ? 'declared window contains no frames'
        : uncovered === 0
          ? `frames ${f0}-${f1} all covered (worst frame ${worst.frame}: ${worst.borderGaps} border px soft, 0 interior)`
          : `${uncovered} of ${window.length} declared frames not covered; worst is frame ${worst.frame} at ` +
            `${(worst.opaqueFrac * 100).toFixed(3)}% opaque with ${worst.interiorGaps} interior gaps`,
    },
    duration: {
      // The renderer seeks frames 0..N-1, so the last one is (N-1)/fps and NOT the declared
      // duration. An exit that finishes at the declared duration still paints on it.
      pass: decl.duration * fps >= frames - 0.001,
      detail: `declared ${decl.duration.toFixed(2)} s, last frame at ${((frames - 1) / fps).toFixed(3)} s`,
    },
    measured: {
      airableCover: covered && { start: covered.start, end: covered.end, frames: covered.len },
      strictCover: strict && { start: strict.start, end: strict.end, frames: strict.len },
      declaredWindow: [f0, f1],
      atem: { clipDuration: frames, triggerPoint: f0 + 2, maxMixRate: f1 - f0 + 1 },
    },
  };
}

async function main() {
  // Build the pages the capture loads, so one command is enough and the gate can never run
  // against a stale rig.
  const built = spawnSync(process.execPath, [path.join(ROOT, 'scripts/stinger-review.mjs')], { encoding: 'utf8', windowsHide: true });
  if (built.status !== 0) throw new Error(`review build failed: ${built.stderr}`);

  const files = fs.readdirSync(CORPUS).filter((f) => f.endsWith('.html')).sort()
    .filter((f) => !ONLY || f.startsWith(ONLY));
  if (files.length === 0) throw new Error(ONLY ? `no corpus stinger matching "${ONLY}"` : `no compositions in ${CORPUS}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const report = [];
  let failures = 0;

  try {
    for (const file of files) {
      const id = file.replace(/\.html$/, '');
      const decl = declaration(path.join(CORPUS, file));
      const frames = Math.round(decl.duration * FPS);
      const dir = path.join(OUT, `frames-${id}`);
      fs.mkdirSync(dir, { recursive: true });

      const url = new URL(pathToFileURL(path.join(PAGES, `${id}.html`)));
      url.searchParams.set('bare', '1');
      if (MARK) url.searchParams.set('mark', MARK);

      process.stdout.write(`${id} (${frames}f @ ${FPS}fps) capturing ... `);
      await capture(page, url.href, frames, FPS, dir);

      const seq = path.join(dir, 'f_%04d.png');
      const stats = await alphaStats(seq, W, H, ['-framerate', String(FPS)]);
      if (stats.length !== frames) {
        throw new Error(`${id}: captured ${frames} frames but measured ${stats.length}`);
      }
      const v = verdicts(stats, decl, FPS, frames);
      const failed = ['head', 'tail', 'coverage', 'duration'].filter((k) => !v[k].pass);
      failures += failed.length;
      console.log(failed.length ? `FAIL (${failed.join(', ')})` : 'pass');
      for (const k of ['head', 'tail', 'coverage', 'duration']) {
        console.log(`    ${v[k].pass ? 'PASS' : 'FAIL'}  ${v[k].detail}`);
      }

      // The frame strip a human reviews: entrance, both edges of the window, the settled
      // middle, the exit. Motion still gets judged from a rendered MP4, never from stills.
      const w = v.measured.declaredWindow;
      const idx = [...new Set([0, Math.max(0, w[0] - 2), w[0], Math.round((w[0] + w[1]) / 2), w[1],
        Math.min(frames - 1, w[1] + 2), frames - 1])].sort((a, b) => a - b);
      buildSheet({ input: seq, out: path.join(OUT, `${id}-edges.png`), width: W, height: H,
        selectExpr: idx.map((n) => `eq(n\\,${n})`).join('+'), cellW: 300, cols: idx.length, rows: 1,
        tmpRoot: OUT, inputArgs: ['-framerate', String(FPS)] });
      buildSheet({ input: seq, out: path.join(OUT, `${id}-sheet.png`), width: W, height: H,
        selectExpr: `not(mod(n\\,${Math.max(1, Math.floor(frames / 12))}))`, cellW: 360, cols: 6,
        tmpRoot: OUT, inputArgs: ['-framerate', String(FPS)] });

      // MP4s last, while the captured frames are still on disk: motion is judged from a
      // rendered clip and never from stills or a scrubbed pane (plan §4.1).
      if (MP4) {
        const m = renderMp4s(seq, id, FPS, frames, v.measured.atem.triggerPoint);
        console.log(`    mp4  ${path.basename(m.oncut)}  ${path.basename(m.alpha)}`);
      }

      fs.writeFileSync(path.join(OUT, `${id}-alpha.json`), JSON.stringify(
        stats.map((s) => ({ ...s, opaqueFrac: +s.opaqueFrac.toFixed(6), clearFrac: +s.clearFrac.toFixed(6), meanAlpha: +s.meanAlpha.toFixed(6) }))));
      report.push({ id, fps: FPS, frames, declared: decl, ...v });
      if (!KEEP) fs.rmSync(dir, { recursive: true, force: true });
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`\n${report.length} stingers, ${failures} failed gate${failures === 1 ? '' : 's'} -> ${OUT}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
