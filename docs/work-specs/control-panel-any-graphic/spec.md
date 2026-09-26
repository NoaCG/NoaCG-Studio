# A control panel for any graphic - the ten rows for the first showing

## Problem and authority

A graphic should bring its own control panel whichever road made it, and a production should be
able to arrange and combine what its graphics expose without anyone hand-building a panel. The
plan is `docs/CONTROL_PANEL_ANY_GRAPHIC.md`; its §5 lists ten rows and this spec is their
acceptance inventory. The owner's rulings of 2026-09-15 are the authority, verbatim in
`docs/OWNER_RULINGS.md`: ALIGN-2026-09-14-3 (the voting-show proof case),
ALIGN-2026-09-15-1 (the brief and its constraints), ALIGN-2026-09-15-2 (build the profile, as a
general capability), ALIGN-2026-09-15-3 (portable graphics, NoaCG-owned production behaviour,
plus the two shared-data rows) and ALIGN-2026-09-15-4 (the rows start now). Programme P2 is
AUTHORIZED and P5 is authorized per item (`docs/PROGRAMMES.md`).

## Owner requirements

One control-panel approach for any graphic. The agent road may author a machine under the three
gates of 2026-08-27. The profile is two composable primitives, never an automation or programming
system, and the operator experience stays simple. A downloaded graphic carries nothing of the
production. A score entered once shows everywhere it is bound. The proof case is prompted in
Claude Code, saved with the CLI and driven from the playout dashboard within minutes.

## Derived decisions and preserved behaviour

The design decisions are the plan's (§2a the contract, §6b the primitives, §6d the delay, §6f the
boundary) and are not restated here. Preserved: no per-graphic panel code anywhere; a graphic
with no profile gets the panel it gets today, byte for byte; the catalog's control-panel specs
keep passing unchanged; an exported SPX folder, OGraf package and standalone `controlpanel.html`
carry no profile and no production path; the exported production controller renders the
generated panel and ARRANGE and never a sequencer; data never operates; the no-second-clock ruling
holds inside every graphic.

## Non-goals

No expression language, condition, variable, loop, wait-on-report or wall-clock scheduling in the
profile. No named-seat voting on `/join`. No `arrange` paint on the SVG road. No connector for a
particular election source. No CLI verb that makes or publishes a production. No change to the
OGraf manifest format.

### AC-1: The skill teaches the control contract and its three gates

`cli/skill/noacg-graphic/references/contract.md` carries the authored-machine section (§2a of the
plan: fields with kinds, a machine, controls metadata, calls into the graphic's own runtime,
reported fields, the default-path contract) with one worked machine and controls block, and the
loop in `SKILL.md` names the three gates as steps: validate with machine checks, inspect and show
the user the buttons, the bench walk. The sentence "authoring your own machine is a later
capability" is gone. Every generated copy follows from `cli/scripts/build-skill.mjs --check`.
Scenario: `noacg docs contract` prints the section; `cli/test/unit.test.mjs` pins that the
skill text names all three gates.

### AC-2: A from-scratch graphic with an authored machine passes the agent road end to end

The proof case's votes board (plan §3a: sixteen fields, one group `off`, `votes`, `revealed`,
`out`, a `reveal` control with `payload` and `set`, a call into the template's own JS, a reported
Shown field) is authored against the skill, `noacg validate` passes with no machine error,
`noacg inspect` prints the button with its section and payload words, and `noacg save` accepts it
(or, with no key, the zip imports through the Import door). Scenario: the row's own package,
saved under `e2e/fixtures/` or `benchmarks/`, driven by `cli/test/smoke.test.mjs` or an e2e spec.

### AC-3: The bench presses every declared operator event, or says which it did not

`src/validation/runtimeBench.ts` no longer silently stops at eight: a machine declaring more
operator events has every one dispatched, or `validate` reports the ones it skipped as a finding
the agent can read. Scenario: the proof case's totals board (eleven events) benched, the report
naming all eleven or naming the skipped ones.

### AC-4: The profile is a versioned, deletable part of the show, pinned at publish

`Show.profile` v1 (ARRANGE per pool graphic per control id; a list of COMBINE controls whose steps
carry only a target graphic, a declared event, verb or data patch, an optional `after` in seconds
and an optional `ask` with a default) parses, serializes canonically and validates; an unknown
version reads as read-only; deleting the profile is one action; `publishControlShow` pins it on
`control_shows` in its own column (one migration, minted by this row); older builds read past it.
Scenario: unit tests on the model beside `src/model/shows.ts`; a publish round trip in
`e2e/hosted-control.spec.ts` or `e2e/productions.spec.ts`.

### AC-5: ARRANGE renders on all three dashboard deployments and the generated panel returns on delete

Order, section, shown name, hidden and pinned apply to the ⚡ actions block (never to the cue
editor's field bands, which stay derived from titles under docs/PLAYOUT_DASHBOARD.md §2e) on
the in-app production page, the hosted control page and the exported production controller. A
hidden control is still guarded by the machine and a renamed one still greys by the same table.
The "Controls" panel on the production page authors it with drag order, hide, rename and pin.
Deleting the profile restores the generated panel byte for byte. Scenario: one case per
deployment in the existing specs (`e2e/production-controls.spec.ts`, `e2e/hosted-control.spec.ts`,
the exported controller case), plus the delete.

### AC-6: COMBINE sends one row per step, shows its wait, and reports a dropped step

A combined control composed on the production page sends one command-log row per step through
`control_send_many`, resolves each step when it fires, shows an `after` step counting down on
the button, cancels the unsent tail on Out or on a press of the countdown, offers an `ask` step
as a tick, and reports a step the machine dropped in the activity feed while the rest proceed. It
greys while its first step is illegal. It renders on the in-app and hosted pages; the exported
controller shows the one line the plan's §6f gives it. Scenario: the proof case's "Reveal
performer, then after 3 s the five +1s as ticks" read off the wire by a spec the way ± live
numbers is, on both pages; the cancel; the drop.

### AC-7: A stepper on a bound field patches the shared value

On the in-app and hosted pages, a `+1` (`adjust`) press or a ± press on a field bound to
production data writes the tree through the existing patch road, and every graphic bound to that
value follows; an unbound field keeps the field stepper unchanged; the exported controller, which
carries no tree, is unchanged. Scenario: two graphics bound to `panel.katri.points`, a `+1` on
one, both showing the new figure, read off the wire.

### AC-8: Bind all by title accepts every unambiguous suggestion in one press

One button on the Data tab's bindings table accepts every title-to-leaf suggestion the table
already computes for a graphic, and one for the whole production; an ambiguous title stays
unbound and says so. Scenario: two graphics with matching titles and one ambiguous field.

### AC-9: The proof case runs from prompt to dashboard, timed, with the profile in use

Both proof-case graphics made through the CLI against the shipped skill, saved or imported, put
in one production with the combined control composed in the room's minute, published, and the
operator's minute (plan §3c) driven from the hosted control page, each step timed and the numbers
in an owner-queue item with the route. What the walk finds is fixed if small or filed if not.

### AC-10: Nothing a downloaded graphic carries changed, and the generated panel is unchanged without a profile

The exporters' outputs for a graphic carry no profile and no production path; the catalog
control-panel specs pass unchanged; a production with no profile renders the same panel as before
these rows. Scenario: the existing export and control-panel specs green on the integrated tree,
and a byte comparison of the exported controller for a profile-less production before and after.
