# Plugin design quality: the plugin helps make graphics better, not only put them into NoaCG

## Problem and authority

A four-brief walk on 2026-10-02 (`docs/research/plugin-graphics-quality-2026-10-02/README.md`)
ran the plugin and CLI built from `main` against a local studio on four briefs nobody had seen.
All four graphics validated, imported, played and answered every button. Two of four looked
ordinary, one looked like a stock composition, and only the one that started from a catalog
design looked paid-for. The operator surface for the behaviour-heavy brief put the live buttons
below twelve inputs. The agents could not render their own machine states or see a frame
over anything but white, and the two behaviour-heavy briefs spent most of their time on private
harnesses.

Authority: GOALS outcome 2 (the agent door: a novel brief becomes a playable, OPERABLE package)
and the product rule "premium broadcast graphics with minimal friction, usable by non-technical
users". This record is a **draft**: it was written by the wave row that measured the problem, and
decision D1 below is a taste and direction call that needs the owner before implementation.

## Owner requirements

- Premium broadcast graphics with minimal friction, usable by non-technical users, compatible
  with multiple playout environments (root taste rule).
- The agent door delivers a package from a brief nobody has seen, with valid fields and behaviour
  (GOALS outcome 2, "done for this phase").
- `docs/DESIGN_LANGUAGE.md`: the bar is a paid MotionArray / Envato Elements asset; sameness is a
  defect, not a house style.

## Derived decisions

- **D1 (needs the owner): a design PROCESS in the default skill, the house LOOK still optional.**
  `docs/AGENT_CLI.md` keeps taste rules, motion doctrine and composition guidance out of the
  default skill, in `references/design-notes.md`, "to be tested as its own arm". The walk shows
  the cost of having nothing: the agents' own defaults are generic. The recommended line is
  process, not doctrine: the default skill asks the agent to state a design intent, look at
  references, render the frame where it will air and critique it against the paid-asset bar, and
  it names no palette, font or silhouette. `design-notes.md` stays optional, and AC-10 runs it as
  the arm the WHY promised. An active design skill still owns the look.
- **D2: fix the cause where it lives.** Each criterion names the layer that causes the failure:
  the skill, the CLI, the type catalog, the contract, the validator, or the control panel model.
  A control-panel change is its own row under `src/control` and its own owner; this spec only
  states the observable result.
- **D3: no new instrument where an existing one can carry it.** The taste floors already run in
  `src/ai/spike/tasteCheck.ts`; the bench already dispatches authored events; the studio already
  separates `hidden` fields from operator inputs. The work exposes these to the agent before it
  builds anything new.

## Preserved behaviour

The contract gates (definition, fields, lifecycle, ES5, editability spine, bench) keep their
meaning and severity. A graphic stays a portable OGraf + SPX package with no profile and no house
dependency. A graphic with no `hidden` fields and no machine gets the panel it gets today. The
plugin still spends no tokens until a graphic is being made.

## Non-goals

No house look imposed by default. No new graphic types for these four briefs. No change to the
OGraf manifest format. No built-in AI generator, and no route that bills an API. No automatic
design scoring that gates a save: taste stays a judgement, reported and shown.

### AC-1: The skill runs a design pass before building and a critique after

`cli/skill/noacg-graphic/SKILL.md` adds two steps to the loop, pinned by
`cli/test/unit.test.mjs`: before the first edit the agent writes a short design intent for this
brief (audience and screen, tone, two or three reference genres, palette, type pairing,
silhouette, motion character) and shows it to the user; after a clean validate it critiques the
rendered frames against a short checklist drawn from `docs/DESIGN_LANGUAGE.md` §9 (taste, motion,
auto-fit, operability) and names at least one change it made because of the critique.
Scenario: a fresh session on a new brief replies with the intent, the frames and the change.

### AC-2: The agent picks its starting point by looking, and neutral scaffolds render correctly

A command shows a type's catalog designs as one contact-sheet image with their ids, so the agent
chooses a design by its frame rather than by id. Every `--design neutral` scaffold renders its
own default data without painting a colour value as text or a second clock; the scorebug case in
`docs/research/plugin-graphics-quality-2026-10-02/evidence/neutral-scorebug-onair.png` is pinned
by a test. Scenario: `noacg scaffold --type scorebug --design neutral` then `noacg screenshot`
shows one clock and no hex text.

### AC-3: Fonts are reachable without probing the catalog

The agent can list the bundled faces with a one-line character each and put one in its package
with its `@font-face` and licence line written, in one command. Scenario: the gala brief reaches
a serif in one call, not sixteen scaffolds. (Shape already argued in
`docs/backlog/a-first-cli-session-as-good-as-working-in-the-repo.md` item 5.)

### AC-4: The agent sees every state on the ground it airs on

`noacg screenshot` renders after a sequence of operator events and over a chosen background (a
video-like plate as well as transparent), and `validate --screenshots` writes one frame per state
the bench reached. Scenario: the hockey power-play, intermission and final frames, and the quiz
reveal and timer frames, come from the CLI with no private harness. (Items 1 and 3 of the
2026-09-20 backlog file.)

### AC-5: The skill teaches operator fit, and inspect shows it

The skill says, with one example each: what an operator presses live versus sets once; that
set-once words and labels go in `hidden` word sources so the operator page stays live-only; that
a counter the operator steps through is a number; that a default is either a safe sample or
empty, never a placeholder that can air ("Host Name"). `noacg inspect` groups its output into
LIVE (buttons and live fields) and SETUP. Scenario: re-running the hockey brief yields an operator
page whose live block holds the clock and goal buttons and no word fields.

### AC-6: The operator page leads with the live controls

In the studio's Playout page, a graphic that declares operator events shows them above its setup
fields, and a 1600x900 window shows the clock and goal buttons of the brief-2 scorebug without
scrolling. Events can carry a keyboard shortcut the panel shows. Scenario: the studio walk in
`docs/research/plugin-graphics-quality-2026-10-02/harness/` re-run on the brief-2 zip. This is a
`src/control` row of its own.

### AC-7: The contract has worked patterns for the common behaviours

`references/contract.md` carries one short worked pattern each for: an optional line that
collapses when its field is empty; a second state group beside the main lifecycle (a timer); a
graphic that ends its own timed state; an action that stays available in every state. Each
pattern is a fixture that validates clean and is pinned by a test.

### AC-8: The instruments agree with the design language

The CLI validator's secondary-text guidance, the skill's motion numbers and
`docs/DESIGN_LANGUAGE.md` state the same floors and ranges or say why they differ; a bench-stress
error is visible in the stress frame it reports; `bench-field-unpainted` no longer fires on a type's
own clock field.

### AC-9: The small frictions are gone

`noacg --help` exits 0; every verb prints its own `--help`; the skill gives one copy-paste way to
produce the importable zip on Windows, macOS and Linux (or a CLI verb does it); the "generated
half was stale" note reads as information.

### AC-10: The benchmark, judged from frames

The four briefs of 2026-10-02 plus two new ones are re-run by fresh sessions (a terminal
`claude -p` with the plugin when this machine is logged in; otherwise the subagent method the
research documents), twice: default skill, and with `design-notes.md` on. A reviewer who did not
build them judges each from its frames and its studio panel against a written rubric: would it
air on a paid channel; does the live operator reach every live action without scrolling or
typing a label. Target: at least four of six judged premium on the default arm, and every
operator surface passing. The receipt records frames, panel shots and the verdict per brief.
