---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# A long quiz question wraps above the answer rows instead of shrinking to one line

Row B found that both docs example quizzes put a long question on one line at about half its
drawn size, with empty board around it. The question was read as sitting at the top of the whole
board, and the answer rows under it closed it off, so it had no room to wrap. It now reads the
band it was drawn in, from the board's amber rule down to the first answer row. A question twice
the drawn length takes two lines at the full drawn 50px on `quiz.svg`, and a question nearly four
times as long takes three lines at 45px. On `quiz-lower-third.svg` the board is wide enough that
twice the length still fits one line. Nearly four times the length now takes two lines at 26px,
where one line would have needed about 24px.

Text over text is unchanged. A name over its role still keeps its drawn gap and still grows the
panel for a second line. Only a drawn plate under a line opens the band above it.

## The route, under a minute

1. Download `quiz.svg` from the docs Graphics page, or take `public/docs/examples/quiz.svg`.
2. Open the studio, choose Import graphic, drop it, and click through to Finish into a new
   production.
3. Take the cue, type "Which planet in our solar system is closest to the Sun, and how long is its
   year?" into Question, and press Update.
4. Repeat with `e2e/fixtures/illustrator-quiz-lower-third.svg` (the lower-third quiz the docs handed out until 2026-09-22), using a longer question: "Which planet
   in our solar system is closest to the Sun, how long does its year last in Earth days, and what
   is its surface made of?".

## What to look at

- **The full board.** The question sits on two lines in big type, centred between the amber rule
  and row A, with clear space above and below.
- **The lower third.** Two lines just above the answer plates. The first line should stay clear of
  the amber rule, and the second should keep its drawn gap to the plates.
- **Whether you like the lower third at that size.** The band there is thin, so two lines cost
  about a third of the type size. Say if you would rather the lower-third board grew instead. A
  quiz board does not grow under rule 3, so that would be a new rule.
