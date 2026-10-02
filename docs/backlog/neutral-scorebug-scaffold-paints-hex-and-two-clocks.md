# The neutral scorebug scaffold paints its colour fields as hex text and shows two clocks

**Filed:** 2026-10-02. **Source:** measurement, reproduced by hand on CLI 0.7.0
(`docs/research/plugin-graphics-quality-2026-10-02/evidence/neutral-scorebug-onair.png`).
**Re-sorted:** 2026-10-02 against D1: kept unchanged. A scaffold that paints its own data wrong is
a correctness defect around the artwork, which D1 leaves to NoaCG. **Owner:** a type-catalog row
(`src/templates/`, the scorebug type's neutral design), with the CLI's scaffold test. Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-2.

## Why

`--design neutral` is what the skill offers an agent that wants a type's machine on a plain spine.
For the scorebug it is a broken start: untouched, `noacg scaffold --type scorebug --design neutral`
then `noacg screenshot --state onair` draws `#f6a623` and `#7dd3fc` as large text, a `0:00` clock in
the corner beside a second `0:00` in the body, and football defaults ("1H", counting up). The
hockey agent lost most of a validate round and had to copy markup out of catalog design `sb05` to
get a working clock and team colours. A neutral scaffold that misleads costs more than none.

## What it would take

Render the neutral scorebug's colour fields as hidden colour holders applied to the design (as
`sb05` does), wire `f5` as the one `.<prefix>-clock` with `data-count`/`data-start`, and pin it with
a test that screenshots every `--design neutral` scaffold and fails on a field value painted as a
colour code or on two clock elements. Then sweep the other neutral scaffolds the same way.

## Evidence

`evidence/neutral-scorebug-onair.png`; the brief-2 session log in the research README ("Neutral
scorebug scaffold is half-wired").
