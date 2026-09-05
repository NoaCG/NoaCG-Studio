// DOES THIS SHELL COMMAND START HEAVY BROWSER WORK? - the one place that decides.
//
// WHY IT IS ITS OWN MODULE. Two consumers need the same answer from opposite directions:
// `scripts/hooks/guard-command.mjs` asks it of a command ABOUT to run, and `scripts/e2e-runs.mjs`
// asks the equivalent of a process ALREADY running. Keeping the list of sweeps in both meant two
// copies of the same fact, and a sweep added to one and not the other is a silent hole - the
// guard would refuse to start it while the detector reported the machine idle, or the reverse.
//
// It also has to be importable, and the hook is not: `guard-command.mjs` reads stdin at module
// top level, so importing it to test its matchers would hang waiting for input that never comes.
// A pure module has no such problem, which is the second reason this file exists.
//
// The matchers are POSITIONAL. Matching a bare string anywhere in the command text was wrong in
// a way that bit within a day: `grep -n "npm run test:e2e" AGENTS.md` contains the phrase and
// starts nothing, and denying it teaches everyone to route around the guard. So the command is
// split on shell separators and each segment is tested at its FIRST token, where an invocation
// has to live. A quoted argument is never in that position.
//
// Positional alone is too SHY, though, because things legitimately stand in front of an
// invocation: a wrapper (`bash -c "…"`), a lone `&`, a PowerShell `if ($?) { … }` block. So the
// "did somebody START this" matchers peel those off first (`invocationParts`) and test what is
// left. Every one of them reads off that same helper - having two of them on the narrow reading
// is what let seven spellings of an e2e run past the machine-wide refusal until 2026-09-02.

/**
 * The repo scripts that spin up a dev server and a pile of headless Chromium, as one alternation
 * shared by the command matcher below and the process detector in `scripts/e2e-runs.mjs`.
 *
 * Deliberately a NAMED list rather than "every script that imports chromium" - 36 of them do, and
 * most are one-off analysis tools nobody runs during normal work. Blocking those would train
 * people to route around the guard. This covers the catalog quality gates AGENTS.md documents,
 * the factory, the render smokes, the `*bench*` family and the `*spike*` family. Anything missed
 * is still absorbed by the worker ladder (`scripts/e2e-workers.mjs`), which sizes a run off free
 * memory whatever else is resident.
 *
 * THE SPIKE FAMILY WAS ADDED 2026-08-15, AFTER FALLING INTO THE HOLE. `spike-mark-clearance-sweep`
 * renders 24 designs at 1920x1080 through the app for about four minutes - the same workload a
 * suite is, by the same measure - and it was started three times beside another worktree's live
 * configured suite, because nothing in the alternation matched its name. The `spike-*` set plus
 * `pro-spike` are one rig: the Pro spike runner and the calibration sweeps that read its
 * thresholds off the catalog. `[\w-]*spike[\w-]*` is deliberately the same shape as the `*bench*`
 * entry beside it, so a NEW spike script is covered by being named like its siblings rather than
 * by somebody remembering this file. The price of a name-shaped rule is that it also catches
 * things that merely SOUND like a job; `SERVER_SCRIPTS` below carves those back out.
 */
/**
 * The scripts whose names fall inside the families above and that are NOT browser work.
 *
 * A SERVER IS NOT A SWEEP. `dev-bench.mjs` is a Vite dev server with a crash log around it, and
 * it stays up for as long as somebody is benching - hours. `bench-dispatcher.mjs` is a module
 * that server preloads (`--import`), so it appears in the SAME process's command line and the
 * detector counted one dev server twice. `ai-bench-server.mjs` restarts that server per
 * candidate. None of the three opens a browser; what they cost is one Vite, which is what the
 * sessions running beside them already pay.
 *
 * Measured 2026-08-17: a bench server left up in one worktree reported as two running sweeps and
 * parked every other session's browser work for 55 minutes, with no finite job anywhere to wait
 * for. Mutual exclusion has to be against jobs that END; a long-lived server in the list turns
 * the guard from serialisation into a deadlock nobody can see the far end of.
 */
export const SERVER_SCRIPTS = 'dev-bench|bench-dispatcher|ai-bench-server';

export const SWEEP_SCRIPTS =
  'l3-sweep|type-floor|overflow-sweep|field-coverage|numerals|factory|catalog-geometry'
  // The two CATALOG MEASUREMENT instruments (docs/CATALOG_VARIETY.md). Both launch Chromium over
  // the whole registry, so they are browser work by every measure the guard cares about, and
  // neither is named like its siblings - the same hole the `*spike*` family sat in until
  // 2026-08-15. `palette-freedom` renders 490 designs TWICE, which is the heaviest of the two.
  + '|catalog-sameness|palette-freedom'
  // The TASTE re-judge (`pro-taste-rejudge.mjs`, docs/NOACG_PRO_PLAN.md §25). It mounts every
  // piece of every row in a finished round at 1920x1080 through the app - 108 of them on the two
  // checkpoint rounds, plus a catalog sweep in `--control` - so it is a job by every measure this
  // module cares about, and it is named like none of the families above. Renaming it into one
  // would make the name lie about what it does, so it is listed, which is the other half of the
  // rule AGENTS.md states.
  + '|pro-taste-rejudge'
  // THE `-sweep` SCRIPTS THAT LAUNCH CHROMIUM THEMSELVES, listed one by one because the family
  // is NOT safely name-shaped: of the nine scripts here whose name ends in `-sweep`, two
  // (`reference-companion-sweep`, `spx-corpus-sweep`) open no browser at all, so a
  // `[\w-]*-sweep` entry beside the `*bench*` and `*spike*` families would queue two scripts
  // that cost nothing - the "too eager" failure this module exists to avoid. All four below
  // render the catalog at 1920x1080 through the app: `occlusion-sweep` is the calibration the
  // occlusion rule is read off, `design-rules-audit-sweep` and `plate-legibility-sweep` were
  // already doing it unlisted, and `footprint-stability-sweep` was listed the day it was written.
  // `footprint-stability-sweep` renders the whole registry TWICE (short text, then long), so it
  // is the heaviest of the four and the one that would hurt most sitting beside a live suite.
  // `text-containment-sweep` renders the whole registry once, drives every text field to a long
  // value and freezes the motion before reading, so it holds the machine for as long as its
  // siblings and belongs here for the same reason they do.
  + '|occlusion-sweep|design-rules-audit-sweep|plate-legibility-sweep|footprint-stability-sweep'
  // `card-look-sweep` renders every design in a category full-frame and screenshots each one,
  // which is the same workload as its siblings above under a name none of them share.
  // `card-pair-sweep` renders the same set through the same rig and then compares every
  // same-category pair, so over `all` it is the whole registry - the heaviest card instrument.
  + '|card-look-sweep|card-pair-sweep'
  + '|text-containment-sweep'
  // `taste-frame-review` renders named designs (and an SVG import) at 1920x1080 through the app
  // and screenshots hold, long-text and step frames for a person to look at. A handful of
  // designs, not the registry - but it is the same rig as `card-look-sweep`, and a script that
  // is not named like a family is exactly the one the guard misses (`docs/VISUAL_TASTE_REVIEW.md`).
  + '|taste-frame-review'
  // `stage-fit-sweep` renders every STAGED design at 1920x1080 through the app and waits out the
  // webfont swap on each, which is the same workload as its siblings above.
  + '|stage-fit-sweep'
  // `svg-import-sweep` walks the whole SVG fixture corpus through the real import door in the
  // app, one Chromium context per fixture, door to export. It is named like the `-sweep` family
  // that is deliberately listed one by one above, so it is listed here for the same reason.
  + '|svg-import-sweep'
  // `svg-samples-check` runs the real importer over the practice library in a bundled Chromium,
  // and `docs-shots` drives the app to photograph the public docs. Neither is named like any
  // family above and neither has an npm entry, which is precisely why they were missed: a
  // script nobody types by its script name still opens a browser, and one started beside a live
  // suite is neither blocked by the guard hook nor seen by the process detector.
  + '|svg-samples-check|docs-shots'
  // The two ACCEPTANCE artifact builders. Neither asserts anything, and that is exactly why
  // they are easy to forget here: a script nobody calls a test still opens Chromium and still
  // drives the whole app through it. `acceptance-pack` walks four productions, a hosted-page rig
  // over its own build, an exported package and a catalog category at three viewport sizes,
  // which is a job by every measure this module cares about.
  + '|acceptance-shots|acceptance-pack'
  // The PLAYOUT DASHBOARD frames, for the same reason as the two above and named like neither
  // family: it builds a production through the app and photographs it at four window sizes.
  + '|playout-dashboard-shots'
  + `|render-smoke[\\w-]*|(?!(?:${SERVER_SCRIPTS})\\.)[\\w-]*bench[\\w-]*`
  + '|[\\w-]*spike[\\w-]*';

/**
 * Drop every HERE-DOCUMENT body from a command line, leaving the command that opened it.
 *
 * A heredoc body is DATA, not commands, and the segmenter below splits on newlines - so a line
 * of prose that happens to start with an invocation-shaped word reads as an invocation. That is
 * the "too eager" failure mode this module was written to avoid, arriving by a route the quoted
 * argument rule cannot cover. It is not hypothetical: `git commit -F- <<'EOF'` with a message
 * whose paragraph opened "test:e2e:affected is the per-merge gate…" was refused as an attempt to
 * start a second suite. A guard that blocks writing a commit message is a guard people learn to
 * route around.
 *
 * Handles the three spellings that appear here - `<<TAG`, `<<'TAG'`/`<<"TAG"` and `<<-TAG` - and
 * an unterminated body (the rest of the text) rather than falling back to scanning it.
 */
function stripHeredocBodies(text) {
  const lines = text.split('\n');
  const out = [];
  let terminator = null;
  for (const line of lines) {
    if (terminator !== null) {
      // `<<-` allows the terminator to be indented; a plain `<<` requires it at column 0.
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    out.push(line);
    const opener = line.match(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/);
    if (opener) terminator = opener[2];
  }
  return out.join('\n');
}

/**
 * A command line's segments, each trimmed to the token an invocation would occupy. Leading
 * `VAR=value` prefixes are stripped so `NOACG_ALLOW_PARALLEL_E2E=1 npm run test:e2e` is still
 * recognised as an npm invocation.
 */
export function commandSegments(text) {
  return stripHeredocBodies(text)
    .split(/&&|\|\||[;|\n]/)
    .map((segment) => segment.trim().replace(/^(?:[A-Za-z_]\w*=\S*\s+)+/, ''));
}

/**
 * PLAN-ONLY invocations. `--list`, `--json` and `--help` make both `e2e-affected.mjs` and
 * Playwright print what they WOULD run and exit: no dev server, no browser, no memory. Treating
 * them as a suite blocks the cheapest thing a session can do - ask which specs a change selects
 * before deciding whether the run is worth queuing - and it is exactly what someone reaches for
 * while another checkout is busy, which is precisely when the guard fires. `--help` is on the
 * list for the same reason and one more: it is what a session types after the planner has just
 * REFUSED an unrecognised flag, so blocking it would answer a refusal with a second refusal.
 */
function isPlanOnly(segment) {
  return /(?:^|\s)--(?:list|json|help)(?:\s|$)/.test(segment);
}

/**
 * Does THIS ONE INVOCATION start a Playwright run - through npm, npx, or the affected entry point?
 *
 * THE SCRIPT NAME NEEDS A RUNNER IN FRONT OF IT, and that requirement is not cosmetic tidying.
 * The prefix used to be optional, so a bare `test:e2e` token was an invocation all by itself. That
 * was harmless while a "part" was a whole shell segment - nothing sane starts a segment with the
 * bare name, because typing it runs nothing - and it stopped being harmless the moment
 * `invocationParts` began splitting on braces, which MANUFACTURES such a part out of an argument.
 * Measured 2026-09-02 against the real hook: `jq '.scripts | {test:e2e}' package.json` and
 * `echo {test:e2e}` were both refused as second suites. A guard that blocks reading package.json
 * is a guard people learn to route around, which is the failure this whole module is written
 * against.
 *
 * `run` is optional inside the prefix instead, because `pnpm test:e2e` is a real spelling the old
 * alternation missed (it allowed `npm run`, `pnpm run` and a bare `yarn`, but not `pnpm` alone) -
 * so this is narrower only on the form nobody can actually execute.
 */
function startsE2e(part) {
  return (
    !isPlanOnly(part) &&
    (/^(?:npm|pnpm|yarn)\s+(?:run\s+)?test:e2e[\w:]*(?:\s|$)/.test(part) ||
      /^(?:npx\s+)?playwright\s+test(?:\s|$)/.test(part) ||
      /^node\s+\S*e2e-affected\.mjs(?:\s|$)/.test(part))
  );
}

/**
 * Does this command start a Playwright run - through npm, npx, or the affected/focus entry point?
 *
 * READ OFF `invocationParts`, NOT OFF THE BARE SEGMENTS, and that was a hole for as long as this
 * module existed. Measured 2026-09-02 by feeding the real hook real events with a live browser job
 * on the machine: `npm run test:e2e` was refused, and `bash -c "npm run test:e2e"`,
 * `npm install; if ($?) { npm run test:e2e }`, `nohup npm run test:e2e`,
 * `powershell -NoProfile -Command "npm run test:e2e:affected"` and `cd /c/repo & npx playwright
 * test x` were all ALLOWED - seven spellings past a refusal whose whole job is to stop two
 * browser jobs sharing a 16 GB laptop. The PowerShell block form is not exotic here; `&&` is a
 * parser error in PowerShell 5.1, so the PowerShell tool's own instructions hand out
 * `A; if ($?) { B }`, which makes it the ORDINARY spelling on this machine's primary shell.
 *
 * `startsDevServer` was routed through the same helper on 2026-09-02 for the same reason, and its
 * header carries the argument for why positional matching alone is too shy once anything
 * legitimately stands in front of an invocation.
 */
export function invokesE2e(text) {
  return invocationParts(text).some(startsE2e);
}

/**
 * Does this command start a catalog sweep or a bench? They cost the same memory as a suite, so
 * they belong in the same mutual exclusion - the guard used to serialise suite-against-suite and
 * then let a sweep start alongside one, which costs exactly as much.
 *
 * Same parts helper as `invokesE2e`, and the same measurement: `bash -c "node
 * scripts/type-floor.mjs"` and `npm run build; if ($?) { node scripts/l3-sweep.mjs shots quiz }`
 * both walked past the refusal on 2026-09-02.
 */
export function invokesSweep(text) {
  return invocationParts(text).some(startsSweep);
}

const SWEEP_DIRECT = new RegExp(`^node\\s+\\S*scripts[/\\\\](${SWEEP_SCRIPTS})\\.mjs(?:\\s|$)`);
const SWEEP_VIA_NPM = /^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)(?:bench|video):[\w:]+(?:\s|$)/;

/** Does THIS ONE INVOCATION start a catalog sweep or a bench? */
function startsSweep(part) {
  return SWEEP_DIRECT.test(part) || SWEEP_VIA_NPM.test(part);
}

/**
 * Does this command hand-start a DEV SERVER on a checkout's port?
 *
 * The rule it serves: Playwright runs with `reuseExistingServer: true`, so a server nobody
 * tracked, on a port a suite expects, is silently adopted along with whatever env it was
 * started with. That is why `npm run dev` and a bare `vite` are refused.
 *
 * IT LIVES HERE, NOT IN THE HOOK, for the reason this module exists at all: `guard-command.mjs`
 * reads stdin at module top level and cannot be imported, so a matcher kept inside it can never
 * be tested. This one guards a REFUSAL with a carve-out in it, which is precisely the shape that
 * must not drift - too shy and the refusal is decorative, too eager and it blocks the sanctioned
 * replacement it recommends.
 *
 * THE CARVE-OUT IS ONE SCRIPT, NOT A CATEGORY. `npm run dev:worktree` (scripts/dev-worktree.mjs)
 * is allowed because it enforces the same invariant mechanically - it serves the checkout its own
 * file sits in, on that checkout's RESERVED port, and refuses when that port is already busy. It
 * exists because the sanctioned alternative could not reach a linked worktree at all (measured
 * 2026-09-01; the full measurement is in that script's header and docs/DEV_PORTS.md). Anything
 * else that wants to start a server goes through it or through the preview tools.
 *
 * Positional like every matcher here, so `grep -n "npm run dev" AGENTS.md` and a commit message
 * quoting the command are not invocations - but positional alone is too SHY for this particular
 * rule, because a dev server is routinely reached through something else. `nohup npm run dev`,
 * `start npm run dev`, `bash -c "npm run dev"` and `cd x & npm run dev` all start a real server
 * on a real port, and the plain regex this replaced caught every one of them by matching the
 * text anywhere. So the invocation is looked for after the two things that legitimately stand in
 * front of one - a pass-through wrapper, and a `&` sequencing a segment the splitter leaves
 * whole - and nowhere else. Both directions are pinned in command-match.test.mjs.
 */
export function startsDevServer(text) {
  return invocationParts(text).some(invocationStartsDevServer);
}

/**
 * Commands that RUN another command, so what follows them is an invocation rather than an
 * argument. `bash -c` and friends take their payload quoted, which is the one place a quoted
 * string really is a command and the "a quoted argument is never in first position" rule would
 * get backwards.
 */
const RUNNER_PREFIX =
  /^(?:(?:nohup|start|time|exec)\s+|(?:bash|sh|zsh|cmd|powershell|pwsh)\s+(?:-NoProfile\s+|-NonInteractive\s+)*(?:-c|-Command|\/c|\/C)\s+)/i;

/**
 * The pieces of a command line that could each BE an invocation, with everything that legitimately
 * stands in front of one taken off.
 *
 * `commandSegments` splits on the separators every matcher shares. This adds the three things a
 * rule about "did somebody START this" needs on top, and they are kept here rather than in the
 * shared splitter because widening that would make the sweep and e2e matchers eager in ways they
 * were never measured for:
 *
 *   - a LONE `&`, which sequences in cmd/PowerShell and backgrounds in bash;
 *   - BRACES and the control-flow word in front of them. `A; if ($?) { B }` is the spelling the
 *     PowerShell tool's own instructions tell agents to use, because `&&` is a parser error in
 *     PowerShell 5.1 - so on this machine's primary shell it is the ORDINARY form, not an exotic
 *     one, and a matcher blind to it is blind most of the time. `pollsQueue` learned this the
 *     hard way ("the PowerShell shape sailed past a matcher written for the bash one");
 *   - PASS-THROUGH WRAPPERS, so `bash -c "npm run dev"` reads as the server it starts.
 *
 * Every "did somebody START this" matcher here now reads off this, which is the point: the three
 * rules it feeds - the dev-server refusal, the e2e mutual exclusion and the sweep mutual exclusion
 * - had drifted into two different answers about the same command line, and the two that were
 * still segment-only were the two that serialise the whole laptop.
 */
function invocationParts(text) {
  return partsOfSegments(startableSegments(text));
}

/**
 * The same peeling, applied to segments a caller has already chosen.
 *
 * Split out for `enqueuesWork`, which asks about the segments BEFORE an enqueue rather than about
 * the whole line. Without it that one rule would have kept the old narrow reading, and the hole
 * would simply have moved: `bash -c "npm run test:e2e" && npm run queue -- "y"` would have read as
 * a plain enqueue and been exempted from the mutual exclusion it just walked past.
 */
function partsOfSegments(segments) {
  return segments
    .flatMap((segment) => segment.split(/(?<!&)&(?!&)|[{}]/))
    .map((part) => stripRunners(part.trim().replace(CONTROL_FLOW_HEAD, '')));
}

/**
 * The loop and conditional words a shell puts in front of an invocation, in this repo's two
 * shells. Shared with `pollsQueue`, which needs exactly the same removal for the same reason.
 */
const CONTROL_FLOW_HEAD =
  /^(?:(?:do|then|else|until|while|if|foreach|for)\s*\([^)]*\)\s*|(?:do|then|else|until|while|if)\s+|[({]\s*)+/i;

/**
 * Strip pass-through wrappers and the quotes a shell runner's payload arrives in. Each pass
 * consumes a non-empty prefix, so it always terminates; the bound is only there to say that two
 * wrappers (`nohup bash -c "…"`) is already the exotic end of what this is for.
 */
function stripRunners(part) {
  let at = part;
  for (let i = 0; i < 3 && RUNNER_PREFIX.test(at); i += 1) {
    at = at.replace(RUNNER_PREFIX, '').trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
  }
  return at;
}

/** The invocations themselves, once nothing legitimate is standing in front of them any more. */
function invocationStartsDevServer(part) {
  if (/^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)dev:worktree(?:\s|$)/.test(part)) return false;
  // `npm run dev`, `npm run dev:bench`, `npm run preview`, and the pnpm/yarn spellings.
  if (/^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)(?:dev|preview)\b/.test(part)) return true;
  // A direct Vite invocation, bare or through npx. The exclusion set keeps `vite.config.ts` and
  // path-shaped tokens out, and the QUOTES in it are what stops `grep "orphan\|vite" file` -
  // the splitter divides that on the `|` inside the pattern, leaving a segment that opens
  // `vite"`. That grep was refused for real while this branch was being reviewed.
  const vite = /^(?:npx\s+)?vite\b(?![.\-/\\'"])(.*)$/.exec(part);
  return vite ? !/^\s+build\b/.test(vite[1]) : false;
}

/** Does THIS ONE SEGMENT write a job to the queue rather than run anything? */
function segmentEnqueues(segment) {
  return (
    /^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)queue(?::merge)?(?:\s|$)/.test(segment) ||
    /^node\s+\S*scripts[/\\]jobs\.mjs\s+add(?:-merge)?(?:\s|$)/.test(segment)
  );
}

/**
 * The segments that could START something, which is every segment UP TO the first enqueue.
 *
 * Everything from an enqueue onwards is that enqueue's ARGUMENT. The segmenter splits on shell
 * separators without regard for quoting, so a queued payload arrives here in pieces: `npm run
 * queue -- "set VAR=1&& npx playwright test x"` becomes `npm run queue -- "set VAR=1` followed by
 * a bare `npx playwright test x"`, and reading that second piece as an invocation is reading an
 * argument as a command. Truncating here rather than in each matcher is what makes the answer the
 * same for all of them - the guard's mutual-exclusion rule and its port check disagreed about
 * this exact command until they shared this function.
 *
 * **This is a mis-typing guard, not an adversarial one.** `npm run queue -- "…" && playwright
 * test x` is exempted too, because nothing here can tell that trailing half from the quoted
 * payload. Closing that would need a quote-aware splitter, and the rule it protects is about
 * accidental overlap between sessions.
 */
export function startableSegments(text) {
  const segments = commandSegments(text);
  const at = segments.findIndex(segmentEnqueues);
  return at === -1 ? segments : segments.slice(0, at);
}

/**
 * ENQUEUEING IS NOT RUNNING. `npm run queue` / `node scripts/jobs.mjs add` write a job and
 * return an id; the runner drains them strictly one at a time against a budget, which is the
 * mutual exclusion the guard exists to get.
 *
 * IT IS ASKED OF ANY SEGMENT, NOT ONLY THE FIRST. Testing the first segment alone meant an
 * ordinary `cd <worktree> && npm run queue -- "…"` was not recognised as an enqueue - the first
 * segment is the `cd` - and the guard then refused the one action it exists to recommend, at the
 * one moment queueing is most obviously right: something else is already running (measured
 * 2026-08-29, docs/handoffs/2026-08-29-dd-svg-fitting-two.md).
 *
 * What the first-segment rule was really protecting is that a REAL run does not get a free pass
 * by mentioning the queue after it, and that is stated directly instead: an enqueue exempts the
 * command only when nothing BEFORE it already starts heavy work. So `npx playwright test x &&
 * npm run queue -- "y"` is still a run, and `cd x && npm run queue -- "y"` is still an enqueue.
 */
export function enqueuesWork(text) {
  const segments = commandSegments(text);
  const at = segments.findIndex(segmentEnqueues);
  if (at === -1) return false;
  const before = partsOfSegments(segments.slice(0, at));
  return !before.some((part) => startsE2e(part) || startsSweep(part));
}

/**
 * The scripts that MEASURE the app through a dev server somebody else has to have started.
 *
 * Every one of them says so in its own header, and every one of them, run without that server,
 * spends its whole slot collecting ERR_CONNECTION_REFUSED and then reports a failure that reads
 * like the app is broken. Queued at night behind a suite, that is a slot burned and a morning
 * spent on a false alarm.
 *
 * Listed rather than pattern-matched for the same reason `SWEEP_SCRIPTS` is: the names do not
 * form a family, and a matcher that guessed would either miss the next one or start refusing
 * scripts that bring their own server (Playwright configs do; nothing here does).
 */
export const DEV_SERVER_DEPENDENT_SCRIPTS =
  'ai-lite-calibrate|ai-lite-regress|ai-vision-dataset|catalog-geometry|catalog-sameness|engine-floor'
  + '|factory|field-coverage|footprint-stability-sweep|import-suggest-audit|lite-on-pro-bank'
  + '|make-render-manifest|numerals|occlusion-sweep|overflow-sweep|pack8-shots|palette-freedom'
  + '|plate-legibility-sweep|pro-harness-spike|pro-iterate-spike|pro-spike|pro-taste-rejudge|pro-type-calibrate|probe-composition'
  + '|reference-companion-sweep|reference-select-check|reference-select-simulate|svg-import-sweep'
  + '|render-smoke|render-smoke-hyperframes|render-smoke-video|spike-axis-calibrate'
  + '|spike-checkpoint-probe|spike-countdown-calibrate|spike-device-mutation-check'
  + '|spike-mark-clearance-sweep|spike-proportion-calibrate|spike-spacing-calibrate'
  + '|spike-structure-margins|spike-well-calibrate|text-containment-sweep|type-floor'
  + '|taste-frame-review';

// Built once: the job runner asks this per job on every poll, and a 40-alternative pattern is
// not worth recompiling five times a minute.
const DEV_SERVER_DEPENDENT = new RegExp(`^node\\s+\\S*scripts[/\\\\](${DEV_SERVER_DEPENDENT_SCRIPTS})\\.mjs(?:\\s|$)`);

/**
 * Does this command need a dev server that is ALREADY running on this checkout's port?
 *
 * Read off the startable segments for the same reason as the matchers above: enqueueing a script
 * that needs a server does not itself need one - the runner asks this again of the queued command
 * when it is that job's turn (`devServerPrecheck` in scripts/jobs-store.mjs).
 */
export function requiresRunningDevServer(text) {
  return startableSegments(text).some((segment) => DEV_SERVER_DEPENDENT.test(segment));
}

/**
 * Is this command a FOREGROUND POLL of the job queue - a loop, a sleep, a `--wait` around it?
 *
 * The queue's whole promise is that you enqueue and get an id back at once. Two sessions spent
 * 175 and 300+ minutes on 2026-08-28 sitting in hand-rolled poll loops over RAM-starved jobs
 * instead, which is the exact failure enqueueing exists to remove: the shell tool is killed at
 * 600 s, so past ten minutes nobody is even reading the answer the loop is waiting for.
 *
 * Answered as "queue command AND a waiting construct", because either half alone is innocent:
 * `node scripts/jobs.mjs log j-0007` is how you read a log, and `sleep 5` is not about the queue.
 */
export function pollsQueue(text) {
  // ENQUEUEING IS NEVER WAITING, whatever its payload says. `jobs.mjs add "… sleep 5 …"` returns
  // an id at once, and refusing it because the queued command contains a waiting word would deny
  // the very move this rule recommends.
  if (enqueuesWork(text)) return false;
  // A loop puts its own syntax in front of the invocation, and this repo's two shells spell it
  // differently: `while true; do node …` in bash, `while ($true) { node … }` in PowerShell. Both
  // heads are stripped, and a `{`/`}` is a separator here as much as a `;` is - without that the
  // PowerShell shape sailed past a matcher written for the bash one, on the shell this machine
  // actually uses.
  const segments = commandSegments(text)
    .flatMap((segment) => segment.split(/[{}]/))
    .map((segment) => segment.trim().replace(CONTROL_FLOW_HEAD, ''));
  const isQueueCall = (segment) =>
    /^node\s+\S*scripts[/\\]jobs\.mjs(?:\s|$)/.test(segment) ||
    /^(?:(?:npm|pnpm)\s+run\s+|yarn\s+)jobs(?:\s|$)/.test(segment);
  if (!segments.some(isQueueCall)) return false;

  // The waiting word is looked for PER SEGMENT, and never in the queue call's own arguments -
  // matching bare strings anywhere is the "too eager" failure this module exists to avoid, and
  // it would deny `jobs.mjs cancel j-7 && git branch -D claude/do-not-land`.
  const WAITING = /(^|\s)(sleep|Start-Sleep)(\s|$)|^(while|until|do|repeat)(\s|\(|$)/i;
  if (segments.some((segment) => !isQueueCall(segment) && WAITING.test(segment))) return true;

  // A `for` / `foreach` loop is a wait only when the queue call sits INSIDE it. A bounded loop
  // beside a queue read (`for f in a b; do echo $f; done; node scripts/jobs.mjs`) walks a list
  // and ends, and refusing it denied a planner's harmless listing on 2026-09-02 - the false
  // positive the orchestrator contract had carried as prose. So the loop is tracked rather than
  // pattern-matched: a `for`/`foreach` head opens it, a bash `done` closes it, and in the brace
  // form the split above leaves an EMPTY segment where the `}` was, which closes it too. A
  // sleepless `for i in $(seq 1 500); do node scripts/jobs.mjs; done`, or PowerShell's
  // `for(;;) { node scripts/jobs.mjs }`, is then still a poll.
  let depth = 0;
  for (const segment of commandSegments(text)) {
    const parts = segment.split(/[{}]/);
    const braced = parts.length > 1; // only a brace split makes an empty part mean "the loop closed"
    for (const part of parts) {
      const trimmed = part.trim();
      if (/^(?:for|foreach)\b/i.test(trimmed)) depth += 1;
      else if (depth > 0 && (trimmed === 'done' || (braced && trimmed === ''))) depth -= 1;
      else if (depth > 0 && isQueueCall(trimmed.replace(CONTROL_FLOW_HEAD, ''))) return true;
    }
  }
  return false;
}

/**
 * Does this command CREATE A BRANCH, and in which checkout does it say to do it?
 *
 * The rule it serves: the checkout that holds `main` is shared infrastructure, and a feature
 * branch parked in it breaks the landing queue in both directions - `scripts/auto-merge.mjs`
 * finds that checkout with `worktreeFor('main')`, then checks it out, merges, builds and resets
 * it on every integration. Both halves were paid for on 2026-08-28: a session that branched there
 * blocked another session's landing outright ("main is checked out nowhere"), and when the runner
 * took the tree back mid-build, that session's `npm run build` gated `main` instead of its own
 * branch AND STILL REPORTED GREEN. A green gate on the wrong tree is worse than a red one, which
 * is why this one is a refusal rather than a warning: both failures are silent in both directions.
 *
 * Returns `{ dir, branch }` per branch-creating invocation: the `git -C <path>` it names (`''` when
 * it names none, so the checkout is whatever the rest of the command line implies), and the name
 * being created. An empty array means nothing here creates a branch.
 *
 * IT IS CREATION, NOT OCCUPANCY, and that is narrower than the rule it serves. `git checkout
 * <existing-branch>` in the primary checkout causes the identical failure, but `git checkout foo`
 * and `git checkout src/foo.ts` are the same command line with the same shape - one moves HEAD and
 * one restores a file - so telling them apart needs the filesystem, which a refusal this broad
 * should not be guessing at. The narrow half is the one that is crisp, and it is the half a
 * session about to start work actually types.
 *
 * `git worktree add -b <branch> <path> main` is NOT a branch creation by this definition, and must
 * not be: it is the sanctioned recipe the refusal recommends, and the branch it makes is checked
 * out somewhere else. Only `checkout` and `switch` move the tree they run in.
 */
export function branchCreations(text) {
  return gitInvocations(text)
    .map(branchCreationIn)
    .filter((creation) => creation !== null);
}

/**
 * Every git invocation this command line would RUN, as `{ dir, subcommand, args }`.
 *
 * `dir` is the `git -C <path>` it names, or `''` when it names none. One function for every git
 * rule here, so the two that ask about a checkout - which branch is being made, and where a commit
 * lands - cannot end up disagreeing about which checkout a command means. They did: the branch
 * rule read `-C` and the commit rule did not, so `git -C <other worktree> commit` was judged
 * against the wrong tree by one of the two.
 */
export function gitInvocations(text) {
  return invocationParts(text).map(parseGit).filter(Boolean);
}

/**
 * The checkouts a COMMIT in this command would land in - `''` for each invocation naming none.
 * Empty means nothing here commits.
 *
 * Deliberately narrower than the `\bgit\b[^\n;|&]*\bcommit\b` scan the commit-MESSAGE guards use.
 * Those read the raw text because the message they judge is embedded in it whatever the quoting,
 * and being over-eager there costs a rewritten message at worst. This one decides whether to go
 * and read the job queue, so it answers about an invocation: `git log --grep commit` is not one.
 */
export function commitCheckouts(text) {
  return gitInvocations(text)
    .filter((git) => git.subcommand === 'commit')
    .map((git) => git.dir);
}

/**
 * A `git` invocation split into the checkout it names, its subcommand, and that subcommand's
 * arguments - or null when the part is not a git invocation at all.
 *
 * A token walk rather than one regex, because git's GLOBAL options sit in front of the subcommand
 * and take their values in three shapes (`-C <path>`, `-c key=value`, bare flags). A quoted path
 * holding spaces is deliberately not reassembled: it yields a `-C` value git cannot resolve, and
 * the caller then falls back to the checkout the command line implies, which is the safe way to
 * be wrong.
 */
function parseGit(part) {
  const rest = /^git\s+(.+)$/s.exec(part);
  if (!rest) return null;
  const tokens = rest[1].trim().split(/\s+/);
  let dir = '';
  let at = 0;
  while (at < tokens.length && tokens[at].startsWith('-')) {
    if (tokens[at] === '-C' || tokens[at] === '--work-tree') {
      dir = (tokens[at + 1] ?? '').replace(/^(['"])(.*)\1$/s, '$2');
      at += 2;
      continue;
    }
    at += tokens[at] === '-c' ? 2 : 1;
  }
  return { dir, subcommand: tokens[at] ?? '', args: tokens.slice(at + 1) };
}

/** The create flags of the two subcommands that move the tree they run in. */
const BRANCH_CREATE_FLAGS = {
  checkout: ['-b', '-B', '--orphan'],
  switch: ['-c', '-C', '--create', '--force-create', '--orphan'],
};

/** `{ dir, branch }` if this invocation creates a branch, else null. */
function branchCreationIn(git) {
  const flags = BRANCH_CREATE_FLAGS[git.subcommand];
  if (!flags) return null;
  // Everything after `--` is a pathspec, so a create flag there names a FILE, not a branch.
  const end = git.args.indexOf('--');
  const options = end === -1 ? git.args : git.args.slice(0, end);
  const at = options.findIndex((token) => flags.includes(token));
  // The name is the token straight after the flag, and it is reported because ONE name is
  // legitimate in the primary checkout: `main`. Restoring that branch there is the one thing that
  // checkout is for, so a refusal that swept it up would block the recovery it exists to protect.
  return at === -1 ? null : { dir: git.dir, branch: options[at + 1] ?? '' };
}

/**
 * Does this command line PUSH a branch and DISPATCH a workflow run in the same breath?
 *
 * `ci.yml` keeps every run of one ref in one concurrency group with `cancel-in-progress`, so a
 * push run and a dispatched run for the same branch cannot both live: whichever registers second
 * cancels the first, and the order two webhooks register in is not stable. Measured four times
 * over 2026-09-04 and 2026-09-05 ("Pushing and dispatching in one breath is a coin flip, and I
 * lost it once" - docs/handoffs/2026-09-04-a-refusals-say-why.md; also 2026-09-04-e, 2026-09-04-f
 * and 2026-09-05-h). When the dispatch loses, what survives is the push run, which plans only the
 * delta since the previous push - the narrow plan the dispatch was issued to avoid.
 *
 * Positional on both halves, like every matcher here: a `git push` INVOCATION and a `gh workflow
 * run` INVOCATION, so a lone `echo` or `grep` naming the pair is not the pairing. A `--dry-run`
 * push registers nothing and is not one either.
 *
 * KNOWN LIMIT, the same one `startableSegments` states: the splitter is not quote-aware, so a
 * push beside a quoted string that carries `&& gh workflow run` reads as the pair - measured in
 * review, 2026-09-05: `git push; echo "done && gh workflow run ci.yml is next"` is refused. A
 * commit message that discusses the pairing, committed and pushed in ONE command, hits it; the
 * way past is the one the refusal already prescribes, two commands. Closing it needs a quote-aware
 * splitter, which every matcher here would then have to share.
 */
export function pushesAndDispatches(text) {
  return pushes(text) && invocationParts(text).some((part) => /^gh\s+workflow\s+run\b/.test(part));
}

/** Does this command line push to a remote for real? Shared by both push rules so they cannot drift. */
function pushes(text) {
  return gitInvocations(text).some((git) => git.subcommand === 'push' && !isDryRun(git));
}

/** A push that reports what it WOULD do and touches no remote: `--dry-run`, or `-n` in a cluster. */
function isDryRun(git) {
  return git.args.includes('--dry-run') || git.args.some((arg) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(arg));
}

/**
 * The branches a `git push` in this command just UPDATED, read off git's own report of it.
 *
 * Only an UPDATE of a branch the remote already had is listed - `<old>..<new> local -> remote` -
 * because that is the only push that leaves a run behind: the run for `<old>`, which this push
 * cancels if it is still going, and which the new run then plans from (`github.event.before`).
 * A first push (`[new branch]`) had nothing in flight; `Everything up-to-date` moved nothing; a
 * rejected push moved nothing either. A forced update (`+ <old>...<new>`) is still an update.
 *
 * Read from the RESPONSE rather than by asking git afterwards, because the response is the one
 * record of what the remote held BEFORE this push, and it is already in the hook's hands. Git
 * prints the report on stderr, so both streams are read.
 */
export function pushedUpdates(text, response) {
  if (!pushes(text)) return [];
  const report = responseText(response);
  const line = /^\s*\+?\s*([0-9a-f]{7,40})\.\.\.?([0-9a-f]{7,40})\s+(\S+)\s+->\s+(\S+)(?:\s+\(.*\))?\s*$/gm;
  // A refspec push reports `refs/heads/<branch>`, which `gh run list --branch` answers with nothing.
  return [...report.matchAll(line)].map((match) => ({
    from: match[1],
    to: match[2],
    branch: match[4].replace(/^refs\/heads\//, ''),
  }));
}

/**
 * The run the push notice should speak about, given the runs for the OLD tip, or null when the
 * old tip's delta is covered. Pure, so both directions are pinned in the tests with the two real
 * run sets they were measured on (2026-09-05).
 *
 * ONE FINISHED RUN IS ENOUGH, whichever it was. A sha routinely has two runs - the push's,
 * cancelled, and the dispatch that cancelled it, green - and reading only the newest would have
 * been right by luck there and wrong the other way round. "Finished" is a run that reached a
 * verdict: `success` or `failure`. A `cancelled` run never reached one, and neither did a run that
 * stopped at its own `timeout-minutes` (`timed_out`) - the root AGENTS.md says so in as many words
 * - so those count as unfinished too, and a run still going counts the same as one about to be
 * cancelled, because in the seconds after the push it is.
 */
export function unfinishedRun(runs, from) {
  if (!Array.isArray(runs)) return null;
  const forTip = runs.filter((run) => typeof run?.headSha === 'string' && run.headSha.startsWith(from));
  if (forTip.length === 0) return null;
  if (forTip.some((run) => run.conclusion === 'success' || run.conclusion === 'failure')) return null;
  return forTip[0];
}

/**
 * The text of a tool response, whatever shape it arrives in. A PostToolUse event carries the
 * shell tool's response as an object (`stdout`, `stderr`, `interrupted`, `exit_code`); a string
 * is accepted too, and anything else reads as empty, which every caller treats as nothing to say.
 */
export function responseText(response) {
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object') return '';
  return Object.values(response)
    .filter((value) => typeof value === 'string')
    .join('\n');
}
