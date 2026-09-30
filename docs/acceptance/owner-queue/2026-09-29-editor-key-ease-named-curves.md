---
kind: decision
date: 2026-09-29
serves: now
answered: true
done: true
---
# Does Easy Ease In on a Bounce or Overshoot key replace it?

Key-side easing (R1.2a.2) changed one default from the brief. The brief kept the
departing half of a named curve exactly, as a bezier point, whenever that curve has one. Named
eases have always been stored as the ease INTO their key, so R1.2a.2 reads a named curve as belonging
wholly to the key it arrives at. Its departure counts as unset (Linear).

What that changes, on one selected key:

- **Shipped:** Easy Ease In on a key that arrives with Bounce, Overshoot or `power2.out`
  replaces that curve with a Linear start and an eased arrival.
- **Brief's default:** Easy Ease In on an Overshoot or `power2.out` key changes nothing (their
  arrival is already eased), and on a Bounce key it refuses.

Recommendation: keep the shipped reading. Each preset visibly does what its name says, and Bounce keys stay
editable. Either way, selecting both keys and choosing Linear or Easy Ease sets the whole
segment. Reverting is a small change in `departingPoint` (the
[receipt](../../research/editor-r1-2a-2/README.md) says how).

## Owner answer, 2026-09-29

Keep the shipped reading: a named ease belongs wholly to the key it arrives at. Nothing changes in
the code; the [R1.2a.2 receipt](../../research/editor-r1-2a-2/README.md) records the answer.
