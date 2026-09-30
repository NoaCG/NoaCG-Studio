// The guard on the capability re-probe is these cases. A re-probe fails in the expensive direction
// when a judge rounds an inconclusive answer up to a verdict, or when the morning read cannot see a
// verdict the ledger holds, so both halves are pinned: each judge against the output that settles
// it (most of them the outputs measured on 2026-09-30), and harness-usage's reading of the ledger.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AGY_MODEL_INVENTORY,
  PROBE_FILES,
  agyOutcome,
  isDeferredAnswer,
  judgeAgyHelp,
  judgeAgyModels,
  judgeAutoDeny,
  judgeClaudeAgentsJson,
  judgeCodexAgentsHelp,
  judgeEffortRefusals,
  judgePermissionPromptsHelp,
  judgePlanMode,
  ledgerLine,
  listingIsAccurate,
  listingKind,
  main,
  parseArgs,
  planFor,
  selectObservations,
} from './harness-reprobe.mjs';
import { effortVerdict } from './agy-run.mjs';
import {
  capabilityLines,
  capabilityStandings,
  claimDigest,
  readReprobeLedger,
  reprobeLedgerPath,
} from './harness-usage.mjs';

const ok = (response) => ({ ok: true, response, empty: false, reported: null });
const empty = { ok: false, response: '', empty: true, reported: null };
const accurateListing = PROBE_FILES.map(({ name, content }) => `- ${name.replace(/\\/g, '/')}: ${Buffer.byteLength(content)} bytes`).join('\n');

test('the ledger sits beside the job store, inside .git, unless overridden', () => {
  assert.equal(
    reprobeLedgerPath({ env: {}, jobs: () => path.join('C:', 'repo', '.git', 'noacg-jobs') }),
    path.join('C:', 'repo', '.git', 'noacg-reprobe.jsonl'),
  );
  assert.equal(reprobeLedgerPath({ env: { NOACG_REPROBE_LEDGER: 'x.jsonl' }, jobs: () => null }), 'x.jsonl');
  assert.equal(reprobeLedgerPath({ env: {}, jobs: () => null }), null);
});

test('claude --help: the entry records the refutation, so the flag present holds', () => {
  assert.equal(judgePermissionPromptsHelp('  --permission-prompts <target>   Who answers').verdict, 'holds');
  assert.equal(judgePermissionPromptsHelp('  --permission-mode <mode>').verdict, 'failed');
});

test('claude agents --json: a status field fails the "no status" entry; no agents is not a verdict', () => {
  // The 2.1.283 shape measured on 2026-09-30.
  const withStatus = JSON.stringify([{ pid: 1, cwd: 'C:\\a', kind: 'interactive', startedAt: 1, sessionId: 's', name: 'n', status: 'busy' }]);
  const judged = judgeClaudeAgentsJson(withStatus);
  assert.equal(judged.verdict, 'failed');
  assert.match(judged.evidence.join(' '), /status field \(values: busy\)/);
  assert.equal(judgeClaudeAgentsJson(JSON.stringify([{ pid: 1, cwd: 'C:\\a', kind: 'interactive' }])).verdict, 'holds');
  assert.equal(judgeClaudeAgentsJson('[]').verdict, 'not-probed');
  assert.equal(judgeClaudeAgentsJson('not json').verdict, 'not-probed');
});

test('codex agents --help: no --json holds, and an unrecognised help text is not a verdict', () => {
  assert.equal(judgeCodexAgentsHelp('Usage: codex agents [OPTIONS]\n  -c, --config\n  --no-alt-screen').verdict, 'holds');
  assert.equal(judgeCodexAgentsHelp('Usage: codex agents [OPTIONS]\n  --json  print and exit').verdict, 'failed');
  assert.equal(judgeCodexAgentsHelp('').verdict, 'not-probed');
});

test('agy --help: only the help half is probed, so a clean help is partial, never holds', () => {
  const help = 'Usage of agy.exe:\n  --model  Model\n\nAvailable subcommands:\n  agent           List available agents\n  models          List available models\n  update          Update CLI\n';
  const judged = judgeAgyHelp(help);
  assert.equal(judged.verdict, 'partial');
  assert.match(judged.fallbacks[0], /not run/);
  assert.equal(judgeAgyHelp(`${help}  usage           Show usage\n`).verdict, 'failed');
  assert.equal(judgeAgyHelp('').verdict, 'not-probed');
});

test('agy models: the same fourteen ids hold; an added id fails and is named', () => {
  const listing = (ids) => `Fetching available models...\n${ids.map((id) => `${id}\tName`).join('\n')}\n`;
  assert.equal(judgeAgyModels(listing(AGY_MODEL_INVENTORY)).verdict, 'holds');
  const added = judgeAgyModels(listing([...AGY_MODEL_INVENTORY, 'gemini-4-flash']));
  assert.equal(added.verdict, 'failed');
  assert.match(added.evidence.join(' '), /new: gemini-4-flash/);
  assert.equal(judgeAgyModels('Fetching available models...\n').verdict, 'not-probed');
});

test('--effort: both rejected holds, one accepted fails, and the wrapper downgrade is kept as a fallback', () => {
  const rejected = agyOutcome({ status: 1, stderr: 'agy-run: WARNING - `--effort low` was passed\nagy-run: agy reported status ERROR - --effort is not supported for model' });
  assert.equal(rejected.effortRejected, true);
  const both = judgeEffortRefusals({ a: rejected, b: rejected });
  assert.equal(both.verdict, 'holds');
  assert.equal(both.fallbacks.length, 2);
  assert.equal(judgeEffortRefusals({ a: rejected, b: agyOutcome({ status: 0, stdout: 'OK' }) }).verdict, 'failed');
  assert.equal(judgeEffortRefusals({ a: rejected, b: agyOutcome({ status: 1, stderr: 'agy reported status QUOTA' }) }).verdict, 'partial');
});

test('--effort: agy-run\'s own warning quotes the rejection, and must not be read as one', () => {
  // The wrapper's real warning, which quotes "--effort is not supported for model" verbatim.
  const { warning } = effortVerdict({ model: 'claude-sonnet-4-6', effort: 'low', installedVersion: '9.9.9' });
  assert.match(warning, /is not supported for model/);
  const accepted = agyOutcome({ status: 0, stdout: 'OK\n', stderr: `agy-run: WARNING - ${warning}\n` });
  assert.equal(accepted.effortRejected, false);
  assert.equal(judgeEffortRefusals({ a: accepted }).verdict, 'failed');
  // The line agy itself produced on 2026-09-30.
  const real = agyOutcome({ status: 1, stderr: `agy-run: WARNING - ${warning}\nagy-run: agy reported status ERROR - invalid model selection (--model "claude-sonnet-4-6" --effort "low"): --effort is not supported for model "claude-sonnet-4-6"\n` });
  assert.equal(real.effortRejected, true);
});

test('an empty response at the print timeout is a timeout, not a denial', () => {
  const late = agyOutcome({ status: 1, stderr: 'agy-run: agy returned an EMPTY response after 119.2s. ...' });
  assert.equal(late.empty, false);
  assert.equal(late.timedOut, true);
  assert.equal(listingKind(late), 'timeout');
  assert.equal(judgeAutoDeny({ listing: late, search: late }).verdict, 'partial');
  assert.equal(agyOutcome({ status: 1, stderr: 'agy returned an EMPTY response after 6.6s.' }).empty, true);
});

test('a listing counts only when every file AND its size are on one line', () => {
  assert.equal(listingIsAccurate(accurateListing), true);
  assert.equal(listingIsAccurate(PROBE_FILES.map(({ name }) => name).join('\n')), false);
  assert.equal(listingIsAccurate(''), false);
});

test('auto-deny: tonight\'s two empty responses fail the "listing works" half', () => {
  const judged = judgeAutoDeny({ listing: empty, search: empty });
  assert.equal(judged.verdict, 'failed');
  assert.match(judged.evidence[0], /LISTING no longer works/);
  assert.equal(judgeAutoDeny({ listing: ok(accurateListing), search: empty }).verdict, 'holds');
  assert.equal(judgeAutoDeny({ listing: ok(accurateListing), search: ok('alpha.txt\ndelta.log') }).verdict, 'failed');
  // An answer that is neither the listing nor a refusal is not rounded up to anything.
  assert.equal(judgeAutoDeny({ listing: ok('Here is what I found: several files.'), search: empty }).verdict, 'partial');
  // Nor is a listing that names the files and apologises for one size.
  const apologetic = ok('alpha.txt 6 bytes\nbravo.md 14 bytes\ncharlie.json: I cannot determine its size\ndelta.log 17 bytes');
  assert.equal(listingKind(apologetic), 'other');
  assert.equal(judgeAutoDeny({ listing: apologetic, search: empty }).verdict, 'partial');
});

test('plan mode: tonight\'s shape (three empties, a deferred answer) fails, and the deferral is a fallback', () => {
  const deferred = ok('An exploration subagent has been dispatched to list all files and their byte sizes. I will provide the complete list as soon as it returns.');
  assert.equal(isDeferredAnswer(deferred.response), true);
  assert.equal(listingKind(deferred), 'deferred');
  const judged = judgePlanMode({ bare: [empty, empty, empty], prefixed: deferred });
  assert.equal(judged.verdict, 'failed');
  assert.ok(judged.fallbacks.some((text) => /promise to answer later/.test(text)));
  assert.ok(judged.fallbacks.some((text) => /3 of 3 bare listing calls returned an empty response/.test(text)));
  // The 1.2.1 shape: every bare call planned, the prefix got the listing.
  const plan = ok('I have created the implementation plan. Please review.');
  assert.equal(judgePlanMode({ bare: [plan, plan, plan], prefixed: ok(accurateListing) }).verdict, 'holds');
  assert.equal(judgePlanMode({ bare: [ok(accurateListing), ok(accurateListing), ok(accurateListing)], prefixed: ok(accurateListing) }).verdict, 'failed');
});

test('a Codex model-call probe is never run, and the usage cap is the recorded reason', () => {
  const capped = planFor({ id: 'codex-one-model-on-the-subscription' }, { codexCapUntil: '2026-10-03' });
  assert.equal(capped.mode, 'none');
  assert.match(capped.reason, /^usage cap/);
  assert.equal(planFor({ id: 'codex-one-model-on-the-subscription' }).mode, 'none');
  assert.equal(planFor({ id: 'claude-remote-isolation-silently-runs-local' }).mode, 'session');
  assert.equal(planFor({ id: 'agy-plan-mode-answers-with-a-plan' }, { free: true }).mode, 'skip');
  assert.equal(planFor({ id: 'something-new' }).reason, 'no probe in scripts/harness-reprobe.mjs yet');
});

test('record refuses a verdict with nothing behind it', () => {
  assert.throws(() => parseArgs(['record', 'x', '--verdict', 'holds']), /a verdict with nothing behind it is a guess/);
  assert.throws(() => parseArgs(['record', 'x', '--verdict', 'maybe', '--evidence', 'e']), /--verdict/);
  assert.equal(parseArgs(['record', 'x', '--verdict', 'holds', '--evidence', 'e', '--on', '2.1.284']).on, '2.1.284');
});

const OBSERVATIONS = [
  { id: 'claude-agents-json-liveness', harness: 'Claude Code', kind: 'observation', measuredOn: '2.1.263', claim: 'no status field' },
  { id: 'codex-one-model-on-the-subscription', harness: 'Codex', kind: 'observation', measuredOn: '0.154.0', claim: 'two models' },
  { id: 'claude-remote-isolation-silently-runs-local', harness: 'Claude Code', kind: 'observation', measuredOn: '2.1.263', claim: 'runs local' },
  { id: 'a-constraint', harness: 'Codex', kind: 'constraint', measuredOn: null, claim: 'ours' },
];
const INSTALLED = [{ pool: 'Claude Code', version: '2.1.283' }, { pool: 'Codex', version: '0.161.0' }];

test('run writes one line per probed or unprobed observation, and none for a session probe', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reprobe-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const ledger = path.join(dir, 'ledger.jsonl');
  const context = { shell: () => ({ status: 0, stdout: JSON.stringify([{ pid: 1, cwd: 'x', status: 'busy' }]), stderr: '' }) };
  const code = main(['run', '--codex-cap-until', '2026-10-03'], {
    env: { NOACG_REPROBE_LEDGER: ledger },
    context,
    installed: INSTALLED,
    observationsText: JSON.stringify({ observations: OBSERVATIONS }),
    now: () => new Date('2026-09-30T21:00:00Z'),
  });
  assert.equal(code, 0);
  const rows = readReprobeLedger(readFileSync(ledger, 'utf8'));
  assert.deepEqual(rows.map((row) => [row.id, row.verdict]), [
    ['claude-agents-json-liveness', 'failed'],
    ['codex-one-model-on-the-subscription', 'not-probed'],
  ]);
  assert.equal(rows[0].probedOn, '2.1.283');
  assert.equal(rows[0].claimDigest, claimDigest('no status field'));
  assert.match(rows[1].reason, /^usage cap/);
});

test('the morning read: a failed re-probe is printed, a held one counts, and a rewritten claim drops both', () => {
  const failed = ledgerLine({ observation: OBSERVATIONS[0], verdict: 'failed', probedOn: '2.1.283', evidence: ['4 of 4 carry a status field'], at: '2026-09-30T21:00:00Z' });
  const capped = ledgerLine({ observation: OBSERVATIONS[1], verdict: 'not-probed', probedOn: '0.161.0', reason: 'usage cap: until 2026-10-03', at: '2026-09-30T21:00:00Z' });
  const held = ledgerLine({ observation: OBSERVATIONS[2], verdict: 'holds', probedOn: '2.1.283', evidence: ['ran local'], at: '2026-09-30T21:00:00Z' });
  const laterNotProbed = ledgerLine({ observation: OBSERVATIONS[2], verdict: 'not-probed', probedOn: '2.1.283', reason: 'skipped', at: '2026-09-30T22:00:00Z' });
  const standings = capabilityStandings(OBSERVATIONS, INSTALLED, [failed, capped, held, laterNotProbed]);
  assert.deepEqual(standings.map((row) => row.standing), ['failed', 'unverified', 'reprobed', 'constraint']);

  const text = capabilityLines(standings).join('\n');
  assert.match(text, /1 re-probed on it and holding, 1 FAILED their re-probe, 1 UNVERIFIED/);
  assert.match(text, /FAILED RE-PROBE {2}Claude Code 2\.1\.283, 2026-09-30: claude-agents-json-liveness/);
  assert.match(text, /\n {14}- 4 of 4 carry a status field/);
  assert.match(text, /last re-probe 2026-09-30 on 0\.161\.0: not-probed - usage cap/);

  // A verdict about other claim text, or about another build, moves nothing.
  const rewritten = [{ ...OBSERVATIONS[0], claim: 'rewritten after the re-probe' }];
  assert.equal(capabilityStandings(rewritten, INSTALLED, [failed])[0].standing, 'unverified');
  const upgraded = [{ pool: 'Claude Code', version: '2.1.290' }];
  assert.equal(capabilityStandings([OBSERVATIONS[0]], upgraded, [failed])[0].standing, 'unverified');
  // A run on the same build does not pay for a measured answer twice.
  assert.deepEqual(selectObservations(OBSERVATIONS, INSTALLED, null, [failed, held]).map((row) => row.id), ['codex-one-model-on-the-subscription']);
  // A hand-appended line with the wrong shape is read safely or skipped, never a crash.
  const odd = readReprobeLedger(`${JSON.stringify({ ...failed, evidence: 'one string' })}\n${JSON.stringify({ ...failed, at: undefined })}\n{half`);
  assert.equal(odd.length, 1);
  assert.deepEqual(odd[0].evidence, []);
  // With no ledger the report is exactly what it was.
  assert.deepEqual(capabilityStandings(OBSERVATIONS, INSTALLED).map((row) => row.standing), ['unverified', 'unverified', 'unverified', 'constraint']);
});
