---
v: 2
source: owner
kind: ask
raised: 2026-08-29
state: parked
note: "owner: not to be built now - the hidden-until-opened heartbeat that ships is accepted"
asked: "a simple green healthy indicator whenever an output is relevant, plus an expandable technician view (paraphrase)"
---
# An always-visible output health light, with a technician's view behind it

**Filed:** 2026-08-29. **Source:** owner ruling, 2026-08-29 walk (the same walk that produced the
hidden-until-opened heartbeat now shipping in `ProductionPage.tsx`).

**NOT TO BE BUILT NOW.** The ruling explicitly accepts what ships today. This file exists so the
end state is not re-derived from scratch the next time somebody looks at the status chip.

## Why

Two different people are asking two different questions of the same indicator, and today's chip
answers neither one fully.

The **operator** wants to stop worrying. Their question is "is my graphic actually going to air?",
and the only answer that helps is a plain green *healthy* that is simply THERE, every time an
output is relevant - not something they have to go and check, and not something that appears only
after the system decides the question is worth asking. Anxiety is the cost being paid here: an
indicator you have to hunt for is one you do not trust, and an operator who does not trust it
watches the programme feed instead of the dashboard.

The **technician** wants something concrete. When it is not green they need to know WHAT is wrong
in terms they can act on, and a one-line tooltip cannot carry that. Giving them real numbers is
also what keeps the operator's light simple: every detail that would otherwise creep into the
headline goes behind the expander instead.

## What it would take

- **The light.** Always visible whenever an output is relevant to this production - green
  *healthy* when the renderer is reporting in, and an honest non-green otherwise. The current gate
  (`hostedSlug && (outputSeenAt || show.outputOpenedAt)`) is what makes it hidden-until-opened, and
  it exists for a real reason the replacement has to keep answering: publishing mints an output
  slug whether or not anybody wants an output, so "has a slug" cannot decide relevance, and the
  owner read "output not seen lately" as a fault when he simply had no browser source anywhere.
  The end state needs a better answer to *is an output relevant here*, not a removed gate.
- **The technician view**, expandable from the light, showing at least: connection and output
  state, latency / buffering, memory pressure, and dropped frames or errors. Most of that is not
  measured anywhere today - the renderer currently reports a heartbeat and nothing else, so this is
  a real addition to the output renderer's reporting (`src/output/`, `docs/CLOUD_PLAYOUT.md` §3)
  and to whatever carries it back, not just a UI change.
- Keep the existing rule that the words say what the state IS and the detail says what to do about
  it. That part of the current chip is right and should survive.

## Evidence

- `src/control/livePath.ts` - `describeOutputHealth()` (every reachable state and its wording),
  and `src/components/control/OutputHealth.tsx`, the line the production page
  (`data-testid="renderer-status"`, whose header gate carries the 2026-08-29 walk note about
  reading a false fault with no browser source set up) and the hosted page now share.
- Since 2026-09-30 (Phase 6 Step 1) a renderer reports more than a heartbeat: its engine, build,
  whether its log and command channels are joined, per-road counters and press-to-frame latency,
  in a Presence entry on `live-<show id>` once migration 0068 is on the server
  (`docs/CLOUD_PLAYOUT.md` §3). That is most of the data a technician view would show; the
  always-visible light and the expander are still not built, per the ruling above.
