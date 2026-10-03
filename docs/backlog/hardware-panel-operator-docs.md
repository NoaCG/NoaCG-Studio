# An operator docs section for hardware panels (Companion and Stream Deck)

**Filed:** 2026-10-03. **Source:** the hardware panel build's handoff (item 2 of
`docs/handoffs/2026-10-02-hardware-panel-control.md`, deleted 2026-10-03 once each item had a
home) and AC-11 of [`docs/work-specs/hardware-panel-control/spec.md`](../work-specs/hardware-panel-control/spec.md).

## Why

AC-11 asks for a short operator page in the app's docs that walks pairing and a first Take key in
plain words, beside the module's own `HELP.md`. Without it a non-technical operator has nothing in
NoaCG that says the panel exists, where the Panel door is, or what "Answer the panel on this page"
does. It is the one acceptance criterion of the build with nothing in the tree yet.

## What it would take

- A section in `docs.html` after `#dashboard`, with a nav entry under "Run the show": add the NoaCG
  connection in Companion, type the code the Panel door shows, switch "Answer the panel on this
  page" on, drag a preset. Both operator pages have the door (the production page since #650, the
  hosted control page since #632).
- **Wait until a reader can install the module.** Today it is neither in Companion's module list
  nor published as a package; a Companion 4.3+ user can only import the `.tgz` that `yarn package`
  makes in `companion-module/`. The Bitfocus submission is the owner's step,
  `docs/acceptance/owner-queue/2026-10-02-companion-module-to-bitfocus.md`. Writing the page before
  then documents an install nobody can do.
- Everything on the page must have been run, in an isolated Companion as
  `docs/work-specs/hardware-panel-control/evidence/companion-end-to-end.md` describes, never the
  owner's own Companion or deck. AC-11 also wants that walk timed and recorded, which the
  2026-10-02 run could not do (below).

Facts from the 2026-10-02 runs worth not relearning:

- Companion 5's admin UI cannot be driven reliably from the hidden browser pane (screenshots time
  out, the layout collapses). Element references and `form_input` work; a drag worked once with a
  1400x900 emulated viewport. Its HTTP API runs a key exactly as a deck does
  (`POST /api/location/<page>/<row>/<column>/press`), and
  `GET /api/variable/<label>/<name>/value` reads the module's variables. A timed walk of the setup
  therefore wants a visible browser, or an operator.
- A preview branch of production comes from `POST /v1/projects/kprolrchuldgfrzspthy/branches` with
  the management token; the branch ref named in `docs/HARDWARE_CONTROL_RESEARCH.md`
  (`qxaeqgjcnjhcvmahcjlm`) was deleted and cannot be reused.

## Evidence

- `docs/work-specs/hardware-panel-control/evidence/companion-end-to-end.md`: the operator's steps as
  run, and why the elapsed time was not reported.
- The convergence review of 2026-10-03 in `docs/work-specs/hardware-panel-control/work.json` marks
  AC-11 as failed for this page.
