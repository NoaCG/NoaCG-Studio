# A saved template with a declared `mode: 'grow'` follower is promised support and covered by no spec

**Filed:** 2026-09-09, carried out of `docs/handoffs/2026-09-06-f-growth-question.md` during the
handoff drain. **Source:** the row's own honest gap, named under "What is NOT done" and never filed.

## Why

The 2026-09-06 growth row removed the picker that generated a declared `'grow'` follower, and kept
the runtime that honours one, because saved templates carrying it must keep working.
`SvgFollowerDraft.mode` stays two-valued and says so, and `NOACG_LAYOUT`'s generated comment
documents what `'grow'` does.

So the shape is promised and unreachable. No UI route can produce one any more, which means no spec
can arrive at one by driving the app - and none does: `mode: 'grow'` appears at
`src/templates/importedDesign/svg.ts:1743` and `:2131` and nowhere under `e2e/`. A refactor of
`svgFollowersOf`'s grow branch goes green while breaking every saved template that carries it.

That is the worst version of a compatibility promise: written down, believed, and unmeasured. It
will hold right up until somebody tidies the branch nothing appears to use.

## What it would take

A fabricated-template spec, which is the route the row itself proposed. Build the saved-template
JSON directly with a declared `'grow'` follower rather than driving the wizard to produce one, load
it, and assert the layer stretches with its plate. That is the only kind of spec that can reach a
shape the UI no longer emits, and the pattern generalises to anything else the format still honours
and the app no longer writes.

Prove it fails without the runtime branch before believing it, the way the sibling rail spec was
proven: reverted, the board grows 11.7 px and the rail grows 0.

## Evidence

- `src/templates/importedDesign/svg.ts:1743, 2131` - the two places `mode: 'grow'` is read.
- `src/components/wizard/import/draft.ts` - `SvgFollowerDraft.mode`, two-valued, with the comment
  saying why saved templates keep working.
- `docs/TEXT_BOX_BINDING.md` §"What travels is not a question - settled 2026-09-06" - the decision
  that removed the picker, with its corpus measurement.
- Landed on `claude/f-growth-question` as `856f8792`; the rail spec that IS covered is `e72fde8e`.
