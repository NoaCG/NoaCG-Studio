# src/ai/creative - the retired Phase-C creative pilot

**RETIRED 2026-08-09 (owner decision): Creative Mode is superseded by NoaCG Pro and is no longer carried
as a parallel architecture.** Both existed to answer "the model proposes the appearance, the platform owns
the engineering"; Pro owns that question now, and two live experiments asking it separately is how the
answers come to disagree. `docs/CREATIVE_MODE_PLAN.md` is a RETIRED record to MINE, never a plan to
continue - its reusable mechanisms and their measured rulings are listed in that file's banner and in
`docs/AI_ATTEMPTS.md`. **Nothing in the product reaches this code**: no UI, no route from `claudeProvider`
into it, and its only caller is `scripts/creative-pilot-bench.mjs`. Removing it is a separate, deliberate
change - and `scripts/creative-route-bench.mjs` plus `e2e/creative-routing.spec.ts` are NOT part of it,
because they cover the LIVE Phase-A routing stage.
