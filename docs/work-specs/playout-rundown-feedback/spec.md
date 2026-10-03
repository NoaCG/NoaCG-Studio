# Readable controls and rundown additions

## Why and authority

Owner requirements: the 2026-10-03 playout feedback, points 4, 6 and 7, and the
authorized night row C revised brief. This serves [Goals outcome 5](../../GOALS.md).
Existing productions saved before PR #671 retain longer action labels. Operators
must read the action they are about to fire without relying on a hover.

## Goal and decisions

Make catalog and saved quiz/score actions readable at 1600x900 and 390px phone
width. The rundown's plus opens the existing addition choices. A pending move
says cues remain in place until pasted and Escape cancels it.

Derived decisions: change action display only for reproduced overflow; preserve
fixed player-name button widths. Reuse the existing server picker and library/wizard
routes. Existing distinct graphic, video, audio and folder icons are retained
unless rendered evidence reveals a specific defect.

## Preserved behavior and non-goals

No migration or rewriting of saved templates, fields, controls or action payloads.
Adding server media retains existing channel/layer routing. Copy, cut and paste
retain cue identity and air state. No undo work, customizable colors, audio
normalization or new asset upload/transport implementation.

### AC-1: Catalog and old saved action words are readable

At 1600x900 and 390px phone width, quiz lock/reveal and scoreboard +/- controls
show the catalog defaults and old saved labels with no clipped or overflowing words. Use templates
saved from the first parent of PR #671 as well as current catalog templates.
Fire the actions and confirm the same quiz state transitions and score deltas.

### AC-2: Add choices reach existing addition paths

The rundown plus opens a menu offering another cue on its selected graphic,
library/new graphic, pictures, video, audio and folder. Video/audio use the server
picker with honest setup guidance if no server is configured. The selected media
is added with its existing kind, channel and layer behavior. Menus fit desktop
and phone width, close on Escape, and additions remain saved after reload.

### AC-3: Pending moves are understandable and cancellable

Ctrl+X keeps the cues in their original places and describes a pending move.
Ctrl+V moves the same cues after the selected row or into the selected folder.
Escape cancels the pending move and replaces its message with a cancellation
confirmation. No move, removal or on-air change occurs on cut or cancellation.

### AC-4: Default types stay recognizable

Judge a mixed rundown at both widths. Graphics, video, audio and folders remain
distinguishable by their existing glyphs and accessible type names. Record any
future color customization separately, without adding settings here.
