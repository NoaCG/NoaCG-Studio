---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
asked: "The wizard instruction file being at 99% is exactly the kind of problem I expect you to solve autonomously. Compact/modularize it without losing important instructions. More broadly, all our instruction/context files keep growing, so we need a systematic way to remove stale information and modularize them before this becomes a recurring problem."
note: 188d2745 made it systematic for the always-loaded layer - a 3 KB root budget, `learn` refusing a ** scope without --always, the ladder in contracts/README.md and `npm run audit:instructions` in the monthly quality review; the conditional layer (nested contracts, broad .claude/rules globs) is the open half
---

**2026-09-03 - part 1 done, and part 3 has its first mechanical test.** `claude/a-agents-md-headroom`
took 11,343 bytes out of the root `AGENTS.md`, which all 52 chains load: the repository map and the
ten-page URL table to `docs/ARCHITECTURE.md`, the incident behind each git rule to a new
`docs/BRANCHING_AND_LANDING.md`, and two verification rules back to `docs/VERIFICATION.md`, which
already held their measurements. Nothing was deleted - an audit script checked every removed line
against the file that received it. `src/components/wizard` went from 365 bytes free to 9,708, the
chains over 80% went from ten to one, and the ceiling ratcheted 112,000 -> 110,000.

**Part 2 is done by arithmetic rather than by sweeping.** The nine other chains that printed the
warning were all paying for the same root file; none of them needs its own pass now.

**Part 3's staleness pass turns out to be cheap and worth wiring as a gate.** Extracting every
backticked token from a contract and checking each path and symbol against the tree took a
twenty-line script and answered "is any of this describing something that no longer exists?" for
three contracts in seconds - the answer was no for all three, which is itself the finding that
stopped the wizard file being cut further. It belongs in `npm run build` beside
`check-docs-index`. The evidence-date idea is untouched.

**2026-09-04 - the owner's four cuts landed, and they are the end of what editing buys.** The
sibling receipt `agents-md-byte-headroom` closed with them. The wizard chain went 91.2% -> 89.6%
(100,292 -> 98,541 bytes used, 11,459 free) and the templates chains 79.5% -> 77.2%. **The 85% that
receipt aimed at is not reachable from those cuts, and the measurement says why**: a
sentence-coverage pass over the rewritten Import/SVG block found 4 of its 54 sentences present in
`docs/SVG_IMPORT_PLAN.md` or `docs/IMPORT_MVP.md`, and all four are rules the ruling says to keep.
The wizard's contract is not restating those plans - it holds rules they do not. Combined with the
2026-09-03 findings that the file is not stale and has no split (a child contract under `wizard/`
loads on TOP of it, not instead of it), **the remaining levers are structural, not editorial**:
moving the import steps out from under this contract in the source tree, or content
`src/components/AGENTS.md` gives up. Neither is a byte problem, so neither should be started to make
a percentage. **Free bytes is the honest measure, not the percentage** - 365 free on 2026-09-02,
11,459 now.

One thing worth knowing before the next pass: **a delegate will hit a byte target by deleting
symbols**. The Codex run that did these cuts reached the number exactly and dropped 17 backticked
names that live in no other file (`withUniversalMotion`, `proposeFollowers`, `svgFitNodes`,
`assets/svgGeometry.ts`, `.wz-help-strip` among them), pointing at a section that did not contain
them. A line-level diff audit cannot catch that, because the prose was rewritten rather than moved;
what caught it was extracting every backticked token from the pre-edit file and checking each one
against the post-edit file and the receiving docs. **That symbol-survival check is the instrument
this work needs**, and it is the same shape as the staleness pass below.

**2026-09-05 - the staleness gate landed** as `scripts/check-contract-freshness.mjs`, part of
`npm run build`. It scans every `AGENTS.md`/`CLAUDE.md` chain and every workflow markdown, and
fails the build on a backticked `scripts/...`, `docs/...`, source path or `npm run` reference that
names something git does not have - the mechanical half of part 3, so a contract can be trimmed
without leaving a dangling pointer that rots unread. It exempts glob and placeholder patterns,
gitignored generated files (via `git check-ignore`, so the verdict matches CI), and the
transient-by-design directories (`docs/handoffs/`, `docs/backlog/`, `docs/acceptance/`). On the day
it landed the only durable rot it found across 131 contracts was already fixed or gitignored.

**2026-09-16 - the orchestrator core has room again, by relocation and not by trimming.**
`claude/qf-orchestrator-core-headroom` took `.agent-workflows/orchestrator.md` from 199 of 200
lines to 168, with the common path unchanged at 634 of 640. The method was the core's own test,
applied to every rule: does it fire BEFORE its module loads? A rule that does keeps one sentence
in the core and its mechanics move to the module; a rule that does not leaves whole. Ten rules
failed the test in part - the wave-state file's format (15 lines, now the new every-plan module
`orchestrator/wave-state.md`), section 6's answer-it-yourself mechanics and the pick (now
`pushback.md`, which owns sections 4 and 6), the mechanism order behind "every wave improves the
orchestration system" (already in `coherence.md`, so the core now points there), "where the
collision pass is UNSURE, chain" with its owner quote (`collisions.md`), the standing-ask owner
quote and the per-receipt rule (`pushback.md`), and five restatements of mechanics that
`collisions.md` already carried word for word or that `routing.md` and `specs.md` now carry after a
one-sentence addition each. Nothing was ambiguous enough for a
`walk-p` item. The symbol-survival check the 2026-09-04 entry asked for ran as a scratch script:
78 backticked tokens in the pre-edit core, 60 still in the core, 18 in a module this branch edited,
0 lost - and it needed a CRLF normalisation, because `git show` yields LF while the checkout holds
CRLF, so a token wrapped across a line break read as lost until the endings matched. That script
is worth landing beside `check-contract-freshness.mjs` the next time a contract is compacted; it
is not in this commit because the gate script is held by an in-flight branch.

**What is still open:** the common path is the tighter number now - 634 of 640 with six every-plan
modules, and `codex/orchestrator-durable-recovery` frees about 11 lines of it when it lands. That
number still gates the orchestrator half of `docs/backlog/memory-store-drain.md`, and wants the
planner/watcher session split the 2026-09-05 orchestrator review proposes; the core's 32 free
lines are what the ten routed memory rules can now draw on. The evidence-date idea is untouched.
The byte-reserve gate landed 2026-09-03 - `scripts/check-shared-instructions.mjs` fails the build
once a chain has less than 4 KB free.

# Instruction files only ever grow, and nothing removes what stopped being true

**Filed:** 2026-09-03. **Source:** owner ruling, after two sessions in two days routed around a
full instruction chain rather than reporting it.

## Why

The contracts are load-bearing: an agent reads them before touching an area, and a rule that does
not fit in the window is a rule that does not fire. Today the mechanism only pushes one way. Every
session that learns something adds a paragraph, and **nothing anywhere removes one.** The byte
ceiling then converts an editorial problem into a build failure at the worst possible moment - the
next session to touch that area.

The measured state on 2026-09-03, from `npm run check:shared-instructions`:

| chain | used | free | |
|---|---|---|---|
| `src/components/wizard` | 111635 | **365** | **99.7%** |
| `src/templates/importedDesign` | 98825 | 13175 | 88.2% |
| `src/templates/types` | 95250 | 16750 | 85.0% |
| `src/templates/infographics` | 94007 | 17993 | 83.9% |
| `src/templates/lowerThirds` | 93826 | 18174 | 83.8% |

**And it is not only the AGENTS.md chains.** Writing this file's own rules into the orchestrator
contract on 2026-09-03 pushed its always-loaded common path to **640 of 640 lines - exactly the
ceiling, zero headroom** - and getting there required condensing two existing sections and moving a
third into a branch module. The next rule added to that contract fails the build. So the shrinking
mechanism is owed to `.agent-workflows/orchestrator*` on the same terms as the AGENTS.md chains,
and the same trap applies: the cheap response to a full contract is to file the rule somewhere it
does not belong.

Ten chains sit over 80%. The wizard chain has **365 bytes** - roughly four lines. A 2026-09-02
session (row H) spent 244 of them and deliberately filed its new contract in a different directory
to avoid the ceiling; a second (row E) had already done the same the day before. **Two sessions in
two days worked around the limit instead of reporting it**, which is how a warning stops being a
warning: the cheapest response to a full file is to put the rule somewhere it does not belong, and
the contract then rots by dispersal rather than by deletion.

## What it would take

Three parts, and the third is the one that stops this recurring.

1. **Buy real headroom on the wizard chain now.** Not a trim to get under the warning - that games
   the measurement, which the 2026-09-02 headroom session explicitly refused to do. Move whole
   sections into the directory they actually describe, the way the eight template categories were
   split on 2026-09-02: the people editing that code still load it, every sibling stops paying.
2. **Sweep the other nine chains over 80%** with the same method. `condense-doc` is the skill for
   the editorial half; the structural half is the split.
3. **Give the contracts a way to SHRINK, which is the missing half.** Candidates, in the order a
   session should judge them:
   - A **staleness pass** with a real test: for each rule, does the thing it describes still exist?
     A rule naming a file, function, script or flag that is gone is not a judgement call - it is
     mechanically detectable, and `check-docs-index` already proves that shape of check works.
   - An **evidence date** on rules that record an incident, so a reader can tell a live constraint
     from a war story. Not automatic deletion - the war stories are often the most valuable lines -
     but visible age makes the review possible.
   - The **ceiling should fail loudly rather than warn**. Both halves landed 2026-09-03, in that
     order - the headroom first, then the failure, because landing the gate first would have
     converted every wizard row into a red build. The gate fires on a 4 KB byte RESERVE rather
     than the 99% the receipt originally asked for; the reasoning is in the reserve's own comment
     in `scripts/check-shared-instructions.mjs`.

## Ambiguity goes to the owner as a one-line walk question, never as a blocker

The owner ruled on 2026-09-03: *"If there are genuinely ambiguous content decisions, put simple
questions in the walk such as 'Is this still relevant?' or 'Can this be removed?' I can answer
those quickly. They should not block the work."* So a section whose relevance a session genuinely
cannot judge is filed as a `kind: walk-p` owner-queue item quoting the section, and **the rest of
the compaction ships in the same commit.** Waiting for the answer is the failure mode.

## Evidence

- `npm run check:shared-instructions`, 2026-09-03 - the table above.
- `docs/handoffs/2026-09-02-e-agents-md-headroom.md` - the 2026-09-02 session that took the warning
  count from 17 of 39 chains to 10 of 52, moved prose verbatim rather than retyping it, and refused
  to trim a row purely to get a number back under the line.
- Row H's handoff, 2026-09-02: spent 244 bytes and filed its contract elsewhere.
- Owner receipts `agents-md-byte-headroom` and `agents-md-warning-fails-at-99`, both closed by
  2026-09-04; `node scripts/owner-receipts.mjs --closed` reads them back out of git.

## Trend

- 2026-09-03: root `AGENTS.md` gave up 11,343 bytes; chains over 80% of the byte budget went from
  ten to one. The orchestrator's always-loaded common path sat at **638 of 640 lines**.
- 2026-09-08: the byte half is still healthy - the three tightest chains are
  `src/components/wizard` (71,767 of 110,000, 65%), `src/ai/pro/harness` (64.8%) and
  `src/templates/importedDesign` (62.3%), none near the 4,096-byte failure margin. **The LINE half
  has run out.** `npm run check:shared-instructions` reports the orchestrator core at **198 of 200
  lines** and the common path at **640 of 640**. Zero headroom, down from two lines in five days.
  The next sentence added to `.agent-workflows/orchestrator.md` or to any of its five every-plan
  modules fails the build, and the modules already carry 107 KB across eleven files against the
  15 KB core. This is now the blocking item, not a background one: `docs/backlog/memory-store-drain.md`
  names it as the reason ten routed memory rules still have nowhere to go, so two backlog items are
  waiting on these two lines.
- 2026-09-15: the common path has room again at **629 of 640** lines (`routing.md` went from 72
  lines to 60), but the core is at **199 of 200**, one line from failing the build. The byte chains
  are still comfortable: `src/components/wizard` 65.8%, `src/ai/pro/harness` 65.3%,
  `src/templates/importedDesign` 63.0%. What grew is the workflow folder: `.agent-workflows/` went
  from 250.6 KB to 278.8 KB in the week (+11%). Most of it landed in modules loaded on demand,
  which is the right place: `orchestrator/hosts.md` (new, 12.2 KB), `orchestrator/specs.md` (new,
  6.7 KB) and `orchestrator-week.md` (5.3 to 16.0 KB). One is not cheap. `check.md` went from 13.0
  KB to 17.8 KB (+36%), and `/queue-merge` reads its stamp, so nearly every finishing session pays
  for it. Root `AGENTS.md` is 16,170 bytes (15,841 on 09-08). The always-loaded
  `.claude/rules/everywhere.md` is 7,859 bytes and flat. The per-document 32 KB cap the review
  brief cites is only the fallback in `check-shared-instructions.mjs`. The enforced limits are the
  110,000-byte chain budget with its 4,096-byte reserve, 25 lines per wrapper, and the two
  orchestrator line caps.
- 2026-09-16, `docs/GOALS.md`: condensed to **190 of its own 200-line cap** and given a gate,
  `npm run check:goals-budget`, which reads the number out of the file's first paragraph rather
  than holding a second copy of it. **190 and not 199 on purpose**: `codex/ograf-studio-architecture-research`
  is in flight and inserts seven lines under `## NEXT - OGraf-first`, so the reserved headroom
  lands it at 197. Anyone filling the file back up to 196 before that branch lands reds the build
  rather than losing anything, which is the gate working, but the ten lines are spoken for.
  Recorded here on 2026-09-16 when row QG's handoff was drained; it was that handoff's only home.
- 2026-09-16: the core is at **168 of 200** lines and the common path at **634 of 640**, with a
  sixth every-plan module (`orchestrator/wave-state.md`). Everything that left the core moved into
  a module, most of it verbatim and the rest paraphrased into a sentence the module already had;
  the symbol-survival check found 0 of 78 backticked tokens lost. Neither cap moved.
