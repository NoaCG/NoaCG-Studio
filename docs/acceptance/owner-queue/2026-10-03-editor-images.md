---
kind: desktop
date: 2026-10-03
because: taste
serves: now
answered: false
---
# Add a sponsor image and replace a logo in the editor

After `codex/editor-r1-2b-3-images` deploys, open
[/app](https://noacg.studio/app). Choose **+ New graphic**, **Start from a template**,
search **Hairline**, choose it, then **Skip to finish** and **Edit this graphic**.

1. Click **Image**, then **Import files…**. Pick a sponsor image. Select its row and
   click **Place image**. It starts centered with its anchor in the middle.
2. Move it on the canvas. Select its Image layer in Layers, then use
   **Replace image…** in Properties to pick a tall image. The box stays the same
   and the whole image fits inside it. Undo, then redo.
3. Drop another image onto the canvas, including over the first image. Each drop
   makes a new layer centered at the pointer, capped to a quarter of the frame.
4. In Assets, select a file and rename it using the pencil beside its name in
   Information. A used file refuses removal; an unused one can be removed. Undo.
5. Save, return Home and reopen. Export to your usual target and use its bundled
   operator picker to replace the image. CasparCG's single-file picker embeds the
   image bytes; SPX and OGraf packages contain the image files.

Do Image, Assets and explicit replacement read clearly as separate actions?
Does the initial dropped size feel right, and is fitting the whole replacement
inside its box useful for your logos? These are desktop product judgments.

The [engineering receipt](../../research/editor-r1-2b-3/README.md) records the
template-search task, created-image movement/replacement/undo, imported artwork,
save/reopen, all three exported runtimes and the guard mutations. Engineering
verification does not claim physical playout-host or owner acceptance. Pen,
alignment, grouping and bins remain later bounded phases.
