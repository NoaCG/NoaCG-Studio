---
v: 2
source: owner
kind: ask
raised: 2026-09-10
state: unstarted
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
