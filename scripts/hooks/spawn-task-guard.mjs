// PreToolUse guard for the background-task chip (`mcp__ccd_session__spawn_task`): a session that
// notices something worth fixing does it, or files it, instead of handing it back to the owner as
// a question.
//
// WHY THIS IS A HOOK AND NOT A SENTENCE SOMEWHERE. The rule already existed three times over -
// the owner said it on 2026-08-30 ("Autonomous work less Mirko!"), `launch.md` says a chip is
// minted only when starting the work is genuinely his call, and `collisions.md` says work a wave
// surfaces becomes a `docs/backlog/` file and never a chip. It still did not fire, because it
// fires at a MOMENT: the instant a session reaches for the chip tool. `docs/MISTAKE_TRIGGERS.md`
// is the routing rule and this is what it prescribes - a lesson with a tool shape belongs at the
// tool call. It passes all four tests there: the call's own arguments decide it, no facts beyond
// them are needed, the failure is silent (an unstarted chip looks exactly like tracked work until
// somebody asks weeks later, which is what happened on 2026-09-02), and there are two sanctioned
// alternatives the message names.
//
// IT REFUSES RATHER THAN WARNS, which `docs/MISTAKE_TRIGGERS.md` allows only for an EXACT check.
// It is exact for an unusual reason: there is no legitimate reading of this tool that the rule
// wants to permit silently. Every honest use is one the session can declare, and declaring it is
// one line. A PreToolUse hook also cannot warn - an allowed call's reason reaches the user, not
// the model - so "advise and continue" was never on the menu.
//
// THE CARVE-OUT. `launch.md` keeps one legitimate chip: when STARTING the work is the owner's
// decision rather than the session's - real money, a model pick worth his judgement, a scope call.
// The session declares that in the prompt with an `OWNER-DECISION: <reason>` line and the call goes
// through. It is deliberately a marker and not a heuristic: no hook can tell whether the reason is
// TRUE, so the useful thing to enforce is that a reason was stated and recorded, which the chip
// then carries to whoever reads it. A rule with no legal escape gets routed around instead of
// followed. An empty marker is refused - the reason is the whole point of it.
//
// TURNING IT OFF. `NOACG_ALLOW_TASK_CHIPS=1` in the environment disables it for one session or one
// machine, the same shape as `NOACG_ALLOW_PARALLEL_E2E=1`. To retire it everywhere, delete its
// `PreToolUse` entry from `.claude/settings.json`, which is tracked, so the change lands like any
// other. If it turns out to refuse something legitimate, widen it the way this repo widens guards:
// add the refused call to `spawn-task-guard.test.mjs` with the date and what it cost, then make it
// pass.
//
// NOTHING IS EXPORTED, deliberately. A hook reads stdin at module top level, so importing one to
// test it hangs. `spawn-task-guard.test.mjs` therefore spawns this file and pipes it real event
// JSON, which is what `docs/MISTAKE_TRIGGERS.md` asks for anyway - it verifies the stdin plumbing,
// the matcher and the message in one go, rather than a pure function the hook might never reach.
//
// COST: nothing measurable. It runs only on chip calls, which are rare, and touches no git, no
// filesystem and no network - two string tests against the tool arguments.

import { readHookInput, deny } from './lib.mjs';

const SPAWN_TASK_TOOL = 'mcp__ccd_session__spawn_task';

// The declaration, and the reason it must carry.
//
// ANCHORED TO THE START OF A LINE, which is not fussiness. Unanchored, this guard handed out its
// own bypass: the refusal below prints the template `OWNER-DECISION: <why ...>`, so a session that
// got refused and pasted the template back was let straight through, and any mid-sentence "I would
// call this an OWNER-DECISION: scope thing" passed too. A declaration is a line the caller wrote
// on purpose, so it has to look like one - which is what the refusal message already promised.
//
// `[^\S\r\n]*` is "spaces and tabs but not a newline", so a marker whose reason sits on the NEXT
// line reads as empty and is refused, rather than silently swallowing that line as a justification.
const OWNER_DECISION = /^[^\S\r\n]*OWNER-DECISION:[^\S\r\n]*([^\r\n]*)$/m;

/**
 * Is this a reason somebody actually wrote, rather than the shape of one?
 *
 * The placeholder test exists for the same reason as the anchor: the refusal quotes a template,
 * and a template pasted back is not a stated reason. Anything else counts - no hook can judge
 * whether a reason is TRUE, and pretending to would just teach people longer placeholders.
 */
function isStatedReason(reason) {
  const trimmed = reason.trim();
  return trimmed.length > 0 && !/^<[^>]*>$/.test(trimmed);
}

const REFUSAL = `A background-task chip hands work back to the owner as a question, and this repo does not do
that: a defect you noticed is STARTED, not offered (owner, 2026-08-30 - "Autonomous work less
Mirko!"). Drop the chip and take one of these two routes instead.

  IN SCOPE      Fix it now, on this branch. Mention it in the commit message.

  OUT OF SCOPE  File it as docs/backlog/<slug>.md - one file per idea, "## Why" mandatory, the
                shape is in docs/backlog/README.md. The orchestrator plans from that folder, so
                a filed idea is tracked; a chip nobody clicks is lost.

THE ONE EXCEPTION. A chip is right when STARTING the work is genuinely the owner's call rather
than yours - it costs real money, it needs a model pick worth his judgement, or it is a scope
decision only he can make. Say which, in the prompt, on a line of its own:

  OWNER-DECISION: <why this start is his call and not yours>

and this call goes through. Contract: .agent-workflows/orchestrator.md.
Guard: scripts/hooks/spawn-task-guard.mjs - its header says how to turn it off.`;

const EMPTY_REASON = `OWNER-DECISION: needs a reason you wrote, on the same line - not an empty marker, and not the
<...> placeholder from the template. It is the record of why STARTING this is the owner's call
(real money, a model pick worth his judgement, or a scope decision), and without it the line is
just this guard switched off. Write the reason out, for example:

  OWNER-DECISION: picks between two pricing shapes, and either one costs real money.

If you cannot finish that sentence, it is not his call: fix it on this branch, or file it as
docs/backlog/<slug>.md.`;

const input = await readHookInput();

// FAIL OPEN before anything is judged. A hook that cannot tell must not refuse: unreadable input,
// an event carrying no arguments to read, and the deliberate machine-wide override all mean
// "nothing to say".
if (!input) process.exit(0);
if (!input.tool_input || typeof input.tool_input !== 'object') process.exit(0);
if (process.env.NOACG_ALLOW_TASK_CHIPS === '1') process.exit(0);

// A DIFFERENT tool, though, is a matcher problem rather than a fact this hook is missing, so it
// only stands down when the event NAMES a tool that is not the chip. A missing `tool_name` is
// deliberately not treated as a reason to stand down: the matcher in .claude/settings.json is an
// exact one, so this file runs on chip calls and nothing else, and reading the field's absence as
// "allow" would silently retire the guard the day that field is renamed. Refusing something the
// matcher should never have sent here is the cheaper mistake, and it announces itself.
if (typeof input.tool_name === 'string' && input.tool_name !== SPAWN_TASK_TOOL) process.exit(0);

// The two free-text fields a session writes. The message asks for the prompt, and the tldr is
// accepted too: the marker is a deliberate act wherever it lands, so refusing one that sits a
// field away buys nothing and costs a false refusal - and over-refusal is the expensive direction.
//
// A STATED reason wins over a bare marker anywhere else. Taking the first field that matched at
// all made a bare `OWNER-DECISION:` in the prompt hide a properly written one in the tldr, which
// is precisely the false refusal the paragraph above says this tolerance exists to avoid.
const markers = [input.tool_input.prompt, input.tool_input.tldr]
  .filter((field) => typeof field === 'string')
  .map((field) => field.match(OWNER_DECISION))
  .filter(Boolean);

if (markers.length === 0) deny(REFUSAL);
if (!markers.some((marker) => isStatedReason(marker[1]))) deny(EMPTY_REASON);

process.exit(0);
