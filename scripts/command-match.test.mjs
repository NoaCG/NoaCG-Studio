// The guard's command matchers decide whether heavy browser work is allowed to start. Both
// failure directions are silent, which is why they are pinned here rather than checked by hand:
//
//   too eager  - a legitimate command is refused. Already happened: `grep -n "npm run test:e2e"
//                AGENTS.md` was denied because the phrase appeared anywhere in the text. A guard
//                that blocks reading a file is a guard people learn to work around.
//   too shy    - a real invocation slips past, a second suite or sweep starts, and the machine
//                goes to 35 MB of free RAM with 59 browser shells. Nothing reports that; you
//                just notice the laptop has stopped responding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  branchCreations,
  commitCheckouts,
  enqueuesWork,
  invokesE2e,
  invokesSweep,
  commandSegments,
  pollsQueue,
  pushedUpdates,
  pushesAndDispatches,
  unfinishedRun,
  requiresRunningDevServer,
  startsDevServer,
  SWEEP_SCRIPTS,
} from './command-match.mjs';

/** Either matcher firing means "this command starts heavy browser work". */
const startsHeavyWork = (cmd) => invokesE2e(cmd) || invokesSweep(cmd);

test('real e2e invocations are recognised, in every spelling used here', () => {
  for (const cmd of [
    'npm run test:e2e',
    'npm run test:e2e -- wizard-logo.spec.ts',
    'npm run test:e2e:affected',
    'npm run test:e2e:focus',
    'npm run test:e2e:catalog',
    'npm run test:e2e:live',
    'pnpm run test:e2e',
    'npx playwright test --config=playwright.catalog.config.ts',
    'playwright test',
    'node scripts/e2e-affected.mjs',
    'cd /c/repo && npm run test:e2e',
    'npm run build; npm run test:e2e',
    'NOACG_ALLOW_PARALLEL_E2E=1 npm run test:e2e', // the env prefix must not hide the invocation
  ]) {
    assert.ok(invokesE2e(cmd), cmd);
  }
});

test('sweeps and benches are recognised - they cost the same memory as a suite', () => {
  for (const cmd of [
    'node scripts/l3-sweep.mjs shots lower-third',
    'node scripts/type-floor.mjs',
    'node scripts/overflow-sweep.mjs --baseline',
    'node scripts/field-coverage.mjs',
    'node scripts/numerals.mjs --fonts',
    'node scripts/factory.mjs --json factory-report.json',
    'node scripts/render-smoke-video.mjs',
    'node scripts/creative-pilot-bench.mjs',
    'node C:/claude/NoaCG-Studio/scripts/l3-sweep.mjs shots quiz',
    'node scripts/text-containment-sweep.mjs --baseline',
    'npm run bench:lite',
    'npm run video:bench:run',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
});

test('the SPIKE family counts too - it renders the catalog at 1920x1080 like any sweep', () => {
  // The hole this closes, found by falling into it: `spike-mark-clearance-sweep` renders 24
  // designs for about four minutes and was started three times beside a live configured suite,
  // because no entry in the alternation matched its name. Every member is listed rather than
  // one representative, because what is being pinned is that a name-shaped rule covers the whole
  // rig - the runner, the sweeps and the calibrators alike.
  for (const cmd of [
    'node scripts/pro-spike.mjs --control',
    'node scripts/spike-mark-clearance-sweep.mjs',
    'node scripts/spike-spacing-calibrate.mjs',
    'node scripts/spike-proportion-calibrate.mjs',
    'node scripts/spike-axis-calibrate.mjs',
    'node scripts/spike-well-calibrate.mjs',
    'node scripts/spike-checkpoint-probe.mjs',
    'node C:\\claude\\NoaCG-Studio\\scripts\\spike-mark-clearance-sweep.mjs --mark=shield-tall',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
});

test('the TASTE re-judge counts - it is named like no family and mounts more frames than most', () => {
  // `pro-taste-rejudge.mjs` mounts every piece of every row in a finished round at 1920x1080 -
  // 108 of them across the two checkpoint rounds - and sweeps the catalog in `--control`. It is
  // listed by name rather than renamed into a family, because "rejudge" is what it does and a
  // name chosen to satisfy this file would be a name that lies.
  for (const cmd of [
    'node scripts/pro-taste-rejudge.mjs --control',
    'node scripts/pro-taste-rejudge.mjs benchmarks/pro/evidence/round-2026-08-16 benchmarks/pro/evidence/round-2026-08-17 --sets',
    'node C:\\claude\\NoaCG-Studio\\scripts\\pro-taste-rejudge.mjs --control --category=corner-bug',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
});

test('the CHROMIUM-launching -sweep scripts count, and the ones that open no browser do not', () => {
  // The family is not safely name-shaped: three of these render the catalog through the app and
  // two others named the same way open no browser, so the split is listed rather than matched.
  for (const cmd of [
    'node scripts/occlusion-sweep.mjs',
    'node scripts/occlusion-sweep.mjs --category=lower-third --stress',
    'node scripts/design-rules-audit-sweep.mjs',
    'node scripts/plate-legibility-sweep.mjs',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
  for (const cmd of [
    'node scripts/reference-companion-sweep.mjs',
    'node scripts/spx-corpus-sweep.mjs',
  ]) {
    assert.ok(!invokesSweep(cmd), cmd);
  }
});

test('MENTIONING a command is not running one', () => {
  // The regression that motivated positional matching. Each of these contains the text of an
  // invocation and starts nothing; denying any of them is a bug.
  for (const cmd of [
    'grep -n "npm run test:e2e" AGENTS.md',
    "rg 'test:e2e:affected' docs/",
    'grep -rn type-floor.mjs AGENTS.md',
    'echo "run npm run test:e2e later"',
    'git commit -m "Document npm run test:e2e in the contributor guide"',
    'git log --oneline --grep "node scripts/l3-sweep.mjs"',
    'cat package.json',
    'node scripts/dev-port.mjs',
    'node scripts/e2e-runs.mjs --all',
  ]) {
    assert.ok(!startsHeavyWork(cmd), cmd);
  }
});

test('a here-document body is data, not commands', () => {
  // Measured 2026-08-06: `git commit -F- <<'EOF'` was REFUSED because a paragraph of the commit
  // message began "test:e2e:affected is the per-merge gate…". Segments split on newlines, so a
  // line of prose sat where an invocation would. The quoted-argument rule cannot cover this -
  // the text is on its own line, not inside quotes.
  const commitWithMessage = [
    "git commit -F- <<'EOF'",
    'Make the affected-e2e runner report the worst run',
    '',
    'test:e2e:affected is the per-merge gate, and node scripts/type-floor.mjs is a catalog gate.',
    'EOF',
  ].join('\n');
  assert.ok(!startsHeavyWork(commitWithMessage), commitWithMessage);

  // The unquoted and indent-stripping spellings too, and a body naming a sweep.
  assert.ok(!startsHeavyWork('cat <<EOF\nnpm run test:e2e\nEOF'));
  assert.ok(!startsHeavyWork('cat <<-END\n\tnode scripts/l3-sweep.mjs shots quiz\n\tEND'));

  // What the heredoc OPENED with is still a command, and so is anything after the terminator -
  // stripping the body must not swallow either.
  assert.ok(startsHeavyWork("npm run test:e2e && git commit -F- <<'EOF'\nmessage\nEOF"));
  assert.ok(startsHeavyWork("git commit -F- <<'EOF'\nmessage\nEOF\nnpm run test:e2e"));
});

test('a command in a later shell segment still counts', () => {
  // The invocation is not always first: `cd x && npm run test:e2e` is the ordinary shape.
  assert.ok(invokesE2e('cd repo && npm run test:e2e'));
  assert.ok(invokesSweep('npm run build && node scripts/type-floor.mjs'));
  assert.ok(invokesE2e('echo start\nnpm run test:e2e'));
  assert.ok(invokesSweep('foo | node scripts/numerals.mjs'));
});

test('a suite or a sweep reached THROUGH something else is still one', () => {
  // THE HOLE THIS CLOSES, measured 2026-09-02 by feeding the real guard hook real events with a
  // browser job live on the machine: `npm run test:e2e` was refused and all eight spellings below
  // were ALLOWED, so the mutual exclusion that keeps two browser jobs off a 16 GB laptop could be
  // walked past by writing the same command with a wrapper in front of it. `startsDevServer` had
  // already been routed through the shared parts helper; these two had not, and they are the two
  // that serialise the whole machine.
  //
  // The PowerShell block form is the ORDINARY spelling here, not an exotic one: `&&` is a parser
  // error in PowerShell 5.1, so the PowerShell tool's own instructions hand out `A; if ($?) { B }`.
  for (const cmd of [
    'bash -c "npm run test:e2e"',
    "sh -c 'npm run test:e2e:affected'",
    'nohup npm run test:e2e',
    'start npm run test:e2e',
    'powershell -NoProfile -Command "npm run test:e2e:affected"',
    'npm install; if ($?) { npm run test:e2e }',
    'cd /c/repo & npx playwright test wizard-logo.spec.ts',
    'while ($true) { npm run test:e2e }',
  ]) {
    assert.ok(invokesE2e(cmd), `should be refused: ${cmd}`);
  }
  for (const cmd of [
    'bash -c "node scripts/type-floor.mjs"',
    'nohup node scripts/l3-sweep.mjs shots quiz',
    'npm run build; if ($?) { node scripts/l3-sweep.mjs shots quiz }',
    'cd /c/repo & node scripts/occlusion-sweep.mjs',
    'bash -c "npm run bench:lite"',
  ]) {
    assert.ok(invokesSweep(cmd), `should be refused: ${cmd}`);
  }

  // A wrapped run BEFORE an enqueue is still a run, so it does not buy an exemption by naming the
  // queue afterwards. Without `enqueuesWork` reading the same parts, the hole would only have moved
  // here - the guard consults it first and skips the mutual exclusion entirely when it is true.
  assert.ok(!enqueuesWork('bash -c "npm run test:e2e" && npm run queue -- "y"'));
  assert.ok(!enqueuesWork('npm install; if ($?) { npm run test:e2e }; npm run queue -- "y"'));
});

test('widening the reading must not turn an ARGUMENT naming a script into a run', () => {
  // Over-refusal is the expensive direction here: a false refusal blocks every session on the
  // machine, not just the one that typed the command. Splitting on braces MANUFACTURES parts out
  // of arguments, and the first cut of this change refused both of the first two for real - the
  // script-name matcher took its runner prefix as optional, so a bare `test:e2e` token was an
  // invocation. Nothing runs by typing that, so the prefix is now required.
  for (const cmd of [
    "jq '.scripts | {test:e2e}' package.json",
    'echo {test:e2e}',
    'find . -name "*.log" -exec rm {} \\;',
    'sed -i \'s/"test:e2e"/"test:e2e2"/\' package.json',
    'npm run build 2>&1 | tee build.log',
    'powershell -NoProfile -Command "Get-Content package.json | ConvertFrom-Json | % { $_.scripts.\'test:e2e\' }"',
    // A wrapper around something harmless is not the thing it wraps.
    'bash -c "grep -rn \'npm run test:e2e\' docs/"',
    'bash -c "ls scripts"',
    // Plan-only and self-serialising forms survive the peeling too - refusing either would answer
    // a refusal with a second refusal.
    'bash -c "node scripts/e2e-affected.mjs --list"',
    'npm run build; if ($?) { npx playwright test --list }',
    // A long-lived bench SERVER stays carved out however it is reached (measured 2026-08-17: one
    // in the list parked every other checkout's browser work for 55 minutes).
    'bash -c "node scripts/dev-bench.mjs"',
    'bash -c "node scripts/spx-corpus-sweep.mjs"',
  ]) {
    assert.ok(!invokesE2e(cmd) && !invokesSweep(cmd), `should be allowed: ${cmd}`);
  }
});

test('the runner prefix admits the spellings that actually run something', () => {
  // Requiring a runner is a NARROWING, so what it must not lose is pinned here. The old
  // alternation allowed `npm run`, `pnpm run` and a bare `yarn`, so `pnpm test:e2e` is the one
  // real spelling this gains along the way.
  for (const cmd of ['npm run test:e2e', 'pnpm run test:e2e', 'pnpm test:e2e', 'yarn test:e2e']) {
    assert.ok(invokesE2e(cmd), cmd);
  }
});

test('a similarly-named script is not a sweep', () => {
  // `e2e-runs.mjs` reports what is running and `dev-port.mjs` prints a number; neither launches
  // a browser, and blocking them would break the very commands the refusal message recommends.
  for (const cmd of [
    'node scripts/e2e-runs.mjs --wait',
    'node scripts/e2e-lists.mjs',
    'node scripts/worktree-activity.mjs',
    'node scripts/merge-order.mjs --branch x',
    'node scripts/check-shared-instructions.mjs',
    // …and the two substring families do not reach past their own scripts. `[\w-]*spike[\w-]*`
    // and `[\w-]*bench[\w-]*` are convenient because a new sibling is covered by its NAME, and
    // the price of that convenience is that they must still be anchored to `scripts/<name>.mjs`
    // - a word in an argument or a path is not an invocation.
    'node scripts/dev-port.mjs --spike',
    'grep -rn spike-mark-clearance-sweep docs/',
    'cat benchmarks/pro/v1/spike/mark-clearance-sweep.json',
  ]) {
    assert.ok(!invokesSweep(cmd), cmd);
  }
});

test('a long-lived SERVER is not a sweep, however it is named', () => {
  // Measured 2026-08-17: `dev-bench.mjs` (a Vite dev server) and the module it preloads
  // (`bench-dispatcher.mjs`, which shares that process's command line) both matched
  // `[\w-]*bench[\w-]*`, so one bench server reported as TWO running sweeps and parked every
  // other checkout's browser work for 55 minutes. Mutual exclusion only works against jobs that
  // end; a server in the list is a deadlock with no far end.
  for (const cmd of [
    'node scripts/dev-bench.mjs',
    'npm run dev:bench',
    'node C:/claude/NoaCG-Studio/scripts/ai-bench-server.mjs',
    'node scripts/bench-dispatcher.mjs',
  ]) {
    assert.ok(!invokesSweep(cmd), cmd);
  }
  // The detector reads a RUNNING process's command line, where the dispatcher arrives as a
  // Vite `--import` argument rather than as the invocation - the same carve-out has to hold.
  const built = new RegExp(`scripts[/\\\\]+(${SWEEP_SCRIPTS})\\.mjs`);
  assert.ok(!built.test('node --import C:/repo/scripts/bench-dispatcher.mjs vite'));
  assert.ok(!built.test('node C:/repo/scripts/dev-bench.mjs'));
  // Carving those out must not cost the real bench jobs beside them.
  for (const cmd of [
    'node scripts/ai-bench.mjs --profile=lite',
    'node scripts/video-bench.mjs',
    'node scripts/creative-route-bench.mjs',
    'node scripts/ai-bench-compare.mjs',
  ]) {
    assert.ok(invokesSweep(cmd), cmd);
  }
});

test('segments strip env prefixes but keep the rest of the command', () => {
  assert.deepEqual(commandSegments('A=1 B=2 npm run test:e2e'), ['npm run test:e2e']);
  assert.deepEqual(commandSegments('a && b'), ['a', 'b']);
  assert.deepEqual(commandSegments('a; b | c'), ['a', 'b', 'c']);
});

test('the shared sweep list is a usable alternation for both consumers', () => {
  // scripts/e2e-runs.mjs interpolates this into a RegExp to spot a RUNNING sweep, and
  // command-match uses it on a command line. A malformed alternation would break process
  // detection silently while the command matcher kept working.
  const built = new RegExp(`scripts[/\\\\]+(${SWEEP_SCRIPTS})\\.mjs`);
  assert.ok(built.test('node C:/repo/scripts/l3-sweep.mjs'));
  assert.ok(built.test('node C:\\repo\\scripts\\type-floor.mjs'));
  assert.ok(!built.test('node C:/repo/scripts/dev-port.mjs'));
});

test('asking what WOULD run is not a run', () => {
  // `--list` / `--json` print the plan and exit - no dev server, no browser, no memory. Blocking
  // them denied the one cheap thing a session can do while another checkout is busy, which is
  // the moment the guard is most likely to be firing.
  assert.ok(!invokesE2e('node scripts/e2e-affected.mjs --list --focus'));
  assert.ok(!invokesE2e('node scripts/e2e-affected.mjs --json'));
  assert.ok(!invokesE2e('npx playwright test --list'));
  // `--help` too: it is what a session types right after the planner refuses an unrecognised
  // flag, and answering a refusal with a second refusal is how someone stops asking.
  assert.ok(!invokesE2e('node scripts/e2e-affected.mjs --help'));

  // The real thing still is one, including the integration form the plan-only flags share a
  // command shape with.
  assert.ok(invokesE2e('node scripts/e2e-affected.mjs --integration --focus'));
  assert.ok(invokesE2e('npm run test:e2e:integration'));
  assert.ok(invokesE2e('npx playwright test competition-pack.spec.ts'));
});

test('enqueueing a browser job is not starting one', () => {
  // `npm run queue` writes a job and returns an id; the runner drains one at a time. The
  // payload is an ARGUMENT, and commandSegments splits on `&&` without regard for quoting, so
  // every matcher here would otherwise see a Playwright run inside it.
  const payload = 'set UPDATE_CATALOG_BASELINE=1&& npx playwright test catalog-baseline';
  assert.ok(enqueuesWork(`npm run queue -- "${payload}"`));
  assert.ok(enqueuesWork('node scripts/jobs.mjs add "npx playwright test x"'));
  assert.ok(enqueuesWork('npm run queue:merge'));
  assert.ok(enqueuesWork('node scripts/jobs.mjs add-merge claude/some-branch'));

  // THE PAYLOAD IS NOT A RUN, to every matcher at once. The guard has two rules that ask
  // separately - mutual exclusion (4a) and the port check (4b) - and only the first consulted
  // `enqueuesWork`, so a queued suite was exempt from one and refused by the other. Truncating
  // at the enqueue is what makes the two agree.
  assert.ok(!invokesE2e(`npm run queue -- "${payload}"`), 'the payload is an argument, not a run');
  assert.ok(!invokesSweep('npm run queue -- "node scripts/l3-sweep.mjs shots quiz"'));
  assert.ok(!requiresRunningDevServer('npm run queue -- "node scripts/type-floor.mjs"'));

  // A `cd` FIRST is the ordinary shape and was the hole: `enqueuesWork` tested only the first
  // segment, so this read as a bare `npx playwright test` and the guard refused the one action
  // it exists to recommend (measured 2026-08-29, dd-svg-fitting-two).
  assert.ok(enqueuesWork(`cd C:/repo/wt && npm run queue -- "${payload}"`));
  assert.ok(!invokesE2e(`cd C:/repo/wt && npm run queue -- "${payload}"`));
  assert.ok(enqueuesWork('cd /c/repo/wt && npm run queue:merge'));

  // What the first-segment rule was really protecting: a real run does not get a free pass by
  // mentioning the queue AFTER it. That is now stated directly rather than by position.
  assert.ok(!enqueuesWork('npx playwright test x && npm run queue -- "y"'));
  assert.ok(invokesE2e('npx playwright test x && npm run queue -- "y"'));
  assert.ok(!enqueuesWork('node scripts/l3-sweep.mjs shots quiz && npm run queue -- "y"'));
  assert.ok(!enqueuesWork('npm run jobs'));
  assert.ok(!enqueuesWork('npm run test:e2e:queued'));
  assert.ok(!enqueuesWork('grep -n "npm run queue" AGENTS.md'));

  // A harmless segment before the enqueue is still an enqueue, whatever it is.
  assert.ok(enqueuesWork('npm run build && npm run queue -- "npx playwright test x"'));
});

test('a foreground poll of the job queue is recognised, a single read is not', () => {
  // Two sessions spent 175 and 300+ minutes in loops of exactly these shapes on 2026-08-28,
  // both on jobs the RAM floor was holding. The shell tool dies at 600 s, so past ten minutes
  // the loop was running with nobody reading it.
  assert.ok(pollsQueue('while true; do node scripts/jobs.mjs; sleep 30; done'));
  assert.ok(pollsQueue('node scripts/jobs.mjs log j-0126 && sleep 60 && node scripts/jobs.mjs'));
  assert.ok(pollsQueue('until node scripts/jobs.mjs --json | grep -q done; do sleep 20; done'));
  assert.ok(pollsQueue('npm run jobs; Start-Sleep -Seconds 60; npm run jobs'));

  // Reading the queue is how you find out what is happening; it must stay free.
  assert.ok(!pollsQueue('node scripts/jobs.mjs'));
  assert.ok(!pollsQueue('node scripts/jobs.mjs log j-0126'));
  assert.ok(!pollsQueue('npm run jobs --json'));
  // Sleeping about something else is not about the queue.
  assert.ok(!pollsQueue('sleep 5 && npm run build'));
  // And the bounded wait is the sanctioned way to wait, so it must not read as a poll loop.
  assert.ok(!pollsQueue('node scripts/jobs.mjs wait j-0126'));
  // A bounded for-loop beside a queue read walks a list and ends; it is not a poll (a planner's
  // listing was refused for exactly this shape on 2026-09-02). An unbounded one, or a bounded one
  // that sleeps between reads, still is.
  assert.ok(!pollsQueue('for f in a b; do echo $f; done; node scripts/jobs.mjs'));
  assert.ok(!pollsQueue('node scripts/jobs.mjs; for f in docs/handoffs/*.md; do wc -l $f; done'));
  assert.ok(!pollsQueue('foreach ($f in Get-ChildItem) { $f.Name }; npm run jobs'));
  assert.ok(pollsQueue('for ((;;)); do node scripts/jobs.mjs; done'));
  assert.ok(pollsQueue('for i in 1 2 3; do node scripts/jobs.mjs; sleep 20; done'));
  // A queue read INSIDE a loop is a poll whatever the loop's head, sleep or no sleep.
  assert.ok(pollsQueue('for i in $(seq 1 500); do node scripts/jobs.mjs; done'));
  assert.ok(pollsQueue('for(;;) { node scripts/jobs.mjs }'));
  assert.ok(pollsQueue('for ($i=0;;$i++) { node scripts/jobs.mjs }'));
  assert.ok(pollsQueue('foreach ($i in 1..500) { node scripts/jobs.mjs }'));
});

test('the scripts that need a dev server somebody else started are recognised', () => {
  assert.ok(requiresRunningDevServer('node scripts/overflow-sweep.mjs --baseline'));
  assert.ok(requiresRunningDevServer('node scripts/type-floor.mjs'));
  assert.ok(requiresRunningDevServer('node scripts/render-smoke.mjs'));
  // Added to SWEEP_SCRIPTS and to this list on the same day - the first version of the script
  // joined one and not the other, so a run queued with no server up burned its slot on
  // "Dev server not reachable" and read as a failed review.
  assert.ok(requiresRunningDevServer('node scripts/taste-frame-review.mjs --only lt27'));

  // Playwright brings its own server, so it is never this.
  assert.ok(!requiresRunningDevServer('npm run test:e2e:affected'));
  assert.ok(!requiresRunningDevServer('npx playwright test'));
  assert.ok(!requiresRunningDevServer('npm run build'));
  // Mentioning one starts nothing, same rule as every matcher above.
  assert.ok(!requiresRunningDevServer('grep -n "overflow-sweep" AGENTS.md'));
});

test('enqueueing is never a poll, whatever the queued payload says', () => {
  assert.ok(!pollsQueue('node scripts/jobs.mjs add "node scripts/wait-for-thing.mjs && sleep 5"'));
  assert.ok(!pollsQueue('npm run queue -- "npm run build; sleep 1"'));
});

test('the poll-loop guard covers PowerShell, which is this machine\'s shell', () => {
  assert.ok(pollsQueue('while ($true) { node scripts/jobs.mjs; Start-Sleep -Seconds 30 }'));
  assert.ok(pollsQueue('for ($i=0; $i -lt 99; $i++) { npm run jobs; Start-Sleep 20 }'));
  assert.ok(pollsQueue('foreach ($n in 1..99) { node scripts/jobs.mjs log j-0007; Start-Sleep 30 }'));

  // A waiting WORD inside the queue command's own arguments is not a wait - matching bare
  // strings anywhere is the too-eager failure this module exists to avoid.
  assert.ok(!pollsQueue('node scripts/jobs.mjs cancel j-0007 && git branch -D claude/do-not-land'));
  assert.ok(!pollsQueue('node scripts/jobs.mjs log j-0007 > sleep-report.txt'));
});

test('hand-started dev servers are refused, in every spelling that starts one', () => {
  for (const cmd of [
    'npm run dev',
    'npm run dev:bench',
    'npm run preview',
    'pnpm run dev',
    'yarn dev',
    'vite',
    'vite --host',
    'npx vite',
    'cd /c/repo && npm run dev',
    'npm run build; npm run dev',
    'DEV_PORT=5256 npm run dev', // the env prefix must not hide the invocation
  ]) {
    assert.ok(startsDevServer(cmd), `should be refused: ${cmd}`);
  }
});

test('a dev server reached THROUGH something else is still a dev server', () => {
  // Positional matching alone is too shy here. The plain regex this replaced caught all of these
  // by matching the text anywhere, and each one starts a real server on a real port - which is
  // the whole hazard, since Playwright would then adopt it with the wrong env.
  for (const cmd of [
    'nohup npm run dev',
    'start npm run dev',
    'time npm run dev',
    'bash -c "npm run dev"',
    "sh -c 'npm run dev'",
    'cmd /c "npm run dev"',
    'powershell -NoProfile -Command "npm run dev"',
    'cd /c/repo & npm run dev', // a lone & sequences in cmd/PowerShell
    'npm run build & vite',
    // The PowerShell BLOCK form, which slipped past this matcher until 2026-09-02. `&&` is a
    // parser error in PowerShell 5.1, so the PowerShell tool's instructions hand out `A; if ($?)
    // { B }` - the ordinary spelling on this machine's primary shell, and a server started that
    // way is adopted by `reuseExistingServer` exactly like any other.
    'npm install; if ($?) { npm run dev }',
    'while ($true) { vite }',
  ]) {
    assert.ok(startsDevServer(cmd), `should be refused: ${cmd}`);
  }
});

test('the worktree entry point is the ONE carve-out, and a build is not a server', () => {
  // The sanctioned replacement the refusal recommends. Blocking it would answer a refusal with
  // a second refusal, which is how a guard teaches people to route around it.
  assert.ok(!startsDevServer('npm run dev:worktree'));
  assert.ok(!startsDevServer('cd /c/repo/.claude/worktrees/x && npm run dev:worktree'));
  assert.ok(!startsDevServer('node scripts/dev-worktree.mjs'));
  assert.ok(!startsDevServer('node scripts/dev-worktree.mjs --print'));

  // `vite build` is what `npm run build` runs - the gate, not a server.
  assert.ok(!startsDevServer('vite build'));
  assert.ok(!startsDevServer('npx vite build'));
  assert.ok(!startsDevServer('npm run build'));

  // Mentioning one starts nothing, same rule as every matcher above. The commit-message case is
  // real: this repo's own history explains in prose why the guard exists.
  assert.ok(!startsDevServer('grep -n "npm run dev" AGENTS.md'));
  assert.ok(!startsDevServer('git commit -m "explain why npm run dev is refused"'));
  assert.ok(!startsDevServer('cat vite.config.ts'));

  // An alternation in a search pattern is split by the segmenter, which leaves a segment opening
  // `vite"`. Refused for real while this branch was under review, which is how it got here.
  assert.ok(!startsDevServer('grep -n "orphan\\|vite" scripts/e2e-runs.mjs'));
  assert.ok(!startsDevServer('rg "dev\\|vite" docs/'));
});

test('branch creation is recognised in every spelling, wrapped and chained included', () => {
  // The wrapped and chained forms are listed on purpose. A positional rewrite of the dev-server
  // matcher silently NARROWED it to the bare spelling, and `nohup`, `bash -c` and a lone `&`
  // walked straight through until review caught it. This matcher has the same exposure, and the
  // failure it guards is silent in both directions, so both are pinned rather than assumed.
  for (const cmd of [
    'git checkout -b claude/h-guardrails',
    'git checkout -B claude/h-guardrails',
    'git switch -c claude/h-guardrails',
    'git switch -C claude/h-guardrails',
    'git switch --create claude/h-guardrails',
    'git switch --force-create claude/h-guardrails',
    'git checkout --orphan gh-pages',
    'git checkout -b claude/h-guardrails main',
    'cd C:/claude/NoaCG-Studio && git checkout -b claude/h-guardrails',
    'npm run build; git checkout -b claude/h-guardrails',
    'nohup git switch -c claude/h-guardrails',
    'bash -c "git checkout -b claude/h-guardrails"',
    "sh -c 'git switch -c claude/h-guardrails'",
    'powershell -NoProfile -Command "git checkout -b claude/h-guardrails"',
    'cd /c/repo & git checkout -b claude/h-guardrails', // a lone & sequences in cmd/PowerShell
    // THE POWERSHELL BLOCK FORM. `&&` is a parser error in PowerShell 5.1, so the PowerShell
    // tool's own instructions tell agents to write `A; if ($?) { B }` - which makes this the
    // ordinary spelling on this machine's primary shell, not an exotic one.
    'cd C:/claude/NoaCG-Studio; if ($?) { git checkout -b claude/h-guardrails }',
  ]) {
    assert.equal(branchCreations(cmd).length, 1, cmd);
  }

  // `git -C <path>` says which checkout the branch lands in, and it beats every other reading of
  // the command line - so it is reported rather than merely detected. The NAME is reported for one
  // reason: `main` is the branch the primary checkout exists to hold, so the guard has to be able
  // to let that one through.
  assert.deepEqual(branchCreations('git -C C:/claude/NoaCG-Studio checkout -b claude/x'), [
    { dir: 'C:/claude/NoaCG-Studio', branch: 'claude/x' },
  ]);
  assert.deepEqual(branchCreations('git -c user.name=nobody checkout -b claude/x'), [
    { dir: '', branch: 'claude/x' },
  ]);
  assert.deepEqual(branchCreations('git checkout -B main origin/main'), [{ dir: '', branch: 'main' }]);
});

test('the things that only LOOK like a branch creation are left alone', () => {
  for (const cmd of [
    'git checkout main',
    'git checkout .',
    'git checkout -- src/app.tsx',
    'git switch main',
    'git status',
    // A branch made without occupying the tree is harmless anywhere, including the main checkout.
    'git branch claude/h-guardrails main',
    // THE SANCTIONED RECIPE. Refusing this would answer a refusal with a second refusal, which is
    // how a guard teaches people to route around it - it carries `-b`, and it is the fix.
    'git worktree add -b claude/h-guardrails .claude/worktrees/h main',
    // Mentioning one creates nothing. This repo's own history and contracts quote the command.
    'grep -rn "git checkout -b" AGENTS.md',
    'git commit -m "explain why git checkout -b is refused in the main checkout"',
    // Past a `--` everything is a pathspec, so this asks for a FILE called -b.
    'git checkout main -- -b',
    // A queued payload is an argument, not an invocation (`startableSegments`).
    'npm run queue -- "git checkout -b claude/x"',
  ]) {
    assert.deepEqual(branchCreations(cmd), [], cmd);
  }
});

test('a commit is recognised as an invocation, not as a word in the text', () => {
  for (const cmd of [
    'git commit -m "Add the landing-pin warning"',
    'git commit -am "Add the landing-pin warning"',
    'git commit --amend --no-edit',
    'cd C:/claude/NoaCG-Studio/.claude/worktrees/h && git commit -m "x"',
    'git add -A && git commit -m "x"',
    'nohup git commit -m "x"',
    'bash -c "git commit -m \'x\'"',
    "git commit -F- <<'EOF'\nAdd the landing-pin warning\nEOF",
    // The PowerShell block form again, and this one is the shape the tool's instructions hand out
    // for "commit only if the add succeeded".
    'git add -A; if ($?) { git commit -m "x" }',
  ]) {
    assert.equal(commitCheckouts(cmd).length, 1, cmd);
  }

  // The checkout the commit lands in, when the command says so. The stale-landing-pin notice reads
  // the queue for THAT branch, so a commit driven into another worktree by absolute path has to
  // resolve there and not to whoever typed it.
  assert.deepEqual(commitCheckouts('git -C C:/claude/NoaCG-Studio/.claude/worktrees/h commit -m "x"'), [
    'C:/claude/NoaCG-Studio/.claude/worktrees/h',
  ]);
});

test('reading, searching or quoting a commit is not making one', () => {
  for (const cmd of [
    'git log --oneline -5',
    'git log --grep commit',
    'git status --porcelain',
    'grep -rn "git commit" AGENTS.md',
    'npm run queue -- "git commit -m x"',
    // A heredoc body is DATA. Writing a doc that quotes the command must not read as running it -
    // the same trap `stripHeredocBodies` exists for.
    "cat > notes.md <<'EOF'\ngit commit -m \"x\"\nEOF",
  ]) {
    assert.deepEqual(commitCheckouts(cmd), [], cmd);
  }
});

test('a push and a workflow dispatch in one command are the coin flip, in every spelling used here', () => {
  // Four handoffs over 2026-09-04 and 2026-09-05; the PowerShell spelling is this machine's
  // ordinary one, since `&&` is a parser error there.
  for (const cmd of [
    'git push && gh workflow run ci.yml --ref claude/x',
    'git push origin HEAD; gh workflow run ci.yml --ref claude/x',
    'git push -u origin claude/x; if ($?) { gh workflow run ci.yml --ref claude/x }',
    'cd /c/wt && git push && sleep 20 && gh workflow run ci.yml --ref claude/x',
    'gh workflow run ci.yml --ref claude/x && git push',
  ]) {
    assert.ok(pushesAndDispatches(cmd), cmd);
  }
});

test('a push alone, a dispatch alone, a dry run, and the pair as text are not the coin flip', () => {
  for (const cmd of [
    'git push',
    'git push -u origin claude/x',
    'gh workflow run ci.yml --ref claude/x',
    'git push && gh run list --branch claude/x --limit 1',
    'git push --dry-run && gh workflow run ci.yml --ref claude/x',
    'git push -n && gh workflow run ci.yml --ref claude/x',
    'echo "git push && gh workflow run ci.yml"',
    'grep -rn "gh workflow run" docs/ && git push',
    'git log --oneline -3; gh workflow run ci.yml --ref claude/x',
  ]) {
    assert.ok(!pushesAndDispatches(cmd), cmd);
  }
});

test('pushedUpdates reads the branches a push updated off the report git printed', () => {
  // Git prints the report on stderr; the tool response carries both streams as fields.
  const stderr =
    'To github.com:NoaCG/NoaCG-Studio.git\n' +
    '   1765fcfe..2a3b4c5d  claude/r-mistake-triggers -> claude/r-mistake-triggers\n';
  assert.deepEqual(pushedUpdates('git push', { stdout: '', stderr, interrupted: false, exit_code: 0 }), [
    { from: '1765fcfe', to: '2a3b4c5d', branch: 'claude/r-mistake-triggers' },
  ]);
  // A forced update is still an update, and a string response is read the same way.
  assert.deepEqual(
    pushedUpdates('git push --force-with-lease', ' + 1765fcfe...2a3b4c5d claude/x -> claude/x (forced update)\r\n'),
    [{ from: '1765fcfe', to: '2a3b4c5d', branch: 'claude/x' }],
  );
});

test('pushedUpdates is empty for a first push, a no-op, a rejection, a dry run and a non-push', () => {
  const cases = [
    ['git push -u origin claude/x', ' * [new branch]      claude/x -> claude/x\n'],
    ['git push', 'Everything up-to-date\n'],
    ['git push', ' ! [rejected]        claude/x -> claude/x (fetch first)\nerror: failed to push some refs\n'],
    ['git push --dry-run', '   1765fcfe..2a3b4c5d  claude/x -> claude/x\n'],
    ['git log --oneline -3', '   1765fcfe..2a3b4c5d  claude/x -> claude/x\n'],
    ['git push', null],
    ['git push', { stdout: 42 }],
    ['git push', undefined],
  ];
  for (const [cmd, response] of cases) assert.deepEqual(pushedUpdates(cmd, response), [], cmd);
});

test('a refspec push reports the branch gh knows, not refs/heads/', () => {
  assert.deepEqual(pushedUpdates('git push origin HEAD:refs/heads/claude/x', '   1765fcfe..2a3b4c5d  HEAD -> refs/heads/claude/x\n'), [
    { from: '1765fcfe', to: '2a3b4c5d', branch: 'claude/x' },
  ]);
});

test('unfinishedRun speaks only when no run for the old tip reached a verdict', () => {
  // Both sets are real, read with gh run list on 2026-09-05. The first was the first event the
  // notice was ever fed and it must be SILENT: the cancelled push run has a green dispatch beside
  // it, so the delta at 43c9d60b was covered.
  const twoRuns = [
    { conclusion: 'success', databaseId: 33925755805, headSha: '83468df6d98352a895da6adbb6a52bf5160d53ae', status: 'completed' },
    { conclusion: 'success', databaseId: 33924695227, headSha: '43c9d60b1b5dc51fb53725e156f9c4936efc7cf5', status: 'completed' },
    { conclusion: 'cancelled', databaseId: 33924688365, headSha: '43c9d60b1b5dc51fb53725e156f9c4936efc7cf5', status: 'completed' },
  ];
  assert.equal(unfinishedRun(twoRuns, '43c9d60b'), null);
  // The real 2026-09-04 follow-up push on claude/b-gate-covers-what-it-claims: one cancelled run
  // for a8ce0d1b and nothing else, so nothing that finished covers it.
  const oneCancelled = [
    { conclusion: 'success', databaseId: 33920462610, headSha: '70c3a9776e866138fe5ea842b7956d309764f984', status: 'completed' },
    { conclusion: 'cancelled', databaseId: 33920380841, headSha: 'a8ce0d1bd1529ed9fd30d5881d2c4457a5105f78', status: 'completed' },
  ];
  assert.equal(unfinishedRun(oneCancelled, 'a8ce0d1b')?.databaseId, 33920380841);
  // Still going counts as unfinished - it is about to be cancelled.
  assert.equal(unfinishedRun([{ conclusion: '', databaseId: 1, headSha: 'a8ce0d1bffff', status: 'in_progress' }], 'a8ce0d1b')?.databaseId, 1);
  // A run that stopped at its own timeout-minutes is not a verdict either (root AGENTS.md).
  assert.equal(unfinishedRun([{ conclusion: 'timed_out', databaseId: 2, headSha: 'a8ce0d1bffff', status: 'completed' }], 'a8ce0d1b')?.databaseId, 2);
  // A red run IS a verdict: the delta was tested, and the colour says so.
  assert.equal(unfinishedRun([{ conclusion: 'failure', databaseId: 3, headSha: 'a8ce0d1bffff', status: 'completed' }], 'a8ce0d1b'), null);
  // No run for the tip, or nothing to read, is nothing to say.
  assert.equal(unfinishedRun(oneCancelled, 'deadbeef'), null);
  assert.equal(unfinishedRun(null, 'a8ce0d1b'), null);
});
