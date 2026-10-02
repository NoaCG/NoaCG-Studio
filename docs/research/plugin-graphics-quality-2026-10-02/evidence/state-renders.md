# State renders from the CLI alone, 2026-10-02

Follow-up to failure 2 in `../README.md` (spec AC-4): the hockey and quiz agents could not render
their own machine states from the CLI, and every frame was transparent, so viewers showed it on
white. This records what the CLI now does and the frames it produced for the two packages, with
no harness of any kind.

## What was built

- `noacg screenshot --event <op>` (repeatable). After a Take with the state's data (and any
  `--data`), each op runs in order: a declared button event, sent with the payload its press
  carries (`adjust`, `set`, `add`, `remove`, `payload`, ported from the studio's `eventPayload`,
  with the moved values written back so a second Goal makes 2); `next`, `out`, `take`;
  `field=value` (an Update); `wait:<time>`. Each op is followed by 1.5 s.
- `--at <time>`: the moment after the last op the frame is taken (default 1.5 s).
- Time runs on Playwright's clock, installed paused before the document loads, in a browser
  context of its own per render (the clock belongs to a context, and pausing the bridge's would
  stop the bridge's timers). Only the run moves it. CSS animations and transitions, which that
  clock does not drive, are paused and moved by hand by the same amount; that half is reasoned,
  not measured, since both packages and the fixture animate with GSAP. The same command gives
  the same frame every time (the timer frame re-rendered byte for byte), and `--at 31s` takes
  seconds.
- `--background transparent|checker|video|<CSS colour>|<image file>`, on `screenshot` and on
  `validate --screenshots`, painted on the root behind the graphic. `video` is a CSS-only
  defocused plate with warm, cool, bright and dark areas. The package thumbnail stays
  transparent.
- `validate --screenshots` walks the machine after off/onair/stress: breadth first from the Take
  over the declared events (and Next while there are steps), up to three presses deep and 40
  renders, four at a time, and stops once every declared state except the lifecycle's off and
  out has a frame. One frame per newly reached (group, state), named `<group>-<state>.png`, each
  printed with the `--event` list that reproduces it.
- The result reports the machine state at the shutter, and a note when an event press did not
  move the machine, so a frame is never passed off as a state it does not show.
- Unchanged: `screenshot`/`validate` without the new flags write byte-identical frames (checked
  on both packages' off/onair/stress against the previous build).

## The frames

Packages: `../brief-2-hockey/hockey-scorebug.zip` and `../brief-4-quiz/pub-quiz.zip`, the zips the
agents produced and the studio walk imported. Commands run from this folder's parent with
`NOACG_URL` set to a dev server of this checkout.

| Frame | Command | What it shows |
|---|---|---|
| `state-renders/hockey-power-play.png` | `noacg screenshot brief-2-hockey/hockey-scorebug.zip --event clockStart --event goalA --event ppB --at 3s --background video --out ...` | HOM 1 AWY 0, 1st, clock 19:55, the AWY POWER PLAY tab at 1:58, over the video plate. The small dark bug holds up on the bright and dark parts of the plate; its thin team-colour bars are the only colour. |
| `state-renders/hockey-intermission.png` | `... --event clockStart --event goalA --event ppB --event clockStop --event ppEnd --event interval --out ...` | HOM 1 AWY 0, END 1st, no tab. The same press order as the studio walk; matches `../brief-2-hockey/05-intermission-program.png`. |
| `state-renders/hockey-final.png` | the same presses plus `--event final` | HOM 1 AWY 0, FINAL. Matches `../brief-2-hockey/06-final-program.png`. |
| `state-renders/quiz-reveal.png` | `noacg screenshot brief-4-quiz/pub-quiz.zip --event judge --background video --out ...` | Answer C ticked and kept blue, A, B and D greyed, over the plate. The cream question card reads well on it. |
| `state-renders/quiz-timer-running.png` | `... --event startTimer --at 4.5s --out ...` | The ring timer at 26, its arc partly run down. |
| `state-renders/quiz-timer-run-out.png` | `... --event startTimer --at 31s --out ...` | The timer's own run-out look: a dark disc with an orange 0. Nobody saw this frame in the original walk. |
| `state-renders/hockey-validate/` | `noacg validate brief-2-hockey/hockey-scorebug.zip --screenshots state-renders/hockey-validate` | off, onair, stress, then `clock-running`, `pp-a`, `pp-b`, `play-interval`, `result-final`, and `clock-stopped` (reached by clockStart then clockStop). |
| `state-renders/quiz-validate/` | `noacg validate brief-4-quiz/pub-quiz.zip --screenshots state-renders/quiz-validate` | off, onair, stress, then `main-reveal` (judge) and `timer-running` (startTimer). |

The 4 s timer frame shows 27, not 26: the countdown ticks on whole seconds from the press, which
lands a frame after the op, so 4.000 s is just before the tick. 4.5 s shows 26. That is the
frame at that instant, and it is the same on every run.

## Timings (this machine, dev server, 2026-10-02)

- `screenshot` with events: about 4 to 6 s per frame, most of it the CLI's own start and bridge
  connection. `--at 31s` costs no more than `--at 1.5s`.
- `validate --screenshots`: hockey 38 s (11 events, 6 state frames), quiz 26 s, against 11 s for
  the quiz's `validate` without frames.
- The CLI suite with the new `cli/test/screenshot-states.test.mjs`: 219 tests, all passing.

## What did not work, or is left

- The first attempt paused the clock after the page loaded; under parallel renders that raced
  the clock ("cannot fast-forward to the past"), and the bench context's shared clock would have
  stopped the bridge page too. Each render now has its own context with the clock paused from
  the start.
- The press payload rule is a port of the studio's `eventPayload` (the CLI talks to a deployed
  bridge that does not expose it). A change to that rule in the studio has to be copied here;
  exposing it on the bridge, or a mirror test like `cli/test/playout.test.mjs`'s, would remove
  that risk.
- The MCP `screenshot` verb (`cli/src/mcp.ts`) does not take `--event`, `--at` or
  `--background` yet; this change kept to the terminal commands.
- The walk does not press Out or fields, and stops at three presses deep: a state reached only
  by a longer path, or by a timer firing on its own, has no frame from the walk. `screenshot`
  with `--event` and `--at` reaches those.
