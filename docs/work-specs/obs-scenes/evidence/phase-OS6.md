# OS6: The Live dock, evidence

Acceptance AC-11 (`docs/work-specs/obs-scenes/spec.md`). Rules K1 to K10 and their amendments are in
the spec's "OS6" phase notes. Nothing here is OBS hardware proof: the dock inside OBS is the owner's
in OS7 (the checklist below).

## Per criterion

| AC-11 says | Changed behaviour | Proof |
| --- | --- | --- |
| At 300 px wide | `/app#/dock/<id>` draws the production page as one 300 px column, nothing wider (K1) | `e2e/playout-folders.spec.ts` "the Live dock at 300 px" (page `scrollWidth` at most 300) |
| the dock signs in | It is the production page: an account production signed out shows the sign-in prompt in place, as there; OS2 confirmed sign-in inside an OBS Custom Browser Dock (email and password, kept over an OBS restart) | `e2e/configured/panel-lease.spec.ts` "the Live dock beside a production page" opens the dock in a browser of its own after signing in; OS2 receipt |
| answers Companion | The dock is a production page to the panel lease, labelled "Live dock"; every key runs through the page's own dispatcher, and the dock shows the selection those keys act on (K2) | configured: a `select-cue` press runs on the dock and its "Selected:" line follows |
| hands it over through "Use here" when a production page is also open | Beside the answering production page it takes nothing and says who has it; Use here moves the panel, under a newer claim, and the production page then says "Live dock answers" | configured, same test |
| keeps it after a reconnect | Network and Realtime sockets cut for 8 s (under the 15 s lease), then back: same page id and claim, presses run, the production page took nothing | configured, same test |
| Takes and Outs the program scene's graphics | Each shown scene's cues with Take (off air, not refused) and Out (on air), the press a Companion cue key makes (K4); on program the row names the scenes shown | offline journey: Take, on air, Out, off air, on the picked scene. Which scene is on program is proven in Node only (`dockScenes`, fed the OS3 rows); the dock following OBS's program scene is OS7 row 16 |
| falls back to a picked scene while OBS state is unknown | No scene on program: the picked scene, first by default (K3) | offline journey (no OBS events offline: "Picked"); Node `scripts/live-dock.test.mjs` K3 cases and a 2000-step walk against the rule as written |
| sets the break deadline as a full time | In 2 min, In 5 min and Set write an ISO date and time with this computer's offset to the path bound to a countdown's start time (K7) | offline journey (the written value read back); Node: offsets, summer time, the skipped and repeated hours, a second press from now, impossible dates refused. Not tested: the write refused on a published production without its data key (the current match's refusal, now one shared `writeTree`) |
| picks the current match | Each source's line as the data panel draws it, the bracket source's picker included, through the same pick road (K8) | offline journey: a Sheet source's line on the dock, read, paused and resumed. The picker itself is OS5b's `SourceLine` part, shown on a bracket source with matches; it is not drawn on the dock in a test here (a bracket read needs the server), so the dock's pick is OS7 row 5 |
| Its controls do not move when the program scene changes (behaviour) | The scenes are the last section; the health line is one line; a note shows below everything; a skipped time says so in the value's own row (K5) | offline journey: the deadline section's position before and after a pick (the order of the sections); the rest by construction, and OS7 row 16 |

## Run here

- Node: `scripts/live-dock.test.mjs` (8 tests), with `interaction-questions` (router), `obs-scenes`,
  `scene-join`, `obs-scene-copies`, `obs-scene-rows`, `playout-system`, `ograf-typed-writer`,
  `e2e-affected`: all pass.
- Browser, through the job queue: `e2e/playout-folders.spec.ts` and `e2e/output-scene-link.spec.ts`
  (64 passed); the dock journey alone after each fix.
- `npm run gates -- run --changed origin/main`, `tsc`, ESLint: clean. `check-e2e-protection`: OK.
  E2E capacity: warns, does not refuse (edits to existing specs).
- Not here: the configured lease walk (CI's configured selection runs it) and OBS itself (OS7).

## OS7 checklist (owner, on the laptop)

The production with its scene links loaded in OBS, published, the Companion module paired. The
Live dock: Playout settings, OBS scenes, **Live dock**, Copy; in OBS, Docks, Custom Browser Docks,
paste it, sign in with email and password.

AC-14:

1. Every scene walked through once and its row ticked ("Seen in OBS scene").
2. A shared source (D9, "Add Existing" in two OBS scenes) holding a running countdown: ten direct
   Cuts between two scenes that both hold it, no old frame. Its row ticks both names.
3. The stinger's start, its cut point and the source's "on program" event, ten times (`&debug=1`
   on one scene link shows the event).
4. Every hand-made or imported event graphic rests on air when taken, not in its exit pose.
5. The dock and the Companion keys used through a run of the show: Take and Out of the program
   scene's graphics, In 2 min, In 5 min and Set on the break countdown, the current match picked.
6. Network off, a source refreshed, then the fallback group shown.
7. A source killed and refreshed back within 10 s.
8. OBS restarted, every scene back within 2 minutes (and the dock still signed in).
9. The Stream Deck unplugged and the dock used instead.
10. The bracket feed paused, its last values held.

From OS3 (simulated there, never in real OBS):

11. Scene rows in real OBS: Not yet seen, then Seen after cutting to the scene; Preview and Program
    follow Studio Mode; a closed source reads Not answering and a refresh brings it back to Ready.
12. The settled fallback group per scene: network off, empty browser caches, each group shown,
    graphics placed and settled with their fonts and images (AC-12's owner half).

From fix #2489:

13. Add a graphic to a scene and publish: with no Take, its scene source shows it settled within
    about 20 s. Taken out by hand, it stays out after the next publish.

From OS5b:

14. The bracket source set with round order "Highest round number first": the final draws last.

From #2475:

15. Browser source memory over a run of two hours or more, read from Task Manager or OBS stats at
    the start and every 30 minutes. An agent on the laptop can run this unattended, as in OS2.

The dock itself (AC-11's owner half):

16. The dock at its OBS width: nothing cut off, its controls stay put when OBS changes the program
    scene, and the shown scene follows OBS's program scene.
17. The production page open in a browser beside it: the dock takes nothing until Use here, then
    answers Companion; the production page says "Live dock" answers.

### Receipt template

```
OS7 receipt
OBS version:
Machine (CPU, GPU, RAM):
1. Every scene walked through, rows ticked:                         pass/fail
2. Shared source, 10 direct Cuts, old frames seen (pass = 0):       pass/fail (value: )
3. Stinger start / cut point / on-program event, 10 times:          (information)
4. Event graphics rest on air when taken:                           pass/fail
5. Dock and Companion keys used through the show:                   pass/fail
6. Network off, source refreshed, fallback group shown:             pass/fail
7. Source killed and back within 10 s:                              pass/fail
8. OBS restarted, every scene back within 2 min, dock signed in:    pass/fail
9. Stream Deck unplugged, dock used instead:                        pass/fail
10. Bracket feed paused, last values held:                          pass/fail
11. Scene rows in real OBS (walk-through, preview/program, gone):   pass/fail
12. Settled fallback group, network off, empty caches:              pass/fail
13. #2489: added graphic settled within about 20 s, out stays out:  pass/fail
14. Bracket with "Highest round number first":                      pass/fail
15. #2475 browser source memory over 2 h or more (MB at 0/30/60/...): (values: )
16. Dock at OBS width, controls still, follows program:             pass/fail
17. Use here beside a production page:                              pass/fail
Each drill recovered by the owner alone:                            yes/no
Notes:
```
