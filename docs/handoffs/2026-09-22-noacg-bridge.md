# NoaCG Bridge - milestone 1: install, pair, discover, cue, control

Branch `claude/noacg-caspar-bridge-af46ae`, worktree
`.claude/worktrees/svg-behaviour-game-shows-518d88`, forked from `99bea0324`. The plan the owner
approved is in the session's plan file; the doc that carries it forward is `docs/BRIDGE.md`. Owner
walk: `docs/acceptance/owner-queue/2026-09-22-noacg-bridge-cues-the-servers-library.md`.

## What changed, and what I decided

1. **The agent became the Bridge, one system.** `noacg caspar agent` is now `noacg bridge`
   (`cli/src/commands/bridge.ts`, `cli/src/playout/`), the old name runs it, and the app speaks
   protocol v2 only (`src/control/playoutLink.ts` replaced `casparLink.ts`; the settings key and
   the token file kept their names so nobody re-pairs for a rename). The protocol is client-neutral
   on purpose: target, item, slot, verb, with open unions for OBS, vMix and OGraf adapters
   (`cli/src/playout/protocol.ts`, mirrored into `src/control/playoutProtocol.ts`, drift refused
   by a test). NoaCG owns every setting; the Bridge is told its target on each call.
2. **Measured on the real 2.5.0 before writing the parsers** (2026-09-22): TLS answers bare ids,
   CLS the quoted-name row, CINF one line, THUMBNAIL RETRIEVE about 160 KB of base64; the wire is
   UTF-8 (`Jääkiekko` plays; the latin1 agent mangled it); a missing file is `404 PLAY FAILED`;
   with `scanner.exe` stopped the server answers `501 TLS FAILED` only after its own five-second
   timeout, so a list waits 12 s and a 4 s wait would have reported silence. No AMCP form carries
   GDD; the scanner's `/templates` is HTTP-only on the server box, so no scanner port is opened
   and fields come from NoaCG's library (by export slug) or the operator.
3. **Pairing by link, one-time code.** The Bridge opens `/app?bridge=<port>&code=<code>`
   (`src/components/BridgePairPage.tsx`, a query route beside `?agent=`); the page exchanges the
   code at `/pair` for the token. The token never travels in a URL. On the hosted studio that
   click is where Chrome's local-network prompt appears, and the page says so first.
4. **Server cues in the rundown** (`src/model/shows.ts` `PlayoutItem`, `ShowCue.source`, additive
   optional; `src/components/home/PlayoutItemPicker.tsx`; `ProductionPage.tsx`). Templates take
   the next free layer counted across graphics and templates; clips share layer 10 below every
   graphic, one at a time - the owner's call, flagged in the walk file. Each verb is one action
   through the Bridge and never a log row. The published payload carries `playoutCues` so the
   hosted control page lists them, disabled with the sentence that says why.
5. **The exe.** `cli/scripts/build-bridge-exe.mjs` (Node single-executable, esbuild + postject),
   proven by starting the result and asking `/health`; 86 MB, not 60 - that is node.exe's own size
   on Windows. `release-cli.yml` builds it on a Windows runner after the publish and attaches it
   to the same Release, so the studio's download link is `releases/latest/download/NoaCG-Bridge.exe`.
   The CLI is bumped to 0.4.0 with its notes; the tag is the owner's step.
6. **All out** now also clears server cues, and its button lights for them (`allOutEnabled`).

## What is verified

- `npm --prefix cli test`: 97 tests, 92 pass, 5 skipped (the smoke tests that need a browser).
- `npm run build`: green on the final tree.
- Playwright through the queue: `e2e/bridge-connect.spec.ts` 16/16, `e2e/playout-cues.spec.ts`
  7/7 (fake Bridge at the network layer, as before).
- The exe: built, started, `/health` answered as NoaCG Bridge 0.3.4 (built before the bump; the
  release job rebuilds at the tagged version).
- The real-server walk `e2e/configured/bridge-real-server.spec.ts` (`BRIDGE_REAL=1`, the live
  config) passed on the third run (j-1722, 1.6 min) with all eleven `PRINT 1` frames; the first
  run was blocked by the analytics consent banner, the second caught a real defect ("Take off"
  sent an item with an empty name, which the fake Bridge had waved through - fixed, and both
  fakes now refuse it). The 2.3.2 install answered the same listing and one CG round through the
  probe script. The frames are in the session scratchpad (`frames/`), not committed.

## A finding for the command roads, not the Bridge

Two quick presses on the scoreboard's +1 showed **4** on the dashboard's PROGRAM monitor and
**3** on the CasparCG channel in two of three walks (frames `06-score-4-0` and
`08-server-template-updated`); the first walk showed 4 on both. The renderer inside CasparCG
follows the same log as every operator page, so the two `update` rows reached it out of order or
one was lost - the fast road's broadcast ordering against the durable rows (`commandRoads.ts`),
which the hosted dashboard walk never checks because it asserts on the monitor, not on the air.
Worth its own row: reproduce with the output page open beside the dashboard and two bumps 200 ms
apart, then decide whether a bump should carry the row's own sequence.

## Left undone, and why

- **The hosted-origin permission prompt** on `https://noacg.studio` needs a person at the
  keyboard; every press here was from a localhost origin, which Chrome does not gate.
- **The Linux server**: whether its media scanner runs there is the owner's check. The picker
  says so in words if it does not.
- **Code signing** is `needs: money` (Azure Trusted Signing, roughly 10 USD a month, needs a
  verified identity). Until then SmartScreen warns once on an unsigned download.
- **A genuine 2.3.3**, Safari, a Decklink card, a LAN hop between Bridge and server.
- **Milestone 2 and 3** are in `docs/BRIDGE.md` §9: GDD in exports, OSC state over a streaming
  `/events`, the log follower for remote operators, OBS, vMix and OGraf adapters.

## Traps found on the way

- The queue's shell is `cmd`: `VAR=1 npx …` is not an assignment there. `set VAR=1&& npx …` is.
  `j-1709` on 2026-09-21 probably failed the same way.
- `spawnSync` with `shell: true` splits `C:\Program Files\nodejs\node.exe` at the space; the exe
  build runs every command without a shell.
- A backend build shows the analytics consent banner over the rundown's foot; a configured spec
  that clicks there must decline it first.
- `scanner.exe` stopped on its own twice during the session (not by anything here); a walk
  that lists the library should confirm the scanner is up first, and the picker's sentence is
  exactly for this.
