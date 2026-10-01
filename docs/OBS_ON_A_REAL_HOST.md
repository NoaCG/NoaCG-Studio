# NoaCG on a real OBS host

A record of NoaCG graphics in a real OBS Studio on 2026-09-30, driven only through obs-websocket,
and what it answers about docks, page events and OBS's control channel. Every result below was
seen in OBS, through a screenshot OBS took of its own scene or a line the page itself reported;
where a statement rests on something else, it says so.

**Answers first.**

- **Since 2026-10-01 an exported overlay plays its entrance when its source goes on program**,
  not when OBS loads it, and plays it again on the next cut. §10 has the look, the trigger choice
  and one stale frame on a Cut that the page cannot clear. §11 re-checked it in OBS on 2026-10-02
  and measured that frame: with OBS's default browser hardware acceleration, exactly one frame in
  10 of 10 Cuts; a 300 ms Fade kept it under 10% opacity.

- **NoaCG graphics work as OBS browser sources.** An exported overlay loaded as a local file plays
  on load. A two-graphic show package, served by its own bundled relay, was taken, updated and
  taken out, with both graphics on air at once.
- **The visibility events reach a NoaCG page at OBS's default page permission: yes.** The default
  level is 1 (read OBS status), and at that level the page received `obsSourceVisibleChanged`,
  `obsSourceActiveChanged` and `obsSceneChanged`. `document.visibilityState` follows the same
  show and hide. No event arrives at load: a page loaded while shown must read its starting
  state itself.
- **obs-browser's `emit_event` reaches a NoaCG page: yes.** A `CallVendorRequest` to
  `obs-browser` / `emit_event` arrived in the page as a DOM event carrying the payload, in every
  browser source including a hidden one, and in no dock.
- **A Custom Browser Dock running the NoaCG control panel drives a browser source directly: yes.**
  In OBS 32.2.1 a dock and a browser source on the same http address share BroadcastChannel and
  localStorage, so the plain `controlpanel.html` in a dock paired with the graphic and took,
  stopped and played it with no relay. The relay route from a dock works too. The research's
  inference that separate request contexts keep them apart (`PLAYOUT_TARGETS_RESEARCH.md` §3.2)
  does not hold on this version.
- **OBS's engine is Chromium 127** (`127.0.6533.120`, CEF 127.145.7, obs-browser 2.26.9), as
  the engine table already said.
- **Recommendation:** no OBS script and no native plugin. Operate from a Custom Browser Dock now,
  and build the obs-websocket route (`docs/backlog/bridge-obs-adapter.md`) for Companion and the
  Bridge. §7 has the reasons.

## 1. The host and how it was driven

**OBS Studio 32.2.1** (64-bit, Windows 10 22H2), installed in `C:\Program Files\obs-studio`,
with **obs-websocket 5.7.4**, 1920x1080 at 30 fps, Direct3D 11, browser hardware acceleration on.

**obs-websocket** was off. It was enabled with authentication and a generated password, written
to `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json` while OBS was closed. The
password is also stored in `docs/private/obs-websocket.local.json` in the main checkout, which is
gitignored; it is never printed or committed. Two things to know about it:

- It does **not** listen on localhost only. obs-websocket 5 has no bind-address setting, and the
  OBS log reads "Not locked to IPv4 bindings ... Possible connect address: 192.168.0.111". The
  Windows firewall's inbound rules for `obs64` block it on Public networks and allow it on Domain
  networks, so on a domain network the password is what protects it. It stays enabled, as
  approved; a firewall rule limiting port 4455 to loopback is the owner's call.
- To turn it off again: OBS, **Tools → WebSocket Server Settings**, untick the server.

**The client** was a short Node 24 script using its built-in `WebSocket`: the v5 handshake
(`op 0` Hello, `op 1` Identify with `base64(sha256(base64(sha256(password + salt)) + challenge))`,
`op 2` Identified), then `op 6` requests. Every request and response was logged. Two examples:

```json
{"requestType":"CreateInput","requestData":{"sceneName":"NoaCG Show","inputName":"House Strap relay",
 "inputKind":"browser_source","inputSettings":{"url":"http://localhost:8787/house_strap/house_strap.html?stream=program",
 "width":1920,"height":1080}}}
→ {"requestStatus":{"code":100,"result":true},"responseData":{"inputUuid":"6fd0d8ee-…","sceneItemId":2}}

{"requestType":"CallVendorRequest","requestData":{"vendorName":"obs-browser","requestType":"emit_event",
 "requestData":{"event_name":"noacg-probe","event_data":{"graphic":"house_strap","msg":{"t":"play"},"n":1}}}}
→ {"requestStatus":{"code":100,"result":true},"responseData":{"vendorName":"obs-browser","requestType":"emit_event","responseData":{}}}
```

Pictures came from `GetSourceScreenshot` (PNG, 1280 wide) of the scene on program, with a mid-grey
colour source under the graphics so white type shows. The ones worth keeping are in
[`docs/research/obs-real-host-2026-09-30/`](research/obs-real-host-2026-09-30/).

**What the pages saw** came from the pages: a probe page (as a browser source and as a dock)
reported every OBS event, BroadcastChannel message and storage change to a small log server on
`localhost:8810`. To press the NoaCG panel's buttons inside a dock, the dock loaded a same-origin
wrapper page that shows the panel in an iframe and clicks its buttons on command; the panel's
own code runs unchanged in the dock's browser.

**Docks** cannot be created over obs-websocket, so three were added to
`%APPDATA%\obs-studio\user.ini` (`[BasicWindow] ExtraBrowserDocks`) before OBS started, and the
file was restored from its backup after OBS closed.

**The graphics** were built by this branch's real exporters from two catalog designs: **House
Strap** (lower third, name and title) and **Match Strip** (scoreboard, teams and scores). One show
("OBS Walk Show", cues Anna, Match Strip, Ben) went through `buildShowZipFor(show,
'html-overlay')`; one lower third went through `htmlOverlayTarget` on its own. The show package's
relay was its own `relay.py`, run with the call that opens the operator page in the default
browser suppressed, because the desktop was shared with live sessions. The Windows launcher runs
`relay.ps1`, which speaks the same protocol v1 and was not run here.

**Scene collection:** everything happened in a new collection, **"NoaCG walk S 2026-09-30"**
(scenes `Scene`, `NoaCG Other`, `NoaCG Show`). Afterwards OBS was switched back to the owner's
`Untitled` collection, closed normally (clean shutdown, no crash sentinel), and the test
collection's files were moved out of `%APPDATA%\obs-studio\basic\scenes`. The owner's scenes were
not touched.

## 2. NoaCG graphics in OBS

| What | Result | Picture |
|---|---|---|
| Exported overlay as a browser source on an http address | Played on load with its baked values | [02](research/obs-real-host-2026-09-30/02-plain-graphic-autoplay.png) |
| The same file with **Local file** ticked | Played on load; fonts and GSAP inlined, nothing missing. OBS 32.1's local-file security change did not stop it | [14](research/obs-real-host-2026-09-30/14-local-file-autoplay.png) |
| Show package, both graphics as `?stream=program` sources on the relay | Loaded at rest, nothing on air until a command | not kept (grey frame) |
| Take Anna, then take Match Strip | Both on air at once, on their own layers | [09](research/obs-real-host-2026-09-30/09-take-match-two-at-once.png) |
| Update the scoreboard (HOME to LIONS, 0 to 2) | Changed in place, the lower third untouched | [10](research/obs-real-host-2026-09-30/10-update-score.png) |
| Take Ben on the same lower third | Replaced Anna on the same layer | [11](research/obs-real-host-2026-09-30/11-take-ben-replaces-anna.png) |
| Out on Match Strip, then All out | The scoreboard left alone, then the frame was clear | [13](research/obs-real-host-2026-09-30/13-all-out.png) |

The relay's log held every command as the controller sent it, each take written to both the
preview and the program stream.

**The entrance plays off air.** OBS loads a browser source when the collection opens, so a plain
overlay's load-time entrance runs whether or not its scene is shown. With **"Refresh browser when
scene becomes active"** (`restart_when_active`) ticked, OBS reloaded the page as its scene went to
program: the probe logged a fresh load at the moment of the switch, and a screenshot 250 ms after
the switch caught the lower third mid-entrance, its bar drawn and its text not yet in
([15](research/obs-real-host-2026-09-30/15-refresh-when-active-250ms.png)). That was the workaround
until the overlay learned to wait for program; §10 has the look at that change.

## 3. Page events at the default permission

`GetInputDefaultSettings` for `browser_source` returned `"webpage_control_level": 1`, and a new
source's page reported `getControlLevel` 1. At that level `getStatus` answered (recording,
streaming, replay buffer and virtual camera all false) and `getCurrentScene`, which needs level 2,
answered `null`.

Events the probe received, in order (times in UTC):

| Action over obs-websocket | Page received |
|---|---|
| Hide the source (`SetSceneItemEnabled` false) | `obsSourceVisibleChanged {visible:false}`, `visibilitychange hidden`, `obsSourceActiveChanged {active:false}` |
| Show it again | `obsSourceVisibleChanged {visible:true}`, `visibilitychange visible`, `obsSourceActiveChanged {active:true}` |
| Program to another scene | `obsSceneChanged {name:"NoaCG Other"}`, `visibilitychange hidden`, visible false, active false |
| Program back | visible true, active true, `obsSceneChanged {name:"Scene"}` |
| Studio mode: program elsewhere, this scene on preview | active false only; the page stays visible |
| Transition preview to program | active true |

So **visible** means "in a scene OBS is showing, preview included", and **active** means "on
program". A page created while its scene is already shown gets no initial event; its load saw
`document.visibilityState` "visible", and a page created hidden saw "hidden". A NoaCG overlay can
therefore start from `document.visibilityState` and follow either event.

## 4. `emit_event`

- The event arrived in the page as a DOM `CustomEvent` named after `event_name`, with
  `event_data` in `detail`.
- It arrived in a **hidden** source too (item disabled), so every browser source in the
  collection hears every emit: a NoaCG page must check that the payload names it.
- A string `event_data` arrived as `{}`; the payload must be an object.
- **Docks did not receive it**, nor any OBS event.

## 5. Docks

- **A dock gets `window.obsstudio`** in OBS 32.2.1, with the same function list as a source,
  which contradicts the research's 2021 forum answer. But **its calls never answered**
  (`getControlLevel` and `getStatus` callbacks never ran) and no OBS event reached it, so it is an
  object a dock page cannot use.
- **A dock and a browser source on the same http address share storage.** The dock probe and the
  source probe, both on `http://localhost:8810`, received each other's BroadcastChannel messages
  and each other's localStorage writes (with `storage` events) every three seconds for the whole
  walk.
- **The plain control panel in a dock paired with the source.** `controlpanel.html` from the
  single overlay package, in a dock, with the graphic as a browser source on the same address and
  no relay running for it: before the graphic existed the panel said "waiting for a graphic…"
  and showed its no-listener banner; once the graphic was loaded, **Take** with a new name put it
  on air ([03](research/obs-real-host-2026-09-30/03-plain-dock-take.png)), the status read
  "connected: spx-control-house_strap", **Stop** cleared it
  ([04](research/obs-real-host-2026-09-30/04-plain-dock-stop.png)) and **Play** brought it back.
- **The relay route from a dock works too.** The show package's `controller.html`, on the relay
  address in a dock, drove every step of §2.
- **Local-file sources are not on a shareable address.** A source with **Local file** ticked is
  served as `http://absolute/<full path>`. A dock was not pointed at that address, so whether one
  could pair with it is not verified; serving the folder over http avoids the question.

## 6. The engine

The probe's user agent in a browser source and in a dock was
`Chrome/127.0.6533.120 OBS/32.2.1`, and the OBS log reads "CEF Version 127.0.6533.120 (runtime),
127.145.7+g2b7d20b+chromium-127.0.6533.120 (compiled)". The engine table's row for OBS 31.x and
32.x now says measured 2026-09-30 on 32.2.1. OBS 33 (Chromium 150, research §3.1) is in beta and
was not measured.

## 7. Dock, script or native plugin

**Recommendation: the dock, then obs-websocket; no script and no native plugin.**

- **The dock already works** and needs nothing built: the exported package's relay plus its
  controller in a Custom Browser Dock operates a multi-graphic show from inside OBS, offline. Even
  without the relay, a dock pairs with a browser source on the same address. What is missing is
  that the exported guide and the export contract still say the panel can never reach a graphic
  inside OBS, and nothing tells an OBS operator to add the dock. That was filed and is done: §10.
- **obs-websocket is the next route**, as `docs/backlog/bridge-obs-adapter.md` proposes: this
  walk proves its two load-bearing assumptions (`emit_event` reaches the page, and a page can tell
  it is on air). It serves Companion and a Stream Deck with no NoaCG module, and it is the only
  route that could also create and show sources, which a dock page cannot do: docks get no
  working OBS API.
- **A script (Lua or Python) or a native plugin** would add a way to create sources and docks
  from inside OBS, which obs-websocket already offers from outside, at the cost of an install step
  per machine and, for a plugin, a native build per platform and OBS version. Nothing measured
  here needs one.
- Playing the entrance when the source is shown was unblocked by this walk: its precondition
  (the events reach a page at the default permission) is met, and §3 says which event means
  what. It landed on 2026-10-01 (§10).

## 8. What changed because of this walk

- `src/validation/engineSupport.ts` and `docs/PLAYOUT_COMPATIBILITY.md` §1: the OBS row is
  "OBS Studio 31.x and 32.x", Chromium 127, measured 2026-09-30 on 32.2.1; and, from row R's
  SPX record (`docs/SPX_ON_A_REAL_SERVER.md` §5), SPX is no longer described as rendering in the
  operator's own browser: on air it runs in the host that loads its renderer, and the
  operator's browser runs a monitor copy.
- `docs/PLAYOUT_INTEGRATION.md` §4: the refresh-when-active workaround, the dock as a way to
  operate, the measured same-address dock pairing, and the local-file address; §8 lists this
  walk.
- `docs/backlog/playout-engine-facts-and-guide-corrections.md` now holds only what is left: the
  vMix facts, the OBS 33 row, and the SPX route guidance.
- New: a backlog item for the dock guidance, closed on 2026-10-01 (§10).

## 9. Not verified

- Whether a dock can load an `http://absolute/` address and pair with a local-file source.
- OBS on macOS or Linux, and OBS 33 (Chromium 150).
- Page permission levels above the default; only level 1 was walked.
- The cloud output URL in this OBS (verified on 2026-08-03, `docs/PLAYOUT_INTEGRATION.md` §8).
- The Windows launcher itself (`Start controller.cmd` and `relay.ps1`); `relay.py` served the
  walk.
- Whether "Shutdown source when not visible" changes any of the above.

## 10. The entrance on program, 2026-10-01

The exported HTML overlay now follows OBS instead of the page load. When `window.obsstudio` is
present it plays its entrance on `obsSourceActiveChanged` true, and on false it calls `stop()`
and finishes that exit at once, so the next time the source goes on program the entrance plays
again. OBS sends no event for the state a page loads in, so a page that loads while
`document.visibilityState` is "visible" starts at once (§3), and if that was only a studio-mode
preview, the take to program plays it again. Once the panel or the relay plays or stops the
graphic, it stops following program, so a cut never undoes the operator's Take or Stop. Outside
OBS it plays on load as before, and a `?stream=` instance still waits for the relay.

**Trigger: active, not visible.** §3 measured that visible includes a scene on preview in studio
mode, so a visible trigger would play the entrance on preview, off air, which is the defect this
fixes. Without studio mode the two fire together, so active costs nothing there.

**The look.** Same OBS 32.2.1 and obs-websocket 5.7.4 as §1, in a new collection
("NoaCG walk W 2026-10-01", scenes `W On Air` and `W Other`, a grey colour source under the
graphic, **Cut** transition), with the Hairline lower third exported by this branch's
`htmlOverlayTarget` and added as a **Local file** browser source while `W Other` was on program.
Pictures are `GetSourceScreenshot` of `W On Air`, 960 wide. The look ran on the branch before
its review added two refinements: the replay after a page loads on a preview, and the hand-over
to the operator once the panel plays or stops the graphic. Those two are pinned by the e2e in
`e2e/exports.spec.ts`, and a second look in OBS on 2026-10-02 confirmed both (§11).

| Step | What OBS showed | Picture |
|---|---|---|
| Source loaded with its scene off air, 4 s | Nothing: the entrance had not run (before this change it would have run here) | not kept (grey frame) |
| Cut to `W On Air`, 200 ms later | Mid-entrance: the bar drawn, the text not yet in | [01](research/obs-real-host-2026-10-01/01-first-cut-200ms.jpg) |
| Cut away, then back, 200 ms later | Mid-entrance again: the entrance replayed | [02](research/obs-real-host-2026-10-01/02-second-cut-200ms.jpg) |
| Settled | Name and title in place | [05](research/obs-real-host-2026-10-01/05-settled.jpg) |
| Studio mode, `W On Air` on preview only, 3 s | Nothing: visible but not on program, so the entrance waited | [03](research/obs-real-host-2026-10-01/03-studio-preview-at-rest.jpg) |
| Transition to program, 200 ms later | Mid-entrance | [04](research/obs-real-host-2026-10-01/04-studio-take-200ms.jpg) |

**One stale frame on a Cut.** With browser hardware acceleration on, OBS keeps the texture a
hidden browser source last painted. Screenshots taken back to back right after a Cut back to the
scene, in three rounds, showed the settled lower third for the first 10 to 40 ms, then the start
of the entrance: about one frame at 30 fps of the old graphic before it animates in. The page
cannot paint while hidden, so it cannot clear that texture itself. In studio mode the scene is
painted at rest on preview before the take, and no stale frame was seen there. §11 measured it
from recordings of the program output, with hardware acceleration off and with a Fade.

**The dock guidance.** GETTING-ON-AIR.md, the overlay and SPX package READMEs and
`src/export/AGENTS.md` now say what §5 measured: the panel reaches a graphic in OBS from a Custom
Browser Dock on the same http address, and with the relay the dock takes the page the launcher
opened. vMix and CasparCG keep the relay and their own controls. The panel's own no-listener
banner is in `src/control` and is `docs/backlog/control-panel-banner-names-the-obs-dock.md`.

Afterwards OBS was switched back to `Untitled` and closed normally (no crash sentinel, zero
leaks), the test collection's files were moved out of `%APPDATA%\obs-studio\basic\scenes`, and
obs-websocket was turned off in its `config.json`. The owner's scenes and docks were not touched.

## 11. Second look, the stale frame and the landing picture, 2026-10-02

**The host.** A portable copy of the same OBS Studio 32.2.1 (obs-websocket 5.7.4, Chromium 127),
copied out of `C:\Program Files\obs-studio` with a `portable_mode.txt`, so it kept everything in
its own `config\obs-studio`: profile, scene collection, dock list and obs-websocket settings (on,
port 4466, a generated password that was never printed or kept). The owner's OBS config and
scenes were neither read nor touched, and no other OBS was running. 1920x1080 at 30 fps, browser
hardware acceleration on unless said otherwise. Windows asked once about the firewall for the
copy's WebSocket server; the prompt was closed without allowing, and no firewall rule exists for
the copy. The same OBS ran the Bridge proof (`docs/research/obs-bridge-proof/`, 23 of 23).

**The review's two refinements, seen in OBS.** The Hairline lower third, exported by
`htmlOverlayTarget` from `main`, as a browser source on `http://127.0.0.1`. Pictures are
`GetSourceScreenshot` of its scene
([02](research/obs-real-host-2026-10-02/02-review-fixes.png)).

| Step | What OBS showed |
|---|---|
| Loaded with its scene off air, 4 s | Nothing |
| Cut to it, 200 ms | Mid-entrance, the bar drawn and the text not yet in |
| Studio mode: the page loaded while its scene was on preview, 3.5 s | Settled on preview: a page that loads visible starts at once |
| Transition to program, 200 ms | Mid-entrance: the take played it again, on air |
| The panel's Stop | Clear |
| Cut away and back, 1.5 s | Still clear: the cut did not play it again |
| The panel's Play, then cut away and back, 200 ms | Settled: no reset and no replay, the operator is in charge |

The panel's commands came from a page on the same address posting the control panel's own
BroadcastChannel messages (`{t: 'stop'}`, `{t: 'play'}`), the path a docked `controlpanel.html`
takes (§5).

**The stale frame, measured.** OBS recorded its program output (x264, 30 fps) while
obs-websocket switched between a scene holding only a #0000FF colour source and one holding a
#808080 colour source under the overlay, 2.5 s on air
and 1.5 s off, ten times per row. [`measure-cut-back.py`](research/obs-real-host-2026-10-02/measure-cut-back.py)
reads every frame of the recording and counts, after each switch back, the frames that still show
the settled graphic before the entrance starts;
[`measure-item-show.py`](research/obs-real-host-2026-10-02/measure-item-show.py) does the same
for a source shown again in a scene that stays on program. Both gained an error exit and a
stricter test for a show after review; the recordings were deleted with the copy, so the counts
below come from their first versions, whose per-frame lines showed every flash as one full frame
between empty or bar-only frames.

| Condition | Frames of the old graphic after the switch |
|---|---|
| Cut | exactly 1, in 10 of 10 ([01](research/obs-real-host-2026-10-02/01-cut-back-frames.png)) |
| Cut, with the page also resetting on `obsSourceVisibleChanged` false (an experiment, not shipped) | 1 in 9 of 10, 2 in the other |
| Cut, browser hardware acceleration off (an OBS restart) | 1 in 4 of the 9 switches the recording caught, none in 5 |
| Fade, 300 ms | none from the second fade frame on; in 5 of 10 the first fade frame held it at 5 to 9% opacity |
| The hidden item shown again (`SetSceneItemEnabled`), scene on program | exactly 1, in 10 of 10 |

So there is no page-side fix. The frame is the texture OBS kept from the last paint before it hid
the page, and a hidden page does not paint: resetting on the earlier visible event did not get a
frame out before the hide. Turning hardware acceleration off only makes it intermittent, at a CPU
cost. A Fade hides it. Studio Mode was not recorded here; §10's screenshots saw no stale frame
there, where the scene is painted at rest on preview before the take. A scene transition does not
help when the source itself is hidden and shown in a scene on program; a source's own Show
Transition might, and was not measured. The operator line is in `docs/PLAYOUT_INTEGRATION.md` §4, and it closes the
backlog item that asked for this measurement. Showing a hidden item has the same
frame, which matters to the Bridge's take (`docs/work-specs/bridge-obs-adapter/spec.md`).

**The landing picture.** [`public/landing/shot-obs.png`](../public/landing/shot-obs.png),
1438x788: OBS with the House Strap lower third on program over a dark background, and the
exported package's `controlpanel.html` in a Custom Browser Dock beside the preview, paired with
the graphic over the same address ("connected: spx-control-house_strap"). It is a capture of a
real OBS, like the landing's on-air frames, not one `scripts/landing-shots.mjs` makes. To take it
again:

1. Copy `C:\Program Files\obs-studio` to a folder of your own and add an empty
   `portable_mode.txt` to it. Before the first start, write `config\obs-studio\user.ini` with
   `[General]` `FirstRun=true` (no auto-configuration wizard) and `[BasicWindow]`
   `ExtraBrowserDocks=[{"title":"NoaCG","url":"http://127.0.0.1:8823/house_strap/controlpanel.html","uuid":"<a new uuid>"}]`.
2. Export the House Strap lower third (catalog `lt11`, its default Lina Berg, Anchor · Evening
   News) as an HTML overlay, unzip it beside a `bg\index.html` copied from
   [`landing-background.html`](research/obs-real-host-2026-10-02/landing-background.html), and
   serve that folder with `python -m http.server 8823 --bind 127.0.0.1`.
3. In OBS: a scene **Studio** with browser sources **Lower third**
   (`http://127.0.0.1:8823/house_strap/house_strap.html`) over **Background**
   (`http://127.0.0.1:8823/bg/index.html`), both 1920x1080; a scene **Break** with Background;
   the **Fade** transition at 300 ms; Studio on program.
4. **Docks > NoaCG** to show the dock, drag it to the window's right edge so it docks at full
   height, and untick **Docks > Audio Mixer** (it is empty). Size the window to 1440x820, the dock
   to about 420 wide, and drag the line above Scene Transitions down until the preview fills its
   width. Click inside the dock, so no source is selected and the preview has no red box.
5. Capture the window, then crop the Windows title bar and the 1 px border.

**Afterwards** the copy's obs-websocket was turned off, the copy was closed normally (zero leaks)
and deleted with its config, recordings and scenes, and the local servers were stopped.
