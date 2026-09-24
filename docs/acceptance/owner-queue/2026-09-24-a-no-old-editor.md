---
kind: walk
date: 2026-09-24
because: direction
serves: now
---
# Nobody can reach the old code editor any more

**Date:** 2026-09-24 · **Branch:** `claude/a-close-old-editor`

## What changed

You asked on 2026-09-24 that nobody reaches the old code editor, because one tick of Advanced
mode on a shared lab computer sent every later student there. Advanced mode is gone, and so is
every way in:

- The wizard's ✕ and Escape always land on Home, whatever the browser has stored.
- Settings has no Advanced mode switch. A browser that still holds the old setting drops it the
  first time the studio reads its preferences.
- The front page has three cards. The Blank project card and its step are deleted.
- Finish offers the production, the export and "Edit this graphic" (the new editor). There is
  no "Open in the code editor".
- Home has no "Continue editing", a graphic's Open goes to its control page, and the control
  page's "Edit graphic" opens the new editor. The new editor has no "Existing editor" button,
  and the video workspace's "Graphics" button goes to Home's Graphics list.
- An old `#/graphic/<id>` link, including the one `noacg save` prints, opens that graphic's
  control page. `/app`, `/app#/` and any unknown address land on Home.

The old editor's code is still in the repository, as you asked, but the studio no longer loads
it: the app no longer ships it to visitors at all.

## The route, under a minute

1. On noacg.studio, open the browser console and run
   `localStorage.setItem('spx-gfx-prefs', JSON.stringify({ advancedMode: true }))`, then open
   `https://noacg.studio/app#/new`. This is the lab computer's state.
2. Press ✕. You land on Home.
3. Open Settings (the sliders icon, or your profile menu when signed in). There is no Advanced
   mode switch.
4. Press New graphic. There are three cards and no Blank project. Pick "Start from a template",
   choose any design and press "Skip to finish". There is no code-editor door.
5. Open `https://noacg.studio/app#/graphic/anything`. You land on a control page that says the
   graphic was not found, not in an editor.

## What to look at

- **Home after ✕.** It should be Home straight away, with no editor flashing underneath.
- **Settings.** The Workflow defaults section starts at the Export target row now.
- **Lottie and Google Sheet links.** Both were only reachable in the old editor. The docs now say
  they are not open right now; a graphic that already has one keeps it. Say if either matters
  for Friday.

## Carried from the two 2026-09-21 items this one replaces

`2026-09-21-a-wizard-exits` and `2026-09-21-j-last-old-editor-doors` described the doors kept
behind Advanced mode, which no longer exists, so they are folded in here. The first asked whether
the new editor's "Existing editor" button should go; it has. The second asked this, verbatim:

- **The Graphics button beside Home in the video workspace.** In the default studio both now go
  to Home. Say if you would rather the Graphics button went away there.
- **Apply with nothing open.** If you have not opened a graphic this session, Apply retints
  whatever the studio last held, which may be a blank starter. That was true before this change
  too; the difference is that you now see it in the new editor instead of the code editor.
