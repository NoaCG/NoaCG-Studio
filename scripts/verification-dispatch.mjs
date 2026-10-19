#!/usr/bin/env node
// Observe before the existing dispatch. Observation never gates, retries or replaces that call.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobsDir, readJobs } from './jobs-store.mjs';
import { lookupVerification, requestGap, requestIdentity } from './verification-lookup.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SHA = /^[a-f0-9]{40}$/;
const LOOKUP_MS = 8_000;
const PUBLIC_REPOSITORY = /^[\w.-]+\/[\w.-]+$/;

/** Bounded reads only. Dispatch continues to use the caller's original runner and options. */
export function lookupRunner(args, { timeout = 3000, binary = false } = {}) {
  const result = spawnSync('gh', args, { encoding: binary ? null : 'utf8', windowsHide: true,
    timeout, maxBuffer: 1024 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
  return { status: result.error ? 1 : result.status ?? 1, out: result.stdout ?? (binary ? Buffer.alloc(0) : ''), err: '' };
}

export function ciInputs(source, supplied = {}) {
  // Support only the currently declared CI inputs, validating their actual definitions/defaults.
  // An unknown workflow/schema/default fails observation instead of guessing coverage.
  const inputSection = / {2}workflow_dispatch:\s*\n {4}inputs:\s*\n([\s\S]*?)(?=^\S|(?![\s\S]))/m.exec(source)?.[1] ?? '';
  const names = [...inputSection.matchAll(/^ {6}([\w-]+):/gm)].map((m) => m[1]);
  if (JSON.stringify(names) !== JSON.stringify(['diff_base', 'require_review'])
      || !/diff_base:[\s\S]*?^ {8}default: ''\s*$/m.test(inputSection)
      || !/require_review:[\s\S]*?^ {8}type: boolean\s*$[\s\S]*?^ {8}default: false\s*$/m.test(inputSection)
      || Object.keys(supplied).some((key) => !names.includes(key))) throw Error('Unresolved dispatch schema');
  const defaults = { diff_base: '', require_review: false };
  const inputs = { ...defaults, ...supplied };
  if (!['true', 'false', true, false].includes(inputs.require_review) || typeof inputs.diff_base !== 'string') throw Error('Unresolved dispatch inputs');
  inputs.require_review = inputs.require_review === true || inputs.require_review === 'true';
  return { inputs, defaultsSha256: requestIdentity(defaults) };
}

// Decode one bounded JSON file from an exact artifact ZIP. Reuse the existing jszip dependency.
const DECODE = `import JSZip from 'jszip'; let chunks=[]; for await(const c of process.stdin) chunks.push(c);
const zip=await JSZip.loadAsync(Buffer.concat(chunks)); const file=zip.file('verification-evidence.json');
if(!file || file._data.uncompressedSize>262144) process.exit(1);
process.stdout.write(await file.async('string'));`;

function artifactEvidence(run, repo, read, remaining) {
  const response = read(['api', `repos/${repo}/actions/runs/${run.id}/artifacts?per_page=100`]);
  const artifacts = response.artifacts;
  if (!Array.isArray(artifacts) || response.total_count > artifacts.length) throw Error('Unreadable or incomplete artifacts');
  const matches = artifacts.filter((a) => a.name === 'verification-evidence' && a.expired === false);
  if (matches.length !== 1) return null;
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact.id) || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')
      || artifact.workflow_run?.id !== run.id) return null;
  const zip = read(['api', `repos/${repo}/actions/artifacts/${artifact.id}/zip`], true);
  if (`sha256:${sha256(zip)}` !== artifact.digest) return null;
  const decoded = spawnSync(process.execPath, ['--input-type=module', '-e', DECODE], { cwd: path.resolve(import.meta.dirname, '..'),
    input: zip, encoding: 'utf8', windowsHide: true, timeout: remaining(), maxBuffer: 262144 });
  if (decoded.error || decoded.status !== 0) return null;
  const proof = JSON.parse(decoded.stdout);
  if (proof.version !== 1 || proof.runId !== run.id || proof.attempt !== run.run_attempt
      || proof.identity?.repository !== repo || requestGap(proof.identity)
      || proof.workflowRunHead !== run.head_sha || proof.workflowPath !== run.path?.split('@')[0]
      || proof.artifacts?.some((a) => !Number.isSafeInteger(a.id))) return null;
  const reports = (proof.artifacts ?? []).map((report) => {
    const provider = artifacts.find((a) => a.id === report.id && a.name === report.name);
    return { name: report.name, attempt: report.attempt, complete: report.complete === true
        && report.attempt === run.run_attempt && Date.parse(provider?.created_at) >= Date.parse(run.run_started_at),
      expired: provider?.expired !== false, sha256: provider?.digest?.replace(/^sha256:/, ''),
      url: provider ? `https://github.com/${repo}/actions/runs/${run.id}/artifacts/${provider.id}` : null };
  });
  const jobs = read(['api', `repos/${repo}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`]);
  if (!Array.isArray(jobs.jobs) || jobs.total_count > jobs.jobs.length || !Array.isArray(proof.requiredJobs)
      || !proof.requiredJobs.length) return null;
  return { identity: proof.identity, evidenceAttempt: proof.attempt, complete: proof.complete === true,
    evidenceUrl: `https://github.com/${repo}/actions/runs/${run.id}/artifacts/${artifact.id}`,
    reports, jobs: proof.requiredJobs.map((name) => {
      const matches = jobs.jobs.filter((job) => job.name === name && job.run_id === run.id);
      return matches.length === 1 ? { name, status: matches[0].status, conclusion: matches[0].conclusion } : { name, status: 'unknown' };
    }), trust: 'provider-read-back' };
}

export function observeVerification({ workflow = 'ci.yml', ref, expectedRevision, inputs = {}, request: suppliedRequest,
  purpose = 'CI verification', repository: requestedRepository, inputsResolved = true, gh = lookupRunner, dir, now = Date.now, print = console.log,
  evidence = artifactEvidence } = {}) {
  const until = now() + LOOKUP_MS;
  const remaining = () => {
    const left = until - now();
    if (left <= 0) throw Error('Lookup bound reached');
    return Math.max(1, Math.min(3000, left));
  };
  const errors = [], records = [], intents = [];
  let request = suppliedRequest ?? { version: 1, workflow: { path: `.github/workflows/${workflow}` },
    testedRevision: expectedRevision ?? null, inputs, purpose, freshness: null, selection: null, environment: null };
  let complete = false;
  const read = (args, binary = false) => {
    const result = gh(args, { timeout: remaining(), binary, allowFailure: true });
    if (result.status !== 0) throw Error('Verification read failed');
    return binary ? result.out : JSON.parse(result.out);
  };
  try {
    const store = dir === undefined ? jobsDir() : dir;
    const jobs = readJobs(store, { onUnreadable: () => errors.push('unreadable job record') });
    for (const job of jobs) {
      // Existing admissions alone prove neither CI identity nor a passing external result.
      if (job.verification?.dispatchIntent) intents.push(job.verification.dispatchIntent);
      if (job.verification?.runUrl) records.push({ runId: `job:${job.id}`, status: job.state, url: job.verification.runUrl,
        identity: job.verification.request, trust: 'local-record-only' });
    }
    if (requestedRepository && !PUBLIC_REPOSITORY.test(requestedRepository)) throw Error('Repository unresolved');
    const repository = read(['api', requestedRepository ? `repos/${requestedRepository}` : 'repos/{owner}/{repo}']).full_name;
    if (!PUBLIC_REPOSITORY.test(repository ?? '')) throw Error('Repository unresolved');
    if (suppliedRequest && suppliedRequest.repository !== repository) request = { ...request, resolutionGap: true };
    request = { ...request, repository };
    if (!inputsResolved) request = { ...request, resolutionGap: true };
    const listed = read(['api', `repos/${repository}/actions/runs?per_page=20`]);
    if (!Array.isArray(listed.workflow_runs)) throw Error('Run list unresolved');
    complete = Number.isSafeInteger(listed.total_count) && listed.total_count <= listed.workflow_runs.length;
    for (const run of listed.workflow_runs) {
      records.push({ runId: run.id, attempt: run.run_attempt, status: run.status, conclusion: run.conclusion,
        url: run.html_url, delivery: 'accepted', completedAt: run.updated_at });
    }
    {
      if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw Error('Ref unresolved');
      const commit = read(['api', `repos/${repository}/commits/${encodeURIComponent(ref)}`]).sha;
      if (!SHA.test(commit ?? '') || (expectedRevision && commit !== expectedRevision)) throw Error('Ref moved');
      const file = read(['api', `repos/${repository}/contents/.github/workflows/${encodeURIComponent(workflow)}?ref=${commit}`]);
      if (file.encoding !== 'base64' || typeof file.content !== 'string') throw Error('Workflow unresolved');
      const source = Buffer.from(file.content, 'base64').toString('utf8');
      const resolved = workflow === 'ci.yml' ? ciInputs(source, inputs) : { inputs, defaultsSha256: null };
      const actual = { testedRevision: commit, workflow: { path: `.github/workflows/${workflow}`, revision: commit,
        configurationSha256: sha256(source) }, ...resolved };
      if (suppliedRequest) {
        if (Object.entries(actual).some(([key, value]) => requestIdentity(request[key]) !== requestIdentity(value))) request = { ...request, resolutionGap: true };
      } else request = { ...request, ...actual };
      // Selection/environment/freshness must come from the caller's actual requirement;
      // workflow name, nominal full-suite mode or branch head cannot supply them.
    }
    if (!requestGap(request)) {
      for (let i = 0; i < listed.workflow_runs.length; i += 1) {
        const run = listed.workflow_runs[i];
        if (run.path?.split('@')[0] !== request.workflow.path) continue;
        const proof = evidence(run, repository, read, remaining);
        if (proof) Object.assign(records.find((r) => r.runId === run.id), proof);
      }
    }
  } catch { errors.push('bounded verification lookup failed; existing dispatch policy is unchanged'); }
  const decision = lookupVerification(request, { records, complete, errors, intents }, now());
  // A logging failure must not add a measurement-changing gate either.
  try { print(JSON.stringify(decision)); } catch { /* Preserve the existing dispatch. */ }
  return decision;
}

export function dispatchRecovery({ dispatchCi, command }, { gh, observe = observeVerification, print = console.log } = {}) {
  const args = ['workflow', 'run', 'ci.yml', '--ref', dispatchCi];
  try { observe({ workflow: 'ci.yml', ref: dispatchCi, purpose: 'landing full-CI recovery', print }); } catch { /* Advisory only. */ }
  const result = gh ? gh(args) : spawnSync('gh', args, { encoding: 'utf8', windowsHide: true });
  if (result.status === 0) {
    print(`  ${dispatchCi}: asked for a full CI run (${command}) before re-queueing its landing`); return true;
  }
  print(`  ${dispatchCi}: could NOT ask for a full CI run - run it by hand: ${command}`); return false;
}

export function main(argv = process.argv.slice(2), { gh, observe = observeVerification, print = console.log } = {}) {
  const at = argv.indexOf('--');
  const args = argv.slice(at + 1);
  if (at < 0 || args[0] !== 'workflow' || args[1] !== 'run' || !args[2]) throw Error('Usage: verification-dispatch.mjs [--request <requirement.json>] -- workflow run <workflow> --ref <ref> [-f key=value]');
  let request;
  if (at > 0) {
    if (at !== 2 || argv[0] !== '--request') throw Error('Only --request is supported before --');
    try { request = JSON.parse(readFileSync(argv[1], 'utf8')); }
    catch { request = { resolutionGap: true }; } // A failed observation is not a new dispatch gate.
  }
  const inputs = {};
  let inputsResolved = true;
  const argument = (...names) => {
    for (const name of names) {
      const joined = args.find((value) => value.startsWith(`${name}=`));
      if (joined) return joined.slice(name.length + 1);
      const at = args.indexOf(name);
      if (at >= 0) return args[at + 1];
    }
  };
  for (let i = 3; i < args.length; i += 1) {
    if (['-f', '--raw-field', '-F', '--field'].includes(args[i])) {
      const typed = ['-F', '--field'].includes(args[i]);
      const field = args[++i] ?? '', split = field.indexOf('=');
      if (split > 0) inputs[field.slice(0, split)] = field.slice(split + 1);
      else inputsResolved = false;
      if (typed && field.slice(split + 1).startsWith('@')) inputsResolved = false;
    } else if (['--ref', '--repo', '-R'].includes(args[i])) i += 1;
    else if (!args[i].startsWith('--ref=') && !args[i].startsWith('--repo=')) {
      inputsResolved = false; // JSON stdin, shorthand/unknown fields need explicit resolution.
    }
  }
  const ref = argument('--ref'), repository = argument('--repo', '-R');
  try { observe({ workflow: args[2], ref, repository, inputs, inputsResolved, request, print }); } catch { /* Existing command still runs exactly once. */ }
  const result = gh ? gh(args) : spawnSync('gh', args, { encoding: 'utf8', windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'] });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch { console.error('verification-dispatch: invalid command/requirement; nothing dispatched'); process.exitCode = 2; }
}
