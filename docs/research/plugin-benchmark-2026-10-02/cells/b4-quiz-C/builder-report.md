# b4-quiz-C builder report (condensed; the critique's claims kept whole)

Opus subagent, 199k tokens, 54 tool calls, 8.1 min, on a copy of b4-quiz-D's package. Opened
`critique.md`, not `design-notes.md`. Its own before/after sheet: `builder-before-after.png`.

**Critique, as it stated it:** the design already met the bar (the red and gold marquee look is
distinctive and fun, reading order right, the reveal reads over dark, bright and busy grounds,
long text wraps or shrinks), so no restyle. It named type size at pub viewing distance, the live
cost of moving to the next question (Out, type, Take, step the number by hand), and half bulbs at
the ends of the chasing rows.

**Changes it claims:**

1. Readability: answers 46 to 54px and medium to semi-bold, bigger A-D circles; question 60 to
   66px; timer dial 176 to 200px, its number 76 to 92px.
2. A new **Next question** button: type the next question, press it; it sends the text, clears
   the reveal, adds 1 to the question number, rebuilds the board and hides a running timer. Only
   enabled while an answer is revealed.
3. Polish: the bulb rows fade at their ends instead of showing half bulbs.

**Left alone:** look, colours, motion, dim level, the timer track.

Untested by its account: whether the panel's fields arrive before the button's event (a
one-frame flash of the new question revealed); Update during a reveal shows the new question
already revealed.

Friction: `--at` units; no per-verb `--help`; validate never says which buttons the bench
pressed (even `--json`); the contract does not say whether a button may lead back into a state on
the default path; control.md does not say whether a button's fields arrive before its event.
