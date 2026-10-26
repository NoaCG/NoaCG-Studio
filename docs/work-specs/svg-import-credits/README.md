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

- Starting checkout: `8abde8e7103715f21ccf7384f08cb1dbc22a9bfa`.
- Owned worktree: `C:/Users/ahonemi/.codex/worktrees/ba33/NoaCG-Studio`.
- Owned branch: `codex/svg-credits-artwork`.
- Codex cloud CLI exposes launch/list/status/diff/apply; list returned zero tasks and the
  interactive environment picker returned only All Environments, with no launchable
  environment. No task was submitted and no environment binding was substituted.
- Installed Illustrator artifact work is local by the cloud-delegate device-work exception.
  A local exception for ordinary implementation and targeted verification was requested;
  its dependent work remains pending until the owner answers.
- Illustrator 30.1.0 generated the replacement `Illustrator/end-credits.ai`,
  `SVG/end-credits.svg` and `Previews/end-credits.png` through the repository script.
  Reopening the first generated source confirmed one editable text object named Credits,
  35 paragraphs, bounds approximately x=723..1197, y=62..2121 on the 1920 by 1080
  artboard, and the final paragraph The Weekly Show 2026. The final export adds an explicit
  Text group because Illustrator otherwise folds its only native layer into the SVG root.
- `node scripts/check-example-layers.mjs docs/tutorials/svg-examples/SVG` passed for
  all seven current SVG examples after the final generation. This is an artifact structure
  check, not proof that their import behavior or playout works.
- Importer implementation, browser/playout verification, missing-behavior examples,
  public-example replacement, rebuilt download archive and publication remain pending.
