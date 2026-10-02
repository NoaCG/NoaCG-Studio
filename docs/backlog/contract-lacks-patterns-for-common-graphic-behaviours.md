# The contract's worked behaviour patterns have no fixture pinning them

**Filed:** 2026-10-02. **Source:** measurement, the session logs of the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 5). **Re-sorted:**
2026-10-02 against D1: rewritten. The patterns themselves landed in
`cli/skill/noacg-graphic/references/contract.md` §5e with the D1 skill change; what remains is
the pin. **Owner:** a CLI row (`cli/test/fixtures/` and the smoke suite). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-7.

## Why

§5e now shows five behaviours every behaviour-bearing brief needed: an optional line that
collapses when empty, a state's word painted from a hidden source, a second state group (a
timer), a graphic that ends its own timed state, and an action available in every state. They
were verified once, by hand: one package carrying all five validated with 0 errors and 0
warnings against this checkout's bridge and was then driven press by press in headless Chrome.
Documentation with no test drifts the day the interpreter changes, and a pattern that silently
stops validating teaches every agent a broken shape.

## What it would take

Commit that package (or one per pattern) under `cli/test/fixtures/`, have the smoke suite
validate it against a deployment and fail on any error or warning, and drive the five behaviours
the way the hand check did (take, collapse and reopen the optional line, rename the word source
while its state is on, start the timer and watch it end itself and hide, press the always-on
action from every state, re-take mid-timer). The interpreter facts §5e states (calls fire on the
first tick, snap fires calls, Take resets groups without replaying their initial state) are worth
one assertion each.

## Evidence

The hand check and its output are in
`docs/work-specs/plugin-design-quality/evidence/2026-10-02-d1-fresh-brief-runs.md`; the quiz D1
re-run used the timer pattern and reported a `bench-events-skipped` warning for an arrow out of a
2.4 s timed state, which the fixture's 2 s state did not raise.
