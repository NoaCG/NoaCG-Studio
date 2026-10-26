# SVG credits artwork and example coverage

## Why

A user test took thirty minutes to make the downloaded credits example work. The current
credits engine parses the imported text into roles and names and rebuilds its rows. That
does not meet the owner's intended Illustrator to SVG to Credits workflow.

## Goal

Import a long Illustrator text object, choose Credits, and play its original layout from
below the frame until the last line has cleared the top. Replace the downloadable credits
example and qualify the examples before publishing a complete SVG import example set.

## Non-goals

- Converting this new artwork roll into editable playout text.
- A second Credits import route or a new credits composition editor.
- Redesigning the built-in catalog credits.
- Weakening existing tests or removing support for previously saved editable credits.

## Decisions

- Owner accepted preservation of the Illustrator layout, including font, size, alignment,
  line breaks and spacing, and a complete bottom-to-top roll once per Play.
- Owner selected original Illustrator artwork only for this version. Text changes are made
  in Illustrator and the SVG is imported again; no conversion offer is part of this work.
- The new example has one long Credits text object and no Credits box. The text may extend
  below a 1920 by 1080 artboard; its full exported bounds must remain available to the roll.
- Preserve existing saved editable credits behavior through a compatible representation
  if changing the meaning of new Credits imports requires it.
- Inventory every SVG import behavior from the current registry. Supply at least one
  working example per supported behavior, retaining the ordinary title/lower-third examples.
- Update the Illustrator sources, exported SVGs, previews, instructions, public SVG examples
  and download archive together. Publish only after the supplied set passes its checks.

## Observable acceptance criteria

1. A fresh, unrelated long Illustrator text export can be imported and assigned Credits
   without creating a Credits box or using role/name punctuation conventions.
2. The rendered text retains the exported glyph runs, relative positions, transforms,
   styles, line breaks and gaps. The roll does not reconstruct its lines or auto-fit it.
3. Play starts with all scrolling text below the output frame, moves continuously upwards
   at a constant pace, and finishes with all scrolling text above it. Replay starts over;
   Out stops and clears it. Fonts are ready before travel is measured.
4. Text beyond the original artboard is not lost or clipped before entering the frame.
5. New artwork credits do not offer a misleading editable Credits field in playout.
   Existing saved editable credits continue to work and retain their controls.
6. The replacement opens in Illustrator as editable artwork, exports using the documented
   SVG settings, imports successfully and completes the full roll in NoaCG.
7. Every advertised SVG example imports and its documented controls work. A registry-based
   inventory proves at least one example for every SVG import behavior.
8. Downloads and SVG Examples serve the verified replacement and the complete example set;
   archive contents, source files, previews and instructions agree.

## Execution record

- Owner authorized a fresh browser-level diagnostic pass after issue #1747. The new isolated
  checkout is `C:/Users/ahonemi/.codex/worktrees/credits-pop-diagnostic/NoaCG-Studio`, starting
  from `374c20c43e38af1466e2df58c6c1a2ee21a7e41b` and reconciled with main
  `2d44c447b8e7a7ebc5ce189fc1d8873adc0c2b24`. No other worker runs in this checkout.
  Goal and acceptance criteria remain unchanged. The next diagnostic records the runtime's
  existing rectangle reads and actual text, SVG and CSS matrices, then compares the paused
  endpoint across painted frames. The original half-pixel assertions use the original readings.
  No production repair is proposed until that browser evidence identifies the cause.
- Fresh diagnostic run `40320827965` reproduced Pop with a 1.0874-pixel endpoint residue.
  Runtime reads at 792.2 ms measured height `2061.088134765625`; all same-task endpoint
  calibration reads retained that height. At 932.1 ms the painted text measured
  `2062.145263671875`. Parent matrix, final CSS scale and original text transform were the
  same; the GSAP target reached the requested endpoint and fonts were loaded. Drop and Rise
  measured the stable height from the outset and finished at zero. Actual browser JSON is
  saved with the run's `drop/rise/pop credits bounds` attachments.
- Fresh repair attempt 1 waits one rendered frame after finite ancestor motion completes,
  then measures the SVG text. It removes same-task endpoint calibration, which the browser
  proved was reading the same stale bounds. Generation checks still cancel a pending repaint
  or font wait on Out/replay. The existing half-pixel assertions remain unchanged.

- Starting checkout: `8abde8e7103715f21ccf7384f08cb1dbc22a9bfa`.
- Owned worktree: `C:/Users/ahonemi/.codex/worktrees/ba33/NoaCG-Studio`.
- Owned branch: `codex/svg-credits-artwork`.
- Codex cloud CLI exposes launch/list/status/diff/apply; list returned zero tasks and the
  interactive environment picker returned only All Environments, with no launchable
  environment. No task was submitted and no environment binding was substituted.
- Installed Illustrator artifact work is local by the cloud-delegate device-work exception.
  The owner subsequently confirmed local work is always allowed and requested that the
  source rule be updated. Local implementation/review/targeted verification is authorized;
  existing resource guards and authoritative Actions checks remain unchanged.
- Illustrator 30.1.0 generated the replacement `Illustrator/end-credits.ai`,
  `SVG/end-credits.svg` and `Previews/end-credits.png` through the repository script.
  Reopening the first generated source confirmed one editable text object named Credits,
  35 paragraphs, bounds approximately x=723..1197, y=62..2121 on the 1920 by 1080
  artboard, and the final paragraph The Weekly Show 2026. The final export adds an explicit
  Text group because Illustrator otherwise folds its only native layer into the SVG root.
- `node scripts/check-example-layers.mjs docs/tutorials/svg-examples/SVG` passed for
  all seven current SVG examples after the final generation. This is an artifact structure
  check, not proof that their import behavior or playout works.
- Baseline browser reproduction was queued as `j-4700` but never started because available
  memory remained below the existing 4 GB floor. It was cancelled before source wiring.
  This is an attempted, unexecuted reproduction, not a failure or passing evidence.
- New imports mark `options.artwork: true`; absent markers retain legacy editable assembly.
  The new runtime scrolls the original text subtree, waits for fonts before measuring,
  preserves its transforms and glyph runs, and cancels both pending and active rolls on Out.
  Its hidden data holders preserve stable field numbering without offering editable text.
- Independent review covered the 101 changed paths at base
  `8abde8e7103715f21ccf7384f08cb1dbc22a9bfa`. It found an entrance timing defect and stale
  documentation. The defect was reproduced with the emitted runtime in a small geometry VM:
  measuring a parent 40 pixels before its settled position left the last line 40 pixels on
  screen. The runtime now reads the final animation data at Take and waits for the entrance
  and fonts before measuring; delayed starts, font waits and running rolls cancel on Out.
  The VM verified the fix and all three cancellation states. Browser coverage includes the
  real universal Drop/Rise/Pop path and an unresolved font promise.
- Local TypeScript and targeted ESLint passed. Thirty-seven targeted Node tests passed,
  covering the legacy parser, example naming mutations and complete behavior inventory.
  Contract compiler checks and its 28 tests passed. All 19 public mirrors and 68 archive
  entries match their sources. Final four-page PDF and new native preview PNGs were
  rendered/inspected without clipping or overlap.
- Browser/playout acceptance is pending. Local job `j-4703` was queued but RAM remains
  below the existing floor; authoritative GitHub Actions checks will supply browser evidence.
  Publication remains blocked until those checks and the landing workflow pass.
- First PR CI run `40303018279` at `7d3e85854`: factory and catalog checks passed;
  browser checks verified legacy playback, universal entrances and 14 individual behavior
  examples. The artwork journey caught formatter-inserted whitespace in three original
  text runs. New artwork SVGs now carry a formatter-ignore marker so their contents survive
  code formatting unchanged. Two new example checks used layer-role selectors for field
  roles; they now resolve the real field ids and keep their score/position assertions.
- Documentation checks exposed the removed legacy Heading/Board assumptions and missing
  replacement figures. The guide now asserts the new Text-only structure, keeps both figure
  slots and uses the new native artwork preview. The actual import-step capture is attached
  by the example qualification journey and will replace the older fields PNG before landing.
- Explicitly choosing Credits now binds a sole enabled text candidate without requiring
  a special layer name. The independent fixture exercises this with Programme text.
- Repair also shortened the updated orchestrator instructions to the existing 170-line cap;
  the shared-instruction checker passes without changing its limits.
- Second run `40305565245` at `1f2df9ff7` passed the production build, factory/catalog checks
  and all 16 individual Illustrator example import/control journeys. The new original-artwork
  journey and both legacy journeys passed. The stricter universal-motion case found a
  1.0576-pixel Pop endpoint residue: measurement now waits for the following rendered frame,
  retaining the same half-pixel assertion. A documentation gallery locator was corrected to
  target the heading's following list, without reducing its link assertion.
- Review also reproduced added indentation inside meaningful SVG text newlines. Artwork
  markup is now emitted without line-prefix indentation; the independent fixture contains
  preserved newline/spacing, and the real HTML formatter retained all 15 runs exactly.
- Import summaries now count artwork separately from editable fields, and the unused legacy
  box no longer creates a Fill slot. The next screenshot capture waits for painted credits;
  a loading frame is not accepted as documentation evidence.
- Third run `40308327587` at `e32b49642` passed every browser shard except the strict universal
  motion case, plus the build, factory and catalog gates. Pop still measured before its final
  transform tick (0.7933 pixels at the start). The runtime now waits for actual finite GSAP
  tweens on the text's ancestors to finish before reading their coordinate matrix. An independent
  emitted-runtime check verified that waiting, replay cancellation and Out, without changing
  the half-pixel browser bounds. Browser confirmation is pending.
- The third-run fields capture had the correct artwork count but still showed a blank boundary
  frame. Capture now pauses the real roll at one quarter and requires the first text run fully
  inside the output, so its replacement PNG must show the artwork rather than its empty start.
- Fourth run `40310207442` at `43d47d318` passed the complete example qualification and produced
  the final 1280 by 720 fields screenshot, now replacing the canonical public PNG. It shows
  the original credits in frame and zero editable text fields. Build and documentation pass.
- The strict Pop test still found a 1.0874-pixel endpoint residue. Its recorded parent matrix
  was fully settled, ruling out entrance motion as the remaining cause. The transformed text's
  bounds differed from its rest bounds. The final repair reads and corrects the actual start
  and end poses while hidden, then runs one constant-speed tween between those measured poses.
  No frame padding or assertion tolerance was added. Browser confirmation is pending.
- Independent review mutation-tested that coordinate change: the prior runtime reproduced
  start `1080.0302734375`, end `1.08740234375`; calibration produced `1080` and `0`.
  Unchanged geometry, calibrated duration and cancellation also passed in the emitted-runtime
  model. Full review covered the final 104 paths with six findings fixed and none remaining.
