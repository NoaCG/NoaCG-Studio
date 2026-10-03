// The two RPCs of timed cues on a published production (migration 0075), apart from the engine
// that calls them (cueArmWire.ts), so the engine runs in Node with stand-ins
// (scripts/cue-auto.test.mjs).

import { getSupabase } from '../backend/supabase';
import { readWireArm, type WireArm } from './cueAuto';

export type ArmRequest = 'arm' | 'aired' | 'hold' | 'resume' | 'cancel' | 'fire';
export type ArmReason = 'gone' | 'waiting' | 'early' | 'held' | 'missed' | 'due' | 'late';

/** What `control_cue_arm` answered. `rev` is the head's seq the answer stands at; `at` the server's
 *  clock when it decided; `arm` the lane's arm as it now stands, null once it ended or was never. */
export interface ArmAnswer {
  ok: boolean;
  reason?: ArmReason;
  /** How long to wait before asking again (`early`, `waiting`). */
  ms?: number;
  /** The row the answer wrote, if any. */
  op?: string;
  rev: number;
  at: number;
  arm: WireArm | null;
}

export function readArmAnswer(data: unknown): ArmAnswer | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.ok !== 'boolean' || typeof d.rev !== 'number' || typeof d.at !== 'number') return null;
  return {
    ok: d.ok,
    rev: d.rev,
    at: d.at,
    arm: readWireArm(d.arm),
    ...(typeof d.reason === 'string' ? { reason: d.reason as ArmReason } : {}),
    ...(typeof d.ms === 'number' ? { ms: d.ms } : {}),
    ...(typeof d.op === 'string' ? { op: d.op } : {}),
  };
}

/** One arm operation (`control_cue_arm`). Null when it did not answer (a network fault, a lock
 *  wait it gave up on): the engine asks again shortly. `by` is the asking page's id, so a fire
 *  whose answer was lost can be asked again by the page that won it. */
export async function controlCueArm(slug: string, lane: string, cue: string, op: ArmRequest, by: string): Promise<ArmAnswer | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_cue_arm', { p_slug: slug, p_lane: lane, p_cue: cue, p_op: op, p_by: by });
  return error ? null : readArmAnswer(data);
}

export type ArmsRead =
  | { ok: true; arms: Record<string, WireArm>; rev: number; at: number }
  /** `missing`: the server has no 0075, so a published production does not time its cues. */
  | { ok: false; missing: boolean };

/** Every lane's live arm (`control_cue_arms_for`): what a page opening or reloading counts. */
export async function controlCueArmsFor(slug: string): Promise<ArmsRead> {
  const sb = await getSupabase();
  if (!sb) return { ok: false, missing: true };
  const { data, error } = await sb.rpc('control_cue_arms_for', { p_slug: slug });
  if (error) return { ok: false, missing: error.code === 'PGRST202' };
  const d = (data ?? {}) as { arms?: Record<string, unknown>; rev?: unknown; at?: unknown };
  if (typeof d.rev !== 'number' || typeof d.at !== 'number') return { ok: false, missing: false };
  const arms: Record<string, WireArm> = {};
  for (const [lane, value] of Object.entries(d.arms ?? {})) {
    const arm = readWireArm(value);
    if (arm) arms[lane] = arm;
  }
  return { ok: true, arms, rev: d.rev, at: d.at };
}

/** What the engine is handed on a page. */
export const CUE_ARM_RPC = { arm: controlCueArm, armsFor: controlCueArmsFor };
