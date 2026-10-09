#!/usr/bin/env node
// THE AGENT-DOOR MEASURED ROUND (docs/AGENT_CLI.md "Status" P3; the plan's arms A-E).
//
//   node scripts/agent-round-bench.mjs --plan                      # FREE. The matrix, every cell's
//                                                                  # exact prompt, the estimate.
//   node scripts/agent-round-bench.mjs --control [--out <dir>]     # FREE. No model: pushes a known
//                                                                  # answer per brief (a scaffold, the
//                                                                  # repo's OGraf fixture) through the
//                                                                  # WHOLE record pipeline. Run it FIRST
//                                                                  # and after any change here - a broken
//                                                                  # harness would be measured as a model.
//   node scripts/agent-round-bench.mjs --run [--arms A,B] [--briefs id,..] [--model m] [--max-minutes 25] [--out <dir>]
//                                                                  # PAID: spends the owner's Claude Code
//                                                                  # quota. Owner says go first.
//   node scripts/agent-round-bench.mjs --review <roundDir>         # FREE. Rebuild the blind gallery.
//
// WHAT A CELL IS. One brief x one arm = one FRESH Claude Code session (`claude -p`) in its own
// empty directory OUTSIDE this repository (so it loads none of the repo's instructions - a user's
// machine has none), with the `noacg` plugin loaded for that session only (`--plugin-dir cli/plugin`:
// the contract-only skill + `/noacg:graphic`), the built CLI on PATH behind a SHIM that ledgers
// every invocation (that is how "validate rounds" is counted without touching the CLI), and
// NOACG_URL pointing at THIS checkout's dev server. Arm D enables the installed `frontend-design`
// plugin through `--settings enabledPlugins`; every other arm disables it, so the arms differ by
// exactly one thing. The agent is told to finish with a clean validate + inspect and NOT to save.
//
// WHAT IS RECORDED per cell (record.json): the prompt, wall-clock minutes, the claude result
// (turns, cost, session id, its last message), the ledger (every noacg call), validate rounds,
// the FINAL verdict the harness itself measures afterwards (`noacg validate --json --screenshots`
// - never the agent's own claim), `noacg inspect --json` (the operator surface), the stress frame.
// The OGraf brief records the host steps and the derived contract instead.
//
// THE GALLERY IS BLIND ON PURPOSE. review.html shows opaque cell ids, the brief, the frames and
// the operator surface - no arm. key.json maps ids to arms and is read only AFTER notes.md is
// written. The novel brief's read is "operable without category code": are its actions on the
// panel, do they work.
//
// Named `*bench*` so the one-job-per-machine guard and the process detector both see it
// (scripts/command-match.mjs): every cell launches Chromium through the CLI, serially.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort } from './dev-port.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANK = path.join(ROOT, 'benchmarks', 'agent', 'v1', 'briefs.json');
const CLI_ENTRY = path.join(ROOT, 'cli', 'dist', 'index.js');
const PLUGIN_DIR = path.join(ROOT, 'cli', 'plugin');
const OGRAF_FIXTURE = path.join(ROOT, 'e2e', 'fixtures', 'ograf', 'scorebug-demo');
const ARM_IDS = ['A', 'B', 'C', 'D', 'E'];
const DESIGN_PLUGIN = 'frontend-design@claude-plugins-official';

// ── arguments ──────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  if (eq >= 0) return argv[i].slice(eq + 1);
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const mode = flag('run') ? 'run' : flag('control') ? 'control' : flag('review') ? 'review' : 'plan';
const armsWanted = (value('arms', ARM_IDS.join(',')) || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const briefsWanted = (value('briefs', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const maxMinutes = Number(value('max-minutes', '25'));
const model = value('model', '');
const url = process.env.NOACG_URL || `http://localhost:${devPort()}`;

const bank = JSON.parse(readFileSync(BANK, 'utf8'));
const briefs = bank.briefs.filter((b) => !briefsWanted.length || briefsWanted.includes(b.id));
for (const a of armsWanted) if (!ARM_IDS.includes(a)) fail(`unknown arm ${a}; arms are ${ARM_IDS.join(', ')}`);

function fail(message) {
  console.error(`agent-round-bench: ${message}`);
  process.exit(2);
}

// ── the matrix ─────────────────────────────────────────────────────────────────────────────────
/** Why a cell does not apply, or null when it runs. */
function notApplicable(brief, arm) {
  if (brief.kind === 'ograf' && (arm === 'B' || arm === 'C')) return 'a hand-written OGraf Graphic has no NoaCG scaffold';
  if (arm === 'B' && !brief.neutral) return brief.type ? `the ${brief.type} type has no neutral scaffold yet` : 'no typeless neutral spine requested';
  if (arm === 'C' && !brief.chassis) return 'no catalog chassis carries this field/control combination';
  return null;
}

function cellsOf() {
  const cells = [];
  for (const brief of briefs) {
    for (const arm of armsWanted) {
      const na = notApplicable(brief, arm);
      cells.push({ id: `${brief.id}.${arm}`, brief, arm, na });
    }
  }
  return cells;
}

/** The prompt a cell's Claude Code session receives - the brief as a user would type it, plus the
 *  arm's ONE difference and the bench's bookkeeping (work here, validate clean, do not save). */
function promptFor(brief, arm) {
  const lines = [];
  lines.push(`Make a NoaCG graphic: ${brief.prompt}`);
  lines.push('');
  lines.push('Use the `noacg-graphic` skill (it is installed in this session) and the `noacg` CLI, which is on PATH and already points at the NoaCG deployment to use (NOACG_URL is set). Work in the directory `./graphic` inside the current working directory. Write the graphic\'s sources yourself with your ordinary tools.');
  if (brief.kind === 'ograf') {
    lines.push('Deliverable: a plain OGraf v1 Graphic package in `./graphic` - an `.ograf.json` manifest and the Web Component module it names - NOT a NoaCG template. `noacg validate ./graphic` treats it as a third-party package (manifest conformance + the OGraf host driving load/update/custom actions/play/stop) and `noacg inspect ./graphic` prints the operator surface NoaCG derives from the manifest.');
  } else if (arm === 'B') {
    lines.push(brief.type
      ? `Start from the type's NEUTRAL scaffold: \`noacg scaffold --type ${brief.type} --design neutral --name "<your name>" --out ./graphic\` - its fields, state machine, controls and runtime on a plain spine - and design on it.`
      : `Start from a typeless scaffold with exactly these fields: \`noacg scaffold --fields "${brief.fields}" --name "<your name>" --out ./graphic\`, and design on it.`);
  } else if (arm === 'C') {
    lines.push(`Start from the catalog chassis \`noacg scaffold --type ${brief.type} --design ${brief.chassis} --name "<your name>" --out ./graphic\` - a proven composition - and restyle or adapt it to the brief.`);
  } else {
    lines.push('Author the sources from scratch against the contract (do not scaffold from a type).');
  }
  if (arm === 'D') lines.push('The `frontend-design` skill is available in this session - use it for the look; NoaCG\'s rules bind only for correctness, editability, compatibility and playout.');
  if (arm === 'E') lines.push('Read NoaCG\'s own design notes first (`noacg docs design-notes`) and follow them for the look.');
  lines.push('');
  lines.push('Finish when `noacg validate ./graphic --screenshots ./shots` reports no errors and you have looked at `shots/onair.png` and `shots/stress.png` and would air it, then print `noacg inspect ./graphic`. Do NOT run `noacg save` or `noacg login` - this is a bench, nothing is saved. End with one short paragraph: what you made, what the operator can change and do.');
  return lines.join('\n');
}

function estimate(cells) {
  const live = cells.filter((c) => !c.na).length;
  return { cells: cells.length, live, na: cells.length - live, minutes: `${live * 8}-${live * 20}`, note: 'serial - one Chromium-driving session at a time on this laptop; each cell is one fresh `claude -p` session, billed to the owner\'s Claude Code quota' };
}

// ── the shim: `noacg` on PATH that ledgers every call, then runs the built CLI ────────────────
function writeShim(binDir, ledgerFile) {
  mkdirSync(binDir, { recursive: true });
  const node = process.execPath;
  const ledgerJs = path.join(binDir, 'noacg-ledger.mjs');
  writeFileSync(ledgerJs, `// Ledger every noacg call of this cell, then run the real CLI with the same args + exit code.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
const started = Date.now();
const r = spawnSync(${JSON.stringify(node)}, [${JSON.stringify(CLI_ENTRY)}, ...args], { stdio: 'inherit', env: process.env });
appendFileSync(${JSON.stringify(ledgerFile)}, JSON.stringify({ at: new Date(started).toISOString(), ms: Date.now() - started, args, exit: r.status ?? 1 }) + '\\n');
process.exit(r.status ?? 1);
`);
  writeFileSync(path.join(binDir, 'noacg'), `#!/bin/sh\nexec "${node.replace(/\\/g, '/')}" "${ledgerJs.replace(/\\/g, '/')}" "$@"\n`);
  try { chmodSync(path.join(binDir, 'noacg'), 0o755); } catch { /* windows */ }
  writeFileSync(path.join(binDir, 'noacg.cmd'), `@echo off\r\n"${node}" "${ledgerJs}" %*\r\n`);
}

function readLedger(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ── the record pipeline (the harness's OWN measurement of whatever is in ./graphic) ───────────
function cli(args, cwd) {
  const r = spawnSync(process.execPath, [CLI_ENTRY, ...args], { cwd, encoding: 'utf8', env: { ...process.env, NOACG_URL: url }, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* not json */ }
  return { code: r.status, json, stderr: (r.stderr || '').slice(-4000) };
}

function measure(cellDir, brief) {
  const graphic = path.join(cellDir, 'graphic');
  const shots = path.join(cellDir, 'final-shots');
  if (!existsSync(graphic) || !readdirSync(graphic).length) return { present: false };
  const v = cli(['validate', graphic, '--json', '--screenshots', shots], cellDir);
  const i = cli(['inspect', graphic, '--json'], cellDir);
  const out = { present: true, validateExit: v.code, inspectExit: i.code };
  if (brief.kind === 'ograf' || v.json?.kind === 'ograf') {
    out.final = { ok: v.json?.ok ?? false, errors: v.json?.errors ?? [v.stderr], hostSteps: v.json?.steps ?? [], contract: v.json?.contract ?? null };
  } else {
    const m = v.json?.validation?.merged;
    out.final = { ok: v.json?.ok ?? false, errors: (m?.errors ?? []).map((e) => `${e.rule}: ${e.message}`), warnings: (m?.warnings ?? []).map((e) => `${e.rule}: ${e.message}`), readiness: (v.json?.validation?.readiness ?? []).map((r) => `${r.label}: ${r.state}`), engines: v.json?.validation?.engineHeadline ?? null, normalized: v.json?.normalize ?? null, stderr: v.json ? undefined : v.stderr };
    out.screenshots = v.json?.screenshots ?? null;
  }
  out.inspect = i.json?.inspection ? { inputs: (i.json.inspection.descriptors ?? []).map((d) => `${d.key ?? d.field ?? '?'}:${d.kind ?? d.control ?? '?'}`), buttons: (i.json.inspection.buttons ?? []).map((b) => b.event ?? b.id ?? b.label), buttonCount: (i.json.inspection.buttons ?? []).length, inputCount: (i.json.inspection.descriptors ?? []).length } : { error: i.stderr };
  // The stress frame with the brief's own long values - the frame the owner reads.
  if (brief.kind !== 'ograf' && brief.stress) {
    const dataArgs = Object.entries(brief.stress).flatMap(([k, val]) => ['--data', `${k}=${val}`]);
    const s = cli(['screenshot', graphic, '--state', 'onair', ...dataArgs, '--out', path.join(shots, 'brief-stress.png'), '--json'], cellDir);
    out.briefStress = s.code === 0 ? path.join(shots, 'brief-stress.png') : null;
  }
  return out;
}

function expectations(brief, measured) {
  const notes = [];
  const want = brief.expect ?? {};
  const got = measured.inspect ?? {};
  if (typeof want.fields === 'number') notes.push(`${got.inputCount === want.fields ? 'ok' : 'DIFF'} inputs ${got.inputCount ?? '?'} (expected ${want.fields})`);
  if (Array.isArray(want.actions) && want.actions.length) {
    const have = new Set((got.buttons ?? []).map((b) => String(b).toLowerCase()));
    const missing = want.actions.filter((a) => !have.has(a.toLowerCase()));
    notes.push(`${missing.length ? 'DIFF' : 'ok'} actions ${JSON.stringify(got.buttons ?? [])} (expected ${want.actions.join('/')}${missing.length ? `; missing ${missing.join('/')}` : ''})`);
  }
  return notes;
}

// ── one cell ───────────────────────────────────────────────────────────────────────────────────
function runCell(roundDir, cell, { paid }) {
  const cellDir = path.join(roundDir, 'cells', cell.id);
  rmSync(cellDir, { recursive: true, force: true });
  mkdirSync(path.join(cellDir, 'graphic'), { recursive: true });
  const ledgerFile = path.join(cellDir, 'ledger.jsonl');
  const binDir = path.join(cellDir, 'bin');
  writeShim(binDir, ledgerFile);
  const prompt = promptFor(cell.brief, cell.arm);
  writeFileSync(path.join(cellDir, 'prompt.md'), prompt);
  const record = { id: cell.id, brief: cell.brief.id, kind: cell.brief.kind, arm: cell.arm, armLabel: bank.arms[cell.arm]?.label, na: cell.na, startedAt: new Date().toISOString(), noacgUrl: url, paid };
  if (cell.na) {
    record.skipped = cell.na;
    writeFileSync(path.join(cellDir, 'record.json'), JSON.stringify(record, null, 2));
    return record;
  }
  const started = Date.now();
  if (paid) {
    record.claude = runClaude(cellDir, prompt, cell.arm, binDir);
  } else {
    record.claude = { control: true, note: 'no model: the control answer was placed by the harness' };
    controlAnswer(cellDir, cell.brief, cell.arm, binDir);
  }
  record.minutes = Math.round(((Date.now() - started) / 60000) * 10) / 10;
  record.ledger = readLedger(ledgerFile);
  record.validateRounds = record.ledger.filter((l) => l.args[0] === 'validate').length;
  record.saveAttempts = record.ledger.filter((l) => l.args[0] === 'save').length;
  record.measured = measure(cellDir, cell.brief);
  record.expectations = expectations(cell.brief, record.measured);
  if (!paid && cell.brief.kind === 'ograf') record.expectations.unshift('control answer = the repo scorebug fixture, not this brief - a DIFF here is expected');
  record.endedAt = new Date().toISOString();
  writeFileSync(path.join(cellDir, 'record.json'), JSON.stringify(record, null, 2));
  return record;
}

/** The control answer: what a perfect agent would have left in ./graphic, placed without a model. */
function controlAnswer(cellDir, brief, arm, binDir) {
  const graphic = path.join(cellDir, 'graphic');
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, NOACG_URL: url };
  // Through the shim's ledger script directly - never a shell: a field list like `Active:select=A|B`
  // is a PIPE to cmd.exe, and the control run measured exactly that (the typeless scaffold "failed").
  const run = (args) => spawnSync(process.execPath, [path.join(binDir, 'noacg-ledger.mjs'), ...args], { cwd: cellDir, env, stdio: 'pipe', windowsHide: true });
  if (brief.kind === 'ograf') {
    rmSync(graphic, { recursive: true, force: true });
    copyDir(OGRAF_FIXTURE, graphic);
    run(['validate', graphic, '--json']);
    return;
  }
  rmSync(graphic, { recursive: true, force: true });
  const scaffold = brief.type
    ? ['scaffold', '--type', brief.type, '--design', arm === 'C' && brief.chassis ? brief.chassis : 'neutral', '--name', `Control ${brief.id}`, '--out', graphic]
    : ['scaffold', '--fields', brief.fields, '--name', `Control ${brief.id}`, '--out', graphic];
  const s = run(scaffold);
  if (s.status !== 0) {
    // A type without a neutral scaffold: fall back to its first chassis so the pipeline still runs.
    if (brief.type && brief.chassis) run(['scaffold', '--type', brief.type, '--design', brief.chassis, '--name', `Control ${brief.id}`, '--out', graphic]);
  }
  run(['validate', graphic, '--json']); // one ledgered round, as an agent would
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const e of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyDir(src, dst);
    else copyFileSync(src, dst);
  }
}

/** One fresh `claude -p` session for the cell. */
function claudeExecutable() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8', windowsHide: true });
  const first = (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  if (r.status !== 0 || !first) fail('`claude` is not on PATH - the round drives Claude Code headless');
  return first;
}

function runClaude(cellDir, prompt, arm, binDir) {
  // The prompt goes in on STDIN and the settings through a FILE: neither ever touches a shell, so
  // quotes, newlines, braces and `|` in a brief cannot be re-parsed by cmd.exe on the way in.
  const settingsFile = path.join(cellDir, 'claude-settings.json');
  writeFileSync(settingsFile, JSON.stringify({ enabledPlugins: { [DESIGN_PLUGIN]: arm === 'D' } }, null, 2));
  const args = [
    '-p',
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash,Read,Write,Edit,MultiEdit,Glob,Grep,LS,WebFetch',
    '--plugin-dir', PLUGIN_DIR,
    '--settings', settingsFile,
  ];
  if (model) args.push('--model', model);
  const env = { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`, NOACG_URL: url };
  const started = Date.now();
  // Shares the terminal console so Ctrl+C stops it too: scripts/windows-hide.test.mjs.
  const r = spawnSync(claudeExecutable(), args, { cwd: cellDir, env, input: prompt, encoding: 'utf8', timeout: maxMinutes * 60_000, maxBuffer: 64 * 1024 * 1024, windowsHide: false });
  writeFileSync(path.join(cellDir, 'claude.stdout.txt'), r.stdout || '');
  writeFileSync(path.join(cellDir, 'claude.stderr.txt'), r.stderr || '');
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* a timeout leaves no json */ }
  return {
    exit: r.status,
    timedOut: r.error?.code === 'ETIMEDOUT' || (r.signal != null),
    ms: Date.now() - started,
    sessionId: json?.session_id ?? null,
    turns: json?.num_turns ?? null,
    costUsd: json?.total_cost_usd ?? null,
    durationMs: json?.duration_ms ?? null,
    isError: json?.is_error ?? null,
    result: typeof json?.result === 'string' ? json.result.slice(0, 4000) : null,
  };
}

// ── the blind gallery ──────────────────────────────────────────────────────────────────────────
function opaqueId(cellId, salt) {
  return createHash('sha1').update(`${salt}:${cellId}`).digest('hex').slice(0, 6);
}

function review(roundDir) {
  const cellsDir = path.join(roundDir, 'cells');
  const records = readdirSync(cellsDir).map((d) => path.join(cellsDir, d, 'record.json')).filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')));
  const salt = path.basename(roundDir);
  const live = records.filter((r) => !r.na);
  // Shuffle deterministically by opaque id so the order carries no arm signal.
  const rows = live.map((r) => ({ r, key: opaqueId(r.id, salt) })).sort((a, b) => a.key.localeCompare(b.key));
  const rel = (p) => (p ? path.relative(roundDir, p).split(path.sep).join('/') : null);
  const card = ({ r, key }) => {
    const shots = r.measured?.screenshots ?? {};
    const frames = [
      ['on air', rel(shots.onair)],
      ['stress (doubled text)', rel(shots.stress)],
      ['the brief\'s long values', rel(r.measured?.briefStress)],
    ].filter(([, p]) => p).map(([label, p]) => `<figure><img src="${p}" loading="lazy"><figcaption>${label}</figcaption></figure>`).join('');
    const surface = r.measured?.inspect ? `<p><b>Operator surface</b>: ${r.measured.inspect.inputCount ?? '?'} input(s) - ${(r.measured.inspect.inputs ?? []).join(', ')}; ${r.measured.inspect.buttonCount ?? 0} button(s) - ${(r.measured.inspect.buttons ?? []).join(', ') || 'Take/Update/Next/Out only'}</p>` : '';
    const verdict = r.measured?.final ? `<p><b>Validator</b>: ${r.measured.final.ok ? 'clean' : 'ERRORS'}${r.measured.final.errors?.length ? ` - ${r.measured.final.errors.join('; ')}` : ''}${r.measured.final.warnings?.length ? `<br><small>${r.measured.final.warnings.length} warning(s): ${r.measured.final.warnings.slice(0, 6).join('; ')}</small>` : ''}</p>` : '<p><b>Validator</b>: nothing to measure</p>';
    return `<section class="cell" id="${key}"><h2>${key} <small>${r.brief}${r.kind === 'ograf' ? ' (OGraf)' : ''}</small></h2><p class="brief">${escapeHtml(briefText(r.brief))}</p><div class="frames">${frames || '<p>(no frames)</p>'}</div>${surface}${verdict}<p class="notes"><b>Your read</b> (copy to notes.md): airable? visual? ${r.brief === 'debate-clock' ? 'OPERABLE WITHOUT CATEGORY CODE? ' : ''}</p></section>`;
  };
  const html = `<!doctype html><meta charset="utf-8"><title>Agent round ${salt} - blind read</title>
<style>body{font:15px/1.45 system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}h1{font-size:20px}.cell{border-top:1px solid #333;padding:18px 0}.cell h2{font-size:17px;margin:0 0 6px}.cell h2 small{color:#aaa;font-weight:400;margin-left:8px}.brief{color:#ccc;max-width:900px}.frames{display:flex;gap:12px;flex-wrap:wrap}figure{margin:0}figure img{width:560px;max-width:100%;background:repeating-conic-gradient(#333 0 25%,#222 0 50%) 0 0/24px 24px;border:1px solid #333}figcaption{color:#999;font-size:12px;margin-top:4px}.notes{color:#f6a623}small{color:#aaa}</style>
<h1>Agent round ${salt} - ${live.length} cell(s), blind</h1><p>No arm is shown. Write notes.md per cell id BEFORE opening key.json.</p>${rows.map(card).join('')}`;
  writeFileSync(path.join(roundDir, 'review.html'), html);
  writeFileSync(path.join(roundDir, 'key.json'), JSON.stringify(Object.fromEntries(rows.map(({ r, key }) => [key, { cell: r.id, arm: r.arm, armLabel: r.armLabel }])), null, 2));
  const notes = path.join(roundDir, 'notes.md');
  if (!existsSync(notes)) writeFileSync(notes, `# Blind read - round ${salt}\n\nOne line per cell id (see review.html): airable yes/no, visual 1-5, a word on why. The debate-clock cells: operable without category code yes/no.\n\n${rows.map(({ key }) => `- ${key}: `).join('\n')}\n`);
  writeFileSync(path.join(roundDir, 'summary.json'), JSON.stringify({ round: salt, noacgUrl: url, cells: records.map((r) => ({ id: r.id, arm: r.arm, na: r.na ?? null, minutes: r.minutes ?? null, validateRounds: r.validateRounds ?? null, turns: r.claude?.turns ?? null, costUsd: r.claude?.costUsd ?? null, final: r.measured?.final?.ok ?? null, inputs: r.measured?.inspect?.inputCount ?? null, buttons: r.measured?.inspect?.buttonCount ?? null, expectations: r.expectations ?? [] })) }, null, 2));
  console.log(`review: ${path.join(roundDir, 'review.html')}\nkey (open AFTER notes.md): ${path.join(roundDir, 'key.json')}\nsummary: ${path.join(roundDir, 'summary.json')}`);
}

function briefText(id) {
  return bank.briefs.find((b) => b.id === id)?.prompt ?? id;
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── main ───────────────────────────────────────────────────────────────────────────────────────
function ensureCli() {
  if (!existsSync(CLI_ENTRY)) {
    console.log('agent-round-bench: building the CLI (cli/dist missing)');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const b = spawnSync(npm, ['run', 'build'], { cwd: path.join(ROOT, 'cli'), stdio: 'inherit', shell: process.platform === 'win32', windowsHide: true });
    if (b.status !== 0) fail('the CLI did not build');
  }
}

function ensureBridge() {
  try {
    execFileSync(process.execPath, [CLI_ENTRY, 'doctor', '--json'], { env: { ...process.env, NOACG_URL: url }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  } catch (e) {
    fail(`no NoaCG bridge at ${url} - start this checkout's dev server (npm run dev) or set NOACG_URL\n${(e.stderr || e.message || '').toString().slice(-600)}`);
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

if (mode === 'plan') {
  const cells = cellsOf();
  console.log(`Agent round plan - ${briefs.length} brief(s) x arms ${armsWanted.join(',')} against ${url}\n`);
  for (const c of cells) console.log(`  ${c.id.padEnd(26)} ${c.na ? `n/a - ${c.na}` : bank.arms[c.arm].label}`);
  const est = estimate(cells);
  console.log(`\n${est.live} live cell(s), ${est.na} n/a. Estimate: ${est.minutes} minutes wall clock, ${est.note}.`);
  console.log('\nPrompts (exactly what each cell\'s session receives):\n');
  for (const c of cells.filter((c) => !c.na)) console.log(`--- ${c.id}\n${promptFor(c.brief, c.arm)}\n`);
  process.exit(0);
}

if (mode === 'review') {
  const dir = value('review', '');
  if (!dir || !existsSync(path.join(dir, 'cells'))) fail('--review needs a round directory holding cells/');
  review(path.resolve(dir));
  process.exit(0);
}

ensureCli();
ensureBridge();
const paid = mode === 'run';
// Cells run OUTSIDE the repository by default - a cell's Claude Code session must not load this
// repo's instructions, because a user's machine has none.
const roundDir = path.resolve(value('out', path.join(os.tmpdir(), 'noacg-agent-round', `${paid ? 'run' : 'control'}-${stamp()}`)));
if (path.resolve(roundDir).startsWith(ROOT + path.sep) && paid) fail(`--out must be OUTSIDE the repository (${ROOT}) for a paid run - the cell sessions would load its AGENTS.md/CLAUDE.md`);
mkdirSync(roundDir, { recursive: true });
const cells = cellsOf();
console.log(`${paid ? 'PAID RUN' : 'CONTROL'}: ${cells.filter((c) => !c.na).length} live cell(s) -> ${roundDir}`);
if (paid) {
  const exe = claudeExecutable();
  // The CLI's OWN login, not the desktop app's: a `claude -p` child authenticates from the CLI's
  // stored OAuth session, and with none every cell returns "Failed to authenticate" in 300 ms -
  // which the first paid attempt burned five cells discovering (2026-08-22). Refuse up front.
  const auth = spawnSync(exe, ['auth', 'status'], { encoding: 'utf8', windowsHide: true });
  let status = null;
  try { status = JSON.parse(auth.stdout); } catch { /* older CLI */ }
  if (status && status.loggedIn === false) fail('the claude CLI is not logged in (`claude auth status`) - run `claude login` in a terminal first; the round cannot sign in for you');
  console.log(`claude: ${exe}${status ? ` (${status.authMethod})` : ''}`);
}
for (const cell of cells) {
  const t = Date.now();
  const record = runCell(roundDir, cell, { paid });
  // A cell that never reached the model (auth, API outage) says nothing about the arm; stop the
  // round rather than record twenty-five copies of the same outage.
  if (paid && record.claude?.isError && record.claude.turns != null && record.claude.turns <= 1 && !record.measured?.present) {
    console.error(`  ${cell.id}: the session failed before doing any work - ${record.claude.result ?? 'no result'}\nStopping the round; fix and re-run (${roundDir}).`);
    process.exit(1);
  }
  const line = record.na
    ? `n/a (${record.na})`
    : `${record.minutes} min, ${record.validateRounds} validate round(s), final ${record.measured?.final?.ok ? 'clean' : 'ERRORS'}, ${record.measured?.inspect?.inputCount ?? '?'} input(s) / ${record.measured?.inspect?.buttonCount ?? '?'} button(s)${record.expectations?.length ? ` - ${record.expectations.join('; ')}` : ''}${record.claude?.turns != null ? `, ${record.claude.turns} turns${record.claude.costUsd != null ? `, $${record.claude.costUsd.toFixed(2)}` : ''}` : ''}`;
  console.log(`  ${cell.id.padEnd(26)} ${line} [${Math.round((Date.now() - t) / 1000)}s]`);
}
review(roundDir);
