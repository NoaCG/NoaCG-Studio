# Landing 3: the studio setup kept in NoaCG Bridge per server, and pairing that says only what is needed (AC-11, AC-12)

2026-10-02, the owner's Windows laptop, branch `claude/studio-day-landing-3-7105ba`. Nothing on
production and nothing of the owner's setup: a scratch CasparCG 2.5.0 (AMCP 5350) and a scratch
CasparCG 2.3.3 LTS (answers `2.3.2 4de6d18f Dev`, AMCP 5351), each on a configuration in the session
scratchpad with two 720p50 channels and no consumers; this branch's Bridge (version 0.8.0's code,
`node cli/dist/playoutEntry.js --port 8898 --no-open`) with `APPDATA` in the scratchpad; this
checkout's dev server (`npm run dev:worktree`, port 5204, offline). The owner's Bridge, deck and
Companion were not touched; nothing listened on 8899.

The decisions the ACs left open are D17 to D19 in the spec, written before the code.

## Real servers, real Bridge, three browser profiles

Browser 1 is the built-in browser; browsers 2 and 3 are fresh headless Chromium profiles (no storage
at all), which is what a second browser or another account's profile is to the page.

| Step | Seen |
|---|---|
| Browser 1 opens the link the Bridge printed, presses Pair | "✓ Paired with NoaCG Bridge on 127.0.0.1:8898." and one line, "Enter the IP address of your CasparCG server.", with an info button; This computer offered |
| Types 127.0.0.1, port 5350, Connect | "✓ Connected to CasparCG 2.5.0 69e8ad5 Stable at 127.0.0.1:5350." The server stays offered under Used before, marked as the one in use |
| Settings, Playout: the line under the setup | "Change anything here and NoaCG Bridge keeps it for 127.0.0.1:5350, for every browser paired with it." (the untouched default is not given to the Bridge, D18) |
| Adds channel 2, names 1 Graphics and 2 Inserts (typed) | The line turns to "NoaCG Bridge keeps this setup for 127.0.0.1:5350, …"; the Bridge logs `127.0.0.1:5350 studio setup kept (2 channels, output 1-20)` and `caspar-servers.json` holds the entry with `studio: { channels: [Graphics, Inserts], output: 1-20, newMedia: 2 }` |
| Browser 1, Copy a link for it (Playout settings) | `http://localhost:5204/app?bridge=8898&code=…`, a fresh code from `/pair-link`; the pane refused the clipboard, so the link showed in its box with "Copy the link above." |
| Browser 2 opens that link, presses Pair, types nothing | "✓ Connected to CasparCG 2.5.0 69e8ad5 Stable at 127.0.0.1:5350. 2 channels, NoaCG output on 1-20." Its Settings show Graphics and Inserts, New media 2, and "NoaCG Bridge keeps this setup for 127.0.0.1:5350" (**AC-11**) |
| Browser 1 connects to 127.0.0.1:5351 | "✓ Connected - CasparCG 2.3.2 4de6d18f Dev." The 2.3 server had no setup, so it took the one on screen (D18) |
| Renames channel 2 "Clean feed", output layer 30 | Kept for 5351 only |
| One press on 127.0.0.1:5350, then on 127.0.0.1:5351 | 5350: Graphics, Inserts, layer 20. 5351: Graphics, Clean feed, layer 30. Two servers apart (**AC-11**) |
| Browser 2 makes a link; browser 3 (1366 px) pairs with it | Connects by itself to the last server, 5351 on 2.3.2, "2 channels, NoaCG output on 1-30." |

At 390 x 844 (browser 2) the pairing page has no sideways scroll before or after pairing, the info
opens under its line, and the link box fits. The first walk showed two faults, fixed and re-walked:
the connected line claimed a kept setup when the Bridge held none yet (now the separate `ready`
state), and a slot address broke at its hyphen ("1-" / "30") on a phone (now one word). Settings'
"Used before:" sat above its buttons' line, an old rule the settings dialog's own `.hint` margin
overrode; fixed too.

The Bridge's window, from the built Bridge with stdin not a keyboard (a background task):

```
  NoaCG Bridge 0.7.1 is running. Leave this window open.

  1. Pair your browser with this link. It works once, within two minutes.
       http://localhost:5204/app?bridge=8898&code=…
     To pair another browser, copy the link into it.
  2. On that page, enter the IP address of your CasparCG server.
```

(0.7.1 is the version the package had when the walk ran; the bump to 0.8.0 followed.) With a
keyboard the third line adds ", or press Enter here for a new one", and Enter prints a new link:
`cli/test/bridge-window.test.mjs` runs the built program with stdin as a keyboard and pairs with
both codes.

## Automated

- **Node, the Bridge** (`npm --prefix cli run build`, then `node --test test/servers.test.mjs
  test/playout.test.mjs test/bridge-window.test.mjs`): 36 pass. A setup kept per server, its place in
  the list unchanged, kept through a Connect and a restart, refused for a server never connected to
  and for a malformed setup, and nothing but `VERSION` reaching either fake server; a file written by
  a newer Bridge keeps its unknown fields, including an unreadable setup, through a rewrite; a 0.7.0
  file reads as servers with no setup; `/pair-link` behind the token, its code and the first one
  both open, each once; codes expire after two minutes and the ninth open one pushes out the first.
- **Node, the rule** (`node --test scripts/studio-setup.test.mjs`): 7 pass. Which copy wins:
  nothing for a server the Bridge never connected to, the Bridge's otherwise, an unconfirmed change
  over the Bridge's older copy, the screen's for a server with none unless it is the untouched
  default, and what the page sends is always a setup the Bridge accepts.
- **Offline e2e** (`npx playwright test e2e/bridge-connect.spec.ts`): 36 passed, nine of them new:
  a second browser opens with the setup and nothing typed; a change in Settings is kept for its
  server and two servers keep their own; a change made with the Bridge stopped is given to it when
  it answers, not replaced, both on reopening Settings and as soon as a production page's status
  sees the Bridge again; a change typed while the Bridge is still being asked is kept; an older
  Bridge keeps the setup in the browser and says so, and its Settings say how to pair another
  browser without `/pair-link`; a production page opens with the Bridge's setup; pairing is one line
  per step with the info buttons, This computer and the servers staying once connected, and no
  sideways scroll at 390 px; another browser pairs from a copied link (the clipboard holds it),
  before pairing and after.
  **Mutations:** with the unconfirmed change no longer winning, the offline-change test fails with
  "Inserts" where "Clean feed" was typed (the data loss it guards); with the production page's sync
  removed, its test reads "NoaCG output 1-20 · 1 channel" instead of the Bridge's 1-30, 2 channels;
  with the sync's re-read before writing removed, the typed-while-asked test fails with "Graphics"
  written over the typed "Program".
- **Review and simplify** (`/check`). The review found that a sync pushed the setup it read when it
  started and then cleared the pending mark, so a change typed during the round trip was never sent,
  and that a pull could write over such a change; also that several syncs could reach the Bridge out
  of order. Every write now re-reads the browser first and settles only what was sent, and syncs
  run one at a time (the typed-while-asked test above). The simplify pass found that a waiting change
  only reached the Bridge when a screen opened, though D17 says "the next time the Bridge answers":
  a production page now sends it when its status sees the Bridge again (the spec above). It also
  routed the Bridge's own routes through the reply reader every other route uses, so a rejected
  token reads as one rather than "does not answer", and made the info button the wizard's ⓘ.
- **The playout specs around it** (bridge-connect, playout-baseline, -clock, -cues, -folders, -nav,
  -sequence): 131 passed and 2 failed under four workers while another session's job ran; both
  passed alone and 8 of 8 with `--repeat-each=4 --workers=4`.

## Not checked here

- The hosted page's wording of the pair step ("answer Allow when the browser asks about your local
  network") renders only on `https://noacg.studio`, where the permission gate applies; locally the
  step reads "Press Pair to let this browser use NoaCG Bridge."
- Enter in a real Windows console window, and Ctrl+C there afterwards: the test drives the built
  program with a pipe it marks as a keyboard. The stdin is read in the terminal's own line mode,
  never raw, so Ctrl+C stays the signal that stops it; the released exe is the owner's check.
- A real studio with CasparCG on another computer: the owner's queue item.
