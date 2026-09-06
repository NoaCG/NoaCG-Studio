---
v: 2
source: owner
kind: ask
raised: 2026-08-28
state: advanced
asked: "palette options could be richer and MUST depend on what the graphic is built from"
note: 59380da0 landed part 1, the same-offer collapse of packages that differ only in roles the design never paints; the perceptual collapse he authorised and the richer options are open
---
# Style step: richer palette options, still dependent on what the graphic is built from

Owner walk 2026-08-28. **Part 1, the bug, landed 2026-09-02** ("Offer only palettes that can
change the graphic in front of you"): the Style step now asks `cssPaintsWith`
(`src/model/cssVars.ts`) which of the four colour roles a design actually paints with, drops
the accent bar where there is no accent, collapses packages that differ only in roles the
design ignores, and lists only the painted roles under Custom. This file is what is left.

## Why

Two things the owner asked for, which are the same question:

- **Richer options.** The custom section is liked (the typeface change "works really well").
  Candidates named: text outline/border, text colour. Small chooseable things.
- **Still dependent on the design.** "We need to keep this relatively simple and not start
  creating the editor already... I don't want everyone to go to the editor." Whatever is added
  obeys the rule part 1 established: it is offered only where it can change the graphic.

And one thing part 1 uncovered and deliberately did not answer. Nine of the twelve packages
still offered on an accent-less design look identical to a human: a dark panel with a white text
bar, differing by two or three units of 255 and a percent or two of alpha. They are
not dead - each builds a measurably different graphic, which `e2e/wizard-setup-fields.spec.ts`
proves - but nobody can choose between them by eye. Collapsing those needs a perceptual
threshold, which is a taste call rather than a measurement, so it waits for the owner.

(The two designs that paint with none of the four roles, imp01 and svg01, are imported artwork,
and the import flow has no Style step at all - so the "carries its own colors" branch in
`StyleStep.tsx` is a guard against a silent one-button collapse, not a screen anyone reaches.)

## What it is not

A second editor. If the answer starts to look like the Style panel, it has gone wrong.

## Owner ruling, 2026-09-03

Asked whether the nine look-alike packages should be collapsed too: **"Collaps them."** The
perceptual-threshold half is authorized; the richer-options half (text outline, text colour) is
not, and stays unstarted. He asked for the measured count of surviving packages per design before
it ships. The prompt for it was row B of the 2026-09-03 next-wave handoff, removed in 0c8941bd
once that wave drained; this file is now the record.
