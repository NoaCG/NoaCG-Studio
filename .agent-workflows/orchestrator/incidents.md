# Incidents - the evidence behind the rules

Every rule in this system was paid for. The rule keeps its why in one clause; the story lives
here, dated, so a session planning a wave does not carry it and a session about to CHANGE a rule
can find it. **Append only. Never delete an entry** - a rule that is repealed keeps its incident,
because the next person to propose the same rule needs to know it was tried.

Cite an entry from a rule by its heading, e.g. *(evidence: `incidents.md` "the copy gate landed
mid-wave")*.

---

## the copy gate landed mid-wave

**2026-08-26.** A session added a build gate and it landed 35 minutes into the wave. Every
sibling's next merge of `main` then brought a gate into their tree that did not exist when their
prompt was written, and two sibling sessions went silent on reds they could not have anticipated
and could not attribute. **Rule: A GATE LANDS ALONE** (core file; `collisions.md`). An allowlist
note in a prompt does not substitute - the builder may rightly choose a better design than the
planner named, and then the note is wrong too.

## the docs-index backlog item

**2026-08-30.** Session A filed `docs/backlog/docs-index-is-incomplete.md` about `docs/README.md`
while it was still editing that file. Four hours later the same defect went into session F's
prompt, read as unowned work. Both then held the file. **Two rules came out of it.** First: a
backlog item filed by a LIVE session is not free work - check who filed it and whether that
session is still live before turning it into a prompt (`collisions.md`).

Second, the collision ruling. A's change added a paragraph saying the docs map was incomplete;
F's completed the map and gated it. Merging them without a ruling would have shipped a false
statement, a graduated backlog item, and a gate failing MISSING on two docs only A creates. The
ruling was *"the completed, gated map wins: take theirs, keep my two new rows, delete my now-false
paragraph, delete the graduated backlog item"*. **A collision settled by whoever happens to merge
second, with no ruling from the plan, is how a clean merge produces a tree describing something
neither branch built.**

## the two classifier refusals

**2026-08-30.** Two refusals by the harness safety classifier, both correct in shape.

1. A row that would have built a `PreToolUse` auto-allow hook for `git push` was refused at
   launch. Spawning an autonomous agent to widen the machine's permission posture is exactly what
   that check exists to stop, and owner ratification does not reach it.
2. Two attempts to message a finished wave session, telling it to proceed past a `caution` merge
   verdict, were refused - on evidence that had already reduced the risk to one hunk in one
   markdown file.

**These are the two hard edges of the orchestrator's autonomy, and both are enforced by the
harness rather than by this contract**: widening the machine's permission posture, and overruling
a merge-safety verdict. A refused row is HELD, not dropped - it keeps its letter, its full prompt
goes in the wave-state file and in section 4, and the owner starts it himself. Never re-word a
prompt to get it past the classifier, and never hand it to a different session hoping it lands
differently (`launch.md`).

## the headless auth that died silently

**2026-08-28.** An expired OAuth killed the headless `claude -p` launch path with no visible
error, while the Agent-tool subagent path delivered both follow-ons that night. **Rule: the Agent
tool is the PRIMARY launch path; headless needs live CLI auth verified that day**
(`launch.md`).

## the fan-out that waited on notifications that could not arrive

**2026-08-29.** A wave session spawned its own research subagents and stalled twice waiting for
completion notifications. Those notifications route to the ORCHESTRATOR session, not to the
session that spawned them. **Rule: a prompt that sanctions a fan-out says to collect results via
FILES at agreed paths, never to wait on notifications** (`prompts.md`).

## the seven-hour hang that was not one

**2026-08-29.** A wave session was written up as having hung for seven hours on a permission
prompt nobody was awake to answer. It had not: it committed, ran a long blocking review leg,
integrated `main`, and ran a full nine-shard suite - hours of legitimate work, none of which moves
a branch tip. **A branch tip that has stopped moving is NOT the stall signal.** The transcript is:
a tool call still carrying no result is a session waiting, at that instant, on that call
(`night.md`, tick step 2).

## the phone that could not answer a prompt

**2026-08-30, owner, from his phone:** *"I didn't realize from my phone that there were rights
that had to be approved. I wish I can approve them from my phone or I need to leave bypass
permissions on."* He hit permission prompts he could not see or answer. **A wave session hanging
on one has not been observed** - the one night it was suspected is the entry above - so this is a
hazard to prevent, not an incident to remember. **Rule: plan inside the tracked allowlist, and
never plan around it by asking for bypass mode** (`collisions.md`, "The machine's limits"; the
visibility half is `launch.md`).

## the vanity rename

**2026-08-26.** A docs session was asked to remove a personal handle, did it to the letter, and
broke the documented CLI install path. The owner's own verdict: *"a vanity reason and not our true
reason to break the functionality"*. **Rule: THE WHY MUST BE TRUE, and function outranks
cosmetics** (`prompts.md`). When the asked change would break something that works, keep the
function, do the rest, and put the tension in the handoff.

## the three stacked pins

**2026-08-28.** One interactive session queued, committed more, and queued again - three landing
jobs from one branch, two of them burned as stale-pin refusals. **Rule: queue ONCE, at the true
end** (`prompts.md`).

## the branch that /check found nine issues on

**2026-09-01.** One branch, one day, one run of the check workflow: **nine real issues, eight
fixed, including a Windows-only path bug that was invisible locally and red on CI.** That is what
widened the rule from night-only (2026-08-30) to **every wave session, day or night**
(`prompts.md`). The carve-out stays honest rather than silent: a session out of time queues
without it and its handoff says `check: not run`.

## the landing path's two refusals

**2026-08-28.** Two separate landing failures the same night, both from the same class - the
landing path has preconditions the plan must check rather than assume.

1. An unplanned session parked the MAIN CHECKOUT on its own branch, and every landing of the wave
   refused with "main is checked out nowhere".
2. A closed session's worktree-less branch failed twice on the no-worktree rule, which only the
   human safe-merge flow carves around.

**Rule: verify both at plan time and on watch-loop ticks, and never assign a retry through a path
these rules make impossible** (`grounding.md`).

## the wave that starved the queue

**2026-08-26.** A wave where several sessions queued full catalog batteries at once drove free RAM
to 0.1 GB, with seven gate jobs waiting behind one suite. **Rule: RAM is a shared resource like
the browser slot and the merge queue; the plan names which sessions carry heavy batteries and
staggers or trims them** (`collisions.md`).

## the sweep that measured the wrong tree

**2026-08-29, re-sighted 2026-09-01.** An SVG import sweep ran from a linked worktree and silently
measured `main`'s importer rather than the branch's, because the preview tooling resolves to the
session's own checkout. Neither run noticed from inside. This is the "green gate on the wrong
tree" shape the root `AGENTS.md` calls worse than a red one. Recorded here because it is the
standing argument for the confirmation habit in general: **a measurement whose subject was never
verified is not evidence.**

## the row that named the wrong step

**2026-09-01.** A prompt about the SVG drop zone named the images step beside it. The path was
plausible and never grepped. Because `TOUCHES` is section 2's collision instrument, two rows
called disjoint on unconfirmed paths are not disjoint - they are unanalysed. **Rule: one
confirmation PASS over the finished prompts before the plan ships, and a correction sends the rows
it touches back through section 2** (`prompts.md`). It is a pass rather than a virtue because the
failure was care running out at the end of a long grounding read, not ignorance of care.

## the empty branch that read as landed

**2026-09-01, hours after the follow-on trigger rule was written.** Row H had been launched and
had committed nothing, so its branch tip WAS `origin/main` - and
`git merge-base --is-ancestor claude/h-orchestration-guardrails origin/main` returned true. Run by
hand as a cross-check, that command reported a session which had done no work as having landed.

It did not bite: the loop's own instrument was right, because `wave-tick.mjs` emits `LANDED` on the
TRANSITION (a branch it previously saw ahead of main, now contained) rather than on containment
alone. The contract's prose was the half that was wrong, and prose is what a session follows when
it checks a trigger by hand at 03:00. **A landing is containment for a branch previously seen
ahead of main; containment on its own means landed OR empty and cannot tell you which**
(`night.md`).

Worth keeping for the general shape as much as the case: the fallback a session reaches for when
it distrusts an instrument needs the same scrutiny as the instrument. This one was adopted the same
night precisely because `landingStateFor` was misreporting landings, and it had its own defect.

## the file that reached 924 lines

**2026-09-01, owner:** *"The current SKILL.md became far too large (~915 lines), which means we
designed it incorrectly."* The old contract obeyed "every wave improves this file" and had no
counterweight, so every lesson added text and none removed it. The rebuild split it into a
200-line always-loaded core plus phase-loaded modules, moved narrative evidence into this file,
and gated all three properties in `npm run check:shared-instructions`. **Rule: this system
improves by MOVING text, not by adding it** (`coherence.md`).

## the row that waited on CI

**2026-09-01, 01:36 UTC.** Row L finished its work, pushed, and ended its turn saying it was
waiting on a CI run before writing its handoff and queueing. Nothing can wake a stopped session;
the branch sat green and unqueued until the loop's finished-but-unqueued check saw it and the
session was resumed by hand. Its prompt already carried "queue as your LAST action". Fourth
instance of the shape after three on 2026-08-30. **Mechanism: the Stop hook
`scripts/hooks/stop-wait.mjs`** refuses a turn that ends on a wait for something that cannot wake
the session, with the three things to do instead. The prompt line stays as the sentence the hook
enforces (`prompts.md`).

## the ten rows that all went to Opus

**2026-09-01 night wave.** Ten rows, every one on Claude Opus, the two Antigravity pools and Codex
used for nothing - against a standing rule making delegation the default for work long to do and
short to specify. Not a decision: no rule asked the planner to choose, so the default won by
omission. **Rule: every row names its POOL, routing is a step of the plan** (core, `routing.md`),
**and `wave-plan-check.mjs` refuses a row without one.** The 2026-09-02 delegation trial supplied
the first graded evidence of what each pool can be given (`docs/HARNESS_ROUTING.md`).

## the row the owner asked for by name, and nobody launched

**2026-09-01.** The owner asked for the AGENTS.md byte-headroom row by name. The day wave held it
for the night wave; the night wave was re-planned by a different session and never carried it;
by 2026-09-02 the ask existed in a memory file, a gitignored plan and a chat, and in no file the
repository tracks. **Mechanism: the owner receipt** - a `docs/backlog/` file with front matter
naming who asked, when, what, and its state, listed by `scripts/owner-receipts.mjs`, validated in
the build, and refused by the plan check when unmentioned. Landed work is the file's deletion,
which `--closed` reads back out of git.

## the four cached facts of 2026-09-02

**2026-09-02, one review.** Beyond the two false statements already known (the landing check that
passes for an empty branch; the stale line count), the day-after review found four more of the
same class in the rebuilt contract: an incident entry naming `check:workflows` as the modular gate
(it is `check:shared-instructions`); `grounding.md` saying `auto-merge` refuses a branch with no
worktree (the temporary-worktree carve-out had landed); a sentence about a guard hook's false
positive, which the review first judged settled and which the same day's evaluation run then hit
again (a bounded `for` loop beside a queue read refused as a poll) - so that one was TRUE, and it
became a matcher fix with a test rather than a restored sentence; and provider facts (model ids,
which pool takes which flag) written as contract text. Every one was prose standing where a
script, a test or a meter should. **Rule: a contract sentence that describes what a mechanism does, or quotes a
number, is a cache - cite the instrument** (`coherence.md`); and the gate now refuses an `npm run`
script the contract names that `package.json` does not have.

## the loop that died twice

**2026-08-30 and 2026-09-01.** The self-paced watch loop died in both observed night waves - about
six hours dark after tick 8 on the first night, 4h57m between ticks 22 and 23 on the second - and
each time the wave landed anyway because every prompt queues itself. The additive-never-load-bearing
rule is what held. Recorded so the next reader knows the loop is a convenience whose death is
expected, and so a dead-man tick (a scheduled task running `wave-tick.mjs` while a fresh wave plan
exists, observation only) is the candidate mechanism rather than more prose about staying awake.

## two dialogs

**2026-09-02 night wave.** Row C added a confirmation prompt to the SVG import step; row D added
one to the Finish step. Their `TOUCHES` sets named different source files, in different
directories, and the collision pass called them disjoint. Both were then obliged to edit
`e2e/student-rehearsal.spec.ts`, because that one spec drives the walk both dialogs now sit in.

Neither session did anything wrong and both gated green. The cost landed at the very end of the
night, on the queue: each branch refused with `merge-order says caution: [conflict] landing it
first leaves 1 conflicted file(s) for other branches to resolve`, naming the other. **A symmetric
deadlock** - neither could go first, and `--accept` is reserved for a person who has weighed the
collision, so an unattended wave could not clear it by rule. It took a tenth session, three hours
after both rows had finished, to merge one branch into the other and resolve the spec by hand.

The textual conflict turned out to be one import line; git had auto-merged both bodies. That is
the sharpest part of the lesson: **the damage was not the merge difficulty, it was the ORDERING
deadlock the shared file created**, and a trivial conflict produces it just as well as a hard one.

**Two rules came out of it.** First, the collision itself: two rows that change the same
user-visible FLOW share its tests whatever their file lists say, and `scripts/e2e-affected.mjs`
maps changed sources to covering specs, so this is measurable at plan time rather than foreseen
(`collisions.md`). Second, the response: **where the collision pass is unsure, chain** - the core's
order-free default is a means, and the owner ruled the next morning that a night has hours to spare
and chaining is preferable to a risky race.

The failure the planner actually made is worth naming precisely, because it will recur in another
costume: `TOUCHES` is a forecast of FILES, and a wave's real coupling is sometimes BEHAVIOURAL. A
file list cannot see two rows agreeing to change how one screen behaves.

## the null delegation

**2026-09-02.** Both `agy` calls in one row returned zero usable lines for about 120 K input, and
both causes were the assignment's rather than the pool's: the calls were left in `--read-only`
(agy's plan mode) so nothing could be written, and every path in the prompt aimed at the main
checkout instead of the row's own worktree. The same pool did real work in another row the same
night. **Rule: a delegation that returns nothing is a prompt defect until proven otherwise - check
`--write` and the worktree's absolute paths before recording anything about the pool**
(`routing.md`). A ledger that files operator error as capability is worth nothing, and the same
trial is why a delegated artifact counts as verified only once the gate that consumes it has run:
it passed every mechanical acceptance condition and was wrong on the one field needing judgement.

## the third liveness signal

**2026-09-03.** The night loop had two instruments for "is this session still there", and both
were inferences from files. `blocked-sessions.mjs` reads a transcript for a tool call with no
result and cannot separate a permission prompt from a dead session from a slow call.
`session-liveness.mjs` reads transcript mtimes and had measured its own by-name lookup missing
sixteen of nineteen agent worktrees, because a worktree-isolated subagent files its transcript
under the parent session's directory. Neither could see a process, because nothing exposed one.

`claude agents --json` does, needs no terminal, and answers in well under a second.
`scripts/claude-agents.mjs` reads it, and the two file-based instruments now carry a third signal
beside them: a waiting session says whether a process still holds it, and the cleanup sweep is
held by a live process with no idle window to age out of. **Both callers use only what the signal
can back.** The positive verdict stands alone; the negative one never authorises a deletion, and
is never written up as a death, because the inventory cannot see a session on another machine and
answers `unknown` wherever it does not run. Its capability is probed on the rows that come back
rather than inferred from a version, so the same code degrades silently on a machine without it.

## the 99% that nobody asked for

**2026-09-03.** A receipt asked for the `AGENTS.md` byte warning to stop being advisory. Its slug
was `agents-md-warning-fails-at-99` and its `asked:` line carried a paraphrase with the same
number. Row F built a better gate - a fixed 4,096-byte reserve, because the ceiling only ratchets
DOWN, so a percentage gate tightens on the person who just cut a chain, and 99% of 110,000 leaves
whoever trips it about four paragraphs to work in. That was the right call. What followed was not.

This session's plan read the number as a specification, told row F to name the deviation loudly,
and row F filed it to the owner queue as a decision to ratify or overrule, leading with a
pull-quote. The owner had never said 99%: the number existed only in a slug and in a paraphrase of
his own words, which is paraphrase twice over. His answer: *"this is exactly the kind of literalism
we need to remove from the Orchestrator... If 4,096 bytes is the better technical solution, use it.
This should not have needed an owner decision."*

**The rule half-existed and still failed**, which is the part worth keeping. The core already said
a tentative opinion is not a requirement, but scoped that to the owner's LIVE words - it never
reached a frozen artifact, so a slug outranked judgement. **Rule: INTENT BINDS, THE DETAIL DOES
NOT** (core), written with its counter-half in the same breath so it cannot be read as a licence to
ignore him, and the consequence in `pushback.md`: a deviation serving the intent is REPORTED, never
filed as a decision the owner owes an answer to. Verbatim ruling: `docs/OWNER_RULINGS.md`.
## the reserve that was never drawn on

**2026-09-02 night wave and 2026-09-03 day wave.** The first two waves planned under the routing
step. Both wrote the `Pools at plan time:` line the check demands, and both left Codex idle. The
night plan read Codex at 64% of its weekly window with 105 hours to reset and called it "the
reserve", spending it on nothing; the day plan wrote "Claude 5-hour window 0% used, weekly 64%" -
Codex's own two meters, attributed to the one harness that publishes none - and then called Codex
"idle but not a wave peer". Over the same 48 hours Claude Code ran 12,382 requests and 2.7 billion
tokens across 161 sessions, a single wave row costing 80-180 M tokens, while Codex ran 2 M tokens
on one delegated bug fix and the owner's weekly Claude allowance passed 45% in two days. The
"Antigravity first, Codex last" ordering of 2026-09-01 was the rule both followed, and the owner
superseded it on 2026-09-03: Codex is available by default unless the invocation says otherwise.
**Mechanism:** `wave-plan-check.mjs` prints an ECONOMY note when the snapshot line gives Claude a
percentage or shows Codex headroom no row draws on - a note, not a refusal, because whether a row
SUITS a pool stays the planner's judgement; `routing.md` names Codex the second implementation
pool and asks section 4 for a sentence when it is left idle.

## the five commands the owner had to paste

**2026-09-03 night.** Five finished branches were still off `main` in the morning, and every one of
them landed unchanged once a person typed one command. Three things had gone wrong and none was
about the branches.

1. **An ordering refusal was terminal.** A landing blocked by a branch still ahead of `main` with no
   landing queued for it is refused - correctly, because deferring is a bet the queue will land that
   blocker. But the job then DIED, so when the blocker was queued twenty minutes later nothing
   brought the refused branch back. `claude/j-fields-step-per-field` and
   `claude/p-alignment-across-corpus` waited all night on that alone.
2. **A three-step trap spent the retry budget.** Phase 2 merges `main` in and pushes before CI is
   asked anything, so a landing killed at its 45-minute cap has already moved the branch one commit
   past its own pin. The automatic retry carried that original pin verbatim and was refused for the
   commit the first attempt had authored - nine preflight checks passing and the tenth rejecting the
   job for the job's own edit. `claude/d-queue-walks-itself`, `claude/f-contracts-point` and
   `claude/m-counting-graphic-airs-zero` each burned their one retry on it.
3. **The loop could not act.** The watch loop was told to report a refusal with the command that
   would settle it, and `jobs.mjs add-merge` is not allowlisted - so the one party that had verified
   every pin was the one party that could not put the branches back.

The owner, that morning: *"fix the problem that would need me to add this to the merge queue, it
does not make any sense. I should not be asked to do this - the whole point with the orchestrator is
that it can handle these kinds of things instead of me."*

**Mechanism, all three in the queue rather than in an instruction.** An ordering refusal now parks
the job on the branches that blocked it and the scheduler releases it when one lands or is queued,
surfacing it for a person after twelve hours if neither happens. A retry refused by the stale pin no
longer counts as a try. And `node scripts/jobs.mjs requeue <branch>` is a verb that re-runs a
declaration and cannot make one - allowlisted, unlike `add-merge`, which can waive gates
(`docs/AGENT_WORKFLOWS.md` "Permissions"). **Rule: a refusal the branch did not cause is repaired by
the loop, not reported** (`night.md`) - but a blocker whose own session never declared it finished
is still named in the morning, because declaring another session's work done is the one thing
landing forbids.

## the relay that had no channel

**2026-09-04 night.** A launched wave session never receives its own subagents' completion
notifications - they route to the orchestrator (`launch.md`). The contract's only named channel for
handing one back was `SendMessage`, which is disabled in the launching session, so its attempt at
17:24:21Z errored "No such tool available" and reached nobody. Nine stray reports arrived at the
orchestrator that night - eight review legs for row K, one Codex diff review for row J - and were
written into the wave-state file, which K's own prompt named as its primary source. K queued
without re-reading it, so a proposal LANDED still carrying the figures its own reviewers had
refuted (a 2x double-count); J landed without its Codex review of a guard-gap risk. A prose rule
with no working channel is the exact shape the core's "a recurring failure becomes a mechanism
before it becomes text" clause exists to catch.

**Mechanism:** `scripts/relay.mjs` writes a stray report to
`<git-common-dir>/noacg-jobs/relay/<branch>.md` marked UNREAD; the branch's QUEUE step reads it
(`queue-merge.md`), and `jobs.mjs add-merge` refuses to pin a branch whose relay is unread. Reading
is the acknowledgement and the only way past the gate, so a review can no longer be lost between the
orchestrator and the row it was for. The alternative - re-enabling peer messaging - is the only
option that makes the old sentence true as written, and it is transient where a file is durable.

## the plan handed over to be pasted

**2026-09-08, this contract's own wording.** A day wave was planned in full - table, collisions,
landing report, pushback, five prompts, all checked - and then handed to the owner as five blocks to
paste into five sessions he would open himself. He answered: *"This session orchestrates it all,
merges everything at the end, and starts new work when old work is done. I should not be pasting
anything in your sessions. I don't know where the confusion comes from."*

The confusion came from here. `launch.md` has said since it was written that the Agent tool is the
PRIMARY launch path, but it loads only after the plan check passes, and by then the reading is
already set: the core's `THIS SESSION NEVER ACTS` section said **"Every command this session
produces is for the USER to run, and names WHERE to run it"**, and `prompts.md` opened with "each
pasteable into a fresh session". Two sentences that fire BEFORE `launch.md` loads, both true of the
rare command this session genuinely cannot run, and together they read as the whole posture. Doing
none of the work never meant making the owner start the rows.

**Mechanism:** the core now carries **"This session LAUNCHES its own rows"** in that same bullet
list, and `check-shared-instructions.mjs` pins that sentence as a critical marker beside
`THIS SESSION NEVER ACTS`, so the two halves of the boundary cannot drift apart again -
removing either fails the build. `prompts.md` opens by saying a block is what this session hands
the Agent tool, with pasting named as the fallback for a classifier-refused row. Cost: one wave's
planning round trip, and about forty minutes of the owner's evening.
