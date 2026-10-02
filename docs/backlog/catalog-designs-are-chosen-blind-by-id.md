# An agent that wants a catalog design has to pick it blind, by id

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 1). **Re-sorted:**
2026-10-02 against the owner's D1 (the look is the agent's by default): kept, reframed as tooling
rather than a taste push. **Owner:** a CLI row (`cli/src`, the `types` verb or a new flag). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-2.

## Why

Under D1 nothing steers the agent toward the catalog, but an agent that CHOOSES to start from a
catalog design should be able to see what it is choosing. Today it cannot: `noacg types` lists
ids, names and descriptions sit in a 189 KB `types --json`, and the only way to see a design is to
scaffold it and screenshot it. The gala agent scaffolded sixteen designs one by one in the walk,
and again on the 2026-10-02 D1 re-run (`card08` to `card85`) to find a serif; the quiz agent that
started from `qz13` credited its look to that start.

## What it would take

A CLI verb or flag that renders a type's catalog designs on one contact sheet (a grid of on-air
frames with their ids and fonts), written to a PNG the agent opens. The bridge already renders
any design; this is a layout of existing frames. The skill then names it in step 1 as an option,
never as a default.

## Evidence

`brief-3-gala` session log (sixteen probe scaffolds), repeated by the D1 guidelines run
(`docs/work-specs/plugin-design-quality/evidence/2026-10-02-d1-fresh-brief-runs.md`);
`brief-4-quiz/cli/onair-reveal.png` against `brief-1-news/cli/onair.png`.
