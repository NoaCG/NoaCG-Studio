# The first paid Pro Harness round: three platform faults, and the design question still open

Branch `claude/noacg-pro-harness-comparison-5c7fa0`, from `main` at `8df51e2c`. The brief was the
paid §10 comparison of `docs/PRO_HARNESS_PLAN.md` against the iterate loop's 19-of-21 at $0.118 a
graphic, with a €3 cap. **$0.42 spent. The comparison is NOT answered** - the round found three
faults in our own platform before it measured a single design decision, and each one was fixed and
re-run rather than worked around.

Full record: `docs/AI_ATTEMPTS.md`, "The Pro Harness animation region, and the two platform faults
under it" (the third is in the same entry). Rules: `src/ai/pro/harness/AGENTS.md`.

## What was wrong, in the order it was found

1. **The harness restated the grammar instead of naming the breach.** `animation-unconvertible`
   said "stay inside the authoring grammar" - the grammar the model believed it had written. On
   `lt-markets` the whole defect was two absent declarations; pasting `var easeIn` and `var easeOut`
   into the model's own bytes makes the identical code parse. Four rounds and $0.072, then the model
   stopped and reported that the requirements contradicted each other. `animationBreach`
   (`src/ai/pro/harness/patch.ts`) now names the first unmet precondition, pinned by test to the
   predicate `importAnimData` actually applies.
2. **The importer read single-quoted selectors only, and invented `'?'` for a target it could not
   read.** That string reads as a selector the whole way through, survives `parseAnimData`, and
   throws inside GSAP on play. A converter failing OPEN where its contract is to keep the author's
   code. **It reaches `bridgeApi.normalize`, so the agent CLI door too** - this is the one an owner
   should care about beyond the bench.
3. **The bench settled a flat 1800ms before measuring and shooting.** A 2.9s entrance was
   photographed at 1.8s, so a correct graphic's frame shows a missing line over dead space. The cell
   delivered clean and deserved to; the instrument was early. **Every frame currently on disk was
   shot under the old wait and must be re-captured before any blind read.**

My first fix for (2) was wrong and `check-catalog-emit` caught it: refusing any empty target list
broke four corner bugs that use `tl.fromTo([], …)` deliberately. The rule turns on whether the list
could be READ. All 504 designs emit byte-identical code.

## What the round did establish

- **The loop works and is cheap.** `lt-caster` on the untouched loop: clean gate, one critique, one
  advisory repair, delivered at **$0.0298** against the iterate loop's $0.118. After the fixes,
  `lt-markets` and `lt-latenight` - which between them had burned $0.18 producing nothing - delivered
  at $0.039 and $0.041, in two rounds and one.
- **No failure was compositional.** Not spacing, not typography, not hierarchy. The dimension the
  round exists to test is still untested.
- **One honest refusal**, and it is the loop behaving correctly: `lt-caster` (v3) stalled on primary
  text at 48px against the 50px floor, twice. Worth noting that §23.1 recorded that floor failing
  312 of 489 shipped designs and the owner has not re-ratified it for enforcement.

## What is next

1. **Resume the bank.** 3 of 21 recorded, resumable and cheap:
   ```bash
   node scripts/pro-harness-spike.mjs --generate --route=vercel:google/gemini-2.5-flash --vision --max-cost=2.00 --out=pro-harness-out-gemini-v3 --resume
   ```
   Needs this checkout's dev server (`npm run dev:worktree`, port 5246) and nothing else on it.
   Roughly 6 minutes a cell, so ~2 hours for the remaining 18, around $0.70 at the observed rate.
   **Budget: €3 was authorized and $0.42 is spent; do not exceed the balance without asking.**
2. **Re-capture the three existing cells' frames** before building the blind page - they were shot
   under the flat settle. Then `node scripts/pro-harness-review.mjs pro-harness-out-gemini-v3`
   writes `review.html` + `notes.md` + `key.json`, and the owner's read goes into `AI_ATTEMPTS.md`.
3. **State the confound in whatever verdict comes out.** §23.1's baseline is `gemini-3.7-flash`;
   this round is `gemini-2.5-flash`, the route hosted Pro actually spends on. Two variables moved at
   once, so no rate here is the harness alone.
4. **Then the bridge workbench** (`docs/PRO_HARNESS_PLAN.md` §5.4) - a second `Workbench` over
   `src/bridge/bridgeApi.ts` driven headless, and the sandbox-seconds-per-graphic question it has to
   answer. Note for whoever builds it: `bridgeApi.normalize` returns the same generic "could not be
   converted" sentence the harness finding used to, and `animationBreach` is the fix already written.

## Owner queue

`docs/acceptance/owner-queue/2026-09-06-j-a-graphic-that-threw-on-air.md` - the importer fault, with
a one-minute route through four corner bugs, because the first version of that fix broke exactly
those four and a test alone is not a person looking.
