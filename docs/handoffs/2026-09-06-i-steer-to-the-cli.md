# 2026-09-06 - row I: the user's own coding agent comes first on the AI door

Branch `claude/i-steer-to-the-cli`, cut from `8c1b39ba` (= `main` at the time), three commits
(`8132d64`, `4cf668b`, `429cd0a`). Cloud container: no browser, no queue, nothing pushed. The
orchestrator integrates this branch.

The brief: the owner's oldest unstarted receipt, `docs/backlog/byo-key-and-create-with-ai-guidance.md`
- steer users to their own Claude Code or Codex before any key entry, as the PREFERRED route,
plainly, without reading as a brush-off. Copy and ordering; nothing hosted changes; no AI
feature is built.

## What shipped

Three surfaces, met in this order, all before any key field:

1. **`src/components/wizard/steps/ai/AgentRouteCard.tsx`** (new), rendered by `AiStep` directly
   under the section head, above the drop zone and the brief, and never behind the sign-in gate.
   One visible line tagged *Preferred* ("Have Claude Code or Codex? Your own agent is the best
   way to make graphics with NoaCG, and you already pay for it."); *Show me* unfolds what the
   agent does, what it needs (their subscription and a terminal), the two Claude Code install
   lines as a `user-select: all` block, the Codex pair, `/noacg:graphic`, the `/docs#agent-install`
   paste-one-prompt link, and a closing line for people with no agent. That closing line is
   build-aware (`hostedOffered`): on a hosted studio "nothing to install", on a self-hosted one
   it points at Bring your own key, because Generate there stays disabled until a key exists.
2. **The ⚙ AI settings sheet** leads with a pointer to that card, above Lite / Pro / BYO. A
   pointer rather than a second copy, so the commands live in one place; its *Show me* opens the
   card and scrolls to it after the body renders (nonce + effect, `block: 'start'`).
3. **The Bring-your-own-key tier's hint** now ends "If you have Claude Code or Codex, you do not
   need this", and says "your own account with ..." rather than "key" (Hugging Face issues tokens).

The card opens by itself on exactly the condition that already opens the settings sheet by itself
(no Lite, nothing configured) - the build where the key field is on screen at once. Every command
is `docs/AGENT_CLI.md`'s Distribution table verbatim, and that section now names the card as a
hand-kept copy beside `docs.html`'s.

Design default decided (DO step 4, not asked): the steer is LOUD where the decision is made (the
card, first line of the sheet) and ONE SENTENCE where the key is typed. An interstitial in front
of the key field was rejected as the brush-off the receipt warns against.

Not touched, on purpose: `AiProviderSettings.tsx` (the key field itself) is shared with the video
harness and app Settings, where the agent route does not apply; the Entry card's three-line
height reserve (`e2e/wizard-entry-fit.spec.ts`) has no room for a fourth line; `docs.html` was
landed tonight by another row, so the receipt's "/docs gets the same ordering" stays open.

Also: `src/components/wizard/AGENTS.md` records the rule (9,510 bytes of headroom left on that
chain); the receipt moves to `state: advanced` with a "What shipped" section; the copy baseline
drops one em-dash the rewritten hint gave up; `docs/acceptance/owner-queue/2026-09-06-i-your-own-agent-comes-first.md`
carries the route.

## /check (run on `429cd0a`)

- **review: delegated** - the code-review skill returned five findings on this branch and these
  files (scope matched). All five acted on: the no-agent line false on BYO-only builds (fixed,
  `hostedOffered`); the scroll-before-render (fixed, effect); "Hugging Face key" (fixed); the
  owner-queue item missing from the first commit (written in the check commit); the fourth
  hand-kept copy of the install lines (recorded in `docs/AGENT_CLI.md`, no checker yet - see
  below).
- **simplify: inline** - the skill returned fan-out instructions, so the four angles ran here:
  the inline `<code>` rule duplicated `code.inline` (reused, rule dropped); the href constant was
  exported to nobody (made local). Nothing else.
- **verify: inline** - `npm run build` green on the working tree, stamp
  `claude/i-steer-to-the-cli@4cf668b` and the same tree committed unchanged as `429cd0a`.
  `check:copy` and `check:client-neutral` pass inside it; `check-owner-queue`, `owner-receipts`
  and `e2e-affected.test.mjs` pass. **No browser exists in this container**: the new case in
  `e2e/ai-tiers.spec.ts` is written and unrun, and the reviewer's attempt to run the file found
  `/app` never mounts here (four pre-existing cases fail identically at the shared helper).
- **taste: not applicable** - no graphic, template, fit or import code moves.

**No verdict stamp**: the worktree isolation in this container refuses any write under the shared
`.git`, so `<git-common-dir>/noacg-jobs/checks/claude-i-steer-to-the-cli.json` does not exist.
The mode lines above are the record; whoever runs the browser gate on `429cd0a` (or later) writes
the stamp with the results of that run.

## What the next session owes before this lands

1. **Run `e2e/ai-tiers.spec.ts` on a machine where `/app` boots** (`npm run test:e2e:focus:queued`
   or the queue; the affected plan escalates to the full suite because `scripts/copy-baseline.json`
   and a contract moved). The new case asserts: the card is open by itself on the Lite-off build
   with the exact install commands and the `/docs#agent-install` link, the sheet's pointer
   precedes the tier picker in document order, the BYO hint carries "you do not need this", and
   Hide then the sheet's *Show me* round-trips. Also re-run the wizard height spec
   (`e2e/wizard-entry-fit.spec.ts`) is NOT needed - the entry card did not change.
2. **Look at it.** The receipt's hard half is whether the copy reads as "the better road you
   already own" and not "go away". The owner-queue item names that as the thing to judge.

## Open, recorded on the receipt

- `/docs` ordering: the agent-door guide is not what a reader meets first on `docs.html`.
- Whether the Entry card earns a clause once its three-line reserve is re-measured.
- A drift check between the studio card's commands, `docs.html`'s and the Distribution table -
  today a prose rule in `docs/AGENT_CLI.md`; `cli/scripts/build-skill.mjs --check` is the natural
  home if the identifiers ever move again.
