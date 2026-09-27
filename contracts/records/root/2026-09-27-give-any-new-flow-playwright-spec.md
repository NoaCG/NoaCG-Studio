# root/give-any-new-flow-playwright-spec

Rule: `root/give-any-new-flow-playwright-spec`. Recorded 2026-09-27 on `claude/n-spec-covers-headers` at c04a55926.

The spec-to-source map lived in scripts/e2e-affected.mjs and FOCUS in scripts/e2e-lists.mjs, and the old rule ('plus its mapping') sent every project into those two files: 40 and 16 of 344 landings from 2026-09-06 touched them. The map moved into each spec's leading header; the build refuses a spec with no covers line, a stale glob and a malformed header.

Why a rule rather than a fix, a mechanism or a check: The build now refuses an unmapped spec, but whether a new UI flow got a spec at all is a judgement no check can make; the rule says where the mapping goes so nobody reaches for the old shared list.
