# WYSIWYG editor — Era 6 plan (first slices)

> **STATUS 2026-09-01.** Attempt one is ANALYZED - see "Why attempt one did not land" at the
> end of this file. The verdict it answers: **"Tried once and it did not land"** (owner,
> 2026-08-22, `docs/GOALS.md` THEN 1 as written that day). A second attempt is programme
> **P7** (`docs/PROGRAMMES.md`), may depend on P2's behaviour-authoring findings, and is
> scheduled so build -> real use -> rejection/improvement -> retest completes **before
> August 2027**. Everything above the analysis section is the historical plan
> (status 2026-07-22): W1-W3 shipped and were extended well past this plan - canvas
> selection, keyframe drags, scale/rotate handles, placed-field editing. The canvas
> interaction contract today lives in `src/components/canvas/AGENTS.md`; the guardrails
> here (deterministic patches, no hidden scene model) are root non-negotiables. W4
> "element nudges" landed as keyframe/placement nudges rather than the offset-var design
> sketched below.

The goal: direct manipulation ON the preview canvas — drag to position, resize, edit text in
place — without ever betraying the core principle: **code is the single source of truth**.
Every canvas gesture writes the SAME deterministic patch a panel would write. There is no
scene model, no hidden transform layer, nothing the code editor can't show.

## Why this is cheap now (the foundations already exist)

- **Position** is already a code contract: the 9-zone anchor + `nudge {x,y}` written by
  `zoneDecls()` into the root rule; the Style panel re-anchors via the same patch
  (`model/cssVars.ts` + `zoneDecls`). A drag is just "compute nearest zone + residual nudge
  → apply the existing patch."
- **Size** is one knob: `--scale` in the `:root` contract.
- **Text** is sample data: the Data panel's values drive `update()` — inline editing writes
  `setSampleValue`, not code.
- **Selection** is the structure contract: every category has a known root
  (`.lower-third/.info-card/.ticker/…`) and known line elements (`#fN`).

## Slices (each independently shippable)

### W1 — Drag to position — ✅ SHIPPED, then REVISED (2026-07-08): no mode
Shipped first as a "Move" toggle; user feedback immediately showed the mode was unnecessary
(broadcast graphics take no pointer input, so nothing competes for the mouse). Now the
`CanvasInteraction` layer is ALWAYS on: hand cursor over the graphic, drag starts only ON the
root's rect and only past a 4px threshold (accidental-move protection replaces the mode), the
9-zone grid + ghost appear during the drag only. Release emits the zone+nudge patch (identical
to the Style panel's position control), highlighted + undoable; Esc cancels. Prerequisite that
made it work: the **settled design view** — after every rebuild the preview shows the graphic
settled (entrance jumped to its end with callbacks suppressed + a truth-restoring update(), so
clocks/loops stay idle), never a blank canvas.
- Guardrails unchanged: zone snap ALWAYS (freeform absolute positions stay out — wrapped-text
  growth and safe areas depend on anchoring).

### W2 — Resize (scale) handle — ✅ SHIPPED (2026-07-08), revised 2026-07-09
Hovering the graphic reveals a corner handle at the root's bottom-right (a small halo keeps
it reachable just outside the rect); dragging it live-previews `--scale` via an inline :root
override on the preview document (cleared on release/rebuild), with a ×N badge. The handle
tracks the graphic's real corner while it grows, and horizontal + vertical movement both
count (dragging along the box's diagonal tracks the pointer). Release = one undoable
`applyTemplate` writing `--scale` (the Style panel's size control, continuous), clamped
0.25–4 (a sanity bound, not a design limit), rounded to 2 decimals. The generated auto-fit
cap (`max-width` on the box) follows `--scale` via `min(calc(Npx * var(--scale)), safePx)`,
so resizing widens the box instead of wrapping the text at a fixed pixel width.

### W1+W2 follow-up — the editor follows the canvas (2026-07-09)
Every canvas gesture (drag, resize, inline text edit) commits as ONE undoable
`applyTemplate`, switches the code editor to the changed tab, and the changed lines get the
standard highlight + reveal. Tabs the last apply touched but that aren't showing carry a
change dot (CodeEditor), so a Style/Motion/AI patch in another tab is one click away.

### W3 — Edit text in place — ✅ SHIPPED (2026-07-08), stronger than planned
Double-click a visible `#fN` element (text cursor on hover) → an overlay input over it.
Commit writes BOTH the live sample value (like the Data panel) AND the field's default in the
SPX definition + the static markup text (`setFieldDefault` in blocks/edit.ts) — one undoable
template patch, so what you type is what every export ships. Hidden `#fN` source divs
(credits/tickers/timers/quiz) are excluded — their visible rows aren't fields.

### W4 — Element nudges (later, carefully)
Per-element offsets (e.g. move the accent bar) require a new, honest contract — e.g. emitted
`--offset-*` vars per element with comments — designed with the same rigor as the zone
contract. NOT in the first wave; a wrong move here creates the hidden-scene-model problem.

## Non-goals (deliberate)

- No free-form canvas: anchoring + auto-fit are what make the graphics broadcast-safe.
- No WYSIWYG-only state: if the code editor can't show it, we don't do it.
- No per-element drag in W1–W3: the root is the unit, exactly like the Style panel today.

## Verification

Each slice: an E2E spec driving the real pointer gestures (Playwright mouse) + asserting the
emitted code patch (zone decls / --scale / sample value), plus the standard build gate. The
preview iframe pointer plumbing (a transparent overlay ABOVE the iframe while editing) keeps
Monaco/GSAP quirks out of the tests — assert on code and DOM, not screenshots.

---

## Why attempt one did not land (2026-09-01)

The written account repo law requires before a second attempt (`docs/GOALS.md` THEN 1;
`docs/NORTH_STAR_2027.md` §5 P7). Written from the git history, `docs/GOALS_ARCHIVE.md` Era 6,
the owner's recorded verdicts, and `docs/EDITOR_RESEARCH.md`'s measured 2026-08-28 round.

### 1. What was built, and how far it got

Attempt one was not the modest W1-W4 plan above. It became a full direct-manipulation editor,
built at extraordinary speed:

- **2026-07-08** (one day): W1 drag-to-position (`3faa884b`), the settled design view, the
  no-mode rework, W2 scale handle, W3 inline text, T1 read-only timeline, T2 timing bars,
  T2.5 eases, T3.1/3.2 steps sequencing.
- **2026-07-09 to 07-10**: reveal groups, moment cards, the TemplatePart registry, canvas
  selection (`f0192594`), shared selection, appears-on-press from the canvas, independent
  layers, the converged motion surface, per-layer blur - roughly fifteen archive entries in
  three days, with three tester-feedback rounds folded in as they happened.
- **2026-07-11 to 07-13**: Timeline v2 (the declarative NOACG_ANIM engine, keyframes, presets
  as keyframe generators), the binding interaction model (`docs/TIMELINE_INTERACTION_MODEL.md`,
  adopted 2026-07-11), multi-selection and lasso (`b103a696`), canvas keyframe drags
  (`7e859e1f`, `dc11542a`), the pasteboard.
- **2026-07-17 to 07-23** (the import road): placed-field drags, Illustrator-style point and
  area text tools (`97c17ce8`), scale/rotate handles, part locks, the canvas context menu.

**All of it still ships.** Nothing was rolled back; the surface lives in Advanced mode, pinned
by a dozen specs (`e2e/wysiwyg.spec.ts`, `canvas-selection`, `canvas-keyframe`, `multi-select`,
`inline-edit`, `text-tools`, `anim-engine`, `timeline-v2`, ...). The contract is
`src/components/canvas/AGENTS.md`. What ended was not the code - it was the claim that this
surface is how a non-programmer creates.

How far it got, on `docs/EDITOR_RESEARCH.md`'s three-level ruler (2026-08-28, measured):
almost everything is **level 2 - authorable, never proven**. No real production was ever built
through the canvas or the timeline. The level-3 rows - wizard road, SVG import road, operating
from generated surfaces - all route AROUND the editor.

### 2. What the owner experienced and said

The verdict trail, verbatim:

- **2026-08-04** - the student-release pivot demotes the editor behind an Advanced toggle
  (`edff5e9f`, "Put the editor behind an Advanced toggle and make the wizard full-screen").
  Not yet a verdict on the editor - the ruling was about dependability for students - but the
  product's primary road stopped passing through the canvas 3.5 weeks after Era 6 began, and
  never passed through it again.
- **2026-08-22** - the roadmap rewrite (`3ff96422`) records the verdict on the THEN list:
  *"Tried once and it did not land"* (owner), "so a second attempt starts by saying what was
  wrong with the first rather than rebuilding it." The same rewrite names the core question -
  logic without code - and rules that neither the canvas editor nor the node editor landed as
  an answer to it.
- **2026-08-27** - the owner opens the editor and reports (handoff, removed from the tree;
  `git show 0eec5a83:docs/handoffs/2026-08-27-editor-stage-blank.md`): *"There is no graphic
  when I open it up... the problem is that I can't see any graphic at all."* The same phone
  Q&A: the symptom he remembers is Space not playing the timeline - *"I guess it's fixed"* if
  Space plays - and the editor is explicitly deprioritized, *"don't stress about it"*; he
  steers people away from the editor today and expects the whole timeline/canvas to be
  redesigned later (owner, 2026-08-27 phone Q&A).
- For contrast, **2026-08-25** - the same owner, walking the SVG import canvas: *"I like that
  it's only one canvas... It works great"* (`docs/GOALS_ARCHIVE.md`, the SVG-road walk). The
  criticism there was about the WORDS around the canvas, never the manipulation.

Also on the record: the July tester rounds inside the build itself - *"how do I add steps?"*
(T3.5), the T3.6/T5/T6.1 fix lists - each answered with more capability in the same week.

### 3. Root-cause hypotheses, ranked

Several are true at once; the ranking is by how much each explains.

**R1 - Built for a user who was not there yet (scope and timing).** A general editor was built
before any real user's task required one. The product's actual users - students, three weeks
later - were served by wizard + presets + playout, and the owner demoted the editor to reach
them. Nobody ever needed to open the canvas to get a graphic on air, so nobody did, so nothing
was proven. *Evidence:* the 2026-08-04 pivot; every level-3 row in `docs/EDITOR_RESEARCH.md`
routes around the editor; the owner steering people away. *Counter-evidence:* the owner still
wants the editor (P7's claim is a designer refining real artwork visually); "did not land" is
not "not wanted" - the demotion was a sequencing ruling as much as a product one.

**R2 - Basic reliability failed at the front door.** The owner's own sessions with the editor
died at hello: a stage with no graphic on his screen (still unreproduced anywhere else), Space
- the one play gesture every editor shares - silently swallowed over the stage, a finished run
never reported finished. His remembered verdict IS the Space key. First impressions were made
of defects, not of the interaction model. *Evidence:* the 2026-08-27 report; `docs/
EDITOR_RESEARCH.md` §1b defects 1-3; the Space and run-report fixes landed only 2026-08-29
(`docs/acceptance/owner-queue/2026-08-29-space-over-the-stage-plays.md`), the blank stage is
still open. *Counter-evidence:* "Tried once and it did not land" was ruled 2026-08-22, BEFORE
the blank-stage session - the defects deepened the verdict but did not create it.

**R3 - The interaction model asked for NLE literacy the audience does not have.** Playhead,
phases, parts, keyframes at a parked position, steps as clips - the model deliberately targets
"a user fluent in CapCut/AE/Figma" (`docs/TIMELINE_INTERACTION_MODEL.md`). Every tester round
in July surfaced vocabulary gaps ("how do I add steps?"), and each was answered by ADDING
surface (moment cards, drawers, per-layer everything) rather than by removing concepts. The
graph got the same verdict for the same reason ("it did not really work out" as a way a
non-programmer authors logic - `docs/EDITOR_RESEARCH.md` §1d). *Evidence:* three redesign
rounds in three days; the P2 framing that BOTH editor-shaped surfaces failed the same
audience. *Counter-evidence:* the mechanics pass every measured probe; a CapCut-fluent user
does recognize it; the failure has never been watched happen in a timed walk - it is inferred
from avoidance, not observed.

**R4 - Pointed at the wrong templates, it duplicated the panels.** On catalog templates - the
only graphics that existed in July - the canvas gestures write the SAME patches the Style
panel writes (by design: W1/W2/W3 above), and catalog typography is deliberately contract-only
(`docs/EDITOR_RESEARCH.md` §1b defect 6). So on the templates it launched with, the canvas
offered a second way to do what the wizard and panels already did, not a new capability. The
gestures that DID create new capability - placing fields on imported artwork - landed, but
only arrived with the import road weeks later. *Evidence:* the slice design itself;
the owner's acceptance landing exactly on the import half. *Counter-evidence:* "same patch as
the panel" is also the architecture's integrity guarantee, and inline text edit was genuinely
faster than the Data panel - duplication was the safe first slice, not a blunder.

**R5 - Code-as-truth made direct manipulation feel indirect.** Considered and NOT supported.
Every gesture commits as one undoable apply with live preview; `docs/EDITOR_RESEARCH.md` §1e
names "every gesture is a code diff" as a measured advantage no competitor has; no owner
statement complains of indirection or latency. The constraint shaped WHAT could be offered
(zone snap instead of freeform position - a broadcast-safety rule that predates the editor),
not how it felt. Kept here so attempt two does not relitigate the pillar on a hunch.

**R6 - The need it served was not real.** Partially subsumed by R1 and rejected in full form:
P7's claim (bring real artwork in, refine it visually, never need code) is owner-ratified, and
the accepted import canvas proves demand for visual manipulation. What was not real in July
was the need for a GENERAL editor as the product's center.

### 4. The contrast finding - why the import canvas and the text tools landed

The same owner, the same weeks, the same codebase - and one visual surface was accepted
outright while the other did not land. The differences are the finding:

| Landed (import canvas, area/point text) | Did not land (the general editor) |
|---|---|
| The user's OWN artwork on the stage | A generated template already finished by the wizard |
| One task with a visible end: get fields onto the art | No task - a destination ("Advanced mode") you go to |
| Gestures are design decisions (place, size, type) | Gestures write motion and time (keyframes at a playhead) |
| One canvas, no modes, no timeline required | Playhead + phases + steps + parts vocabulary required |
| Did something no panel could do | Mostly re-did what panels already did (R4) |
| Reached inside a flow the user was already in | Reached by opting into an editor identity |

The owner's words align exactly: *"only one canvas... It works great"* for the surface that is
one task on one canvas; *"don't stress about it"* for the surface that is a place. The implied
law for attempt two: **visual manipulation lands when it is the shortest path through a task
the user already has, on material the user already owns - not when it is a capability
exhibition.** A student with their own SVG accepts a canvas instantly; nobody has yet had a
task that needed the general editor.

### 5. What attempt two must do differently - testable requirements

1. **Reliability before capability.** The `docs/EDITOR_RESEARCH.md` §1b defect list is closed
   first: the blank stage is caught in the field or fixed, Space plays (shipped 2026-08-29 -
   verify it stayed true), a finished run reports finished, align/distribute exist. Test:
   every §1b defect has a closing commit or a field-diagnosis before any new attempt-two
   surface merges.
2. **Task-entered, not mode-entered.** Every new gesture is reachable from a task a user
   already has (import flow, wizard finish, "fix this graphic"), without opting into an
   editor identity first. Test: a timed walk reaches each gesture from `/app` home without
   the walker being told the words "Advanced mode".
3. **A first-time user finishes the four basics unaided.** Move a graphic, resize it, change
   its text, retime one thing - each under a minute, no manual, measured on 2-3 people who
   have never seen the editor (the student-walk instrument from
   `docs/STUDENT_RELEASE_ACCEPTANCE.md` reused). Test: the walk file in
   `docs/acceptance/owner-queue/` with times; a task that fails twice is redesigned, not
   re-explained.
4. **Concept budget, enforced.** Each shipped slice names the vocabulary it requires
   (playhead? phase? part? keyframe?) and drops any concept its task does not need. Test:
   the slice's doc lists its concepts; a reviewer can veto a slice for concept creep the way
   `check:client-neutral` vetoes vocabulary.
5. **Each gesture earns its place over the panels.** A new gesture ships only with a named
   capability that is impossible or materially slower through the wizard/Style/Inspector -
   R4's lesson. Test: the sentence exists in the slice doc; "same patch, nicer feel" is not
   sufficient.
6. **Behaviour stays out until P2 rules.** Whether ANY behaviour authoring appears on the
   canvas waits for P2's findings (`docs/BEHAVIOUR_AUTHORING_RESEARCH.md`, in progress -
   referenced, not waited on); attempt two does not pre-commit the canvas as the behaviour
   surface, and never builds a second model beside `NOACG_ANIM`.
7. **The calendar is law.** Build -> real use -> rejection/improvement -> retest completes
   before August 2027 (P7, owner-amended 2026-09-01), which means the first real-use walk is
   scheduled when the attempt STARTS, not when it feels ready.
8. **The pillars are not reopened.** Deterministic patches, no hidden scene model, zone
   anchoring for broadcast safety - R5 found no evidence against them, and attempt two does
   not spend its budget relitigating them.

### 6. What would falsify this analysis - cheap probes before committing

- **The reliability probe (tests R2 vs R3).** Close the §1b defects, change nothing else,
  and re-walk the EXISTING editor with the owner. If it then lands, the interaction model was
  fine and attempt two is a polish pass, not a redesign - R3 and R4 overweighted.
- **The literacy probe (tests R3).** Timed walk of the current editor with 2-3 students on
  the four basics of requirement 3. If they finish unaided, the concept-load hypothesis is
  false and the failure was R1/R2 alone.
- **The demand probe (tests R1/R6).** Instrument or observe Advanced-mode entry among real
  student-release users. Zero entries strengthens R1 (no task leads there); entries that
  bounce within a minute point at R2/R3 instead.
- **The verdict probe (costs one conversation).** The owner-queue item shipped with this
  analysis asks the owner directly whether this matches his memory of why it did not land.
  A "no" on the ranking reorders §3 before any attempt-two work starts.

If all three field probes come back against R1-R3, this analysis is wrong somewhere
structural, and the honest next step is another analysis - not attempt two.
