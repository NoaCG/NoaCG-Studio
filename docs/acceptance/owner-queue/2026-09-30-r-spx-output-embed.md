---
kind: desktop
date: 2026-09-30
serves: now
---
# Your production's graphics inside SPX, through the template file

The SPX template file for a production was tested on real SPX servers without a published
production; this is the one step that needs yours. Record: `docs/SPX_ON_A_REAL_SERVER.md` §4,
branch `claude/r-spx-real-server`.

## The route, about ten minutes

/app, open a production with two graphics and publish it. On its page, under the output link,
press Download on the Template file row. On the laptop, with SPX running (1.2.1 in
`C:\spx\SPX_1_2_1_win64`, or 1.4.1 started with `node server.js` in `C:\spx\SPX_1_4_1_source`):

1. Put the downloaded `.html` in SPX's `ASSETS\templates\` folder, make a project, add the file as
   a template and add it to a rundown.
2. Open `http://localhost:5656/renderer` in Chrome (or as an OBS browser source) and press Play in
   SPX.
3. On the NoaCG production page, take one graphic, then the other, then Out on both.

**What to look at.** Whether the graphics you cue in NoaCG appear in SPX's renderer, on time and
looking as they do in your preview, and that everything around them is transparent, in play and
after Stop. The dark frame found in this round is fixed and was walked transparent on both servers
(`docs/SPX_ON_A_REAL_SERVER.md` §9), so a dark background now is a new fault. Download a fresh
Template file: one downloaded before this fix reached noacg.studio still has the dark frame. The SPX item has no Reload
button any more; to reload the output, Stop and Play the item. Anything else that goes wrong is new.
