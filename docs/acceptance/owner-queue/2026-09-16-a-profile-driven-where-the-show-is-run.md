---
kind: walk
date: 2026-09-16
because: taste
serves: now
---
# A control profile, driven on the page the show is run from

The gap the last walk left is closed. A production carrying an ARRANGE, a combined control with a
delayed step and two ticks, and three fields bound to production data is now published and driven
on the HOSTED control page - the surface you hold on 2026-10-20 - and the whole walk
runs in CI on every landing from here on, against a real Supabase stack and a throwaway account.

Until today nobody had ever seen a profile on that page, on any machine. The in-app page had it,
the offline suite had the rules underneath it, and the one surface that matters on the night had
neither.

## The evidence, if you only want one line

`configured-suite` run 35062005497 on `claude/hk-hosted-half-configured`:
**43 tests, 43 passed, 0 failed, 0 flaky, 0 skipped**, and the
profile walk inside it took 19.2 seconds.

## Route, about three minutes, and it needs the cloud

Signed in, from a checkout that carries backend configuration (a linked worktree has none - that
is what stopped this last time):

1. Home -> **Productions** -> **Import a package** -> `e2e/fixtures/agent-made/elamani-biisi.noacgpack.json`.
   You land on the production page with two cues: Votes board on layer 7, Totals board on layer 8.
2. **CONTROLS** at the foot of the cue editor. Pin **Panelist 2 +1**, and hide **New game** with a
   rename to `Reset the board`. Then **+ Combined control**, name it `Reveal, then the points`,
   and give it three steps: `Votes board` -> `Reveal performer`; `Totals board` ->
   `Panelist 2 +1`, **after 5 s**, **Ask, ticked**; `Totals board` -> `Panelist 3 +1`,
   **Ask, ticked**.
3. **Data** -> bind `Votes board` **Panelist 1** and `Totals board` **Name 1** to
   `panel.katri.name`, and `Totals board` **Points 1** to `panel.katri.points`. Set the two
   values to `Katri` and `0`.
4. **Publish**, then open **both** published links: the `?control=` one to operate from - a phone
   is the honest test, a second browser window the quick one - and the **output** URL in a third
   window, which is what a renderer would be on the night.
5. On the hosted page: **⟳ TAKE** the first cue, click the second cue, **⟳ TAKE** it.

Open the output URL even if you do not care about the picture. A graphic's machine state reaches
the control page only as a REPORT from whatever is rendering it, so with nothing on air the ⚡
buttons never grey or un-grey on state - only on whether the cue is up. That is the design, and
without a renderer open it reads like a fault.

## What to look at

- **The ⚡ block is arranged, not generated.** Panelist 2's +1 sits above the section headings and
  has left its own section, which now holds only its −1. `More (1)` at the foot opens on
  **⚡ Reset the board** - your word, on the machine's own control, still greying and un-greying
  with the graphic exactly as the visible ones do.
- **Before either cue is on air the combined button is grey and says why**, naming the FIRST step's
  graphic and nothing else. A walk's later steps are routinely illegal at the moment its first one
  is pressed, and the button must not report that as a fault.
- **Two ticks, both on, in the operator's words** - "Panelist 2 +1 on Totals board", not `plus2`.
  Untick the one who guessed wrong and press. The reveal goes at once, the button counts `· 5s`
  down, and only the ticked point lands when it reaches zero. Open **Activity**: one row per step,
  in order, on the same log every Take lands on.
- **Press it again while it counts down.** That is the cancel, and it is the half that has to work
  when something goes wrong on air: the tail never goes and the feed says how many steps did not.
  ■ Out does the same.
- **Points 1 has no box to type in.** It is bound, so it reads out instead, and the ± beside it
  moves the PRODUCTION's value rather than this graphic's field. Press **+**: the figure moves on
  air, and it moved because the tree moved - which is what makes a score entered once show
  everywhere it is bound rather than be overwritten by the next shared write.
- **Change Katri's name in the Data tab** and both boards follow it, each with its own row, because
  both are bound to that one leaf.

## What is measured rather than claimed

The walk asserts what the WIRE holds, not what the page believes it sent. The press is optimistic
and the button renders before the round trip, so every claim about what a press did is read back
off the durable command log with the server's own timestamps - including the wait, which is
measured as the gap between the two rows rather than from a browser clock. Rows that are traffic
ABOUT a press rather than the press itself - another operator's staging, a renderer reporting its
state - are dropped first, or "one row per step" would mean nothing.

The walk's own wall clocks, from that run: publish **0.3 s**, both cues on air **0.4 s**, the
combined press to its last row **6.0 s** of which **5.0 s is the wait you asked for**, and the
bound **+1** to its row **0.1 s**. Read them as a floor: the runner's database answers in about
a millisecond where your cloud answers in about two hundred, which is why publishing reads at a
fifth of a second here and took about five in the in-app walk. What they do establish is that
nothing in the profile road adds a wait of its own - the only delay in the minute is the one the
production asked for.

## What still has no witness

Three things from the live-verify checklist in `docs/CONTROL_LAYER.md` step 10 that one spec with
one operator cannot reach, and they are the ones to walk by hand before 2026-10-20:

- **Two operators on one production.** A press counts down only in the tab that pressed, but every
  row lands in both feeds - and a delayed step must carry the OTHER phone's figure plus one,
  because it reads the wire at the moment it fires.
- **The batch cap.** A control whose steps expand past eight wire items must send in several
  batches rather than lose the whole press.
- **A reload mid-countdown**, which loses the unsent tail by design.

The last one is still the question worth a sentence from you, and it is the expensive one to
change after October: **is a wait that dies with a browser reload acceptable on the surface the
show is run from?** Nothing is retried behind anybody's back today, and the button's hover says so.

## The receipt this closes, and the one question it carried

`docs/backlog/elamani-biisi-own-control-panel.md` - your ask of 2026-09-14, "a graphic that brings
its own control panel" - is deleted with this change, which is what the shelf does with a served
receipt. All ten rows of the plan's §5 landed between 2026-09-15 and 2026-09-16, and all ten
acceptance criteria now pass.

One line of it was not work and so is carried here instead of dropped: **whether the boards air
through Yle's own playout on the night, or are shown on the NoaCG player.** Everything built
assumes the player. If they air for real, the same rows reach Yle's playout through `/output`, and
proving that output moves ahead of anything else on the list.
