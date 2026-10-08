# TASTE_RUBRIC.md - the checks a reviewer can answer from a screenshot

**This file changes ONLY from an owner ruling. Never from an agent's opinion, never from a
measurement, never from "this seems better".** Every entry below carries the words it came from and
the date it was said. If you believe something belongs here, propose it and get it ruled on; if you
want to record a design decision that is yours rather than the owner's, `docs/DESIGN_LANGUAGE.md`
is where that goes.

**What it is for.** Unattended work needs two things to be trusted: machine-checkable floors, and a
reviewer calibrated to the same taste as the owner. The floors are gates (`npm run build`,
`scripts/check-copy.mjs`, the catalog sweeps). This file is the reviewer. It holds only checks that
are **yes/no from a screenshot or a thirty-second look at the surface** - no measurement, no tooling,
no reading the code. Anything needing an instrument belongs in the code that measures it.

**How to use it.** Before you call a visible piece of work done, walk the checks in order and answer
each one out loud. A NO is a defect, not a preference: fix it or say in the handoff that you did not,
and why. Reviewing somebody else's screenshot works the same way.

**What it is NOT proof of.** Owner ruling, 2026-08-28: *"Passing those four would make me more
confident that the surface is clear, intentional and functional, but it would not make the graphic
pass my eye. The rubric currently checks product UX much more than visual graphic design. Keep it,
but don't use it as proof of visual quality."* Never present a rubric pass as a visual-quality
verdict. The separate, very small screenshot-based GRAPHIC-taste review - hierarchy, composition,
restraint, coherence, overall on-air quality - is [`docs/backlog/visual-taste-review.md`](https://github.com/NoaCG/NoaCG-Studio/blob/37ea09db16312f806052a29614bf6e53cef1ebb3/docs/backlog/visual-taste-review.md) until it
exists.

---

## 1. Too much text

> **Is every thing on this surface saying its piece in ONE line?**

Owner ruling, 2026-08-26. One line per thing. If a thing genuinely needs more, the rest goes behind
an **i** - an info affordance the reader opens on purpose - not onto the surface where everyone pays
for it.

- **Fails:** a two-sentence helper under a field; a card with a title, a subtitle and a description;
  a dialog that explains the feature before offering it; a tooltip that is a paragraph.
- **Passes:** one line that says what the thing is or does, with the caveat, the rationale and the
  edge case one click away.
- **The test when you are unsure:** delete the second line. If the surface still works, the second
  line was never earning its place.

This is a rule about the SURFACE, not about the product being shallow. The detail still exists; the
reader chooses when to meet it.

## 2. Generic AI copy

> **Would a person who cares have written this exact sentence?**

Owner ruling, 2026-08-26, from the complaint that gets made most often about this product: an
em-dash reads as machine-written, and once a reader decides that, nothing else you show them
recovers it.

- **Fails:** an em-dash (the gate refuses new ones); "seamlessly", "empower", "elevate", "delve",
  "whether you are a student or a broadcaster"; a sentence that would fit any product in the
  category unchanged; a label that describes the CATEGORY of thing rather than this thing.
- **Passes:** a sentence with a specific noun in it. Something only true of NoaCG. A plain dash, a
  comma, or two sentences.
- **The test:** could this line be pasted into a competitor's page without editing? Then it says
  nothing.

`scripts/check-copy.mjs` holds the mechanical half in `npm run build`, over the product UI and over
the comments every export ships. The gate catches the phrases somebody wrote down. This check is for
everything else, and it is the half that actually matters.

## 3. No dead controls

> **Does every control on this surface do something when pressed, right now?**

Owner, standing: *"we can't show buttons if they're not working."*

- **Fails:** a button wired to nothing; a disabled control with no visible reason it is disabled; a
  tab that opens an empty panel; a "coming soon" affordance sitting among live ones; a form that
  accepts input and discards it.
- **Passes:** the control acts, or it is not on the surface. A control that is legitimately
  unavailable right now says why in the same glance (greyed WITH the reason, which is what the
  generated control layer does with an illegal event).
- **Note the asymmetry:** shipping the surface without the control is fine. Shipping the control
  without the behaviour is not.

## 4. Self-evident

> **Looking at this cold, do you know what it is without being told?**

Owner, standing: *"if I can't automatically understand what it is, it's probably not good enough."*

- **Fails:** a panel that needs the commit message to make sense; an icon whose meaning you learned
  from writing it; a state the user cannot name; a graphic whose purpose you can only explain by
  describing the feature behind it.
- **Passes:** a person who has never seen this screen names the thing correctly on sight.
- **How to actually run it:** show it to someone (or come back to it after an hour) and ask what it
  is. Their first guess is the answer. Explaining it afterwards does not change the result.

---

## What this file is deliberately NOT

- **Not the design language.** Typography, colour, motion doctrine and generated-code style are
  `docs/DESIGN_LANGUAGE.md`, and that is where a taste decision with a number in it goes.
- **Not the composition instrument.** The owner's six measured composition invariants - mark
  centring, the mark-to-accent gap, the secondary-text floor, weight and contrast, mark real estate,
  a package's mark being present on every piece or none - live in code
  (`src/ai/spike/tasteCheck.ts`) because they are measurable. Two of them carry no pass/fail on
  purpose, and one was withdrawn entirely after being calibrated perfectly, because **a threshold
  can fit the data and still assert something the owner does not believe**. That is the reason this
  file holds only questions a human answers.
- **Not a style guide for maintainer prose.** Check 2 is about text a user reads. Nobody outside
  this repo reads a code comment.
- **Not exhaustive.** Four checks that are actually run beat twenty that are skimmed. It grows one
  owner ruling at a time.

## Adding an entry

1. The owner ruled on it, in words you can quote, on a date you can name.
2. It is answerable YES or NO from a screenshot, with no tool and no measurement.
3. It has a failing example and a passing example, both concrete.
4. If it needs a threshold, it does not belong here - build the instrument instead.
