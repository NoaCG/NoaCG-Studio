// WHAT THE PAGE MEASURED, KEPT ACROSS A RELOAD (live-publishing phase 7 repair, #2532).
//
// Every graphic cue a publish carries holds the box this page measured of it (`adjust.box`,
// ./hostedAdjust.ts `publishedAdjustOf`), and the session keeps those measurements in memory only
// (./adjustGeometry.ts). After a reload a publish ran before the background measurer had answered for
// every cue, so it published each unmeasured cue without its box (or with a box measured again a
// pixel apart), and the next publish put it back: the first edit after a reload resent cues nobody
// changed (AC-5, 20.3 to 23.7 kB on the large fixture).
//
// So the page keeps each cue's last measurement in this browser, with a hash of the identity it was
// measured for (`measureId`: graphic, design edit time, cue, values, stage, style) and the build that
// measured it. A reopened page takes a kept measurement only for a cue it has not measured yet in
// this session, only when the cue's identity now hashes the same, and only from the same build: what
// it holds is then what this page measured for exactly that cue, so a Take places the cue as it did
// before the reload and a publish carries the box it carried before. Anything else is measured again,
// as before. Never synced; one key for every production, the newest few kept.

import type { StorePart } from './storePart';
import { measured, type GeometryPart } from './adjustGeometry.ts';
import type { Measurement } from './cueAdjust.ts';

export const KEPT_GEOMETRY_KEY = 'spx-gfx-measured';
/** Productions kept, newest first; an older one is measured again when it opens. */
const KEPT_PRODUCTIONS = 8;
/** One write per burst of measurements. */
const WRITE_MS = 1_000;

/** One cue's kept measurement: the identity's hash, its pool graphic and the measurement. */
interface KeptCue {
  h: string;
  g: string;
  m: Measurement;
}
interface KeptProduction {
  /** The build that measured them. */
  b: string;
  /** When last written, to keep the newest productions. */
  at: number;
  cues: Record<string, KeptCue>;
}
type KeptStore = Record<string, KeptProduction>;

export interface KeptGeometryIo {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
  /** The clock, for which productions are newest (default `Date.now`). */
  now?: () => number;
  /** The build this page runs (./livePath.ts `LIVE_BUILD`). */
  build: string;
}

/** An identity's name in storage: two 32-bit FNV-1a hashes and its length, so a values text of
 *  kilobytes is not stored once per cue. */
export function identityHash(id: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
  }
  return `${(a >>> 0).toString(16)}.${(b >>> 0).toString(16)}.${id.length}`;
}

const isRect = (r: unknown) =>
  r === null || (!!r && typeof r === 'object' && ['x', 'y', 'w', 'h'].every((k) => typeof (r as Record<string, unknown>)[k] === 'number'));
const isMeasurement = (m: unknown): m is Measurement =>
  !!m && typeof m === 'object' && isRect((m as Measurement).info) && isRect((m as Measurement).paint) && ((m as Measurement).minText === null || typeof (m as Measurement).minText === 'number');

function readStore(io: KeptGeometryIo): KeptStore {
  try {
    const parsed: unknown = JSON.parse(io.getItem(KEPT_GEOMETRY_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as KeptStore) : {};
  } catch {
    return {};
  }
}

/** This production's kept cues, when this build measured them; none otherwise. */
export function readKept(io: KeptGeometryIo, productionId: string): Record<string, KeptCue> {
  const p = readStore(io)[productionId];
  if (!p || typeof p !== 'object' || p.b !== io.build || !p.cues || typeof p.cues !== 'object') return {};
  const out: Record<string, KeptCue> = {};
  for (const [cueId, c] of Object.entries(p.cues)) {
    if (c && typeof c.h === 'string' && typeof c.g === 'string' && isMeasurement(c.m)) out[cueId] = c;
  }
  return out;
}

/** A graphic cue's measurement identity now (`measureId`). */
export interface CueIdentity {
  cueId: string;
  graphicId: string;
  id: string;
}

/** The session's geometry with each cue's kept measurement taken, for a cue this session has not
 *  measured and whose identity hashes as the kept one did. */
export function adoptKept(part: GeometryPart, kept: Readonly<Record<string, KeptCue>>, cues: readonly CueIdentity[]): GeometryPart {
  let next = part;
  for (const job of cues) {
    const k = kept[job.cueId];
    if (!k || next.byCue[job.cueId] || k.g !== job.graphicId || k.h !== identityHash(job.id)) continue;
    next = measured(next, job.cueId, job.graphicId, job.id, k.m);
  }
  return next;
}

/** What is kept for a production: the session's measurements over the kept ones, for the cues
 *  the production still has (`cues`: cue id to its pool graphic id). */
export function keptOf(part: GeometryPart, kept: Readonly<Record<string, KeptCue>>, cues: ReadonlyMap<string, string>): Record<string, KeptCue> {
  const out: Record<string, KeptCue> = {};
  for (const [cueId, c] of Object.entries(kept)) if (cues.get(cueId) === c.g) out[cueId] = c;
  for (const [cueId, e] of Object.entries(part.byCue)) {
    const g = cues.get(cueId);
    if (g) out[cueId] = { h: identityHash(e.id), g, m: e.m };
  }
  return out;
}

/**
 * One production's kept geometry for a page session. `adopt` takes kept measurements into the
 * session, asking `identities` only for the cues with a kept measurement the session has not
 * measured (every graphic cue, not only those the measurer is asked for: a cue PREVIEW measured
 * publishes its own box). `watch` writes every change of the session's geometry back (debounced)
 * for the graphic cues `cues` names at the time (cue id to pool graphic id), and its answer stops
 * watching and writes what is owed.
 */
export function keepGeometry(part: StorePart<GeometryPart>, productionId: string, cues: () => ReadonlyMap<string, string>, io: KeptGeometryIo) {
  let kept = readKept(io, productionId);
  let timer: unknown = null;
  const write = () => {
    timer = null;
    kept = keptOf(part.get(), kept, cues());
    const store = readStore(io);
    store[productionId] = { b: io.build, at: (io.now ?? Date.now)(), cues: kept };
    const newest = Object.entries(store)
      .filter(([, p]) => p && typeof p === 'object')
      .sort(([, x], [, y]) => (y.at ?? 0) - (x.at ?? 0))
      .slice(0, KEPT_PRODUCTIONS);
    try {
      io.setItem(KEPT_GEOMETRY_KEY, JSON.stringify(Object.fromEntries(newest)));
    } catch {
      // Quota or a private window: the page measures again after a reload, as before.
    }
  };
  return {
    adopt: (identities: (cueIds: ReadonlySet<string>) => readonly CueIdentity[]) => {
      const owed = new Set(Object.keys(kept).filter((cueId) => !part.get().byCue[cueId]));
      if (owed.size) part.set((p) => adoptKept(p, kept, identities(owed)));
    },
    watch: () => {
      const unsubscribe = part.subscribe(() => {
        if (timer === null) timer = io.setTimeout(write, WRITE_MS);
      });
      return () => {
        unsubscribe();
        if (timer !== null) {
          io.clearTimeout(timer);
          write();
        }
      };
    },
  };
}
