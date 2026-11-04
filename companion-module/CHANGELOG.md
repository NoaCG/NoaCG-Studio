# Changelog - NoaCG Companion module

What changed in each release of the module, written for the operator deciding whether to import the new file. The release workflow in the NoaCG Studio repository puts a version's section on its GitHub Release page and refuses a version that has no section here.

To release, move `version` in `package.json`, write its section at the top and land that on NoaCG Studio's `main`, then run its Release NoaCG Companion module workflow with dry run off. Changes not ready to release wait under `## Unreleased`, which releases nothing and holds up a release until they are moved into a version.

Write a section the way you would tell an operator what they get by importing again: what was wrong or missing, what it does now, and anything they have to do. No pull request lists, no usernames, no internal names.

## Unreleased

## 0.3.0 - 2026-11-05

What to do: import the new file, then drag the **Take** preset from **Show control** onto your Take key again. A key holds its own copy of its words, so an old Take key keeps working but keeps its old words. Your other keys keep working as they are, and the new words below show on keys you drag from now on.

- The Take key now says what its next press does: OUT on red when it takes the selected cue or folder off air, TAKE and the selected name when it takes a cue, also with another cue on air (on a One-by-one folder that name is the folder's, and the press takes its next cue), PREVIEW in the page's preview-first mode, and FROM THE TOP when a One-by-one folder has reached its end with no graphic up.
- The **Pinned graphics** section always shows. Before, it stayed hidden until you pinned something; with nothing pinned it now says to pin a graphic on the production page to get its controls here. **Cues** does the same before a page answers.
- The cue keys follow the usual way of working: a **Select a cue** key picks the cue, then the Take key airs it. Select now comes first, and the section says how the other two differ. **Take a cue** is now **Take a cue now**, and it reads TAKE on the key, or OUT on red while its cue is on air, so it does not look like a Select key. A folder no longer offers one, because a folder could never be taken that way. **Trigger a cue** is now **Play now, keep selection**. What a press does has not changed.
- A pinned score banner offers one set of controls: its own +1 and -1 keys, which play the point on air, and no longer a second key that moves its number the same way with nothing playing. A number keeps a key only for a step no action covers, like the -1 that corrects a goal on the football strip. To correct a figure silently where no key is left, add a **Graphic action** with its number and **Step**. A number's key already on your deck keeps working. This needs the production page from 2026-11-05 or later, so reload an open page; an older page still offers both.

## 0.2.0 - 2026-11-04

The first release you can download yourself, from the NoaCG Downloads page. The module runs a production from a Stream Deck or any Companion surface: Take, Out, Next, cues, the server clip clock and the live controls of a pinned graphic, with what is on air, what is selected and what is allowed shown on the keys.

In Companion 4.3 or later, open **Modules**, press **Import module package** and choose the file, then pair it from the production page's **Setup** menu. If you already imported a 0.2.0 file by hand, this is the same module with only its install help changed, so you do not need to import it again.
