# b1-news-G builder report (condensed)

Opus subagent, 163k tokens, 38 tool calls, 5.6 min. Opened `design-notes.md`, not `critique.md`
(it says it did not open `commands/graphic.md` or `README.md`; the transcript scan counts a
folder listing that named them). Package `haastateltava` from `scaffold --type lower-third
--design neutral`, a third field added.

- What it says the guidelines set: 120px in from the frame edge; one accent (a thin clear-blue
  left rule); name 54px bold, title 30px medium, location 28px at 70% white (the 28px floor);
  the strap hugs its text up to 1200px, then wraps; about 1.1 s in, 0.45 s out. It notes the
  guideline "same layout, different colours is a named failure" pulled against the neutral
  scaffold, and that its result is "fairly close to the scaffold's layout".
- Fields: Name, Title or role, Location (optional; empty hides it); an empty title collapses too.
  No buttons.
- Validate: 0 errors, 0 warnings.
- Friction it reported: empty defaults fail the bench (`bench-entrance` "not visible after
  play()", `bench-replay`) although the skill allows "empty", so a made-up sample name went back
  in (same as b1-C); type-plus-a-field versus `--fields` unclear; `--at 0.5` read as 20 ms;
  `--state stress` with `--data` does not double the given text (undocumented); a wrapped line
  leaves the plate at its cap width and the guideline does not say how to resolve it.
