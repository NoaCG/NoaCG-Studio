// gate: build
// guards: AGENTS.md, **/AGENTS.md, **/CLAUDE.md, .agent-workflows/**, .agents/**, .claude/**, docs/AGENT_WORKFLOWS.md
//
// Guard the shared Claude Code / Codex instruction architecture against drift.
//
// Canonical content:
//   - project rules: AGENTS.md
//   - reusable procedures: .agent-workflows/<name>.md
//
// Tool adapters:
//   - Claude Code: .claude/commands/<name>.md or .claude/skills/<name>/SKILL.md
//   - Codex: .agents/skills/<name>/SKILL.md
//
// A short alias (see WORKFLOW_ALIASES) is just a second pair of adapters pointing at an
// existing workflow - never a second copy of the procedure.
//
// See docs/AGENT_WORKFLOWS.md. This runs first in `npm run build`.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter as parseFrontmatterText } from './owner-receipts.mjs';
import { GENERATED_MARKER } from './contracts-lib.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_WRAPPER_LINES = 25;
const DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024;
// Membership means DESTRUCTIVE, not merely important - it is what earns the
// disable-model-invocation requirement below. `handoff` briefly joined while it removed its own
// worktree; it no longer touches cleanup at all, so it left again rather than diluting what this
// set means.
const EXPLICIT_ONLY_WORKFLOWS = new Set(['cleanup-worktrees']);
// Short invocation aliases: <alias> => <canonical workflow>. An alias owns adapters in BOTH
// tools, exactly as thin as a normal adapter, pointing at the target's canonical workflow -
// so a shortcut can never grow a second copy of the procedure. Never alias a destructive
// (explicit-only) workflow: a one-keystroke command must not be able to land anything.
const WORKFLOW_ALIASES = new Map([
  ['n', 'next'],
  ['o', 'orchestrator'],
]);
const CLAUDE_ONLY_EXCEPTIONS = new Map([
  [
    'rescue',
    'Claude-specific adapter that delegates a long-running task from Claude Code to Codex.',
  ],
]);
const CRITICAL_WORKFLOW_MARKERS = new Map([
  [
    'next',
    [
      'Never invent work to have something to offer.',
      'git status --porcelain=v1 --branch',
      'node scripts/worktree-activity.mjs',
      'Never act on a collision.',
      'Verify before you list.',
      "Read, don't write.",
    ],
  ],
  [
    // The orchestrator assigns work to other sessions and must never start it, so the two
    // halves that keep it honest are pinned: it grounds the plan in measured repository state
    // rather than in a handoff's prose, and it says out loud what it would push back on. That
    // section exists because a day was once planned with four of six sessions serving goals the
    // roadmap had parked - flagging is the whole value, so it must not be quietly droppable.
    'orchestrator',
    [
      'node scripts/worktree-activity.mjs',
      'node scripts/merge-order.mjs',
      'What I would push back on',
      'Every pasted task gets a prompt.',
      // Quoted from the root AGENTS.md rather than paraphrased, so the two cannot drift apart
      // with a green build - the earlier lowercase paraphrase pinned only itself.
      'One browser-driving job per MACHINE, not per worktree',
      'Never act on a collision.',
      "Read, don't write.",
      'Create or update no files',
      // A wave is planned so that nothing waits to START - the queue already serializes landing,
      // and a start-order edge is the one that strands work overnight when its predecessor dies.
      // Both halves are pinned: the rule, and the ban on the line that used to encode the edge.
      'A wave is ORDER-FREE or it is not a wave',
      'There is no `WAIT` line, because a wave is order-free',
      // Landing is serialized, not permissioned. A wave the user has to merge by hand in the
      // morning is the exact cost this shape removes, so every prompt queues itself - and a
      // session that stops to ask a human is a session that does nothing all night.
      'QUEUE is mandatory on every prompt and is the last thing in it',
      'No prompt ever contains a step for the user, and no session blocks on a question.',
      // The exceptions to NEVER ACTS are enumerated so none can widen quietly, and none of
      // them reaches landing. (Third added 2026-08-29: the gitignored wave-state file, so a
      // night wave's plan survives the planning session. Fourth added 2026-08-30: the permanent
      // home worktree, the one path outside this checkout the session ever writes to.)
      'Exactly four exceptions, all bounded',
      // The home is what makes every later read CURRENT, so it has to run before them and it has
      // to be a script: prose gets skipped, a script either ran or it did not. A throwaway
      // worktree reads the commit it was cut from, and the main checkout is rewritten by every
      // landing - both were paid for before this line existed.
      'node scripts/orchestrator-home.mjs',
      'the main checkout belongs to the landing queue',
      'Never merge, and never push by hand.',
      'follow-on that was not planned is never launched',
      // A night wave that plans follow-ons and then goes to sleep has planned nothing: the loop
      // is the half that fires them. Entering it is automatic, and a quiet tick must stay quiet.
      'A night wave enters this automatically',
      'A tick with no landing is a no-op, not a report',
      // The loop can die silently, so nothing the wave NEEDS may depend on it - every starting
      // prompt queues itself, and a follow-on only ever carries work the night can afford to lose.
      'The loop is ADDITIVE, never load-bearing',
      // The report is read over coffee by the one person who can unblock the night's output, so
      // their steps come first and complete, and the prompt section never manufactures work.
      'Needs you, FIRST, and step-by-step.',
      'A finished session gets no prompt.',
      // Handoffs are working files, not records - git already keeps the history. Without the
      // consumed/spent/deferred pass the folder grows monotonically and every plan re-reads it.
      'Handoff files are CONSUMED, not archived - git is the archive.',
      // Literal obedience is the failure mode this pair guards: the why travels so a session can
      // beat the route, and spare capacity drains a declared backlog instead of invented work.
      'WHY is a TARGET, not a route.',
      'never invent work to fill a wave',
      // Paid-for on 2026-08-26: a build gate landing mid-wave turns every sibling's merge of
      // main into a moving target, and their reds read as their own fault.
      'A GATE LANDS ALONE.',
      // The owner is the top-level coordinator, consulted on major forks - never a gate on
      // machine-decidable choices, however important; and a why that is not true breaks
      // working software when executed to the letter.
      'a question reaches the user only when the',
      'THE WHY MUST BE TRUE, and function outranks cosmetics.',
      'THE WAVE WINDOW is whatever time the user names in the invocation',
      // Context rot reads as the agents getting dumber - the weekly fresh-eyes session is the
      // counter, and the cold-read test is its teeth.
      'A finished session leaves nothing running.',
      'A continuation prompt printed only in chat does not exist.',
      'The coherence cadence',
      // The self-feeding wave is bounded by the report, not by pre-approval - the loop can
      // extend a wave, never extend itself past the owner's checkpoint.
      'THE REPORT IS THE CHECKPOINT.',
      'Every wave improves the orchestration system',
      // Routing is a step of the plan, and three mechanisms make the plan's readiness, the
      // handoff drain and the owner's asks observable rather than remembered (2026-09-02).
      'Every row names its POOL',
      'node scripts/wave-plan-check.mjs',
      'node scripts/handoff-drain.mjs',
      'node scripts/owner-receipts.mjs',
      "Landing authority belongs to GitHub's merge queue",
      // Big prompts are the point: one branch, one gate, one landing instead of three.
      'A starting prompt is a MULTI-STEP ASSIGNMENT, and should be big.',
      // The whole workflow rests on this: it assigns work and does none of it, and it never
      // reaches into another worktree - not to merge, not to check, not to tidy. Printing a merge
      // order reads like an offer to merge, so the boundary is pinned in both directions. The
      // second marker is the OTHER half, added 2026-09-08 after the first reading of the bullet it
      // replaced produced a plan handed to the owner to paste: doing none of the work never meant
      // making him start the rows.
      // WRITING A MARKER INTO PROSE DISARMS IT. The search below is over the core CONCATENATED
      // with its modules, so a marker quoted word-for-word in a narrative module - an incident
      // write-up describing the very rule - satisfies itself and the rule can then be deleted from
      // the contract with a green build. That happened to both markers below on the day the second
      // was added; the write-up now paraphrases. Quote a pinned sentence nowhere but where it binds.
      'THIS SESSION NEVER ACTS',
      'This session LAUNCHES its own rows',
      'Section 3 is a report, not a pick.',
      // A file-list diff calls every one of these collisions disjoint, so the plan has to hand
      // out the scarce slots itself.
      'The plan ALLOCATES these up front',
    ],
  ],
  [
    'handoff',
    [
      'git rev-parse --short HEAD',
      'whether the working tree is clean',
      'last known verification command/result tied to that commit',
      'Do not run verification during handoff.',
      'Create or update no files',
      // A handoff exists so the NEXT session can judge the work, not obey a list. The why is
      // what makes that judgement possible, and it is the first thing to go when a handoff is
      // written in a hurry - so it is pinned. The other two are the fields a later session
      // cannot reconstruct once the branch is merged and the chat is archived.
      'Every item carries its WHY',
      'The files this branch touched',
      "Constraints: point, don't reprint.",
      // The archive verdict is a TEST, not an impression: archive-ready means committed, pushed
      // and contained in `main`, and containment that cannot be established reads as not safe.
      // Both ancestor checks are pinned because dropping either one turns the verdict back into
      // a feeling - a green feature branch would pass on "it all worked".
      'This is a TEST, not an impression.',
      'git merge-base --is-ancestor HEAD main',
      'git merge-base --is-ancestor HEAD origin/main',
      // Handoff must stay read-only, and must stay OUT of worktree cleanup entirely - the owner
      // does not want the option raised here, and since 2026-08-30 the cleanup workflow decides
      // eligibility itself, so a handoff has nothing to add. This marker replaced two that
      // pinned handoff's own cleanup report, removed 2026-08-08.
      "Read, don't write.",
      'Never remove a worktree, and never offer to.',
    ],
  ],
  [
    'cleanup-worktrees',
    [
      'contained in both local `main` and `origin/main`',
      '`git branch -d`, never `-D`',
      'never `git worktree remove --force`',
      '--apply --acknowledge-risks',
      'non-empty unregistered folders are reported',
    ],
  ],
]);
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.claude',
  '.agents',
  '.codex',
  'dist',
  'worktrees',
  'coverage',
  'playwright-report',
  'test-results',
  '.vercel',
  'video-bench-out',
  '.next',
  'build',
]);

const failures = [];

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function absolute(relative) {
  return path.join(ROOT, ...relative.split('/'));
}

function text(file) {
  return readFileSync(file, 'utf8');
}

function lineCount(file) {
  return text(file).split('\n').length;
}

/**
 * What one instruction file COSTS a Codex session, measured LF-normalised.
 *
 * The number that matters is the size of the file as committed, which is what a fresh checkout
 * hands the agent. A Windows working copy checks these out with CRLF (`core.autocrlf`), so
 * measuring the bytes on disk adds one per line - 1,468 of them across the largest chain here.
 * That was enough to report the chain 759 bytes OVER a budget it was actually 709 bytes under,
 * so the check failed on every Windows machine while CI, which checks out LF, stayed green. A
 * gate that says different things on different machines teaches people to ignore it.
 */
function chainBytes(file) {
  return Buffer.byteLength(text(file).replace(/\r\n/g, '\n'), 'utf8');
}

function checkThinWrapper(file, mustContain, label) {
  if (!existsSync(file)) {
    failures.push(`${label}: missing ${rel(file)}`);
    return;
  }
  const content = text(file);
  if (!content.includes(mustContain)) {
    failures.push(`${label}: ${rel(file)} must reference "${mustContain}"`);
  }
  const lines = lineCount(file);
  if (lines > MAX_WRAPPER_LINES) {
    failures.push(
      `${label}: ${rel(file)} is ${lines} lines; canonical instructions belong in ${mustContain}`,
    );
  }
}

function findFilesNamed(dir, filename, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      findFilesNamed(path.join(dir, entry.name), filename, found);
    } else if (entry.name === filename) {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
}

/** A file's front matter as a flat object, through the repo's one parser (owner-receipts.mjs). */
function parseFrontmatter(file) {
  return parseFrontmatterText(text(file))?.data ?? null;
}

function checkSkillMetadata(file, expectedName, label) {
  const metadata = parseFrontmatter(file);
  if (!metadata) {
    failures.push(`${label}: ${rel(file)} has invalid or missing YAML frontmatter`);
    return;
  }
  if (metadata.name !== expectedName) {
    failures.push(
      `${label}: ${rel(file)} name must be "${expectedName}", found "${metadata.name ?? ''}"`,
    );
  }
  if (!metadata.description) {
    failures.push(`${label}: ${rel(file)} needs a non-empty description`);
  }
}

function repoFiles() {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    failures.push(`could not enumerate repository files: ${result.stderr.trim()}`);
    return [];
  }
  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, '/'))
    .filter((file) => existsSync(absolute(file)));
}

function directChildrenWithFile(dir, filename) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(dir, entry.name, filename)))
    .map((entry) => entry.name);
}

function configuredInstructionLimit() {
  const config = path.join(ROOT, '.codex', 'config.toml');
  if (!existsSync(config)) return DEFAULT_PROJECT_DOC_MAX_BYTES;
  const match = text(config).match(/^\s*project_doc_max_bytes\s*=\s*(\d+)\s*$/m);
  if (!match) {
    failures.push(
      '.codex/config.toml must declare numeric project_doc_max_bytes for the checked instruction budget',
    );
    return DEFAULT_PROJECT_DOC_MAX_BYTES;
  }
  return Number(match[1]);
}

function isDirectoryAncestor(ancestor, candidate) {
  const relative = path.relative(ancestor, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// Reporting these on a GREEN run is the point: a chain three hundred bytes under the budget is
// indistinguishable from a comfortable one unless the number is printed, and the ratchet in
// .codex/config.toml only ever moves DOWN - so "lower the limit until it fails" is not an
// available way to discover headroom.
const CHAIN_REPORT_COUNT = 3;
const CHAIN_TIGHT_FRACTION = 0.8;

/**
 * The reserve: how much room a chain must keep, in BYTES, or the build fails.
 *
 * This gate deliberately does NOT fire on a percentage of the limit, because
 * project_doc_max_bytes is a ratchet that only goes down, and a percentage trigger punishes the
 * one move it exists to reward. Measured 2026-09-03, and the two halves are separate: cutting
 * 11,343 bytes out of src/components/wizard's chain took it 99.7% -> 89.5%, and then BANKING
 * 2,000 of those bytes in the ceiling (112,000 -> 110,000) took it back UP to 91.2% with nothing
 * written. That second step is the problem - every ratchet from here makes every chain's
 * percentage worse, so a percentage gate creeps toward the whole repository as contracts get
 * tidier. A reserve in bytes is the same size whatever the ceiling is, and it measures the thing
 * that actually matters: how much a contract can still grow before the next session cannot land
 * its paragraph.
 *
 * 4 KB, because the number is squeezed from both sides. Much below it the gate fires so late that
 * tripping it and breaking the chain are the same event - 99% of 110,000 leaves 1,100 bytes, about
 * four paragraphs, so the author who trips it has no room to work in. Above 9,708 it fires TODAY
 * on src/components/wizard, and well before that it leaves that chain too little to grow into:
 * the 2026-09-03 staleness pass found no lossless cut left in it, so a reserve of 8 KB would hand
 * it 1.7 KB of room and recreate the 365-byte wall the headroom work just removed. 4,096 leaves it
 * 5,612 bytes of honest growth and still refuses a future ratchet that would set the ceiling
 * within 4 KB of a live chain.
 *
 * The 80% report below stays a percentage, and stays advisory. It answers a different question -
 * what share of the budget one area is claiming - and it always fires first, because the reserve
 * sits above the warning line for any limit over 5x the reserve (20,480; the configured limit is
 * 110,000 and the fallback default 32,768).
 */
const CHAIN_MIN_FREE_BYTES = 4096;
// The advice is the same whichever way a chain ran out of room, so it is written once. Both moves
// are RELOCATIONS - the rules keep firing where they are read, which is what makes them free
// (docs/AGENT_WORKFLOWS.md, "Instruction size"). Deleting a live rule is not on the list.
const CHAIN_OVERFLOW_ADVICE =
  'Two ways out: move REFERENCE material - what a session looks up, not what fires while it ' +
  'edits - behind a pointer into docs/, or SPLIT the contract so SIBLING directories stop paying ' +
  "for each other's rules. Raising project_doc_max_bytes is not one of them: it is a ratchet that " +
  'only goes down, and the header in .codex/config.toml says why.';
const chainUsage = [];

function checkInstructionChains(agentsFiles) {
  const limit = configuredInstructionLimit();
  for (const leaf of agentsFiles) {
    const leafDir = path.dirname(leaf);
    const chain = agentsFiles.filter((candidate) =>
      isDirectoryAncestor(path.dirname(candidate), leafDir),
    );
    // Biggest first: a failing chain is fixed where its bytes are, and the author reading the
    // message does not know which of the three files that is.
    const parts = chain
      .map((file) => ({ file: rel(file), bytes: chainBytes(file) }))
      .sort((a, b) => b.bytes - a.bytes);
    const bytes =
      parts.reduce((sum, part) => sum + part.bytes, 0) + Math.max(0, parts.length - 1) * 2;
    const headroom = limit - bytes;
    chainUsage.push({ leaf: rel(leaf), bytes, limit, headroom });
    if (headroom >= CHAIN_MIN_FREE_BYTES) continue;
    const inventory = parts.map((part) => `${part.file} (${part.bytes})`).join(' + ');
    const state =
      headroom < 0
        ? `is ${bytes} bytes, ${-headroom} OVER project_doc_max_bytes=${limit}`
        : `has ${headroom} bytes free of project_doc_max_bytes=${limit}, inside the ` +
          `${CHAIN_MIN_FREE_BYTES}-byte reserve`;
    failures.push(
      `Codex instruction chain ending at ${rel(leaf)} ${state}. The chain is ${inventory}, so ` +
        `${parts[0].file} is where the bytes are. ${CHAIN_OVERFLOW_ADVICE}`,
    );
  }
}

function reportChainHeadroom() {
  if (chainUsage.length === 0) return;
  const ranked = [...chainUsage].sort((a, b) => a.headroom - b.headroom);
  const tight = ranked.filter((chain) => chain.bytes > chain.limit * CHAIN_TIGHT_FRACTION);
  const shown = ranked.slice(0, Math.max(CHAIN_REPORT_COUNT, tight.length));
  console.log(
    `Tightest instruction chain(s) against project_doc_max_bytes=${shown[0].limit}, which FAILS ` +
      `the build below ${CHAIN_MIN_FREE_BYTES} bytes free (${chainUsage.length} chain(s) checked):`,
  );
  for (const chain of shown) {
    const percent = ((chain.bytes / chain.limit) * 100).toFixed(1);
    const flag = chain.bytes > chain.limit * CHAIN_TIGHT_FRACTION ? '  <-- near the limit' : '';
    console.log(
      `  - ${chain.leaf}: ${chain.bytes} bytes used, ${chain.headroom} free (${percent}%)${flag}`,
    );
  }
}

// A MODULAR workflow is one canonical file plus a sibling directory of modules it links to:
// .agent-workflows/<name>.md is the always-loaded core, .agent-workflows/<name>/*.md are loaded
// only when the core's routing table sends a session there. The core carries a hard LINE LIMIT,
// because a budget nothing measures is the failure this shape was built to fix - the orchestrator
// contract reached 924 lines under a rule that said every wave should improve it and nothing that
// said what to cut (2026-09-01). Everything below treats the core and its modules as ONE contract:
// markers and script references may live in either, so neither can be weakened by moving text.
const MODULAR_WORKFLOW_LINE_LIMITS = new Map([['orchestrator', 200]]);
// The COMMON PATH: the core plus every module the routing table marks *every plan*, which is what
// an ordinary invocation actually loads. The 2026-09-01 split reported an 82% cut by counting the
// core alone while four modules loaded beside it every time; this is the honest number, and it
// only ratchets DOWN - raise it and say why in the commit.
const MODULAR_WORKFLOW_PATH_LIMITS = new Map([['orchestrator', 640]]);
const EVERY_PLAN_MARK = '*every plan*';

function workflowModuleFiles(name) {
  const dir = absolute(`.agent-workflows/${name}`);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => path.join(dir, file));
}

function checkWorkflowScriptReferences(workflowFile, moduleFiles) {
  for (const file of [workflowFile, ...moduleFiles]) {
    const content = text(file);
    const references = [...content.matchAll(/`(scripts\/[A-Za-z0-9._/-]+)/g)].map(
      (match) => match[1],
    );
    for (const reference of new Set(references)) {
      if (!existsSync(absolute(reference))) {
        failures.push(`${rel(file)} references missing ${reference}`);
      }
    }
    // An `npm run <script>` a contract names must exist: a stale name is a cached fact that
    // reads as an instruction (an incident entry named the wrong gate for a day, 2026-09-02).
    const scripts = [...content.matchAll(/`npm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
    for (const script of new Set(scripts)) {
      if (!PACKAGE_SCRIPTS.has(script)) {
        failures.push(`${rel(file)} names \`npm run ${script}\`, which package.json does not define`);
      }
    }
  }
}

const PACKAGE_SCRIPTS = new Set(Object.keys(JSON.parse(text(absolute('package.json'))).scripts ?? {}));

/**
 * An agent a contract names must EXIST, because the fallback is silent.
 *
 * A wave row is launched by naming the agent definition that carries its model AND its reasoning
 * effort; a launch that names a definition Claude Code cannot find falls back to the session's own
 * effort and says nothing, so the row runs at a rung nobody chose and the plan still reads as
 * honoured. Every `` `wave-row…` `` the orchestrator contract mentions is checked against
 * `.claude/agents/`.
 *
 * What is deliberately NOT checked: the VALUES of `model:`, `effort:` and `isolation:`. Those are
 * harness capabilities that change with the installed build, and a gate holding a copy of them
 * would be one more cached fact going stale - the exact defect this file was extended to prevent.
 * Structure is checked; capability is left to the harness that owns it.
 */
function readAgentDefinitions() {
  const dir = absolute('.claude/agents');
  const defined = new Map();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return defined;
  for (const file of readdirSync(dir).filter((entry) => entry.endsWith('.md'))) {
    const content = text(path.join(dir, file));
    const declared = /^---\r?\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(content)?.[1];
    const slug = file.slice(0, -'.md'.length);
    if (!declared) {
      failures.push(`.claude/agents/${file} has no \`name:\` in its frontmatter, so nothing can address it`);
      continue;
    }
    // The name is the address and the filename is how a person finds it; when they disagree,
    // one of the two is wrong and only the reader ever notices.
    if (declared !== slug) {
      failures.push(`.claude/agents/${file} declares name "${declared}", which its filename does not match`);
    }
    if (!/^---\r?\n[\s\S]*?^description:\s*\S/m.test(content)) {
      failures.push(`.claude/agents/${file} has no \`description:\`, so nothing can tell when to use it`);
    }
    defined.set(declared, file);
  }
  return defined;
}

// Read ONCE. The reference check below runs per workflow, and a directory scanned per workflow
// would report each malformed definition fifteen times.
const AGENT_DEFINITIONS = readAgentDefinitions();

function checkNamedAgents(workflowFile, moduleFiles) {
  const defined = AGENT_DEFINITIONS;
  for (const file of [workflowFile, ...moduleFiles]) {
    for (const name of new Set([...text(file).matchAll(/`(wave-row[a-z0-9-]*)`/g)].map((match) => match[1]))) {
      if (!defined.has(name)) {
        failures.push(`${rel(file)} names the agent \`${name}\`, which .claude/agents/ does not define`);
      }
    }
  }
}

/** Modules that RECORD rather than BIND. A marker may not resolve here - see below. */
const NARRATIVE_MODULES = new Set(['incidents.md']);

function checkCriticalWorkflowContract(name, workflowFile, moduleFiles) {
  const files = [workflowFile, ...moduleFiles];
  // One contract, however many files it is spread across: a marker satisfied by a module is
  // satisfied, so splitting the file cannot silently drop a pinned rule - and moving a rule
  // between modules needs no gate edit.
  //
  // EXCEPT a narrative module, which describes rules instead of carrying them. An incident
  // write-up quotes the rule it is about, and a quote is byte-identical to the thing pinned - so
  // searching it lets a marker satisfy ITSELF, and the rule can then be deleted from the contract
  // with a green build. Measured 2026-09-08, on the marker added that day to stop exactly this
  // class of drift: both markers of that pair resolved in the write-up alone. Excluding these
  // files is the fix; quoting a pinned sentence in one is then harmless.
  const searched = files.filter((file) => !NARRATIVE_MODULES.has(path.basename(file)));
  const normalizedContent = searched
    .map((file) => text(file))
    .join('\n')
    .replace(/\s+/g, ' ');
  const where = moduleFiles.length > 0 ? `${rel(workflowFile)} (+ its modules)` : rel(workflowFile);
  for (const marker of CRITICAL_WORKFLOW_MARKERS.get(name) ?? []) {
    const normalizedMarker = marker.replace(/\s+/g, ' ');
    if (!normalizedContent.includes(normalizedMarker)) {
      failures.push(`${where} is missing critical contract marker "${normalizedMarker}"`);
    }
  }
  for (const file of files) {
    if (/C:\\Users\\[^\\]+\\\.claude\\/i.test(text(file))) {
      failures.push(
        `${rel(file)} references tool-private memory under a user-specific home directory`,
      );
    }
  }
}

// The three ways a modular contract rots back into one file with extra steps: the core grows past
// its budget, a module nothing links to goes stale unread, and a link points at a module that was
// renamed or never written. All three are cheap to measure and invisible to a reader.
function checkWorkflowModules(name, workflowFile, moduleFiles) {
  const limit = MODULAR_WORKFLOW_LINE_LIMITS.get(name);
  if (limit === undefined) return;
  // The summary below reports "all linked", so it may only be printed once nothing in this
  // function has complained - a status line that stays reassuring while the gate is failing is
  // how a reader learns to skip it.
  const failuresBefore = failures.length;
  const coreLines = text(workflowFile).split('\n').length;
  if (coreLines > limit) {
    failures.push(
      `${rel(workflowFile)} is ${coreLines} lines, over its always-loaded limit of ${limit} - ` +
        `move a section into .agent-workflows/${name}/ and link it from the routing table`,
    );
  }
  if (moduleFiles.length === 0) {
    failures.push(`${rel(workflowFile)} declares a module budget but has no .agent-workflows/${name}/ modules`);
    return;
  }
  const core = text(workflowFile);
  const linked = new Set(
    [...core.matchAll(new RegExp(`${name}/([A-Za-z0-9._-]+\\.md)`, 'g'))].map((match) => match[1]),
  );
  for (const file of moduleFiles) {
    if (!linked.has(path.basename(file))) {
      failures.push(
        `${rel(file)} is not linked from ${rel(workflowFile)} - an unrouted module is never read`,
      );
    }
  }
  const present = new Set(moduleFiles.map((file) => path.basename(file)));
  for (const target of linked) {
    if (!present.has(target)) {
      failures.push(`${rel(workflowFile)} routes to .agent-workflows/${name}/${target}, which does not exist`);
    }
  }
  // The common path: every routing-table row carrying the every-plan mark names a module that
  // loads on every invocation, so its lines are always-loaded context as much as the core's.
  const everyPlan = new Set(
    core
      .split('\n')
      .filter((line) => line.includes(EVERY_PLAN_MARK))
      .flatMap((line) => [...line.matchAll(new RegExp(`${name}/([A-Za-z0-9._-]+\\.md)`, 'g'))].map((match) => match[1])),
  );
  const commonPath = [...everyPlan]
    .filter((target) => present.has(target))
    .reduce((sum, target) => sum + lineCount(path.join(absolute(`.agent-workflows/${name}`), target)), coreLines);
  const pathLimit = MODULAR_WORKFLOW_PATH_LIMITS.get(name);
  // A budget over an empty set is a budget over nothing: if the routing table stops carrying the
  // mark (a reworded row, dropped emphasis), the sum collapses to the core and the gate would keep
  // printing a clean line while counting none of the modules it was built to count.
  if (pathLimit !== undefined && everyPlan.size === 0) {
    failures.push(
      `${rel(workflowFile)} declares a common-path budget but no routing-table row carries the ` +
        `"${EVERY_PLAN_MARK}" mark - the modules every invocation loads must be marked, or the budget counts nothing`,
    );
  }
  if (pathLimit !== undefined && commonPath > pathLimit) {
    failures.push(
      `${rel(workflowFile)} plus its every-plan modules is ${commonPath} lines, over the common-path ` +
        `budget of ${pathLimit} - shorten the common path, or move a rule into a module that loads on a branch`,
    );
  }
  if (failures.length === failuresBefore) {
    console.log(
      `Modular workflow ${name}: core ${coreLines}/${limit} lines, ` +
        `${moduleFiles.length} module(s), all linked; common path ${commonPath}` +
        `${pathLimit === undefined ? '' : `/${pathLimit}`} lines (core + ${everyPlan.size} every-plan module(s)).`,
    );
  }
}

const files = repoFiles();
const fileSet = new Set(files);

function checkRepositoryFile(file, label) {
  const relative = rel(file);
  if (!fileSet.has(relative)) {
    failures.push(`${label}: ${relative} is ignored or absent from the repository file set`);
  }
}

// 1. Every HAND-WRITTEN repository AGENTS.md has a thin sibling CLAUDE.md importing it.
//
// A contract compiled from the rule store (scripts/compile-contracts.mjs) has no sibling and must
// not grow one: Claude Code already loads the same rules from `.claude/rules/` at the moment it
// reads a file they scope to, so a wrapper here would charge every Claude session for them twice.
// That saving is the whole point of migrating an area - the pair rule holds for the prose files
// that have not migrated yet, which is still nearly all of them.
const agentsFiles = findFilesNamed(ROOT, 'AGENTS.md').filter(
  (file) => rel(file) === 'AGENTS.md' || !rel(file).startsWith('.'),
);
measured(agentsFiles.length, 'AGENTS.md contracts');
const isGeneratedContract = (file) => existsSync(file) && text(file).includes(GENERATED_MARKER);
for (const agentsFile of agentsFiles) {
  checkRepositoryFile(agentsFile, 'authoritative project instructions');
  const claudeFile = path.join(path.dirname(agentsFile), 'CLAUDE.md');
  if (isGeneratedContract(agentsFile)) {
    if (existsSync(claudeFile)) {
      failures.push(
        `${rel(claudeFile)} sits beside a GENERATED contract. Claude Code loads those rules from ` +
          '.claude/rules/ already, so this wrapper makes every Claude session pay for them twice - ' +
          'delete it.',
      );
    }
    continue;
  }
  checkRepositoryFile(claudeFile, 'Claude import');
  checkThinWrapper(claudeFile, '@AGENTS.md', 'AGENTS.md/CLAUDE.md pair');
}
checkInstructionChains(agentsFiles);
checkRepositoryFile(absolute('.codex/config.toml'), 'Codex project configuration');

// 1b. Every template category carries its own contract.
//
// `src/templates/AGENTS.md` is read in full by every session touching any template, so a
// category's rules belong beside its code. That was prose with nothing behind it until
// 2026-09-02, and it was already false: `streamNotifications/` had been a registered category
// for months with no contract and no row in the parent's index, so the rule read as satisfied
// while the one category it had never described went on collecting its lessons nowhere. A rule
// this file states about itself is worth a gate; `shared/` is the deliberate exception, holding
// assembler pieces whose rules bind in the CATEGORIES that call them rather than where they live.
const TEMPLATE_DIRS_WITHOUT_CONTRACT = new Set(['shared']);
const templatesRoot = path.join(ROOT, 'src', 'templates');
if (existsSync(templatesRoot)) {
  for (const entry of readdirSync(templatesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (TEMPLATE_DIRS_WITHOUT_CONTRACT.has(entry.name)) continue;
    if (existsSync(path.join(templatesRoot, entry.name, 'AGENTS.md'))) continue;
    failures.push(
      `template category src/templates/${entry.name}/ has no AGENTS.md - a category's rules ` +
        'belong beside its code, not in the parent every template session loads ' +
        '(docs/AGENT_WORKFLOWS.md, "Instruction size")',
    );
  }
}

// 2. Every canonical workflow has one thin Claude adapter and one valid Codex skill.
const workflowsDir = path.join(ROOT, '.agent-workflows');
const workflowNames = existsSync(workflowsDir)
  ? readdirSync(workflowsDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -3))
      .sort()
  : [];
measured(workflowNames.length, 'workflow definitions');

// A TABLE KEYED BY NAME IS A GATE THAT STOPS FIRING WHEN THE NAME MOVES. Each of these four is
// consulted as `TABLE.get(name)` while walking the workflows below, and a miss is a `?? []` or an
// early `return` - so renaming `orchestrator.md` would drop its critical markers, its 200-line
// core limit and its 640-byte common-path budget in one edit, and this check would print OK.
// Counting the workflows does not catch that: the population is intact, it is the lookup that
// stopped resolving. A key naming no workflow is a stale declaration, exactly like a `guards:`
// glob that matches no file.
const declaredWorkflows = new Set(workflowNames);
for (const [table, keys] of [
  ['CRITICAL_WORKFLOW_MARKERS', CRITICAL_WORKFLOW_MARKERS.keys()],
  ['MODULAR_WORKFLOW_LINE_LIMITS', MODULAR_WORKFLOW_LINE_LIMITS.keys()],
  ['MODULAR_WORKFLOW_PATH_LIMITS', MODULAR_WORKFLOW_PATH_LIMITS.keys()],
  ['EXPLICIT_ONLY_WORKFLOWS', EXPLICIT_ONLY_WORKFLOWS.values()],
]) {
  for (const key of keys) {
    if (declaredWorkflows.has(key)) continue;
    failures.push(
      `${table} has a row for "${key}", and .agent-workflows/${key}.md does not exist - `
      + 'the workflow was renamed or removed, and everything that row enforces stopped applying silently',
    );
  }
}

for (const name of workflowNames) {
  const canonical = `.agent-workflows/${name}.md`;
  const canonicalFile = absolute(canonical);
  const claudeCommand = absolute(`.claude/commands/${name}.md`);
  const claudeSkill = absolute(`.claude/skills/${name}/SKILL.md`);
  const codexSkill = absolute(`.agents/skills/${name}/SKILL.md`);
  const hasClaudeCommand = existsSync(claudeCommand);
  const hasClaudeSkill = existsSync(claudeSkill);

  checkRepositoryFile(canonicalFile, 'canonical workflow');
  if (!hasClaudeCommand && !hasClaudeSkill) {
    failures.push(`${canonical}: missing Claude command or skill adapter`);
  }
  if (hasClaudeCommand) {
    checkRepositoryFile(claudeCommand, 'Claude command adapter');
    checkThinWrapper(claudeCommand, canonical, 'Claude command adapter');
    const metadata = parseFrontmatter(claudeCommand);
    if (!metadata?.description) {
      failures.push(`Claude command adapter: ${rel(claudeCommand)} needs a description`);
    }
  }
  if (hasClaudeSkill) {
    checkRepositoryFile(claudeSkill, 'Claude skill adapter');
    checkThinWrapper(claudeSkill, canonical, 'Claude skill adapter');
    checkSkillMetadata(claudeSkill, name, 'Claude skill adapter');
  }

  checkRepositoryFile(codexSkill, 'Codex skill adapter');
  checkThinWrapper(codexSkill, canonical, 'Codex skill adapter');
  if (existsSync(codexSkill)) checkSkillMetadata(codexSkill, name, 'Codex skill adapter');
  const moduleFiles = workflowModuleFiles(name);
  for (const moduleFile of moduleFiles) checkRepositoryFile(moduleFile, 'workflow module');
  checkWorkflowScriptReferences(canonicalFile, moduleFiles);
  checkNamedAgents(canonicalFile, moduleFiles);
  checkCriticalWorkflowContract(name, canonicalFile, moduleFiles);
  checkWorkflowModules(name, canonicalFile, moduleFiles);

  if (EXPLICIT_ONLY_WORKFLOWS.has(name)) {
    const claudeAdapter = hasClaudeCommand ? claudeCommand : claudeSkill;
    const claudeMetadata = parseFrontmatter(claudeAdapter);
    if (claudeMetadata?.['disable-model-invocation'] !== 'true') {
      failures.push(
        `${rel(claudeAdapter)} must set disable-model-invocation: true for destructive workflow ${name}`,
      );
    }
    const openAiMetadata = absolute(`.agents/skills/${name}/agents/openai.yaml`);
    checkRepositoryFile(openAiMetadata, 'Codex explicit-invocation metadata');
    if (
      !existsSync(openAiMetadata) ||
      !/^\s*allow_implicit_invocation:\s*false\s*$/m.test(text(openAiMetadata))
    ) {
      failures.push(
        `${rel(openAiMetadata)} must set policy.allow_implicit_invocation to false`,
      );
    }
  }
}

// 2b. Every alias resolves to a real workflow and has one thin adapter per tool.
for (const [alias, target] of WORKFLOW_ALIASES) {
  const canonical = `.agent-workflows/${target}.md`;
  if (!workflowNames.includes(target)) {
    failures.push(`alias ${alias}: no canonical workflow ${canonical} to alias`);
    continue;
  }
  if (workflowNames.includes(alias)) {
    failures.push(`alias ${alias}: shadows the canonical workflow .agent-workflows/${alias}.md`);
  }
  if (EXPLICIT_ONLY_WORKFLOWS.has(target)) {
    failures.push(`alias ${alias}: ${target} is destructive and must stay explicit-only, not aliased`);
  }

  const claudeCommand = absolute(`.claude/commands/${alias}.md`);
  checkRepositoryFile(claudeCommand, `alias ${alias}: Claude command adapter`);
  checkThinWrapper(claudeCommand, canonical, `alias ${alias}: Claude command adapter`);
  if (existsSync(claudeCommand) && !parseFrontmatter(claudeCommand)?.description) {
    failures.push(`alias ${alias}: ${rel(claudeCommand)} needs a description`);
  }

  const codexSkill = absolute(`.agents/skills/${alias}/SKILL.md`);
  checkRepositoryFile(codexSkill, `alias ${alias}: Codex skill adapter`);
  checkThinWrapper(codexSkill, canonical, `alias ${alias}: Codex skill adapter`);
  if (existsSync(codexSkill)) checkSkillMetadata(codexSkill, alias, `alias ${alias}: Codex skill adapter`);
}

// 3. Reverse mapping: no repository-owned adapter silently escapes the canonical workflow.
const claudeCommands = files
  .filter((file) => /^\.claude\/commands\/[^/]+\.md$/.test(file))
  .map((file) => path.basename(file, '.md'));
const claudeSkills = files
  .filter((file) => /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(file))
  .map((file) => file.split('/')[2]);
const codexSkills = directChildrenWithFile(path.join(ROOT, '.agents', 'skills'), 'SKILL.md');

for (const name of new Set([...claudeCommands, ...claudeSkills])) {
  if (workflowNames.includes(name)) continue;
  if (WORKFLOW_ALIASES.has(name)) continue;
  if (CLAUDE_ONLY_EXCEPTIONS.has(name)) continue;
  failures.push(
    `Claude adapter ${name} has no .agent-workflows/${name}.md and is not an explicit exception`,
  );
}
for (const [name, reason] of CLAUDE_ONLY_EXCEPTIONS) {
  if (![...claudeCommands, ...claudeSkills].includes(name)) {
    failures.push(`documented Claude-only exception ${name} is missing (${reason})`);
  }
}
for (const name of codexSkills) {
  if (WORKFLOW_ALIASES.has(name)) continue;
  if (!workflowNames.includes(name)) {
    failures.push(
      `.agents/skills/${name}/SKILL.md has no matching .agent-workflows/${name}.md`,
    );
  }
}

// 4. Legacy repository Codex skills must not return and create duplicate registrations.
if (files.some((file) => file.startsWith('.codex/skills/'))) {
  failures.push('legacy .codex/skills files found; repository skills belong in .agents/skills');
}

// Ensure the architecture document itself remains committed/discoverable.
if (!fileSet.has('docs/AGENT_WORKFLOWS.md')) {
  failures.push('missing docs/AGENT_WORKFLOWS.md');
}

if (failures.length > 0) {
  // The ranked table BEFORE the failures, and on the failing path too. Running out of room is now
  // the designed failure, and the one thing the author needs and the message cannot carry is where
  // the other 51 chains sit - trimming the root file to clear one chain moves all of them.
  reportChainHeadroom();
  console.error(`\nShared-instructions check failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nSee docs/AGENT_WORKFLOWS.md for the shared-instruction contract.\n');
  process.exit(1);
}

console.log(
  `Shared instructions OK: ${agentsFiles.length} AGENTS.md/CLAUDE.md pair(s), ` +
    `${workflowNames.length} Claude/Codex workflow pair(s), ${WORKFLOW_ALIASES.size} alias(es), ` +
    `${CLAUDE_ONLY_EXCEPTIONS.size} documented tool-specific exception(s).`,
);
reportChainHeadroom();
