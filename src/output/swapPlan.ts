// WHAT A PUBLISH CHANGES ON ONE OUTPUT, AND WHEN EACH CHANGE TAKES OVER
// (docs/work-specs/per-graphic-replacement/spec.md G1, G2, D1, D3, D4).
//
// An output holds one frame per graphic, each built from one version of that graphic: its digest
// in the payload's stamp (control/payloadVersion.ts `g`). A publish moves some digests. Each output
// works out on its own (G2) which graphics to build again, which are new and which are gone, and
// once a new frame has passed READY's checks, when it takes over:
//
//   off air here        at once, once the frame it replaces stands still (an exit may be running)
//   on air here         never while it is up (G1): after its Out, All out or Stop/Clear, or at a
//                       Take that replaces it
//
// A graphic that is gone leaves by the same rule. Pure and DOM-free: scripts/swap-plan.test.mjs
// runs it in Node, and the output renderer loads it in CasparCG 2.3's Chromium 71.

import { MAX_ISSUES, type ChangePrep, type HeldVersion, type ReadyIssue } from '../control/readiness.ts';

/** One output's graphics by version: per graphic, the digest of the frame airing now (`held`) and
 *  of a frame prepared beside it, waiting to take over (`ready`). An empty digest is one nobody
 *  knows: the boot payload carried no stamp. */
export interface Holding {
  held: Readonly<Record<string, string>>;
  ready: Readonly<Record<string, string>>;
}

/** What a publish asks of one output. */
export interface PublishPlan {
  /** Graphics whose published version is neither the frame airing nor one already prepared. */
  build: string[];
  /** Graphics this output does not host yet. */
  add: string[];
  /** Graphics the publish no longer has. */
  remove: string[];
  /** Prepared frames the publish made stale (moved on again, or back to what airs). */
  drop: string[];
}

/** The plan for a publish whose stamp says `next` (per graphic, in the payload's `keys`). */
export function planPublish(holding: Holding, next: Readonly<Record<string, string>>, keys: readonly string[]): PublishPlan {
  const plan: PublishPlan = { build: [], add: [], remove: [], drop: [] };
  for (const key of keys) {
    const want = next[key];
    const held = holding.held[key];
    const ready = holding.ready[key];
    if (held === undefined) {
      plan.add.push(key);
      continue;
    }
    // A graphic the stamp names no digest for says nothing about a change (as `rendersDiffer`).
    if (want === undefined) continue;
    if (held !== '' && held === want) {
      if (ready !== undefined) plan.drop.push(key);
      continue;
    }
    if (ready !== undefined && ready !== '' && ready === want) continue;
    if (ready !== undefined) plan.drop.push(key);
    plan.build.push(key);
  }
  for (const key of Object.keys(holding.held)) {
    if (keys.indexOf(key) >= 0) continue;
    plan.remove.push(key);
    if (holding.ready[key] !== undefined) plan.drop.push(key);
  }
  return plan;
}

/**
 * Which pending changes (prepared frames, and graphics that are gone) take over now and which wait,
 * given what is on air here. One off air goes to `settle`: its frame may still be running its exit,
 * so it takes over once that frame stands still, which only watching it can tell. One on air waits
 * until it is cleared or replaced, and only those are "waiting for clear".
 */
export function swapsNow(pending: readonly string[], onAir: (graphic: string) => boolean): { settle: string[]; wait: string[] } {
  const out = { settle: [] as string[], wait: [] as string[] };
  for (const graphic of pending) (onAir(graphic) ? out.wait : out.settle).push(graphic);
  return out;
}

/** Where the version stands after the swapper has had its go: undefined when every graphic holds
 *  it, else what still keeps the output from it. `w` names the graphics waiting for clear; a page
 *  built before it reads `waiting` as "Behind", as it read a whole reload waiting. */
export function swapStatus(input: { version: HeldVersion; of: number; id?: string; waiting: string[]; failed: ReadyIssue[]; holds: boolean }): ChangePrep | undefined {
  const base = { v: input.version, of: input.of, n: input.of, ...(input.id ? { id: input.id } : {}) };
  const w = { w: input.waiting.slice(0, MAX_ISSUES) };
  if (input.failed.length > 0) return { s: 'failed', ...base, is: input.failed.slice(0, MAX_ISSUES), ...w };
  if (input.waiting.length > 0) return { s: 'waiting', ...base, air: input.waiting.length, ...w };
  if (input.holds) return undefined;
  // Built, and taking over in a moment (a frame that just went off air finishing its exit).
  return { s: 'preparing', ...base };
}
