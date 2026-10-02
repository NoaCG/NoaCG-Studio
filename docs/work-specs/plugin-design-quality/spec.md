# Plugin design quality: NoaCG owns everything around the artwork, the look stays the agent's

## Problem and authority

A four-brief walk on 2026-10-02 (`docs/research/plugin-graphics-quality-2026-10-02/README.md`)
ran the plugin and CLI built from `main` against a local studio on four briefs nobody had seen.
All four graphics validated, imported, played and answered every button. Two of four looked
ordinary, one looked like a stock composition, and only the one that started from a catalog
design looked paid-for. The operator surface for the behaviour-heavy brief put the live buttons
below twelve inputs, three of them words set once per show. The agents could not render their
own machine states or see a frame over anything but white, and the two behaviour-heavy briefs
spent most of their time on private harnesses.

Authority: the owner's answer to decision D1, 2026-10-02, relayed in wave row 2026-10-02d-BL-1
(paraphrase): users hate imposed boundaries and frontier models design well, so by default the
agent designs freely; Codex currently overdoes things, so guard rails exist, but only on request.
GOALS outcome 2: a novel brief becomes a playable, OPERABLE package. The walk showed operability
and self-checking, not missing taste rules, as what NoaCG owns.

## Owner requirements

- **D1 (owner, 2026-10-02).** By default the agent designs freely: no house look and no taste
  rules in the default skill. NoaCG's job is everything around the artwork: the contract, the
  OGraf/HTML5 package, the fields and behaviour, and how the graphic works in the control panel.
- **Two opt-in tools.** A "critique and improve my graphic" taste check that the user or the
  agent can ask for, and a switch that makes the agent follow NoaCG's design guidelines, for users
  who want guard rails. Both are off by default.
- Premium broadcast graphics with minimal friction, usable by non-technical users, compatible
  with multiple playout environments (root taste rule).
- Installing the plugin does not noticeably cost an unrelated session context (owner,
  2026-09-02, `docs/AGENT_CLI.md` "What a session pays").

## Derived decisions

- **D2: fix the cause where it lives.** Each criterion names the layer that causes the failure:
  the skill, the CLI, the type catalog, the contract, the validator, or the control panel model.
  A control-panel change is its own row under `src/control`; this spec only states the observable
  result.
- **D3: no new instrument where an existing one can carry it.** The taste floors already run in
  `src/ai/spike/tasteCheck.ts`; the bench already dispatches authored events; the studio already
  separates `hidden` fields from operator inputs.
- **D4: where the line falls.** The agent's: composition, palette, typeface, silhouette, motion
  character and timing. NoaCG's: the contract, the package, which fields exist and how they
  behave (live or set once, hidden word sources, counters, defaults), the operator surface, and
  the instruments' measurements (safe area, size floor, contrast, transparency, frame rate),
  which report and never prescribe a look.
- **D5: the opt-in tools cost nothing until asked for.** Both live as references of the one
  existing skill, read only when switched on. The switches are words, so they work in Claude Code
  and in Codex alike: a request ("critique my graphic", "use NoaCG's design guidelines"), or the
  line `NoaCG design guidelines: on` in the user's own `CLAUDE.md` or `AGENTS.md`, which both hosts
  already load. Claude Code also takes them as `--critique <folder>` and `--guidelines` on the one
  existing `/noacg:graphic` command. No new skill, no new command, no CLI state. A separate
  user-only command was measured and rejected: `claude plugin details` counts its description as
  always-on even with `disable-model-invocation`.
- **D6: the critique judges the agent's own design, not the house look.** It asks questions
  against the brief and the paid-asset bar, drawn from the dimensions of `docs/DESIGN_LANGUAGE.md`
  §9 (taste, motion, auto-fit, operability), and never imports the guidelines. The guidelines are
  `references/design-notes.md`, which states the same floors as `docs/DESIGN_LANGUAGE.md`.

## Preserved behaviour

The contract gates (definition, fields, lifecycle, ES5, editability spine, bench) keep their
meaning and severity. A graphic stays a portable OGraf + SPX package with no profile and no house
dependency. A graphic with no `hidden` fields and no machine gets the panel it gets today. The
plugin still spends no tokens until a graphic is being made, and its always-on cost stays where
0.7.0 left it.

## Non-goals

No house look by default, and no design pass in the default loop. No automatic design scoring
that gates a save: taste stays a judgement, reported and shown. No new graphic types for these
four briefs. No change to the OGraf manifest format. No built-in AI generator, and no route that
bills an API.

### AC-1: The default skill leaves the look to the agent

`cli/skill/noacg-graphic/SKILL.md` and the contract's frame section name no palette, typeface,
size or motion duration, and the loop has no design-intent or critique step; the fixed list
stays (safe area, the validator's size floor and contrast, transparency, frame rate). Pinned by
`cli/test/unit.test.mjs`. Scenario: a fresh session given a brief with neither tool switched on
opens neither opt-in reference and reports no house rule it followed.

### AC-2: The agent can see catalog designs, and neutral scaffolds render correctly

An agent that chooses to start from a catalog design picks it by its frame: a command shows a
type's catalog designs as one contact-sheet image with their ids. Every `--design neutral`
scaffold renders its own default data without painting a colour value as text or a second
clock; the scorebug case in
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

### AC-5: The default skill teaches fields and behaviour

`SKILL.md` says, with one example each: what an operator changes during the show versus sets
once; that set-once words go in `hidden` word sources so the operator page stays live-only; that
a counter the operator steps through is a number; that a default is a safe sample or empty,
never a placeholder that can air ("Host Name"); and where the worked patterns are (AC-7). Pinned
by `cli/test/unit.test.mjs`. Scenario: a fresh quiz brief yields round and question numbers as
`number` fields and its set-once words as hidden sources.

### AC-6: The operator page leads with the live controls

In the studio's Playout page, a graphic that declares operator events shows them above its setup
fields, and a 1600x900 window shows the clock and goal buttons of the brief-2 scorebug without
scrolling. Events can carry a keyboard shortcut the panel shows. Scenario: the studio walk in
`docs/research/plugin-graphics-quality-2026-10-02/harness/` re-run on the brief-2 zip. This is a
`src/control` row of its own.

### AC-7: The contract has worked patterns for the common behaviours

`references/contract.md` §5e carries one short worked pattern each for: an optional line that
collapses when its field is empty; a state's word painted from a hidden source; a second state
group beside the main lifecycle (a timer); a graphic that ends its own timed state; an action
that stays available in every state. Each pattern is a fixture that validates clean and is
pinned by a test.

### AC-8: The instruments agree with the design language

The opt-in guidelines (`references/design-notes.md`) state `docs/DESIGN_LANGUAGE.md`'s floors
and say which brief kinds their motion range fits; the default contract states no motion range.
The CLI validator's secondary-text guidance states the same floor as `docs/DESIGN_LANGUAGE.md` or
says why it differs; a bench-stress error is visible in the stress frame it reports;
`bench-field-unpainted` no longer fires on a type's own clock field.

### AC-9: The small frictions are gone

`noacg --help` exits 0; every verb prints its own `--help`; the skill gives one copy-paste way to
produce the importable zip on Windows, macOS and Linux; the "generated half was stale" note reads
as information; `scaffold --fields` accepts a `hidden` kind.

### AC-10: The benchmark, judged from frames

The four briefs of 2026-10-02 plus two new ones (a ticker, a full-frame result board) are re-run
by fresh sessions (a terminal `claude -p` with the plugin when this machine is logged in;
otherwise the subagent method the research documents) in three arms: default, critique asked
for, guidelines on. A reviewer who did not build them judges each from its frames and its studio
panel against a written rubric: would it air on a paid channel; does the live operator reach
every live action without scrolling or typing a label; did the opt-in arm change what it claims
to. The receipt records frames, panel shots and the verdict per brief and arm.

### AC-11: `noacg inspect` shows the operator's view

`noacg inspect` groups its output into LIVE (buttons and the fields changed during the show) and
SETUP, so the agent reads the operator page the way the operator meets it. Scenario: the brief-2
package prints the clock and goal buttons under LIVE and no word fields.

### AC-12: The critique is there on request, and only then

`references/critique.md` renders the graphic, judges it against the brief and the paid-asset
bar, makes at least one change that matters and shows the before and after frames. It is on
when the user asks in words or passes `--critique` to `/noacg:graphic`, and the agent may offer
it in one sentence; otherwise the loop never opens it. Works in Claude Code and in Codex; the
plugin's always-on cost does not grow. Scenario: a fresh run asked to critique an existing
package changes it and reports why; a fresh run not asked does not open the file.

### AC-13: NoaCG's design guidelines are a switch, off by default

`references/design-notes.md` is followed when the user asks for NoaCG's design guidelines, passes
`--guidelines` to `/noacg:graphic`, or their project instructions carry
`NoaCG design guidelines: on`; otherwise it stays closed. Works in Claude Code and in Codex; the
plugin's always-on cost does not grow. Scenario: a fresh brief with the switch on cites the
guidelines for its sizes and motion; the same switch read from an `AGENTS.md` turns it on in
Codex; with no switch, neither host opens the file.
