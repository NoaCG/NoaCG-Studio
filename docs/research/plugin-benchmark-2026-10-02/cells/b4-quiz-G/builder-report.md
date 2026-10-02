# b4-quiz-G builder report (condensed)

Opus subagent, 203k tokens, 55 tool calls, 11.0 min. Opened `design-notes.md`, not
`critique.md`. Package `pub-quiz` from `scaffold --type quiz-board --design qz01`, markup, CSS and
data rewritten, machine cut to Reveal answer plus an authored timer group. One accidental bare
`noacg` call hit the machine's older 0.3.3 CLI (help only).

- What it says the guidelines set: one accent used once (quiz yellow, the correct answer only);
  question 72px, answers 52px, header numbers 56px from the size ranges; "bounce only when asked
  for playful" read as permission for back.out pops, not bounce; the 120px safe area.
- Look, by its account: one big deep-indigo board; ROUND and QUESTION chips; four answer tiles
  2x2 with white letter chips; a giant faint tilted "?" behind; reveal turns the right tile yellow
  and dims the rest to 30%; a timer dial top-right with a draining bar, pulsing white for the
  last 5 s.
- Operator surface: Round and Question number (numbers), Question, Answers A-D, Correct answer;
  ROUND, QUESTION and the timer length as hidden word sources; buttons Reveal answer, Start timer,
  Stop timer; Next also reveals. Next question means Out, edit, Take.
- Validate: 0 errors, 0 warnings.
- Friction it reported: quiz-board is a contestant game show with no counter, timer or neutral
  design, so most of the type was thrown away; a flaky bench (`bench-events-skipped` on identical
  logic, fixed by a longer exit delay); validate rewrote its HTML and CSS ("normalized") and
  reported an engine note that described the pre-rewrite files; the timer relies on
  `noacgEventAt`, known only from a scaffold comment; `--at` units.
