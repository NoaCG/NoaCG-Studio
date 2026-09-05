# The Pro Harness: the loop is built and proven at zero tokens; the paid round is the next step

Branch `claude/noacg-pro-graphics-harness-09576d`, from `main` at `e58065c6`, main taken back in
at `a3dcc68e`. The owner's brief of 2026-09-05 asked for an investigation, an architecture and a
prototype of NoaCG Pro as an evidence-driven agent loop that makes any custom graphic from a cheap
model and ends with a standard template. `docs/PRO_HARNESS_PLAN.md` is the architecture and the
record; `src/ai/pro/harness/` is the loop.

## What's next

1. **Run the paid round of `docs/PRO_HARNESS_PLAN.md` §10 - needs: money.** One command, over the
   same 21 briefs the iterate loop was read on, so the harness can be held against its 19 of 21
   clean at $0.118 a graphic:

   ```bash
   node scripts/pro-harness-spike.mjs --generate --route=vercel:google/gemini-2.5-flash --vision --max-cost=3 --out=pro-harness-out-gemini
   ```

   Browser work: queue it, with this checkout's dev server running (`npm run dev:worktree`) and
   nothing else on the port. The cap is a ceiling; the plan's estimate is under $1 for 21 briefs,
   UNVERIFIED until the ledger says otherwise. Then a blind page from `shots/`, the owner's read,
   and the verdict into `docs/AI_ATTEMPTS.md`. The zero-token control (`--control`) passed on
   2026-09-05 (`CONTROL OK`), so a paid failure is a finding about the model or the knowledge, not
   the rig.
2. **The bridge workbench** - a second `Workbench` over the `/bridge` page's own functions, the
   door the `noacg` CLI already drives, so the harness runs from any Playwright host and can be
   hosted in a sandbox the way the render worker is. This is what turns the bench into a product
   path; the plan's §5.4 states the hosting question it has to answer (sandbox seconds per
   graphic).
3. **Exemplar retrieval per type, as measured numbers** - the nearest catalog designs' type
   sizes, paddings and gaps in the instruments' own units, handed to the model as a card. Never
   their code (the anti-anchoring rule). Why: the knowledge cards carry ranges; a cheap model
   designing a scoreboard would do better with the numbers three shipped scoreboards actually use.
4. **The product path** - a Pro request that resolves to no composed type routes to the harness
   inside the existing reservation, with the wizard's Finish unchanged. Only after 1 reads well.
5. Optional: fold the bench's measure core into the shared rig
   `docs/backlog/taste-review-shared-rig.md` names; `scripts/pro-harness-spike.mjs` is the fourth
   copy of the mount-and-measure recipe and says so in its header.
6. Optional: a card whose taste numbers are ratified only for lower thirds (typography ranges) is
   read by every type; the paid round will show whether a scoreboard's figures want their own
   ranges, and `knowledge.ts` is the one place to widen them.

## What was decided, and why it matters to the next session

- The model edits THREE regions of a platform scaffold (design css, the box markup, the ANIMATION
  region in the authoring grammar) and everything else is refused before a render. A type whose
  machine lives in the region has a platform-owned region. Agent-authored machines stay the P2
  question.
- A repair round needs new evidence: same findings twice stops the loop, a regression keeps the
  best round, a clean earlier round is delivered even when a later repair broke it. Do not add a
  "look again" pass; the owner measured it as useless.
- The critique is advisory, once, after a clean gate. Only `lineOnText` ever calibrated, and the
  deterministic instruments own that class anyway.
- The AI SDK (`ai@7`) is now a dependency, used only by the harness. The live tiers still call
  the gateway through `api/_lib/aiGateway.ts`; moving them is a transport decision the reservation
  accounting has to survive, and nothing here depends on it.

## One thing that cost time

`node scripts/dev-worktree.mjs --help` STARTS the dev server (there is no help flag). The server it
left on this checkout's port was reused by the queued integration run, whose offline guard refused
it, exactly as designed. Kill the stray server before queuing an e2e run.
