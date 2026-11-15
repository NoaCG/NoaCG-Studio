import type { MediaPlayback } from './protocol.js';

export const VMIX_FRAME_MS = 40;
export const VMIX_SEEK_SETTLE_MS = 125;
export const VMIX_CLOCK_POLL_MS = 250;
export const VMIX_RAMP_REPLACEMENT_MS = VMIX_FRAME_MS;

export interface VmixClipClock {
  now(): number;
  schedule(delayMs: number, callback: () => void): () => void;
}

export const vmixClipClock: VmixClipClock = {
  now: () => performance.now(),
  schedule(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

export interface ClipSegment {
  inMs: number;
  outMs: number;
}

export function trimSegment(trim: NonNullable<MediaPlayback['trim']>, durationMs: number): ClipSegment | undefined {
  const inMs = Math.ceil((trim.in ?? 0) * 1000);
  const outMs = trim.out === undefined ? durationMs : Math.round(trim.out * 1000);
  if (durationMs > 0 && Number.isSafeInteger(inMs) && Number.isSafeInteger(outMs) &&
      inMs >= 0 && outMs <= durationMs && inMs < outMs) return { inMs, outMs };
}

export function gainSettings(gain = 1): { fader: number; db: number } {
  // vMix 29's function operands accept whole fader points and whole dB.
  return gain <= 1 ? { fader: Math.round(100 * gain ** 0.25), db: 0 }
    : { fader: 100, db: Math.round(20 * Math.log10(gain)) };
}

// vMix reports amplitude in XML, while mixer functions accept the fader's position.
export const faderVolume = (fader: number) => 100 * (fader / 100) ** 4;
export const volumeAt = (actual: number | undefined, fader: number) => actual !== undefined &&
  (fader === 0 ? actual === 0 : Math.abs(actual - faderVolume(fader)) <= 0.0001);

export interface AlphaFade {
  from: number;
  to: number;
  at: number;
  duration: number;
}

export function fadeFrame(fade: AlphaFade, now: number): { alpha: number; nextAt?: number } {
  const elapsed = Math.max(0, now - fade.at);
  if (elapsed >= fade.duration) return { alpha: fade.to };
  const frame = Math.floor(elapsed / VMIX_FRAME_MS);
  const fraction = frame * VMIX_FRAME_MS / fade.duration;
  return {
    alpha: Math.round(fade.from + (fade.to - fade.from) * fraction),
    nextAt: fade.at + Math.min(fade.duration, (frame + 1) * VMIX_FRAME_MS),
  };
}
