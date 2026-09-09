# The AI gateway runner keeps two hand-written lists of the same 22 files

**Filed:** 2026-09-09, out of the drained handoff for `claude/f-gates-that-measure-nothing`
(`git show eed96fbb:docs/handoffs/2026-09-08-f-gates-that-measure-nothing.md`, "What is left").
**Source:** the gate sweep that made every gate red on an empty subject.

## Why

`scripts/run-ai-gateway-tests.mjs` writes the same 22 test files out twice: once as `sources`
(`api/_lib/*.test.ts`, lines 14-37) which it hands to `buildApiRuntime`, and once as `testFiles`
(the same paths with `.js`, joined onto `runtime.outputDir`, lines 46-68). Nothing ties the two
together.

Add a file to `sources` and forget `testFiles` and it compiles and never runs - a suite that
reports green over a test nobody executed. That is the exact failure the same script already
defends against one layer up: `measured(sources.length, 'ai gateway test files')` exists because
`node --test` with an empty list exits 0. The measurement guards the count and not the pairing, so
the honest count can be 22 while 21 tests run.

This is the API tier, which the browser suite does not reach: entitlements, admin eligibility, the
Pro cost ceiling, rate limiting, agent keys. A silently skipped test there is not visible anywhere
else.

## What it would take

Derive the second list from the first, which removes the class rather than the instance:

```js
const testFiles = sources.map((s) => path.join(runtime.outputDir, s.replace(/\.ts$/, '.js')));
```

Then verify the count is still 22 and the suite still passes: `node scripts/run-ai-gateway-tests.mjs`
prints the measured receipt and `node --test`'s own totals. Two lines and one deletion.

Worth doing in a row that already owns `scripts/`, not on its own - it is minutes of work and the
verification is the whole build.

## Evidence

- `scripts/run-ai-gateway-tests.mjs:14-37` (`sources`) and `:46-68` (`testFiles`) - the two lists,
  identical but for the extension.
- `scripts/run-ai-gateway-tests.mjs:41` - the `measured()` call and the comment saying why an empty
  list is the danger it was written for.
