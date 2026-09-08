---
v: 1
source: handoff
raised: 2026-08-27
state: advanced
note: >-
  Two of the machinery items are closed by landings, and the list has never been pruned.
  Items 5b and 6, the auto-merge landing-path gaps, are moot: f3403668 moved landing onto
  GitHub's merge queue and nothing else writes main, and contracts/retired.json now retires
  auto-merge.mjs as the lander along with its flags and its red-main refusal. Item 5z is
  partly served - 73db9601 gave the catalog battery its own scoped workflow on GitHub's
  runners (.github/workflows/catalog-gates.yml) and scripts/e2e-affected.mjs scopes a run to
  what changed - but its second part was tried and reverted, because the emit check needs a
  browser (8e8cdcd7, then 8b29e390). STILL OPEN and UNVERIFIED: everything else. The file
  says so itself - no line here has been re-checked since 2026-08-29 - so items 1 to 5a, 7
  and 8 need a line-by-line pass against the log before any of them is planned.
---
# Leftovers from the 2026-08-27 wave

**Filed:** 2026-09-03, moved verbatim out of the memory store (`wave-leftovers-2026-08-27.md`).
It is a work list, and `docs/backlog/` is where a work list belongs - it sat in memory only
because that was where the wave wrote it.

## Why

The live receipt of what the 2026-08-27 wave left behind: unset topics, docs-for-humans, the
drag-idea note, and a set of machinery defects. **Nothing here was re-checked when it moved** -
each line is a claim about 2026-08-27 to 2026-08-29, not about today, and several are likely
closed. Check against the log before planning work from any of it
(`.agent-workflows/orchestrator/grounding.md` requires that anyway).

## The list, as written at the time


A 7-agent ultracode audit (2026-08-27 evening) checked every ask in the owner's morning input
against origin/main: 27 of 31 landed same-day. These did not, and must not be dropped silently:

1. **GitHub topics still unset** - `gh repo view --json repositoryTopics` returns null; the
   proposed list lived only in chat. Owner called it vanity and delegated ("if there's something
   logical"). Next wave: a session applies a sensible list via `gh repo edit --add-topic ...`
   and files the owner-queue item - or the owner runs the command from the plan.
2. **Docs-for-humans beyond the public page** - the voice rule (src/docs/AGENTS.md) scopes to
   public docs; internal docs/contracts have no simplicity rule, and the coherence session's
   cold-read test targets drift, not readability. The FIRST coherence session (none run yet -
   cadence landed 2026-08-27) should carry the human-readability lens explicitly.
3. **Drag-and-configure wizard idea unrecorded** - docs/CONTROL_PANEL_ROAD.md section 3 never
   names the owner's drag idea among its alternatives (section 1 rejects a panel layout editor,
   which is adjacent but not the same). Owner ratified the planned shape on 2026-08-27, so this
   is a one-line doc amendment: name the idea, say it is superseded by offer-by-predicate.
4. **Proving rounds now UNBLOCKED** - the road plan's three owner decisions were all answered
   2026-08-27 ([[owner-decisions-2026-08-27]]); the per-type stories are in
   [[operator-stories-2026-08-27]]. Next wave: update CONTROL_PANEL_ROAD.md with the answers,
   then run the credits proving round (first of the class).
5. **Council of helpers** - future design session, recorded with its overlap warning in
   [[owner-decisions-2026-08-27]].
5w. **Tooling bug found 2026-08-29 (FF's /check run):** the code-review skill, run from a
   linked worktree, forked into the MAIN CHECKOUT and reviewed an unrelated main commit instead
   of the branch diff - recorded in FF's handoff; fix candidate for the next machinery pass.
   CONFIRMED TWICE same day (CC hit it too: five confident findings about main's last commit
   instead of the branch - the dangerous shape). CC found a second cwd-class guard bug: the
   integration-run guard resolves the e2e port from the session cwd, so worktree sessions are
   blocked whenever the main checkout has a dev server up (refused CC four times). Both are
   cwd-resolution bugs - one machinery fix. CC filed background chips for these.
   THIRD confirmation same day (DD's /check reviewed EE's branch); DD also hit member four:
   a linked worktree cannot run the sweep because the dev-server guard and preview serve the
   SESSION checkout, not the worktree. The one fix: every tool resolves paths/ports from the
   WORKTREE it targets, never the session cwd.
   Two more guard findings from DD (recorded in its handoff, out of its scope): enqueuesWork
   inspects only a command's FIRST shell segment (cd x && npm run queue is not seen as an
   enqueue), and queued jobs spawn through cmd.exe so VAR=1-prefix env vars silently no-op
   (set VAR=1&& works). Same machinery pass.
   CC also filed three chips the owner wants as NEXT-WAVE ROWS instead (owner 2026-08-29 -
   he dismisses the chips): the integration-guard cwd/port false positive (covered by the
   cwd-class fix above), the src/components/AGENTS.md byte headroom (covered by the condensing
   row), and NEW: src/blocks/registry.ts carries an unwired AI countdown block stub with the
   same stale-clock bug class CC fixed in the emitted runtime - fix or delete the stub.
   Also IBC is TIME-CRITICAL: the EBU open-source pitch session at IBC (stand 10.D21) is
   2026-09-12 with a signup form and no published deadline - the checklist's owner steps should
   happen this week.
   And EE measured the instruction chain at ~111,900 of 112,000 bytes (wizard AGENTS.md chain)
   - the NEXT contract addition of any size fails check:shared-instructions first. DONE
   2026-08-29 (session H, branch `claude/h-coherence-condense`): the wizard chain has ~4.7 KB
   free. STILL OPEN: `src/templates/*` chains have only ~1.1-3.8 KB, because
   `src/templates/AGENTS.md` is 67 KB and every one of its 14 category subdirectories loads it -
   the fix is the same split (its `Shared assemblers` and repeating-data sections move to the
   directory owning those files). The byte ratchet cannot tighten until that happens.
5x. **Owner feedback 2026-08-29 morning (contract edits pending, from a proper worktree):**
   (a) reports and questionnaires are written for a NON-TECHNICAL reader - what happened, the
   choice, the why, the action, no jargon carrying meaning ("nothing gets lost just because I
   don't understand it"); (b) use the second-opinion workflow (`so`) before expensive calls;
   (c) big risky projects: "it's still your call to make the technical decisions... find a way
   to do it safely" - the phased rule plus /so plus machine pre-runs IS that way, keep applying
   it without asking; (d) /check trial CONFIRMED KEPT by the owner after night one's catches.
5y. **Night-wave 2026-08-29 aftermath (owner ratified 4/4):** catalog-gates-O(change) is TODAY'S
   WAVE CORE (ratified); the orchestrator contract needs two edits from a proper worktree
   (subagent launch becomes the loop's PRIMARY follow-on path - headless CLI secondary after
   `claude login`; and the landing-path bullet gains the guard-hook false-positive note);
   BB follow-up finding: the new foreground-wait guard false-positives on a `for` loop beside a
   single queue read - loosen the pattern; ProductionPage phases 2+ run in daylight per
   docs/backlog/production-page-phases.md.
5z. **Catalog gates must become O(change), not O(catalog)** (owner ask, 2026-08-28 evening -
   HIGH, pairs with the machinery session): today any catalog change re-measures all 500+
   designs in a browser. Plan: (1) scope filter on the sweeps/baseline specs - re-measure only
   the changed designs, escalate to full on shared-machinery changes (same idea as
   e2e-affected); (2) emit-fingerprints (html/css/js hashes) computed in node inside npm run
   build - no browser; only RENDERED measurements need one; (3) full battery moves to
   CI/nightly, laptop runs the affected slice. Reassurance recorded: customer/community
   templates are validated per-template, O(1) - only our own catalog sweeps scale. Also defect
   SIX for the machinery list: cheapest-first landing order starves expensive branches on busy
   days - add fairness/aging.
5a. **Foreground waits can hang for hours (2026-08-28):** two sessions sat 175 and 300+ minutes
   in raw waits on RAM-starved queue jobs - the 30-minute give-up lives only in the :queued
   wrappers, so nothing bounded them. Mechanism fix for the machinery session: the guard hook or
   runner should refuse/kill any foreground wait on a queued job past ~30 min, and prompts keep
   saying ENQUEUE-and-handoff, never wait.
5b. **Queue defect found 2026-08-28 afternoon:** a merge job chained behind a FAILED landing
   sits at "a job it depends on did not finish green" forever - it must either run anyway once
   the predecessor's terminal state is known (landings are order-free) or refuse loudly so the
   listing says re-queue. Add to the auto-merge/jobs-runner fix session with the other two
   landing-path gaps.
6. **Night-wave aftermath (2026-08-28 morning, owner ratified all four wave calls 4/4):**
   investigate WHAT ran the unplanned `claude/quality-review-2026-08-28` branch outside the
   routines' read-only contract (owner: investigate first, then judge its content) - it parked
   the main checkout and blocked the wave's landings; fix auto-merge's two landing-path gaps
   (no-worktree branches - `editor-blank-stage-note` is stuck behind it - and the dependence on
   the main checkout's state), regression tests in test:worktree-safety.
7. **anim-engine.spec.ts:656 is red on MAIN independently** (session report, 2026-08-28: already
   failing at its fork point, on a shard unrelated to its changes; "nobody owns it"). HIGH for
   the next wave: a standing red on main lets any branch's gate go red innocently and teaches
   everyone to ignore red. Reproduce on main first, then fix or quarantine with a filed cause.
8. **Editor blank stage, narrowed by the owner (2026-08-27 evening)** - the editor complaint is
   NOT the play button: the stage was already empty on open. Owner answers: a DARK empty canvas
   (not white - rules out the colour-scheme/iframe fault) on a PLAIN catalog template (rules out
   assets). Lead suspect: stale persisted pan/zoom parking the frame off-screen
   (`PreviewFrame`); owner will press the % reset next time it happens to confirm. Full
   investigation: `docs/handoffs/2026-08-27-editor-stage-blank.md` on branch
   `claude/editor-blank-stage-note` (re-queue with `node scripts/jobs.mjs add-merge
   claude/editor-blank-stage-note` - its first landing died mid-wait). Two side bugs to fix
   alongside: Space tapped over the stage is silently swallowed by canvas pan; `__activeTl`
   never released on completion so the playhead pins after the first play. Still deprioritized
   behind the 2026-09-12 push - a small session, not an urgent one.
