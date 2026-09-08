---
v: 2
source: derived
kind: finding
raised: 2026-09-07
state: unstarted
found: "The offline AI stub throws on any 'lower third' prompt, because its rules table names a
  building block that does not exist. Found while migrating src/blocks/AGENTS.md, by checking a
  contract claim about which blocks the stub reaches."
---
# The offline AI stub crashes on any "lower third" prompt

**Filed:** 2026-09-07. **Source:** measurement, while migrating `src/blocks/AGENTS.md` into the rule
store.

## Why

It is a crash on a user-visible path, in the mode that exists precisely for people with no API key.
`src/ai/stubProvider.ts` line 27 is `const block = (id: string) => BUILDING_BLOCKS.find((b) => b.id
=== id)!` - a non-null assertion over a lookup that can miss. `StubProvider.modify`'s rules table
carries `{ test: /lower ?third/, blockId: 'lower-third', ... }`, and `BUILDING_BLOCKS` in
`src/blocks/registry.ts` has no entry with that id. The lower-third entries are `lt-name-title`,
`lt-name` and `lt-title`. So `block('lower-third')` returns `undefined` and `.apply(template)`
throws.

"Lower third" is the most likely thing a first-time user types into a broadcast-graphics tool, and
the offline stub is what they hit with no key configured.

The second reason is the shape of the bug rather than the bug: a rules table keyed by string ids
into a registry, with the miss asserted away. Nothing catches a typo, a renamed block or a deleted
one until a user hits that branch. Seven other ids in the same table are correct today by luck
rather than by a check.

## What it would take

Two changes in `src/ai/stubProvider.ts`, small:

1. Point the rule at a real id. `lt-name-title` emits a name plus a title line, which is what a
   "lower third" prompt means - read the entry in `src/blocks/registry.ts` before changing it.
2. Make the class impossible rather than fixing the instance. Best is a check that fails at module
   load (and therefore in the build) when any `blockId` in the rules table is absent from
   `BUILDING_BLOCKS`; that turns a user-facing crash into something CI catches. Second best is
   having `block(id)` return `BuildingBlock | null` and letting `modify` skip a rule whose block is
   missing, falling through to the existing "no deterministic change matched this prompt" answer.

`e2e/ai.spec.ts` exercises the offline provider and is the natural home for a spec.

## Evidence

The `src/blocks` contract said "The stub applies `fullscreen` and nothing else, so an entry here is
only as alive as its callers." That is false - `modify` reaches eight ids - and it is why nobody had
looked at the other seven. The claim was not migrated; the correction and the reachability rule are
in `contracts/rules/blocks/delete-nothing-can-reach-never-repair.md`, and the false-claims section
of `docs/metrics/2026-09-07-blocks-migrated.md` records how it was found.

Not fixed on that row because `src/ai` was held by another session at the time.
