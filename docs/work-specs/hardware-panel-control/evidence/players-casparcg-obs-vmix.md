# One relayed Take and Out on CasparCG, OBS and vMix (AC-12)

Run on 2026-10-02 on the owner's laptop with `players.mjs` (session scratchpad), research §4's
method. Each player loaded the production's output URL (`localhost:5290/output?production=...`,
this branch's app against the preview branch `tyefsqusudalbwysqbhe`), a House Scorebug production
answered by a headless hosted page, and each press was Companion's HTTP API on key 0/1, the NoaCG
Take: the real module, the cloud relay, the page's dispatcher. Pictures are the players' own
captures, measured for where they are opaque (alpha above 200 and not black).

| Player | Version | Loaded through | Before | After press 1 (the panel's `on_air`: House Scorebug) | After press 2 (`on_air` empty) |
|---|---|---|---|---|---|
| CasparCG | 2.5.0 (69e8ad5 Stable) | `PLAY 1-20 [HTML]`, scratch config, AMCP on 5350 | nothing opaque | scorebug, 465-1454 x 87-182 of 1920x1080 | nothing opaque |
| OBS | 32.2.1 | browser source in a new scene collection | nothing opaque | scorebug, 233-726 x 43-90 of 960x540 | nothing opaque |
| vMix | 29.0.0.49 | Web Browser input through its API | nothing opaque | scorebug, 465-1454 x 86-182 of 1920x1080 | nothing opaque |

The boxes match research §4's to a pixel. Each shot was repeated until the expected state showed;
the times this reports (CasparCG about 5.3 s, vMix about 3.4 s, OBS about 0.7 s) are the
capture loops' own granularity (an `ADD IMAGE` or `SnapshotInput` round trip of 1.5 to 2 s per
shot), not press to air, which `companion-end-to-end.md` measures. A first CasparCG run with one
fixed 2.5 s wait per shot (j-2928) caught the scorebug one shot late for the same reason.

## Left as found

- **CasparCG**: the scratch config `casparcg.noacg-panel-test.config` was written into its folder for
  the run, the server stopped with AMCP `KILL`, and the file removed (checked: no `noacg` file left).
  Its media, log and data paths pointed into the session scratchpad.
- **OBS**: the owner's obs-websocket server is switched off (`server_enabled: false`; the research
  had switched it on on 2026-09-30). It was switched on for this run only and the file put back
  byte for byte after OBS exited (`cmp`: identical; `server_enabled` false). The test ran in a new
  collection `NoaCGPanelTest`; OBS was switched back to "Untitled" over the websocket, closed through
  its windows (a "Plugin Load Error" box from OBS's own start-up has to be closed first, or the main
  window ignores its close), and the collection's files moved out of `basic/scenes` (left:
  `Untitled.json` and its `.bak`). `user.ini` reads `SceneCollection=Untitled`.
- **vMix**: closed without saving (a forced end); `last.vmix` keeps its 2026-10-01 04:12:23 time.
- An earlier OBS attempt (j-2932) could not connect because the websocket was off; the OBS it had
  started was closed the same way, on the owner's own collection, before anything changed.
- No player was running before the runs; none is running after (vMix's background service was
  already running and is untouched).
