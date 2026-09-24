// AI generation telemetry: one record per provider run — stage timings, token usage, the
// route taken, repair rounds, outcome, and the DIVERSITY of what was produced (variant,
// preset, palette, …). The harness must EARN its place with measurements, and sameness is a
// named failure mode — this is where both become visible.
//
// Local-only by design (an in-memory list mirrored to a localStorage ring, JSON-exportable);
// nothing is sent anywhere. scripts/ai-bench.mjs and the hidden compare mode read these
// records; a future nightly analysis task would too.

import { uuid } from '../model/id';
import type { AiPath } from './provider';
import type { ModelUsage } from './modelTypes';
import type { CreativeAiProfileId } from './lite/types';
import { accountKey } from '../model/accountScope';

/** Normalized token and optional cost metadata from any model provider. */
export type AiUsage = Pick<ModelUsage, 'inputTokens' | 'outputTokens'>
  & Partial<Pick<ModelUsage, 'totalTokens' | 'cachedInputTokens' | 'reasoningTokens' | 'estimatedCost'>>;

export type AiRunKind =
  | 'generate' | 'modify' | 'convert' | 'fix' | 'make-ready'
  // The video harness records through the same ring (plan §5 - it recorded nothing
  // before). Consumers filter by kind, so the SPX statistics never mix with these.
  | 'video-generate' | 'video-refine'
  // The NoaCG Pro image-guided pipeline (docs/NOACG_PRO_PLAN.md §8).
  | 'pro-generate';

export interface AiStageRecord {
  /** Stage name ('design-spec', 'assemble', 'coder', 'repair-1', 'bench', …). */
  stage: string;
  /** Model id for stages that called the API; absent for deterministic stages. */
  model?: string;
  ms: number;
  usage?: AiUsage;
}

/** What the run produced — the repetition metrics feed off these. */
export interface AiDiversity {
  variantId?: string;
  category?: string;
  presetId?: string;
  paletteId?: string;
  zone?: string;
  density?: string;
  typography?: string;
}

export interface AiRunRecord {
  id: string;
  kind: AiRunKind;
  startedAt: string; // ISO timestamp
  totalMs: number;
  route?: AiPath;
  profile?: CreativeAiProfileId;
  generationId?: string;
  stages: AiStageRecord[];
  repairRounds: number;
  ok?: boolean;
  /** Validation rules still failing at the end (empty when ok). */
  errorRules?: string[];
  diversity?: AiDiversity;
  /** The phase-A routing record (docs/CREATIVE_MODE_PLAN.md §2): the request mode, the
   *  adapt/create decision, and the intent classification behind it - what the routing
   *  benchmark aggregates. Additive optional, absent on pre-routing records. */
  routing?: AiRoutingRecord;
}

export interface AiRoutingRecord {
  mode: 'adapt' | 'create' | 'auto';
  route: 'adapt' | 'create';
  reason?: string;
  /** The intent's classification: kind plus its identifier (type id / first family). */
  intentKind?: string;
  confidence?: 'high' | 'medium' | 'low';
  originalityRequested?: boolean;
  /** The retrieved shortlist an ADAPT-routed brief was chosen from (src/ai/retrieval.ts).
   *  Absent on every other route, and absent when nothing narrowed the catalog — so its
   *  presence is also the record of whether retrieval ran at all. */
  shortlist?: { size: number; anchor?: string; reason: string };
}

const STORAGE_KEY = 'spx-gfx-ai-telemetry';
const MAX_RECORDS = 100;

function readStored(): AiRunRecord[] {
  try {
    const raw = localStorage.getItem(accountKey(STORAGE_KEY));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as AiRunRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(records: AiRunRecord[]): void {
  try {
    localStorage.setItem(accountKey(STORAGE_KEY), JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    // Quota or no storage — telemetry is best-effort, never in the user's way.
  }
}

/** All recorded runs, oldest first. */
export function aiRunRecords(): AiRunRecord[] {
  return readStored();
}

/** The full record list as pretty JSON (the debug export). */
export function exportAiRuns(): string {
  return JSON.stringify(readStored(), null, 2);
}

export function clearAiRuns(): void {
  persist([]);
}

/** Live recorder for one provider run. Create at the top, `finish()` exactly once. */
export interface AiRunRecorder {
  /** Record a completed stage. Call right after the stage ends; `ms` is measured here. */
  stage(name: string, startedMs: number, model?: string, usage?: AiUsage): void;
  repair(): void;
  route(route: AiPath): void;
  routing(r: AiRoutingRecord): void;
  managed(profile: CreativeAiProfileId, generationId: string): void;
  diversity(d: AiDiversity): void;
  finish(ok: boolean, errorRules?: string[]): AiRunRecord;
}

export function startAiRun(kind: AiRunKind): AiRunRecorder {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const record: AiRunRecord = {
    id: uuid(),
    kind,
    startedAt,
    totalMs: 0,
    stages: [],
    repairRounds: 0,
  };
  let finished = false;
  return {
    stage(name, startedMs, model, usage) {
      record.stages.push({ stage: name, ms: Date.now() - startedMs, ...(model ? { model } : {}), ...(usage ? { usage } : {}) });
    },
    repair() {
      record.repairRounds += 1;
    },
    route(route) {
      record.route = route;
    },
    routing(r) {
      record.routing = r;
    },
    managed(profile, generationId) {
      record.profile = profile;
      record.generationId = generationId;
    },
    diversity(d) {
      record.diversity = { ...record.diversity, ...d };
    },
    finish(ok, errorRules) {
      if (finished) return record;
      finished = true;
      record.totalMs = Date.now() - t0;
      record.ok = ok;
      if (errorRules?.length) record.errorRules = errorRules;
      persist([...readStored(), record]);
      return record;
    },
  };
}
