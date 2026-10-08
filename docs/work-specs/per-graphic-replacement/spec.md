# Per-graphic replacement

Status: agreed with the owner on 2026-10-08 (G1-G3). Not built yet.
Parent: `docs/work-specs/playout-workflow-simplification/spec.md` (owner decisions 3 and 13,
non-goal 1). Design source: `docs/PLAYOUT_ISOLATION_RESEARCH.md` §10.2-10.5. It replaces Step 3's
whole-output reload (`docs/work-specs/playout-ready/spec.md` R3) for graphics that are off air.

## Why

An output adopts a newer published version only by reloading, and only when nothing is on air there
(`src/output/prepare.ts`). A corner bug or a scoreboard stays up for the whole show, so one
persistent graphic holds every other graphic's fix back: the renderer row reads "Waiting for clear"
until the end of the show, and the only way out is to take the bug off air. Owner decision 13 says
that must never happen. Decision 3 also waits on this: automatic following of edits comes only
after per-graphic replacement.

## Goal

Publishing is safe during a broadcast, live controls stay responsive, and operators never manage
graphic versions by hand (owner, 2026-10-08). After Publish changes, each output swaps every
changed graphic that is off air there, in place, without a reload and without touching any other
graphic. A changed graphic that is on air keeps its picture until it is cleared or replaced, then
swaps. A compact status names what still waits, and only while something does.

## Non-goals

- The research's full manifest and content-addressed storage (§10.2). This works on today's
  payload, whose per-graphic digests (`src/control/payloadVersion.ts`) already say what changed.
- Changing a graphic mid-air, and carrying on-air state into a new body (§10.3 step 6).
- Booting from a cached copy, outage survival, the local runtime (offline-operation spec).
- Automatic following of edits (decision 3: it comes after this, as its own change).
- Exported packages (SPX, CasparCG template folders, OGraf): they have no live payload.

## Key decisions

Owner decisions inherited: 3, 6 and 13 of the parent spec.

Owner decisions (2026-10-08, binding):

- **G1. An on-air graphic is never changed by a publish.** It keeps its current version until it
  is cleared or replaced, then the published version is used: after its Out, All out or a
  Stop/Clear, and on a Take that replaces it (another cue on the same graphic, or a Re-take),
  without a separate Out first. There is no Apply button.
  - A version is the graphic itself: design, layout, animation, its fields and states. Live
    content (field values, scores, quiz states, Update, the production's data) keeps reaching the
    on-air graphic at once, as today.
  - Browser outputs and the renderer loaded on a CasparCG slot behave the same.
  - The waiting status is compact and shows only while a graphic waits.
- **G2. Each output swaps on its own**, as soon as its new version is ready, with no new command
  type and no protocol change. A Take that reaches an output still loading that graphic plays the
  version it has, and that output's row says so; nothing waits for the slowest output.

- **G3. Live values stay reliable across a field change.** No versioned control panels and no new
  UI. Fields the on-air version and the published version share keep updating on air at once; a
  field only the new version has appears once the graphic is taken after its swap. Renaming a
  field keeps its identity, and removing one never breaks the on-air graphic's live controls.
  Scores and quiz controls are the priority.
  - Today a rename keeps the field id (`src/blocks/edit.ts` `setFieldTitle`), new ids never reuse
    a number (`nextFieldId`), and the shared runtime's Update writes only the keys it is sent
    (`src/templates/shared/base.ts`), so a removed field keeps its on-air value. To verify per
    category: the templates with their own `update()` (tickers, end credits, quiz and others under
    `src/templates/*/shared.ts`) and foreign OGraf graphics, whose `updateAction` is their own.

Derived (revertible):

- **D1. Same checks as today.** A new frame is prepared hidden and passes READY's checks (load,
  fonts, script error) before it replaces the old one. A failed one keeps the old frame and the
  row names it: "Change failed: <graphic>" (parent D5).
- **D2. A swap never reloads the page.** A change of resolution or renderer build still reloads,
  through today's path, only when nothing is on air.
- **D4. Additions and removals follow the same rule.** A graphic added mid-show becomes takeable
  on each output once its frame is ready; a removed one leaves once it is off air. Revert: reload
  for additions and removals as today.
- **D3. The output's version is per graphic.** Presence reports the published version once every
  graphic holds it, else the graphics still waiting: "Waiting for clear: Scorebug (v12)".

## Behaviour

### AC-1: An off-air change swaps without touching what is on air
With a scorebug on air, Publish changes for a lower third swaps the lower third on every connected
output within the preparation time; the scorebug's frame, its data and its machine state are
unchanged, and the next Take of the lower third shows the new body.

### AC-2: An on-air change waits until it is cleared or replaced
A changed graphic that is on air keeps its picture, and its live controls (Update, field values,
states, bound data) keep working on it. After its Out, All out or a Stop/Clear, it swaps, and the
next Take shows the new body. A Take that replaces it (another cue on that graphic, or a Re-take)
airs the new body: the old frame clears and the new one enters. Until then, and only then, the
renderer row reads "Waiting for clear: <graphic>".

### AC-3: Live values survive a field change on an on-air graphic
With a scoreboard and a quiz on air, publish versions that rename one field, add one and remove
one. Update, the score steppers, bound data and quiz state changes keep working on air for every
shared field; the removed field keeps its on-air value; the renamed field keeps updating; the new
field appears after the swap. Checked for every graphic category with its own `update()`.

### AC-4: A failed change keeps the old frame
A change whose new frame fails to load or throws keeps the previous frame takeable, and the row
says "Change failed: <graphic>". Other changes in the same publish still swap.

### AC-5: Nothing reloads for a graphic change
No output reloads for a publish that changes, adds or removes graphics. Program never shows a
blank frame, an error card or a replayed entrance because of a swap.

### AC-6: The same on a CasparCG slot
The renderer loaded on a CasparCG slot (CasparCG 2.3 and 2.5) swaps, waits and reports exactly as a
browser output does.

### AC-7: Old outputs and old pages keep working
An output built before this change keeps today's behaviour (whole reload when clear). A page
built before it still publishes and drives the new outputs.

## Preserved behaviour

Take, Out, Next, Update and All out; the command path and its protocol; data and cue values
riding the commands; READY's checks and its line; the CasparCG slot's Load/Unload.

## Verification

- Node tests: which graphics swap now and which wait, given the held and next digests and what
  is on air.
- Offline e2e with a local output page: publish a change with another graphic on air and assert
  the frame identity, the data and the machine state of the on-air graphic are untouched, and the
  changed one swaps; the on-air case swaps after Out; a failing change keeps the old frame.
- Configured e2e on a local stack: two outputs, the same publish, both swap.
- `/check`, then `/queue-merge`.
