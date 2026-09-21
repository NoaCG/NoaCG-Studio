---
kind: walk
date: 2026-09-21
because: direction
serves: now
---
# No wizard door leads to the old editor any more

You said on 2026-09-21 that nothing should link to the old editor now that the new one exists,
and that this includes the wizard's front page. In the default studio, every road through the
wizard now ends on Finish. Finish offers a production, an export, or "Edit this graphic", which
opens the new editor. The old code editor is still there in Advanced mode, where its door is now
called "Open in the code editor" so it cannot be mistaken for the new one.

What changed, road by road:

- **Import graphic (SVG, PNG or JPEG).** The footer button that said "Create project" opened
  the old editor and saved nothing. It now says "Skip to finish", the same as the template road.
- **A finished .html or .zip dropped on the Create with AI card.** "Open as code" used to open
  the old editor. It now goes to the same Finish the Import graphic card gives that file.
- **The front page.** Its one editor link, "Open editor Alpha", already went to the new editor.
  The Blank project card, which only opens the code editor, stays behind Advanced mode.

## The route, under a minute

1. Open `https://noacg.studio/app#/new` with Advanced mode off (Settings).
2. Click Import graphic and drop any layered SVG.
3. Look at the footer: it says "Skip to finish", and nothing says "Create project". Click it.
4. On Finish, click "Edit this graphic". The new editor opens, showing your SVG's text layers
   as operator fields.

## What to look at

- **The footer on the Design, Fields and Animation steps** of an SVG or PNG import. You should
  see "Skip to finish" and no "Create project".
- **Finish.** It shows three doors: the production, the export and "Edit this graphic". There
  is no "Open in the editor".
- **The new editor's own header still has an "Existing editor" button.** That file belongs to
  the editor rebuild, not the wizard, so this change leaves it alone. Say if it should go too.
