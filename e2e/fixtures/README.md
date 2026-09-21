# e2e fixtures

Real generated artifacts kept as reproducers, so an investigation does not need to spend
tokens regenerating one.

- **`hf-transparent-lower-third.html`** - a HyperFrames transparent lower-third from the
  varied-brief benchmark whose two text lines sit at x = -1551 through the entire hold: the
  strap never leaves its entrance position, so nothing is readable. It is the reproducer for
  the open readability-gate instability described in `docs/HYPERFRAMES_QUALITY.md`
  (follow-up 1) - the same source has validated both PASS and FAIL in different sessions.
  Validate it with `validateHyperframesComposition` against the real mounted bridge at
  4 s / `transparent: true`.
- **`illustrator-quiz-lower-third.svg`** - a copy of the lower-third quiz the docs handed out
  until 2026-09-22, when the docs went to one example per type. It is an Illustrator Save a Copy
  export with the question drawn over answer plates inside a thin board, and
  `e2e/import-svg-behaviour.spec.ts` walks it to pin that a long question wraps in the band above
  the plates rather than shrinking onto one line.
