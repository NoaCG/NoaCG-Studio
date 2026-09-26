---
v: 2
source: derived
kind: finding
raised: 2026-09-16
state: unstarted
found: "The proof case's playout is SPX. The door that keeps the control profile - the output embed - has never been run against a real SPX server, and the door that has been proven - the SPX starter export - deliberately carries neither combined controls nor shared data."
serves: NOW
size: small
touches: src/export/outputEmbed.ts, src/export/targets/spxStarter.ts
needs-owner: none
---
# Which door into SPX the proof case uses, and what it costs

**Filed:** 2026-09-16. **Source:** the owner's answer to ALIGN-2026-09-15-6, recorded in
the retired owner rulings, derived into `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5a item 2.

## Why

The proof case runs on SPX. That is one fact about a room, and it lands on a seam this
repository already knows about. NoaCG has two ways into SPX and they hand the operator
different products:

- **The output embed** (`src/export/outputEmbed.ts`) is one SPX-legal file whose body is the
  production's own output URL. SPX's Play and Stop move the frame; every cue, the combined control
  and the shared production data stay with the NoaCG operator. This is what the proof case wants,
  because the follow-along score updating live IS the point. It has never been run against a real
  SPX server - `docs/acceptance/owner-queue/2026-08-25-spx-output-embed-on-a-real-spx-server.md`
  has been open since 2026-08-25.
- **The SPX starter export** (`src/export/targets/spxStarter.ts`) is the strictest export gate we
  have and it is proven, but by `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6f it carries fields and the
  default path only: no combined controls, no data tree. Falling back to it in the room silently
  removes the "one press: Reveal, then the +1s" the whole profile was built for.

Nobody has compared the two on the proof case, so the choice would be made in the room, by whoever
is standing there, in front of the people watching.

## What it would take

**This receipt is the OFFLINE half only, and it needs nobody.** Take the two proof-case graphics
(`e2e/fixtures/agent-made/vote-show.noacgpack.json`), export the production through both doors,
and write down exactly what an SPX operator gets from each: which fields, which buttons, what
happens to a combined control, what happens to a `+1` on a bound field, and what the embed asks of
the room's network. The answer is derivable from the code, it has never been derived, and §6f is a
sentence rather than a walked result. Half a day, and it ends in a recommendation.

**The hardware half is not this file's ask.** Running the embed on a real SPX server needs the
owner's machine and is already the owner-queue item
`docs/acceptance/owner-queue/2026-08-25-spx-output-embed-on-a-real-spx-server.md`, open since
2026-08-25. That item stands as it is; this file exists so the CHOICE it settles is made before
the room rather than in it.

## Evidence

- the retired owner rulings ALIGN-2026-09-15-6, 2026-09-16 - the playout is SPX, and the point is
  how easily the graphic is made.
- `docs/CONTROL_PANEL_ANY_GRAPHIC.md` §5a item 2 (what the proof case needs) and §6f (what a
  downloaded package deliberately does not carry).
- `src/export/outputEmbed.ts`, whose own header says SPX is the case it exists for and that it
  holds the output capability only - a template able to operate the show would have to carry the
  control slug onto a playout machine.
- `docs/ACCEPTANCE_SPX_CASPARCG.md` - the only SPX walk we have, on the lower-third fixture, by
  hand.
