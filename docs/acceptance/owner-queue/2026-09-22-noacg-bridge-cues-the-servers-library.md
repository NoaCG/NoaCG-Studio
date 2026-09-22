---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# NoaCG Bridge: the browser drives CasparCG, and cues what is already on the server

NoaCG Bridge is the small program on the playout laptop that lets the NoaCG page in the browser
drive a CasparCG server on the studio network without the CasparCG Client. It is `noacg bridge`
in the CLI and `NoaCG-Bridge.exe` on each release, the same command with Node inside. The
Bridge listens only on `127.0.0.1`; CasparCG stays on the trusted studio LAN and is never exposed
to the internet.

Everything below ran on this machine against the real CasparCG 2.5.0 (`69e8ad5 Stable`) with
its media scanner, through the built exe, from a production page on the dev server, driven by
`e2e/configured/bridge-real-server.spec.ts` (`BRIDGE_REAL=1`). After every step `PRINT 1` wrote
a full frame of the channel; the eleven frames are in the session's scratchpad and attached to
the handoff, not committed.

**What ran, in order.** A production of an imported quiz and an imported scoreboard was
published. **Put on air** sent the one command (`PLAY 1-20 [HTML] "<output URL>"`) through the
Bridge; the frame was empty, as it should be with nothing cued. The quiz was taken from the
dashboard, its answer selected and locked, and **Reveal correct** lit Santiago green - all over
the command log, inside CasparCG's own browser, with the Bridge sending nothing. The scoreboard
was taken beside it and scored from the dashboard's live numbers. Then the rundown's **From the
playout server…** listed the server's own 19 templates; `HOUSE_STRAP/HOUSE_STRAP` was added with
typed field ids, taken with data holding a quote, a newline and an ä (`CG 1-21 ADD … "<json>"`),
updated live (`CG UPDATE`, the frame reads "Updated through CG UPDATE") and taken off. A still
from the media list (`JÄÄKIEKKO`) rolled on layer 10 under both graphics, and All out plus Take
off cleared the channel to the same empty frame. The 2.3.2 install answered the same listing and
the same CG round (its CLS writes `NaN 0/0` for a still, which the parser now reads).

**Two decisions here are yours.** Clips share layer 10 below every graphic on purpose: one clip
at a time, and a strap never disappears behind a rolling VT. Server templates take the next free
layer counted across graphics and templates, like a graphic. Both are in `docs/BRIDGE.md` §5.

**One thing the walk saw that is not the Bridge's.** Two quick +1 presses on the scoreboard
showed 4 on the dashboard's PROGRAM monitor and 3 on the channel in two of three runs (the first
run showed 4). The renderer inside CasparCG follows the same log every operator page does; the
frames say the two updates did not land there in the order they were sent. The handoff carries it
as a finding on the command roads, not on the Bridge.

## The route, under a minute

1. On this laptop, start `C:\casparcg\casparcg-server-v2.5.0-stable-windows\casparcg.exe` and
   `scanner.exe` beside it. Run `cli\dist-exe\NoaCG-Bridge.exe` (or `npx @noacg/cli bridge`). It
   opens the pairing page; press **Pair this browser**.
2. Settings -> Playout: host `127.0.0.1`, port 5250, channel 1, layer 20. **Test connection**
   should read `✓ Connected - CasparCG 2.5.0 69e8ad5 Stable`.
3. Open a production with a quiz and a scoreboard, publish it, and press **Links -> CasparCG ->
   Put on air**. Take the quiz, reveal it, step the score: the channel follows.
4. At the rundown's foot press **From the playout server…**. The Templates tab lists the
   server's folder; add `HOUSE_STRAP/HOUSE_STRAP` with field ids `f0, f1`, type a name, press
   TAKE, change it, press Update, press Out. Switch to Media, add a still, TAKE it: it sits under
   the graphics. **All out** clears everything.
5. Stop `scanner.exe` and press the picker's refresh: it should say the media scanner is not
   running, and still take a typed name.

## What to look at

- Every verb on a server cue is one command and one sentence: the note line under the verbs
  says `✓ Take: HOUSE_STRAP/HOUSE_STRAP on 1-21`, or names the hop that refused.
- The server cue's editor shows the server's version and "connected", and Take greys out with
  the reason when the Bridge or the server is gone.
- The quiz and the scoreboard behave exactly as before: nothing about them goes through the
  Bridge.

## Not verified here

The permission prompt on `https://noacg.studio` (a localhost page is never asked), the Linux
server and whether its media scanner runs there, Safari, and SmartScreen on a machine that has
never seen the unsigned exe.
