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

> **Local check, 2026-11-17: ok.** Both pictures matched at all 22 captures; green came 0.9 to
> 1.1 s after each press, after the browser output had moved (0.16 to 0.6 s); the server clip
> played through the Bridge 116 ms after Take. Owner: one look at the pictures is still owed.
> Evidence: `evidence/phase-9-local/notes.md` (step 1), `s1-c25-*`, `s1-bridge-server-cue-log.txt`.

## 2. CasparCG 2.3 is no worse than before (O11)

1. Do step 1 again with CasparCG 2.3 (its Chromium 71) instead of 2.5.
2. You should see: every graphic plays as it did before this run; nothing missing, no new pause.

> **Local check, 2026-11-17: failed.** The output in CasparCG 2.3.3 logs `Uncaught (in promise)
> TypeError: e.matchAll is not a function` 1.4 s after each load and never joins ("still loading");
> a Take airs on the browser output only and 2.3 stays empty. `String.matchAll` needs Chrome 73.
> Whether 2.3 worked before this run was not checked. Evidence: `notes.md` (step 2),
> `s2-c23-casparcg-log.txt`, `s2-c23-lt-take-*`, `s2-c23-after-load-caspar.png`.
>
> **Rerun, 2026-11-20, after #2605: pass.** No error in the 2.3 log; the output joined 10.3 s
> after Load; Take, Update and Out reached the picture in at most 0.12, 0.17 to 0.47 and 0.40 to
> 0.69 s. 2.5 unchanged. Evidence: `notes.md` (Step 2 rerun), `s2-c23-rerun-casparcg-log.txt`.

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

> **Local check, 2026-11-17: ok on 2.5 for points 1 to 5; 2.3 not run (step 2 failed).** Taking a
> just-added graphic without Publish changes goes red "it is not published" (automatic updates are
> off). After Publish changes: under 5 s it came on with its entrance (1.3 s); over 5 s the cue
> showed LOADING, the light named it, and it cut in at its final state 11.0 s later, no flash. Out,
> All out and delete while loading: never appeared on either output. D1 for you to judge, large
> production, browser output on 20 Mbit/s: 6.6, 8.9 and 12.9 s (CasparCG unthrottled 1.8 to
> 2.7 s); for the 12.9 s credits roll the light was green 3.4 s before the browser picture
> appeared. Evidence: `notes.md` (step 3), `s3a-*` to `s3d-*`.

## 4. An output restarts while a Take is held

1. Take a graphic that is still loading, and restart the output machine (or reload CasparCG's
   template) before it appears.
2. You should see: after the restart the output shows what is on air, and the light is not green
   until it does.

> **Local check, 2026-11-17: failed on the light's timing.** Both restarted outputs then showed
> what was on air, but green came before the restarted output drew it: 0.35 s early on the
> reloaded browser output, about 1 s early on CasparCG after its template was reloaded.
> Evidence: `notes.md` (step 4), `s4a-*`, `s4b-c25-burst-*` (file names carry the grab time).

## 5. The light on the studio network

1. Run a short show from the production page with every output in use.
2. Pull the network cable of one output for 20 s, then plug it back.
3. You should see: the light leaves green while that output cannot report, names it, and turns
   green again by itself once it has run what was pressed. A data feed alone never turns it amber.
4. Repeat 1 on a slow line (a phone hotspot, or about 20 Mbit/s). The run timed the light only on
   an unthrottled line (phase 5): note how long it takes to turn green after a Take.

> **Local check, 2026-11-17: ok, with gaps.** Cable pull emulated on the browser output (offline
> 20 s; CasparCG shares the page's machine). After a press: amber at 5 s naming "Chrome 157",
> red at 15 s, green by itself 0.93 s after reconnecting, output caught up. With nothing pressed it
> stayed green for the 6 s before the first press. Data feed not run (no feed configured). Slow
> line, 20 Mbit/s: green 0.97 to 1.10 s after each of 10 presses. Also: an output that vanished
> without leaving stayed "Reconnecting…" and held the light grey "Confirming…" with "(0 s)" for
> over a minute, never amber. Evidence: `notes.md` (step 5 and setup), `s5-after-reconnect-*`,
> `s1-page-stale-output-confirming.jpg`.

## 6. A Take never waits (AC-1)

1. With a mouse, then on a touch screen: type into a cue's field and press Take at once (also Next,
   a quick button such as Goal, and a live number's +1).
2. You should see: the graphic goes on air with the typed text, without a pause.
3. Type into a cue, press Take, and reload the page straight away, with the output on a slow link.
4. You should see: the text is still there after the reload.
5. A physical panel (Stream Deck or a hardware panel through NoaCG Bridge): Take, Next and Out.
   The Bridge's commands work without a health request before each one.

> **Local check, 2026-11-17: ok with a mouse; touch screen and physical panel not run (owner's).**
> Typed then clicked TAKE at once: on air with the typed text in 0.5 s; Next, the quick button
> and +1 all landed (score 0, 1, 2). Typed, TAKE, F5 at once with the output on 1 Mbit/s: the text
> was still there and on air. Seen on the way: "The rundown changed elsewhere. Undo history was
> cleared." with nobody else editing. Evidence: `notes.md` (step 6), `s6-*`.

## 7. Two operators typing on a large production (#2494)

1. Open a large production (about 60 graphics) on two computers, each signed in as a different team
   member. Both type into different cues for a minute, without pausing, while a third person takes.
2. You should see: the Takes stay prompt, each person's text ends up in the production, and neither
   overwrites the other's cue.

## 8. vMix

1. Add the output as a browser input in vMix. Take, update and Out on several layers.
2. You should see: the same picture as the browser output.

> **Local check, 2026-11-17: ok.** vMix 29 Browser input on overlay 1, counted as a third output:
> lower third and scorebug on separate layers, Update, Out, quiz Take and Next, All out all
> matched the browser output. Evidence: `notes.md` (step 8), `s8-*-vmix.png` beside `s8-*-browser.png`.

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
- #2589: seven people typing into one team production at once fell behind on saves (the text stays
  on screen with a note; the record catches up slowly; seven is the only count measured). It came
  with #2573; in one 8-minute run without it the saves kept up. Close it, or decide that it is an acceptable limit, before relying on many
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
