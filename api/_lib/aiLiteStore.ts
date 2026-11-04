import { randomUUID } from 'node:crypto';
import type { ModelResult } from '../../src/ai/modelTypes.js';
import type {
  LiteLowerThirdIntentKind,
  LiteVariantQualityPrior,
} from '../../src/ai/lite/types.js';
import { supabaseSecretKey } from './jobStore.js';
import type { LiteProfile } from './aiLiteProfile.js';

export type LiteGenerationStatus =
  | 'reserved'
  | 'model_running'
  | 'spec_ready'
  | 'usable'
  | 'accepted'
  | 'unsupported'
  | 'failed'
  | 'expired';

/** The ledger row discriminators the CHECK constraint admits (0015 widened it to
 *  'import-analysis', 0044 to 'pro'). The task registry maps task ids onto these
 *  ('lite-design-spec' -> 'lite'); a new value ships its constraint migration in the
 *  same commit. */
export type AiLedgerProfile = 'lite' | 'import-analysis' | 'pro';

/** The quota subset a reservation needs - LiteProfile and ImportAnalysisProfile both
 *  satisfy it structurally, which is what lets one store admit every task's ledger
 *  traffic with per-profile counting (ai_task_usage). */
export interface LedgerQuotaProfile {
  id: AiLedgerProfile;
  promptVersion: string;
  maxProviderCostUsd: number;
  dailyStarts: number;
  monthlyStarts: number;
  dailySuccesses: number;
  monthlySuccesses: number;
  maxConcurrentPerUser: number;
  maxConcurrentFleet: number;
  dailyFleetSpendUsd: number;
  expiryMs: number;
}

export interface LiteGenerationRecord {
  id: string;
  userId: string;
  ipHash: string;
  idempotencyKey: string;
  /** The ledger row discriminator (see AiLedgerProfile). */
  profile: AiLedgerProfile;
  status: LiteGenerationStatus;
  promptVersion: string;
  requestedCategory: string | null;
  resolvedCategory: string | null;
  resolvedVariantId: string | null;
  intentKind: LiteLowerThirdIntentKind | null;
  provider: string | null;
  model: string | null;
  attemptCount: number;
  repairCount: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  providerCostUsd: number;
  validationRuleCodes: string[];
  /** What the platform deterministically REPAIRED on the way to this decision - the brand
   *  palette restored over a model override, a furniture colour clamped, a mark's chassis
   *  re-picked. Content-free codes, so brand-fidelity repair rates are countable per prompt
   *  version in production (`docs/AI_LITE_BRAND_PLAN.md` §3.2). Empty on an untouched run. */
  adjustments: string[];
  runtimeMs: number | null;
  rejectionReason: string | null;
  feedbackReason: string | null;
  /** Skin vision judgements booked against this generation (the per-generation cap). */
  judgeCount: number;
  /** How many model calls a hosted PRO reservation has paid for (migration 0044).
   *
   *  A column of its own rather than `attemptCount`, which 0010 bounds `<= 2` - Lite's hard
   *  session ceiling and an invariant of that profile. Pro makes two calls plus retry headroom,
   *  so reusing it would have widened one task's guard to hold another task's number. The
   *  database refused it on the first push, which is why the two implementations agree here
   *  rather than only in the one with no constraints. */
  proCallCount: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface LiteUsageSnapshot {
  dailyStarts: number;
  monthlyStarts: number;
  dailySuccesses: number;
  monthlySuccesses: number;
  activeForUser: number;
  activeGlobal: number;
  dailyFleetSpendUsd: number;
}

export type LiteReservation =
  | { status: 'created'; record: LiteGenerationRecord }
  | { status: 'duplicate'; record: LiteGenerationRecord }
  | { status: 'daily-start-limit' | 'monthly-start-limit' | 'daily-success-limit' | 'monthly-success-limit' | 'user-concurrency' | 'fleet-concurrency' | 'fleet-spend' };

/** The judge's own admission verdict. 'not-found' covers both a missing record and one
 *  owned by somebody else, so the endpoint cannot become a generation-id oracle. */
export type LiteJudgeReservation =
  | { status: 'created'; judgeCount: number }
  | { status: 'not-found' | 'expired' | 'judge-limit' | 'fleet-spend' };

/**
 * May a hosted Pro reservation pay for one more model call? (migration 0044)
 *
 * Pro differs from every other ledger profile in one way that matters here: ONE generation
 * makes SEVERAL model calls, and the server that spends the money is the generic gateway
 * proxy rather than the task's own endpoint. So the reservation books the whole generation's
 * worst case up front - the Lite shape - and each call is admitted against that booking and
 * settles its real cost into it.
 *
 * Same oracle rule as the judge: a missing record and one owned by somebody else both answer
 * 'not-found'.
 */
export type ProCallAdmission =
  | { status: 'admitted'; calls: number; spentUsd: number }
  | { status: 'not-found' | 'expired' | 'call-limit' | 'cost-ceiling'; calls: number; spentUsd: number };

export interface LiteGenerationStore {
  /** Per-profile counting: one task's traffic never consumes another's allowance. */
  usage(profileId: AiLedgerProfile, userId: string, now: number): Promise<LiteUsageSnapshot>;
  reserve(input: {
    userId: string;
    ipHash: string;
    idempotencyKey: string;
    requestedCategory: string | null;
    now: number;
    profile: LedgerQuotaProfile;
  }): Promise<LiteReservation>;
  get(id: string): Promise<LiteGenerationRecord | null>;
  update(id: string, patch: Partial<LiteGenerationRecord>): Promise<LiteGenerationRecord | null>;
  /**
   * Admit ONE skin judgement against a generation the user owns, atomically: ownership,
   * liveness, the per-generation cap, and the daily fleet spend ceiling are decided
   * together, and the judge's worst-case cost is BOOKED before the call. Booking first is
   * what makes concurrent judgements safe - adding the cost afterwards from a value read
   * before the call loses one of two overlapping judgements.
   */
  reserveJudge(input: {
    generationId: string;
    userId: string;
    now: number;
    profile: LiteProfile;
  }): Promise<LiteJudgeReservation>;
  /** Reconcile a booked worst case to the provider's real number (never below zero). */
  settleJudgeCost(id: string, deltaUsd: number): Promise<void>;
  /** Admit ONE model call against a hosted Pro reservation - ownership, liveness, the
   *  per-generation call cap and the per-generation cost ceiling, decided together. */
  admitProCall(input: {
    generationId: string;
    userId: string;
    now: number;
    maxCalls: number;
    generationCeilingUsd: number;
  }): Promise<ProCallAdmission>;
  /** Settle one Pro call's real provider cost into the reservation, and count it. The FIRST
   *  settlement replaces the reservation's booked worst case; every later one adds. Called
   *  even when the call failed: a billed call that produced nothing still spent money, and a
   *  ledger that recorded only successes is how a wholesale failure reports $0.0000. */
  recordProCall(input: {
    generationId: string;
    userId: string;
    costUsd: number;
    /** Push the reservation's lease this far forward - the heartbeat that lets a Pro fleet
     *  slot follow the WORK rather than the clock (migration 0046). Only ever forward. */
    leaseMs: number;
  }): Promise<void>;
  qualityPriors(input: {
    now: number;
    windowDays: number;
    minSamples: number;
  }): Promise<LiteVariantQualityPrior[]>;
}

const ACTIVE_FOR_USER = new Set<LiteGenerationStatus>(['reserved', 'model_running', 'spec_ready']);
// Fleet capacity protects paid provider work. Once a spec is ready the provider slot is
// free; browser validation may still hold the user's own one-at-a-time guard.
const ACTIVE_FOR_FLEET = new Set<LiteGenerationStatus>(['reserved', 'model_running']);
const SUCCESS = new Set<LiteGenerationStatus>(['usable', 'accepted']);

function newRecord(input: Parameters<LiteGenerationStore['reserve']>[0]): LiteGenerationRecord {
  return {
    id: randomUUID(),
    userId: input.userId,
    ipHash: input.ipHash,
    idempotencyKey: input.idempotencyKey,
    profile: input.profile.id,
    status: 'reserved',
    promptVersion: input.profile.promptVersion,
    requestedCategory: input.requestedCategory,
    resolvedCategory: null,
    resolvedVariantId: null,
    intentKind: null,
    provider: null,
    model: null,
    attemptCount: 0,
    repairCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    // Reserve the worst-case session amount until provider usage reconciles it.
    providerCostUsd: input.profile.maxProviderCostUsd,
    validationRuleCodes: [],
    adjustments: [],
    runtimeMs: null,
    rejectionReason: null,
    feedbackReason: null,
    judgeCount: 0,
    proCallCount: 0,
    createdAt: input.now,
    updatedAt: input.now,
    expiresAt: input.now + input.profile.expiryMs,
  };
}

export function modelResultPatch(result: ModelResult): Partial<LiteGenerationRecord> {
  return {
    provider: result.provider,
    model: result.model,
    attemptCount: result.attempts.reduce((sum, item) => sum + item.attempts, 0),
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedInputTokens: result.usage.cachedInputTokens ?? 0,
    reasoningTokens: result.usage.reasoningTokens ?? 0,
    // The estimate includes the gateway's request fee; with no estimate, the fee is still known.
    providerCostUsd: result.usage.estimatedCost?.amount ?? result.usage.requestFeeUsd ?? 0,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;

export class MemoryLiteGenerationStore implements LiteGenerationStore {
  private readonly records = new Map<string, LiteGenerationRecord>();

  async usage(profileId: AiLedgerProfile, userId: string, now: number): Promise<LiteUsageSnapshot> {
    const records = [...this.records.values()].filter((record) => record.profile === profileId);
    // A Pro reservation that never settled a call spent NOTHING - the row still carries its
    // booked worst case, and it either failed or ran out its lease unreported. Such a row
    // neither consumed a start nor any of the fleet's money, so the counts release it the
    // moment it is terminal or expired. Predicate mirrored from migration 0049's
    // `ai_task_usage`; deliberately Pro-only - Lite's analog (a pre-call failure keeping its
    // $0.007 booking) is real but an order of magnitude less acute, and its quota semantics
    // change on its own evidence, not as a rider here.
    const released = (record: LiteGenerationRecord): boolean =>
      profileId === 'pro'
      && record.proCallCount === 0
      && (record.status === 'failed' || record.status === 'expired' || record.expiresAt <= now);
    const counted = records.filter((record) => !released(record));
    const userRecords = counted.filter((record) => record.userId === userId);
    return {
      dailyStarts: userRecords.filter((record) => record.createdAt >= now - DAY).length,
      monthlyStarts: userRecords.filter((record) => record.createdAt >= now - MONTH).length,
      dailySuccesses: userRecords.filter((record) => record.createdAt >= now - DAY && SUCCESS.has(record.status)).length,
      monthlySuccesses: userRecords.filter((record) => record.createdAt >= now - MONTH && SUCCESS.has(record.status)).length,
      activeForUser: userRecords.filter((record) => ACTIVE_FOR_USER.has(record.status) && record.expiresAt > now).length,
      activeGlobal: counted.filter((record) => ACTIVE_FOR_FLEET.has(record.status) && record.expiresAt > now).length,
      dailyFleetSpendUsd: counted
        .filter((record) => record.createdAt >= now - DAY)
        .reduce((sum, record) => sum + record.providerCostUsd, 0),
    };
  }

  async reserve(input: Parameters<LiteGenerationStore['reserve']>[0]): Promise<LiteReservation> {
    const duplicate = [...this.records.values()].find((record) =>
      record.userId === input.userId && record.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return { status: 'duplicate', record: duplicate };
    const usage = await this.usage(input.profile.id, input.userId, input.now);
    if (usage.dailyStarts >= input.profile.dailyStarts) return { status: 'daily-start-limit' };
    if (usage.monthlyStarts >= input.profile.monthlyStarts) return { status: 'monthly-start-limit' };
    if (usage.dailySuccesses >= input.profile.dailySuccesses) return { status: 'daily-success-limit' };
    if (usage.monthlySuccesses >= input.profile.monthlySuccesses) return { status: 'monthly-success-limit' };
    if (usage.activeForUser >= input.profile.maxConcurrentPerUser) return { status: 'user-concurrency' };
    if (usage.activeGlobal >= input.profile.maxConcurrentFleet) return { status: 'fleet-concurrency' };
    if (usage.dailyFleetSpendUsd + input.profile.maxProviderCostUsd > input.profile.dailyFleetSpendUsd) {
      return { status: 'fleet-spend' };
    }
    const record = newRecord(input);
    this.records.set(record.id, record);
    return { status: 'created', record };
  }

  async get(id: string): Promise<LiteGenerationRecord | null> {
    return this.records.get(id) ?? null;
  }

  async reserveJudge(input: Parameters<LiteGenerationStore['reserveJudge']>[0]): Promise<LiteJudgeReservation> {
    const record = this.records.get(input.generationId);
    if (!record || record.userId !== input.userId) return { status: 'not-found' };
    if (record.expiresAt <= input.now) return { status: 'expired' };
    if (record.judgeCount >= input.profile.judgeMaxPerGeneration) return { status: 'judge-limit' };
    const usage = await this.usage('lite', input.userId, input.now);
    if (usage.dailyFleetSpendUsd + input.profile.judgeMaxCostUsd > input.profile.dailyFleetSpendUsd) {
      return { status: 'fleet-spend' };
    }
    const next: LiteGenerationRecord = {
      ...record,
      judgeCount: record.judgeCount + 1,
      providerCostUsd: record.providerCostUsd + input.profile.judgeMaxCostUsd,
      updatedAt: input.now,
    };
    this.records.set(record.id, next);
    return { status: 'created', judgeCount: next.judgeCount };
  }

  async settleJudgeCost(id: string, deltaUsd: number): Promise<void> {
    const current = this.records.get(id);
    if (!current) return;
    this.records.set(id, {
      ...current,
      providerCostUsd: Math.max(0, current.providerCostUsd + deltaUsd),
      updatedAt: Date.now(),
    });
  }

  async admitProCall(input: Parameters<LiteGenerationStore['admitProCall']>[0]): Promise<ProCallAdmission> {
    const record = this.records.get(input.generationId);
    if (!record || record.userId !== input.userId || record.profile !== 'pro') {
      return { status: 'not-found', calls: 0, spentUsd: 0 };
    }
    const seen = { calls: record.proCallCount, spentUsd: record.providerCostUsd };
    if (record.expiresAt <= input.now) return { status: 'expired', ...seen };
    if (record.proCallCount >= input.maxCalls) return { status: 'call-limit', ...seen };
    // Only once a real cost has been settled: while attemptCount is 0 the row still carries
    // the booked worst case, which IS the ceiling and would refuse the first call.
    if (record.proCallCount > 0 && record.providerCostUsd > input.generationCeilingUsd) {
      return { status: 'cost-ceiling', ...seen };
    }
    return { status: 'admitted', ...seen };
  }

  async recordProCall(input: Parameters<LiteGenerationStore['recordProCall']>[0]): Promise<void> {
    const record = this.records.get(input.generationId);
    if (!record || record.userId !== input.userId || record.profile !== 'pro') return;
    this.records.set(record.id, {
      ...record,
      proCallCount: record.proCallCount + 1,
      providerCostUsd: (record.proCallCount === 0 ? 0 : record.providerCostUsd) + Math.max(0, input.costUsd),
      // Only ever forward: a late settlement from a call that overran must not shorten a lease
      // a later call already extended.
      expiresAt: Math.max(record.expiresAt, Date.now() + Math.max(0, input.leaseMs)),
      updatedAt: Date.now(),
    });
  }

  async update(id: string, patch: Partial<LiteGenerationRecord>): Promise<LiteGenerationRecord | null> {
    const current = this.records.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, id: current.id, userId: current.userId, updatedAt: Date.now() };
    this.records.set(id, next);
    return next;
  }

  async qualityPriors(input: Parameters<LiteGenerationStore['qualityPriors']>[0]): Promise<LiteVariantQualityPrior[]> {
    const since = input.now - input.windowDays * DAY;
    const groups = new Map<string, LiteVariantQualityPrior>();
    for (const record of this.records.values()) {
      if (
        record.createdAt < since
        || !record.resolvedVariantId
        || !record.intentKind
        || (record.status !== 'accepted' && record.rejectionReason !== 'user_discarded')
      ) continue;
      const key = `${record.intentKind}:${record.resolvedVariantId}`;
      const prior = groups.get(key) ?? {
        variantId: record.resolvedVariantId,
        intentKind: record.intentKind,
        accepted: 0,
        discarded: 0,
      };
      if (record.status === 'accepted') prior.accepted += 1;
      else prior.discarded += 1;
      groups.set(key, prior);
    }
    return [...groups.values()]
      .filter((prior) => prior.accepted + prior.discarded >= input.minSamples)
      .sort((a, b) => {
        const aRate = a.accepted / (a.accepted + a.discarded);
        const bRate = b.accepted / (b.accepted + b.discarded);
        return bRate - aRate || (b.accepted + b.discarded) - (a.accepted + a.discarded);
      })
      .slice(0, 24);
  }
}

let memoryStore: MemoryLiteGenerationStore | null = null;
let storePromise: Promise<LiteGenerationStore> | null = null;

function evaluationMemoryLedgerEnabled(): boolean {
  return process.env.AI_LITE_EVAL_MEMORY_LEDGER === '1'
    && process.env.NODE_ENV !== 'production'
    && process.env.VERCEL !== '1';
}

/** Managed Lite must never depend on an ephemeral function instance for quotas or IP hashing. */
export function liteLedgerConfigured(): boolean {
  const salt = (process.env.IP_HASH_SALT ?? '').trim();
  if (evaluationMemoryLedgerEnabled()) return salt.length >= 16;
  const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim();
  return Boolean(url && supabaseSecretKey() && salt.length >= 16);
}

export async function getLiteGenerationStore(): Promise<LiteGenerationStore> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    if (evaluationMemoryLedgerEnabled()) {
      memoryStore ??= new MemoryLiteGenerationStore();
      return memoryStore;
    }
    if (supabaseSecretKey() && (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)) {
      const { SupabaseLiteGenerationStore } = await import('./aiLiteStoreSupabase.js');
      return new SupabaseLiteGenerationStore();
    }
    memoryStore ??= new MemoryLiteGenerationStore();
    return memoryStore;
  })();
  return storePromise;
}
