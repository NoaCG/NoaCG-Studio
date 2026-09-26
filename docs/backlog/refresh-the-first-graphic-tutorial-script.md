# Bring the first-graphic tutorial script back in line with the wizard, then ask for a voice read

**Filed:** 2026-09-26. **Source:** owner-queue cleanup; the pack's review item was closed because
the script it asked about no longer matches the screens.

## Why

`docs/tutorials/first-graphic/SCRIPT.md` is the spoken script for a first-graphic video, written on
2026-09-10 to be handed to a video workflow outside this repository. Its frames regenerate from the
end-to-end test that drives the import road, but its words do not, and the wizard has changed since:
the "Five steps now, not six" line was rewritten on 2026-09-21, the export help chip is now called
"Exporting the SVG", Create project gave way to Skip to finish, and the layer-naming system was
settled on 2026-09-24. Asking for a judgement on the script's voice while it describes screens that
no longer exist wastes the read.

## What it would take

1. Walk the import road on the current build with `docs/svg-samples/scorebug.svg` (or the docs
   example that now teaches the road) and correct every beat of `SCRIPT.md` and
   `INSTRUCTIONS.md` against what is on screen.
2. Re-shoot the frames with `node scripts/tutorial-shots.mjs first-graphic` and check each beat
   against its frame.
3. Then file one `phone` owner-queue item: is the script in the product's voice, and is it the video
   you would put in front of a first-time user? That is taste and nothing else answers it.

## Evidence

The script's own header says every line was checked against its frame on 2026-09-10; the naming
system is `src/templates/behaviours/layer-names.json`, explained in `docs/SVG_AUTHORING.md`.
