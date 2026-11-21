// READING A SOUND FILE: what is in it, how loud the part that airs is, and its waveform
// (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.1). Every job runs the Bridge's own ffmpeg or ffprobe
// (./tools.ts) as a child process, reports progress, and stops when its signal is aborted.
//
// WHAT IS MEASURED IS WHAT AIRS. CasparCG merges every audio track of a file, resamples to the
// channel's 48 kHz and places the merged channels by index into its output; it does not downmix.
// So the measurement does the same: each audio stream resampled to 48 kHz, all merged, and the
// first two channels kept as the stereo programme (a mono file is the left leg alone, as it airs).
// The part measured is exactly the committed trim, seeked by ffmpeg, so the loudness windows start
// where the clip starts on air.

import { spawn } from 'node:child_process';
import type { AudioTools } from './tools.js';

/** BS.1770 needs one 400 ms block; a shorter part has no integrated loudness. */
export const MIN_MEASURE_SECONDS = 0.4;
/** The rate CasparCG mixes at, and the rate the measurement runs at. */
export const PROGRAMME_RATE = 48000;
/** What the measurement takes as the programme: the merged channels 1 and 2. */
export const PROGRAMME_LAYOUT = 'stereo' as const;

export interface AudioStream {
  index: number;
  channels: number;
  rate: number;
  codec: string;
  layout?: string;
}

export interface ProbeResult {
  /** The file's length in seconds (the container's, which covers a video with no or short sound). */
  seconds: number | null;
  audio: AudioStream[];
}

export interface JobOptions {
  signal?: AbortSignal;
  /** 0 to 1, as the job goes. */
  onProgress?: (fraction: number) => void;
}

export type MeasureResult =
  | { kind: 'measured'; integrated: number; truePeak: number; seconds: number; layout: typeof PROGRAMME_LAYOUT }
  | { kind: 'silent'; seconds: number }
  | { kind: 'too-short'; seconds: number }
  | { kind: 'no-audio' };

export interface WaveformResult {
  seconds: number;
  /** Per bin, the lowest and highest sample across every channel, -1 to 1 (beyond 1 is clipped). */
  min: number[];
  max: number[];
  /** No audio stream: a flat line, and the duration still sets the handles' range. */
  silentFile?: true;
}

export class AudioJobError extends Error {
  constructor(message: string, readonly code: 'cancelled' | 'unreadable') {
    super(message);
  }
}

interface RunResult {
  stdout: Buffer;
  stderr: string;
}

function run(
  program: string,
  args: string[],
  opts: JobOptions & { onStdout?: (chunk: Buffer) => void } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AudioJobError('The job was cancelled.', 'cancelled'));
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out: Buffer[] = [];
    let err = '';
    const abort = () => child.kill();
    opts.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => (opts.onStdout ? opts.onStdout(chunk) : out.push(chunk)));
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
      // Long jobs log steadily; the reason ffmpeg stops is always near the end.
      if (err.length > 1_000_000) err = err.slice(-500_000);
    });
    child.on('error', (e) => {
      opts.signal?.removeEventListener('abort', abort);
      reject(new AudioJobError(`The Bridge could not start its audio reader: ${e.message}`, 'unreadable'));
    });
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', abort);
      if (opts.signal?.aborted) return reject(new AudioJobError('The job was cancelled.', 'cancelled'));
      if (code !== 0) return reject(new AudioJobError(lastError(err) ?? `the audio reader stopped with code ${code}`, 'unreadable'));
      resolve({ stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/** ffmpeg's last line that reads like a reason, for the operator. */
function lastError(stderr: string): string | null {
  const lines = stderr.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1].replace(/^\[[^\]]*\]\s*/, '') : null;
}

/**
 * CasparCG plays an audio stream only when its disposition is nothing or exactly "default"
 * (av_producer.cpp, 2.3.3 and 2.5.0): a commentary, dub or description track is left out, so it is
 * left out of the measurement and the waveform too.
 */
export function playsOnServer(disposition: Record<string, number> | undefined): boolean {
  return !disposition || Object.entries(disposition).every(([flag, on]) => !on || flag === 'default');
}

export async function probe(tools: AudioTools, file: string, opts: JobOptions = {}): Promise<ProbeResult> {
  await tools.verify();
  const { stdout } = await run(tools.ffprobe, ['-v', 'error', '-of', 'json', '-show_streams', '-show_format', '-i', asInput(file)], opts);
  const json = JSON.parse(stdout.toString('utf8')) as {
    streams?: { index: number; codec_type?: string; codec_name?: string; channels?: number; sample_rate?: string; channel_layout?: string; duration?: string; disposition?: Record<string, number> }[];
    format?: { duration?: string };
  };
  const audio = (json.streams ?? [])
    .filter((s) => s.codec_type === 'audio' && (s.channels ?? 0) > 0 && playsOnServer(s.disposition))
    .map((s) => ({ index: s.index, channels: s.channels ?? 0, rate: Number(s.sample_rate) || 0, codec: s.codec_name ?? 'unknown', ...(s.channel_layout ? { layout: s.channel_layout } : {}) }));
  const lengths = [json.format?.duration, ...(json.streams ?? []).map((s) => s.duration)].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return { seconds: lengths.length ? Math.max(...lengths) : null, audio };
}

/** ffmpeg's own default layout for a channel count, for a track that names none. */
const DEFAULT_LAYOUTS: Record<number, string> = { 1: 'mono', 2: 'stereo', 3: '2.1', 4: '4.0', 5: '5.0', 6: '5.1', 7: '6.1', 8: '7.1', 16: 'hexadecagonal' };

/** The filter that turns every audio stream into what airs: merged, at 48 kHz. */
function mergedGraph(audio: AudioStream[]): { graph: string; channels: number } {
  // A track with no channel layout (MXF's PCM tracks have none) is given one by index with an
  // identity pan, which moves no sound: amerge refuses inputs without a layout.
  const named = (s: AudioStream) => (s.layout ? '' : `,pan=${DEFAULT_LAYOUTS[s.channels] ?? `${s.channels}c`}|${Array.from({ length: s.channels }, (_, c) => `c${c}=c${c}`).join('|')}`);
  const legs = audio.map((s, i) => `[0:${s.index}]aresample=${PROGRAMME_RATE}${named(s)}[a${i}]`);
  const channels = audio.reduce((n, s) => n + s.channels, 0);
  const merged = audio.length > 1 ? `${audio.map((_, i) => `[a${i}]`).join('')}amerge=inputs=${audio.length}` : '[a0]anull';
  return { graph: `${legs.join(';')};${merged}`, channels };
}

const seconds = (n: number) => n.toFixed(6);
/** Always the file protocol: a name with a colon in it is never read as another protocol. */
export const asInput = (file: string) => `file:${file}`;

/**
 * The integrated loudness (LUFS) and true peak (dBTP) of the part `[trimIn, trimOut)` of the file,
 * as it airs on a stereo programme. Absent ends are the file's own.
 */
export async function measure(
  tools: AudioTools,
  file: string,
  part: { trimIn?: number; trimOut?: number } = {},
  opts: JobOptions = {},
): Promise<MeasureResult> {
  const info = await probe(tools, file, opts);
  if (!info.audio.length) return { kind: 'no-audio' };
  const start = part.trimIn ?? 0;
  const end = part.trimOut ?? info.seconds ?? Infinity;
  const length = end - start;
  if (Number.isFinite(length) && length < MIN_MEASURE_SECONDS) return { kind: 'too-short', seconds: Math.max(0, length) };
  const { graph, channels } = mergedGraph(info.audio);
  const pan = channels >= 2 ? 'pan=stereo|c0=c0|c1=c1' : 'pan=stereo|c0=c0|c1=0*c0';
  await tools.verify();
  const { stderr } = await run(
    tools.ffmpeg,
    [
      '-nostdin', '-hide_banner', '-nostats', '-progress', 'pipe:1',
      ...(start > 0 ? ['-ss', seconds(start)] : []),
      ...(Number.isFinite(end) && part.trimOut !== undefined ? ['-to', seconds(end)] : []),
      '-i', asInput(file),
      '-vn', '-sn', '-dn',
      '-filter_complex', `${graph},${pan},ebur128=peak=true:framelog=quiet`,
      '-f', 'null', '-',
    ],
    {
      ...opts,
      onStdout: (chunk) => {
        const times = [...chunk.toString('utf8').matchAll(/out_time_us=(\d+)/g)];
        const last = times[times.length - 1];
        if (last && Number.isFinite(length) && length > 0) opts.onProgress?.(Math.min(1, Number(last[1]) / 1e6 / length));
      },
    },
  );
  const at = stderr.lastIndexOf('Summary:');
  const summary = at >= 0 ? stderr.slice(at) : '';
  const integrated = Number(/I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1]);
  const peakText = /True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1];
  const measuredSeconds = Number.isFinite(length) ? length : (info.seconds ?? 0) - start;
  if (!summary || peakText === undefined) throw new AudioJobError('The audio reader gave no loudness summary.', 'unreadable');
  // Nothing above the -70 LUFS gate: ffmpeg reports the gate itself (or -inf) as the result.
  if (!Number.isFinite(integrated) || integrated <= -70) return { kind: 'silent', seconds: measuredSeconds };
  opts.onProgress?.(1);
  return { kind: 'measured', integrated, truePeak: peakText === '-inf' ? -Infinity : Number(peakText), seconds: measuredSeconds, layout: PROGRAMME_LAYOUT };
}

/**
 * The file's waveform in `bins` columns over its whole length: per column the lowest and highest
 * decoded sample across every channel. Never a mono mix, which can cancel or hide a short sound.
 */
export async function waveform(tools: AudioTools, file: string, bins = 2000, opts: JobOptions = {}): Promise<WaveformResult> {
  const info = await probe(tools, file, opts);
  const total = info.seconds ?? 0;
  const min = new Array<number>(bins).fill(0);
  const max = new Array<number>(bins).fill(0);
  if (!info.audio.length) return { seconds: total, min, max, silentFile: true };
  const { graph, channels } = mergedGraph(info.audio);
  // Read into fine columns of 10 ms (or finer for a short file), then fold them into `bins`: a
  // file that reports no length, or a sound longer than its container says, still draws whole.
  const knownFrames = total > 0 ? Math.round(total * PROGRAMME_RATE) : 0;
  const fine = Math.max(1, Math.min(480, Math.floor(knownFrames / bins) || 480));
  const lows: number[] = [];
  const highs: number[] = [];
  let frame = 0;
  let carry = Buffer.alloc(0);
  const frameBytes = channels * 4;
  let lastReport = 0;
  await tools.verify();
  await run(
    tools.ffmpeg,
    ['-nostdin', '-hide_banner', '-nostats', '-v', 'error', '-i', asInput(file), '-vn', '-sn', '-dn', '-filter_complex', graph, '-f', 'f32le', '-c:a', 'pcm_f32le', 'pipe:1'],
    {
      ...opts,
      onStdout: (chunk) => {
        const data = carry.length ? Buffer.concat([carry, chunk]) : chunk;
        const whole = data.length - (data.length % frameBytes);
        const samples = new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + whole));
        for (let i = 0; i < samples.length; i += channels, frame++) {
          const column = Math.floor(frame / fine);
          if (column >= lows.length) {
            lows.push(0);
            highs.push(0);
          }
          for (let c = 0; c < channels; c++) {
            const v = samples[i + c];
            if (v < lows[column]) lows[column] = v;
            if (v > highs[column]) highs[column] = v;
          }
        }
        carry = Buffer.from(data.subarray(whole));
        const fraction = knownFrames ? Math.min(1, frame / knownFrames) : 0;
        if (fraction - lastReport >= 0.01) {
          lastReport = fraction;
          opts.onProgress?.(fraction);
        }
      },
    },
  );
  const duration = Math.max(total, frame / PROGRAMME_RATE);
  const framesPerBin = (duration * PROGRAMME_RATE) / bins;
  for (let column = 0; column < lows.length; column++) {
    const bin = Math.min(bins - 1, Math.floor((column * fine) / framesPerBin));
    if (lows[column] < min[bin]) min[bin] = lows[column];
    if (highs[column] > max[bin]) max[bin] = highs[column];
  }
  const clip = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000;
  opts.onProgress?.(1);
  return { seconds: duration, min: min.map(clip), max: max.map(clip) };
}
