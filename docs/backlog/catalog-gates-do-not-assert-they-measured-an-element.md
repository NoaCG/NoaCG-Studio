# The three catalog gates never assert that a single element was examined

**Filed:** 2026-09-08. **Source:** the gate enumeration in `docs/metrics/2026-09-08-gates-that-measure-nothing.md`

## Why

`type-floor.mjs`, `overflow-sweep.mjs` and `field-coverage.mjs` all refuse an empty target list
now, so a broken catalog import fails loudly. None of them refuses an empty MEASUREMENT. Each
renders 502 variants into off-screen iframes, waits, and then reads back what it finds; if every
frame rendered blank without throwing, `type-floor` prints `PASS - no text renders under its
category floor`, `overflow-sweep` prints `PASS - no variant paints outside the frame`, and
`field-coverage` prints `PASS - every meaningful visible string moved`. All three exit 0.

That is one settle-timing change, one composition regression that swallows its own error, or one
iframe policy change away from being the live state of the nightly. It is the same defect the
2026-09-08 repair fixed one level up: the gate resolved something to nothing and read it as a pass.

## What it would take

Each of the three already collects per-variant rows in the page. Return the number of elements (or
strings) each variant contributed, sum it, and report it with `measured(n, 'text elements')` from
`scripts/measured.mjs`, which refuses zero. `type-floor`'s scan loop is the model: it already walks
`f.contentDocument.body.querySelectorAll('*')` and counts nothing.

The reason it was not done in the row that filed it: verifying a browser gate needs a live dev
server and Chromium, and a change to these three that is not re-derived against a real catalog run
is exactly the kind of unverified repair that produced the original defect.

Worth pairing with the per-category residual in the same file: `if (!(FLOOR.default > 0))` guards
the TABLE, not the per-category lookup, so a category whose `typeFloorFor` returns undefined while
`default` stays positive passes unmeasured.

## Evidence

`docs/metrics/2026-09-08-gates-that-measure-nothing.md`, section "The three catalog gates the
discovery cannot see". `docs/handoffs/2026-09-08-b-red-alarms.md` for the original crash and why
"read it from the product" traded a loud failure for a silent one.
