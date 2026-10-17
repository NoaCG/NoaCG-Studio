// guards: benchmarks/harness/**, agents/noacg-harness/**, cli/skill/**, scripts/harness-bench.mjs
//
// THE HARNESS LADDER'S L0 (docs/work-specs/harness-ladder/spec.md AC-1, AC-2, AC-3), at zero
// tokens and without a browser:
//
//   - the money (D9): the ledger holds L4's exam reserve and L3's confirmation ceiling, keeps both
//     from every other phase, and refuses a credit session past either; the ladder's phases run in
//     order, the search and teaching on the subscription only, credit only in L3 and L4;
//   - the forced look (D1, D6): the harness's system prompt and the skill hand in with
//     `record --review`, and the bench counts the frames a trace opened against those reviewed;
//   - the subscription arm (D2): `claude -p` with the rung's model and effort, the web off, the
//     5.4 environment, outside the repository; a hand-in without a review is not delivered, and a
//     session stopped at its limit is costed from its transcript;
//   - the sealed exam (section 2): its shape everywhere, and where the private passphrase is on
//     this machine its hash, its mix and its ids against every earlier brief file;
//   - the ladder judge (D8): Opus 5.5 on the exam judge's own prompt and rubric, used only if its
//     calibration passed, else the exam judge.
//
// `node scripts/harness-bench.mjs --control` runs the forced look on the real CLI and bridge.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadHarnessApi } from '../benchmarks/harness/lib/api-runtime.mjs';
import { readAgentDefinition, SYSTEM_PROMPT_MAX_LINES } from '../benchmarks/harness/lib/agent-def.mjs';
import { findTranscript, handInLine, ladderPrompt, subscriptionArm } from '../benchmarks/harness/lib/arms.mjs';
import { examBriefs } from '../benchmarks/harness/lib/exam.mjs';
import { loadJudge } from '../benchmarks/harness/lib/judge.mjs';
import { earlierBriefIds, LADDER_EXAM_DIR, LADDER_HOLDS, LADDER_JUDGE_LOCK, LADDER_SET, ladderBriefs, ladderHeld, ladderJudge, RUNG_ORDER, rungMarkdown, sealCommittedAt, tallyRung } from '../benchmarks/harness/lib/ladder.mjs';
import { admit, appendEntry, emptyLedger, heldCents, LEDGER_FILE, readLedger, remainingCents, setHold, spentCents } from '../benchmarks/harness/lib/ledger.mjs';
import { runCell } from '../benchmarks/harness/lib/pipeline.mjs';
import { openSealed, privatePassphraseFile, readHash, readSealed, sealedShape, sha256 } from '../benchmarks/harness/lib/sealed.mjs';
import { framesOpened, readsOf, transcriptReads, transcriptUsd } from '../benchmarks/harness/lib/trace.mjs';
import { sameFiles, secondLock } from '../benchmarks/harness/judge/calibration.mjs';
import { pendingCells, recordHold, refuseBuild } from './harness-bench.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const made = [];
const tmp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-ladder-test-'));
  made.push(dir);
  return dir;
};
const api = await loadHarnessApi();
after(async () => {
  await api.cleanup();
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const closed = (ledger, ...phases) => {
  for (const phase of phases) appendEntry(ledger, { kind: 'phase', phase, stage: 'close', funding: 'none', outcome: 'completed' });
  return ledger;
};
const heldLedger = () => {
  let l = { ...emptyLedger(), entries: [] };
  appendEntry(l, { kind: 'session', phase: 'H8', funding: 'credit', sessionId: 'sesn_spent', listCostCents: 5468, outcome: 'delivered' });
  for (const [phase, h] of Object.entries(LADDER_HOLDS)) l = setHold(l, { phase, kind: h.kind, cents: h.cents, setBy: 'L0' });
  return l;
};

// ── the money (D9) ──────────────────────────────────────────────────────────────────────────

test('the ledger holds L4\'s exam reserve and L3\'s ceiling, keeps both from every other phase, and refuses a session past either', () => {
  const l = heldLedger();
  assert.equal(ladderHeld(l), true);
  assert.equal(remainingCents(l, 'L1'), 10_000 - 5468 - 3000 - 800, 'the $7.32 left unallocated');
  assert.equal(heldCents(l, 'L3'), 3000, 'L3 may not touch the exam');
  assert.equal(heldCents(l, 'L4'), 800, 'nor the exam the confirmation');
  // L3 is walled at its $8: sessions that each spent their 130-cent budget and 20-cent overshoot
  // fit five times, not six.
  const l3 = structuredClone(l);
  for (let i = 0; i < 5; i++) {
    assert.equal(admit(l3, { budgetCents: 130, overshootCents: 20, phase: 'L3' }).ok, true, `session ${i + 1}`);
    appendEntry(l3, { kind: 'session', phase: 'L3', funding: 'credit', sessionId: `sesn_${i}`, listCostCents: 150, outcome: 'delivered' });
  }
  const sixth = admit(l3, { budgetCents: 130, overshootCents: 20, phase: 'L3' });
  assert.equal(sixth.ok, false);
  assert.match(sixth.reason, /L3's \$8\.00 ceiling the ledger holds has \$0\.50 left/);
  // L4 is walled at its $30, whatever a flag says.
  const l4 = structuredClone(l);
  appendEntry(l4, { kind: 'session', phase: 'L4', funding: 'credit', sessionId: 'sesn_x', listCostCents: 2900, outcome: 'delivered' });
  assert.equal(admit(l4, { budgetCents: 130, overshootCents: 20, phase: 'L4', ceilingCents: 5000 }).ok, false);
  assert.match(admit(l4, { budgetCents: 130, overshootCents: 20, phase: 'L4' }).reason, /L4's \$30\.00 exam reserve has \$1\.00 left/);
  // Any other phase meets both holds: the run's $7.32 is all it has.
  assert.match(admit(l, { budgetCents: 700, overshootCents: 50, phase: 'L1' }).reason, /past the \$38\.00 held for L4's exam and L3's ceiling/);
  // A hold that does not fit is refused, and a closed phase's hold is released.
  assert.throws(() => setHold(l, { phase: 'L4', kind: 'exam', cents: 3_800, setBy: 'L3' }), /does not fit/);
  assert.equal(setHold(l, { phase: 'L4', kind: 'exam', cents: 3_000 + 732, setBy: 'L3' }).holds.find((h) => h.phase === 'L4').cents, 3732, 'up to every cent left');
  assert.throws(() => setHold(l, { phase: 'L4', kind: 'reserve', cents: 100, setBy: 'L0' }), /hold kind/);
  assert.equal(heldCents(closed(structuredClone(l), 'L3'), 'L1'), 3000, 'a closed L3 holds nothing back');
});

test('--hold writes the hold into the ledger and refuses one that does not fit, writing nothing', () => {
  const file = path.join(tmp(), 'ledger.json');
  const l = { ...emptyLedger(), entries: [] };
  appendEntry(l, { kind: 'session', phase: 'H8', funding: 'credit', sessionId: 'sesn_spent', listCostCents: 5468, outcome: 'delivered' });
  writeFileSync(file, JSON.stringify(l));
  recordHold(file, { phase: 'L4', kind: 'exam', cents: '3000', by: 'L0' });
  assert.deepEqual(readLedger(file).holds.map((h) => [h.phase, h.kind, h.cents, h.setBy]), [['L4', 'exam', 3000, 'L0']]);
  const before = readFileSync(file, 'utf8');
  assert.throws(() => recordHold(file, { phase: 'L3', kind: 'ceiling', cents: '2000', by: 'L0' }), /does not fit/);
  assert.throws(() => recordHold(file, { phase: 'L3', kind: 'ceiling', cents: '', by: 'L0' }), /whole number of cents/);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('the committed ledger holds D9 before any ladder session, at the H8 spend', () => {
  const l = readLedger(LEDGER_FILE);
  assert.equal(spentCents(l), 5468, 'no credit spent since H8');
  assert.deepEqual(l.holds.map((h) => [h.phase, h.kind, h.cents, h.setBy]).sort(), [['L3', 'ceiling', 800, 'L0'], ['L4', 'exam', 3000, 'L0']]);
  assert.equal(remainingCents(l, 'L1'), 732, '$7.32 stays unallocated');
  assert.ok(spentCents(l) + 3000 + 800 <= 10_000, 'the ledger never passes $100');
  // No ladder session spent credit, and none ran before the holds.
  const holdsAt = Math.max(...l.holds.map((h) => Date.parse(h.at)));
  for (const e of l.entries.filter((x) => /^L/.test(x.phase))) {
    assert.equal(e.listCostCents, 0, `${e.phase} ${e.stage}: no credit`);
    if (/^L[1-4]$/.test(e.phase) && e.kind === 'session') assert.ok(Date.parse(e.at) > holdsAt, 'a ladder session after the holds');
  }
});

test('the ladder\'s phases run in order, L0 to L2 on the subscription only, credit only in L3 and L4', () => {
  const l = heldLedger();
  assert.equal(refuseBuild(l, 'L0', ['subscription']), null);
  assert.match(refuseBuild(l, 'L0', ['managed-agents']), /L0 runs subscription, not managed-agents/);
  assert.match(refuseBuild(l, 'L1', ['subscription']), /L1 starts once L0 is closed/);
  closed(l, 'L0');
  assert.equal(refuseBuild(l, 'L1', ['subscription']), null);
  assert.match(refuseBuild(l, 'L1', ['managed-agents']), /spend no credit/);
  assert.match(refuseBuild(l, 'L3', ['managed-agents']), /L3 starts once L1, L2 are closed/);
  closed(l, 'L1', 'L2');
  assert.equal(refuseBuild(l, 'L3', ['managed-agents']), null);
  assert.match(refuseBuild(l, 'L3', ['subscription']), /L3 runs managed-agents, not subscription/);
  closed(l, 'L3');
  assert.equal(refuseBuild(l, 'L4', ['managed-agents', 'claude-code']), null);
  closed(l, 'L4');
  assert.match(refuseBuild(l, 'L4', ['managed-agents']), /already holds L4 as completed/);
  assert.match(refuseBuild(l, 'L5', ['subscription']), /L0, L1, L2, L3, L4, not L5/);
  // Without the holds no ladder session starts, though L0 may.
  const bare = closed({ ...emptyLedger(), entries: [] }, 'L0');
  assert.match(refuseBuild(bare, 'L1', ['subscription']), /L0 holds them before any ladder session/);
  // The parent plan is untouched: its exam closed MISSED, so H9 still refuses.
  assert.match(refuseBuild(readLedger(LEDGER_FILE), 'H9'), /closed MISSED: the run stops/);
});

test('a rung is its model and effort, and a teaching round its stage: another of either runs again', () => {
  const l = heldLedger();
  appendEntry(l, { kind: 'session', phase: 'L1', stage: 'rung-1', arm: 'subscription', model: 'claude-sonnet-5-5', effort: 'medium', funding: 'subscription', brief: 'b', outcome: 'delivered' });
  const cell = (effort) => ({ brief: { id: 'b' }, arm: { id: 'subscription', model: 'claude-sonnet-5-5', effort } });
  assert.equal(pendingCells(l, 'L1', [cell('medium')], 'rung-1').length, 0, 'the same rung is never run twice');
  assert.equal(pendingCells(l, 'L1', [cell('high')], 'rung-1').length, 1, 'another effort is another rung');
  assert.equal(pendingCells(l, 'L1', [cell('medium')], 'round-2').length, 1, 'a teaching round measures it again');
});

// ── the forced look (D1, D6) ────────────────────────────────────────────────────────────────

test('the harness and the skill hand in with record --review, the system prompt within its 25 lines', () => {
  const agent = readAgentDefinition(path.join(ROOT, 'agents', 'noacg-harness'));
  assert.ok(agent.systemLines <= SYSTEM_PROMPT_MAX_LINES, `${agent.systemLines} lines`);
  assert.match(agent.system, /noacg record \/workspace\/graphic --out \/mnt\/session\/outputs\/record\.json --review \/mnt\/session\/outputs\/coverage\/review\.json/);
  assert.doesNotMatch(agent.system, /noacg record [^\n]*--out [^\n]*record\.json`(?! --review)/, 'no record without its review');
  assert.match(agent.system, /references\/hand-in\.md/);
  const handIn = readFileSync(path.join(ROOT, 'cli', 'skill', 'noacg-graphic', 'references', 'hand-in.md'), 'utf8');
  assert.match(handIn, /Open every frame `review\.json` lists, one at a time, and only then set its verdict/);
  assert.match(handIn, /noacg record <graphic> --out <record\.json> --review <coverage folder>\/review\.json/);
  assert.match(readFileSync(path.join(ROOT, 'cli', 'skill', 'noacg-graphic', 'SKILL.md'), 'utf8'), /references\/hand-in\.md/);
  // The ladder's sessions get the same plumbing on local paths.
  const prompt = ladderPrompt({ id: 'x', prompt: 'A strap', type: 'lower-third' });
  assert.match(prompt, /^Brief: A strap\nGraphic type: lower-third \(the user chose it\)\./);
  assert.match(prompt, /noacg record \.\/graphic --out \.\/outputs\/record\.json --review \.\/outputs\/coverage\/review\.json/);
  assert.match(prompt, /Never run `noacg save` or `noacg login`/);
});

test('the look line counts the reviewed frames a trace opened, from Managed Agents steps or a Claude Code transcript', () => {
  const review = { digest: 'sha256:x', frames: 3, ok: 2, fixed: 1, verdicts: [{ file: 'off.png', verdict: 'ok' }, { file: 'take-sample-video-600ms.png', verdict: 'ok' }, { file: 'event-goal-1500ms.png', verdict: 'fixed: the crest' }] };
  const steps = [
    { kind: 'tool', tool: 'read', path: '/mnt/session/outputs/coverage/off.png', ok: true, images: 1 },
    { kind: 'tool', tool: 'bash', command: 'cat /mnt/session/outputs/coverage/take-sample-video-600ms.png' },
    { kind: 'tool', tool: 'read', path: '/mnt/session/outputs/coverage/event-goal-1500ms.png', ok: false },
  ];
  assert.deepEqual(readsOf(steps), ['/mnt/session/outputs/coverage/off.png'], 'a read that failed opened nothing, and a shell command is not a look');
  assert.deepEqual(framesOpened(review, readsOf(steps)), { reviewed: 3, opened: 1, unopened: ['take-sample-video-600ms.png', 'event-goal-1500ms.png'], all: false, fixed: 1 });
  const transcript = [
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'C:\\work\\outputs\\coverage\\off.png' } }], usage: { input_tokens: 1000, output_tokens: 100 } } },
    { type: 'assistant', message: { id: 'm1', content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'outputs/coverage/take-sample-video-600ms.png' } }], usage: { input_tokens: 1000, output_tokens: 100 } } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'image' }] } },
    { type: 'assistant', message: { id: 'm2', content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/x/outputs/coverage/event-goal-1500ms.png' } }, { type: 'tool_use', name: 'Bash', input: { command: 'ls' } }], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 10_000 } } },
  ].map((e) => JSON.stringify(e)).join('\n');
  assert.equal(framesOpened(review, transcriptReads(transcript)).all, true);
  assert.deepEqual(framesOpened(null, transcriptReads(transcript)), { reviewed: 0, opened: 0, unopened: [], all: false, fixed: 0 }, 'a record without a review reviewed nothing');
  // m1 counted once: 1000 in, 100 out at Haiku 5.5's $0.50 / $2.50, and 10k cache reads at $0.05.
  assert.equal(transcriptUsd(transcript, 'claude-haiku-5-5'), (1000 * 0.5 + 100 * 2.5 + 10_000 * 0.05) / 1e6);
  assert.equal(transcriptUsd(transcript, 'no-such-model'), null);
  // Only a look after the last coverage counts: a new coverage writes the same names over new
  // pixels, with every verdict empty again. And a read that failed opened nothing.
  const again = [
    { kind: 'tool', tool: 'read', path: '/o/coverage/off.png', ok: true },
    { kind: 'tool', tool: 'read', path: '/o/coverage/take-sample-video-600ms.png', ok: true },
    { kind: 'tool', tool: 'bash', command: 'cd /workspace && noacg coverage /workspace/graphic --out /o/coverage' },
    { kind: 'tool', tool: 'read', path: '/o/coverage/event-goal-1500ms.png', ok: true },
  ];
  assert.deepEqual(readsOf(again), ['/o/coverage/event-goal-1500ms.png']);
  const lines = (blocks) => blocks.map((content, i) => JSON.stringify({ type: i % 2 ? 'user' : 'assistant', message: { id: `m${i}`, content } })).join('\n');
  const recovered = lines([
    [{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'outputs/coverage/off.png' } }],
    [{ type: 'tool_result', tool_use_id: 't1', content: 'image' }],
    [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'noacg coverage ./graphic --out ./outputs/coverage' } }],
    [{ type: 'tool_result', tool_use_id: 't2', content: 'Coverage ...' }],
    [{ type: 'tool_use', id: 't3', name: 'Read', input: { file_path: 'outputs/coverage/take-sample-video-600ms.png' } }],
    [{ type: 'tool_result', tool_use_id: 't3', is_error: true, content: 'File does not exist.' }],
    [{ type: 'tool_use', id: 't4', name: 'Read', input: { file_path: 'outputs/coverage/event-goal-1500ms.png' } }],
  ]);
  assert.deepEqual(transcriptReads(recovered), ['outputs/coverage/event-goal-1500ms.png'], 'before the coverage, and the failed read, do not count');
});

// ── the subscription arm (D2) ───────────────────────────────────────────────────────────────

const DIGEST = `sha256:${'e'.repeat(64)}`;
const template = () => ({ name: 'Strap', type: 'lower-third', resolution: { width: 1920, height: 1080, label: '1920×1080' }, fps: 50, html: '<!doctype html><html><body><div id="f0"></div></body></html>', css: '', js: 'function play(){} function stop(){} function update(d){} function next(){}', fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Ana' }], settings: { playserver: 'OVERLAY' }, assets: [], layers: [] });
const FRAMES = ['off.png', 'take-sample-video-600ms.png'];
const BRIEF = { id: 'strap', kind: 'noacg', type: 'lower-third', neutral: true, prompt: 'A strap for Ana', stress: { f0: 'A much longer name' }, expect: { fields: 1, actions: [] } };

/** What the CLI's verbs print to the bench's own capture, without a browser. */
function standInCli() {
  const cli = async (args) => {
    const [verb] = args;
    const out = (flag) => args[args.indexOf(flag) + 1];
    let json = { ok: true };
    if (verb === 'inspect') json = { ok: true, inspection: { descriptors: [{ key: 'f0', label: 'Name' }], buttons: [] } };
    if (verb === 'validate') json = { ok: true, digest: DIGEST, validation: { merged: { errors: [], warnings: [] } } };
    if (verb === 'coverage') {
      mkdirSync(out('--out'), { recursive: true });
      json = { ok: true, frames: FRAMES.length, crops: 0, findings: [], failures: [], digest: DIGEST };
    }
    return { code: 0, json, stdout: JSON.stringify(json), stderr: '' };
  };
  cli.url = 'http://stand-in';
  return cli;
}

/**
 * A stand-in `claude`: `auth status` says the OAuth token; a session writes what the scenario says
 * into its working directory and a transcript into its config directory, and prints the JSON
 * `claude -p` prints (nothing at all when it is stopped at its limit).
 */
function standInClaude({ review = true, readAll = true, lastLine = 'DELIVERED', timedOut = false } = {}) {
  const calls = [];
  const run = (file, args, opts) => {
    calls.push({ args, env: opts.env, cwd: opts.cwd, input: opts.input });
    if (args.includes('auth')) return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth_token' }), stderr: '' };
    const outputs = path.join(opts.cwd, 'outputs');
    mkdirSync(outputs, { recursive: true });
    const summary = review ? { digest: DIGEST, frames: FRAMES.length, ok: FRAMES.length, fixed: 0, verdicts: FRAMES.map((f) => ({ file: f, verdict: 'ok' })) } : null;
    writeFileSync(path.join(outputs, 'record.zip'), 'PK-fake');
    writeFileSync(path.join(outputs, 'record.json'), JSON.stringify({ format: 'noacg-record-v1', digest: DIGEST, ...(summary ? { review: summary } : {}), doc: api.graphicDoc.newGraphicDoc(template(), { name: 'Strap', origin: { tool: 'noacg-cli', version: 'test' } }) }));
    // The shim's call log: the last coverage's digest is the version the session looked at.
    writeFileSync(path.join(path.dirname(opts.cwd), 'calls.jsonl'), `${JSON.stringify({ args: ['coverage', './graphic', '--out', './outputs/coverage'], exit: 0, digest: DIGEST })}\n`);
    const projects = path.join(opts.env.CLAUDE_CONFIG_DIR, 'projects', 'work');
    mkdirSync(projects, { recursive: true });
    const reads = (readAll ? FRAMES : FRAMES.slice(0, 1)).map((f, i) => JSON.stringify({ type: 'assistant', message: { id: `m${i}`, content: [{ type: 'tool_use', name: 'Read', input: { file_path: path.join(outputs, 'coverage', f) } }], usage: { input_tokens: 10_000, output_tokens: 1000 } } }));
    writeFileSync(path.join(projects, 'sess-1.jsonl'), `${reads.join('\n')}\n`);
    if (timedOut) return { status: null, signal: 'SIGTERM', error: Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' }), stdout: '', stderr: '' };
    return { status: 0, stdout: JSON.stringify({ session_id: 'sess-1', num_turns: 30, total_cost_usd: 0.41, is_error: false, result: `Made the strap.\n${lastLine}` }), stderr: '' };
  };
  return { run, calls };
}

const arm = (claude, opts = {}) => subscriptionArm({ claude: path.join(tmp(), 'claude.exe'), token: 'tok', model: 'claude-haiku-5-5', effort: 'high', url: 'https://noacg.studio', run: claude.run, ...opts });
const cellOf = (a) => runCell({ arm: a, brief: BRIEF, cellDir: path.join(tmp(), 'cell'), cli: standInCli(), ledger: heldLedger(), entry: { phase: 'L0', stage: 'arm', requireReview: true }, shape: api.shape, runId: 't' });

test('the subscription arm runs claude -p with the rung\'s model and effort, the web off, the 5.4 environment and the local CLI', async () => {
  const claude = standInClaude();
  const a = arm(claude);
  const cell = await cellOf(a);
  const session = claude.calls.find((c) => !c.args.includes('auth'));
  const flag = (name) => session.args[session.args.indexOf(name) + 1];
  assert.equal(flag('--model'), 'claude-haiku-5-5');
  assert.equal(flag('--effort'), 'high');
  assert.equal(flag('--disallowedTools'), 'WebFetch,WebSearch');
  assert.equal(flag('--plugin-dir'), path.join(ROOT, 'cli', 'plugin'), "this checkout's skill");
  assert.ok(session.args.includes('--strict-mcp-config'));
  assert.equal(session.env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, '1');
  assert.equal(session.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.ok(!Object.keys(session.env).some((k) => /API_KEY|BENCH/.test(k)), 'no key reaches it');
  assert.ok(session.env.PATH.split(path.delimiter)[0].endsWith(path.join('session', 'bin')), 'the shimmed CLI first on PATH');
  assert.ok(!session.cwd.startsWith(ROOT + path.sep), 'outside the repository');
  assert.equal(session.input, ladderPrompt(BRIEF));
  assert.equal(cell.outcome, 'delivered');
  assert.equal(cell.notionalUsd, 0.41, 'its notional cost is what Claude Code printed');
  assert.equal(cell.costCents, 0, 'never the credit');
  assert.deepEqual(cell.look, { reviewed: 2, opened: 2, unopened: [], all: true, fixed: 0 });
  assert.equal(cell.effort, 'high');
  assert.deepEqual(cell.digest.problems, []);
});

test('a ladder hand-in without a review, or without DELIVERED, is not delivered; a stopped session is costed from its transcript', async () => {
  const unreviewed = await cellOf(arm(standInClaude({ review: false })));
  assert.equal(unreviewed.outcome, 'not-ready');
  assert.match(unreviewed.reason, /without a review/);
  const peeked = await cellOf(arm(standInClaude({ readAll: false })));
  assert.equal(peeked.outcome, 'delivered', 'the gate passed; the look line says what was not opened');
  assert.deepEqual(peeked.look.unopened, ['take-sample-video-600ms.png']);
  const unsure = await cellOf(arm(standInClaude({ lastLine: 'NOT READY: the clock overlaps' })));
  assert.equal(unsure.outcome, 'not-ready');
  const stopped = await cellOf(arm(standInClaude({ timedOut: true })));
  assert.equal(stopped.outcome, 'not-ready');
  assert.match(stopped.reason, /stopped at 20 minutes/);
  assert.equal(stopped.notionalUsd, (2 * (10_000 * 0.5 + 1000 * 2.5)) / 1e6, 'two model messages at Haiku list prices');
  assert.equal(handInLine('done\n**DELIVERED**'), 'delivered');
  assert.equal(handInLine('done\n`DELIVERED`'), 'delivered', 'as the prompt shows it, in backticks');
  // A closing message longer than the 4,000 characters readRun keeps still ends in its hand-in line.
  const long = await cellOf(arm(standInClaude({ lastLine: `${'A long summary. '.repeat(400)}\nDELIVERED` })));
  assert.equal(long.outcome, 'delivered');
  assert.equal(handInLine('DELIVERED\nthen one more thought'), null, 'only the last line counts');
  assert.throws(() => subscriptionArm({ claude: 'c', token: 't', url: 'u' }), /--model/);
  assert.equal(findTranscript(path.join(tmp(), 'none'), 'x'), null);
});

// ── the sealed exam (section 2, AC-2) ───────────────────────────────────────────────────────

const LADDER_PASS = privatePassphraseFile(ROOT, 'harness-ladder-exam');

test('the ladder exam is sealed: the committed file has the seal\'s shape, and a wrong passphrase gets nothing', () => {
  const sealed = readSealed(path.join(ROOT, LADDER_EXAM_DIR, 'briefs.sealed'));
  assert.equal(sealedShape(sealed), null);
  assert.match(readHash(path.join(ROOT, LADDER_EXAM_DIR, 'briefs.sha256')), /^[0-9a-f]{64}$/);
  assert.throws(() => openSealed(sealed, 'not the passphrase'), /unable to authenticate|Unsupported state/);
  assert.notEqual(readHash(path.join(ROOT, LADDER_EXAM_DIR, 'briefs.sha256')), readHash(path.join(ROOT, 'benchmarks', 'harness', 'exam', 'briefs.sha256')), 'not the H8 exam');
});

test('the ladder exam decrypts to its hash and holds section 2\'s mix, no id of an earlier brief file, where the passphrase is here', { skip: !LADDER_PASS && 'the private passphrase is not on this machine' }, () => {
  const plain = openSealed(readSealed(path.join(ROOT, LADDER_EXAM_DIR, 'briefs.sealed')), readFileSync(LADDER_PASS, 'utf8').trim());
  assert.equal(sha256(plain), readHash(path.join(ROOT, LADDER_EXAM_DIR, 'briefs.sha256')));
  const briefs = JSON.parse(plain.toString('utf8')).briefs;
  plain.fill(0);
  assert.equal(briefs.length, 20);
  for (const b of briefs) {
    assert.equal(b.kind, 'noacg');
    assert.ok(b.stress && b.expect && typeof b.judge === 'string' && b.judge.trim(), `${b.id} carries stress, expect and judge`);
    for (const k of Object.keys(b.stress)) assert.match(k, /^(f\d+|logo|background)$/);
  }
  assert.ok(new Set(briefs.filter((b) => b.type).map((b) => b.type)).size >= 8, 'at least eight types');
  assert.ok(briefs.filter((b) => b.type === null && b.novel && typeof b.fields === 'string').length >= 2, 'two typeless');
  assert.ok(briefs.filter((b) => (b.expect.actions ?? []).length >= 3).length >= 6, 'six boards with three or more actions');
  const ids = briefs.map((b) => b.id);
  assert.equal(new Set(ids).size, 20);
  const earlier = earlierBriefIds(ROOT);
  assert.deepEqual(ids.filter((id) => earlier.has(id)), [], 'no id of an earlier brief file');
  assert.ok(earlier.size > 100);
});

test('the seal was committed before any ladder session', () => {
  const git = (args) => {
    try {
      return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  };
  // In a full history the sealing commit is the recorded one; in a shallow checkout the recorded time stands.
  const { at } = sealCommittedAt(git);
  const sessions = readLedger(LEDGER_FILE).entries.filter((e) => /^L[1-4]$/.test(e.phase) && e.kind === 'session');
  assert.ok(sessions.length > 0, 'L1 ran');
  for (const e of sessions) assert.ok(Date.parse(e.at) > Date.parse(at), `${e.phase} ${e.brief} ran after the seal`);

  // A shallow checkout's oldest commit has no parent and seems to add every file: not the seal.
  const recorded = { sha: 'a'.repeat(40), at: '2026-10-17T11:16:00Z' };
  const fake = ({ added, shallow, parent }) => (args) => (args[0] === 'log' ? added : args[1] === '--is-shallow-repository' ? `${shallow}\n` : parent ? 'p\n' : null);
  assert.deepEqual(sealCommittedAt(fake({ added: `${'b'.repeat(40)} 2026-10-17T15:00:00Z\n`, shallow: true, parent: false }), recorded), { at: recorded.at, from: 'recorded' });
  assert.deepEqual(sealCommittedAt(fake({ added: `${'a'.repeat(40)} 2026-10-17T14:16:00+03:00\n`, shallow: false, parent: true }), recorded), { at: '2026-10-17T14:16:00+03:00', from: 'git' });
  assert.throws(() => sealCommittedAt(fake({ added: `${'b'.repeat(40)} 2026-10-17T15:00:00Z\n`, shallow: false, parent: true }), recorded), /not by the recorded/, 'with the history, a different sealing commit is refused');
  assert.throws(() => sealCommittedAt(fake({ added: `${'b'.repeat(40)} 2026-10-17T15:00:00Z\n`, shallow: true, parent: true }), recorded), /not by the recorded/, 'a shallow checkout that holds the real history is checked too');
});

test('the ladder exam opens only in L4, and the ladder set only from H8\'s closed exam', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `exam-${i}`, kind: 'noacg', type: 'lower-third', prompt: `brief ${i}`, stress: {}, expect: { fields: 1, actions: [] } }));
  const root = tmp();
  const seal = (dir, briefs, passphrase) => {
    const plain = Buffer.from(JSON.stringify({ version: 1, briefs }));
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 }), iv);
    const ciphertext = Buffer.concat([c.update(plain), c.final()]);
    mkdirSync(path.join(root, dir), { recursive: true });
    writeFileSync(path.join(root, dir, 'briefs.sealed'), JSON.stringify({ format: 'noacg-sealed-v1', cipher: 'aes-256-gcm', kdf: 'scrypt', N: 16384, r: 8, p: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
    writeFileSync(path.join(root, dir, 'briefs.sha256'), `${createHash('sha256').update(plain).digest('hex')}  briefs.json\n`);
    const file = path.join(root, `${passphrase}.txt`);
    writeFileSync(file, passphrase);
    return file;
  };
  const h8 = LADDER_SET.map((id) => ({ id, kind: 'noacg', type: 'scoreboard', prompt: id, stress: {}, expect: { fields: 1, actions: [] } }));
  const passphraseFile = seal(path.join('benchmarks', 'harness', 'exam'), [...h8, ...twenty.slice(8).map((b) => ({ ...b, id: `h8-${b.id}` }))], 'h8');
  const ladderPassphraseFile = seal(LADDER_EXAM_DIR, twenty, 'ladder');
  const tuning = [{ id: 'news-lower-third', kind: 'noacg', type: 'lower-third', prompt: 'p', stress: {}, expect: { fields: 1, actions: [] } }];
  const l = closed(heldLedger(), 'H8', 'L0');
  const got = ladderBriefs({ root, ledger: l, phase: 'L1', ids: ['boxing-night-matchup', 'news-lower-third'], tuning, passphraseFile, ladderPassphraseFile });
  assert.deepEqual(got.map((b) => b.id), ['boxing-night-matchup', 'news-lower-third']);
  assert.throws(() => ladderBriefs({ root, ledger: l, phase: 'L1', ids: ['h8-exam-9'], tuning, passphraseFile, ladderPassphraseFile }), /no tuning or ladder brief h8-exam-9/, 'only the eight of D4 leave the closed exam');
  assert.throws(() => ladderBriefs({ root, ledger: l, phase: 'L1', ids: ['exam-3'], tuning, passphraseFile, ladderPassphraseFile }), /no tuning or ladder brief exam-3/, 'the ladder exam never reaches a tuning phase');
  assert.throws(() => ladderBriefs({ root, ledger: l, phase: 'L4', ids: [], tuning, passphraseFile, ladderPassphraseFile }), /opens only in L4, once L3 is closed/);
  closed(l, 'L1', 'L2', 'L3');
  assert.deepEqual(ladderBriefs({ root, ledger: l, phase: 'L4', ids: [], tuning, passphraseFile, ladderPassphraseFile }).map((b) => b.id), twenty.map((b) => b.id));
  assert.throws(() => ladderBriefs({ root, ledger: l, phase: 'L4', ids: [], tuning, passphraseFile, ladderPassphraseFile: null }), /harness-ladder-exam/);
  // The parent's exam path is unchanged: the H8 briefs open for H8 only while it is pending.
  assert.throws(() => examBriefs({ root, ledger: l, phase: 'H8', passphraseFile }), /open only for the exam/);
});

// ── the ladder judge (D8) ───────────────────────────────────────────────────────────────────

test('the ladder judge is Opus 5.5 on the exam judge\'s own prompt and rubric, and is used only if its calibration passed', () => {
  const exam = JSON.parse(readFileSync(path.join(ROOT, 'benchmarks', 'harness', 'judge', 'judge.lock.json'), 'utf8'));
  const lockFile = path.join(ROOT, LADDER_JUDGE_LOCK);
  const judge = ladderJudge(ROOT);
  assert.equal(judge.frozen, true);
  if (existsSync(lockFile)) {
    const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    assert.equal(lock.model, 'claude-opus-5-5');
    assert.ok(sameFiles(lock, exam), 'the exam judge\'s prompt and rubric, unchanged');
    assert.deepEqual(lock.split, exam.split, 'calibrated on the held-back part the exam judge was');
    assert.equal(loadJudge(path.join(ROOT, 'benchmarks', 'harness', 'judge'), { lockFile }).frozen, true, 'its files hash to its lock');
    assert.equal(judge.which, lock.calibration?.pass === true ? 'ladder' : 'exam');
    assert.equal(judge.lock.model, lock.calibration?.pass === true ? 'claude-opus-5-5' : exam.model);
  } else assert.equal(judge.lock.model, exam.model, 'no ladder lock: the exam judge (Fable) judges the ladder too');
  assert.throws(() => secondLock(path.join('benchmarks', 'harness', 'judge', 'judge.lock.json')), /not judge\.lock\.json/);
  assert.equal(secondLock(LADDER_JUDGE_LOCK).tag, '-ladder');
  assert.equal(sameFiles({ sha256: { 'prompt.md': 'x' } }, exam), false);
});

test("a rung is counted as H8 counted: D5's screen ends it early, D6 matches only on all eight", () => {
  const arm = 'subscription';
  const cell = (brief, o = {}) => ({ brief, arm, outcome: 'delivered', validation: { ok: true, errors: [] }, shape: { ok: true }, operator: { missing: [] }, notionalUsd: 0.5, wallSeconds: 400, look: { reviewed: 10, opened: 10, unopened: [], all: true, fixed: 0 }, ...o });
  const single = (brief, answer = {}) => ({ judge: 'fp', task: 'single', id: `${brief}.claude-haiku-5-5-high`, brief, answer: { airable: true, basicMistakes: [], missingActions: [], ...answer } });
  const eight = RUNG_ORDER.map((b) => cell(b));
  const goodSingles = RUNG_ORDER.map((b) => single(b));

  const match = tallyRung({ cells: eight, judgements: goodSingles, fingerprint: 'fp' });
  assert.equal(match.verdict, 'MATCH');
  assert.equal(match.all.usdPerUsable, 0.5);
  assert.equal(match.all.lookAll, 8);
  assert.match(rungMarkdown('haiku-high', match), /MATCH; 8 delivered, 8 usable/);

  // The screen: its first four only; nothing after it run yet.
  assert.equal(tallyRung({ cells: eight.slice(0, 4), judgements: goodSingles, fingerprint: 'fp' }).verdict, 'screen passed');
  assert.equal(tallyRung({ cells: eight.slice(0, 4), judgements: [], fingerprint: 'fp' }).verdict, 'incomplete', 'a delivered graphic not judged decides nothing');

  // Three not usable end the rung: a not-airable single, a basic mistake (both rubber-stamped), a not-ready session.
  const [b0, b1, b2, b3] = RUNG_ORDER;
  const bad = [single(b0, { airable: false }), single(b1, { basicMistakes: [{ kind: 'text-overlap' }] }), ...goodSingles.slice(2)];
  const out = tallyRung({ cells: [cell(b0), cell(b1), cell(b2, { outcome: 'not-ready', look: null }), cell(b3)], judgements: bad, fingerprint: 'fp' });
  assert.equal(out.verdict, 'screened out');
  assert.equal(out.screen.endsAt, 'not usable');
  assert.deepEqual(out.all.rubberStamps, [b0, b1], 'every verdict ok, and the judge failed it');
  // A judgement by another judge is not counted.
  assert.equal(tallyRung({ cells: eight, judgements: goodSingles.map((j) => ({ ...j, judge: 'other' })), fingerprint: 'fp' }).verdict, 'incomplete');

  // The cost line: two usable of four at $4.40 notional is $2.20 a usable, over $2.00.
  const dear = [b0, b1, b2, b3].map((b) => cell(b, { notionalUsd: 1.1 }));
  const costly = tallyRung({ cells: dear, judgements: [single(b0, { airable: false }), single(b1, { airable: false }), ...goodSingles.slice(2)], fingerprint: 'fp' });
  assert.equal(costly.screen.endsAt, 'cost');
  assert.equal(costly.screen.usdPerUsable, 2.2);

  // All eight run but one line fails: no match. A missing action read as offered counts as offered.
  const slow = tallyRung({ cells: eight.map((c) => ({ ...c, wallSeconds: 700 })), judgements: goodSingles, fingerprint: 'fp' });
  assert.equal(slow.verdict, 'no match');
  assert.deepEqual(slow.lines.map((l) => l.holds), [true, true, false, true]);
  const flagged = eight.map((c, i) => (i === 5 ? { ...c, operator: { missing: ['undoPoint'] } } : c));
  const gate = tallyRung({ cells: flagged, judgements: goodSingles, fingerprint: 'fp' });
  assert.equal(gate.all.usable, 7);
  assert.deepEqual(gate.rows[5].flagsToRead, ['undoPoint'], "the judge's single did not name it, so it is read against the operator surface");
  const read = tallyRung({ cells: flagged, judgements: goodSingles, fingerprint: 'fp', readings: { [`${RUNG_ORDER[5]}.${arm}`]: { undoPoint: 'undoA/undoB' } } });
  assert.equal(read.all.usable, 8);
  assert.deepEqual([...RUNG_ORDER].sort(), [...LADDER_SET].sort(), 'the rung order is the ladder set');
});
