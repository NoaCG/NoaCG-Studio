# b4-quiz-D builder report (condensed)

Opus subagent, 252k tokens, 64 tool calls, 13.8 min. Package `pub-quiz` from
`scaffold --type quiz-show --design qz14` ("Showtime"), contestant picks removed, timer group
authored.

- Look, by its account: a theatre-marquee board in deep red and gold; ROUND left, QUESTION right,
  the timer dial between; the question on a plaque with chasing bulbs; four lit answer pills 2x2
  with gold A-D badges; question 60px, answers 46px. Reveal floods the right answer gold with a
  tick and dims the rest; the timer ring drains, turns red for the last 5 s, flashes TIME!.
- Operator surface: Question, Answers A-D, Correct answer (A-D select), Round and Question number
  as numbers; ROUND / QUESTION / TIME! and the timer length as hidden word sources; buttons Reveal
  answer, Start timer, Time up now, Hide timer; Next also reveals. No next-question button: the
  operator types the next question and re-takes.
- Validate: 0 errors, 0 warnings.
- Friction it reported: no quiz type without a contestant and no neutral quiz design, so the
  catalog look shaped the result; scaffold file names follow the design unless `--name`; Next
  moves only the main group, so a running timer needed an explicit hide (learned from the
  interpreter); text fitting holds each line to its sample's room (learned from the runtime);
  `color-mix` flagged as unsupported in OBS 30 / CasparCG 2.3 and replaced; `--at 27` is 27 ms; a
  clean validate never says whether the bench pressed every button.
