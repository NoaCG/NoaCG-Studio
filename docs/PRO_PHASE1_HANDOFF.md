# NoaCG Pro - handoff from the Phase 0 spike to the brand round

Written 2026-08-12 at the end of the Phase 0 session. Branch `claude/noacg-pro-phase0-spike`,
12 commits, build green, **nothing merged**. This file exists so the next session does not have to
reconstruct the round from the transcript.

Binding docs remain `docs/NOACG_PRO_PLAN.md` (§0 banner, §14) and `docs/AI_ATTEMPTS.md`. This is a
pointer, not a replacement.

---

## 1. What Phase 0 settled

**The gate passed.** A strong open-weight checkpoint, given a brief, the neutral NoaCG scaffold and
either three complete exemplars or none, produces broadcast lower thirds the owner reads as
acceptable: *"the graphics are fine if we can create this quality."*

**The transfer question came out the right way.** §0.3 says an exemplar arm that passes beside a
COLLAPSING no-exemplar arm is transfer rather than taste. The no-exemplar arm completed every brief
and, on the pair the owner examined, was judged indistinguishable from the exemplar arm. The
quality is the model's own.

**The checkpoint is `alibaba/qwen3-coder`.** 24/24 captured, all contract-clean, **$0.263**.
`moonshotai/kimi-k3` managed 21/24 for **$5.03** and could not finish three exemplar-arm briefs at
all - it spends thousands of reasoning tokens before writing, which is what truncated and timed it
out. **Dropped on cost by owner decision; not worth 19x for output rated no higher.**

**Zero repair rounds fired on kimi-k3, one on qwen3-coder**, across 45 generations. The
deterministic gate is not what is holding results back.

## 2. What Phase 0 did NOT settle, and it is the whole point

Every brief in `benchmarks/pro/v1/briefs.json` is generic: two text lines, no brand palette, no
brand typeface, no real mark. `includeLogo` is a boolean asking for an empty slot, and the single
brief that set it rendered a broken image. So the round measured *"can it design a broadcast lower
third"* and never *"can it design THIS customer's."*

The owner's verdict on the output: it looks like something the free template gallery could carry.
That is the correct reading of what was tested, and it is why the result does not yet justify a
paid tier - **adapt-first already ships catalog-grade generic graphics for a fraction of a cent.**

> **Pro earns its cost only on originality conditioned by a customer's own brand. That is the next
> round and it has never been measured.**

## 3. Two standing requirements the owner set

1. **THE CODE IS THE DELIVERABLE.** Phase 0 judged frames and discarded the emitted HTML/CSS/JS -
   45 paid generations reduced to pictures, against a standing instruction already in
   `docs/AI_ATTEMPTS.md`. **The frame is a derivative; the code is the product.** `pro-spike.mjs`
   now writes `code/<brief>.<arm>/{index.html,template.css,template.js}` per generation (committed).
   **Code quality is an axis for picking winners, not a follow-up check** - score it against the
   house contract in `src/ai/AGENTS.md`: the `:root` variable contract with no hardcoded colours
   elsewhere, pixel sizes through `calc(N * var(--scale))`, the structure spine, the marked
   ANIMATION region in the authoring grammar, readable commented ES5.
2. **Synthetic brands, not real ones** (owner's choice) - invented organisations with distinct
   marks and palettes, so no third party's marks are used without permission.

## 4. Known defects, carried forward

- **Broken alignment axis.** Two results were flagged by eye: a panel not aligned to its own accent
  line, and one where a SKEWED accent bar sweeps across the panel's straight left edge (painted
  edge x≈101-138 against a panel edge at x=120) while the name and kicker sit at ~168 and ~155 - a
  near-miss pair. **No gate sees this**: the runtime bench measures layout boxes for overlap and
  overflow, and nothing asks whether independent elements SHARE an axis. Skew makes it worse by
  moving the painted edge off the box edge - the same family as the documented `clip-path` ban in
  `src/ai/AGENTS.md`.
  A whole-frame "leftmost painted pixel per row" scan was tried and is the WRONG instrument: it
  reported the defective frame as having one clean axis, and flagged the hand-authored control as
  broken because of its drop shadow. Measure per ELEMENT (`getBoundingClientRect().left` includes
  transforms), cluster the edges, and flag NEAR-MISSES - two clusters within a few px but not
  equal. Far apart is deliberate composition; identical is aligned. **Calibrate the tolerance
  against the 59 hand-authored catalog lower thirds before trusting it** (the `supportingLineChars`
  precedent: replace an adjective with a measurement).
- **The brand mark has no contract.** One brief rendered a broken-image icon with its alt text
  showing, and every machine gate passed it. Lite solved the placement half in a shape worth
  copying - **the design declares the slot and the compiler fills it; the model never places the
  mark** - gated against a rendered measurement (`LiteCatalogEntry.logoSlot`,
  `scripts/ai-lite-brand-audit.mjs --check`, `docs/AI_LITE_PLAN.md` §7). A GENERATED design has no
  catalog slot to declare, so that contract is new work. The MOTION half has no precedent anywhere.
- **`corporate.exemplar` truncates on kimi-k3** at both the 17,000 and 25,000 token ceilings, twice,
  exemplar arm only. Moot now that kimi is dropped; recorded because it is a repeatable property.
- **The exemplar block may not be worth it.** ~34,500 tokens per call - about 80% of a kimi round's
  spend - and on the pair the owner examined it changed almost nothing. **An ablation is owed before
  any later phase builds on complete-exemplar retrieval** (plan §5 treats it as a pillar).

## 5. The harness, and the four ways it fooled itself

Bench-only, fenced from the app by `.dependency-cruiser.cjs` (`pro-phase0-spike-is-bench-only`).

| Piece | Where |
| --- | --- |
| Arms, prompt, repair loop | `src/ai/spike/run.ts` |
| Vetted exemplar pool + retrieval | `src/ai/spike/exemplars.ts` |
| Control + blind gallery anchors | `src/ai/spike/anchors.ts` |
| Runner, motion capture, galleries | `scripts/pro-spike.mjs` |
| Licence/capability preflight | `scripts/spike-checkpoint-probe.mjs` |
| Pinned decoding | `benchmarks/pro/v1/spike/decoding.json` |
| Long-timeout dispatcher (bench server only) | `scripts/bench-dispatcher.mjs` |
| Forced-tool + timeout policy for the bench surface | `api/_lib/aiSurfacePolicy.ts` |

Modes: `--control` (free, mandatory after ANY wrapper change), `--generate` (paid), `--resume`,
`--rebuild` (free, regenerates the gallery), `--reveal`, `--out=<dir>` (one dir per checkpoint).

**Every one of these cost real money, and all four are the same mistake - the rig measuring a
smaller question than the round:**

1. The capability probe used a short brief and a small budget. Both checkpoints passed in ~30s;
   against the real prompt one of them emitted nothing at all. **A probe must ask the round's
   question at the round's size.**
2. The output budget was pinned from that undersized probe, so three exemplar-arm briefs truncated
   - and only the most elaborate answers, which would have flattered the arm.
3. Retries were disabled to stop slow calls paying twice. Timeouts were not the common failure;
   transient gateway errors were, and with no retry each lost its brief outright.
4. The free `--control` run wrote the same `results.json` the paid round does, so the mandatory
   control rerun reset the cumulative spend the cost ceiling counts from - and the next resumed run
   regenerated everything and walked past the cap.

All fixed and commented where they happened. Roughly $5 of the round's ~$16.7 bought findings
rather than results.

## 6. Archives (outside the repo, copy-verified)

`C:/claude/noacg-lite-eval-archive/`

- `pro-phase0-qwen3-coder-2026-08-12/` - the chosen checkpoint's complete round, 1034 files
- `pro-phase0-kimi-k3-complete-2026-08-12/` - kimi's round + the owner's verbatim §0.2 notes
- `pro-phase0-kimi-k3-2026-08-12/` - earlier snapshot, superseded
- `pro-phase0-superseded-9000budget-2026-08-12/` - the truncating round, kept as the budget evidence

**None contain code** - see §3.1. Frames, ledgers, galleries, keys and notes only.

## 7. The next round

Same 12 briefs, `alibaba/qwen3-coder`, each brief conditioned on a synthetic brand: a real mark
(shape/backing/ink measured by `assets/assetInfo.ts` `probeMark` - the content-free contract Lite
already uses), a palette, a typeface. Roughly **$0.26** for 24 generations.

Measure three things, two of which Phase 0 could not:

1. **Brand fidelity** - is the mark placed legibly and unaltered, and does the palette DRIVE the
   design rather than decorate it?
2. **Brand-driven divergence** - same brief, different brands, visibly different graphics. The
   sameness tripwire adapt-first already lives under.
3. **Code quality** - per §3.1, read the emitted code against the house contract and score it.

Open that session with the prompt in §8.

## 8. Session-opening prompt

```
Start the NoaCG Pro BRAND round - the experiment Phase 0 never ran.

Read docs/PRO_PHASE1_HANDOFF.md in full first, then docs/NOACG_PRO_PLAN.md §0 (the
verdict banner) and §14 (items 0a, 0, 1), then src/ai/AGENTS.md. The Phase 0 wrapper
is built, fenced bench-only and committed on claude/noacg-pro-phase0-spike - branch
from current main and take it forward, do not rebuild it.

THE QUESTION. Phase 0 proved a strong open checkpoint can design a generic broadcast
lower third. The owner's verdict was that generic output looks like free-gallery
material and does not justify a paid tier, because adapt-first already ships that for
a fraction of a cent. Pro earns its cost only on originality conditioned by a
customer's own brand. Measure that.

THE ROUND. Same 12 briefs (benchmarks/pro/v1/briefs.json), checkpoint
alibaba/qwen3-coder pinned, both arms, ~$0.26 for 24 generations. kimi-k3 is DROPPED
on cost - do not run it. Each brief is conditioned on a SYNTHETIC brand (owner's
choice - invented organisations, so nobody's real marks are used): a real mark file
whose shape, backing and ink are measured by assets/assetInfo.ts probeMark, a
palette, and a typeface from the seven bundled faces. Build the brand set as a
committed fixture beside benchmarks/pro/v1/spike/decoding.json, with the brands
deliberately far apart - a heavy sport wordmark, a quiet institutional monogram, a
bright consumer roundel, a monochrome editorial mark - so divergence is measurable
rather than hoped for.

MEASURE THREE THINGS, and the third is new:
1. Brand fidelity - is the mark placed legibly and unaltered (assetIntegrity.ts is
   the existing as-is screen), and does the palette DRIVE the composition rather
   than decorate it?
2. Brand-driven divergence - same brief, different brands, visibly different
   graphics. Different brands must not produce one design in four tints; that is
   the named failure the adapt-first route already lives under.
3. CODE QUALITY, as a first-class axis for picking winners. Phase 0 judged frames
   and threw the code away; the owner's standing requirement is that the HTML
   template IS the deliverable. Every generation now writes
   code/<brief>.<arm>/{index.html,template.css,template.js}. Read it against the
   house contract in src/ai/AGENTS.md - the :root variable contract with no
   hardcoded colours elsewhere, pixel sizes through calc(N * var(--scale)), the
   structure spine, the marked ANIMATION region in the authoring grammar, readable
   commented ES5 - and report it per generation. A graphic that renders well and
   emits uneditable code has failed.

THE LOGO CONTRACT IS A PRECONDITION, not a parallel task. One Phase 0 result rendered
a broken-image icon with its alt text showing and every machine gate passed it. Lite
solved placement in a shape worth copying - the design declares the slot and the
compiler fills it, the model never places the mark, and the declaration is gated
against a rendered measurement (LiteCatalogEntry.logoSlot,
scripts/ai-lite-brand-audit.mjs --check, docs/AI_LITE_PLAN.md §7). A generated design
has no catalog slot to declare, so design that contract before the round rather than
discovering it in the results. The motion half has no precedent anywhere - the owner
asked for marks that "animate in a meaningful and smooth way".

ALSO CARRY: the alignment-axis check (handoff §4 - measure per ELEMENT, flag
near-miss axes, calibrate the tolerance against the 59 catalog lower thirds first;
the whole-frame pixel scan is the wrong instrument and was already tried), and the
exemplar-block ablation the plan owes (~34,500 tokens per call for almost no
measured effect).

PROCESS, learned the expensive way (handoff §5): run the zero-token control FIRST and
again after ANY wrapper change; a capability probe must ask the round's question at
the round's size; save the code; one out-dir per checkpoint. Everything up to the
paid round is zero-spend. The paid round needs an explicit owner OK with a stated cap
restated at the time - a key in .env is not permission. After the round: write the
verdict into docs/AI_ATTEMPTS.md and archive with npm run eval:archive.
```
