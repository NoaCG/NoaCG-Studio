# A backtick in a comment ends the emitted SVG-fit runtime

**Filed:** 2026-09-08. **Source:** the 2026-09-05 live-vote-defects session (handoff since drained)

## Why
`SVG_FIT_JS` (`src/templates/importedDesign/svg.ts:390`) is a template literal, so an ordinary code
comment inside it that quotes a symbol in backticks terminates the string. The failure surfaces as
a Rolldown parse error pointing hundreds of lines away, which costs an hour to read back to its
cause. Three sibling emitters already carry the warning in a header comment -
`src/control/matchClockPageJs.ts:15`, `src/control/outputRecovery.ts:113`,
`src/control/productionControllerHtml.ts:936` - and the largest emitted runtime we ship is the one
that does not.

## What it would take
The same one-line header above `SVG_FIT_JS`: no backticks and no `${` in this string. Worth
checking in the same pass whether a lint rule can assert it for every emitted-script constant,
since the convention now exists in four places by hand.

## Evidence
Hit while writing the centred-room change that landed as `bf98b504`; the typechecker catches it, a
lint-clean-looking diff does not.
