#!/usr/bin/env node
// THE LANDING HOLD - read by ci.yml's `CI gate`, set and lifted by landing-hold.yml.
//
//   node scripts/landing-hold.mjs check          # in the gate: exit 0 when off, 1 when on or unreadable
//   node scripts/landing-hold.mjs set on|off     # in landing-hold.yml: REASON, ACTOR, RUN_URL in the environment
//
// While the hold is on, the CI gate fails on every pull request and merge group, so nothing
// reaches `main`: no landing, so no production deploy and no migration (post-land.yml runs on a
// push to main). docs/LANDING_HOLD.md is the guide; the rules are R1 to R10 under "OS0" in
// docs/work-specs/obs-scenes/spec.md.
//
// THE STATE IS AN OPEN ISSUE WITH THE `landing-hold` LABEL. The workflow token can write issues
// but not repository variables, and an issue is visible, linkable and carries who set it and why.
// Closing it by hand also lifts the hold; the workflow is the way that records a reason.
//
// FAIL CLOSED. Anything short of a successful read that says "no open hold issue" is not "off":
// no token, an API error after every attempt, a timeout or an answer that is not a list.
//
// Node builtins only: the gate job has no dependencies installed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LABEL = 'landing-hold';
export const TITLE = 'Landing hold';
export const GUIDE = 'docs/LANDING_HOLD.md';
export const ATTEMPTS = 3;
const TIMEOUT_MS = 15_000;
const REASON_MAX = 300;

export class HoldUnreadable extends Error {}

/** One line, trimmed and bounded: a reason goes into an annotation and an issue body. */
export function oneLine(text, max = REASON_MAX) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A GitHub REST caller with bounded retries. Every failure after the last attempt throws. */
export function makeApi({ fetch = globalThis.fetch, token, repo, base = 'https://api.github.com', attempts = ATTEMPTS, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!token) throw new HoldUnreadable('no GitHub token in the environment');
  if (!repo || !/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new HoldUnreadable(`no repository in the environment (got '${repo ?? ''}')`);
  return async function api(method, route, body, { accept = [] } = {}) {
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await fetch(`${base}/repos/${repo}${route}`, {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28',
            ...(body ? { 'content-type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.ok || accept.includes(response.status)) {
          const text = await response.text();
          return { status: response.status, data: text ? JSON.parse(text) : null };
        }
        last = new Error(`${method} ${route} answered ${response.status}`);
      } catch (error) {
        last = error;
      }
      if (attempt < attempts) await sleep(2000 * attempt);
    }
    throw new HoldUnreadable(`${last?.message ?? 'unknown error'} (after ${attempts} attempts)`);
  };
}

/** Who set the hold and why, from the body this script writes. Unknown parts say so. */
export function describe(issue) {
  const body = String(issue?.body ?? '');
  const field = (name) => oneLine(new RegExp(`^${name}: (.*)$`, 'm').exec(body)?.[1] ?? '');
  return {
    number: issue?.number,
    url: issue?.html_url ?? '',
    // An issue labelled by hand still holds (R1); it names whoever opened it.
    setBy: field('Set by') || (issue?.user?.login ? `${oneLine(issue.user.login)} (opened the issue by hand)` : 'unknown (see the issue)'),
    reason: field('Reason') || 'none given',
    since: issue?.created_at ?? '',
  };
}

/** R1: on exactly when an open issue (not a pull request) carries the label. Throws when unreadable. */
export async function readHold(api) {
  const { data } = await api('GET', `/issues?state=open&labels=${LABEL}&per_page=100`);
  if (!Array.isArray(data)) throw new HoldUnreadable('the issue list was not a list');
  const holds = data.filter((item) => item && typeof item === 'object' && !item.pull_request && item.state === 'open'
    && Array.isArray(item.labels) && item.labels.some((label) => (typeof label === 'string' ? label : label?.name) === LABEL));
  return { on: holds.length > 0, holds: holds.map(describe) };
}

/** An annotation message stays on one line. */
const annotate = (text) => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** R3/R4/R5: what the gate prints and its exit code. */
export function verdict(result) {
  if (result.error) {
    return {
      code: 1,
      lines: [`::error title=CI gate::Landing hold state could not be read (${annotate(oneLine(result.error))}). The gate fails closed; re-run this job once GitHub answers. ${GUIDE}`],
    };
  }
  if (!result.on) return { code: 0, lines: ['Landing hold: off.'] };
  return {
    code: 1,
    lines: result.holds.map((hold) => `::error title=CI gate::Landing hold: set by ${annotate(hold.setBy)}, reason: ${annotate(hold.reason)}. ${hold.url}. Nothing lands until it is lifted; then re-run this job and queue again (${GUIDE}).`),
  };
}

export async function check(api) {
  try {
    return verdict(await readHold(api));
  } catch (error) {
    return verdict({ error: error?.message ?? String(error) });
  }
}

function holdBody({ actor, reason, runUrl }) {
  return [
    'The landing hold is on: the CI gate fails on every pull request and merge group until it is lifted.',
    '',
    `Set by: ${oneLine(actor)}`,
    `Reason: ${oneLine(reason)}`,
    `Run: ${oneLine(runUrl)}`,
    '',
    `Set and lift it with the Landing hold workflow; ${GUIDE} says how and what it does not cover.`,
  ].join('\n');
}

/** R7: put the hold in the requested state. Idempotent. */
export async function set(api, { state, actor, reason, runUrl }) {
  if (state !== 'on' && state !== 'off') throw new Error(`state must be 'on' or 'off', got '${state}'`);
  if (!oneLine(reason)) throw new Error('a reason is required');
  if (!oneLine(actor)) throw new Error('the actor is required');
  const current = await readHold(api);
  if (state === 'on') {
    if (current.on) {
      const [first] = current.holds;
      await api('PATCH', `/issues/${first.number}`, { body: holdBody({ actor, reason, runUrl }) });
      await api('POST', `/issues/${first.number}/comments`, { body: `Set again by ${oneLine(actor)}: ${oneLine(reason)} (${oneLine(runUrl)})` });
      return { changed: false, numbers: [first.number] };
    }
    await api('POST', '/labels', { name: LABEL, color: 'b60205', description: 'While open, the CI gate fails on every pull request and merge group' }, { accept: [422] });
    const { data } = await api('POST', '/issues', { title: TITLE, body: holdBody({ actor, reason, runUrl }), labels: [LABEL] });
    return { changed: true, numbers: [data?.number] };
  }
  for (const hold of current.holds) {
    await api('POST', `/issues/${hold.number}/comments`, { body: `Lifted by ${oneLine(actor)}: ${oneLine(reason)} (${oneLine(runUrl)})` });
    await api('PATCH', `/issues/${hold.number}`, { state: 'closed', state_reason: 'completed' });
  }
  return { changed: current.on, numbers: current.holds.map((hold) => hold.number) };
}

/** R8: read the hold back with the gate's own reader until it matches, or fail. The list can lag a write. */
export async function confirm(api, state, { tries = 5, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  for (let i = 1; i <= tries; i += 1) {
    const result = await readHold(api);
    if (result.on === (state === 'on')) return result;
    if (i < tries) await sleep(3000);
  }
  throw new Error(`the hold still does not read '${state}' after ${tries} reads`);
}

export async function main(argv = process.argv.slice(2), env = process.env, { fetch, out = console.log } = {}) {
  const [command, state] = argv;
  let api;
  try {
    api = makeApi({ fetch, token: env.GITHUB_TOKEN || env.GH_TOKEN, repo: env.GITHUB_REPOSITORY || env.GH_REPO, base: env.GITHUB_API_URL || undefined });
  } catch (error) {
    if (command === 'check') {
      const { code, lines } = verdict({ error: error.message });
      lines.forEach((line) => out(line));
      return code;
    }
    throw error;
  }
  if (command === 'check') {
    const { code, lines } = await check(api);
    lines.forEach((line) => out(line));
    return code;
  }
  if (command === 'set') {
    const result = await set(api, { state, actor: env.ACTOR, reason: env.REASON, runUrl: env.RUN_URL });
    const after = await confirm(api, state);
    out(`Landing hold: ${state}${result.changed ? '' : ' (it already was)'}. ${after.holds.map((hold) => hold.url).join(' ')}`.trim());
    return 0;
  }
  throw new Error('usage: landing-hold.mjs check | set on|off');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.log(`::error title=Landing hold::${annotate(error?.message ?? String(error))}`);
    process.exitCode = 1;
  });
}
