// Native adapters can use these guards before dispatch; this module calls no provider.
// A validated receipt is evidence, not a distributed lock or permission implementation.
import { createHash } from 'node:crypto';
import { authorizationEnd, untilComplete, validateAuthorization } from './project-authorization.mjs';

const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const timestamp = (value) => typeof value === 'string' ? Date.parse(value) : NaN;
const unknown = (reason) => ({ state: 'unknown', reason });
const bindingFields = ['provider', 'sessionId', 'environmentId', 'revision', 'policySha256'];
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};

/** Fingerprint the actual effective policy, never credentials or a claimed permission mode. */
export function policyFingerprint(policy) {
  if (!policy || !nonempty(policy.approval) || !nonempty(policy.sandbox)
      || !nonempty(policy.network) || !Array.isArray(policy.writableRoots)
      || policy.writableRoots.some((root) => !nonempty(root))) throw new Error('Effective approval, sandbox, network and writableRoots required');
  return createHash('sha256').update(JSON.stringify(canonical(policy))).digest('hex');
}

/** A read-only native inspection must establish identity, freshness and equivalent permissions. */
export function inspectNative(expected, observed, now = Date.now(), maxAgeMs = 30_000) {
  if (!expected || bindingFields.some((key) => !nonempty(expected[key]))) return unknown('incomplete expected native binding');
  if (!observed || bindingFields.some((key) => observed[key] !== expected[key])) return unknown('native identity or effective policy differs');
  const at = timestamp(observed.observedAt);
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0 || !Number.isFinite(at) || at > now || now - at > maxAgeMs
      || !nonempty(observed.evidence)) return unknown('inspection is stale or lacks evidence');
  if (observed.state === 'waiting' && ['owner', 'permission', 'dependency', 'usage'].includes(observed.wait?.kind)
      && nonempty(observed.wait.reason) && (observed.wait.until === null || Number.isFinite(timestamp(observed.wait.until)))) {
    return { state: 'waiting', wait: observed.wait };
  }
  if (observed.state === 'running') return { state: 'running', workerId: observed.sessionId };
  // An idle or missing session may still have a pending turn. Require the native observation
  // to establish the absence of in-flight work; PID, silence and a partial list do not suffice.
  if (observed.state === 'idle' && observed.pendingTurn === false) return { state: 'gone' };
  return unknown('native work may still be in flight');
}

/** Used for a launch, follow-up or scheduler submission after its intent was persisted. */
export function reconcileNative(intent, observation) {
  if (!intent || !nonempty(intent.actionId) || !nonempty(intent.requestSha256)
      || bindingFields.some((key) => !nonempty(intent[key]))) return unknown('durable intent and native binding required');
  if (!observation || observation.actionId !== intent.actionId || observation.requestSha256 !== intent.requestSha256
      || bindingFields.some((key) => observation[key] !== intent[key])
      || !nonempty(observation.evidence)) return unknown('submission is not uniquely reconciled');
  if (observation.state === 'accepted' && nonempty(observation.nativeId)) {
    if (intent.nativeId && intent.nativeId !== observation.nativeId) return unknown('native submission identity changed');
    return { state: 'delivered', workerId: observation.nativeId };
  }
  // Only the receiving provider can establish final non-delivery. An empty catalog, matching
  // title/nonce, timeout, missing local receipt or a successful list is insufficient.
  if (!intent.nativeId && !observation.nativeId && observation.state === 'not-delivered' && observation.authoritative === true
      && observation.final === true) return { state: 'not-delivered' };
  return unknown('retain the original intent; do not resubmit');
}

/** Admission for the next one-shot wake, not an implementation of a scheduler. */
export function rearmNative({ authorization, target, previous, next, kind = 'wave', terminal = false, wait = null, block = null, paused = false }, now = Date.now()) {
  const start = timestamp(authorization?.startedAt), end = timestamp(authorization?.deadline);
  if (!nonempty(authorization?.source) || !nonempty(authorization?.scope) || !nonempty(authorization?.permissionPolicy)
      || !Number.isFinite(start) || !Number.isFinite(end) || start > now || end <= start) {
    return unknown('explicit original finite authorization required');
  }
  try { validateAuthorization(authorization, { now, kind, open: false }); }
  catch { return unknown('invalid original authorization or overlong wave'); }
  const authorizedEnd = authorizationEnd(authorization);
  if (terminal || now >= authorizedEnd) return { state: 'stop' };
  if (kind === 'plan' && (!block || !Number.isFinite(timestamp(block.startedAt))
      || timestamp(block.startedAt) < start || timestamp(block.startedAt) > now
      || !Number.isFinite(timestamp(block.deadline)) || timestamp(block.deadline) > authorizedEnd
      || timestamp(block.deadline) <= timestamp(block.startedAt)
      || timestamp(block.deadline) - timestamp(block.startedAt) > 86_400_000)) return unknown('plan wake requires its original bounded work block');
  if (paused || (block && (now >= timestamp(block.deadline) || timestamp(next?.dueAt) >= timestamp(block.deadline)))) return { state: 'stop' };
  // A completion plan's target is immutable metadata; the provider and wakeHealth need a
  // finite execution bound. Fixed-date callers retain their original receipt contract.
  const deadline = untilComplete(authorization) ? block.deadline : authorization.deadline;
  if (wait) return { state: 'waiting', reason: 'resolve the explicit wait before re-arming' };
  if (!target || ['provider', 'sessionId', 'environmentId', 'policySha256'].some((key) => !nonempty(target[key]))) return unknown('native target required');
  if (authorization.policySha256 !== target.policySha256) return unknown('effective policy differs from original authorization');
  // This is the fired event from the original owner, not the scheduling acknowledgement.
  if (!previous || previous.state !== 'fired' || !nonempty(previous.nativeId) || !nonempty(previous.actionId)
      || !nonempty(previous.evidence) || !Number.isFinite(timestamp(previous.firedAt))
      || timestamp(previous.firedAt) > now || timestamp(previous.firedAt) < start) return unknown('previous wake delivery is unproved');
  if (!next || !nonempty(next.actionId) || next.actionId === previous.actionId
      || next.previousNativeId !== previous.nativeId || next.deadline !== deadline
      || !Number.isFinite(timestamp(next.dueAt)) || timestamp(next.dueAt) <= now || timestamp(next.dueAt) >= timestamp(deadline)) {
    return unknown('next wake must retain its authorized deadline and follow the delivered wake');
  }
  for (const key of ['provider', 'sessionId', 'environmentId', 'policySha256']) {
    if (previous[key] !== target[key] || next[key] !== target[key]) return unknown('wake target or effective policy changed');
  }
  // Optional exact cadence is anchored to raw executor arrival, never provider fire or
  // update time. Both timestamps use canonical UTC milliseconds: Date.parse alone
  // silently truncates finer precision. dueAt describes the actual encoded request.
  if (Object.hasOwn(authorization, 'cadenceMs')) {
    const arrival = timestamp(previous.arrivedAt);
    if (!Number.isSafeInteger(authorization.cadenceMs) || authorization.cadenceMs <= 0
        || !Number.isFinite(arrival) || arrival < start || arrival > now
        || timestamp(next.dueAt) !== arrival + authorization.cadenceMs
        || previous.arrivedAt !== new Date(arrival).toISOString()
        || next.dueAt !== new Date(arrival + authorization.cadenceMs).toISOString()) {
      return unknown('canonical millisecond due must equal executor arrival plus the exact authorized cadence');
    }
  }
  return { state: 'eligible', actionId: next.actionId, dueAt: next.dueAt, deadline };
}

/** A missing re-arm is an observation to surface, never authority to launch another owner. */
export function wakeHealth({ dueAt, firedAt, nextNativeId, terminal = false, deadline }, now = Date.now(), graceMs = 60_000) {
  if (terminal || now >= timestamp(deadline)) return { state: 'stop' };
  if (![timestamp(dueAt), timestamp(deadline), graceMs].every(Number.isFinite) || graceMs < 0
      || timestamp(dueAt) >= timestamp(deadline)) return unknown('invalid wake bounds');
  if (firedAt && (!Number.isFinite(timestamp(firedAt)) || timestamp(firedAt) > now)) return unknown('invalid delivery time');
  if (firedAt && nonempty(nextNativeId)) return { state: 'rearmed' };
  const since = firedAt ? timestamp(firedAt) : timestamp(dueAt);
  return now > since + graceMs ? unknown(firedAt ? 'wake fired without a confirmed next wake' : 'wake delivery overdue') : { state: 'pending' };
}
