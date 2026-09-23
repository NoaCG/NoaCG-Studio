---
kind: walk
date: 2026-09-23
because: direction
serves: now
---
# Playout settings open from the production page, with the connection's state on the button

The production header has a **Playout** button with a status dot: hollow when no Bridge is
paired, green when CasparCG answers through NoaCG Bridge, amber when the Bridge is not running,
red for any other fault, with the words in the tooltip and beside the dot on a wide screen. It
opens **Playout settings**: which system the page drives (CasparCG through NoaCG Bridge, the only
one today, listed from `src/control/playoutSystems.ts` so a second system is one more entry), a line
saying OBS and vMix need no setup beyond the output link, a link to the Bridge on the Downloads
page, and then the SAME form as Settings -> Playout. It is one form and one stored record, so what
you type in one place is in the other.

The page only asks the Bridge anything once one is paired, so an OBS-only user never meets a
local-network prompt from this.

## The route, under a minute

1. `/app#/home/productions` - open any production and press **Playout** in its header.
2. Change the CasparCG server's address, close, open Settings from Home: the Playout section shows
   the same address.

**What to look at.** Whether a new user can answer "how do I connect this to what plays my
graphics?" from this one dialog. Branch `claude/intelligent-gates-rlo5fp`.
