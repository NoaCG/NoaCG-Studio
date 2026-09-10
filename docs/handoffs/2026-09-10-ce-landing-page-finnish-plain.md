# CE - the landing page reads Finnish-plain

Branch `claude/ce-landing-page-finnish-plain`. Three commits, queued for landing.

## What landed

`index.html` rewritten section by section. **Body text 2211 -> 1767 words, a 20% cut.** The
rendered page went **11496px -> 10675px** at 1265px wide, measured in the dev server by loading
`git show HEAD:index.html` beside the new one on the same viewport.

The owner's three demands are all met on this page:

- **Shorter.** See the numbers above.
- **The named slogan is gone** ("No seat licence. No monthly bill. No edition above this one."),
  and so is the five-part closer "Make it. Brand it. Animate it. Export it. Run the show.", which
  is the same construction one section further down. That second deletion is mine, not his, and
  the acceptance file says so in a line he can overrule.
- **No countable claim is left**: "Four ways in", "One screen, four doors", "Six free starters",
  "OGraf v1". The starters card also stopped listing which six they are, because an inventory goes
  stale exactly like a count.

Hype out: broadcast-grade, production-ready, plug-and-play, "zero extra work", "never a black
box", "not tenants in our cloud", "nothing phoning home", "Solid today, sharper every week", "not
just an animation", and the "Live graphics, made simple" tagline in the footer, the meta
description and the share card.

## The finding that outlives this row: words are not why the page is long

**The word count fell a fifth and the scroll only a fourteenth.** Most of the page's height is
screenshots and card grids. It also **tells its story twice**: the four ways-to-start cards and
the five-step walkthrough cover the same ground, each with its own screenshots, and operating is
covered three times over (walkthrough step 05, the operating grid, the states grid).

I did not cut either telling. It removes a whole section and its screenshots, which is a design
decision with his taste in it, and the row was a voice row. **This is the question worth putting to
him next**, and it is the only way the page gets materially shorter without deleting evidence he
passed. Written up in `docs/backlog/public-copy-should-read-finnish-plain.md`.

## How the second Antigravity pool graded on a voice task

Nothing had measured `agy` / `claude-opus-4-6-thinking` on writing before. Seven runs, all
recorded with `scripts/delegation-outcome.mjs` (`~/.noacg/delegation-outcomes.jsonl`, labels
`ce-landing-voice-*`). **Two unusable, five repaired, none clean.** The verdict: it drafts
readable prose and is useless as a judge of its own work.

**The headline defect, and it is systematic: every single draft over-reported its own word count
by 40-60%.** Claimed 185 / 278 / 300 / 250, delivered 283 / 445 / 469 / 409. Each one printed a
tidy per-element tally and a checklist of ticks. It counts only the paragraphs it consciously
rewrote and silently omits headings, card bodies, chips and list items. **So the whole length cut
had to be done by hand in the judging pass** - the delegation bought drafting, not shortening,
which was the row's actual metric.

**Two runs burned their turn counting and never called `write_file`** (19.6s / 15.1s, out 723 and
611 tokens, billed ~34K and ~54K input for nothing). Both were the tightest budgets (55% cuts).
The recovery is a prompt line, and it worked first time on both:

> Work in this order: decide which whole sentences are only selling and delete those; write the
> remaining facts in the plainest words you have; call write_file ONCE, BEFORE any tallying. The
> word ceiling is a target, not an arithmetic puzzle. The one thing that is NOT acceptable is
> producing no file.

**Three other repeat behaviours, all against explicit instructions in the prompt:**

- It **reflows line wrapping** even under "MARKUP IS FROZEN, every tag and HTML comment comes back
  exactly as it went in". Two of five drafts collapsed every wrapped paragraph into one long line.
- It **escapes literal characters** (`→` became `&#x2192;` in three places).
- It **edits `alt` text and deletes HTML comments** it was told to preserve. One draft dropped a
  maintainer comment explaining a real ordering decision; I restored it.

Cost across the seven runs: ~337K input, ~44K output, ~497K cache read. The hero run alone took
466s and 88K input for 24 lines - it is slow when the ceiling is tight, because it spends the turn
arithmetic-checking.

**Routing conclusion**: this pool is fine for "draft prose from a spec", bad for anything with a
measurable acceptance condition it is asked to self-check. Give it the constraint, then measure the
constraint yourself. Never take its own tally.

## Traps that exist in no repo file, and now do

**`check-client-neutral.mjs` matches whole SOURCE LINES.** Its allow-list holds the literal string
`CasparCG, OBS, vMix and SPX`, so that phrase is kept alone on its own line inside a paragraph in
`#yours`. The delegate's reflow joined it to the surrounding prose and the build went red. The odd
wrap now carries a comment saying why, at `index.html` in the no-lock-in section. **Any future
reflow of that paragraph fails the build the same way.**

**`e2e/landing.spec.ts` pinned "free and open source" to `.hero .lede` specifically.** The rewrite
moved that claim to the kicker above the headline, which is where it now lives, and CI went red on
run 34535182497. The assertion now looks at `.hero` as a whole with a case-insensitive matcher that
tolerates the ampersand, and the reason is written beside it. Anyone rewording the hero should read
that comment first.

**The existing `design-count` rule in `check-copy.mjs` only matches DIGITS** (two to four of them)
before a catalog noun. "Six free starters" and "Four ways in" walked straight through it, which is
why a stale count reached a public page twice. Extending it to number-words is proposal 1 in the
backlog file.

## Anything that needs the owner

Only his eye on the voice, which is the point of the row. The acceptance file is
`docs/acceptance/owner-queue/2026-09-10-ce-the-landing-page-in-plain-words.md`, `because: taste`,
route <https://noacg.studio>. Two decisions in it are flagged for him to overrule in a line: the
deleted five-part closer, and keeping the walkthrough's step numbers 01-05 (they are wayfinding
down a five-step story, not a claim about what we have, and they cannot go stale).

## What is left

- **`/docs`** had the 2026-08-26 punctuation and sentence pass but never the length, hype or
  magic-number pass. Same complaint, bigger surface.
- **The import step** carries the same ask, filed as
  `docs/backlog/import-step-copy-a-kid-can-read.md` since 2026-09-03.
- **The missing voice gate**, written up as three concrete proposals in the backlog file (a
  countable-quantity rule covering number-words, a per-file word budget baselined like the tells,
  and a banned-hype list seeded from what this pass removed). **Deliberately not built tonight**:
  a gate lands alone, and three other rows were live.
- **`.grid3` in `index.html` is dead CSS** and was dead before this branch (it is in the merge
  base with no element using it). Reported, not fixed, because it is outside this diff.

## The check

`review: delegated` 5 findings, 5 fixed. Scope-checked: the pass reported merge base
`0634d6bd053cc171bc8a5b08de13ce7eedd9fbf8` and the same three files `review-request.mjs` handed it,
and `git diff --name-only $(git merge-base origin/main HEAD)..HEAD` agrees. **The review earned its
keep**: it found the CI-breaking spec assertion before CI did, and it found that I had deleted the
anonymous render cap - a graded honesty claim (`docs/PROMISE_AUDIT.md` row 21) - which is exactly
the trap the row's prompt warned about. It is back in the `#video` note, said without a number.

`simplify: inline` - the skill returned fan-out instructions, so the leg ran here. Nothing to
change: the diff is copy plus one assertion. The one mechanical check that applies to a copy diff,
CSS selectors left dead by removed markup, found only `.grid3`, which predates the branch.

`verify: inline` - `npm run build` green (exit code read directly, not through a pipe).
`npm run test:e2e:affected` queued as j-1040: 4 changed files -> `landing.spec.ts`, 6 passed.
`taste: not applicable` - nothing here moves what a graphic looks like.

Stamped `46891f5a: PASS`.

## Pointers

- The rewrite: `62fd37b2`. The receipts: `65dc9599`. The review fixes: `46891f5a`.
- Delegate prompts and drafts are in the session scratchpad, not the repo. The prompt shape that
  worked is quoted above; the preamble is the verbatim one the row prompt supplied.
- Word counts are reproducible: strip comments, `<script>`, `<style>` and tags from the `<body>`,
  collapse whitespace, split on spaces. The demo monitor's own text (63 words) is excluded from
  the prose figure and included in the 1767.
