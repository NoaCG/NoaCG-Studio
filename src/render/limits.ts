// Render entitlements + cost-protection limits — EVERY configurable number lives here.
//
// PURE MODULE (no DOM, no import.meta): imported by the Export UI (immediate feedback,
// control clamping) and by the api/ functions (the authoritative re-check). Client-side
// checks are UX; the server always re-validates against the same table.
//
// Tiers: anonymous visitors get the basic formats with strict caps; signed-in users get
// the full format set with sensible free limits; 'paid' is the widest cap table, reachable only
// through a plan row whose render_tier names it - assigned by an admin, or auto-assigned by
// e-mail domain (migration 0045) - for a school grant or a heavy-use exception. NoaCG sells
// nothing and no billing is planned (docs/OWNER_RULINGS.md, 2026-09-07). The tier's name is
// wrong for what it is; renaming it touches RenderTier, the check constraints in 0007 and
// 0018, and AiTaskTier in api/_lib/aiTaskRegistry.ts with one migration, so it waits for a
// change of its own.

import {
  RENDER_FORMATS,
  type HtmlRenderManifest,
  type HyperframesRenderManifest,
  type RemotionRenderManifest,
  type RenderFormatId,
} from './manifest.js';
import { durationInFrames } from './manifest.js';

export type RenderTier = 'anonymous' | 'free' | 'paid';

export interface TierCaps {
  formats: RenderFormatId[];
  maxWidth: number;
  maxHeight: number;
  /** Output pixels (width×scale × height×scale) — the real cost driver. */
  maxPixels: number;
  maxFps: number;
  maxDurationSec: number;
  /** Per-format tighter duration caps (heavy outputs). */
  maxDurationSecByFormat?: Partial<Record<RenderFormatId, number>>;
  maxOutputBytes: number;
  /** Simultaneously running jobs per principal (user id or anonymous IP hash). */
  maxConcurrent: number;
  /** Job creations per principal per window. */
  perHour: number;
  perDay: number;
}

export const RENDER_LIMITS: Record<RenderTier, TierCaps> = {
  anonymous: {
    formats: ['mp4', 'webm', 'png-still'],
    maxWidth: 1920, maxHeight: 1920, maxPixels: 1920 * 1080,
    maxFps: 30,
    maxDurationSec: 15,
    maxOutputBytes: 200_000_000,
    maxConcurrent: 1,
    perHour: 2,
    perDay: 6,
  },
  free: {
    formats: ['mp4', 'webm', 'png-still', 'png-sequence', 'prores4444'],
    maxWidth: 1920, maxHeight: 1920, maxPixels: 1920 * 1080,
    maxFps: 60,
    maxDurationSec: 60,
    maxDurationSecByFormat: { prores4444: 30, 'png-sequence': 30 },
    maxOutputBytes: 2_000_000_000,
    maxConcurrent: 2,
    perHour: 10,
    perDay: 40,
  },
  paid: {
    formats: ['mp4', 'webm', 'png-still', 'png-sequence', 'prores4444'],
    maxWidth: 4096, maxHeight: 4096, maxPixels: 4096 * 2304,
    maxFps: 60,
    maxDurationSec: 300,
    maxOutputBytes: 8_000_000_000,
    maxConcurrent: 4,
    perHour: 30,
    perDay: 150,
  },
};

/** Formats that require at least a signed-in account (ProRes and the sequences cost real
 *  compute, so an anonymous IP hash does not get them). */
export function formatNeedsSignIn(format: RenderFormatId): boolean {
  return !RENDER_LIMITS.anonymous.formats.includes(format);
}

/** All the non-tier knobs — one object, no scattered magic numbers. */
export const RENDER_CONFIG = {
  /** Serialized manifest cap — stays under Vercel's 4.5 MB function body limit. */
  manifestMaxBytes: 4_000_000,
  /** A compiled single composition module past this is a runaway generation, not code. */
  compiledJsMaxBytes: 1_000_000,
  /** Output download TTL per tier (ms). */
  outputTtlMs: { anonymous: 2 * 3600_000, free: 24 * 3600_000, paid: 7 * 86_400_000 } as Record<RenderTier, number>,
  /** How often the browser polls job status (also returned by the start endpoint). */
  pollIntervalMs: 2500,
  /** How often the worker rewrites progress.json (throttle). */
  progressWriteIntervalMs: 1000,
  /** Grace past the sandbox deadline before a silent job counts as lost. */
  abandonedSlackMs: 5 * 60_000,
  /** Fleet-wide admission control — the cost ceiling no per-principal quota can express.
   *  The tier caps above bound ONE visitor; nothing in them bounds a traffic spike, and
   *  the anonymous principal is an IP hash, so a rotating-IP flood passes every one of
   *  them. Each admitted job is a 4-vCPU microVM billed by the minute, so the fleet needs
   *  its own ceiling. Enforced in api/_lib/admission.ts, which also reads the per-deployment
   *  env overrides — this module is PURE and runs in the browser, so it holds the defaults
   *  only. */
  globalConcurrency: {
    /** Hard ceiling on simultaneously running jobs across every principal. */
    max: 12,
    /** Anonymous starts are refused once total running jobs reach this, keeping the top
     *  slots for signed-in users: a spike degrades to "signed-in still works" rather than
     *  "nobody renders". Must be <= max. */
    anonymousMax: 8,
    /** Retry-After (seconds) sent with a 503 busy. */
    retryAfterSec: 60,
  },
  /** Burst gate on POST /api/render/start (api/_lib/rateLimit.ts) — the cheap layer in
   *  FRONT of the fleet ceiling. Admission stops a flood from RUNNING renders, but every
   *  request it refuses has already read a body of up to manifestMaxBytes and queried the
   *  ledger four times; this refuses before either. Per-deployment overrides, like
   *  globalConcurrency's, are read in the api module. */
  startRateLimit: {
    windowSec: 60,
    /** Starts per window per client IP. Deliberately far above legitimate use (a signed-in
     *  user may only start 10 renders an HOUR) because the key is an IP address, and this
     *  product's users sit behind shared ones: a university lab or a station gallery is one
     *  NAT address, so the gate has to clear a whole room pressing Render at once. It is a
     *  flood gate, not a quota — the quotas are RENDER_LIMITS. 0 disables it. */
    maxRequests: 60,
  },
  /** Default warning threshold for short holds. */
  minHoldMs: 500,
  sandbox: {
    runtime: 'node24',
    vcpus: 4,
    /** Per-job wall clock: provisioning + a generous per-frame budget + upload slack,
     *  clamped to stay inside the platform ceiling. */
    timeoutMs(frames: number, pixelsPerFrame: number): number {
      const provisionMs = 6 * 60_000;
      const perFrameMs = pixelsPerFrame > 1920 * 1080 ? 1200 : 500;
      const uploadSlackMs = 3 * 60_000;
      const raw = provisionMs + frames * perFrameMs + uploadSlackMs;
      return Math.min(Math.max(raw, 10 * 60_000), 40 * 60_000);
    },
  },
} as const;

export function isRenderTier(value: string): value is RenderTier {
  return value === 'anonymous' || value === 'free' || value === 'paid';
}

/** The tier a resolved entitlement renders at.
 *
 *  Plans name their tier as free text (`plans.render_tier`), because the tier TABLE above is
 *  code and a plan row must not be able to break the render path by naming something that is
 *  not in it. An unrecognised name therefore falls back to what the caller would have got
 *  anyway - signed in or not - rather than failing the request or silently granting 'paid'.
 *
 *  This module stays PURE (see the header): it takes the already-resolved tier name, it does
 *  not load entitlements. api/_lib/entitlements.ts does that. */
export function resolveTier(signedIn: boolean, entitledTier?: string): RenderTier {
  const fallback: RenderTier = signedIn ? 'free' : 'anonymous';
  if (!signedIn) return fallback; // an anonymous caller has no plan to honour
  return entitledTier && isRenderTier(entitledTier) ? entitledTier : fallback;
}

export interface LimitIssue {
  code:
    | 'format-signin'
    | 'format-tier'
    | 'resolution'
    | 'fps'
    | 'duration'
    | 'manifest-size';
  message: string;
}

/** The subset of the manifest the limit checks need (the server summarizes before parsing
 *  the multi-MB document). Both manifest kinds satisfy their branch structurally. */
export type ManifestSummary =
  | Pick<HtmlRenderManifest, 'kind' | 'width' | 'height' | 'fps' | 'scale' | 'timing' | 'output'>
  | Pick<RemotionRenderManifest, 'kind' | 'width' | 'height' | 'fps' | 'scale' | 'durationInFrames' | 'output'>
  | Pick<HyperframesRenderManifest, 'kind' | 'width' | 'height' | 'fps' | 'scale' | 'durationInFrames' | 'output'>;

/** A summary's duration in seconds, whichever way the kind expresses it. */
function summaryDurationSec(m: ManifestSummary): number {
  return m.kind === 'html' ? m.timing.totalDurationMs / 1000 : m.durationInFrames / m.fps;
}

/** The output formats this request may use.
 *
 *  A plan's `render_formats` REPLACES the tier's list rather than intersecting it - "available
 *  export formats" is a plan dimension in its own right, so a plan must be able to grant a
 *  format its tier does not carry. The other caps are orthogonal and still apply: granting
 *  ProRes does not also grant 4K or five minutes.
 *
 *  A plan that names formats the build does not have contributes nothing rather than emptying
 *  the list - an unknown format id is a stale plan row, not an instruction to refuse every
 *  render. Falling back to the tier there is the difference between a typo costing one format
 *  and a typo costing the feature. */
export function allowedFormats(tier: RenderTier, planFormats?: readonly string[] | null): readonly RenderFormatId[] {
  const caps = RENDER_LIMITS[tier];
  if (!planFormats?.length) return caps.formats;
  const known = planFormats.filter((id): id is RenderFormatId => id in RENDER_FORMATS);
  return known.length ? known : caps.formats;
}

/** Validate a render request against a tier. Empty result = allowed.
 *
 *  `planFormats` comes from the resolved entitlement (api/_lib/entitlements.ts); omitting it
 *  keeps exactly the pre-entitlement behaviour, which is what every caller that has no user
 *  wants. This module stays PURE - it takes the already-resolved list, it never loads one. */
export function validateRenderRequest(
  m: ManifestSummary,
  tier: RenderTier,
  planFormats?: readonly string[] | null,
): LimitIssue[] {
  const caps = RENDER_LIMITS[tier];
  const formats = allowedFormats(tier, planFormats);
  const issues: LimitIssue[] = [];
  const format = m.output.format;

  if (!formats.includes(format)) {
    issues.push(
      tier === 'anonymous' && formatNeedsSignIn(format)
        ? { code: 'format-signin', message: `${RENDER_FORMATS[format].label} requires signing in.` }
        : { code: 'format-tier', message: `${RENDER_FORMATS[format].label} is not enabled for this account.` },
    );
  }

  const outW = Math.round(m.width * m.scale);
  const outH = Math.round(m.height * m.scale);
  if (outW > caps.maxWidth || outH > caps.maxHeight || outW * outH > caps.maxPixels) {
    issues.push({
      code: 'resolution',
      message: `${outW}×${outH} exceeds the ${tier === 'anonymous' ? 'anonymous' : 'current'} limit (${caps.maxWidth}×${caps.maxHeight}, ${Math.round(caps.maxPixels / 1e6)} MP).${tier === 'anonymous' ? ' Sign in for more.' : ''}`,
    });
  }

  if (m.fps > caps.maxFps) {
    issues.push({ code: 'fps', message: `${m.fps} fps exceeds the limit of ${caps.maxFps} fps.${tier === 'anonymous' ? ' Sign in for 60 fps.' : ''}` });
  }

  const maxSec = Math.min(caps.maxDurationSec, caps.maxDurationSecByFormat?.[format] ?? Infinity);
  const durSec = summaryDurationSec(m);
  if (durSec > maxSec) {
    issues.push({
      code: 'duration',
      message: `${durSec.toFixed(0)} s exceeds the ${maxSec} s limit for ${RENDER_FORMATS[format].label}.${tier === 'anonymous' ? ' Sign in for longer renders.' : ''}`,
    });
  }

  return issues;
}

/** Sandbox wall-clock for a job (used by the executor and the abandoned-job sweep). */
export function jobTimeoutMs(m: ManifestSummary): number {
  const frames = durationInFrames(m);
  const pixels = Math.round(m.width * m.scale) * Math.round(m.height * m.scale);
  return RENDER_CONFIG.sandbox.timeoutMs(frames, pixels);
}
