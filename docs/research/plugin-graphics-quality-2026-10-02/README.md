# Plugin graphics quality: four fresh briefs, 2026-10-02

**Question.** When an agent with the `noacg` plugin makes a graphic from a brief nobody has seen,
does it come out looking like premium broadcast graphics, and does it work well from NoaCG's
control panel? Every judgement below points at a rendered frame in this folder; none rests on
reading the code. The plan that follows from it is `docs/work-specs/plugin-design-quality/spec.md`
and the backlog items it names.

**Short answer.** All four graphics validated, imported, played and answered every button in the
studio's Playout page. Behaviour is the strong part. The look is the weak part: two of four
(news lower third, hockey scorebug) are competent and ordinary, the same dark plate, Inter and
thin accent rule a stranger would get from any template tool. The one that looks paid-for (the
quiz) started from a catalog design; the gala title found its serif only by probing sixteen
catalog scaffolds. The plugin today gets graphics INTO NoaCG reliably; it does almost nothing to
make them BETTER, and the operator surface it produces is shaped for setup, not for the live show.

## Method

| | |
|---|---|
| Date | 2026-10-02, 00:50-02:00 local |
| Checkout | `claude/ai-plugin-graphics-quality` at `54e4c8811` (origin/main) |
| CLI | `@noacg/cli` 0.7.0 built from `cli/` in this checkout, put first on `PATH` by a two-line shim. This machine also has a global `noacg` 0.3.3, which an unshimmed run would have used. |
| Plugin | `cli/plugin` (skill 0.7.0) |
| Deployment | this checkout's dev server, `NOACG_URL=http://localhost:5240`, no account backend (no `.env.local` in a linked worktree) |
| Agent | one fresh Opus subagent per brief, one at a time, in an empty folder outside the repository (`C:\claude\ai-plugin-walk-2026-10-02\brief-N-*`) |
| Save path | the skill's no-account path: zip the package, import it through the studio's Import door |
| Studio walk | `harness/walk-studio.mjs` (Playwright, headless Chrome): Import graphics -> zip -> new production "Plugin walk" -> its Playout page -> the steps in `harness/steps-N-*.json`, screenshotting the whole page and the PROGRAM monitor |

**Limits of the method, said first.**

- **Not a terminal `claude -p` session.** The planned route was `claude -p` from an empty folder
  with `--plugin-dir cli/plugin` (`harness/run-brief.sh`). Terminal Claude Code is not logged in on
  this machine (`claude auth status`: `loggedIn: false`; the desktop app holds the subscription
  login), so every run failed with "OAuth session expired". Logging in is the owner's step. Each
  brief instead ran as a fresh Opus subagent told that the skill at
  `cli/plugin/skills/noacg-graphic/SKILL.md` was its installed skill and to ignore the repository.
  Its system context still carried this repository's instructions, so it is a near-stranger, not
  a stranger. None of the four read anything in the repo beyond the skill, by their own logs.
- **Codex was not used.**
- **Program frames are the studio's in-page PROGRAM monitor**, the graphic composited on black.
  No CasparCG, OBS or vMix, and no video behind the graphic. The CLI frames under `brief-N/cli/`
  are the agent's own `validate --screenshots` output, transparent PNGs that render on white.
- **The import's file pick was simulated** with Playwright's `setInputFiles` on the wizard's own
  file input. The rest of the studio flow is the real UI.
- **Nothing was saved to any account.** `noacg whoami` answered "not logged in" in all four runs.

| Brief | Agent wall clock | Agent tokens | Validate rounds | Final validate |
|---|---|---|---|---|
| 1 news lower third | 7.7 min | 145k | 2 + zip | 0 errors, 0 warnings |
| 2 hockey scorebug | 20.5 min | 265k | 4 + zip | 0 errors, 1 warning (f5 unpainted, a known false positive) |
| 3 gala event title | 6.8 min | 156k | 2 + zip | 0 errors, 0 warnings |
| 4 pub quiz | 13.5 min | 250k | 4 + zip | 0 errors, 0 warnings |

The two slow runs spent most of their time building their own headless-Chrome harnesses to see
states the CLI cannot render (failure 2).

## Brief 1: news lower third (`brief-1-news/`)

**Brief.** Interviewee lower third for "Pohjoisen Uutiset", a small regional Finnish channel:
name, title or role, an optional location line; names with ä and ö; long titles like
"Kehitysjohtaja, Pohjois-Pohjanmaan liitto"; serious public broadcaster, nothing flashy.

**What came out.** `scaffold --type lower-third --design neutral`, a third field added by hand.
A flat navy plate, square corners, a pale-blue rule, Inter: name 50px bold white, title 30px
grey, location 24px tracked caps in pale blue. Frames: `cli/onair.png`, `cli/stress.png`,
`cli/long.png`, `cli/no-location.png`; studio `02-take-page.jpg`, `02-take-program.png`,
`03-update-long-title-no-location-program.png`.

**Look, taste, style.** Correct and legible, and ordinary. The diacritics render, the plate hugs
the text, the hierarchy is clear (`cli/onair.png`). Nothing in it says public broadcaster rather
than "default template": no typographic character, no relation to a channel identity, a plate
colour chosen as "navy because serious". On the program monitor the navy plate on black reads as
a dark box with little edge (`02-take-program.png`). After the long title wraps, the plate stays
at its full width with an empty right half (`cli/long.png`,
`03-update-long-title-no-location-program.png`), which a designer would not ship; the validator
does not see it. The location line is 24px, below `docs/DESIGN_LANGUAGE.md`'s ratified 28px
secondary floor; the CLI validator accepted it (failure 6).

**Control panel.** Three text inputs, Take / Update / Out, no extra buttons
(`02-take-page.jpg`, `inspect.txt`). Right for a lower third. Clearing Location and pressing
Update collapsed the line cleanly (`03-update-long-title-no-location-program.png`). The field
labels are English on a Finnish channel's graphic; the sample "Oulu" airs unless the operator
clears it.

**Where its problems come from.** The look: the skill gives no design pass and the neutral
scaffold plus the one bundled font (Inter) set the ceiling (agent taste + skill + scaffold). The
wrap width: the agent's CSS, unmeasured by the validator. The optional line: the contract has no
pattern for it, so the agent invented a class toggle (contract).

## Brief 2: ice hockey scorebug (`brief-2-hockey/`)

**Brief.** Top-left scorebug for amateur hockey on YouTube: three-letter teams with colours,
score, period (1st/2nd/3rd/OT), a 20:00 countdown the operator starts and stops on the whistle,
a power-play indicator with its own two-minute countdown; one person runs graphics, so it must
be quick.

**What came out.** `scaffold --type scorebug --design neutral`, then rebuilt from markup copied out
of the catalog design `sb05`, plus an authored power-play group. A one-row dark strip with team
colour bars, bold sans, period and clock; a power-play tab drops below
(`cli/onair.png`, `cli/pp-onair.png`, `cli/break.png`, `cli/final.png`).

**Look, taste, style.** Tidy, legible, generic. It reads like the default scorebug of any
streaming tool: the team colours are two thin bars, the strongest identity cue in hockey graphics
(team colour fields) is barely used, and the strip and tab share one flat dark plate with no
hierarchy between live data and labels (`cli/pp-onair.png`). On the program monitor the bug is
small and dark on dark (`03-goal-a-then-pp-b-program.png`). It is airable for an amateur league;
it is not premium.

**Behaviour, driven in the studio.** Every press did what it said: Take, Start clock (20:00 to
19:53 in `03-goal-a-then-pp-b-program.png`), Goal Team A (score 1), Team B power play (tab with
1:57), Stop clock (frame identical 2.5 s later, `04-clock-stopped-program.png` is byte-identical
to `03`), Intermission (`END 1st`, `05-intermission-program.png`), Final (`FINAL`,
`06-final-program.png`), Out.

**Control panel.** This is the weak part (`01-ready-page.jpg`, `03-goal-a-then-pp-b-page.jpg`).
The panel opens on twelve inputs: teams, scores, two colour pickers, period, clock, power-play
clock and three "word" fields (POWER PLAY, END, FINAL). The buttons a one-person operator presses
all game (Start clock, Stop clock, Goal) sit below all of that, below the fold of a 1600x900
window, under a "Graphic actions" block that also carries a snap-to-state picker listing fourteen
internal states. The score can be changed three ways (Goal buttons, the field's - / +, and a
separate "Live numbers" block). Machine events have no keyboard shortcuts; Take has SPACE. For the
brief's "quick to drive" this is the wrong order.

**Where its problems come from.** The look: agent taste with no design pass (skill), and a
neutral scaffold that is itself broken: I scaffolded it untouched and it paints the two colour
fields as hex text and shows two clocks (`evidence/neutral-scorebug-onair.png`), so the agent
had to rebuild from a catalog design (type catalog). The panel order: the control panel model puts
every field before every action and has no notion of setup versus live (control panel model);
the word fields appear as ordinary inputs although the contract already has the right shape, a
`hidden` word-source holder that shows in the studio's Data panel and not on the operator page
(`references/contract.md`, the `hidden` ftype; `references/control.md`). The agent concluded the
definition "has nowhere to say that", because the skill never connects state words to word
sources (skill). The 20 minutes: no way to render the power-play, intermission or final states
from the CLI, so the agent built a harness (CLI); a bench-stress error the stress screenshot did
not show cost a round (validator).

## Brief 3: gala event title (`brief-3-gala/`)

**Brief.** Event title for a charity gala livestream, "Valon Ilta 2026": event name, a line like
"Live from Tampere Hall", the host's name; elegant and evening-like, not corporate.

**What came out.** `scaffold --fields` (typeless), Playfair Display copied out of catalog design
`card85`, a midnight plate with a gold inset frame, a gold hairline with a diamond, "HOSTED BY"
caps and the host in the serif (`cli/onair.png`, `cli/stress.png`; studio `03-take-page.jpg`,
`04-update-host-finnish-label-program.png`).

**Look, taste, style.** The best type of the four from-scratch looks: the serif carries the
evening tone and the hierarchy is clear (`cli/onair.png`). The composition is the stock gala
answer: a boxed card, an inset hairline frame, a diamond divider, gold on midnight. It is a large
centred plate in the lower part of the frame (`03-take-program.png`), which hides a lot of stage
for a between-segments graphic; a lighter, unboxed treatment would have been the more elegant
call. The default host value is the placeholder "Host Name", which airs if nobody types.

**Control panel.** Four inputs (Event name, Tagline, Host label, Host), Take / Update / Out
(`03-take-page.jpg`). Changing the host and the label to Finnish ("Juontaa") and pressing Update
worked (`04-update-host-finnish-label-program.png`). Right-sized.

**Where its problems come from.** The font: only Inter ships with a typeless scaffold and no
command lists or adds the others, so the agent probed sixteen catalog designs blind to find a
serif (CLI + scaffold). The pacing: the skill's 0.5-1.4 s entrance guidance made the agent cut
the slower build it wanted for a ceremony, and the validator's size preference pushed small
tracked caps from 20px to 24px, "heavier than I would have" by its own account (skill +
validator). The stock composition is the agent's own taste with no reference or critique step
(skill).

## Brief 4: pub quiz (`brief-4-quiz/`)

**Brief.** Pub-quiz graphic: round and question number, the question, four answers A-D; a button
reveals the right answer and dims the others; an optional 30-second timer; fun, and readable from
the back of a pub.

**What came out.** `scaffold --type quiz-show --design qz13`, contestant pick buttons removed, a
timer group added. A sticker style: heavy type, ink outlines, hard shadows, colour-coded answers,
a ring timer (`cli/onair.png`, `cli/onair-reveal.png`, `cli/onair-time-up.png`; studio
`03-timer-running-program.png`, `04-reveal-page.jpg`, `06-next-reveals-program.png`).

**Look, taste, style.** The one that looks paid-for. Distinctive, playful without being childish,
readable at distance: 62px question, 50px answers, four colours a room can shout. The reveal is
clear (tick, colour kept, others greyed, `cli/onair-reveal.png`). It holds a long two-line
question (`06-next-reveals-program.png`). Its quality comes mostly from `qz13`, the catalog
design it started from; the agent said so.

**Behaviour and panel.** Take, Start timer (26 after four seconds), Reveal answer, Hide timer,
editing the next question and Re-take, Next (reveals), Out: all worked
(`03-timer-running-program.png` to `06-next-reveals-program.png`). Ten inputs and three buttons
(`inspect.txt`, `04-reveal-page.jpg`). Two operator costs: Round and Question number are free
text ("Question 7"), so moving to the next question means retyping a label instead of one press
(it still read "QUESTION 7" on the next question, `06-next-reveals-program.png`); and the timer
length shows up in "Live numbers" as a - / + stepper, which reads as if it changes the running
timer.

**Where its problems come from.** The quiz types assume a contestant, so the agent had to remove
machinery from a 100 KB template.js by hand (type catalog); a second machine group (the timer) is
undocumented and the agent read the interpreter to learn it (contract); the free-text counter is
the agent's choice with no operator-ergonomics guidance in the skill (skill); the reveal and timer
frames could not be rendered by the CLI (CLI).

## What fails and why, ranked

Ranked by how much each holds back "premium broadcast graphics with minimal friction". Each names
the cause it comes from, so the plan can aim at it.

1. **The default look is ordinary.** Briefs 1 and 2 are generic dark plates in Inter; brief 3 is a
   stock composition; only brief 4, which started from a catalog design, looks premium. *Causes:*
   the skill (it deliberately teaches no design process, `references/design-notes.md` is off by
   default, and nothing asks the agent to state an intent, look at references or critique its
   frame); the scaffolds (neutral chassis set a plain ceiling; catalog designs are picked blind
   from ids); the fonts (one bundled face unless the agent digs one out of a catalog design); and
   the agent's own taste, which defaults to "dark plate + sans + thin accent" when nothing pushes it.
2. **The agent cannot see what it built where it matters.** No CLI render of a machine state
   (power play, intermission, reveal, timer), no background but transparent-on-white, so dark
   plates and cream cards are judged on the wrong ground and the two behaviour-heavy briefs spent
   most of their 20.5 and 13.5 minutes building private harnesses. *Cause:* the CLI. Both gaps
   were filed on 2026-09-20 (`docs/backlog/a-first-cli-session-as-good-as-working-in-the-repo.md`,
   items 1 and 3) and are still open in 0.7.0.
3. **The operator surface is shaped for setup, not for the show.** Live actions sit below every
   field; setup-only words and colours look like live inputs; a score has three controls; machine
   events have no hotkeys; a counter is free text. *Causes:* the control panel model (fields
   before actions, no setup/live split beyond `hidden`, no event shortcuts), and the skill
   (nothing teaches operator ergonomics: what is pressed live, what is set once and belongs in a
   `hidden` word source, counters as numbers). The contract is not the cause here: it has the
   `hidden` holder, the agent did not find its use.
4. **Type scaffolds that start the agent wrong.** The neutral scorebug paints its colour fields as
   hex text and shows two clocks (`evidence/neutral-scorebug-onair.png`); the quiz types assume a
   contestant; the lower-third type has no optional line. *Cause:* the type catalog and its
   neutral designs.
5. **The contract has no pattern for common behaviours.** An optional line that collapses, a
   second state group (a timer beside the main lifecycle), a graphic ending its own power play, an
   action that must stay enabled in every state: each agent read the interpreter or guessed.
   *Cause:* the contract (`references/contract.md` §5 has one worked group).
6. **The instruments disagree and nudge the taste.** The CLI validator accepts 24px secondary
   text that `docs/DESIGN_LANGUAGE.md` floors at 28px; the skill's 0.5-1.4 s entrance range cut a
   ceremonial build; a bench-stress error did not show in `stress.png`; a field-unpainted warning
   fires on the type's own clock. *Causes:* the validator and the skill's numbers drifting from
   the design language.
7. **Small CLI and skill frictions.** `noacg --help` exits 2; `scaffold --help` prints the global
   help; "zip the folder" does not say folder or contents and gives no Windows route; "the
   generated half was stale" after every edit reads as a fault; `doctor` reports the installed
   0.3.4 plugin beside the 0.7.0 CLI; defaults double as on-air samples with no guidance
   ("Host Name", "Oulu"). *Causes:* the CLI and the skill.

**What worked, so the plan keeps it.** The contract and validator produced four graphics that
played, updated, reacted to every declared button and replayed clean in the real studio. The
authored-machine road (brief 2's power play, brief 4's timer) works end to end. `noacg inspect`
showed every agent its buttons. The Import door took all four zips first time.

## Files

- `brief-N-*/cli/` the agent's own frames; `brief-N-*/NN-*-program.png` the studio's PROGRAM
  monitor after each step; `brief-N-*/NN-*-page.jpg` the whole Playout page at the states that
  show the control panel; `inspect.txt` the operator surface as `noacg inspect` prints it;
  `walk-log.txt` what the walk read off the panel.
- `evidence/neutral-scorebug-onair.png` the untouched `scaffold --type scorebug --design neutral`.
- `harness/` the briefs as typed, the `claude -p` run script that could not run here, the studio walk and its step files.
- `session-logs.md` what each agent reported about the skill, the CLI and the contract, condensed.

## The plan

The spec is `docs/work-specs/plugin-design-quality/spec.md` (a draft: decision D1, how much design
process goes into the default skill, is the owner's). The backlog items, one per cause:

| Failure | Cause | Backlog item | Spec |
|---|---|---|---|
| 1 ordinary look | skill | closed by the owner's D1 (the look stays the agent's; critique and guidelines are opt-in) | AC-1, AC-12, AC-13, D1 |
| 1 ordinary look | CLI, catalog | `catalog-designs-are-chosen-blind-by-id.md` | AC-2 |
| 1 fonts | CLI | `a-first-cli-session-as-good-as-working-in-the-repo.md` item 5 (open since 2026-09-20) | AC-3 |
| 2 cannot see states or video | CLI | the same file, items 1 and 3 | AC-4 |
| 3 operator surface | skill, control panel model | `operator-page-buries-live-actions-under-setup-fields.md` | AC-5, AC-6 |
| 4 scaffolds | type catalog | `neutral-scorebug-scaffold-paints-hex-and-two-clocks.md` | AC-2 |
| 5 behaviour patterns | contract | `contract-lacks-patterns-for-common-graphic-behaviours.md` | AC-7 |
| 6 instruments disagree | validator, skill | `validator-and-design-language-disagree-on-floors.md` | AC-8 |
| 7 small frictions | CLI, skill | `cli-frictions-from-the-four-brief-walk.md` | AC-9 |
| the loop itself | benchmark | `plugin-quality-benchmark-judged-from-frames.md` | AC-10 |
