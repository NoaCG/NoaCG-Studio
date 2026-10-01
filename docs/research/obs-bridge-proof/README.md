# OBS Bridge proof, 2026-10-01

The proof behind [`docs/work-specs/bridge-obs-adapter/spec.md`](../../work-specs/bridge-obs-adapter/spec.md).
[`obs-bridge-proof.mjs`](obs-bridge-proof.mjs) is standalone: it lives outside `cli/` and `src/`,
imports nothing from them, and needs only Node 22 or later. It carries its own copy of the
adapter's verbs as the spec maps them, so each verb's calls can be run against a real OBS before
the Bridge code exists.

| Command | What it does |
|---|---|
| `node docs/research/obs-bridge-proof/obs-bridge-proof.mjs` | Reads obs-websocket's settings from OBS's own config, says which setup state the Bridge would report, and when the server listens does the handshake and `GetVersion`, `GetVideoSettings`, `GetSceneList`. Read only. |
| `… --plan` | Runs every verb against a small in-memory stand-in (not OBS) and prints each request in order, branches included. |
| `… --live` | Runs every verb against the real OBS in two scenes of its own, created and then removed. It serves its own probe pages on `127.0.0.1`, and the pages report what they receive. It never changes the program or preview scene, never switches scene collections and never touches obs-websocket's settings; it checks afterwards that program and preview are what they were. |
| `… --obs-config <dir>` | Reads the settings from `<dir>` instead (a portable OBS's `config/obs-studio`). |

The password is read from OBS's config and used for the handshake only; neither it nor the
authentication string derived from it is ever printed. Every line goes out with the user's home
folder written as `~`.

## The live run, 2026-10-02

On a portable copy of OBS Studio 32.2.1 with obs-websocket 5.7.4 that this run owned (its own
config, websocket on port 4466 with a generated password, nothing of anyone else's):
**[`live-2026-10-02.txt`](live-2026-10-02.txt), 23 of 23 checks passed.** Every request the
earlier walks had not used ran on real OBS: `GetInputSettings`, `SetInputSettings`,
`GetSceneItemId`, `CreateSceneItem`, `GetSceneItemEnabled`, `GetSceneItemList`, `GetInputList`,
`CreateScene`, `RemoveScene` and `RemoveInput`. The run now also covers the branches `--plan`
only simulated: a source that exists but is not in the scene (`CreateSceneItem`), a name held by
another kind of source (refused, the source unchanged), a name held by a scene (602, "The
specified source is not an input."), a missing scene (`not-found`), and a local-file graphic whose
marker is read from the file and which take url then switches to a URL.

Also measured there:

- **The handshake and its failure.** [`probe-2026-10-02.txt`](probe-2026-10-02.txt) is the read
  only probe identifying in 33 ms; [`wrong-password-2026-10-02.txt`](wrong-password-2026-10-02.txt)
  is the same probe with a wrong password in a copy of the config: OBS closed with 4009
  "Authentication failed.", the `password` state.
- **A `msgs` array arrives whole and in order**, `update` then `play` in one event, and a page in a
  scene that is on neither program nor preview loads with `visibilityState` "hidden", still runs,
  and hears `emit_event`.
- **Removal is applied after the reply.** `RemoveScene` answers 100 and `SceneRemoved` arrives,
  yet a `GetSceneList` sent at once still listed the scene (about 50 ms, until `SceneListChanged`);
  and a `CreateInput` sent at once with the name of an input just removed answered 601. The proof's
  last check now polls for its scenes to be gone and says how long that took.
- **`GetInputSettings` returns only the settings that differ from the defaults**: `shutdown` and
  `restart_when_active` are absent unless set, and `is_local_file` is absent on a source made with
  a URL. After take url switches a local-file source to a URL, `local_file` stays in the settings
  with `is_local_file` false.
- **A 600 comment names the canvas** (OBS 32 has canvases): "No source was found by the name of
  `…` within the canvas `Main`."
- **`CreateInput` selects the new item** in OBS's Sources list (a `SceneItemSelected` event), so
  the preview shows its red bounding box until the operator clicks elsewhere. Program is not
  affected.

After the run its temp file was once left behind (OBS still held it); the cleanup now retries the
removal for up to 2 s. That change came after the recorded run. `--plan` prints the same calls as
on 2026-10-01.

## What ran on this machine first, 2026-10-01

OBS Studio 32.2.1 with obs-websocket 5.7.4 was running, opened by another session, with
obs-websocket's server off (`server_enabled` false in its config; its log for that run has no
`Server started` line). Turning it on, or opening a second OBS, was not this session's to do, so:

- **Settings read: proven.** [`probe-2026-10-01.txt`](probe-2026-10-01.txt): the script found
  `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`, read port 4455, authentication
  required and a password present, found nothing listening on `127.0.0.1:4455`, and gave the
  `server-off` sentence. That is the right answer for this machine.
- **Every verb's calls: recorded, then unverified on real OBS** (run live on 2026-10-02, above). [`plan-2026-10-01.txt`](plan-2026-10-01.txt)
  is each verb's exact request sequence from `--plan`. The command that runs them against OBS is

  ```sh
  node docs/research/obs-bridge-proof/obs-bridge-proof.mjs --live
  ```

  on a machine whose OBS has **Tools > WebSocket Server Settings > Enable WebSocket server**
  ticked. It prints each request and answer and ends with `N/17 checks passed`. Every scene and
  source it creates carries the run's timestamp, it stops before changing anything if one of those names
  already exists, and cleanup removes only what it created.
- **The script's own live path** was run once against a scratch obs-websocket stand-in (a
  WebSocket server checking the same authentication formula, and posting page reports itself). All
  17 checks passed and a wrong password gave the `password` state. That shows the script works; it
  shows nothing about OBS, and the stand-in is not kept.

## What earlier walks already saw on real OBS

From [`docs/OBS_ON_A_REAL_HOST.md`](../../OBS_ON_A_REAL_HOST.md), OBS 32.2.1 and obs-websocket
5.7.4, 2026-09-30 and 2026-10-01: the v5 handshake with a password (the same formula as this
script's), `CreateInput` of a `browser_source`, `SetSceneItemEnabled` both ways,
`GetInputDefaultSettings`, `GetSourceScreenshot`, and `CallVendorRequest` to `obs-browser`
`emit_event` arriving in a page as a DOM `CustomEvent`, in a hidden source too and in no dock.

Also seen here, read only: this machine's OBS logs hold one `WebSocketServer::onOpen` and one
`onClose` line for every client connection of those walks, which is why the spec keeps one
session open rather than connecting per command.

## Not verified

- The `global.ini` fallback against a real older obs-websocket; which version moved the settings.
- macOS and Linux. A portable OBS on Windows was verified on 2026-10-02.
- The Bridge itself: this script carries its own copy of the verbs, so AC-7's round through the
  built Bridge and the page is still owed.
