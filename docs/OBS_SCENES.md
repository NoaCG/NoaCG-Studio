# OBS scenes

How to run a NoaCG production in OBS with one link per OBS scene, so the graphics follow your cuts
by themselves. The design and its decisions are in `docs/work-specs/obs-scenes/spec.md`; what OBS
does with a browser source is measured in `docs/OBS_ON_A_REAL_HOST.md`.

## How it works

- Turn on **OBS scenes** in the production's Playout panel. Nothing about scenes shows until you do.
- A rundown folder marked **OBS scene** (in the folder's ⋯ menu) is a scene. Its cues are its
  graphics. Each scene has its own output link, which builds that scene's graphics only.
- A scene graphic is drawn settled: it appears at rest, with no entrance, on OBS preview and program
  alike. OBS's own cut, fade or stinger carries it on and off air. A clock or a rotation inside a
  graphic keeps running.
- Take and Out work as usual. All out leaves scene graphics as they are.
- A graphic used in two scenes gets one copy per scene ("Lower third · Desk"), with the same data and
  its own placement.

## Set up the browser sources

1. Publish the production. The links exist from the first publish.
2. Open **Playout settings**. The **OBS scenes** section lists every scene with its graphics and its
   link. **Copy** copies one link; **Copy all links** copies every link with its scene name.
3. In OBS, in the matching scene, add a **Browser** source with that link:
   - Width and height: the production's resolution (1920 × 1080 for most).
   - FPS: your OBS frame rate (60 for a 60 fps stream).
   - **Shutdown source when not visible**: off.
   - **Refresh browser when scene becomes active**: off.
   - Page permissions: leave the default.
4. Graphics that change while their scene is off air (a countdown, a sponsor loop, live scores) go
   in one scene folder of their own. Add its link to every OBS scene that shows them as the **same**
   source: in each further OBS scene use **Add Existing** and pick the source you made first, rather
   than a new browser source. It then stays loaded while you cut between those scenes. OBS keeps
   the last picture of a source whose scene is off air and shows it for a frame or two when the
   scene comes back, so a graphic that changed off air in a source of its own can flash its old
   value on a direct Cut. Taking a scene through Studio Mode preview never shows an old frame.

A link opened before the production is published stays transparent and checks again by itself, so
you can build the OBS scenes first and publish afterwards.

## The walk-through

The Playout panel shows one row per scene under the OBS scenes switch. Once every source is loaded:

1. Cut to each OBS scene in turn, on program.
2. Watch its row: it ticks **Seen in OBS scene "<name>"** the first time the link goes on program
   after OBS switched to that scene. A link added to several OBS scenes lists each one.
3. A row that still says **Not yet seen** after you cut to its OBS scene is in the wrong OBS scene,
   or not loaded there. "Not yet seen" before the walk-through is not an error.

The ticks last while the production page and the links stay open.

## What a row says, and what to do

| Row | Meaning | What to do |
| --- | --- | --- |
| Ready | Loaded, connected and ready | Nothing |
| Program, Preview, Hidden | Where OBS has the source right now | Nothing |
| OBS: unknown | OBS has sent no event yet (it sends none at load) | Cut to the scene once |
| Not loaded | No browser source has this link open | Add the source, or check its URL |
| Not answering (time) | The source was loaded and went away | Check that OBS is running and the source is still there; refresh the source |
| Loaded twice | Two browser sources load this link | Keep one, and add it to the other OBS scene with Add Existing |
| Publish to load | The source loaded before this scene was published | Publish |
| Not ready: (graphic) | A graphic of this scene cannot play | Open the row's tooltip for the reason |
| Commands slow | The source is not on the live channel | Check the playout PC's network, or refresh the source |
| Not known | This page itself is not connected | Check this computer's network |

NoaCG watches up to 16 outputs per production. With more than 16 scene links (or outputs of any
kind) loaded, the panel says so, and one beyond those that stops answering is not reported. Forget
an output you no longer use.

Switching **OBS scenes** off while scene links are loaded asks first: at the next publish every
scene link goes empty.

## The fallback, for when the network is gone

Every scene link needs the network to load. For a show that must go on without it, keep an offline
copy of each scene's graphics in OBS, hidden, ready to show.

1. In the production, **Export**, pick **HTML overlay (OBS / vMix)** and keep **Settled** ticked.
   Settled files draw each graphic at rest from load, with no entrance, no automatic Out and no
   reaction to OBS showing or hiding them. Without it a file plays its entrance each time it goes on
   program and may take itself off again.
2. Unzip the package on the show PC. The README lists each scene's files.
3. In each OBS scene, add a **Group** named "<scene> fallback", hidden (the eye off). In it, add one
   Browser source per graphic of that scene, with **Local file** ticked and the graphic's .html
   picked, at the production's resolution.
4. Rehearse it once: network off, browser caches emptied, show each fallback group, and check the
   graphics appear placed and settled with their fonts and images.

On the day, if the network goes: show the scene's fallback group, and hide the browser source with
the scene link so the two do not stack when the network comes back. The fallback shows the values
exported into it; change them with the package's control panel (see its GETTING-ON-AIR.md).

## What each failure needs

| Failure | What happens | Recovery |
| --- | --- | --- |
| The network drops | Loaded links keep what they show; new Takes do not reach them | Show the fallback groups if it lasts |
| A source is closed or crashes | Its row reads Not answering | Refresh the source in OBS (it is back in seconds) |
| OBS restarts | Every source loads again and recovers what is on air | Wait for the rows to read Ready |
| A link is in the wrong OBS scene | The walk-through never ticks that row, or ticks another name | Move the source |
| The production is unpublished | Every link goes transparent | Publish again |
| OBS scenes switched off | Every scene link goes empty at the next publish | Switch it on and publish |
