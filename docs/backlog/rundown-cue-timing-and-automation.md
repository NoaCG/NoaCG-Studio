---
v: 2
source: owner
kind: ask
raised: 2026-09-24
state: unstarted
asked: "Cue duration with auto-advance options, and the other automation options we need to plan; start building after tomorrow's lecture (paraphrase, 2026-09-24)"
size: large
touches: src/model/shows.ts, src/components/home/ProductionPage.tsx, src/control/
covered-by: e2e/playout-cues.spec.ts
needs-owner: none
---

# Cue durations, auto-advance and the rest of rundown automation - plan, then build

**Filed:** 2026-09-24. **Source:** owner, after a comparison of NoaCG against other playout
clients. Start after the 2026-09-25 lecture. The FIRST deliverable is a plan he can read, because
he asked for the automation options to be planned before any of them is built.

## Why

A NoaCG cue has no idea of time. `ShowCue` in `src/model/shows.ts` is an id, a source, a label,
values and a note, so every Take and every Out is a click. MXMZ, Pixla, Cuez and Sofie all
auto-advance, and Rundown Studio, Ontime and Cuez back-time to a hard out. It is the gap the owner
would feel in every show he runs. The rest of the automation list comes from the "Show running"
table in `docs/LANDSCAPE.md`, checked against the code on 2026-09-24.

## What it would take

**Build first. Small, used every show.**

1. **A duration on a cue.** An additive optional field on `ShowCue`, in seconds, so the show
   record version stays 2. Blank means manual, which is how every existing cue keeps behaving.
2. **What happens when the duration runs out**, chosen per cue:
   - *Out*: the graphic or clip goes off by itself.
   - *Next*: the next cue in the rundown takes.
   - *Out and next*: both, in that order.
   A server clip may use the clip's own length when the server reports it (CasparCG `CLS` gives
   frames and fps).
3. **The operator sees the clock.** A countdown on the live row, one key to hold or cancel the
   auto action, and the next cue marked as armed.
4. **The timer lives in the command log, not in the page**, so a phone, a second operator and a
   reload all see the same deadline, and a recovery never fires a stale auto-take twice. The match
   clock already anchors to epoch time (`src/control/matchClockWire.ts`), which is the pattern.

**Plan, then decide which to build.** Each gets a paragraph in the plan: what it is, who has it,
its size, and whether it is for the owner's productions or for a TV station.

5. **Back-timing to a hard out**, once cues have durations: the rundown total, over/under against
   a target end time.
6. **A running order from a spreadsheet into CUES.** `src/model/csv.ts` already parses CSV, TSV
   and JSON, but lands the rows in a dataset.
7. **A Bitfocus Companion module**, so a Stream Deck shows what is on air and works from a second
   machine. Today there are keyboard shortcuts only, and they need the window focused.
8. **Audio cues**: a stinger or bed fired from the rundown. A clip on the CasparCG server already
   carries audio. A sound on its own does not exist yet.
9. **An as-run log**: what aired, when, and for how long, exportable. The cloud command log is
   pruned after 7 days today.
10. **Linked cues**: one Take fires a graphic and a clip together, for example a sting plus a
    lower third.
11. **Switcher automation (ATEM).** Filed as "gap-wrong" in `docs/LANDSCAPE.md`. The plan says
    whether that still holds once NoaCG is an OGraf client.

MOS or newsroom ingest and Sofie-style multi-device timelines are TV-station features. The plan
names them and leaves them out, unless the owner says otherwise.

## Acceptance

- The plan, as a doc the owner reads before code starts. The first build is items 1 to 4.
- For items 1 to 4: a Playwright spec that takes a timed cue, watches it go out and the next
  take, reloads mid-countdown and sees the deadline survive, and a hold that stops the auto action.
- An owner-queue file with the route.

## Evidence

- `ShowCue` has no duration: `src/model/shows.ts`, checked 2026-09-24.
- The competitor rows: `docs/LANDSCAPE.md`, "Show running".
- Clip lengths from the server: `ListItem.frames` and `fps` in `src/control/playoutProtocol.ts`.
