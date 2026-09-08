// PreToolUse guard for shell commands (the Bash and PowerShell tools). Enforces, cheapest
// check first:
//
//  1. Dev servers go through the Claude preview tools, never a raw shell command - a stray
//     server on this checkout's port is exactly the "reuseExistingServer picks up the wrong
//     env" e2e trap documented in e2e/AGENTS.md ("Gotchas when writing a spec").
//  1b. Branches are never created in the primary checkout - it is the tree the landing queue
//     checks out, merges, builds and resets, so a feature branch parked there breaks landing in
//     both directions, silently.
//  2. Commit messages follow the house rules (`root/write-commit-message-outside-developer-reading`
//     and `root/work-feature-branch-own-worktree-made`): no Co-Authored-By trailers, no
//     AI/agent/chat-session language, no internal plan codenames.
//  3. Commits never include dist/ or the generated .claude/launch.json.
//  3b. Nobody polls the job queue in the foreground.
//  3c. A push and a workflow dispatch never share one command - ci.yml's concurrency group makes
//     the pair a coin flip over which run survives.
//  4. The e2e suites only start when (a) no OTHER checkout of this repo is already running one -
//     several worktrees are normally live and each config asks for 4 workers, so two overlapping
//     runs exhaust a 16 GB laptop rather than sharing it - and (b) their port is free, since
//     Playwright would otherwise reuse whatever server is already there, with whatever env it
//     was started with.
//
// The commit-message scan works on the raw command text (the message is embedded in it via
// -m / heredoc / here-string), so it is quoting-style agnostic.

import { isAbsolute, join } from 'node:path';
import { readHookInput, deny, gitOutput, checkoutKind } from './lib.mjs';
import { portsFor } from '../dev-port.mjs';
import { isPortBusy } from '../port-probe.mjs';
import { activeRuns, describeRuns } from '../e2e-runs.mjs';
import {
  branchCreations,
  enqueuesWork,
  invokesE2e,
  invokesSweep,
  pollsQueue,
  pushesAndDispatches,
  startsDevServer,
} from '../command-match.mjs';
import { checkoutRoot, commandCheckout, devPortOverride } from '../command-target.mjs';

const input = await readHookInput();
const command = input?.tool_input?.command;
if (typeof command !== 'string' || command.length === 0) process.exit(0);

// WHICH CHECKOUT IS THIS COMMAND ABOUT? Every judgement below is per-checkout - the port belongs
// to one worktree, and "is anyone ELSE running?" needs to know which root is not somebody else.
// Neither answer may come from this process's own cwd. Two ways it is wrong at once: the hook's
// cwd is whatever Claude Code launched it in rather than where the work happens, and a session
// whose own directory is the main checkout routinely drives a worktree by absolute path. That
// cost four refused integration runs on 2026-08-29 - the guard checked 5174, the MAIN checkout's
// busy port, against a run that would have used this worktree's free 5202. The session's cwd
// arrives in the hook event (session-start.mjs reads it the same way); the command's own `cd`
// wins over it, because that is where the work will actually run.
//
// Resolved LAZILY and once. This hook runs before EVERY shell command in every session, and
// asking git costs about 50 ms - a tax worth paying on the handful of commands that reach a rule
// below, and not worth paying on `ls`.
const sessionDir = typeof input?.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
let resolvedTarget = null;
function targetRoot() {
  if (resolvedTarget === null) resolvedTarget = commandCheckout(command, sessionDir) ?? sessionDir;
  return resolvedTarget;
}

// --- 1. Dev-server policy -----------------------------------------------------------------

// The matcher lives in command-match.mjs so it can be tested; this file cannot be imported.
if (startsDevServer(command)) {
  deny(
    "Blocked: this starts a dev server on a checkout's port without anything owning it - " +
      'the e2e suite runs with reuseExistingServer:true and would silently adopt it along with ' +
      'whatever env it was started with (see e2e/AGENTS.md "Gotchas when writing a spec").\n' +
      'Start it the sanctioned way instead:\n' +
      '  npm run dev:worktree   works in ANY checkout, and is the ONLY thing that works in a ' +
      'linked worktree. It serves the checkout its own file sits in, on that checkout\'s reserved ' +
      'port, and refuses if that port is busy. `node scripts/dev-worktree.mjs --print` shows the ' +
      'URL and the `--base` to hand a sweep, without starting anything.\n' +
      '  preview_start {name: "dev"}   fine in the PRIMARY checkout, where the preview tools own ' +
      'the process and preview_stop closes it. It does NOT reach a linked worktree: measured ' +
      "2026-09-01, one call served the launching session's checkout, reported a third checkout's " +
      'port, and the server was reaped because nothing answered there (docs/DEV_PORTS.md ' +
      '"Starting a dev server").\n' +
      'For a production build, run `npm run build`.',
  );
}

// --- 1b. A feature branch is never created in the PRIMARY checkout ---------------------------
//
// That checkout is shared infrastructure: it is where `main` lives, and a build run there gates
// `main` rather than your branch while still reporting green (root/never-occupy-checkout). It is
// also where every session goes to read what has landed. A feature branch sitting there breaks
// both, and both halves are silent - see `branchCreations` in command-match.mjs for the 2026-08-28
// measurement, made when the laptop lander also merged and RESET that checkout on every landing.
// Hence a refusal: a warning is only as good as somebody reading it, and neither failure
// announces itself.
const creations = branchCreations(command);
if (creations.length > 0) {
  const inPrimary = creations
    // `main` is the ONE name that belongs there. Recreating or resetting it in the primary
    // checkout is the recovery this rule protects, so refusing it would answer a broken tree with
    // a refusal to fix it.
    .filter(({ branch }) => branch !== 'main')
    .map(({ dir }) => namedCheckout(dir))
    .filter(Boolean)
    .find((root) => checkoutKind(root) === 'primary');
  if (inPrimary) {
    deny(
      `Blocked: this creates a branch in the PRIMARY checkout (${inPrimary}), which is shared ` +
        'infrastructure rather than a place to work - the landing queue checks it out, merges, ' +
        'builds and resets it on every integration ' +
        '(`root/never-occupy-checkout-holds-feature-branch`).\n' +
        'On 2026-08-28 that cost both halves at once: a branch parked there made every landing of ' +
        'the wave refuse with "main is checked out nowhere", and when the runner took the tree back ' +
        "mid-build, that session's `npm run build` gated `main` instead of its own branch and still " +
        'reported GREEN.\n' +
        'Make a worktree and do the work there instead:\n' +
        '  git worktree add -b <branch> .claude/worktrees/<name> main\n' +
        '  cd .claude/worktrees/<name>\n' +
        'Branching inside a LINKED worktree is fine and is not what this refuses - only the one ' +
        'checkout whose job is being on `main`.',
    );
  }
}

// --- 2 + 3. Commit guards ------------------------------------------------------------------

// "git ... commit" within one shell command segment (not across ; | & or newlines).
const isCommit = /\bgit\b[^\n;|&]*\bcommit\b/.test(command);

if (isCommit) {
  // A queued branch is frozen: a commit after queueing kills the landing (frozen-branch.mjs).
  const { liveLandingFor, frozenMessage } = await import('./frozen-branch.mjs');
  const frozen = await liveLandingFor(targetRoot());
  if (frozen) deny(frozenMessage({ ...frozen, what: 'commit' }));

  // Never allowed, no escape hatch: agent co-author trailers and generated-with footers.
  if (/co-authored-by/i.test(command) || /🤖/u.test(command)) {
    deny(
      'Blocked: commit messages in this repo never carry Co-Authored-By trailers or ' +
        '"Generated with" footers (`root/work-feature-branch-own-worktree-made`). Rewrite the ' +
        'message without them.',
    );
  }

  // The em-dash, which is the tell readers actually complain about (owner, 2026-08-26: it is
  // "the one thing people complain about, claiming it's AI-written"). No escape hatch, because
  // a commit subject has never needed one - a plain dash, a comma or a colon always works, and
  // the character is not reachable by accident on any keyboard. Same rule as the copy gate on
  // user-facing text (scripts/check-copy.mjs); a commit message is read by outsiders too.
  if (/—/u.test(command)) {
    deny(
      'Blocked: this commit message contains an em-dash (—). Use a plain dash (-), a comma, or ' +
        'two sentences - the em-dash is the single most common reason a reader decides text was ' +
        'machine-written, and the history is read by outside developers.',
    );
  }

  // House-style violations: AI/agent mentions, chat-session phrases, internal plan codenames.
  // A commit genuinely about AI tooling may mention these - bypass by putting
  // ALLOW_AI_MENTION=1 in the command (any shell syntax; the literal text is what counts).
  const escaped = /ALLOW_AI_MENTION\s*=\s*1/.test(command);
  if (!escaped) {
    const STYLE_VIOLATIONS = [
      // (?![./\\-]) lets file/branch/path references through: CLAUDE.md, .claude/,
      // claude/branch-name, and Windows paths like C:\claude\repo (backslash separator).
      [/\bclaude\b(?![./\\-])/i, 'mentions Claude'],
      [/\bcodex\b/i, 'mentions Codex'],
      [/\bchatgpt\b/i, 'mentions ChatGPT'],
      [/\bcopilot\b/i, 'mentions Copilot'],
      [/\banthropic\b/i, 'mentions Anthropic'],
      [/\bopenai\b/i, 'mentions OpenAI'],
      [/\bas requested\b/i, 'chat phrase "as requested"'],
      [/\bas instructed\b/i, 'chat phrase "as instructed"'],
      [/\bper (?:your|the|my) instruction/i, 'chat phrase "per ... instructions"'],
      [/\bthis session\b/i, 'chat phrase "this session"'],
      [/\bthis conversation\b/i, 'chat phrase "this conversation"'],
      [/\bcontinued work\b/i, 'vague phrase "continued work"'],
      [/\bmade changes\b/i, 'vague phrase "made changes"'],
      [/\bai update\b/i, 'vague phrase "AI update"'],
      [/\bera[ -]?\d/i, 'internal era codename'],
      [/\bT\d\.\d\b/, 'internal plan codename (T3.5-style)'],
    ];
    const hits = STYLE_VIOLATIONS.filter(([pattern]) => pattern.test(command)).map(([, why]) => why);
    if (hits.length > 0) {
      deny(
        'Blocked: this commit command trips the commit-message style rules ' +
          `(\`root/write-commit-message-outside-developer-reading\`): ${hits.join('; ')}.\n` +
          'Messages must read as written by a human developer for an outside reader - no AI/agent/chat ' +
          'language, no internal codenames. If a mention is deliberate because the commit is genuinely ' +
          'about AI tooling, include ALLOW_AI_MENTION=1 in the command to bypass this check.',
      );
    }
  }

  // Staged-content check: dist/ and the generated launch.json are never committed. Both are
  // gitignored, so reaching the index takes a force-add - catch it here. `git commit -a`
  // also sweeps in unstaged tracked changes, so scan those too when -a/--all is present.
  const staged = gitLines(['diff', '--cached', '--name-only']);
  const sweepsTracked = /\bgit\b[^\n;|&]*\bcommit\b[^\n;|&]*(\s--all\b|\s-(?!-)[a-zA-Z]*a)/.test(command);
  const candidates = sweepsTracked ? staged.concat(gitLines(['diff', '--name-only'])) : staged;
  const forbidden = candidates.filter((f) => f.startsWith('dist/') || f === '.claude/launch.json');
  if (forbidden.length > 0) {
    deny(
      `Blocked: this commit would include generated files that never go into the repo: ${[...new Set(forbidden)].join(', ')}.\n` +
        'dist/ is build output and .claude/launch.json is regenerated per-checkout by postinstall. ' +
        'Unstage them (git restore --staged <path>) and commit again.',
    );
  }
}

// --- 3b. No unbounded foreground wait on a queued job ----------------------------------------
//
// Enqueueing exists so nobody sits and waits, and a hand-rolled poll loop over the queue gives
// that back. Two sessions spent 175 and 300+ minutes in one on 2026-08-28, both on jobs the RAM
// floor was holding: the shell tool dies at 600 s, so from ten minutes on the loop was running
// with nobody reading it, and nothing anywhere said so. The bounded wait below is the most a
// session may do; past that the answer is a handoff, not a longer wait.
if (pollsQueue(command)) {
  deny(
    'Blocked: this waits on the job queue in the foreground, which is what enqueueing exists to ' +
      'remove - the shell tool is killed at 600 s and the wait outlives it, so a long poll is a ' +
      'session sitting on an answer nobody is reading (two ran 175 and 300+ minutes on 2026-08-28).\n' +
      'Read the queue once (`node scripts/jobs.mjs`), or wait with a bound: ' +
      '`node scripts/jobs.mjs wait <id>` gives up after 30 minutes and tells you what to do next.\n' +
      'If the job is genuinely long, ENQUEUE AND HAND OFF: the runner finishes it without you, and ' +
      'SessionStart reports what landed while you were away.',
  );
}

// --- 3c. A push and a workflow dispatch never share one command --------------------------------
//
// `ci.yml` keeps every run of one ref in one concurrency group with cancel-in-progress, so the
// push's run and the dispatched run cannot both live: the one that registers second cancels the
// first, and the order two webhooks register in is not stable ("Pushing and dispatching in one
// breath is a coin flip, and I lost it once" - docs/handoffs/2026-09-04-a-refusals-say-why.md, and
// three more handoffs over the same two days). When the dispatch loses, the push run survives and
// plans only the delta since the previous push - the narrow plan the dispatch was issued to avoid -
// and it reports green. A refusal because the check is exact: no reading of the pair in one
// command is reliable, and the sanctioned shape is two commands. The matcher is positional
// (`pushesAndDispatches` in command-match.mjs), so quoting the pair in an echo is not the pair.
if (pushesAndDispatches(command)) {
  deny(
    'Blocked: this pushes and dispatches a CI run in one breath. ci.yml holds every run of a ref in ' +
      'one concurrency group with cancel-in-progress, so whichever of the two registers second ' +
      'cancels the first - and which one that is is a coin flip (lost for real on 2026-09-04). When ' +
      'the dispatch loses, the push run survives and plans only the delta since the previous push, ' +
      'which is the narrow plan you dispatched to avoid, and it reports green.\n' +
      'Do it as two commands:\n' +
      '  git push\n' +
      '  gh workflow run ci.yml --ref <branch>   once `gh run list --branch <branch> --limit 1` lists ' +
      "the push's run; the dispatch then cancels that run and the full suite runs in its place.\n" +
      'A push on its own is fine; so is a dispatch on its own.',
  );
}

// --- 4. Heavy browser work: one job per MACHINE ----------------------------------------------

// 4a. Nothing that drives a pile of headless Chromium may start while another such job is
//     running - an e2e suite, a catalog sweep, or a bench, in ANY checkout. They are the same
//     workload under different names: a dev server plus browsers, on a box measured to run out
//     of memory at around six browser workers. Two at once produced 59 live browser shells,
//     10.9 GB held by the test processes and available RAM down to 35 MB, at which point every
//     foreground app is being paged out. Neither job is at fault; the overlap is, and no
//     session can see it from inside its own checkout.
//     Serialising costs nothing: two jobs sharing one box do not finish sooner than two run
//     back to back, they only make everything else unusable while they do it.
if (invokesE2e(command) || invokesSweep(command)) {
  //   A command that already routes through the waiter serialises itself, so it is exempt:
  //   blocking it would be refusing the very fix this rule recommends.
  //   ENQUEUING is the strongest form of that fix and starts nothing at all - see
  //   `enqueuesWork` in command-match.mjs, which is where that answer lives so the matcher and
  //   its tests cannot drift apart from the rule.
  const selfQueuing =
    enqueuesWork(command) ||
    /e2e-runs\.mjs\s+--wait/.test(command) ||
    /\btest:e2e[\w:]*:queued\b/.test(command);
  const others = selfQueuing ? [] : activeRuns({ exclude: targetRoot() });
  if (others.length > 0 && !/NOACG_ALLOW_PARALLEL_E2E\s*=\s*1/.test(command)) {
    deny(
      `Blocked: browser-driving work is already running on this machine:\n${describeRuns(others)}\n` +
        'A suite, a catalog sweep and a bench all cost the same memory, and two at once exhaust it ' +
        'rather than sharing it (see `root/enqueue-browser-driving-work-rather-than`).\n' +
        'Wait for it with `node scripts/e2e-runs.mjs --wait` (it blocks until clear, then exits 0), ' +
        'or queue an e2e run behind it with `npm run test:e2e:queued` / `npm run test:e2e:focus:queued`.\n' +
        'If the overlap is genuinely wanted, include NOACG_ALLOW_PARALLEL_E2E=1 in the command.',
    );
  }
}

// 4b. The port check applies to e2e runs only - a sweep starts its own server on the same port
//     but is not subject to reuseExistingServer's env-pinning trap.
if (invokesE2e(command)) {
  const live = /\btest:e2e:live\b/.test(command) || /playwright\.live\.config/.test(command);
  // The port belongs to the checkout the run will happen in, not to whoever is asking. An
  // explicit DEV_PORT in the command beats both, because it beats both at runtime too.
  const record = await portsFor(targetRoot());
  const port = devPortOverride(command) ?? (live ? record.livePort : record.port);
  if (await isPortBusy(port, 750)) {
    deny(
      `Blocked: something is already listening on port ${port} - the ${live ? 'live' : 'offline'} e2e port ` +
        `of the checkout this command runs in (${targetRoot()}).\n` +
        'Playwright runs with reuseExistingServer:true, so it would reuse that server with ' +
        `whatever env it was started with, and the ${live ? 'configured-mode' : 'offline-pinned'} specs ` +
        'fail confusingly (see e2e/AGENTS.md "Gotchas when writing a spec").\n' +
        'Stop that server first (preview_stop if it was started with the preview tools), then re-run. ' +
        'If a killed run left it behind, nothing owns it and there is nothing to stop it FROM - ' +
        '`node scripts/e2e-runs.mjs --orphans` says whether that is the case, and `--kill-orphans` ' +
        'closes it.\n' +
        "Servers in other worktrees are harmless - they live on their own ports.",
    );
  }
}

process.exit(0);

/**
 * Does this command actually START an e2e run, as opposed to merely mentioning one?
 *
 * Matching the bare string anywhere in the text was wrong in a way that bites daily: `grep -n
 * "npm run test:e2e" AGENTS.md` contains the phrase and starts nothing, and denying it teaches
 * everyone to route around the guard. So the check is positional - the command is split on
 * shell separators and each segment is tested at its FIRST token, where an invocation has to
 * live. A quoted argument is never in that position, which is exactly the distinction we want.
 */
/**
 * Run git with the given args in the checkout the command is about, and return stdout as trimmed
 * lines. Against `targetRoot()` rather than this process's cwd, for the same reason the port is
 * resolved that way: a commit made in one worktree must be judged against THAT worktree's index.
 */
function gitLines(args) {
  const out = gitOutput(targetRoot(), args) ?? ''; // fail open - git itself will complain
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * The checkout an invocation's own `git -C <path>` names, or the one the command line implies.
 *
 * `-C` beats every other reading of the line, because it beats them at runtime too. It is resolved
 * against the checkout the command RUNS in rather than against this hook's cwd, which is somewhere
 * else entirely; and a `-C` git cannot resolve answers NULL rather than falling back, so a command
 * explicitly pointed somewhere unresolvable is never attributed to the tree the session happens to
 * be sitting in - that would refuse a command for a checkout it never named.
 */
function namedCheckout(dir) {
  if (!dir) return targetRoot();
  return checkoutRoot(isAbsolute(dir) ? dir : join(targetRoot(), dir));
}
