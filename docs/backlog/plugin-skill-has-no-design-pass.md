# The plugin's skill has no design pass, so agent graphics default to an ordinary look

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk in
`docs/research/plugin-graphics-quality-2026-10-02/README.md` (failure 1). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-1 and D1.

## Why

The agent door is meant to deliver premium broadcast graphics. On four fresh briefs, the news
lower third and the hockey scorebug came out as the same generic dark plate in Inter with a thin
accent rule (`brief-1-news/cli/onair.png`, `brief-2-hockey/cli/pp-onair.png`), the gala title as
the stock boxed card with a diamond divider (`brief-3-gala/cli/onair.png`). Only the quiz, which
started from catalog design `qz13`, looked paid-for (`brief-4-quiz/cli/onair-reveal.png`). The
skill says it "does not tell you how it should look", and nothing in the loop asks the agent to
state an intent, look at references or critique its frame, so its untested defaults ship.

## What it would take

Two steps in `cli/skill/noacg-graphic/SKILL.md`, process and not doctrine: a short design intent
before the first edit (audience and screen, tone, reference genres, palette, type pairing,
silhouette, motion character) shown to the user; and after a clean validate a critique of the
frames against a short checklist drawn from `docs/DESIGN_LANGUAGE.md` §9, naming one change it
made. Pin the step words in `cli/test/unit.test.mjs`. The house notes stay optional.
`docs/AGENT_CLI.md` keeps taste rules out of the default skill on purpose, so the line between
"process" and "doctrine" is an owner call (spec D1); measure both arms with
`plugin-quality-benchmark-judged-from-frames.md`.

## Evidence

Frames and per-brief judgements in the research README. The gala agent found a serif only by
scaffolding sixteen catalog designs; the quiz agent credited its look to the catalog design it
started from.
