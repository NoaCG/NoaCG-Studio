# Nine credits designs fail the catalog render baseline on this laptop, and pass on CI

**Filed:** 2026-09-06. **Source:** measurement, while verifying
`claude/noacg-pro-harness-comparison-5c7fa0` before landing.

## Why

**A gate that is red locally and green on CI is one every session on this machine learns to
ignore.** That is the expensive part, not the designs: the pre-merge integration run
(`docs/VERIFICATION.md`, root `AGENTS.md` rule 4) exists so a session catches its own breakage
before the queue does, and a permanent unexplained failure in it trains people to read "1 failed"
as noise. The next real regression in that spec arrives wearing the same clothes.

The repo already has the mirror image of this and treats it as worth fixing: two specs that were
"only ever red in a cloud container" were settled rather than tolerated
(`2362c43a`), and `port-collision-fixtures-are-windows-shaped.md` is on this shelf for the same
class. This is that problem pointing the other way.

## What it would take

Find what differs between this machine and CI's runner for those nine designs, then either pin the
measurement so it is environment-independent, or record why it legitimately cannot be and make the
spec say so where it runs.

**Font metrics are the first suspect**, and the elements implicate them: every failing design
reports the same two, `#count` and the design's hidden `div.noacg-data-source` holder. Credits build
their roll from a measured line count, so a font whose metrics differ by a fraction changes what the
count element resolves to and shifts the holder's recorded path. `f5d52ae5` "Make the render
baseline wait for the real face, and say so when it cannot" is the commit that already fought this
class once and is worth reading first.

## Evidence

**It is NOT a main regression, and it is not this branch's.** Both halves are measured:

- **Not the branch.** Reverting the branch's only two app-code files
  (`src/blocks/timelineModel.ts`, `src/blocks/animImport.ts`) to `origin/main` and re-running the
  single spec reproduced the failure identically.
- **Not main.** CI run `34018718825` on `main` is green across all nine full E2E shards, which
  include this spec. `node scripts/check-catalog-emit.mjs` also passes - all 504 designs emit
  byte-identical source - so nothing moved in the code.

Failing designs, each reporting `#count` plus a hidden holder (`noacg-data-source[4]`, or `[3]` on
cr13): cr01, cr02, cr03, cr04, cr06, cr08, cr11, cr12, cr13.

The failure message is `The rendered look moved. A token substitution cannot do this - investigate
before re-recording.` **Do not re-record it to make the laptop quiet** - that would push the
divergence onto CI instead, where it would be red for everyone.

Reproduce (stop this checkout's dev server first, or the offline guard refuses a reused server):

```bash
npm run queue -- "npx playwright test e2e/catalog-baseline.spec.ts --grep \"every catalog variant renders identically\" --reporter=line"
```
