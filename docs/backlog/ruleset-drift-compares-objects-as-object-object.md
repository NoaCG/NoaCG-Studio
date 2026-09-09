# Ruleset drift compares two different objects as `[object Object]` and reports clean

**Filed:** 2026-09-09. **Source:** a review of the measurement mechanism, verified against
`scripts/landing-ruleset.mjs` at `c0ccac6b`. Left to the backlog on purpose: one row, one mechanism.

## Why

`rulesetFacts` (`scripts/landing-ruleset.mjs:156`) flattens a GitHub ruleset into a table of
strings so `rulesetDrift` can compare the two sides key by key. Every parameter but one goes
through `String(value)`:

```js
// The one array of objects inside a rule; every other parameter is a scalar.
if (key === 'required_status_checks') facts['required checks'] = list(value.map((c) => c.context));
else facts[`${type}.${key}`] = String(value);
```

Two different arrays of objects both render `[object Object]`, so they compare equal and the drift
report comes back clean. The comment is a true fact about today's API, hardcoded as a special case
for the one key that happens to be structured now - which is the same shape as the tier hole this
row closed in `scripts/gates.mjs`, where an empty test list was refused only when the tier's
literal name was `build`. When GitHub grows a second structured parameter, or this file starts
wanting one, the gate goes quiet rather than loud, and a ruleset that protects `main` drifts with
nothing saying a word.

Not urgent because no structured parameter other than `required_status_checks` is in play today.
Worth fixing because the failure is silent, and the thing it silently stops guarding is the branch
protection on `main`.

## What it would take

Stop special-casing the key and start caring about the SHAPE. A value that is not a primitive is
rendered by a stable serialisation rather than by `String` - sorted `JSON.stringify`, or the same
`list()` treatment over the array's own stable rendering - so two different structures produce two
different strings whatever the key is called. `required_status_checks` keeps its friendlier
`context`-only rendering, but as a nicety rather than as the only thing standing between an object
and `[object Object]`.

The measurement rule applies here too: `rulesetDrift` says nothing about how many facts it
compared, so a `rulesetFacts` that returned an empty table would report no drift and pass. A
`measured(Object.keys(here).length, 'ruleset facts compared')` would close that.

## Evidence

`scripts/landing-ruleset.mjs:156-176`. Row J landed the file
(`docs/handoffs/2026-09-08-j-squash-or-merge.md`); the species and the parallel fix are in
`docs/handoffs/2026-09-09-y-measured-holes.md` and
`docs/metrics/2026-09-08-gates-that-measure-nothing.md`.
