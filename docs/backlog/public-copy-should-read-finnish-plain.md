---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: advanced
note: "index.html rewritten in 62fd37b2 - 2211 words to 1767, the named slogan and every countable claim gone. /docs, the import step and the missing voice gate still stand."
asked: "it could be shorter and more cut-to-the-chase type of text ... it could have the Finnish style: no jargon and hype, just what it is and what it does"
---
# The public copy should read Finnish-plain, not like marketing

**Filed:** 2026-09-10, from the owner's walk of the landing page
(`docs/acceptance/owner-queue/2026-09-08-the-landing-page-says-what-it-can-prove.md`).

He passed the page's HONESTY - the graded claims, the dashed direction cards, "Bring your own
artwork" - and failed its VOICE.

## His words

> Otherwise, it's fine that text even though I get a little bit of AI wipes when I read it, I don't
> know what makes it that way. I think it could be shorter and more cut-to-the-chase type of text.
> I think maybe just shorter, because people don't read that much, and it could have the Finnish
> style: no jargon and hype, just what it is and what it does.
>
> The free, open-source is also too AI-like, I think we could remove: "No seat licence. No monthly
> bill. No edition above this one." And just say that it's free and open source, and that we love
> to hear your feedback. Let's not do too much marketing. Let's just write it as it is, very cut to
> the chase. No AI jargon.
>
> Again, with the numbers, the magic numbers: we don't have any magic numbers. Is it 16 or 36
> templates or test graphics? We don't have to put these magic numbers anywhere. Just say that we
> have them.

## The three things this asks for

1. **Shorter.** Fewer words per section, on the stated ground that people do not read much. Length
   is the metric he named, so a rewrite that keeps the word count has not done the job.
2. **No hype, no jargon - "Finnish style".** Say what it is and what it does. The named casualty is
   the free-and-open-source section's triple slogan, **"No seat licence. No monthly bill. No
   edition above this one."** It goes. What replaces it: it is free and open source, and we would
   like to hear your feedback. Nothing more.
3. **No countable numbers in public copy, ever.** Not "16 graphic types", not 36, not a spec count.
   He does not want the number corrected, he wants it absent: say the graphics exist. This is the
   second time a stale count has been caught on a public surface, and the first fix was to update
   the number rather than remove it, which is why it came back.

## Why the landing page was not already covered

`docs/backlog/copy-tells-drain.md` slice 1 rewrote `/docs` sentence by sentence on 2026-08-26 and
**deliberately left the landing page's selling voice alone**, swapping only its punctuation,
"because the owner had accepted its copy". That acceptance is withdrawn as of 2026-09-10. The
landing page is now in scope for the same treatment `/docs` already had, and it is the higher-value
surface of the two.

## What we already have to work with, and what is missing

- **`scripts/check-copy.mjs`** with `scripts/copy-baseline.json` gates NEW copy tells across the
  repo. It catches punctuation and phrase tells. It cannot catch length, hype or a magic number.
- **The `unslop` rules** in the owner's own global agent config are a written list of the tells he
  is reacting to. They govern what an agent writes TO him. **Nothing applies them to the product's
  own copy**, which is the actual gap: the page was written by an agent following no voice rule.
- `docs/backlog/import-step-copy-a-kid-can-read.md` is the same complaint on the import step,
  raised 2026-09-03, where he asked for "an /unslop for this too".

So this is not a one-page job. The missing mechanism is a stated voice for user-facing copy that a
gate or a review step can actually check, and the landing page is where it gets written down first.

## Two rule candidates worth recording with `npm run learn` once the pass is done

- No countable number in user-facing copy unless a gate keeps it true.
- User-facing copy states what the thing is and what it does, in the fewest words that stay
  accurate; no slogan constructions and no triples.

Both are taste rules with a clear owner statement behind them, which is what `contracts/rules/`
is for. Filing them before the rewrite would be premature: write the copy first, then record the
rule the copy proves.

## What landed, 2026-09-10 (`index.html` only)

The landing page was rewritten section by section. All three demands are met on that page:

- **Shorter.** Body text 2211 -> 1767 words, a 20% cut. The rendered page went 11496px -> 10675px
  at 1265px wide (measured in the dev server, before and after, on the same viewport).
- **The named slogan is gone**, and so is the five-part closer "Make it. Brand it. Animate it.
  Export it. Run the show." - the same construction he objected to, one section further down. The
  free section now states the fact and asks for feedback, which is what he said should replace it.
- **No countable claim is left.** "Four ways in", "One screen, four doors", "Six free starters" and
  "OGraf v1" are out, said as what exists rather than how much of it. The step ordinals 01-05 and
  the demo monitor's own clock and score stay: neither is a claim about what we have, and both are
  wayfinding a reader uses. **If he disagrees about the step numbers, that is a one-line change.**

Every graded claim survives, and so does every device he passed on the same walk: all three dashed
direction cards are still there and still marked Direction, the note under them is word for word,
and the "Bring your own artwork" heading is word for word. Their one-line bodies and that card's
paragraph were shortened; nothing they claim changed. The one honesty claim this pass dropped and
had to put back is the anonymous render cap, caught by review and restored to the `#video` note
where it belongs (`docs/PROMISE_AUDIT.md` row 21).

### The finding worth acting on: words are not why the page feels long

The word count fell 20% and the scroll only 7%. Most of the page's height is screenshots and card
grids, not prose. **The page also tells its story twice**: the ways-to-start grid and the five-step
walkthrough cover the same ground with their own screenshots, and operating is covered by the
walkthrough's last step, the operating grid and the states grid. Cutting words cannot fix that;
dropping one of the two tellings would, and that is a design decision with his taste in it, not a
copy edit. **Worth putting to him: does the ways-to-start grid earn its place next to the
walkthrough?**

## What is left

- **`/docs`** got the sentence-by-sentence tone pass in 2026-08-26 but not the length or hype pass,
  and it has never been checked for magic numbers.
- **The import step** carries the same complaint, filed separately as
  `docs/backlog/import-step-copy-a-kid-can-read.md`, where he asked for "an /unslop for this too".
- **The missing gate.** `scripts/check-copy.mjs` catches punctuation and banned phrases; it cannot
  catch length, hype or a count. Proposed as its own row, because a gate lands alone:

  1. **A countable-quantity rule that covers word-numbers**, not only digits. Today `design-count`
     matches two-to-four digits before a catalog noun, so "Six free starters" and "Four ways in"
     passed it. Extending it to `one|two|...|twelve` plus the same nouns would have caught both.
  2. **A per-file word budget for the public pages**, baselined the way the tells are, refusing a
     rise. That makes length a ratchet nobody can quietly undo, which is the actual failure here:
     the page grew section by section with every section defensible on its own.
  3. **A banned-hype list**, seeded from what this pass removed: broadcast-grade, production-ready,
     plug-and-play, "zero extra work", "not just X", "isn't just X", "made simple". Each entry
     needs the same test the existing rules pass - would a NoaCG-shaped sentence ever need it.
