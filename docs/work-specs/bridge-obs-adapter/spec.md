# Driving OBS through NoaCG Bridge

## Problem and authority

An OBS operator gets NoaCG graphics into OBS today by hand: add a browser source, paste the
production's output URL or pick an exported file, size it, and show or hide it in OBS. CasparCG
gets one production workflow from the page instead: pair NoaCG Bridge, connect by itself, press
**Put on air** (`docs/work-specs/bridge-casparcg-connect/spec.md`). OBS already ships a local
control channel, obs-websocket 5 (bundled since OBS 28), and obs-browser's `emit_event`, which
reaches every browser source page (measured, `docs/OBS_ON_A_REAL_HOST.md` §4).

Authority: `docs/GOALS.md` outcome 5 (one production workflow that plays out to every environment,
OBS staying green) and [issue #761](https://github.com/NoaCG/NoaCG-Studio/issues/761) (serves NOW, needs-owner none). The
setup is held to the CasparCG owner decisions of 2026-09-30 by analogy: connecting may happen by
itself, putting on air never does, nothing is retyped. The decisions below marked **derived** are
this spec's, open to the owner's overrule.

## Behaviour

### Setup, one launch

The operator runs NoaCG Bridge on the computer that runs OBS and pairs as today. Nobody types a
host, a port or a password:

1. The Bridge reads obs-websocket's settings from OBS's own config for this user:
   `plugin_config/obs-websocket/config.json` (`server_enabled`, `server_port`, `auth_required`,
   `server_password`) under `%APPDATA%\obs-studio` on Windows,
   `~/Library/Application Support/obs-studio` on macOS, `$XDG_CONFIG_HOME/obs-studio` (default
   `~/.config`) or the Flatpak's `~/.var/app/com.obsproject.Studio/config/obs-studio` on Linux. A
   missing key takes obs-websocket's own default (server off, port 4455, authentication on). An
   obs-websocket old enough to keep them in `global.ini` under `[OBSWebSocket]`
   (`ServerEnabled`, `ServerPort`, `AuthRequired`, `ServerPassword`; OBS 28's 5.0.x) is read
   there; the current build migrates from that section (its `Config.cpp`). A portable OBS is
   named with `noacg bridge --obs-config <dir>`. The file is read again at every connect, so a
   port or password changed in OBS is followed without a Bridge restart.
2. After pairing, the pairing page asks the Bridge for OBS (`/status` with target
   `{ adapter: 'obs' }`). When OBS answers, the page says **Connected to OBS 32.2.1 on this
   computer** and saves OBS as a playout target, with the scene on program as its default scene.
   Connecting is the handshake plus three reads and nothing else, so it happens by itself.
3. When it cannot connect, the page shows one sentence for the state the Bridge names (the
   error's `setup` field), with **Try again**, which is `/connect`:

| State | What the Bridge saw | What the page says |
|---|---|---|
| `not-found` | no settings file, or one that is not JSON | No OBS settings were found for this user on this computer (or they could not be read). Is OBS installed here? A portable OBS: start the Bridge with `--obs-config`. |
| `server-off` | `server_enabled` false and nothing listening | OBS's WebSocket server is off. In OBS, open **Tools > WebSocket Server Settings**, tick **Enable WebSocket server**, press OK. |
| `not-running` | enabled, nothing listening on the port | OBS is not answering on port `<port>`. Start OBS. (If OBS was started with `--websocket_port`, that port is not in its settings.) |
| `not-obs` | the port accepts, but no Hello comes within 3 s or the upgrade fails | Something on port `<port>` is not OBS's WebSocket server (obs-websocket 4, or another program). |
| `password` | closed with 4009 | OBS refused the password in its own settings. If OBS was started with `--websocket_password`, start it without. |
| `old` | closed with 4010 | This OBS is too old for NoaCG. OBS 28 or later is needed. |
| `kicked` | closed with 4011 | Someone disconnected NoaCG Bridge in OBS's session list. Press Connect to reconnect. |

4. Per production: **Links > OBS > Put on air** and **Take off**, beside the CasparCG ones.
   **Settings > Playout** gets an OBS section: the connection line, **Connect**, the scene the
   output goes to (a list from OBS, default the program scene) and the source name (default
   `NoaCG <production slug>`). The page stores them app-wide beside the CasparCG settings, as
   `PlayoutSettings.obs = { scene, source? }` (`src/control/playoutLink.ts`); a missing `obs` means
   OBS is not set up. OBS needs no host or port in the page.
5. Per production, in the rundown: **From OBS…** in the playout item picker lists the NoaCG
   graphics already in OBS (`/list template`) and adds them as cues whose target is OBS and whose
   slot is that source, the way a server template cue carries its CasparCG target today.

With an older Bridge (no `obs` in `/health` `adapters`) nothing about OBS is offered.

### Target, slot and item (protocol v2, additive on the wire)

- target `{ adapter: 'obs', port? }`; `port` overrides the config. Always `127.0.0.1`.
- slot `{ adapter: 'obs', scene, source }`: a scene by name and an input (OBS source) by name.
- items: `url` (the production output, or any page) and `template` (a NoaCG graphic already in
  OBS as a browser source, named by the graphic's name). `media` is refused.
- `/health` adds `obs` to `adapters`. `/status` and `/connect` add `obs: { canvas: { width,
  height }, programScene, previewScene, scenes }`. `capabilities` for OBS is `['state']`; lists
  `template`; thumbnails none; verbs `take`, `update`, `next`, `out`, `clear`. Errors may carry
  `setup`, one of the states above.
- `/state` with `{ target, scene }` answers `ObsStateReply`: `{ ok, scene, session, observedAt,
  onProgram, onPreview, slots: ObsSlotState[] }`, one per browser source in the scene, each
  `{ source, shown, producer: 'html' | 'empty', page, generation, instance?, cueId? }`. `page` is
  the source's `url`, or its `local_file` path.

**The Bridge code this touches** (the protocol is mirrored at `src/control/playoutProtocol.ts`):
`AdapterId` and `Target`/`Slot` gain the OBS members; `readTarget` and the slot reader in
`cli/src/playout/server.ts` get an OBS branch (today anything not OGraf is read as CasparCG);
`targetKey` and `slotKey` in `cli/src/playout/slots.ts` key OBS by port and by scene and source;
`PlayoutAdapter.state` takes a `where` that is a channel or a scene; `/state` accepts `scene` for
an OBS target; `/status` passes `obs` through; `/connect` accepts an OBS target. For an OBS slot
the instance matches a reading by `page`: the Bridge records the source's page at a take, and the
instance holds while the source is shown with that page.

### The verbs, as obs-websocket requests

Every request is obs-websocket 5, RPC version 1, JSON over text (`obswebsocket.json`). `a → b`
means b is sent after a's answer. `600` is ResourceNotFound, `602` InvalidResourceType.

| Verb | Requests |
|---|---|
| connect | WebSocket `ws://127.0.0.1:<server_port>`; `Hello` (op 0); `Identify` (op 1) with `rpcVersion` 1, `authentication` = base64(sha256(base64(sha256(password + salt)) + challenge)) when Hello carries `authentication`, `eventSubscriptions` 3 (General, Config); `Identified` (op 2) |
| status | `GetVersion` → `GetVideoSettings` (`baseWidth`, `baseHeight`) → `GetSceneList` (program, preview, scenes) |
| every slot verb, first | `GetSceneList`: a scene that is not there is `not-found` naming it, and nothing more is sent |
| take url (Put on air) | `GetVideoSettings` → `GetInputSettings {inputName: source}`. On 600: `CreateInput {sceneName, inputName, inputKind: 'browser_source', inputSettings: {url, width: baseWidth, height: baseHeight, shutdown: false, restart_when_active: false}, sceneItemEnabled: true}` and done. Another kind of input, or 602 (a scene holds the name): refused, nothing more sent. If its `url` differs (or it is a local file): `SetInputSettings {inputName, inputSettings: {is_local_file: false, url, width, height}}`. Then `GetSceneItemId {sceneName, sourceName}`; on 600 `CreateSceneItem {sceneName, sourceName, sceneItemEnabled: true}`, else `SetSceneItemEnabled {…, sceneItemEnabled: true}` |
| out url (Take off), clear url | `GetSceneItemId` → `SetSceneItemEnabled false`; a source not in the scene is already off |
| list template | `GetInputList {inputKind: 'browser_source'}` → `GetInputSettings` for each; the Bridge reads each page (the `local_file`, or a loopback `url`) for `<meta name="noacg-graphic" content="…">`. Name: the graphic's name; label: the OBS source |
| take template | `GetSceneItemId` → `GetSceneItemEnabled` → `CallVendorRequest {vendorName: 'obs-browser', requestType: 'emit_event', requestData: {event_name: 'noacg', event_data: {v: 1, graphic, msgs: [{t: 'update', data}, {t: 'play'}]}}}` → if it was hidden, `SetSceneItemEnabled true` |
| update / next / out template | one `emit_event` with `msgs` `[{t: 'update', data}]` / `[{t: 'next'}]` / `[{t: 'stop'}]` |
| clear template | `emit_event [{t: 'stop'}]` → `GetSceneItemId` → `SetSceneItemEnabled false` |
| state | `GetSceneList` → `GetSceneItemList {sceneName}` → `GetInputSettings` for each browser source in it |
| pause, resume, sequence, take media, thumbnail | refused `unsupported` before anything is sent |

**What real OBS answers** (32.2.1 and obs-websocket 5.7.4, 2026-10-02, `docs/research/obs-bridge-proof/`):

- `GetInputSettings` returns only the settings that differ from the defaults. A key that is
  absent has its default: `is_local_file` absent is false, `shutdown` and `restart_when_active`
  absent are false. After take url switches a local-file source to a URL, `local_file` stays in
  the settings with `is_local_file` false, so `page` follows `is_local_file`, never the presence
  of `local_file`.
- A name held by a scene answers 602 with "The specified source is not an input."
- `CreateInput` also selects the new item in OBS's Sources list, so the operator's preview shows
  its bounding box until they click elsewhere. Program is not affected; the adapter sends nothing
  to undo it.
- Removal lands after the reply: right after `RemoveScene` answers 100, `GetSceneList` can still
  list the scene for about 50 ms, and `CreateInput` with a just-removed input's name answers 601.
  The adapter never removes anything; a test that does (AC-7) waits for the list to change.

**Url slot or template slot.** Update, next, out and clear do not always carry an item (the
page's Take off sends a bare `out`), and a restarted Bridge remembers nothing. So the adapter
decides from the source itself: `GetInputSettings` gives its page, and a page that carries the
`noacg-graphic` marker is a template slot whose graphic is the marker's name; any other page is a
url slot. The marker read is cached per page address for the session.

**Reading the marker.** The Bridge reads at most the first 64 KB of the page, or up to
`</head>`, since a self-contained export inlines its scripts and fonts after the meta; it decodes
the five HTML entities in the value; it reads only a local file OBS names or an address on this
machine; each read gets 1 s, and `/list` has its own 10 s budget.

Events: the Bridge subscribes to **General** for `ExitStarted` (OBS is closing: the session ends
and state reads `not-running` until OBS is back) and **Config** for
`CurrentSceneCollectionChanging` / `Changed` (requests in between answer 207 NotReady, reported as
"OBS is switching scene collections"). State is read by requests, not assembled from events. The
page-side events that matter are obs-browser's: `obsSourceActiveChanged` is what the exported
overlay's entrance follows (`OBS_ON_A_REAL_HOST.md` §10), and `noacg` is the one this spec adds.

Never sent by the adapter: `SetCurrentProgramScene`, `SetCurrentPreviewScene`, any transition,
scene collection, profile, output (stream, record) or obs-websocket settings request, and
`PressInputPropertiesButton refreshnocache`. NoaCG never changes what OBS has on program; the
operator cuts scenes.

### The page side: the `noacg` event

obs-browser dispatches `emit_event` as a DOM `CustomEvent` named `event_name` with `event_data` in
`detail`, to every browser source and to no dock; a string payload arrives as `{}` (measured). The
envelope is `{ v: 1, graphic: '<graphic name>', stream?: 'program' | 'preview', msgs: [ … ] }`,
and `msgs` are the relay's own vocabulary (`update` with `data`, `play`, `stop`, `next`, `event`,
`snap`), applied in order. A missing `stream` means `program`.

The exported HTML overlay and each graphic of a show package gain a marked, deletable block, like
the relay's (`src/control/localReceiver.ts`): it listens for `noacg`, ignores any payload whose
`graphic` is not its own name or whose `stream` is not its own (the `?stream=` it was loaded
with, default program), and applies `msgs` through the same path relay rows take. Its first
command hands the graphic to the operator exactly as a relay or panel command does, so program
cuts stop moving it (`OBS_ON_A_REAL_HOST.md` §10). The export writes the `noacg-graphic` meta
beside `noacg-project-format` (`src/export/common.ts`). Two sources of the same file on the same
stream act together, as they do on the relay.

Take emits before it shows: a hidden page that comes on program is then already under the
operator's command, so its baked values are never played first. The stale frame still shows when
it is shown: with browser hardware acceleration on, showing a hidden item in a scene on program
put the texture it last painted on air for exactly one frame in 10 of 10 shows at 30 fps
(`OBS_ON_A_REAL_HOST.md` §11). The page cannot paint while hidden, so it cannot clear it. For a
take url whose page kept following the production while hidden, that frame is the old content.

This envelope is also what a Companion user sends with the OBS module's **Send Vendor Request**
(vendor `obs-browser`, request `emit_event`), with no NoaCG module and no Bridge. `docs/BRIDGE.md`
and the exported `GETTING-ON-AIR.md` document it.

### Session, failure and reconnect

- **One session per OBS, kept open** (derived). Every obs-websocket connection writes two lines
  in the OBS log (`WebSocketServer::onOpen` and `onClose`, seen in this machine's OBS logs), so
  the CasparCG adapter's connection per command would write about 14,000 lines an hour under the
  page's twice-a-second `/state`. The session is opened by the first request that needs it and
  reopened by the next request after it is lost, at most once a second. The Bridge has no timer
  of its own and contacts OBS only when the page asks.
- **Nothing airs by itself.** A reconnect sends the handshake and nothing else; no take, show or
  emit is ever repeated. A mutating request whose answer never came (3 s, or the connection
  dropped) is `uncertain`, and the Bridge never retries it. Reads are `unreachable`.
- **Kicked** (4011): the Bridge latches it and does not reconnect; `/status`, `/state` and `/act`
  answer `kicked` without connecting, and only `/connect` clears the latch, as the protocol
  requires.
- **Status codes** map to the protocol's errors: 600 `not-found` naming the scene or source,
  207 `refused` (busy), any other failure `refused` with OBS's comment in `raw`. The adapter
  decides by the code only and writes its own sentence: OBS 32's comments name the canvas
  ("… within the canvas `Main`").
- Each verb has one 7 s budget for all its requests, as the OGraf adapter does.
- The generation and instance per slot are kept as `slots.ts` keeps them, so a reading taken
  before a Take never undoes it on screen.

### Security

- The password is read from OBS's own file by the Bridge and used for the handshake only. It is
  never in a reply, a log line or the Bridge's config, and the page never sees it.
- The Bridge connects to `127.0.0.1` only. obs-websocket itself listens on every interface
  (measured, `OBS_ON_A_REAL_HOST.md` §1); that is OBS's setting, and this spec does not change it.
- The Bridge's own properties (loopback, token, origin allowlist, no DNS rebinding) are unchanged.

Preserved: every CasparCG and OGraf route and reply; the exported overlay outside OBS and with no
`noacg` event behaves exactly as today; the Custom Browser Dock route keeps working.

Non-goals: OBS on another computer (it needs a typed password the Bridge would keep; a later
spec); OBS media sources as clip cues; adding the output to several scenes or a downstream keyer;
reloading a page; creating a template source from the page; Companion and Stream Deck
([issue #809](https://github.com/NoaCG/NoaCG-Studio/issues/809)); an OBS script or plugin; reading OBS's command line
for `--websocket_port` or `--websocket_password`.

### Decisions (derived)

1. Local OBS only, password read from OBS's config at each connect, never stored.
2. One kept session, opened on demand; no background reconnect loop.
3. Put on air creates or reuses a browser source by name in one scene and shows it; it never
   reloads a page already on that URL and never switches scenes. Take off hides it, and the page
   keeps following the production, so Put on air shows it as it is now, without replaying
   entrances.
4. One event name, `noacg`, with a `msgs` array so a take's data and play arrive in one event and
   need no ordering between two vendor requests.
5. A template is found, and a slot told from a url slot, by a marker in its page that the Bridge
   reads, not by the source's name.

### AC-1: The Bridge reads OBS's settings and never shows the password

With fixture configs (config.json enabled, disabled, a key missing, not JSON; a `global.ini`
section; none; `--obs-config`), `/status` for `{ adapter: 'obs' }` reports the right port and
setup state, and neither the password nor the authentication string appears in any reply or log
line.

### AC-2: Pairing connects to OBS on this computer by itself

After pairing with OBS running and its server on, the pairing page says it is connected to that
OBS version with no further press and Settings > Playout names OBS and the program scene; with the
server off it says the `server-off` sentence and connects on **Try again** once it is ticked.

### AC-3: Put on air and Take off drive the production output in OBS

Put on air creates `NoaCG <production slug>` as a browser source at the canvas size in the chosen
scene and shows it; Take off hides it; Put on air again shows it without reloading the page; a new
URL reloads it; a name held by another kind of source or by a scene is refused with nothing
changed; a missing scene is `not-found`; the program and preview scenes are never changed.

### AC-4: Exported graphics answer the `noacg` event

An exported overlay and a show package graphic, sent the event as obs-browser dispatches it (a
`CustomEvent` on `window`), apply take, update, next, out and clear for their own graphic name and
stream and ignore another's; `/list` finds them by their marker within its budget; a bare `out`
on a template slot emits stop rather than hiding; a take on a hidden source plays no baked value.

### AC-5: State follows OBS

`/state` reports each browser source in the scene as shown or hidden, its page, and whether the
scene is on program or preview; a source hidden by hand in OBS reads hidden on the next poll; the
page shows the OBS output as on air only while it is shown in a scene on program.

### AC-6: Failure and reconnect never air anything

Against a fake obs-websocket server in `cli/test`: every setup state and close code gives its
sentence; a dropped connection mid-take answers `uncertain` and the take is not resent; the next
request reconnects; after 4011 nothing reconnects until `/connect`; `ExitStarted` ends the
session; 207 during a collection switch is refused, not retried; pause, resume, media and
thumbnail are refused before anything is sent; one session serves repeated `/state` calls.

### AC-7: A real OBS round

On a real OBS 32, `docs/research/obs-bridge-proof/obs-bridge-proof.mjs --live` passes, and the
built Bridge, driven from the page, puts a published production's output on air in a scene of the
test's own, cues a graphic that appears in a `GetSourceScreenshot` of that scene, takes it off and
drives an exported overlay through take, update and out, then removes its scene and waits for
`GetSceneList` to stop listing it.

### AC-8: A Bridge release carries it

`cli/package.json` and `cli/BRIDGE_CHANGELOG.md` say 0.8.0; `docs/BRIDGE.md` has the OBS adapter
table, the kept session in §3's "Nearly stateless" row, and the `noacg` payload for Companion; and
the release workflow can publish `NoaCG-Bridge-0.8.0.exe` from `main`.

## Proof so far

`docs/research/obs-bridge-proof/` holds a standalone script and its records. On 2026-10-01 it read
the settings from OBS's own config and diagnosed `server-off` correctly, and recorded every verb's
calls with `--plan`. On 2026-10-02 `--live` ran them against a real OBS 32.2.1 with obs-websocket
5.7.4 (a portable copy with its own config): 23 of 23 checks passed, every request in the table
above was answered as the spec expects, a `msgs` array arrived whole and in order, the marker was
read from a loopback page and from a local file, and a wrong password closed with 4009. What
differed from the spec as first written is in "What real OBS answers" above and in the status
codes line. Still owed: AC-7's round through the built Bridge and the page, macOS and Linux, and
the `global.ini` fallback on an older obs-websocket.
