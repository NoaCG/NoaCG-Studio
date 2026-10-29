// Advisory identity/evidence comparison. No dispatch, cache, retry or scheduler lives here.
import { createHash } from 'node:crypto';

export const VERIFICATION_MODE = 'observe'; // Experiment owner has not authorized enforcement.
const sha = (s) => /^[a-f0-9]{40}$/.test(s ?? '');
const hash = (s) => /^[a-f0-9]{64}$/.test(s ?? '');
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export const requestIdentity = (request) => createHash('sha256').update(JSON.stringify(canonical(request)) ?? 'null').digest('hex');
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const time = (s) => typeof s === 'string' ? Date.parse(s) : NaN;

export function requestGap(request) {
  if (request?.resolutionGap) return 'dispatch ref, inputs or configuration differs from the supplied requirement';
  if (request?.version !== 1 || !/^[\w.-]+\/[\w.-]+$/.test(request.repository ?? '')) return 'repository identity is unresolved';
  if (!sha(request.testedRevision)) return 'actual tested revision is unresolved (head SHA alone is insufficient)';
  if (!/^\.github\/workflows\/[\w.-]+\.ya?ml$/.test(request.workflow?.path ?? '')
      || !sha(request.workflow.revision) || !hash(request.workflow.configurationSha256)) return 'workflow/configuration revision is unresolved';
  if (!request.inputs || typeof request.inputs !== 'object' || Array.isArray(request.inputs)
      || Object.values(request.inputs).some((value) => !['string', 'boolean', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value)))
      || !hash(request.defaultsSha256)) return 'resolved dispatch inputs/defaults are unresolved';
  if (!Array.isArray(request.selection) || !request.selection.length || request.selection.some((s) => !nonempty(s))
      || new Set(request.selection).size !== request.selection.length) return 'actual required test selection is unresolved';
  if (!request.environment || typeof request.environment !== 'object' || Array.isArray(request.environment)
      || !Object.keys(request.environment).length || Object.values(request.environment).some((v) => v === null || v === undefined)) return 'relevant execution environment is unresolved';
  if (!nonempty(request.purpose) || !Number.isSafeInteger(request.freshness?.maxAgeMs) || request.freshness.maxAgeMs < 0
      || (request.freshness.since !== undefined && !Number.isFinite(time(request.freshness.since)))) return 'purpose/freshness requirement is unresolved';
  if (!Array.isArray(request.requiredReports) || !request.requiredReports.length
      || request.requiredReports.some((s) => !nonempty(s)) || new Set(request.requiredReports).size !== request.requiredReports.length) return 'required reports are unresolved';
  return null;
}

function sameWork(a, b) {
  // Freshness is a requirement evaluated against completion, not an execution identity shortcut.
  const left = { ...a }, right = { ...b };
  delete left.freshness; delete right.freshness;
  return equal(left, right);
}

function completionGap(record, request, now) {
  if (record.trust !== 'provider-read-back' || !nonempty(record.url) || !nonempty(record.evidenceUrl)) return 'completion provenance is untrusted';
  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1 || record.evidenceAttempt !== record.attempt) return 'run attempt/evidence attempt differs';
  const completed = time(record.completedAt);
  if (!Number.isFinite(completed) || completed > now) return 'completion time is unproved';
  if (now - completed > request.freshness.maxAgeMs || completed < time(request.freshness.since ?? '1970-01-01T00:00:00Z')) return 'evidence is outside the requested freshness';
  if (!Array.isArray(record.reports) || request.requiredReports.some((name) => !record.reports.some((report) => report.name === name
      && report.attempt === record.attempt && report.complete === true && report.expired === false
      && hash(report.sha256) && nonempty(report.url)))) return 'required reports are missing, expired, incomplete or from another attempt';
  if (record.complete !== true || !Array.isArray(record.jobs) || !record.jobs.length
      || record.jobs.some((job) => job.status !== 'completed' || job.conclusion !== 'success')) return 'required completion evidence is incomplete';
  return null;
}

/** The caller supplies provider-read-back evidence, never a head-SHA coverage inference. */
export function lookupVerification(request, { records = [], complete = false, errors = [], intents = [] } = {}, now = Date.now()) {
  const requestId = requestIdentity(request ?? null);
  const links = [...new Set(records.flatMap((r) => [r.url, r.evidenceUrl, ...(r.reports ?? []).map((p) => p.url)]).filter(nonempty))];
  const history = records.map((r) => ({ runId: r.runId, attempt: r.attempt, status: r.status, conclusion: r.conclusion, url: r.url }));
  const decide = (decision, reason, original = null) => ({ mode: VERIFICATION_MODE, decision,
    advisory: decision === 'UNRESOLVED' ? 'UNRESOLVED' : `would ${decision}`, reason, requestId,
    repository: request?.repository ?? null, testedRevision: request?.testedRevision ?? null,
    workflow: request?.workflow?.path ?? null, original, links, history });
  const gap = requestGap(request);
  if (gap) return decide('UNRESOLVED', gap);
  if (intents.some((intent) => (intent.requestId === requestId || !intent.identity || requestGap(intent.identity) || sameWork(request, intent.identity)) && (
    (intent.state === 'accepted' && (!nonempty(intent.evidence) || !records.some((r) => r.runId === intent.runId && r.trust === 'provider-read-back')))
    || (intent.state === 'not-delivered-final' && (intent.authoritative !== true || intent.final !== true || !nonempty(intent.evidence)))
    || !['accepted', 'not-delivered-final'].includes(intent.state)))) return decide('UNRESOLVED', 'persisted dispatch intent has uncertain delivery; reconcile before replay');
  // A newer attempt supersedes completion evidence of an earlier attempt of that run. Keep all history.
  const latest = new Map();
  const uncertainAttempts = new Set(records.filter((r) => !Number.isSafeInteger(r.attempt) || r.attempt < 1).map((r) => r.runId));
  for (const record of records) {
    if (!latest.has(record.runId) || (record.attempt ?? 0) > (latest.get(record.runId).attempt ?? 0)) latest.set(record.runId, record);
  }
  let unresolved = errors.length > 0 || !complete;
  let stale = false;
  const failed = [...latest.values()].filter((record) => record.identity && !requestGap(record.identity)
    && sameWork(request, record.identity) && record.status === 'completed' && record.conclusion !== 'success');
  for (const record of latest.values()) {
    if (record.runId === undefined || uncertainAttempts.has(record.runId)) { unresolved = true; continue; }
    if (!record.identity || requestGap(record.identity)) { unresolved = true; continue; }
    if (!sameWork(request, record.identity)) continue;
    const original = { runId: record.runId, attempt: record.attempt, url: record.url, evidenceUrl: record.evidenceUrl ?? null };
    if (record.trust !== 'provider-read-back' || record.delivery !== 'accepted' || !Number.isSafeInteger(record.attempt) || record.attempt < 1) { unresolved = true; continue; }
    if (['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(record.status)) return decide('WAIT', 'equivalent verification is pending or running', original);
    if (record.status !== 'completed') { unresolved = true; continue; }
    if (!['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'neutral', 'action_required', 'stale', 'startup_failure'].includes(record.conclusion)) { unresolved = true; continue; }
    if (record.conclusion !== 'success') continue; // Preserve failure history; never reuse it.
    const missing = completionGap(record, request, now);
    if (!missing && !failed.length) return decide('REUSE', 'complete trusted evidence satisfies this exact requirement', original);
    if (!missing) return decide('RUN', 'equivalent failure history requires existing failure/repair policy before any new verification', original);
    if (missing.includes('freshness')) stale = true;
    else unresolved = true;
  }
  if (unresolved) return decide('UNRESOLVED', 'identity, delivery, lookup completeness or required completion evidence could not be established');
  return decide('RUN', stale ? 'equivalent evidence is outside the requested freshness; existing retry/repair policy still applies'
    : 'no passing equivalent verification satisfies this request; existing retry/repair policy still applies');
}

/** Offline enforcement design only. No live caller imports or activates it. */
export function offlineEnforcement(decision, { activation, owner, intent, reconciliation, policyAllowsRun = false, policyAllowsReuse = false } = {}) {
  if (!nonempty(activation?.experimentOwner) || !nonempty(activation.measurementCompleteEvidence)) return { action: 'OBSERVE', reason: 'experiment owner has not confirmed measurement complete' };
  if (owner?.mode !== 'single-authoritative' || owner.acceptanceFenced !== true || !nonempty(owner.evidence)) return { action: 'UNRESOLVED', reason: 'dispatch acceptance requires authoritative ownership; local locks do not fence other machines' };
  if (intent) {
    if (intent.requestId !== decision.requestId || !nonempty(intent.id)) return { action: 'UNRESOLVED', reason: 'original persisted intent identity differs' };
    if (!reconciliation || reconciliation.intentId !== intent.id || reconciliation.requestId !== intent.requestId || !nonempty(reconciliation.evidence)) return { action: 'UNRESOLVED', reason: 'reconcile the original persisted intent before replay' };
    if ((intent.runUrl && reconciliation.runUrl !== intent.runUrl)
        || (intent.state === 'accepted' && reconciliation.state !== 'accepted')) return { action: 'UNRESOLVED', reason: 'accepted delivery identity cannot change or become non-delivery' };
    if (reconciliation.state === 'accepted' && nonempty(reconciliation.runUrl)) return { action: 'WAIT', original: reconciliation.runUrl };
    if (reconciliation.state !== 'not-delivered' || reconciliation.authoritative !== true || reconciliation.final !== true) return { action: 'UNRESOLVED', reason: 'delivery remains uncertain' };
  }
  if (decision.decision === 'RUN' && !policyAllowsRun) return { action: 'UNRESOLVED', reason: 'RUN does not override failure handling, repair limits or retry restrictions' };
  if (decision.decision === 'REUSE' && !policyAllowsReuse) return { action: 'UNRESOLVED', reason: 'REUSE also requires the existing failure/retry policy to permit that evidence' };
  return { action: decision.decision, reason: 'offline model only; live enforcement remains disabled' };
}
