// Per-pixel alpha measurement and contact sheets, shared by the reference teardown
// (scripts/stinger-teardown.mjs, which reads commercial clips) and the gate
// (scripts/stinger-gate.mjs, which reads our own rendered frames).
//
// ONE implementation on purpose: the whole value of the teardown is that our stingers are
// judged by the same instrument as the ones people buy. Two copies of "is this frame covered"
// is how the corpus comes to pass a gate the market would fail, or the reverse.
//
// Everything here needs ffmpeg + ffprobe on PATH and touches no network.

import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

/** Alpha at or above this counts as opaque; at or below, as clear. 12-bit ProRes alpha
 *  round-trips through 8-bit gray with a little rounding slop, and a count that is one step
 *  off is a measurement artifact rather than a hole in the graphic. */
export const OPAQUE = 254;
export const CLEAR = 1;

/** How wide a border counts as "the edge of the frame" when deciding whether a near-miss is
 *  edge softness or a real hole. Two pixels: enough for one antialiased boundary, not enough
 *  to hide anything a viewer would see. */
export const BORDER_PX = 2;

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,pix_fmt,width,height,r_frame_rate,nb_frames,duration', '-of', 'json', file],
    { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr}`);
  const s = JSON.parse(r.stdout).streams[0];
  const [num, den] = String(s.r_frame_rate).split('/').map(Number);
  const pix = String(s.pix_fmt);
  return {
    codec: s.codec_name,
    pixFmt: pix,
    width: Number(s.width),
    height: Number(s.height),
    fps: den ? num / den : num,
    frames: Number(s.nb_frames) || null,
    duration: Number(s.duration) || null,
    // yuva*/rgba/bgra/argb/gbrap all carry alpha; yuv*/rgb* do not.
    hasAlpha: /^(yuva|rgba|bgra|argb|abgr|gbrap|ya)/.test(pix),
  };
}

/**
 * Per-frame alpha statistics at FULL resolution, for any ffmpeg-readable input - a movie file
 * or an image sequence pattern like `frame-%04d.png`.
 *
 * Nothing is scaled. A hole one pixel wide is exactly the defect this exists to see, and any
 * downscale averages it away - which is the same reason docs/NOACG_VIDEO_PLAN.md §2.2 says the
 * coverage gate measures per pixel and never an average.
 */
export function alphaStats(input, width, height, extraInputArgs = []) {
  return new Promise((resolve, reject) => {
    const frameBytes = width * height;
    // format=rgba FIRST is load-bearing for image sequences: a screenshot of a fully
    // transparent frame is encoded as a smaller PNG type than a busy one, so the demuxer
    // changes pixel format mid-stream and the filter graph refuses to reinitialise. Measured
    // it stopping after 8 of 100 frames and reporting no error the caller could see - which
    // would have read as "the composition is 8 frames long".
    const ff = spawn('ffmpeg', ['-v', 'error', ...extraInputArgs, '-i', input,
      '-vf', 'format=rgba,alphaextract,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { windowsHide: true });
    const frames = [];
    let buf = Buffer.alloc(0);
    const consume = () => {
      while (buf.length >= frameBytes) {
        const f = buf.subarray(0, frameBytes);
        let min = 255, opaque = 0, clear = 0, sum = 0;
        for (let i = 0; i < frameBytes; i++) {
          const v = f[i];
          if (v < min) min = v;
          if (v >= OPAQUE) opaque++;
          else if (v <= CLEAR) clear++;
          sum += v;
        }
        // WHERE the non-opaque pixels sit matters more than how many: a few hundred along the
        // outer border is edge softness nobody sees on air, and the same count in the interior
        // is a hole the outgoing feed flashes through. Only computed when it can decide
        // something - a frame that is 40% covered is not a near-miss worth locating.
        let borderGaps = 0, interiorGaps = 0;
        if (opaque / frameBytes > 0.99) {
          for (let y = 0; y < height; y++) {
            const row = y * width;
            const edgeRow = y < BORDER_PX || y >= height - BORDER_PX;
            for (let x = 0; x < width; x++) {
              if (f[row + x] >= OPAQUE) continue;
              if (edgeRow || x < BORDER_PX || x >= width - BORDER_PX) borderGaps++;
              else interiorGaps++;
            }
          }
        }
        frames.push({
          min,
          opaqueFrac: opaque / frameBytes,
          clearFrac: clear / frameBytes,
          meanAlpha: sum / frameBytes / 255,
          borderGaps,
          interiorGaps,
        });
        buf = buf.subarray(frameBytes);
      }
    };
    ff.stdout.on('data', (d) => { buf = Buffer.concat([buf, d]); consume(); });
    let err = '';
    ff.stderr.on('data', (d) => { err += d; });
    ff.on('error', reject);
    ff.on('close', (code) => (frames.length ? resolve(frames)
      : reject(new Error(`ffmpeg produced no frames (exit ${code}): ${err.trim().split('\n').pop() ?? ''}`))));
  });
}

/** Every pixel clear - the empty-frame test. */
export const isClear = (f) => f.clearFrac === 1;
/** Literally every pixel opaque. */
export const isFullyOpaque = (f) => f.opaqueFrac === 1;
/**
 * The AIRABLE definition of covered, which is not the same as the literal one: a stinger that
 * is opaque everywhere except a hairline along the outer frame border hides a cut perfectly,
 * and demanding literal 100% rejects clips that are demonstrably fine on air. Anything in the
 * INTERIOR is a real hole and disqualifies the frame.
 */
export const isAirablyCovered = (f) => f.interiorGaps === 0 && f.opaqueFrac > 0.99;

/** The longest run of consecutive frames satisfying pred, as {start,end,len} or null. */
export function longestRun(frames, pred) {
  let best = null, start = -1;
  for (let i = 0; i <= frames.length; i++) {
    const ok = i < frames.length && pred(frames[i]);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      const run = { start, end: i - 1, len: i - start };
      if (!best || run.len > best.len) best = run;
      start = -1;
    }
  }
  return best;
}

export function leadingRun(frames, pred) { let n = 0; while (n < frames.length && pred(frames[n])) n++; return n; }
export function trailingRun(frames, pred) { let n = 0; while (n < frames.length && pred(frames[frames.length - 1 - n])) n++; return n; }

/**
 * Build one contact sheet from the frames a select expression picks, composited over a mid grey.
 *
 * THREE PASSES ON PURPOSE. Compositing a transparent clip straight onto a `color` source in one
 * filter graph looks right and is not: `color` runs at its own frame rate, so `overlay` pairs
 * the first video frame with a dozen background frames and `tile` collects a dozen copies of it.
 * The first version of this did exactly that and produced sheets of flat grey - which reads as
 * "the clip is empty", the most expensive wrong answer available here. Extracting real PNGs,
 * tiling them, then flattening the finished sheet once removes every timing question: the last
 * step composites a single image over a single image.
 */
export function buildSheet({ input, out, width, height, selectExpr, cellW = 360, cols = 6, rows = null, tmpRoot, inputArgs = [] }) {
  const cellH = Math.round((cellW * height) / width);
  const tmp = fs.mkdtempSync(path.join(tmpRoot, 'frames-'));
  try {
    const a = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inputArgs, '-i', input,
      '-vf', `format=rgba,select='${selectExpr}',scale=${cellW}:${cellH}`, '-vsync', '0',
      path.join(tmp, 'f_%04d.png')], { encoding: 'utf8', windowsHide: true });
    if (a.status !== 0) return { ok: false, error: (a.stderr || '').trim().split('\n').pop() };
    const got = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).length;
    if (got === 0) return { ok: false, error: 'no frames selected' };

    const tiled = path.join(tmp, 'tiled.png');
    const b = spawnSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '10',
      '-i', path.join(tmp, 'f_%04d.png'),
      '-vf', `tile=${cols}x${rows ?? Math.ceil(got / cols)}:margin=6:padding=4:color=0x00000000`,
      '-frames:v', '1', tiled], { encoding: 'utf8', windowsHide: true });
    if (b.status !== 0) return { ok: false, error: (b.stderr || '').trim().split('\n').pop() };

    // Flatten over a mid grey, so transparent regions read AS transparent rather than as
    // whatever the viewer's own background happens to be.
    const size = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height', '-of', 'csv=p=0', tiled], { encoding: 'utf8', windowsHide: true });
    const [tw, th] = size.stdout.trim().split(',').map(Number);
    const c = spawnSync('ffmpeg', ['-v', 'error', '-y',
      '-f', 'lavfi', '-i', `color=c=0x6E6E6E:s=${tw}x${th}`, '-i', tiled,
      '-filter_complex', '[0:v][1:v]overlay=format=auto', '-frames:v', '1', out], { encoding: 'utf8', windowsHide: true });
    if (c.status !== 0) return { ok: false, error: (c.stderr || '').trim().split('\n').pop() };
    return { ok: true, frames: got };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export const pct = (n) => `${(n * 100).toFixed(1)}%`;
