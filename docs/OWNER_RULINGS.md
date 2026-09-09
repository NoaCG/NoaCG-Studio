# Owner rulings - the dated log

Every ruling the owner has given in a session, kept by DATE and moved here verbatim from the
memory store on 2026-09-03. It lives in the repo because the repo can hold it: these are decisions,
they are greppable, and git dates them. Memory keeps only a pointer.

**How to read this file, and it matters more than the content.** Per `docs/MISTAKE_TRIGGERS.md`
("Memory: the weakest trigger"), a ruling here is EVIDENCE, not authority, and the precedence is:
what the owner says now, then the repo's current state, then the newest dated ruling, then older
ones as advisory. **A rule outlives its own why, and the why is what to test.** Several rulings
below were made before the landing queue, before the student-release pivot, and with weaker models;
they describe how we got here rather than where we go. A later section supersedes an earlier one on
the same subject, and where that was already known the text says so inline.

Nothing here was re-checked line by line when it moved. Treat each entry as a claim about its own
date. `docs/GOALS.md` is the current push and outranks everything below.


---

## owner-decisions-2026-08-08


Answers given 2026-08-08, in one pass over nine session handoffs. These are binding and several
CONTRADICT text currently committed in the repo.

**AI / Lite**
- Anonymous Lite stays OFF. The door must say **create an account**, not only "sign in" -
  today `AiStep.tsx` renders `SignInPrompt` with sign-in-only copy and a single "Sign in" button.
- Production Lite is unblocked with `AI_LITE_OVERRIDE_USER_IDS` (owner + class accounts) on the
  Vercel project. Public caps stay honest. Owner action, not code.
- The intent_role_mismatch fix (judge kind against `emittedRoles[0]`) is approved WITH one paid
  ~$0.010 confirmation round. That approval is for that round only - see [[flag-real-money-spend]].
- Best effort at the deadline = **all categories are the target, nothing obviously bad ships**.
  So a category that fails the gallery gets switched off, not shipped.
- Category count is NOT pinned. `quiz` is real and included; the enum is the source; docs stop
  hand-counting. Lite's scope is "the useful catalog", which may grow or shrink.
- §3's build ORDER is guidance, not contract - sequence by dependency and risk.
- **AI never authors a state machine.** Each graphic TYPE owns its states/events; AI picks the
  type and fills content/design, and the machine arrives from the type registry. Where a type's
  intended operator behaviour is not already defined in code, ASK - do not invent one. Target:
  quiz, poll, scoreboard, clock driving real control panels before 2026-08-21. This is much
  smaller than "teach a model to emit machines", which is what the handoff proposed.
  **SUPERSEDED 2026-08-27** - owner: closing the control panel was "old thinking". Custom
  machines/panels are now open on EVERY path (CLI and Lite/Pro), gated, not forbidden. See
  [[owner-decisions-2026-08-27]].

**Pro (see [[noacg-pro-pipeline]])**
- Not retired, not continued mechanically. Before any tactic change, produce an EVIDENCE-BACKED
  diagnosis: where in the pipeline the 5/12 actually breaks, whether it is inherent to
  image-led design or only to this implementation, what was genuinely tried, what realistic
  improvement remains.
- The vision is a MULTI-MODEL pipeline - different models for concept, layout reading, code
  writing, rendered critique - varying by task and category. Not "one model generates everything".
- Pro must end up clearly better than Lite. **Lite and Pro are SEPARATE projects**: Pro is not
  Lite grown up, Lite is not Pro reduced. `src/ai/AGENTS.md` currently implies otherwise.
- **Creative Mode is RETIRED**, superseded by Pro. Mine it for lessons, failed approaches,
  benchmarks and reusable code; stop carrying it as a parallel path.
  (Supersedes [[creative-mode-plan]]'s "paused".)

**Catalog variety - the biggest item**
- The sameness measured in `docs/LOOKS_AND_PALETTES.md` is a REAL problem, and it is not about
  palette count. Needed: more distinct design families, compositions, typography treatments,
  spacing systems, shapes, image treatments, animation styles, visual personalities.
- **No recognisable NoaCG house look.** Graphics should read as if from different broadcasters,
  shows, brands, sports productions, events, streams, designers.
- Explicitly NOT solved by palette re-skins of the same layout, and not by hundreds of
  low-value near-duplicates. Start with an investigation - where the repetition comes from,
  which designs are genuinely distinct vs variants of one idea, what directions are missing -
  then propose systematic expansion. Do not treat today's Look count as a target.
- OPEN VERIFICATION owed: can every template really take arbitrary colours on its relevant
  elements, or are some designs effectively welded to their original palette? Unmeasured.

**Kits**
- The "no orphan graphics" goal is stronger than the handoff read it: not "a kit can reference
  this design" but **a user must never fall in love with one catalog graphic and find no
  matching production package around it**. Every good design needs a coherent family (lower
  third, titles, score, fullscreen, bug...) around it.
- So the 119 kit-unreachable designs are triaged first: distinct direction worth expanding into
  a kit, or near-duplicate that should not be. Letting kit choices name a DESIGN is a means, not
  the goal.
- Every kit gets a coherent default look, and "look" means palette AND typography, spacing,
  shape, layout language, image treatment, motion. Defaults, never locks.
- User-facing text unifies on **kit**; `TemplatePack` / `PACKS` / `resolvePack` stay.

**Wizard (re-design/handoff.md is current product direction)**
- Do the Browse redesign: first page + "Show 12 more", one type dropdown. **Update the specs and
  `src/templates/AGENTS.md` to match the intended UX** rather than preserving old behaviour
  because a spec asserts it. Preserve the underlying filtering capability. No parallel UI system.
- Entry cards keep CLICK-TO-ACT (no radio + Continue). Element colors stays COLLAPSED but must be
  obvious to open, and the alpha control is never compacted away.
- "Reveal in steps" stays below the fold - keep the Direction controls. But the current checkbox
  is INSUFFICIENT: it needs to define which elements reveal, in what order, and how each step
  behaves.

**Surfaces**
- Feedback button belongs in the WIZARD and on HOME, not only the editor shell.
- /join gets the `@font-face` so a published brand font actually renders.
- Commit `re-design/` (currently untracked, main checkout only - agents cannot see the pictures
  they are building toward). Trim `src/components/wizard/AGENTS.md` (116,064 B of a 120,000 B
  cap). Make `check-shared-instructions.mjs` report per-chain headroom on success.
- Owner runs `docs/STUDENT_RELEASE_ACCEPTANCE.md` §1-§6 on real hardware, cloud door first,
  against a KIT-built production. Class accounts created after that walk proves out.

---

## owner-decisions-2026-08-27


Owner answers, 2026-08-27, given on the phone in the orchestrator session. Binding; several are
not yet in any repo file - the next wave lands them.

**The big one - custom control panels open everywhere.** The 2026-08-08 "AI never authors
machines" stance is, in the owner's own words, old thinking: *"We need to open custom controls
for every model... we need to update it so we can do any graphic, have any control panel, and
ensure it will always work."* Applies to the CLI/agent door AND Lite/Pro - the safety model is
the GATES (validate green, `noacg inspect` shown to the user as the panel review, every operator
event walked in the bench), not prohibition. *"We want to give this to our customers."*
Partially supersedes [[owner-decisions-2026-08-08]].
Clarified same day: **Lite/Pro is DIRECTION ONLY - build later**, after the student release, when
AI work resumes; the CLI road may move first. And **priorities are unchanged: the 2026-09-12
student production stays the NOW** - the control-panel road advances only in spare capacity.

**Ratified as planned:**
- Wizard behaviour step: offer-by-predicate, default to NO behaviour, never interrogate, honest
  "something else" exit (node editor + agent door) that records the ask as feedback.
- Proving: per-type OPERATOR STORY in prose, proven in cloud + dashboard + offline export.
  Credits first. Owner will answer per-category "how should this graphic run" questions in chat
  (offered the evening of 2026-08-27); answers should be treated as direction, "not too strict",
  and *"many of these things already work well"*.
- Browse dropdown: **Option A** - one grouped dropdown (shelves as optgroups, member categories
  as options), the type chip row goes, style row stays the only chips.
- In-app hint links to /docs: make them AMBER via one app-wide CSS rule (they render default
  light blue today).
- Standing-routine cadences confirmed (weekly Mon 09:45, monthly 1st + 15th).

**Credits intent (the first operator story, owner's words):** paste the WHOLE credit list as one
text; a clear separator (colon or similar) splits role from name - exact separator is open, the
WHY is what binds; short and long credits both; roles and names styled differently, side by side
or stacked. The system, not the user, handles per-name structure.

**Editor (Advanced surface):** the symptom he remembers is SPACE not playing the timeline; if
space plays, "I guess it's fixed". Explicitly deprioritized - *"don't stress about it"* - the
whole timeline/canvas gets redesigned later; he steers people away from the editor today.

One dictation artifact: a Swedish passage about course-assignment weights in the same answer was
his teaching notes, ruled ignore - not NoaCG.

**Process rulings, evening 2026-08-27** (the durable rules landed in
`.agent-workflows/orchestrator.md` the same day - this records the intent and what is NOT built):
- Take the owner progressively OUT of the loop: agents answer their own questions with a
  recommendation and proceed; owner vetoes after the fact via a wave-end alignment
  questionnaire. Money, past-main, external accounts, direction forks still wait. *"Iterate with
  speed... but be safe"* - waking to a broken program is the one unacceptable outcome; safety
  stays priority one.
- Continuations verify the landed work with fresh eyes BEFORE continuing from the handoff.
- Every report names one lesson learned and applied next wave.
- Max plan: tokens not the constraint - ultracode/subagents welcome for big decisions and
  verification.
- **NOT BUILT, future session to design: the COUNCIL OF HELPERS** - advisors on different
  aspects (focus vs north star, competition, quality) chiming in every few days, catching the
  owner's own admitted drift (*"I put the North Star on a clear goal, and then I start fixing
  small bugs... I forget the big picture"*) and assisting agent decisions. Overlaps the
  coherence cadence and the monthly routines - the design session must reconcile, not stack, a
  fourth mechanism.

---

## owner-decisions-2026-08-29


Owner rulings, 2026-08-29 afternoon (answered the day-wave questionnaire):

1. **Countdown Update re-arms: KEEP.** Re-arming only when the clock's own fields changed is
   "the least surprising behavior".
2. **SVG import default stays the FULL ladder** (widen - wrap - shrink) - PROVIDED it is
   deterministic and reliable, and "the ladder should respect the authored design rather than
   silently destroying it". That caveat is the acceptance bar for future fitting work.
3. **Output health is not permanently hidden.** End state: a simple green "healthy" indicator
   visible whenever an output is relevant, plus an expandable TECHNICIAN view (connection state,
   latency/buffering, memory pressure, dropped frames/errors). Backlogged
   (`docs/backlog/output-health-indicator.md`), deliberately not built yet. Simple dot = operator
   calm; detail view = technician substance.
4. **EBU/OGraf: build working OGraf playout FIRST, on the existing NoaCG player/output
   architecture** (the /output renderer + control log) - never a separate playout system. All
   outreach (ograf.dev listing, EBU pitch signup, working-group email) waits until EBU/YLE can
   test NoaCG in a real production. Supersedes the "signup this week" urgency in the 08-29
   day-wave handoff. Related: [[product-direction]], [[gtm-competitive]].
5. **Multi-harness delegation (2026-08-29 evening).** Claude usage limits are near; the owner has
   a Codex subscription and a Google subscription. Ruling: everything stays CONTROLLED FROM
   CLAUDE CODE; clear, well-specced tasks may be delegated to Codex NOW ("I also allow you to use
   Codex for work you think is suited for right now") - start small, do not break the working
   wave machinery. Google Antigravity CLI: install and trial it the same way (needs the owner's
   Google login - interactive step). Long-term wish: the orchestrator learns which harness fits
   which task class. Codex remains NOT an autonomous wave peer (no watch loop) - reached via the
   rescue workflow from inside a Claude session, or user-started.
   **Why:** capacity headroom + harness diversity; the owner called it next-gen orchestration.
   **How to apply:** night waves include at most one bounded Codex-delegated row until trust is
   built; first trial = mechanical bulk edits (the Codex sweet spot per the delegation rule).

---

## owner-decisions-2026-08-30


Answers to the questions the night wave left. All five are rulings, not preferences.

**1. Poll score updates - held by default, live by opt-in.** *"Usually people will use it just to
show the results, so the poll does not have to automatically update. However, we should give that
possibility to those who want it. There could be a checkbox that you can check if you want to
automatically update the score on the screen during a live broadcast."* So: the shipped default
stays "reveal on Show result", and a checkbox turns on live ticking during the broadcast.

**2. The Google CLI permission file - option A, with caution.** Install
`C:\Users\ahonemi\.gemini\antigravity-cli\settings.json` WITH its `deny` lines, because the goal is
autonomous agents - but the open risk must be closed rather than accepted: it is unknown whether
that machine-global `deny` also binds his own interactive `agy` and silently stops it writing
files. Whoever installs it MUST test that afterwards and report, not assume. *"Let's go with A but
with caution."*

**3. The push-parsing permission hook - build it, scoped as narrowly as possible.** *"We want to
have autonomous agents, but scope it as narrowly as you can so we don't put ourselves at any extra
risk."* Pre-approve exactly the safe `git push` shape that no text prefix can express; nothing
wider.

**4. The growth rule - geometry AND purpose, never category.** Write the rule, but it *"shouldn't
depend only on a category. It should depend on the geometry and what is the why of the graphic and
how it works with other graphics."* His worked example, and it is the useful part: **a quiz or text
box played one after another should keep the SAME size between items** - in Who Wants To Be A
Millionaire the question box does not resize with the question, and that is right by design taste,
not by accident. So a graphic in a SEQUENCE is a case for constant size even where the geometry
alone would argue for growing. *"We should have real-life examples and logic being used here... I
don't know how to write it in but do your best."* See [[owner-taste-rules-composition]].

**5. Autonomy, ratified and extended** - see [[fix-dont-ask]], which carries it as a standing rule.

## Evening rulings, same day

**6. THE OWNER'S EYES ARE NEVER A BLOCKER - this is a standing rule, not an answer.** *"One thing
we should do is not block too much of other work just because I can't test something. We have so
many things to work on anyway."* And: *"It's up to me to test what I need to test. You don't have
to block any work just because I haven't tested something or something is not done... nothing
should block stuff. We can always improve on stuff."* This REVERSES the orchestrator's
owner-attention rule, which queued owner-observable work behind machinery once the owner queue
passed roughly ten unwalked items. Combined with his ruling that nothing in that queue expires,
**the owner queue is a RECORD, not a gate**: it is where work waits to be seen, never where work
waits to be started. A plan that reports "the push is blocked on your eyes" is making his backlog
into a dependency, and he does not want one. **On Tuesday 2026-09-01 he writes a long to-do list**
for us to follow.

**7. SVG import is the most important thing right now** (his words, evening of 2026-08-30) - which
is consistent with `docs/GOALS.md` `## NOW`, where SVG import is how a student's own artwork gets
in.

**8. Codex effort: high most of the time, medium the floor, low only for easy tasks.** *"The low
reasoning worries me... important coding tasks should be on high... I have more faith in GPT SOL
than in Gemini."* `~/.codex/config.toml` was on `low` and is now `medium`. `gpt-5.6-sol` is the
ONLY model the ChatGPT subscription exposes through Codex - ten other names were probed and all
refused - so effort is the only knob there is.

**9. Antigravity default is `gemini-3.7-flash-high`**, on measurement: equal correctness to
`gemini-3.1-pro-high`, 3.3x faster, more detail. *"It's a newer model so it's fine."* High
reasoning for most tasks, lower where a task plainly does not need it.

**10. Delegate most mechanical work to Codex, verified by Claude**, and **`/check` becomes
permanent for night sessions** (the trial was to run to 2026-09-04; one day caught nine real
issues on a single branch).

**11. The `ebu/ograf` spec issue - ANSWERED YES, and it is already filed.** *"Yes, I think it would
be good to inform EBU about that lack, but right now we have to design around it and then implement
it when we can."* Filed as **https://github.com/ebu/ograf/issues/82** under `miwco`, purely
technical, pitching nothing and inviting nobody, so the outreach ruling in
[[owner-decisions-2026-08-29]] is untouched. The design that does not wait on it is
`docs/OGRAF_STATE_IN_FIELDS.md`. An earlier version of this entry said the question was still open -
it was not; do not file a second issue.

One claim corrected while filing it: the spec does not *drop* a graphic's returned state, it leaves
it **undeclared**, and the reference implementation forwards it. The gap is real but narrower than
first reported, and wider in a different way - it affects all four action endpoints, and the
Graphics spec contradicts itself between its prose and its type definitions.

---

## owner-decisions-2026-09-03


**Read for intent, not for the letter - and this reaches frozen artifacts, not only live words.**
A ruling, given after the orchestrator turned a number in a receipt's own slug into a requirement
and had a session file the deviation as a decision he was owed. Verbatim, in full:

> *"this is exactly the kind of literalism we need to remove from the Orchestrator. Numbers,
> wording, implementation ideas, and old receipts should not become binding owner requirements
> unless I clearly made that specific detail the point. Infer the underlying intent and use your
> own judgment to achieve it better. Here the intent is simply that the byte budget works reliably
> and fails safely before running out of room. If 4,096 bytes is the better technical solution, use
> it. This should not have needed an owner decision."*

He also said he does not believe he ever specified 99%, and he is right - the number came from the
receipt slug `agents-md-warning-fails-at-99` and from a paraphrased `asked:` line, which is
paraphrase twice over. **So: 4,096 bytes stands, and the question should never have been put to
him.**

**What this ruling is NOT.** It is not permission to override him. The same message says to achieve
his intent *better*, and better is measured against what he wanted, never against what a session
would rather build. The detail still binds wherever he made it the point - a taste ruling, a named
date, a figure he arrived at himself, an explicit "it must be X". Where a session genuinely cannot
tell, it serves the intent and REPORTS; it does not stop to ask.

**The same day, on autonomy - the two quotes the contracts point here for.** These are the live-word
half of the rule above, and the orchestrator core and `orchestrator/pushback.md` both cite this
section rather than reprinting them:

> *"use your own reasoning...*
> *Tell me about significant decisions afterward and I can always revert them."*

> *"I may suggest something that is not actually in NoaCG's best interest... maintain the larger
> plan, vision, and goals and work toward them independently rather than treating everything I say
> as an unquestionable instruction."*

Implemented as **INTENT BINDS, THE DETAIL DOES NOT** in `.agent-workflows/orchestrator.md`, with
its counter-half beside it, the reporting consequence in `orchestrator/pushback.md`, the row-facing
half in `orchestrator/prompts.md`, the same rule for receipts in `docs/backlog/README.md`, and the
story in `orchestrator/incidents.md` ("the 99% that nobody asked for").

### The orchestrator review brief, evening 2026-09-03

Given as the brief for the next orchestrator review, after the first real day and night waves.
Rulings, in the owner's own framing; paraphrased where marked.

- **"We do not slow down. We only speed up."** Claude Code Max was at about 45% of its weekly
  allowance after two days of orchestrator use. The answer is never pacing: no daily token
  budgets, no "save Claude for later in the week". Remove waste and route work into capacity that
  is already paid for; if more capacity eventually has to be bought, that is acceptable, but first
  prove the current subscriptions are not being wasted.
- **The objective is verified useful work per unit of constrained capacity**, and it is never
  optimised by reducing useful throughput. Never penalise using an expensive model where it
  materially improves the outcome.
- **Codex is available by default.** *"The owner will explicitly say at wave start when Codex is
  needed elsewhere and is off limits for that wave."* Absent that, use the Codex subscription
  productively rather than preserving unused quota. **GPT Sol on high reasoning is highly valued
  and should be used substantially where it performs well.** Supersedes the 2026-09-01 evening
  ordering "Antigravity first, Codex last". An upgrade is justified only by evidence that Codex
  capacity regularly becomes a real constraint, routing into it is reliable, and more of it would
  turn into more verified work; do not hard-code that decision anywhere.
- **Antigravity: exploit it where evidence supports it.** Its Claude/GPT pool exposes older,
  non-frontier models; that is current evidence, not a reason to abandon the pool. Test Gemini
  and the abundant models aggressively on mechanical work, bulk transformations, straightforward
  investigation and bounded implementation. Cheap generation followed by expensive redo is not
  economical: grade every `(harness, model, task-class)` by actual results.
- **Opus stays a primary implementation model and the persistent master.** Find waste before
  reducing valuable Opus work. **Fable stays the high-leverage resource for consequential work**
  (architecture, strategic decisions, difficult debugging, adversarial review, important design
  judgement) and is never spent on mechanical bulk.
- **A tool observation is evidence about a version, never a permanent ruling.** Codex and
  Antigravity update almost daily. "This harness cannot write", "this flag does not exist", "this
  model is unavailable" are re-probed after a meaningful software change, cheaply, and never left
  to disable a capability for good. Model names, quota readings and provider economics do not
  belong in permanent hot orchestrator context.
- **Knowledge fires at the point of action, or it is dead documentation.** The measured failure:
  an instruction exists, is not read when needed, the mistake happens, and the document is found
  afterwards. The ladder for a recurring failure is hook, script, test or runtime mechanism first;
  then durable structured state; then a precise context pointer; skill prose only where the
  judgement itself needs it. Never solve it by loading every memory into every session.
- **The owner is not the universal expert.** Coding questions go to the coding agents, design
  questions to design expertise and evidence, architecture to expert judgement, factual questions
  to investigation, experimentally answerable questions to an experiment. A question is not
  escalated because several approaches exist. The owner is the source of product intent,
  priorities, genuinely personal taste, business constraints, irreversible or external decisions,
  and corrections; an owner suggestion is not automatically technical truth, and the orchestrator
  may challenge it when evidence shows a better way to the same goal. Explicit current rulings
  bind until superseded; old opinions do not silently become constraints. **Owner unavailable is
  not a reason for the useful frontier to stop moving.**
- **Dates express ordering, dependencies, targets and priority - never "not before" gates.** If
  something planned for December is ready, useful and safe now, do it now unless a real dependency
  makes waiting valuable. The owner manages real-world timing with students and Yle; the
  orchestrator keeps NoaCG moving. Software is never finished: find the most valuable actionable
  work, improve, verify, land, reassess, continue.
- **Economy is something the orchestrator actively checks**, at whichever layer is
  architecturally right (plan-time routing, post-wave spend review, the outcome ledger) - not
  crammed into `/check` because the word "check" was used.
- **Change policy for the orchestrator itself:** at most three to five evidence-backed
  improvements per review, no giant rewrites, every new rule earns its recurring context cost,
  experiment before adding a permanent rule. Preserve: one persistent authoritative master,
  serialized landing, order-free waves, exact-SHA verification, risk-scaled independent review,
  durable state, owner receipts, handoff draining, deliberate collision planning, no structural
  dependency on one harness, no interactive permission dependency unattended, mechanisms over
  prose, progressive disclosure, and the common-path measurement.

---

## owner-decisions-2026-09-04

**A technical problem is never his, and this is a hard rule.** Given during a `/walk`, after an
`owner-action` list that asked him to paste an allowlist entry and run a global install.

> This is something fundamentally wrong with how we work, because I cannot solve merging issues
> or, if there are some CI problems and something is stuck behind something else, I cannot fix it.
> It is still going to be you who fixes it, so you do not need to have me for anything.

> when the orchestrator thinks that the owner (me) should do something and starts waiting for me,
> then it is a problem because I have no special skills to fix these issues.

> you have to just prompt yourself with a question and ask, "What would you do in this situation?"
> You will find a way. I promise you, you will figure this out without my help, because I cannot do
> anything. I will just go and ask Claude myself, and it will give me the answer, and then I will
> paste it to you. It is totally pointless to have me here in the loop.

The mechanism it produced, the same day: `owner-action` items carry a `needs:` key naming one of
four reasons (`account`, `money`, `identity`, `harness`), `npm run check:owner-queue` refuses an
item filed without one, and an item that cannot name one is not his. Full text, definitions and the
rest of the quotes: `docs/acceptance/OWNER_QUEUE.md`, "A TECHNICAL problem is never his". This
extends rather than replaces the 2026-09-03 ruling that a design default is not a taste question -
one closed the design door, this one closes the technical door.

## owner-decisions-2026-09-05

**A session may cut a CLI release itself.** Given right after he published `@noacg/cli` 0.3.0 by
hand, from his phone, on instructions from a session that could not do it - the permission
classifier refuses the tag push, and that push IS the publish.

> Can you, in the future, consider doing this yourself because I didn't do any checks? I just did
> what you told me. I think you could just release the new versions if I think it's okay so I
> don't have to do the clicking.

The half that matters is the first sentence, not the permission. **A human step that consists of
following an agent's instructions verifies nothing.** It looks like a second pair of eyes and is
not one, so the ceremony was buying a safety we never actually had. He is right that a release
should be gated by CHECKS rather than by a click.

This NARROWS the standing rule in his global instructions, which reserves `npm publish` for him,
and it narrows it for one path only: the `@noacg/cli` release. That path's entire publish surface
is `.github/workflows/release-cli.yml`, which already refuses a commit that is not an ancestor of
`main`, already refuses a version the registry has, and needs no credential on any machine.
Everything else past `main` still reaches him in the message - anything that costs money above all.

The mechanism: `npm run release:cli` (`scripts/release-cli.mjs`) runs the preflight he did not run,
cuts the tag, and then verifies the PUBLISHED artefact from the registry rather than trusting the
run's exit code. `docs/AGENT_CLI.md` "Releasing to npm" is the procedure.

## owner-decisions-2026-09-05 (second)

**Readable beats contained.** Given with a screenshot of an imported quiz board whose question had
been typed into itself until it was many times its room: one big line, and under it a band of grey
texture that had been words.

> the text should always be readable, and if it becomes too small, then that's the user's own
> fault, but the text should never grow on top of each other or get so dense that it's impossible
> to read, like in this screenshot.

It looked at first like a NARROWING of the 2026-08-26 ruling that nothing may ever paint outside its
panel. That ruling produced the last rung of the fit ladder, a horizontal squeeze with no floor:
SVG's `textLength` condenses to whatever number it is handed, and it was handed the room.

**The first fix read it that way and was wrong, which CI measured the same day.** Stopping the
condensing and letting the words stand where they fell put a corpus endboard's sign-off **354px
outside its plate** - a graphic broken a different way. His sentence draws the line more precisely
than "readable beats contained": *"if it becomes too small, then that's the user's own fault"*
SANCTIONS shrinking, and what he refuses is text that has "grown on top of each other" or gone "so
dense that it's impossible to read" - which is CONDENSING. Scaling leaves a letterform its own
shape; condensing turns words into a texture.

So the ladder now carries TWO FLOORS (`src/templates/importedDesign/svg.ts`). **55% is where a
value is REPORTED as too long** - `noacgTextOverflow()`, the operator's warning, unchanged. Past it
the type keeps SHRINKING to a hard 30% floor rather than being condensed, and only what no size can
hold is condensed at all, never past 70% of the glyphs' own advance (`SVG_SQUEEZE_FLOOR`).

That keeps the **2026-08-26 ruling intact** - nothing paints outside its panel - for every value a
plate can hold at any size, which after this change is very nearly all of them. The two rulings
turned out not to conflict at all; the first fix only made them look as though they did.

**And the standard the wizard's text step is now held to**, from the same message - filed as
receipts under `docs/backlog/`, not yet built:

> it should be very simple: what it does, and it always works, right? Still, I think that when I
> just mess around and change a lot of things, it breaks. And it should be allowed to test and try
> to mess with it, and it shouldn't break. This is a good test, and this wizard step doesn't pass
> it yet.

## operator-stories-2026-08-27


How the owner wants each graphic type to run on air. Direction, "not too strict" - the WHY binds,
the mechanism is the session's to design. Sits under [[owner-decisions-2026-08-27]]; proving
order starts with credits.

- **Credits**: whole list pasted as ONE text; a separator (colon-ish, exact form open) splits
  role from name; short and long variants; roles styled differently from names; side-by-side or
  stacked layouts. AMENDED 2026-08-28 (walk): operator SPEED control on anything scrolling;
  scrolls ALL THE WAY THROUGH by default (never parks names/logo mid-screen); an optional end
  beat (logo/text) may follow. SERVED: end credits by `cde2a2da`, tickers by the change that
  deleted `docs/backlog/scrolling-speed-and-through.md` (`git log --diff-filter=D` finds it). The
  speed field is emitted in `src/templates/endCredits/shared.ts` and
  `src/templates/tickers/shared.ts`, both keyed on the motion preset.
- **Ticker/crawl**: one pasted list (one item per line), loops until Out; list editable
  mid-show, new items enter on the next pass.
- **Scoreboard**: current model RIGHT - Goal A = flag + score in one press; +/- for corrections;
  Full time independent.
- **Quiz**: lock -> reveal stays the taught default path, but direct reveal without lock is
  allowed.
- **Poll/vote**: audience votes live via /join, bars fill from real votes, operator only decides
  WHEN results show. (Offline/manual entry not ruled on - the recommended option he took was
  audience-first.)
- **Timer/countdown**: duration set beforehand, starts on TAKE, at zero HOLDS at 0:00 until
  taken out.
- **Stat readouts**: play = count 0 -> value (fixed 2026-08-27); UPDATE while on air = animate
  old -> new, never snap, never recount from zero.
- **Lists** (agenda, lineup, standings): rows pasted as one field; NEXT reveals row by row (a
  show-all option acceptable).
- **Alerts/notifications**: BOTH stories, per design - breaking-news strap stays until Out; a
  follower/donation pop plays, holds briefly, self-outs.
- **Results boards**: depends on the design - award-style steps to the winner with Next,
  standings-style enters whole. Both stories needed.
- **Reveal cards**: staged - taken on air hidden/teased, ONE Reveal press fires the moment.
- **Holding**: ambient loop until Out. **Transition/stinger**: fires once, self-completing, no
  Out.
- **Simple graphics** (lower-third, title, topic, info, question, quote, caption, bug, sponsor,
  CTA, product, map): type - Take - Update (clean swap) - Out is the standard story. BUT stay
  OPEN: any of them may grow behaviour (bug cycling logo/clock/sponsor, map moving on cue,
  sponsor rotation, rapid caption/question stepping) - and if a richer one is easier to ship as
  its own type/name, that is fine. Owner's guardrail: *"let's not make this too difficult for
  us"* - openness over machinery.

## owner-decisions-2026-09-05

**No technical or design question ever stops work or reaches him; the strongest model answers
it, and he may revert later.** Given after `scripts/landing-latency.mjs` showed nine of the week's
slow landings waiting on a merge-order `caution` for a person to accept. This makes the 2026-09-04
ruling a hard rule and widens it from "technical problem" to every design decision.

> the agent and the orchestrator should always resolve any merge conflicts on their own. Never ask
> me because I do not know what to do in those cases, and the agent can ask a super intelligent AI
> what to do in that case so ask it instead not me.

> you don't need me, a flawed human to make decisions about code design or really anything else.
> Always ask the super intelligent AI what to do and it most likely will be the best solution. If
> there is generally something that you want me to take a look at, I can take a look at it later
> and revert the decision or something. We should never stop working because of a technical or
> design question because the AI can answer those.

**What still needs him is ALIGNMENT, weekly, and nothing else.** The vision and the long-term
plan are checked with him once a week; between checks the queue and the plan run on their own.

> We need to have the agents aligned with my thoughts about NoaCG and we could have weekly
> alignment checks so we make sure that we have the same plan and vision. The rest we can
> automate. Once a week we look at the job queue and our long-term plan and then we can just
> automatically work toward it. We have at least a year full of work ahead of us already so we
> just need to do it and not ask me when.

Mechanisms the same day: `auto-merge.mjs` lands a plain `caution` in queue order (the later branch
integrates), and its `hold` message names the branch's own session, never a person; two backlog
items with receipts - `docs/backlog/merge-conflicts-are-resolved-by-a-consult-never-the-owner.md`
and `docs/backlog/weekly-alignment-check-is-the-only-owner-gate.md` - carry the rest.

**Brands (same day, an alignment pass on `docs/BRAND_PLAN.md`).** Asked before the plan was
written, because the answers change the model. Verbatim:

> Default behavior is none. If the user has no brands then there's nothing to choose.

> [The logo goes] only where there's a place for a logo, it should default to the logo. It would be
> nice to be able to import and add the logo in a graphic where it will be placed for it but that
> sounds like a job for an AI (or then just place it manually beside the graphic, which might be a
> risk). I don't really know how that would work.

> We need a logo set at some point but we can start with just one logo.

Recorded as decisions 1-3 of that plan; the creator on Home and "we just plan here and create the
draft for the night wave" are 4 and the split in §10.

---

## owner-decisions-2026-09-06

Given the morning after the SVG behaviour system (phases 0 to 5 of `docs/SVG_BEHAVIOUR_PLAN.md`)
landed on `main` as `8c1b39ba`.

**The two taste lines stay as shipped until the students have used them.** `show:` and `choice:`
remain the only two layer-name prefixes, and "require lock before reveal" remains a checkbox in
the mapping step. Both may change after the first student test; neither changes before it.

> We can keep "show" and "choice" as the two layer name prefixes right now, and also the checkbox
> for "require lock before review". We can change them after we have tested it with the students.

**The quiz is done; the next work is the OTHER graphics.** The quiz already has its hard-coded
control page and now opens bound, so no more effort goes there. The list to work through is the
one we already have (the challenge set in `docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §4 and the
worked examples in `docs/SVG_BEHAVIOUR_PLAN.md` §9), filtered by what the students will produce:
GAME SHOWS and LATE-NIGHT TALK SHOWS. Complicated graphics that fit those shows are the test.

> Because we already have the hard-coded quiz backend control panel for the graphics, I would like
> to see the other graphics. We had a list of them, so I would want us to first figure out those
> and not concentrate on the quiz because we already have that one working. With our students,
> we're going to be doing game shows and late-night talk shows. Any complicated graphic that would
> fit those shows would be a good way to test what we can do. We could just investigate what type
> of graphics could fit those shows. What does American TV already use that needs special
> commands? Try to build it, import it, and see if our system works.

The method is the plan's own reuse test made real: find the graphic, draw it as an SVG, import it
through the wizard, and report whether the shipped recipes and extras bind it, whether it needs a
new field kind or recipe, or whether it breaks the model.


## owner-decisions-2026-09-07

**NoaCG pivots to free and open source, with no paid surface and none planned.** This retires
"the only paid surface is hosted AI without a BYO key", which had stood since the project began.
Hosted AI does not disappear; it stops being a product and becomes a subsidy the project carries.

> we will pivot to open source and free, at least for the next few years
>
> yes we need to get all monetization texts out from our files and be clear about it being free
> and open source on our landing page. we need to drop the word premium from our front page, its
> free and the whole prosuction cycle from template/create to run the show through our online
> client.

What it changes, and what it deliberately does not:

- The root `AGENTS.md` identity line, `docs/GOALS.md`'s operating principles and the open "when do
  paid tiers exist" question in `docs/AI_PLATFORM_PLAN.md` §13 now all say the same thing.
- The landing page leads with "Free & open source" and the no-lock-in section names the AGPL,
  because open source is the strongest proof of the promise that section already made.
- **"Premium" survives in `src/` on purpose.** Fifty-one occurrences in the AI prompts, the design
  vocabulary and the template comments mean "high production value", not "the paid edition", and
  they carry real weight in what the generator produces. Only the marketing copy lost the word.
- `docs/GOALS_ARCHIVE.md` keeps its original wording. An archive records what was true at the
  time; rewriting it would destroy the evidence that the direction ever changed.

The horizon is "at least the next few years", so this is a ruling and not a permanent fact about
the project. It stands until the owner says otherwise.

## owner-decisions-2026-09-08

**The broadcast text size floor becomes type-aware. It stops being a universal 50px blocker.**
This answers the question §23.1 left open on 2026-08-30 and that two Pro Harness rounds ran into:
the floor was never re-ratified for enforcement, and it was refusing correct work.

> Make it type-aware, not a universal 50 px blocker.

What was measured before the ruling, so a later session can test the why rather than the rule:

- The floor refuses **all 12 shipped quiz boards** - 36-40px primary against a 49.68px floor, read
  through the instrument itself rather than off the CSS.
- It refuses the platform's own neutral lower-third scaffold at 48px, and the Pro Harness control
  run excuses that in its own words ("bar the owner size table").
- §23.1 measured it failing **312 of 489** shipped designs.
- In the 2026-09-07 harness round it was the ONLY blocking finding on two of nine cells, and on
  three of the previous round's.

The cause is not the number. `roleFor` in `src/validation/readabilityCheck.ts` calls the LARGEST
informational text "primary", so on a dense board the primary element is the one carrying the most
words and therefore having the least room - a floor calibrated on a lower third's name strap
landing on a question that has to sit above four answers.

**The ruling is the outcome, not the mechanism.** "Type-aware" is what the floor must stop being
blind to; which signal it keys on is an engineering question, answered from the shipped corpus.

---

## 2026-09-09 - spend Codex hard this week, on the new model at medium

> *"Can we use GPT-6 Astra medium? Astra is GPT's new model so it's very good. I think we should try
> to use it. Of course it will drain our usage very fast but it's okay to use Codex this week as
> much as we can."*

Two decisions in one sentence, and they have different shelf lives.

**The spend is his and it is time-boxed to the week.** Nothing in the repo rations the Codex
subscription, so this changes no mechanism; it removes a hesitation. A row that would have been kept
for Claude because Codex headroom looked precious goes to Codex instead, until the week is out.

**The effort default moves to `medium`, and this is not a relaxation of the floor.** His 2026-08-30
ruling set high as the norm and **medium as the floor**; medium is inside the range he already
sanctioned, chosen deliberately here to buy throughput rather than drifted into by a config nobody
read - which is what actually happened on 2026-08-30. Low stays reserved for mechanical retrieval.
`DEFAULT_EFFORT` in `scripts/codex-rescue.mjs` carries it, with `DEFAULT_EFFORT_REVIEW_ON` set to
**2026-09-16** and a test that fails once that date passes while the default is still medium.

**The model was already astra.** `gpt-6-astra` is the CLI's own default as of 0.154.0-alpha.6 - the
2026-09-09 re-probe found the "only one model works on this subscription" claim false, and
`~/.codex/config.toml` now names astra rather than `gpt-5.6-sol`. So nothing had to be pinned to
honour this; `--model` is still forwarded when a caller names one.

**What the week is for, stated so it can be settled rather than remembered.** The premise is that
astra is very good. That is worth testing rather than assuming, and the delegation ledger already
records what settles it - model, effort, outcome and cause per task class. As of this ruling there is
**one worker-attributable outcome per model**, which ranks nothing. On 2026-09-16, read
`npm run harness:usage` and either extend the trial with the evidence or put the default back to
high.

One caveat worth carrying, because it explains why the ledger is thin: the two astra delegations that
failed on 2026-09-09 failed on OUR invocation, not the model - a delegation can only write inside the
directory the launching session sits in, and the standard row recipe opens by asking for a branch.
Both are logged `cause: prompt` and excluded from pool quality for that reason.

## 2026-09-09 - the date is the 25th, and the 12th is no longer the pressure

Paraphrased from speech in the day-wave brief, so the intent binds and the wording does not:

> The Friday deadline we have in a few days is okay, you don't have to stress about that. The
> deadline is the 25th: students and YLE people trying NoaCG. We owe one presentation and a
> step-by-step guide, over two capabilities - SVG import, ending in their custom graphics playing
> on their systems, and the CLI working smoothly enough that a graphic goes from Codex or Claude
> Code to the NoaCG player in minutes.

What it changes: `docs/GOALS.md` `## NOW` names 2026-09-25 and the two deliverables, and the
session is scripted as beats with a costed gap list in `docs/DEMO_2026-09-25.md`. What it does not
change: the 2026-09-12 student production still happens, as the rehearsal. He relaxed its
pressure; he did not cancel the quiz or the scoreboard. For the question of what current work
serves, this supersedes the 2026-08-22 ruling that named the 12th.
