# Real CasparCG 2.5.0 and 2.3.2, a real Bridge exe and a real pairing (AC-2, AC-3, AC-5, AC-6)

2026-09-30, the owner's Windows laptop. Nothing on production: the studio ran offline (this
checkout's own dev server, `npm run dev:worktree`, port 5208), and no CasparCG config was edited.

## What ran

- **Servers.** `C:\casparcg\casparcg-server-v2.5.0-stable-windows\casparcg.exe` and
  `C:\casparcg\casparcg-server-v2.3.3-lts-stable\casparcg.exe`, each started with a scratch
  configuration passed on the command line (one 1080p5000 channel, no consumers, logs and data in
  the session scratchpad; AMCP on 5350 and 5351, outside the dev-port range). The 2.3 LTS folder
  answers `VERSION` with `2.3.2 4de6d18f Dev`, the 2.5.0 one with `2.5.0 69e8ad5 Stable`. 2.3 read
  its config only by a path relative to its own folder; an absolute path gave "read error".
- **Bridge.** `npm --prefix cli run build:exe` on this branch built `NoaCG-Bridge-0.7.0.exe`; its own
  check answered `/health` with features `state, playback, sequence, sequence-loop, servers`. It ran
  as `NoaCG-Bridge-0.7.0.exe --no-open --port 8898` with `APPDATA` pointed at a scratch folder, so
  the owner's real `%APPDATA%\noacg` was not touched.
- **Browser.** The desktop app's built-in browser (Chromium) opened
  `http://localhost:5208/app?bridge=8898&code=<the code the exe printed>`.

## What was observed

1. **First pairing, nothing remembered (AC-3).** After **Pair this browser** the page read "Connect to
   your CasparCG server" with an empty address and no error. Typed `127.0.0.1`, port `5350`, pressed
   Connect: "✓ Connected to CasparCG 2.5.0 69e8ad5 Stable at 127.0.0.1:5350." and "NoaCG Bridge
   remembers this server, so it connects by itself the next time you pair." The scratch
   `caspar-servers.json` then held `[{127.0.0.1, 5350}]`. Change server, port 5351, Connect:
   "Connected to CasparCG 2.3.2 4de6d18f Dev at 127.0.0.1:5351."
   Found here and fixed before commit: after Change server the "Used before" list did not include the
   server just connected, because the page ignored the list Connect returns. The e2e spec now pins it.
2. **Second pairing after a Bridge restart, browser storage forgotten (AC-2).** Stopped and restarted
   the exe (new pairing code), removed `spx-gfx-caspar` from the page's localStorage (what the studio
   Firefox did every session), paired again: the page said "✓ Connected to CasparCG 2.3.2 4de6d18f Dev
   at 127.0.0.1:5351." with no further press. The Bridge log for that run: `paired a browser`,
   `127.0.0.1:5351 connect -> 201 VERSION OK`.
3. **Put on air from a production's Playout dialog (AC-4, AC-6).** A production with an output slug,
   opened at `#/production/<id>`; the header read "CasparCG connected". Before the press, `INFO 1-20`
   on both servers showed no producer on the layer. The dialog's host field offered
   `127.0.0.1:5351` and `127.0.0.1:5350` (from the Bridge). Put on air: "✓ On 1-20 of 127.0.0.1", Bridge
   log `127.0.0.1:5351 take -> 202 PLAY OK`, and on 2.3.2 `INFO 1-20` showed foreground
   `<producer>html</producer>` with path `http://localhost:5208/output?production=walk-output`. Then
   port 5350, Connect ("✓ Connected - CasparCG 2.5.0 69e8ad5 Stable. NoaCG Bridge remembers this
   server."), Put on air: the same HTML producer and URL on 2.5.0's 1-20, log
   `127.0.0.1:5350 take -> 202 PLAY OK`, and the list now began with 5350.
   (The verdict named only the host although the port was not 5250; it now reads host:port.)
4. **Nothing airs by itself (AC-5).** Across all three Bridge runs the only commands in the logs were
   `VERSION` (connects and the header's status poll, 21 polls in run 2) and the two `PLAY` lines from
   the two presses. Restarting the Bridge with both layers on air: run 3 logged only
   `127.0.0.1:5351 status -> 201 VERSION OK` (4 polls), and `INFO 1-20` still showed the HTML
   producer on both servers.

## Limits

- One machine: CasparCG ran on the same laptop as the Bridge, at 127.0.0.1. The studio's case, the
  server on another computer, differs only in the address the Bridge dials; it was not walked here.
- The output URL was the dev server's, which 2.3's engine cannot run as a page (docs/BRIDGE.md); the
  check is that the HTML producer took the URL on the layer, not what it drew.
- The desktop app's window was hidden during the walk, so the pane could not draw: the connect form
  was driven by clicks, and the Playout dialog by the page's own buttons through script. The
  rendered look is judged from the e2e screenshots instead.
