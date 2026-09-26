# AC-6 - COMBINE sends one row per step, shows its wait, and reports a dropped step

**Verdict: pass.** The gap that held this at `unverified` is closed: a combined control has now
been rendered, greyed, ticked, pressed, counted down and cancelled on the HOSTED control page,
against a real backend, and every claim about what a press sent was read off the durable log with
the server's own timestamps. Re-reviewed at `0079711f8557a3d9db8cd956c7b54533a395ffd1` on 2026-09-16.

## What changed since the previous reading

The previous receipt said, correctly, that every clause was observed in-app and pinned by specs
except the one that matters most on the night - "nobody has ever seen a combined control render on
the hosted page". That surface needs a published `control_shows` row, a real command log and a
resolve, so no offline spec can mount it and no linked worktree can publish to it.

`e2e/configured/hosted-control-profile.spec.ts` puts the walk where both halves exist: the
configured suite, whose runner brings up its own Supabase stack and its own throwaway account. The
proof case is imported, a profile carrying an ARRANGE and this control is published, and the
capability URL is opened signed out, as an operator would.

## What the run observed, on the hosted page

`configured-suite` run `35062005497` on `claude/hk-hosted-half-configured`: **43 tests, 43 passed, 0
failed, 0 flaky, 0 skipped**, the walk itself in 19.2 s.

The control: `reveal` on the votes board, then `Panelist 2 +1` on the totals board marked
`after 5 s` and `ask` ticked, then `Panelist 3 +1` marked `ask` ticked.

- **It renders here, in its own section.** `hosted-actions-combined` carries the button reading
  "⚡ Reveal, then the points", below the graphic's own sections.
- **It greys on its FIRST step, with the reason.** Before either cue was taken the button was
  disabled and its title read exactly
  `Greyed because the first step cannot go: “Votes board” is not on air` - the first step's
  graphic and no other, which matters because a walk's later steps are routinely illegal at the
  moment its first one is pressed.
- **The ticks are offered in the operator's words.** Two labels,
  `Panelist 2 +1 on Totals board` and `Panelist 3 +1 on Totals board`, both checked - the declared
  label behind its section, because five of that graphic's controls read "+1". Not `plus2`.
- **The wait counts down on the button**, `· 5s` down, with `pd-combined-waiting` on it.
- **One command row per step, in order, on the graphic each step names.** With Panelist 3 unticked,
  the log gained exactly two rows: `Votes board:event:reveal`, then `Totals board:event:plus2`.
  The unticked step sent nothing.
- **The wait was really waited.** The two rows' own `created_at` differ by at least 4 s against a
  declared 5 - measured on the server's clock, not the browser's, so the figure is not the
  surface's opinion of its own timer.
- **The cancel stands the tail down.** Pressed again while counting, the feed carries
  `“Reveal, then the points” cancelled, 2 steps not sent`, and after waiting out the whole 5 s the
  steps would have run, the log still holds only the reveal. This is the half that has to work
  under pressure and it had no witness on this surface before.

## What the rig cannot reach, found by trying it

The first draft of the walk asserted that the cancelled press had spent the votes board's arrow, so
the button greys on its first step again. **It does not, and that is the product working.** This
page judges an event's LEGALITY against the graphic's last REPORT, and `control_report` is called
only by the receiver injected into a real renderer (`src/control/hostedReceiver.ts`). The walk
opens no output URL, so no report ever arrives and every machine stays at whatever state its boot
resolve gave it.

So the greying's two halves split by what this rig can reach, and the spec says so where it stops:

- the **liveness** half - "“Votes board” is not on air" - is asserted here, because the page reads
  that off the wire's own cue rows;
- the **legality** half stays pinned offline over the published bytes (`e2e/hosted-control.spec.ts`
  drives `isEventLegal` through `hostedCombineNow` for a spent state) and in-app, where the page's
  own PROGRAM stage is a renderer and does report.

It is worth knowing outside this receipt: **a hand-walk of the hosted page with no output window
open sees every machine frozen**, and that reads like a fault rather than like a missing renderer.
The owner-queue item's route now says to open the output URL for exactly this reason.

## What still pins the rest

- `e2e/production-controls.spec.ts` (22 passed at the previous review) holds the in-app DOM,
  including "a step the machine would drop is dropped alone, and the feed says which".
- `e2e/hosted-control.spec.ts` (12 passed, job `j-1147`, re-run on this branch) holds this page's
  own resolution over the PUBLISHED bytes: the wire baseline against the cue's, the dropped step,
  the greying, a take feeding its own next step, the batch seam.
- The exported controller's one line (§6f) is pinned by `e2e/exports.spec.ts`.

## Limitations worth carrying

- **The DROP has not been seen on this page's feed**, only its resolution over the published bytes
  and its rendering in-app. Making the machine refuse a step against a real backend means driving
  a graphic into a state mid-press, which this walk does not do.
- **Two operators, and the batch cap**, are still unwitnessed anywhere - steps 10a and 10b of the
  live-verify checklist in `docs/CONTROL_LAYER.md`. One spec holds one page. The multi-operator
  claim (a delayed step counting from the WIRE rather than the cue) is pinned as a rule offline
  and is the strongest remaining candidate for a second hosted case.
- **Nothing persists a wait.** A tab reloaded mid-countdown loses the unsent tail by design (§6d),
  and the button's hover says so. Whether that is acceptable for the first showing is the one question
  still on the owner's route, and it is the expensive one to change later.
- A patch step can be stored and sent but not composed: the composer authors no values, which is
  what keeps it from becoming a payload editor.
