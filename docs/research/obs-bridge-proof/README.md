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
| `… --live` | Runs every verb against the real OBS in a scene of its own, created and then removed. It serves its own probe pages on `127.0.0.1`, and the pages report what they receive. It never changes the program or preview scene, never switches scene collections and never touches obs-websocket's settings; it checks afterwards that program and preview are what they were. |
| `… --obs-config <dir>` | Reads the settings from `<dir>` instead (a portable OBS). |

The password is read from OBS's config and used for the handshake only; neither it nor the
authentication string derived from it is ever printed.

## What ran on this machine

OBS Studio 32.2.1 with obs-websocket 5.7.4 was running, opened by another session, with
obs-websocket's server off (`server_enabled` false in its config; its log for that run has no
`Server started` line). Turning it on, or opening a second OBS, was not this session's to do, so:

- **Settings read: proven.** [`probe-2026-10-01.txt`](probe-2026-10-01.txt): the script found
  `%APPDATA%\obs-studio\plugin_config\obs-websocket\config.json`, read port 4455, authentication
  required and a password present, found nothing listening on `127.0.0.1:4455`, and gave the
  `server-off` sentence. That is the right answer for this machine.
- **Every verb's calls: recorded, UNVERIFIED on real OBS.** [`plan-2026-10-01.txt`](plan-2026-10-01.txt)
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

- Every request in `--live` that the earlier walks did not use: `GetInputSettings`,
  `SetInputSettings`, `GetSceneItemId`, `CreateSceneItem`, `GetSceneItemEnabled`,
  `GetSceneItemList`, `GetInputList`, `CreateScene`, `RemoveScene`, `RemoveInput`.
- That a `msgs` array arrives whole and in order in the page, and that a page in a scene that is
  neither on program nor on preview hears `emit_event` (a hidden item in a shown scene did).
- The `global.ini` fallback against a real older obs-websocket; which version moved the settings.
- macOS, Linux and a portable OBS.
