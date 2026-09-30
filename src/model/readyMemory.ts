// WHAT THIS BROWSER REMEMBERS ABOUT A PRODUCTION'S OUTPUTS, for READY (Phase 6 Step 3,
// docs/work-specs/playout-ready/spec.md R5): the outputs the production page has seen on the live
// topic, so one that is gone reads "not answering" in red instead of simply vanishing, and the last
// Prepare for Live stamp. This browser's localStorage, one key per production
// (`noacg-ready-v1-<production id>`): it is about this operator's screens and this device, never
// production data, and nothing is synced.
//
// THE FORMAT VERSION is `v` (the root versioning invariant): 1 is the only one. A record from a
// newer build reads as empty and is never written over. Storage that throws (a private window, a
// full quota) costs only the memory: the page then remembers for as long as it is open.

export const READY_MEMORY_VERSION = 1;

export interface RememberedOutput {
  id: string;
  name: string;
  /** Last seen on the live topic, epoch ms. */
  seen: number;
}

export interface RememberedStamp {
  at: number;
  v: { n: number; h: string };
  outputs: number;
  ready: number;
  warnings: number;
  problems: number;
}

export interface ReadyMemory {
  outputs: RememberedOutput[];
  stamp: RememberedStamp | null;
}

const EMPTY: ReadyMemory = { outputs: [], stamp: null };

const keyFor = (productionId: string) => `noacg-ready-v1-${productionId}`;

/** Outputs kept per production: more than any real show has, few enough to stay small. */
const MAX_OUTPUTS = 16;

function readOutputs(value: unknown): RememberedOutput[] {
  if (!Array.isArray(value)) return [];
  const out: RememberedOutput[] = [];
  for (const item of value.slice(-MAX_OUTPUTS)) {
    const o = item as Partial<RememberedOutput> | null;
    if (o && typeof o.id === 'string' && typeof o.name === 'string' && typeof o.seen === 'number') {
      out.push({ id: o.id.slice(0, 40), name: o.name.slice(0, 80), seen: o.seen });
    }
  }
  return out;
}

function readStamp(value: unknown): RememberedStamp | null {
  const s = value as Partial<RememberedStamp> | null;
  if (!s || typeof s !== 'object' || typeof s.at !== 'number' || !s.v || typeof s.v.n !== 'number' || typeof s.v.h !== 'string') {
    return null;
  }
  const count = (n: unknown) => (typeof n === 'number' && n >= 0 ? Math.floor(n) : 0);
  return { at: s.at, v: { n: s.v.n, h: s.v.h }, outputs: count(s.outputs), ready: count(s.ready), warnings: count(s.warnings), problems: count(s.problems) };
}

export function loadReadyMemory(productionId: string): ReadyMemory {
  try {
    const raw = localStorage.getItem(keyFor(productionId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { v?: unknown; outputs?: unknown; stamp?: unknown } | null;
    if (!parsed || parsed.v !== READY_MEMORY_VERSION) return EMPTY;
    return { outputs: readOutputs(parsed.outputs), stamp: readStamp(parsed.stamp) };
  } catch {
    return EMPTY;
  }
}

export function saveReadyMemory(productionId: string, memory: ReadyMemory): void {
  try {
    const raw = localStorage.getItem(keyFor(productionId));
    if (raw) {
      const held = JSON.parse(raw) as { v?: unknown } | null;
      // A newer build's record is left as it is.
      if (held && typeof held.v === 'number' && held.v > READY_MEMORY_VERSION) return;
    }
    localStorage.setItem(
      keyFor(productionId),
      // The newest are kept: the list grows at its end (control/readiness.ts rememberOutputs).
      JSON.stringify({ v: READY_MEMORY_VERSION, outputs: memory.outputs.slice(-MAX_OUTPUTS), stamp: memory.stamp }),
    );
  } catch {
    // Nowhere to keep it: remembered for as long as the page is open.
  }
}
