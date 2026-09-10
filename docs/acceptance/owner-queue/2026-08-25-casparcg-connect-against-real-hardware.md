---
kind: hardware
date: 2026-08-25
---
# CasparCG Connect against real hardware

one server under Settings, one button airs a
production. Built and CI-green on `claude/caspar-connect-51d22d`; **never touched real
hardware**. Land it before `npm publish` or it misses noacg 0.2.0.

## 2026-09-10: a real SERVER has now run it. Hardware has not.

`claude/bh-caspar-real-server` drove both CasparCG installs on this laptop - 2.3.2 (`4de6d18f Dev`,
the folder named `v2.3.3-lts-stable`) and 2.5.0 (`69e8ad5 Stable`) - with the `<screen />` consumer
they ship with. The walk and its frames are
`2026-09-10-bh-a-real-casparcg-has-now-run-the-output-url.md`.

**Now proven, and no longer to be hedged:**

- The AMCP wire. `noacg caspar status`, `send`, `play` and `stop` round-trip a real server. Every
  reply shape the parser guesses at showed up: `201` with one data line, `200` with several and a
  blank terminator, and `400 ERROR` echoing the command it refused (`HELP`, which 2.3.2 does not
  have). None of that had ever met anything but our own listener.
- The agent. `npx @noacg/cli caspar agent` held the socket, and the studio's **Put on air** sent
  `PLAY 1-20 [HTML] "…"` and got `202 PLAY OK` from real 2.3.2. The same agent round-tripped
  `VERSION` against 2.5.0.
- The HTML producer. `CG 1-20 ADD 1 "<output URL>" 1` loads the hosted output page, which renders
  transparent over a layer beneath it, follows the durable log through takes and field updates, and
  rebuilds its live on-air state after a channel restart or a full server restart from one re-issued
  command.

**Still unproven, and this item stays open for it:**

- **SDI.** Nothing here left the GPU. No Decklink, no key and fill, no genlock, no downstream keyer.
  A screen consumer composites in software and shows you a window; it is not the signal chain.
- **The venue's box.** Its CasparCG version, its GPU, its network path to `noacg.studio`, and
  whether that network lets a playout machine reach the public internet at all. The output page is a
  live HTTP client, not a file.
- **The hosted origin's permission gate.** The Put on air run above was pressed on a `localhost`
  page, which Chrome does not gate. From `https://noacg.studio` the browser's Local Network Access
  permission stands between the page and the loopback agent, and answering that prompt needs a
  person. `src/control/casparLink.ts` tells the three states apart and says what to do about each,
  and none of those three sentences has been read by anyone on a real machine.
- **A second machine.** The agent and CasparCG were the same box. `host` pointing across a LAN is
  untested.
