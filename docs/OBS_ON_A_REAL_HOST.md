# NoaCG on a real OBS host

A record of NoaCG graphics in a real OBS Studio on 2026-09-30, driven only through obs-websocket,
and what it answers about docks, page events and OBS's control channel. Every result below was
seen in OBS, through a screenshot OBS took of its own scene or a line the page itself reported;
where a statement rests on something else, it says so.

**Answers first.**

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
([15](research/obs-real-host-2026-09-30/15-refresh-when-active-250ms.png)). That is the workaround
until `docs/backlog/obs-play-when-source-shown.md` lands.

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
  inside OBS, and nothing tells an OBS operator to add the dock. That is filed as
  `docs/backlog/obs-dock-as-the-operator-surface.md`.
- **obs-websocket is the next route**, as `docs/backlog/bridge-obs-adapter.md` proposes: this
  walk proves its two load-bearing assumptions (`emit_event` reaches the page, and a page can tell
  it is on air). It serves Companion and a Stream Deck with no NoaCG module, and it is the only
  route that could also create and show sources, which a dock page cannot do: docks get no
  working OBS API.
- **A script (Lua or Python) or a native plugin** would add a way to create sources and docks
  from inside OBS, which obs-websocket already offers from outside, at the cost of an install step
  per machine and, for a plugin, a native build per platform and OBS version. Nothing measured
  here needs one.
- `docs/backlog/obs-play-when-source-shown.md` is now unblocked: its precondition (the events
  reach a page at the default permission) is met, and §3 says which event means what.

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
- New: `docs/backlog/obs-dock-as-the-operator-surface.md`.

## 9. Not verified

- Whether a dock can load an `http://absolute/` address and pair with a local-file source.
- OBS on macOS or Linux, and OBS 33 (Chromium 150).
- Page permission levels above the default; only level 1 was walked.
- The cloud output URL in this OBS (verified on 2026-08-03, `docs/PLAYOUT_INTEGRATION.md` §8).
- The Windows launcher itself (`Start controller.cmd` and `relay.ps1`); `relay.py` served the
  walk.
- Whether "Shutdown source when not visible" changes any of the above.
