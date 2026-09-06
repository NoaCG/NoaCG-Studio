---
v: 2
source: owner
kind: ask
raised: 2026-08-26
state: advanced
asked: "steer users to their own Claude Code - better and cheaper - before any key entry"
note: 2026-09-06 shipped the steer in the studio (AI step card, settings-sheet pointer, BYO hint); /docs ordering and the entry card are still open
---
# Steer users to their own coding agent before asking them for a key

**Filed:** 2026-08-26. **Source:** owner ruling, in session.
**Re-confirmed and strengthened 2026-09-03**, unprompted: *"Yes, we should steer users toward the
CLI. That is the preferred way of using AI with NoaCG."* That settles the open question this file
carried about how hard to push. It is not a hint offered beside the tier picker - the CLI is the
PREFERRED path and the copy should say so plainly. This is also now the oldest unstarted receipt
on the shelf, and the CLI it steers people to got 89% lighter on 2026-09-02, so the thing being
recommended is in much better shape than when this was filed.

The owner's words: **steer users to their own Claude Code - better and cheaper - before any key
entry.** Today "Create with AI" opens with a tier picker whose Custom/BYO path asks a
non-technical person for an API key, and nothing anywhere tells the user that they may already own
a better route to the same graphic.

## Why

Three separate reasons, and each would be enough on its own:

1. **It is honestly the better result.** Somebody with a Claude Code subscription already has a
   frontier model and an agent loop. The `noacg` CLI and MCP server exist precisely so that agent
   can scaffold, validate, bench, screenshot and save into their library (`docs/AGENT_CLI.md`).
   That path beats a single hosted generation and it beats a BYO key wired into our wizard.
2. **It is cheaper for them.** They are paying for it already. Asking for a second credential and
   a second bill for a worse answer is the wrong recommendation, and we are the ones who know it.
3. **A key-entry field is a wall.** The product's whole posture is that there is no login wall
   (root `AGENTS.md`, "Auth posture"). A key box on the one door marked AI is the same wall with a
   different sign, and it is the first thing a curious user hits.

The gate for entering a key should be "I have one and I want to use it", never "this is how you
get an AI graphic here".

## What it would take

Copy and ordering, not architecture:

- The AI entry card and its settings sheet name the agent route FIRST, with the one command to
  install the skill, and the key field second and clearly optional.
- `/docs` gets the same ordering. The agent-door guide exists; it is not what a user meets first.
- Nothing hosted changes. Lite stays the zero-setup path for somebody with no agent at all.

The work is deciding the wording, then applying it in three or four places. Wording is the hard
half: it must not read as "go away and use something else".

## Evidence

- Owner, 2026-08-26, in session: users' own Claude Code is "better and cheaper" than key entry.
- `docs/AGENT_CLI.md` - the CLI, the MCP server and the shipped `noacg-graphic` skill are already
  built and published; this is a signposting gap, not a capability gap.
- `docs/ADMIN.md` §10 and the memory entry `model-cost-policy` - frontier models are only ever on
  the user's OWN key, which is the same principle stated from the cost side.

## What shipped (2026-09-06, branch `claude/i-steer-to-the-cli`)

The studio half, as the receipt asked: the agent route is named FIRST, plainly as the preferred
way, before any tier and any key. Nothing hosted changed and nothing runs in the studio.

- **The AI step** now carries `src/components/wizard/steps/ai/AgentRouteCard.tsx` directly under
  its section head: one always-visible line tagged *Preferred* ("Have Claude Code or Codex? Your
  own agent is the best way to make graphics with NoaCG, and you already pay for it."), and
  behind *Show me* what the agent does (draws, validates in NoaCG's own gate and playout bench,
  saves into the library), what it honestly needs (that subscription and a terminal), the two
  Claude Code install lines as a selectable block, the Codex pair, the `/docs#agent-install`
  paste-one-prompt link, and a closing line for people with no agent so the tiers never read as a
  punishment. Every command is `docs/AGENT_CLI.md`'s Distribution table verbatim.
- **The ⚙ AI settings sheet** leads with a pointer to that card, above Lite / Pro / Bring your
  own key. It is a pointer rather than a second copy, so the commands live in one place.
- **The Bring-your-own-key tier's hint** ends "If you have Claude Code or Codex, you do not need
  this." That is the steer at the key moment itself: loud where the decision is made (the card,
  the sheet's first line), one sentence where the key is typed. An interstitial in front of the
  field was considered and rejected as the brush-off this receipt warns against - the visitor
  who reaches the field has read the card twice by then.
- The card opens by itself on exactly the condition that already opens the settings sheet by
  itself (no Lite offered, nothing configured), which is the build where the key field is about
  to be on screen; a hosted Lite visitor meets the one line and opens it when they want it.
- Not touched, on purpose: `AiProviderSettings` (the key field itself) is shared with the video
  harness and app Settings, where the agent route does not apply; the Entry card's three-line
  height reserve leaves no room for a fourth line, and the AI step is one click past it.

Pinned by `e2e/ai-tiers.spec.ts` (written in a container with no browser, so it has not yet run;
the wizard's night suite runs it). Still open from "What it would take": the `/docs` ordering
(the agent-door guide is not what a reader meets first there) and whether the Entry card earns a
clause once the three-line reserve is re-measured.
