# Usable basic artwork editing

Implementation brief, 2026-09-26. Branch `codex/editor-artwork-basics`, based on
`19518e21`. PR #335 merged September 20 as `2eb1942f`; its earlier `8bcde771`
is an ancestor of this baseline. The previous owner-queue item was closed on
September 26 and its feedback retained in the R1.1a receipt, not lost.

## Goal and sequence

Make an imported or catalog graphic customizable through the Alpha editor.
The owner authorized pulling basic R1.2b tools ahead of R1.1b: text content,
font/size/solid colour, layer order/duplicate/delete, marquee and multi-object
movement. Match the current NoaCG logo, typography and theme tokens.
Basic opacity also belongs to the retained static-authoring checkpoint.
The September 27 review adds the bounded usability corrections below before resuming
R1.1b, R1.1c and R1.1d; remaining R1.2b tools stay in R1.2b.

## Boundaries and decisions

Keep SpxTemplate canonical, with pure source writers behind the shared operation
registry. Use existing field, CSS and bundled-font writers. Text edits change
artwork/defaults, not operator sample overrides. Preserve existing identifiers,
unrelated source, assets and motion. Reference-sensitive structural edits must
either preserve references or refuse atomically with an actionable explanation.
One completed edit or group drag is one undo transaction. Escape and stale
revisions discard draft edits. Reorder only within the existing parent.

No keyframe authoring, Out changes, grouping, advanced typography, Pen, image
tools, project system or default-editor switch. Direct production, Alpha entry
and phone viewing remain supported. Owner acceptance is still open.

## Observable acceptance

- Catalog and Illustrator SVG: double-click text and edit it in Properties;
  change font, size and text colour, a solid shape fill and static opacity.
- Add shapes; duplicate/delete and reorder supported layers within their parent;
  retain fields and existing motion, with clear atomic refusals for unsafe sources.
- Ctrl/Shift select, marquee select, and move multiple objects together; nested
  parent transforms do not distort the shared canvas displacement.
- Cancel changes without source mutation; undo/redo each operation as one step;
  save/reopen and relevant exports reproduce the result.
- Inspect desktop, laptop, equivalent 125% viewport and phone rendering. Use the
  shared BrandLogo and theme tokens; canvas and inspector remain usable.
- Measure multi-object drag using correlated preview acknowledgements and record
  results against B11. Map browser tests for B01/B02/B03/B04/B11/B13 preservation.

## Evidence

Implementation phase `8e7bcad4` passed the 41 focused editor tests (`j-1965`) and
`npm run build` (`j-1966`, exit 0). The build ran 1,894 infrastructure tests:
1,892 passed, two skipped, none failed. The completed source, including opacity
and the drag optimization, is committed through `e72208a0`. It passed a fresh
42-test editor run (`j-1993`, 3.4 minutes), a fresh build (`j-1994`, exit 0,
the same 1,894 infrastructure tests) and the production matrix below.

The reported missing text editor was reproduced before implementation (`j-1953`).
Fresh-server verification matters: editing source during an earlier browser run
caused stale Vite module instances; its mixed results were discarded. `j-1965`
ran against frozen application source and passed all 41 checks.

Inline review found and fixed three concrete problems: copied CSS rules could
change unrelated siblings through cascade order; deleting a layer left ID rules
that could style a later reused ID; clicking a member of a multi-selection did
not collapse it when no drag occurred. The regression tests cover these cases.
Source-range validation, reference checks and revision-bound drafts preserve the
existing document instead of guessing at unsupported edits.

Simplification was inline: content and colour use the shared `FieldControl`,
appearance uses the existing font/CSS writers, and both text entry points share
one transaction component. No scene model or second history store was added.

The first production multi-object matrix (`j-1991`) passed catalog and SVG but
failed the F4 stress fixture at 1920: 26.10 feedback updates/s against the 30 Hz
floor, with 57.90 ms p95 and 71.40 ms release-to-commit. It is not counted as a
passing latency receipt. Repeated source inspection in the drag path was reduced
with a weak cache of base measurements, invalidated by HTML/CSS/JS/field source
replacement. Commit validation and revision checks remain unchanged. The final
measurements below passed the original thresholds.

The broader affected run (`node scripts/e2e-affected.mjs 19518e21 --focus`,
`j-1967`) finished with 600 passed, 321 intentionally skipped and two failures;
its separate catalog gate passed all 35 checks. The failures were a seven-second
wizard-opening timeout in `bridge-connect.spec.ts:471` and a 683 ms preview blank
interval against a 400 ms limit in `wizard-preview.spec.ts:518`. Both passed in
the isolated one-worker rerun (`j-1978`); its measured blank intervals were 84 ms
forward and 0 ms back. This is a passed focused rerun, not a clean broad-run claim.
No code in those routes was changed. The catalog emitter separately passed for
all 528 designs. Configured services and the entire non-focus suite were not run.

Basic opacity was reproduced as missing (`j-1977`). Its first implementation
exposed an unlabelled numeric input in the shared number control (`j-1983`),
which was fixed by using the descriptor's label. Opacity edits use one style
transaction and refuse existing opacity animation; the eight shared-control
journeys passed after that accessibility correction (`j-1987`).

The opacity-phase focused verification (`j-1986`) passed all 42 editor tests in 3.3 minutes,
including opacity, both real Finish doors, nested SVG parent mapping, atomic
history, stale revisions, saved results and executable SPX/CasparCG/OGraf exports.
The command selected `editor-base-edits.spec.ts`, `editor-foundation.spec.ts` and
`editor-alpha-entry.spec.ts` with one worker. Its extra `field-control.spec.ts`
argument matched no file; actual shared-control coverage is the eight passing
tests in `control-panel-types.spec.ts` (`j-1987`).

## Production measurements and rendered walkthrough

`node scripts/editor-foundation-bench.mjs --measure --artwork` passed as `j-1995`.
[The raw receipt](latency-built.json) includes every sample, source hashes,
fixture hashes and machine details. Every recorded source hash was checked
against the final source and matched. The build stamp is `2026-09-26T21:46:42.860Z`;
its commit field is the pre-optimization commit `10ce3287`, because the cache was
uncommitted when built. The source hashes identify the tested implementation.

Each case selects two objects and drives 90 actual pointer moves. Timing runs
from the input handler to a matching rendered-geometry acknowledgement, including
postMessage, not physical display photon timing. Windows, Ryzen 7 5800H, 16 GB RAM,
Chromium 149. The 125% case uses the equivalent 1093x614 CSS viewport with 1.25
device scale. Thresholds were unchanged: at least 30 feedback updates/s, no gap
over 100 ms, release-to-commit at most 150 ms, frame p95 at most 33.3 ms and no
100 ms freeze. Every drag undid as one source transaction.

| Fixture | Width | Drag p95, ms | Feedback, Hz | Release-to-commit, ms |
|---|---:|---:|---:|---:|
| Catalog | 1920 | 22.2 | 58.0 | 46.8 |
| Catalog | 1366 | 23.0 | 58.0 | 46.0 |
| Catalog | 1093 | 23.1 | 58.0 | 47.1 |
| SVG | 1920 | 21.6 | 58.0 | 43.1 |
| SVG | 1366 | 22.1 | 57.2 | 42.7 |
| SVG | 1093 | 22.8 | 57.2 | 44.9 |
| F4, 30 layers/300 keys | 1920 | 26.9 | 56.6 | 46.9 |
| F4, 30 layers/300 keys | 1366 | 31.7 | 56.6 | 45.9 |
| F4, 30 layers/300 keys | 1093 | 29.9 | 54.9 | 45.0 |

All final frames below were opened and inspected. The shared BrandLogo and theme
tokens match the surrounding NoaCG application. Stage, inspector and timeline
remain available; the inspector scrolls locally. Fit shows the whole composition,
so use canvas zoom for small text at laptop/125% sizes. Phone evidence proves the
viewing layout at 390x844, not touch editing or a physical device.

| View | Desktop | Laptop | 125% |
|---|---|---|---|
| Catalog selection | [1920](catalog-built-1920.png) | [1366](catalog-built-1366.png) | [1093](catalog-built-1093.png) |
| Added and styled artwork | [1920](tools-built-1920.png) | [1366](tools-built-1366.png) | [1093](tools-built-1093.png) |
| Imported SVG | [1920](svg-built-1920.png) | [1366](svg-built-1366.png) | [1093](svg-built-1093.png) |
| Stress fixture | [1920](f4-built-1920.png) | [1366](f4-built-1366.png) | [1093](f4-built-1093.png) |

[Phone](phone-built.png), [Finish entry](wizard-finish-built.png), and the
[short owner walkthrough](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/owner-queue/2026-09-27-editor-artwork-basics.md).
Engineering verification is complete for this bounded artwork task. It is ready
for the owner's basic-customization workflow review; owner acceptance is open.
These are local production-build receipts, not a claim that this branch has deployed.

## Graphic taste review

`j-1990` rendered Hairline (`lt01`) with the existing taste-frame runner. Both
[hold](taste/lt01/hold.png) and [long text](taste/lt01/long.png) were opened and
inspected. The earlier `--affected` job depended on the red broad run and never
started; this explicit fixture run replaces it. No catalog design or emitter was
changed, so additional full-catalog visual sweeps were not used as editor proof.

| Question | Answer and observation |
|---|---|
| Hierarchy | YES: the name is largest and brightest; the role is visibly secondary. |
| Composition | YES: both lines share a left edge, with a consistent gap from the rule. |
| Restraint | YES: one amber accent, one type family and no extra decoration. |
| Coherence | YES: weight, rule and neutral colours form one composition. |
| On-air quality | YES for this reference frame on the prescribed grey bed; real footage and receiving-host acceptance remain unverified. |
| T1 Centred | YES for intended alignment: this is deliberately left-aligned; no centred plate is implied. |
| T2 Inside | YES: long copy is fully visible, with no clipped glyphs or overlap. |
| T3 Aligned to graphic | YES: text aligns with the shared accent and its padding. |
| T4 Grows as implied | YES: longer lines extend right while the left anchor and line spacing remain stable. |

## Remaining boundaries

Editable wording is plain live text. Outlined paths, mixed styled runs and
behavior-driven values keep their existing source. Structural edits require
stable unique IDs; custom behavior references, responsive/role bindings and
unsupported conditional or relational CSS are refused with a reason. Complex
Illustrator coverage and first-edit identity materialization remain R1.1d work.
Text boxes retain their authored dimensions; use Box width/height when larger
copy needs more room. The walkthrough uses point text for the added title.

Owner acceptance, physical-phone checks and named receiving-host acceptance stay
open. Browser-executed export packages are evidence for the package behavior,
not for a real playout installation. This remains the opt-in Alpha editor.

## Owner feedback 2026-09-27

PR #453 merged as `6d6a7051` on September 26 at 22:18 UTC. The owner subsequently
tried Hairline and Quiz and reported clear improvements. The exact browser/deployed
revision of that review was not captured. The original wording is retained in the
[answered review item](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/owner-queue/2026-09-27-editor-artwork-basics.md).

- Confirmed by the owner: changing title, colour and size; rectangle creation and
  duplication; opacity; Ctrl-selecting texts. Hairline selection/movement worked.
- Tentative: send backward/bring forward appeared to work. Do not call this a firm pass.
- Friction: Apply text/appearance was hard to find. Prefer immediate appearance
  changes; direct canvas typing is desirable, with reliability ahead of that refinement.
- Reported failures: Space did not play; the apparent Play button advanced one frame;
  Quiz could not be marquee-selected/moved and the screen went blue during the drag.
  Ctrl-selection still worked. The layer list was not found, and Project appeared inert.
- Quiz A/B/C/D labels were not editable, also matching the owner's playout experience;
  this is not a request to expose behavior-owned content. Inspect source before deciding
  whether any particular label is unsupported; do not infer its ownership from the report.
- Requested later: artwork Ctrl/Cmd-C then Ctrl/Cmd-V duplication and Alt-drag copies.
- No explicit owner verdict on save/reopen, undo/redo, exports or complete branding
  consistency. The prior engineering results remain evidence, not complete owner acceptance.

Source inspection after the report: `Timeline.tsx` labels the triangle Next frame
and advances `time + 1 / fps`; it has no continuous play control. `Canvas.tsx`
handles Space for pan. `Timeline.tsx` already renders Layers and source-derived rows;
`EditorFoundation.tsx` toggles Project state. These establish implementation and
discoverability gaps, not a reproduced cause for the Quiz blue screen or Project symptom.
Those symptoms have not been reproduced in this documentation-only follow-up.

## Next bounded outcome

The September 27 corrections are implemented and locally verified in the
[bounded usability receipt](usability-corrections.md). After this slice lands,
R1.1b is next. The table below retains the acceptance contract and scope boundary.

Make the existing customization workflow usable before adding keys. Reproduce owner
reports on updated main through the real Hairline and Quiz entry routes, including a
new rectangle, at desktop/laptop/125% layouts. Record route, revision, viewport and
failure before changing code; if reproduction fails, record the attempt without
claiming a fix. Keep B02/B04/B11/B13 scoped to the corrected portions.

| Order / task | Why and observable acceptance |
|---|---|
| 1. Continuous authoring playback | Users must see the existing animation. Separate Play/Pause from frame-step controls. Button and Space advance artwork and clock over multiple frames, pause/resume and stop at the authored cue/end boundary. Ignore playback shortcuts in text/numeric inputs and modals; resolve bare Space versus Space-drag pan without triggering both. Test Hairline and Quiz, including after a source edit; playback must not mutate source/history or issue production actions. If a visible pane appears frozen, measure its requestAnimationFrame before blaming runtime. |
| 2. Quiz marquee and movement | The selection workflow must work beyond Hairline. Reproduce the blue-screen symptom without assuming browser text selection is its cause. Drag from available blank space to select supported Quiz artwork, move the selection, cancel, undo/redo and save/reopen. Ctrl/Shift selection continues to work, background/ancestor hits do not steal intended marquee gestures, and quiz behavior/source remain intact. A giant full-screen overlay must not obscure feedback. |
| 3. Layer and Project discoverability | A new rectangle must be findable without guessing. Keep Layers in the timeline as contracted; make its rows visible and reachable with usable canvas space at all three viewports. Canvas and row selection agree; the new rectangle can be found, selected and reordered through the existing supported operation. Reproduce Project's apparently inert button and make its supported open/close state visible; full project/assets workflows remain R1.4/R1.2b. |
| 4. Immediate appearance editing | Remove the extra Apply step for font, size, colour/fill and opacity. Valid changes appear immediately while editing; commit one undo transaction per completed interaction, not per keystroke or drag sample. Invalid intermediate input, Escape/cancel and revision changes preserve source. Verify text and rectangles, switching selections, undo/redo and save/reopen. Reuse the registry/source writers and transient previews; this does not auto-publish to production. |

The current separate text box may remain for this slice, with its completion action
clear. Do not trade reliable edits for a rushed rich-text overlay. After the four
corrections, resume R1.1b numeric keys and layer bar-body movement, then R1.1c Set Out,
hold/interruption and export parity, followed by R1.1d fidelity and first-user evidence.

Named R1.2b follow-ups, not forgotten polish:

- Direct in-canvas editing for supported plain live text: preserve caret/selection,
  IME, line breaks, zoom/parent transforms, Escape, history and operator defaults.
  Retain a Properties fallback and preserve outlined/mixed/behavior-driven source.
- Artwork copy/paste and Alt-drag duplication: Ctrl/Cmd-C/V works on eligible selected
  artwork; native copy/paste inside text controls remains native. Alt-drag moves a copy
  while keeping the original, with one atomic undo and cancellation. Reuse duplicate
  identity/reference rules, preserve field/motion bindings, and explicitly refuse unsafe
  sources. Resolve Alt-drag copying versus existing Alt-scale-from-anchor by gesture target.

Owner feedback is asynchronous. Implement and prove these corrections before another
useful workflow review; do not ask the owner to reproduce technical failures again as a
routine gate. This feedback does not authorize the default-editor switch.
