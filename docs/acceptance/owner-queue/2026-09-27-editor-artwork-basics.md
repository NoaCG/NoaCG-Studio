---
kind: desktop
date: 2026-09-27
because: taste
serves: now
answered: true
---
# Customize a graphic in the NoaCG editor

The Alpha editor can change artwork text, font, size, solid colours and static
opacity, duplicate/delete/reorder layers, and move a multi-selection. It now uses
the shared NoaCG logo, type and colours.

## The route, about three minutes

[/app](https://noacg.studio/app), then New graphic, Browse, Hairline, Finish,
**Edit this graphic**. Use the Alpha shortcut if opening an existing saved graphic.
This is the `codex/editor-artwork-basics` slice, landed through PR #453 as
`6d6a7051`. The exact deployment revision used for the owner's review was not captured.

1. Double-click the title, change it to your own title, and Apply text. In
   Properties, pick a font and colour, then Apply appearance.
2. Draw a rectangle, change its fill, duplicate it and use Send backward or Bring
   forward. Ctrl/Shift-click two layers, or drag a marquee from empty stage space,
   and move them together. Undo a change.
3. Save, return Home, and reopen the graphic.

**What to look at.** Does customizing this simple graphic feel clear and usable,
and does the editor now feel like the same NoaCG application?

This asks for product judgment, not a repeat of the automated checks. The
[implementation receipt](../../research/editor-artwork-basics/README.md) holds
the catalog/SVG, history, save/export and rendering evidence. Keyframes, Out
editing, rich typography, images and grouping remain later milestones. Owner
acceptance and the default-editor switch are still open.

## Owner response, 2026-09-27

Feedback received; do not repeat the original walkthrough while its corrections are
pending. [Prioritized tasks and observable acceptance](../../research/editor-artwork-basics/README.md#next-bounded-outcome)
now precede key authoring. Agents reproduce and verify the technical issues. Keep this
answered item until the corrections land; any subsequent owner look concerns the
clarity of the corrected workflow, not a request to debug it.

Original feedback (paragraph formatting only):

> I was able to change the title, color, and size of the text but I didn't find Apply Changes immediately. I'm so used to it (and probably everyone else is also so used to it) that it just automatically applies the changes. If this is easier or if this is fine right now, that is fine. If it's possible I think it should just automatically change when you change the font size and everything would be that the effect changes will take effect immediately. Same with the text: it opens up a different box where you write the text. If it's possible it could just be written on the canvas automatically but it's most important that it works. Working is better than broken. One big problem I found was that space doesn't play the timeline. Same with the play button: it just goes one frame forward, so you can't see the whole animation. The timeline is still under construction, so this might be out of scope for this change, but I just wanted to mention that I can't play the timeline. I opened up the quiz template. That one, I can't lasso to select or move it around. I got it working with the Hairline lower third but the whole screen just goes blue when I try to lasso, press my mouse button down, and select everything. I can control-select texts. For some reason here the ABCD letters are not editable but those are actually not editable in the playout system either. That's, I guess, fine. I can create rectangles and I can duplicate it. Yes duplication works. A few things that we can make work in the future are:
>
> - When you Control-C, Control-V, anything duplicates it and the same goes for if you Alt-drag an item: you get a copy of it. That's a standard Illustrator workflow so it would be really nice if it works here too.
> - Here you also have to apply the appearance changes for the rectangle. Opacity works. You can change the color but it's one more step where you have to manually press OK.
>
> Again it's better that it works so this is okay. Right now, I don't see the layer list anywhere. I see the operator fields and no assets. The project button doesn't do anything. What I mean is, for example, if I made my rectangle, do I see it in a layer view somehow? That could be beneficial, I think.
>
> I'm just going to try the two different layers. I can send backwards. I'm not sure if it's working or not. One second. I think sending backwards and bringing forward works. A lot of good things, I think. Good progress. Hopefully this feedback helps, so write updated future tasks, and you can also rewrite the next prompt if you feel like we need to add something already into the next step.
