# Finding a graphic by what it is FOR

**Date:** 2026-09-06 · **Branch:** `claude/g-use-case-metadata`
**Your ask:** `docs/backlog/graphic-use-case-metadata.md` (2026-08-28 walk) — *"if they're
searching for a specific 'thanks for watching', they might not find it if we don't mention
that... so if someone is confused and not really sure what they want, they can find guidance."*

## The route (under a minute)

1. `npm run dev`, open `/app`.
2. New graphic → **Browse**.
3. Type your own example into the search box: **thanks for watching**.
4. Then clear it and type **goodbye**.
5. Then clear it and type **be right back**.

## What to look at

**"thanks for watching"** — ss09 is still first, as it was. What is new is its company: ten more
cards, and every one of them is genuinely an ending — the four house sign-offs and six credit
rolls. The front doors it shares a skin and a shelf with (House Hold, Quiet Hold, Volt Hold) are
not in the list at all. That is the guidance half of your ask: you asked for one card and you are
shown the family it belongs to, without the family being "everything on the same shelf".

**"goodbye"** — this is the one that proves it. Before today it returned **nothing**, and the
step reported the word as ignored. Your own phrase worked by accident, because ss09 is literally
*called* "Thanks for Watching"; "goodbye" is the same request one step out, where nothing was
named after it. It now returns the same eleven endings.

**"be right back"** — before today this returned all 21 holding screens at an identical score,
and Short Break, the card the words actually ask for, came **eleventh** — under five pre-show
cards and a church hold. Now the five break cards lead and the front doors follow. They are
ranked down, never hidden: if you meant the shelf, the shelf is still there.

Also worth a try if you have a spare ten seconds: **technical difficulties** (used to drop the
word "difficulties" as unreachable; now finds all three, across two shelves) and the Swedish
**pausbild** / Finnish **taukokuva**.

## The judgement I would like

**Is the vocabulary right?** It is five values and it is deliberately a CLOCK — before the show,
what is next, during a break, something has gone wrong, the end of the show. Everything else I
considered was refused by a written rule and the refusals are recorded
(`docs/TEMPLATE_TAXONOMY_PROPOSAL.md` §21.2): award shows, fundraisers, weddings and memorials
are already programme FORMATS, and openers are already a title subtype. The rule is a gate, not a
paragraph — a sixth value that fewer than three designs carry fails the build's own check.

**Two things I decided rather than asked, and either is easy to revert:**

- **The occasion does NOT show on the Browse card yet.** Your style-labels ruling from the same
  walk is why — a label every card carries is exactly the "it's not really helping that much" you
  read off the style names. The only version worth shipping shows it when it DISTINGUISHES and
  hides it when every card on screen says the same word, and that needs the card file, which
  another session owned last night. The rule is written down at §21.5 for whoever takes it.
- **Only 36 designs of 502 declare an occasion.** That is not laziness — I declared every design
  I could say honestly, and left the rest blank. A wrong moment puts a graphic in front of
  somebody at the wrong point in their show, so a gap is better than a guess. The five I could
  not place are named in `src/templates/meta.ts` with the reason each one is ambiguous.
