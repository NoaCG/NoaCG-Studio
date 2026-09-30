#!/usr/bin/env node
// RE-PROBE the capability observations in scripts/harness-capabilities.json on the INSTALLED builds,
// and keep what each probe saw.
//
//   npm run harness:reprobe                       what would be probed, and how, without spending anything
//   npm run harness:reprobe -- run                probe every observation the installed build has not backed
//   npm run harness:reprobe -- run --free         the same, but only the probes that make no model call
//   npm run harness:reprobe -- run --only <id,id> just these
//   npm run harness:reprobe -- run --codex-cap-until 2026-10-03
//   npm run harness:reprobe -- record <id> --verdict holds|failed|partial|not-probed --evidence "<text>"
//                                          [--fallback "<text>"]... [--reason "<text>"] [--on <version>]
//   npm run harness:reprobe -- show               the newest verdict for each observation
//
// WHY. `npm run harness:usage` compares each observation's `measuredOn` with the installed version
// and names every one that is UNVERIFIED, but it re-tests nothing. The CLIs ship almost daily, so the
// unverified count only ever grows: on 2026-09-30 it read 16 of 22, re-probing had been deferred
// twice, and every wave was routing on those sixteen memories. The probes themselves were written
// down as prose in each observation's `reprobe` field and re-run by hand. This runs the ones that
// are cheap and bounded, one at a time (RAM on this machine is shared with live sessions), and
// writes each verdict to a ledger the morning read can print.
//
// WHAT IT NEVER DOES. It never spends API money: every probe is a CLI's own help or listing, or a
// read-only Antigravity call through `npm run agy:read` on the subscription. It never makes a Codex
// model call - those probes are recorded "not probed", with `--codex-cap-until` naming the usage cap
// when that is the reason. It never edits harness-capabilities.json: a verdict is evidence for the
// person who rewrites an entry, not a rewrite. And it never reads the Antigravity state directory:
// the text scan half of agy-no-usage-surface was refused on 2026-09-30 as credential exploration
// (that directory holds agy's OAuth token), so that half is recorded as not probed.
//
// THE VERDICTS. `holds` - the claim as written describes the installed build. `failed` - the probe
// contradicted it. `partial` - the parts that were probed hold and at least one part was not probed
// or came back inconclusive. `not-probed` - nothing was measured, and `reason` says why. A verdict is
// about the CLAIM TEXT it was measured against: each line carries a digest of that text, so a verdict
// stops applying the moment somebody rewrites the entry.
//
// FALLBACKS. Each line also lists every fallback the probe OBSERVED: a harness doing something other
// than what it was asked (a plan instead of an answer, a warning where a refusal was pinned, remote
// isolation that ran locally), or the probe itself settling for less than its `reprobe` text asks
// for. These are what a routing decision trips on, so they are kept even when the verdict holds.
//
// WHERE THE LEDGER LIVES. `<git-common-dir>/noacg-reprobe.jsonl`, beside the landing queue's job
// store (`<git-common-dir>/noacg-jobs`). Inside `.git`, so it is never tracked and never cloned, it is
// shared by every worktree of this checkout, and it describes this machine's installed builds, which
// is the only thing a re-probe can describe. `NOACG_REPROBE_LEDGER` overrides it.
//
// SESSION PROBES. Some observations are about the Agent tool or a cloud session, which a script
// cannot drive. The session that measures one records it with `record`, and `--on` names the build
// that answered when it is not the installed CLI (a desktop-app session can run a newer Claude Code
// than `claude --version` reports).

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EFFORTLESS_MODELS, appendLedger } from './agy-run.mjs';

// The ledger's path, version and reader live with its reader, harness-usage.mjs, so the two can never
// disagree about where it is or what a line looks like - and so the import runs one way only.
import {
  REPROBE_LEDGER_VERSION,
  REPROBE_VERDICTS as VERDICTS,
  capabilityStandings,
  claimDigest,
  capabilitiesText,
  harnessVersions,
  readCapabilities,
  readReprobeLedger,
  readTextOrNull,
  reprobeLedgerPath,
} from './harness-usage.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** What each Antigravity probe call may take; an empty response at this age is a timeout, not a denial. */
const PRINT_TIMEOUT_SECONDS = 120;

export function ledgerLine({ observation, verdict, probedOn, evidence = [], fallbacks = [], reason = null, by = 'script', at = new Date() }) {
  if (!VERDICTS.includes(verdict)) throw new Error(`unknown verdict "${verdict}" (one of ${VERDICTS.join(', ')})`);
  return {
    v: REPROBE_LEDGER_VERSION,
    at: new Date(at).toISOString(),
    id: observation.id,
    harness: observation.harness,
    probedOn: probedOn ?? null,
    claimDigest: claimDigest(observation.claim),
    verdict,
    ...(reason ? { reason } : {}),
    evidence,
    fallbacks,
    by,
  };
}

// ── The judges: pure, so the test pins each one against the output that settles it ─────────────

/** claude-no-permission-prompts-flag. The entry now records the REFUTATION: the flag exists. */
export function judgePermissionPromptsHelp(helpText) {
  const listed = /--permission-prompts\b/.test(helpText);
  return listed
    ? { verdict: 'holds', evidence: ['claude --help lists --permission-prompts'] }
    : { verdict: 'failed', evidence: ['claude --help no longer lists --permission-prompts'] };
}

/** claude-agents-json-liveness. The entry says the objects carry pid and cwd and NO status field. */
export function judgeClaudeAgentsJson(stdout) {
  let agents;
  try {
    agents = JSON.parse(stdout);
  } catch {
    return { verdict: 'not-probed', reason: 'claude agents --json printed no JSON array', evidence: [] };
  }
  if (!Array.isArray(agents)) return { verdict: 'not-probed', reason: 'claude agents --json printed JSON that is not an array', evidence: [] };
  if (agents.length === 0) return { verdict: 'not-probed', reason: 'no live agent to read the object shape from', evidence: [] };
  const keys = [...new Set(agents.flatMap((agent) => Object.keys(agent ?? {})))].sort();
  const evidence = [`${agents.length} object(s); keys seen: ${keys.join(', ')}`];
  const withStatus = agents.filter((agent) => agent && 'status' in agent);
  if (withStatus.length) {
    const values = [...new Set(withStatus.map((agent) => String(agent.status)))];
    return { verdict: 'failed', evidence: [...evidence, `${withStatus.length} of ${agents.length} carry a status field (values: ${values.join(', ')})`] };
  }
  const missing = agents.some((agent) => !agent || !('pid' in agent) || !('cwd' in agent));
  if (missing) return { verdict: 'failed', evidence: [...evidence, 'an object lacks pid or cwd'] };
  return { verdict: 'holds', evidence: [...evidence, 'no object carries a status field'] };
}

/** codex-agents-has-no-json. */
export function judgeCodexAgentsHelp(helpText) {
  if (!/Usage:\s*codex agents/i.test(helpText)) {
    return { verdict: 'not-probed', reason: 'codex agents --help did not print its usage', evidence: [] };
  }
  const json = /--json\b/.test(helpText);
  return json
    ? { verdict: 'failed', evidence: ['codex agents --help now offers --json'] }
    : { verdict: 'holds', evidence: ['codex agents --help offers no --json and no list-and-exit flag'] };
}

/** The subcommand names under agy's "Available subcommands:" heading. */
function agySubcommands(helpText) {
  const at = helpText.indexOf('Available subcommands');
  if (at < 0) return null;
  return helpText.slice(at).split('\n').slice(1)
    .map((line) => /^\s{2,}([a-z][\w-]*)\s/.exec(line)?.[1])
    .filter(Boolean);
}

/** agy-no-usage-surface, the help half. The disk-scan half is never run here (see the header). */
export function judgeAgyHelp(helpText) {
  const subcommands = agySubcommands(helpText);
  if (!subcommands?.length) return { verdict: 'not-probed', reason: 'agy --help printed no subcommand list', evidence: [] };
  const usage = subcommands.filter((name) => /usage|quota|limit|billing|credit/i.test(name));
  if (usage.length) return { verdict: 'failed', evidence: [`agy --help now lists ${usage.join(', ')}`] };
  return {
    verdict: 'partial',
    evidence: [`agy --help lists no usage or quota subcommand (${subcommands.join(', ')})`],
    fallbacks: ['the text scan of ~/.gemini/antigravity-cli/ was not run: that directory holds agy\'s OAuth token, and a scan of it was refused as credential exploration'],
  };
}

/** The fourteen ids `agy models` listed on 1.1.25 through 1.2.1, in order (docs/HARNESS_ROUTING.md). */
export const AGY_MODEL_INVENTORY = Object.freeze([
  'gemini-3.8-flash-high', 'gemini-3.8-flash-medium', 'gemini-3.8-flash-low',
  'gemini-3.7-flash-high', 'gemini-3.7-flash-medium', 'gemini-3.7-flash-low',
  'gemini-3.6-flash-high', 'gemini-3.6-flash-medium', 'gemini-3.6-flash-low',
  'gemini-3.1-pro-high', 'gemini-3.1-pro-low',
  'claude-sonnet-4-6', 'claude-opus-4-6-thinking', 'gpt-oss-120b-medium',
]);

function parseAgyModels(stdout) {
  return String(stdout ?? '').split('\n').map((line) => /^([a-z0-9][\w.-]*)\t/.exec(line)?.[1]).filter(Boolean);
}

/** agy-model-inventory. */
export function judgeAgyModels(stdout, expected = AGY_MODEL_INVENTORY) {
  const ids = parseAgyModels(stdout);
  if (!ids.length) return { verdict: 'not-probed', reason: 'agy models listed no model id', evidence: [] };
  const added = ids.filter((id) => !expected.includes(id));
  const gone = expected.filter((id) => !ids.includes(id));
  const sameOrder = !added.length && !gone.length && ids.every((id, index) => id === expected[index]);
  if (sameOrder) return { verdict: 'holds', evidence: [`agy models lists the same ${ids.length} ids in the same order`] };
  return {
    verdict: 'failed',
    evidence: [
      `agy models lists ${ids.length} ids`,
      ...(added.length ? [`new: ${added.join(', ')}`] : []),
      ...(gone.length ? [`gone: ${gone.join(', ')}`] : []),
      ...(!added.length && !gone.length ? ['same ids in a different order'] : []),
    ],
  };
}

/** One `npm run agy:read` outcome, reduced to what the judges read. */
export function agyOutcome({ status, stdout = '', stderr = '' }) {
  // Only agy's OWN words count. agy-run's warning and refusal quote the rejection text verbatim,
  // so a match anywhere in stderr would read a call agy accepted as one it rejected.
  const reportedLine = String(stderr).split('\n').find((line) => /agy reported status \w+/.test(line)) ?? '';
  const emptyAfter = /returned an EMPTY response after ([\d.]+)s/.exec(stderr);
  // An empty response at the print timeout is a timeout, not a denial (agy-run says the same).
  const timedOut = emptyAfter !== null && Number(emptyAfter[1]) >= PRINT_TIMEOUT_SECONDS - 5;
  return {
    ok: status === 0,
    response: status === 0 ? String(stdout) : '',
    empty: emptyAfter !== null && !timedOut,
    timedOut,
    reported: /agy reported status (\w+)/.exec(reportedLine)?.[1] ?? null,
    effortRejected: status !== 0 && /--effort is not supported for model/i.test(reportedLine),
    effortWarning: /WARNING - `--effort/.test(stderr),
    refused: /agy-run: REFUSED/.test(stderr),
  };
}

/** agy-claude-models-reject-effort: `{ model: outcome }` for the two Claude ids. */
export function judgeEffortRefusals(outcomes) {
  const evidence = [];
  const fallbacks = [];
  let rejected = 0;
  let accepted = 0;
  for (const [model, outcome] of Object.entries(outcomes)) {
    if (outcome.effortWarning) fallbacks.push(`agy-run downgraded its pinned --effort refusal on ${model} to a warning (the installed agy is not the measured build) and let the call through`);
    if (outcome.effortRejected) {
      rejected += 1;
      evidence.push(`${model}: rejected --effort low ("--effort is not supported for model")`);
    } else if (outcome.ok) {
      accepted += 1;
      evidence.push(`${model}: ACCEPTED --effort low and answered`);
    } else {
      evidence.push(`${model}: failed for another reason (${outcome.refused ? 'refused by agy-run before any call' : outcome.reported ? `status ${outcome.reported}` : 'no recognisable result'})`);
    }
  }
  const total = Object.keys(outcomes).length;
  if (accepted) return { verdict: 'failed', evidence, fallbacks };
  if (rejected === total) return { verdict: 'holds', evidence, fallbacks };
  return { verdict: 'partial', evidence, fallbacks };
}

/** The probe directory both Antigravity listing probes read: four files, one in a subdirectory. */
export const PROBE_FILES = Object.freeze([
  { name: 'alpha.txt', content: 'needle' },
  { name: 'bravo.md', content: 'plain content.' },
  { name: path.join('sub', 'charlie.json'), content: JSON.stringify({ note: 'padding only', pad: 'x'.repeat(84) }) },
  { name: 'delta.log', content: 'needle at the end' },
]);
/** The string the search probe asks for, present in alpha.txt and delta.log only. */
const PROBE_NEEDLE = 'needle';
export const PROBE_NEEDLE_FILES = Object.freeze(['alpha.txt', 'delta.log']);

/** Every probe file's name AND byte size appear in the response. */
export function listingIsAccurate(response, files = PROBE_FILES) {
  const text = String(response ?? '');
  return files.every(({ name, content }) => {
    const base = path.basename(name);
    const size = Buffer.byteLength(content);
    const at = text.indexOf(base);
    if (at < 0) return false;
    // The size must be on the same line as the name, so a table and a list both pass and a stray
    // number elsewhere does not.
    const lineStart = text.lastIndexOf('\n', at) + 1;
    const lineEnd = text.indexOf('\n', at);
    const line = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
    return new RegExp(`(^|[^\\d])${size}([^\\d]|$)`).test(line.replace(base, ''));
  });
}

/** A response that is a plan rather than the answer: it names a plan, and the listing is not in it. */
function isPlanAnswer(response, files = PROBE_FILES) {
  return /\bplan\b/i.test(String(response ?? '')) && !listingIsAccurate(response, files);
}

/** An answer that says it could not do the task: the model's own report that a tool was missing or denied. */
function isCannotAnswer(response, files = PROBE_FILES) {
  const text = String(response ?? '');
  // A partial listing that apologises for one size is inconclusive, not a refusal: only an answer
  // that names none of the files counts as "could not list".
  if (files.some(({ name }) => text.includes(path.basename(name)))) return false;
  return /\b(cannot|can't|can ?not|unable to|not available|no (?:dedicated |non-shell )?(?:directory[- ]listing )?tool)\b/i.test(text);
}

/**
 * An answer that promises the answer later: on 1.2.14 the prefixed listing call came back as "an
 * exploration subagent has been dispatched ... I will provide the complete list as soon as it
 * returns", and the run ended there. Headless, there is no later.
 */
export function isDeferredAnswer(response) {
  return /\b(has been dispatched|will provide|as soon as it|once it (?:returns|completes|finishes))\b/i.test(String(response ?? ''));
}

/** A listing call's outcome as one word: listing, plan, deferred, cannot, empty, error or other. */
export function listingKind(outcome) {
  if (!outcome.ok) return outcome.empty ? 'empty' : outcome.timedOut ? 'timeout' : 'error';
  if (listingIsAccurate(outcome.response)) return 'listing';
  if (isPlanAnswer(outcome.response)) return 'plan';
  if (isDeferredAnswer(outcome.response)) return 'deferred';
  return isCannotAnswer(outcome.response) ? 'cannot' : 'other';
}

/** The start of a response on one line, so the evidence shows what came back instead of a label. */
function excerpt(response, max = 220) {
  const flat = String(response ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
}

/** agy-headless-auto-denies-ungranted-tools: the two actions, judged separately. */
export function judgeAutoDeny({ listing, search }) {
  const evidence = [];
  const fallbacks = [];
  let failed = false;
  let inconclusive = false;
  const listed = listingKind(listing);
  if (listed === 'listing') evidence.push('LISTING allowed: every probe file and byte size came back, checked against the files written');
  else if (listed === 'empty' || listed === 'cannot') {
    failed = true;
    evidence.push(`LISTING no longer works: ${listed === 'empty' ? 'an empty response' : `the answer says it cannot list ("${excerpt(listing.response)}")`}`);
  } else {
    inconclusive = true;
    evidence.push(`LISTING inconclusive (${listed}): ${listing.ok ? `"${excerpt(listing.response)}"` : `the call failed (${listing.reported ?? 'no status'})`}`);
    if (listed === 'plan') fallbacks.push('the listing call answered with a plan instead of the listing');
  }

  const found = PROBE_NEEDLE_FILES.every((name) => search.response.includes(name));
  if (search.empty) evidence.push('SEARCH auto-denied: an empty response');
  else if (search.ok && found) { failed = true; evidence.push('SEARCH now works: both files holding the string were named'); }
  else if (search.ok && isCannotAnswer(search.response)) {
    evidence.push(`SEARCH still denied, now reported rather than empty: "${excerpt(search.response)}"`);
    fallbacks.push('the search call answered that it could not search instead of returning an empty response');
  } else {
    inconclusive = true;
    evidence.push(`SEARCH inconclusive: ${search.ok ? `"${excerpt(search.response)}"` : `the call failed (${search.reported ?? 'no status'})`}`);
    if (search.ok && isPlanAnswer(search.response)) fallbacks.push('the search call answered with a plan instead of a result');
  }
  if (failed) return { verdict: 'failed', evidence, fallbacks };
  return { verdict: inconclusive ? 'partial' : 'holds', evidence, fallbacks };
}

/** agy-plan-mode-answers-with-a-plan: three bare listing calls and one with the answer-directly prefix. */
export function judgePlanMode({ bare, prefixed }) {
  const bareKinds = bare.map(listingKind);
  const plans = bareKinds.filter((k) => k === 'plan').length;
  const prefixedKind = listingKind(prefixed);
  const evidence = [
    `bare listing prompt: ${plans} of ${bare.length} answered with a plan (${bareKinds.join(', ')})`,
    `with the answer-directly prefix: ${prefixedKind}`,
  ];
  const fallbacks = plans ? [`${plans} of ${bare.length} bare read-only calls came back as a plan with no error`] : [];
  const empties = bareKinds.filter((k) => k === 'empty').length;
  if (empties) fallbacks.push(`${empties} of ${bare.length} bare listing calls returned an empty response (a tool auto-denied)`);
  if (prefixedKind !== 'listing') {
    evidence.push(`the prefixed call did not return the listing: "${excerpt(prefixed.response)}"`);
    if (prefixedKind === 'deferred') fallbacks.push('the prefixed call returned a promise to answer later (a dispatched subagent) and ended without the answer');
    if (['plan', 'cannot', 'deferred', 'empty'].includes(prefixedKind)) return { verdict: 'failed', evidence: [...evidence, 'the prefix no longer gets the listing back'], fallbacks };
  }
  if (plans === 0 && bareKinds.every((k) => k === 'listing')) return { verdict: 'failed', evidence: [...evidence, 'the bare prompt now answers directly'], fallbacks };
  if (plans > 0 && prefixedKind === 'listing') return { verdict: 'holds', evidence, fallbacks };
  return { verdict: 'partial', evidence, fallbacks };
}

// ── The probe table ─────────────────────────────────────────────────────────────────────────────
//
// `run(ctx)` returns `{ verdict, evidence, fallbacks?, reason? }`. `cost` is what it spends: `free`
// is a CLI's own help or listing; `agy:<n>` is n read-only Antigravity calls on the subscription.
// `codexCall` and `session` entries are never run here, and say why.

// Two prefixes, and the difference matters. The plan-mode entry's own prefix forbids the shell; the
// auto-deny probe must NOT, because what it asks is whether listing works with no command grant,
// and on 1.2.14 that prefix alone was answered "no non-shell listing tool is available".
const ANSWER_DIRECTLY = 'Answer directly in this reply; do not write a plan.';
const LISTING_PREFIX = `Tools: read_file and directory listing only, NO SHELL. ${ANSWER_DIRECTLY}`;
const listingPrompt = (dir) => `List every file under ${dir}, recursively, with each file's size in bytes.`;
const searchPrompt = (dir) => `${ANSWER_DIRECTLY} Find every file under ${dir}, recursively, whose contents contain the string "${PROBE_NEEDLE}". Reply with their relative paths only.`;

export const PROBES = Object.freeze({
  'claude-no-permission-prompts-flag': { cost: 'free', run: (ctx) => judgePermissionPromptsHelp(ctx.shell('claude --help').stdout) },
  'claude-agents-json-liveness': { cost: 'free', run: (ctx) => judgeClaudeAgentsJson(ctx.shell('claude agents --json').stdout) },
  'codex-agents-has-no-json': { cost: 'free', run: (ctx) => judgeCodexAgentsHelp(ctx.shell('codex agents --help').stdout) },
  // agy prints its help on STDERR (Go's flag package does), so both streams are read.
  'agy-no-usage-surface': {
    cost: 'free',
    run: (ctx) => {
      const help = ctx.shell('agy --help');
      return judgeAgyHelp(`${help.stdout}\n${help.stderr}`);
    },
  },
  'agy-model-inventory': { cost: 'free', run: (ctx) => judgeAgyModels(ctx.shell('agy models').stdout) },
  'agy-claude-models-reject-effort': {
    cost: 'agy:2',
    run: (ctx) => judgeEffortRefusals(Object.fromEntries(EFFORTLESS_MODELS.models.map((model) => [
      model,
      ctx.agy({ model, effort: 'low', label: `reprobe-effort-${model}`, prompt: 'Reply with the single word OK.' }),
    ]))),
  },
  'agy-headless-auto-denies-ungranted-tools': {
    cost: 'agy:2',
    run: (ctx) => {
      const dir = ctx.probeDir();
      return judgeAutoDeny({
        listing: ctx.agy({ model: 'gemini-3.7-flash-high', label: 'reprobe-autodeny-list', prompt: `${ANSWER_DIRECTLY} ${listingPrompt(dir)}`, cwd: dir }),
        search: ctx.agy({ model: 'gemini-3.7-flash-high', label: 'reprobe-autodeny-search', prompt: searchPrompt(dir), cwd: dir }),
      });
    },
  },
  'agy-plan-mode-answers-with-a-plan': {
    cost: 'agy:4',
    run: (ctx) => {
      const dir = ctx.probeDir();
      const bare = [1, 2, 3].map((n) => ctx.agy({ model: 'gemini-3.7-flash-high', label: `reprobe-plan-bare${n}`, prompt: listingPrompt(dir), cwd: dir }));
      const prefixed = ctx.agy({ model: 'gemini-3.7-flash-high', label: 'reprobe-plan-prefixed', prompt: `${LISTING_PREFIX} ${listingPrompt(dir)}`, cwd: dir });
      return judgePlanMode({ bare, prefixed });
    },
  },
  'codex-one-model-on-the-subscription': { codexCall: true },
  'codex-rate-limits-only-when-it-runs': { codexCall: true },
  'codex-writable-root-is-the-launching-session-cwd': { codexCall: true },
  'codex-invocation-leaks-its-mcp-fleet': { codexCall: true },
  'claude-remote-isolation-silently-runs-local': { session: 'an Agent call with isolation: "remote"' },
  'claude-launched-session-gets-no-subagent-notifications': { session: 'a launched session that both stays in a turn and ends one' },
  'claude-agent-tool-cannot-adopt-or-wake-a-row': { session: 'the Agent tool schema and the session tool list' },
  'claude-cloud-rows-get-no-mcp-tools': { session: 'a fresh cloud session' },
  'claude-cloud-rows-cannot-launch-subagents': { session: 'a cloud wave row' },
  'claude-cloud-worktree-base-is-the-session-branch': { session: 'a cloud session behind origin/main' },
  'claude-cloud-git-proxy-deletes-no-other-branch': { session: 'a cloud session' },
  'claude-cloud-git-auth-lapses-mid-session': { session: 'an hour-long cloud row' },
});

/** How an observation would be probed, without probing it. */
export function planFor(observation, { codexCapUntil = null, free = false } = {}) {
  const probe = PROBES[observation.id];
  if (!probe) return { mode: 'none', reason: 'no probe in scripts/harness-reprobe.mjs yet' };
  if (probe.codexCall) {
    return { mode: 'none', reason: codexCapUntil ? `usage cap: Codex is at its usage cap until ${codexCapUntil}, and this probe needs a Codex model call` : 'needs a Codex model call, which this script never spends' };
  }
  if (probe.session) return { mode: 'session', reason: `needs ${probe.session}; a session records it with \`record\`` };
  if (free && probe.cost !== 'free') return { mode: 'skip', reason: `skipped by --free (costs ${probe.cost})` };
  return { mode: 'run', cost: probe.cost };
}

// ── The real context: one process at a time, every command a constant ──────────────────────────

function realContext({ env }) {
  let dir = null;
  return {
    // A shell because these launchers are .cmd files on Windows; the strings are constants above.
    shell: (command) => {
      const result = spawnSync(command, { shell: true, encoding: 'utf8', timeout: 60_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    },
    probeDir: () => {
      if (dir) return dir;
      dir = mkdtempSync(path.join(tmpdir(), 'noacg-reprobe-'));
      for (const { name, content } of PROBE_FILES) {
        mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        writeFileSync(path.join(dir, name), content);
      }
      return dir;
    },
    agy: ({ model, label, prompt, effort = null, cwd = null }) => {
      const argv = [path.join(REPO_ROOT, 'scripts', 'agy-run.mjs'), '--read-only', '--model', model, '--label', label, '--print-timeout', `${PRINT_TIMEOUT_SECONDS}s`];
      if (effort) argv.push('--effort', effort);
      if (cwd) argv.push('--cwd', cwd);
      argv.push('--prompt', prompt);
      const result = spawnSync(process.execPath, argv, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 180_000, windowsHide: true, env });
      return agyOutcome({ status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
    },
    cleanup: () => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────

const USAGE = `Usage: node scripts/harness-reprobe.mjs [list | run | record <id> | show] [options]

  list (default)             what each observation's re-probe would be, spending nothing
  run                        probe every observation the installed build has not backed, one at a time
    --only <id,id>           just these (probed even if the installed build already backs them)
    --free                   only the probes that make no model call
    --codex-cap-until <date> record the Codex model-call probes as not probed for the usage cap
  record <id>                append a verdict a session measured
    --verdict <v>            holds | failed | partial | not-probed
    --evidence <text>        repeatable; what was seen
    --fallback <text>        repeatable; a fallback that was observed
    --reason <text>          why, for not-probed or partial
    --on <version>           the build that answered, when it is not the installed CLI
  show                       the newest verdict per observation

Ledger: <git-common-dir>/noacg-reprobe.jsonl, beside the job store (override: NOACG_REPROBE_LEDGER).`;

export function parseArgs(argv) {
  const args = { command: 'list', id: null, only: null, free: false, codexCapUntil: null, verdict: null, evidence: [], fallbacks: [], reason: null, on: null, help: false };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) args.command = rest.shift();
  if (args.command === 'record' && rest[0] && !rest[0].startsWith('-')) args.id = rest.shift();
  while (rest.length) {
    const token = rest.shift();
    const next = () => {
      if (!rest.length) throw new Error(`${token} needs a value`);
      return rest.shift();
    };
    if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--only') args.only = next().split(',').map((id) => id.trim()).filter(Boolean);
    else if (token === '--free') args.free = true;
    else if (token === '--codex-cap-until') args.codexCapUntil = next();
    else if (token === '--verdict') args.verdict = next();
    else if (token === '--evidence') args.evidence.push(next());
    else if (token === '--fallback') args.fallbacks.push(next());
    else if (token === '--reason') args.reason = next();
    else if (token === '--on') args.on = next();
    else throw new Error(`unknown argument ${token}`);
  }
  if (!['list', 'run', 'record', 'show'].includes(args.command)) throw new Error(`unknown command ${args.command}`);
  if (args.command === 'record') {
    if (!args.id) throw new Error('record needs an observation id');
    if (!VERDICTS.includes(args.verdict)) throw new Error(`record needs --verdict (${VERDICTS.join(', ')})`);
    if (!args.evidence.length && !args.reason) throw new Error('record needs --evidence or --reason: a verdict with nothing behind it is a guess');
  }
  return args;
}

/**
 * Which observations `run` probes: the ones named, else every one the installed build has not
 * backed. A measured re-probe on this build (held or failed) counts as backed here, so a second run
 * does not pay for the same answer again; `--only` re-probes one on purpose.
 */
export function selectObservations(observations, installed, only, reprobes = []) {
  const standings = capabilityStandings(observations, installed, reprobes);
  if (only) {
    const unknown = only.filter((id) => !observations.some((o) => o.id === id));
    if (unknown.length) throw new Error(`no such observation: ${unknown.join(', ')}`);
    return standings.filter((row) => only.includes(row.id));
  }
  return standings.filter((row) => row.standing === 'unverified');
}

function formatVerdict(line) {
  const head = `${line.verdict.toUpperCase().padEnd(10)} ${line.id} (${line.harness} ${line.probedOn ?? '?'})`;
  return [
    head,
    ...(line.reason ? [`           reason: ${line.reason}`] : []),
    ...(line.evidence ?? []).map((text) => `           - ${text}`),
    ...(line.fallbacks ?? []).map((text) => `           fallback: ${text}`),
  ].join('\n');
}

export function main(argv = process.argv.slice(2), { env = process.env, context = null, installed = null, observationsText = null, now = () => new Date() } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`harness-reprobe: ${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const ledger = reprobeLedgerPath({ env });
  if (!ledger) {
    process.stderr.write('harness-reprobe: not in a git checkout and NOACG_REPROBE_LEDGER is unset, so there is no ledger to write.\n');
    return 2;
  }
  // The LANDED entries, as `harness-usage --landed` reads them: a verdict carries the digest of the
  // claim it was measured against, and a digest of a stale checkout's claim would match nothing the
  // morning read sees. The working tree is the fallback when there is no landed ref.
  const observations = readCapabilities(observationsText ?? capabilitiesText({ landed: true })).filter((o) => o.kind !== 'constraint');
  const reprobes = readReprobeLedger(readTextOrNull(ledger));
  // Asked only when needed: `record --on` names its build and asks no CLI at all.
  let asked = installed;
  const versions = () => (asked ??= harnessVersions());
  const versionOf = (harness) => versions().find((row) => row.pool === harness)?.version ?? null;

  if (args.command === 'show') {
    // The same reading as the morning read: a measured verdict on this build stands until a newer
    // measured one replaces it, and a later "not probed" is shown beside it, never instead of it.
    for (const row of capabilityStandings(observations, versions(), reprobes)) {
      const shown = row.measuredReprobe ?? row.lastReprobe;
      if (!shown) {
        process.stdout.write(`never             ${row.id}\n`);
        continue;
      }
      const later = row.lastReprobe && row.lastReprobe !== shown ? `\n           later: ${row.lastReprobe.verdict} (${row.lastReprobe.reason ?? 'no reason'})` : '';
      process.stdout.write(`${shown.at.slice(0, 16)}  ${formatVerdict(shown)}${later}\n`);
    }
    return 0;
  }

  // One implementation for every ledger in this repo: agy-run's.
  const append = (line) => appendLedger(line, ledger);

  if (args.command === 'record') {
    const observation = observations.find((o) => o.id === args.id);
    if (!observation) {
      process.stderr.write(`harness-reprobe: no such observation: ${args.id}\n`);
      return 2;
    }
    const line = ledgerLine({
      observation,
      verdict: args.verdict,
      probedOn: args.on ?? versionOf(observation.harness),
      evidence: args.evidence,
      fallbacks: args.fallbacks,
      reason: args.reason,
      by: 'session',
      at: now(),
    });
    append(line);
    process.stdout.write(`${formatVerdict(line)}\nRecorded in ${ledger}\n`);
    return 0;
  }

  let selected;
  try {
    selected = selectObservations(observations, versions(), args.only, reprobes);
  } catch (error) {
    process.stderr.write(`harness-reprobe: ${error.message}\n`);
    return 2;
  }

  if (args.command === 'list') {
    process.stdout.write(`${selected.length} observation(s) the installed builds have not backed:\n`);
    for (const row of selected) {
      const plan = planFor(row, { codexCapUntil: args.codexCapUntil, free: args.free });
      const how = plan.mode === 'run' ? `probe (${plan.cost})` : plan.mode === 'session' ? 'session probe' : 'not probed';
      process.stdout.write(`  ${how.padEnd(34)} ${row.id}${plan.reason ? `\n  ${' '.repeat(34)} ${plan.reason}` : ''}\n`);
    }
    return 0;
  }

  // run
  const ctx = context ?? realContext({ env });
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0]));
  let sessionLeft = 0;
  try {
    for (const row of selected) {
      const plan = planFor(row, { codexCapUntil: args.codexCapUntil, free: args.free });
      if (plan.mode === 'session' || plan.mode === 'skip') {
        // No line: a session measures these, and a script "not probed" line written after the
        // session's verdict would bury it. A --free skip is the caller's choice, not a finding.
        if (plan.mode === 'session') sessionLeft += 1;
        process.stdout.write(`${plan.mode === 'session' ? 'SESSION' : 'SKIPPED'}    ${row.id}\n           ${plan.reason}\n`);
        continue;
      }
      let result;
      if (plan.mode === 'none') {
        result = { verdict: 'not-probed', reason: plan.reason, evidence: [] };
      } else {
        try {
          result = PROBES[row.id].run(ctx);
        } catch (error) {
          result = { verdict: 'not-probed', reason: `the probe threw: ${error.message}`, evidence: [] };
        }
      }
      const line = ledgerLine({
        observation: row,
        verdict: result.verdict,
        probedOn: versionOf(row.harness),
        evidence: result.evidence ?? [],
        fallbacks: result.fallbacks ?? [],
        reason: result.reason ?? null,
        at: now(),
      });
      append(line);
      counts[line.verdict] += 1;
      process.stdout.write(`${formatVerdict(line)}\n`);
    }
  } finally {
    ctx.cleanup?.();
  }
  process.stdout.write(
    `\n${counts.holds} hold, ${counts.failed} FAILED, ${counts.partial} partial, ${counts['not-probed']} not probed`
    + `${sessionLeft ? `, ${sessionLeft} left to a session` : ''}. Recorded in ${ledger}\n`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
