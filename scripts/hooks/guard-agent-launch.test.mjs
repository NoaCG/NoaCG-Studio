// The launch guard, verified the way docs/MISTAKE_TRIGGERS.md asks for: real event JSON piped
// into the REAL hook file (scripts/hooks/test-lib.mjs), reading the exit code and the message. The
// parser has its own tests in wave-plan-check.test.mjs; these cover the plumbing, the message, and
// the world the hook reads - this repository's own tree, so the "exists" cases name files that are
// really here, and a temp directory with no git for the fail-open case.
//
// The must-not-fire list is the longer one, and the prose case is the one that matters most: a
// refusal here blocks every launch on the machine the moment .claude/settings.json lands.
//
// Cost: twelve node starts, about 1.2 s; a refused launch pays one to three git calls per missing
// path.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runHook, wiringProblem } from './test-lib.mjs';

const HOOK = new URL('./guard-agent-launch.mjs', import.meta.url);
const REPO = fileURLToPath(new URL('../../', import.meta.url));

// The refusals need the second look, and the second look needs an `origin/main` to compare
// against: the hook stands down without one (its own fail-open rule, tested below). A CI
// checkout of a branch has no `origin/main`, so the refusal cases are skipped there with the
// reason on the record rather than failing on a world the hook was never asked to judge.
const HAS_MAIN = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: REPO, stdio: 'ignore', windowsHide: true }).status === 0;
const needsMain = HAS_MAIN ? false : 'no origin/main in this checkout, so the hook stands down instead of refusing';

function launch(prompt, extra = {}) {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Agent',
    cwd: REPO,
    tool_input: { description: 'Row R', subagent_type: 'wave-row', prompt, ...extra },
  };
}

/** A wave prompt in the shape the orchestrator hands out, on paths this repository really has. */
const ROW = [
  'SESSION R - triggers that fire',
  'BRANCH claude/r-mistake-triggers',
  'TOUCHES docs/MISTAKE_TRIGGERS.md, scripts/hooks/, .claude/settings.json, docs/backlog/new-thing.md (new)   MINTS scripts/hooks/made-up.mjs',
  'READ   docs/MISTAKE_TRIGGERS.md (especially "Memory: the weakest trigger" - it is the routing rule),',
  '       scripts/hooks/ (guard-command, warn-command and their tests), .claude/settings.json.',
  'DO     1. read scripts/nowhere-at-all.mjs - a DO line is never probed.',
  'QUEUE  write docs/handoffs/2026-09-05-r-thing.md, then /queue-merge.',
].join('\n');

test('the guard is actually wired to the Agent tool', () => {
  assert.equal(wiringProblem('PreToolUse', 'Agent', 'node scripts/hooks/guard-agent-launch.mjs'), null);
});

test('a wave prompt whose paths all exist launches', () => {
  const { status, message } = runHook(HOOK, launch(ROW));
  assert.equal(status, 0, message);
});

test('a TOUCHES entry one letter off is refused, and the entry is quoted back', { skip: needsMain }, () => {
  const { status, message } = runHook(HOOK, launch(ROW.replace('scripts/hooks/,', 'scripts/hoks/,')));
  assert.equal(status, 2);
  assert.match(message, /TOUCHES names scripts\/hoks\//);
  assert.match(message, /\(new\)/); // the way through for a file the row creates
  assert.match(message, /wave-plan-check\.mjs/); // the check this is the second half of
});

test('a wrapped READ line is read to its end', { skip: needsMain }, () => {
  const { status, message } = runHook(HOOK, launch(ROW.replace('.claude/settings.json.', '.claude/setings.json.')));
  assert.equal(status, 2);
  assert.match(message, /READ names \.claude\/setings\.json/);
});

test('prose with slashes in it is not a path claim', () => {
  // Found in review, 2026-09-05, against this checkout's own contracts: every one of these passed
  // the character test in the first cut and would have refused a correct launch of the quiz and
  // scoreboard rows.
  const prompt = [
    'READ   docs/CONTROL_LAYER.md (the Take/Update/Out buttons), docs/GOALS.md (NEXT/THEN are parked,',
    '       and/or lock/reveal), the f0/f1 fields, I/O and TCP/IP in docs/DEPLOYMENT.md (read/write).',
  ].join('\n');
  const { status, message } = runHook(HOOK, launch(prompt));
  assert.equal(status, 0, message);
});

test('a generated or gitignored path is not refused, whether or not this tree has it', () => {
  // dist/ is build output and gitignored: never on origin/main, here only after a build.
  const { status, message } = runHook(HOOK, launch('TOUCHES dist/anything-at-all.js, .claude/launch.json'));
  assert.equal(status, 0, message);
});

test('a prompt in the `instructions` field is judged the same way', { skip: needsMain }, () => {
  const { status } = runHook(HOOK, launch('', { instructions: 'TOUCHES scripts/hoks/guard.mjs' }));
  assert.equal(status, 2);
});

test('what is not a wave prompt is never read', () => {
  // An Explore brief names folders in prose and has no key lines - the common case, and it must
  // cost nothing and refuse nothing, however many paths it mentions.
  const brief = 'Read every file under docs/nowhere/ and scripts/imaginary/ and report what recurs.';
  assert.equal(runHook(HOOK, launch(brief)).status, 0);
  // Only TOUCHES and READ are probed. A bad path on any other line is the session's to find.
  assert.equal(runHook(HOOK, launch('SESSION Q\nDO read scripts/nowhere.mjs\nGATE npm run build')).status, 0);
});

test('a `(new` entry, a MINTS tail, a bare basename and an absolute path are never refused', () => {
  const prompt = [
    'TOUCHES docs/backlog/not-yet.md (new, plus its owner-queue file), settings.json   MINTS scripts/hooks/not-yet.mjs',
    'READ   C:/somewhere/else/x.md, /tmp/y.md, ~/.claude/settings.json, https://example.com/docs/a.md',
  ].join('\n');
  assert.equal(runHook(HOOK, launch(prompt)).status, 0);
});

test('it fails OPEN where git cannot say what main holds', () => {
  // The second look this guard promises needs an origin/main to look at. A directory git does not
  // know has none, so a missing path there is not a verdict - the doc's rule is that a hook which
  // cannot tell must not refuse, and the first cut refused here.
  const scratch = mkdtempSync(join(tmpdir(), 'guard-agent-launch-'));
  try {
    writeFileSync(join(scratch, 'README.md'), '# not a repository\n');
    const event = { ...launch('TOUCHES docs/nowhere.md'), cwd: scratch };
    const { status, message } = runHook(HOOK, event);
    assert.equal(status, 0, message);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('it fails open on anything it cannot read', () => {
  assert.equal(runHook(HOOK, 'not json').status, 0);
  assert.equal(runHook(HOOK, '').status, 0);
  assert.equal(runHook(HOOK, { tool_name: 'Agent', cwd: REPO }).status, 0);
  assert.equal(runHook(HOOK, { tool_name: 'Agent', cwd: REPO, tool_input: { description: 'x' } }).status, 0);
});
