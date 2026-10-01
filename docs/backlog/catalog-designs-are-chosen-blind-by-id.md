# Agents choose catalog designs blind, by id, so the best starting points go unused

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 1). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-2.

## Why

The one graphic of four that looked premium started from a catalog design (`qz13`), and the gala
agent found its serif inside `card85` after scaffolding sixteen designs one by one. Catalog
designs are the strongest taste input the plugin has, and an agent can only see them by
scaffolding each and screenshotting it. `noacg types` lists ids; names and descriptions sit in a
189 KB `types --json`. So two of four agents started from `--design neutral` and stayed plain.

## What it would take

A CLI verb or flag that renders a type's catalog designs on one contact sheet (a grid of on-air
frames with their ids and fonts), written to a PNG the agent opens. The bridge already renders any
design; this is a layout of existing frames. The skill's step 1 then says: look at the sheet, pick
by eye, restyle.

## Evidence

`brief-3-gala` session log (sixteen probe scaffolds); `brief-4-quiz/cli/onair-reveal.png`
against `brief-1-news/cli/onair.png` and `brief-2-hockey/cli/onair.png`.
