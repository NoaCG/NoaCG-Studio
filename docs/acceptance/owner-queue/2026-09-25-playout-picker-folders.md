---
kind: walk
date: 2026-09-25
because: taste
serves: now
---
# The playout server's media and templates are browsed as folders, and Add never scrolls away

"+ From the playout server…" used to list every clip and template by its full server path
(`SPORTS/HOCKEY/2026_FINAL_…`). A deep library's names grew so long that the Add buttons slid
off the popover's right edge, and they could only be reached by scrolling sideways. The picker
now works like a file manager:

- folders at the current level come first, each with how many files it holds;
- files come next, by their own name, cut with `…` when long, with the full path on hover;
- a path line above (`← All media / SPORTS / HOCKEY`) steps back out one level or to the top;
- the Add button always stays visible;
- templates work the same way.

## The route, under a minute

Studio laptop with the Bridge paired: open a production -> **+ From the playout server…** ->
**Media**. Without a server, `e2e/playout-cues.spec.ts` "a deep media library is browsed folder
by folder" shows the same picker against a fake one.

## What to look at

- A real media folder with subfolders. Are the folder rows easy to tell from the clip rows?
  Folders have an amber ▸ and "folder · N files"; clips have a thumbnail and their length.
- A long clip name: is the cut-off still enough to tell two similar clips apart? The full path
  appears on hover.

From branch `claude/noacg-bridge-feedback-cimjwc`.
