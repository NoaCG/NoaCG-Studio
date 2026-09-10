---
kind: walk
date: 2026-09-10
---
# A real CasparCG has now run the output URL, and it corrects two numbers we had wrong

Until today every claim about CasparCG in this repository came from a fake: `e2e/caspar-connect.spec.ts`
answers the agent's HTTP surface with `page.route`, and the CLI's fifteen AMCP tests talk to a listener
we wrote ourselves. The two CasparCG servers sitting on this laptop had never been used.

Both have now aired a published production. Demo beats A4 (load the output URL by hand) and A6
(CasparCG Connect) both work on a real server, and the walk turned up four things worth knowing
before the 25th.

**What a screen consumer proves, and what it does not.** These runs used the `<screen />` consumer
that both installs ship with: a real server, a real AMCP socket on 5250, a real Chromium Embedded
Framework HTML producer, real compositing over a layer underneath. They say nothing about SDI, about
a Decklink card, about the venue's GPU or about their network. The hardware item
(`2026-08-25-casparcg-connect-against-real-hardware.md`) stays open for that reason.

## The route, under a minute

CasparCG is at `C:\casparcg\casparcg-server-v2.3.3-lts-stable\casparcg.exe` (2.3) and
`C:\casparcg\casparcg-server-v2.5.0-stable-windows\casparcg.exe` (2.5). Start one - only one, they
both want port 5250 - then publish any production and copy its output URL:

```
node cli/dist/index.js caspar status                       # 201 VERSION OK - the server is there
node cli/dist/index.js caspar send PLAY 1-10 giorno         # something under the graphic
node cli/dist/index.js caspar send CG 1-20 ADD 1 "<output URL>" 1
node cli/dist/index.js caspar send PRINT 1                  # writes a PNG of the channel to the media path
```

`PRINT 1` is the whole trick for reviewing this without watching a window: it drops a full-frame RGBA
PNG of the channel into the server's media folder, so every claim below is a file you can open.

**What to look at.** Take a cue on the production page and `PRINT 1` again. The graphic is on the
channel, keyed over whatever is on layer 10, and the frame is otherwise untouched. Type a different
score and press Update: the next `PRINT` has the new number, with no second AMCP command - every
take, update and recovery after that one `CG ADD` travels on the durable log the output page already
follows.

## The four findings

**1. The engine numbers in `docs/PLAYOUT_COMPATIBILITY.md` were both wrong, and the walk measured
them.** The 2.3 install (folder `v2.3.3-lts-stable`, `VERSION` answers `2.3.2 4de6d18f Dev`) reports
**`engine: Chromium 71`** on the output page's `&debug=1` line. The table calls 2.3.0-2.3.2 Chromium
75 and 2.3.3+ Chromium 88, both marked *inferred*; `vite.config.ts` guesses "~Chromium 63". The real
number is 71. The 2.5.0 install reports **Chromium 142**, which is what the table already says.

**2. The catalogue's flex gaps really do collapse on 2.3, and you can see it in one pair of frames.**
The same production, on air on both servers: 2.5.0 renders `HOME 5`, 2.3.2 renders `HOME3` - label
and number flush, and the strap's dark block running some 200 px too far. Flex `gap` shipped in
Chromium 84. So 2.3.x is not "broken", it is *subtly wrong*, which is worse on air: it renders, so
nobody checks. That is the tier `PLAYOUT_COMPATIBILITY.md` §2 already calls unsupported, now with a
measurement behind it instead of an inference.

**3. A channel restart drops the layer on both versions, and one command brings it back.** `SET 1
MODE 1080p2500` empties the channel - layer 10 and layer 20 both - on 2.3.2 and on 2.5.0 alike.
Re-issue the same `CG 1-20 ADD`, touch nothing on the dashboard, and the graphic returns **at its
live state** (the score that was on air, not the cue's authored value), because the renderer rebuilds
itself from the durable log. A full server `RESTART` behaves the same way. That is the §8.7 line: the
URL does not survive the restart, the ON-AIR STATE does, and the recovery costs the operator one
command.

**4. Two ways to put a black frame on air by accident.** An output URL whose production is
unpublished or mistyped renders the "Output not available" card, and that card is **opaque**: it
covers the programme video completely. And unpublishing a production does NOT take it off the
channel - the last frame stays up until somebody presses Out or sends `STOP`. Neither is a bug, both
are worth knowing at a desk.

## Beat A6, and the one way to get it wrong

`npx @noacg/cli caspar agent` held a real AMCP socket for the studio page, and **Put on air** sent
`PLAY 1-20 [HTML] "…"`, got `202 PLAY OK` back from CasparCG 2.3.2, and the row said `✓ On 1-20`. The
same agent round-tripped `VERSION` against 2.5.0. Nothing about that path was version-specific.

The trap is the origin. The button sends the output URL **of the page it is pressed on**, so pressing
it on a dev server sends `http://localhost:5221/output?…` - a Vite dev bundle, untranspiled ESM,
which Chromium 71 cannot parse. AMCP still answers `202`, the row still says `✓ On 1-20`, and the
channel stays empty. The product cannot tell: the one command it sends succeeded. Press it on
`https://noacg.studio`, where the built bundle is `es2017` with the shims in `output.html`, and the
same production airs. Both frames are in the walk.

Measured 2026-09-10 on this laptop, CasparCG 2.3.2 (`4de6d18f Dev`) and 2.5.0 (`69e8ad5 Stable`),
screen consumer, 1080p5000. Branch `claude/bh-caspar-real-server`.
