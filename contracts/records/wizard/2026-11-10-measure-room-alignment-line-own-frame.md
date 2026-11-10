# wizard/measure-room-alignment-line-own-frame

Rule: `wizard/measure-room-alignment-line-own-frame`. Recorded 2026-11-10 on `noacg/great-bardeen-o9x5rg` at d260583e.

The downloadable scoreboard and the score-and-clock example painted a score drawn as one centred 0 at 59% and 73% of its size when it reached 10, in plates that held 100 at the drawn size: half the type each side left room for about one digit. A plate is also found by the line's em box now, since a 60px Oswald 0 in a 90px plate had a line box 2.7px taller than the plate and got no plate at all. scripts/svg-figure-fit.test.mjs pins both.

Why a rule rather than a fix, a mechanism or a check: The half-type margin is the right default for words and the wrong one for figures, and the existing rule states it without the exception; the test guards the behaviour, the rule stops the next reader restoring the half-type margin for figures.
