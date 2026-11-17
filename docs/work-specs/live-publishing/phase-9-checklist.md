# Phase 9: the owner's final check

The run did every check it could on its own (spec, "How the agent tests and measures"); what is
below needs real hardware, the studio, or a judgement only the owner makes. Nothing here was counted
as passed. Each step says what to do in the studio and what you should see. Write "ok" or what you
saw beside each, and the run closes from that.

Before you start: the newest build is live, and in production `auto_publish` and `partial_writes`
are still off. Steps 1 to 9 run as production is today. Step 10 is the decision whether to switch
either on; steps 11 and 12 are only for after that.

## 1. CasparCG 2.5 with a browser output beside it (AC-7)

1. Open a typical production (about 20 graphics) on the production page. Publish it.
2. Load its output in CasparCG 2.5, and open the same output in a browser on another screen.
3. Take, update and Out a lower third, a scorebug and a stepped graphic, Next through its steps.
4. You should see: both pictures move together; the light goes green only after both outputs ran
   each command; the server cue plays through NoaCG Bridge.

## 2. CasparCG 2.3 is no worse than before (O11)

1. Do step 1 again with CasparCG 2.3 (its Chromium 71) instead of 2.5.
2. You should see: every graphic plays as it did before this run; nothing missing, no new pause.

## 3. A Take of a graphic the output is still loading (D1, S4)

1. On CasparCG 2.5, then on 2.3: add a new graphic to a published production and press Take at once.
2. You should see: the cue shows "Loading" and the graphic comes on when loaded, with its entrance
   if that took under 5 s.
3. Make it take longer than 5 s (a large production, or a slow line), Take again.
4. You should see: the graphic comes on without its entrance, without a flash and without its
   sound, and the light names it.
5. Press Out, then All out, and delete a graphic, each while a Take of it is still loading: it never
   appears, not even briefly.
6. Judge D1: the run measured 7.6 s on the large fixture on a throttled line (parts on), against the
   5 s ceiling. Is that acceptable on your hardware and network?

## 4. An output restarts while a Take is held

1. Take a graphic that is still loading, and restart the output machine (or reload CasparCG's
   template) before it appears.
2. You should see: after the restart the output shows what is on air, and the light is not green
   until it does.

## 5. The light on the studio network

1. Run a short show from the production page with every output in use.
2. Pull the network cable of one output for 20 s, then plug it back.
3. You should see: the light leaves green while that output cannot report, names it, and turns
   green again by itself once it has run what was pressed. A data feed alone never turns it amber.
4. Repeat 1 on a slow line (a phone hotspot, or about 20 Mbit/s). The run timed the light only on
   an unthrottled line (phase 5): note how long it takes to turn green after a Take.

## 6. A Take never waits (AC-1)

1. With a mouse, then on a touch screen: type into a cue's field and press Take at once (also Next,
   a quick button such as Goal, and a live number's +1).
2. You should see: the graphic goes on air with the typed text, without a pause.
3. Type into a cue, press Take, and reload the page straight away, with the output on a slow link.
4. You should see: the text is still there after the reload.
5. A physical panel (Stream Deck or a hardware panel through NoaCG Bridge): Take, Next and Out.
   The Bridge's commands work without a health request before each one.

## 7. Two operators typing on a large production (#2494)

1. Open a large production (about 60 graphics) on two computers, each signed in as a different team
   member. Both type into different cues for a minute, without pausing, while a third person takes.
2. You should see: the Takes stay prompt, each person's text ends up in the production, and neither
   overwrites the other's cue.

## 8. vMix

1. Add the output as a browser input in vMix. Take, update and Out on several layers.
2. You should see: the same picture as the browser output.

## 9. Five people at once in the studio (AC-6)

1. Five people, each signed in to their own account, on one team production: one takes, one adds
   messages (Interaction, Paste, then Prepare cue), one uses a quick button, two edit different cues
   at the same time. One reloads their page once; one turns their Wi-Fi off for 20 s and on again.
2. You should see: every Take airs, every Goal counts once, every message becomes a cue, each edit
   stays on its own cue, and nobody finds a "(conflicted copy)" anywhere.
3. The run's numbers (local backend, one machine) are in `evidence/phase-8.md`; a hosted backend
   and the studio network can differ.

## 10. Decide: switch on automatic updates and partial writes?

Both switches are per stack (the `system_settings` rows `auto_publish` and `partial_writes`), and
each goes on only once `auto_publish_state()` or `partial_writes_state()` reports
`installed: true` on production. Close these first:

- #2502: automatic updates on a team production need their own Node test and configured step.
  Phase 8's five-person spec drives a team production with automatic updates on, which covers the
  end-to-end half; the Node test of `confirmedRevision`'s team branch is still owed.
- #2557: a parts publish compares only the stamp number, so a stale stamp could land after an
  unpublish. Close it before `partial_writes` goes on.
- #2562: on one account, an edit after another device's edit can go to a conflicted copy and never
  publish. Phase 8's five accounts did not meet it (it needs the same account on two devices).
- #2586: the team walk "two accounts" in `e2e/configured/teams.spec.ts` fails whenever
  `partial_writes` is on (it expects the older asset key form), so the team asset path is unchecked
  in that state. Close it before `partial_writes` goes on.
- #2589: seven or more people typing into one team production at once fall behind on saves (the
  text stays on screen with a note; the record catches up slowly). It came with #2573; without it
  the saves keep up. Close it, or decide that it is an acceptable limit, before relying on many
  people editing at once.
- #2565 and #2572: two ways an edit on a shared production was lost (one while the page read
  teammates' changes, one when any change made elsewhere discarded the cue being typed). Phase 8 met
  both and they were fixed (#2567, #2573); step 9 is the studio check of those fixes.

Then judge the recorded gaps: AC-4 on the large fixture (+125 ms pooled p95 during publishing,
against 50 ms) and D1 (step 3). Decide: switch on, switch on for some productions first, or keep off.

## 11. After switching on: changes reach the outputs by themselves (AC-4)

1. Edit a cue's text, add a graphic and remove one, with no press.
2. You should see: the outputs follow within seconds; the light shows amber "Updating outputs" and
   then green. Close the page with a change not yet published, open it on another computer, and the
   change publishes.
3. An output opened before the switch reads amber "Reload <output> when nothing is on air" until
   you reload it with nothing on air.

## 12. After switching on: a graphic updated while on air (O3)

1. Update a graphic's design in the production while it is on air.
2. You should see: the light stays green with "<graphic>: new design at next Take"; the next Take
   shows the new design; nothing changes mid-air.

## Not part of this check

A hosted load test, a full CasparCG 2.3 rig, and taking graphics without the internet (spec,
"Non-goals").
