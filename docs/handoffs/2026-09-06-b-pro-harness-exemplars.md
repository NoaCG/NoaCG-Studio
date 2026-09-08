# The Pro Harness now hands a model what the shipped designs of its kind actually measure

Branch `claude/b-pro-harness-exemplars`, from `main` at `8c1b39ba`, five commits, never pushed -
the orchestrator integrates it. Item 3 of the 2026-09-05 Pro Harness round's "what's next"
(handoff drained 2026-09-08; the standing list is `docs/PRO_HARNESS_PLAN.md`, "Not built, in
order"): exemplar retrieval per type, as measured numbers, never code.

## What is there now

`src/ai/pro/harness/exemplars.ts` is a third kind of number in the harness's first message,
stacked under the two that were already there and deliberately weaker than both:

| | binds | says |
|---|---|---|
| `src/model/designRules.ts` | yes | the legibility floors, ratified, measured on a screen |
| `knowledge.ts` cards | advises | `DESIGN_LANGUAGE.md`'s taste RANGES, ratified on lower thirds |
| `exemplars.ts` | binds nothing | what 504 shipped designs typed into their own stylesheets |

A request that names a graphic type gets one card of about 270 tokens - type sizes by the part
they set, then padding, gap, radius, tracking and line-height, each as min / median / max with
the sample count on the line. A request that names none gets nothing new. The card carries
numbers and the role WORD a part plays; never a design's code, selector, id or name.

The scoreboard card, verbatim, is what this was for:

```
- score: 20px to 80px, middle 43.5px (n 26)
- team: 24px to 48px, middle 35px (n 21)
- clock: 21px to 62px, middle 32px (n 11)
- phase: 20px to 26px, middle 20px (n 11)
```

Nineteen of the catalog's twenty-three categories reach the bar. The four that do not - `versus`,
`transition`, `audience`, `imported-design` - have no card at all, because a corpus of one or two
designs is the anchoring the module exists to avoid.

## The decision the prompt asked to be written down: where the numbers come from

**Statically, from the designs' own source CSS. No browser, no render, and that is not a
shortcut.** `variant.create()` needs a real DOM - `scripts/catalog-emit.mjs` measured all 504
designs failing in bare Node on `DOMParser` - so a rendered derivation would have priced a
Chromium round into an answer that does not change: a design's authored
`font-size: calc(44px * var(--scale))` IS the number it ships, at the 1080p reference every
catalog design is written against. What a *rendered* measurement would add is the resolved
cascade (a `var()` this parser skips rather than guesses) and the painted box, and neither is
what the card claims to be. So the static derivation is not the cheap version of the right one;
it is the one that answers the question asked.

The corpus STRUCTURE - which designs exist, in which category, under which graphic type - still
comes from the real catalog, resolved through Vite's SSR module graph, the same browser-free load
`scripts/prerender.mjs` already does inside the build.

`scripts/pro-harness-exemplars.test.mjs` (25 tests, added to `npm run build`) re-derives the whole
table through the module's own exported derivation and fails on any drift, writing the regenerated
block to the system temp directory so the fix is a paste. The constant is never hand-maintained.

## What the check found, because it matters to whether the numbers are true

`/check` review ran delegated at `high` and returned eight findings; six were real defects that
made the numbers WRONG, and all six are fixed with a test each (commit `ecb0ffb`). The two that
would have been hardest to notice from the outside:

- **`padding: 0 calc(35px * var(--scale))`** - a bare `0` is a length, and reading it as "no
  authored number" threw the whole declaration away, losing 46 real horizontal paddings,
  concentrated in exactly the tickers and end credits that write width-only padding.
- **`poll` is both a graphic type and a wizard category, and they are different corpora.** The
  type's designs sit among the 39 infographics; the category holds five designs of another type.
  One lookup map resolved it by whichever entry was written last, so a poll brief read a corpus
  that was not its own. Type and category now have a map each and the type wins.

The other four: a rule naming two parts was measured only as the last of them (45 rules), a
declaration wrapped over two lines was lost entirely (two shipped four-value paddings, one in a
lower-third shared file), an even sample count printed its middle on its own floor, and a red
re-derivation used to drop an untracked `.ts` in the repo root where committing it would hard-fail
`check-tree-shape`.

**This is worth reading before the paid round**, because it is the same class as the plan's own
rule: a conclusion drawn from a round must state which platform faults were live during it. These
six were live for the whole of this branch's first two commits and none of them is live now.

## Spending the euro: exactly what to run, and what it costs

On your own machine, in a checkout of this branch (or of `main` once it lands), with this
checkout's dev server running (`npm run dev:worktree`) and **nothing else on the port** - and kill
any stray server first, since `dev-worktree.mjs --help` starts one:

```bash
npm run queue -- "node scripts/pro-harness-spike.mjs --generate --route=vercel:google/gemini-2.5-flash --vision --max-cost=3 --out=pro-harness-out-gemini"
```

**Cost.** The `--max-cost=3` is a ceiling the runner stops at, not a forecast. The plan's estimate
stands: about $0.015 for a typical two-round graphic and $0.03 for a four-round worst case, plus
one critique call, so the 21 briefs sit **under $1** - UNVERIFIED until the ledger in
`results.json` says otherwise, which is half of what this round is for. The card itself adds about
270 input tokens per generation call, which across the whole bank is well under a cent: it cannot
move that number, only the quality it buys.

**What the round will and will not tell you about the card.** Of the bank's 21 briefs, **18 get a
card** (lower-third, scoreboard, quiz-board, ticker, countdown, podium-score) and the three
`stat-panel` briefs get none, because the bank maps no graphic type for them. That is an
uncontrolled comparison, not a matched one - the three uncarded briefs are also a different kind
of graphic - so read it as a hint and not as the card's verdict. **The card is unmeasured against
a model.** If you want its verdict cleanly, the round to run is the same bank twice with the card
forced off in the second pass; that is a one-line change to `firstMessage` and nobody has spent a
token on it either way.

Then the blind page from `shots/`, your read, and the verdict into `docs/AI_ATTEMPTS.md`, exactly
as `docs/PRO_HARNESS_PLAN.md` §10 has it.

## Verification

- `npm run build` green on this branch (stamp `claude/b-pro-harness-exemplars@95e1632d1e`, and
  again after the check's fixes at `ecb0ffb`).
- `node --test scripts/pro-harness-exemplars.test.mjs` - 25 of 25. `scripts/pro-harness.test.mjs`
  still 23 of 23.
- `/check`: **review: delegated** (8 findings, 8 fixed), **simplify: inline** (the fan-out was
  unavailable, so all four angles were done in this context - 4 findings, 4 fixed: the test booted
  a Vite SSR graph twice for the same answer, re-parsed shared files once per claiming category,
  and the module kept two hand-synchronised lists of its own sample fields), **verify: build
  green**, **e2e: not applicable** (no spec maps to `src/ai/pro/harness`, which is bench-only with
  no product path), **taste: not applicable** (nothing here can move what a graphic looks like -
  the module only READS the catalog's CSS and writes prompt text).
- **The check's verdict stamp was NOT written.** It belongs at
  `<git-common-dir>/noacg-jobs/checks/claude-b-pro-harness-exemplars.json`, which is outside this
  worktree, and this container's isolation refuses writes there. Its contents would have been:
  merge-base `8c1b39ba37286186f1ee5e04c6f2a8674b36a42d`, reviewed sha
  `ecb0ffbbe4c46b6fb2fd477f18f6512b1b3294af`, legs as above, verdict `pass`. Whoever integrates
  this branch on the laptop can write it, or re-run `/check` there.
- No owner-queue item: nothing on this branch is observable in the product. The harness is
  `EXPERIMENT - bench-only` and no product path reaches it.

## What is next, in the order I would take it

1. **The paid round above.** It is still item 1 of the plan, and the card only makes it a better
   round; it does not replace it.
2. **A matched on/off pass for the card**, if the round reads well enough that the question is
   worth a second euro. One line in `firstMessage`.
3. **The bridge workbench** (plan §11 item 2), unchanged by this branch.
4. If a Pro request ever resolves to a wizard CATEGORY rather than a graphic type, the seam is
   already there: `exemplarCardFor({ typeId, category })` and `exemplarForCategory` exist and are
   tested, and nothing calls the category half yet.
