# Drain the copy-tell baseline

**Filed:** 2026-08-26. **Source:** the gate that landed the same day (`scripts/check-copy.mjs`).

`scripts/copy-baseline.json` froze **5,818 lines across 540 files** that already carried a copy
tell when the gate landed - overwhelmingly em-dashes. The gate refuses every NEW one. **Slice 1 is
drained; 5,717 lines across 538 files are left.**

## Why

The owner's complaint is about text people actually read, and most of the frozen lines are exactly
that: the product UI a user meets, and the comments inside every export a customer opens. A gate
that only stops the next one leaves the accusation intact - the em-dash is *"the one thing people
complain about, claiming it's AI-written"* (owner, 2026-08-26), and there are 5,717 of them on the
shelf right now.

It is on the shelf rather than in the roadmap because it is a mechanical rewrite of five hundred
files that would collide with every session touching the catalog, and because a bad rewrite is worse
than the em-dash: the fix for a lot of these lines is a shorter sentence, not a character swap.

## What it would take

Not one job. The honest shape is a per-directory drain, each one small enough to land alone:

1. ~~**`index.html` + `docs.html`** - 101 lines, all of it public-facing marketing and
   documentation copy, the highest-value and lowest-risk slice.~~ **DONE 2026-08-26** in
   `claude/b-docs-polish`, as part of the tone pass the owner asked for after walking both pages.
   `/docs` was rewritten sentence by sentence; the landing kept its selling voice and only had the
   punctuation swapped, because the owner had accepted its copy. Both files are now out of the
   baseline entirely.
   **That acceptance was withdrawn on 2026-09-10.** Walking the landing page, the owner passed its
   honesty and failed its voice: too long, too much marketing, and a slogan he named for deletion.
   The landing page is back in scope, as its own job:
   `docs/backlog/public-copy-should-read-finnish-plain.md`. Note what the punctuation-only fix
   cost - the tells he reacts to are length and hype, which no baseline entry was ever going to
   catch.
2. **`src/components`** - 463 lines of product UI. Best done per surface (wizard, home,
   timeline) so it lands beside whoever is already editing that surface.
3. **`src/templates`** - 5,254 lines inside emitted HTML, CSS and JS comments. The biggest
   slice and the most delicate: these comments are teaching material inside a file a user opens, so
   the replacement has to read as well as the original. Best folded into catalog work rather than
   swept.

After each slice: `npm run check:copy -- --update`, and the baseline entries disappear. **The file
is the progress bar** - when it holds `{}` the drain is done and the gate becomes an absolute rule.

## Evidence

`npm run check:copy -- --update` prints the totals; `scripts/copy-baseline.json` holds the
per-file, per-rule breakdown. Rule-by-rule reasoning is in the header of `scripts/check-copy.mjs`.
The reviewer-side half of the same concern is check 2 of `docs/TASTE_RUBRIC.md`.
