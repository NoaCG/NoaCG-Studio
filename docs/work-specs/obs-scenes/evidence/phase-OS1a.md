# OS1a: The scene link, evidence

Acceptance AC-1, AC-4 and AC-5 (`docs/work-specs/obs-scenes/spec.md`). Rules R1 to R12 are in the
spec's phase notes. Simulated checks only: nothing here is OBS hardware proof (that is OS2 and OS7).

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| AC-1: three scenes of two graphics each build two graphics per scene link | `src/output/sceneScope.ts` `scopePayload`, applied in `src/output/main.ts` at boot and in the preparer's resolve | `scripts/obs-scenes.test.mjs` (each of three scenes builds its two, keeps the production's resolution and version); `e2e/output-scene-link.spec.ts` test 1 (the real `/output` shell builds `B1`, `B2` only, READY 2 of 2) |
| AC-1: through publish, reconnect and reload | The preparer's resolve scopes every publish it takes; a reload boots through the same scoping; the follow and its refills read past every row outside the scope (R6) | `e2e/output-scene-link.spec.ts` test 1: a publish moves `B2` out of the scene and it leaves though on air; a reload builds `B1` alone. Reconnect: the follow's rows go through the same `apply` guard as the boot catch-up rows the spec feeds; a live topic is configured-suite ground and is not run here (see "Not checked") |
| AC-1: a graphic removed from a scene disappears from its link | A graphic outside the scope is never on air on the link (`onAirHere`), so it leaves at the publish, on air or not, and holds neither a swap nor a whole-page reload (R6) | `e2e/output-scene-link.spec.ts` tests 1 and 3 (a publish that also changes the stage size reloads onto the new scope); `scripts/obs-scenes.test.mjs` "removed from the scene" |
| AC-1: an unknown or deleted scene id builds none and reports itself as unknown | `scopePayload` answers `known: false` and no graphics, never the whole production; READY carries a `scene` issue (not ready, worded); Presence carries `scene.known: false` | `scripts/obs-scenes.test.mjs` (unknown, empty, malformed, deleted, switch off); `e2e/output-scene-link.spec.ts` test 2 (nothing built, READY `scene` issue, Presence `known: false`, still nothing after a publish with no scenes, built once a publish names it) |
| AC-1: the ordinary link builds every graphic, as today | `scene === null` keeps every guard true and the payload untouched (R4) | `e2e/output-scene-link.spec.ts` test 1 (all six); the regression selection below |
| AC-4: first visible frame is the resting state, no entrance | A scene link's stage posts `play` with `settled`; the composed document plays and snaps to the reached pose in the same task (`src/preview/composeDocument.ts` `settleOnAir`); OGraf gets `skipAnimation` | `e2e/output-first-paint.spec.ts` "a scene link's settled Take": every frame of lt01's document is fingerprinted; after a settled Take the first frame drawn is the resting one, and an ordinary Take of the same design draws entrance frames (the control) |
| AC-4: a change while hidden, and a re-Take after Out, without entrance | Every Take on a scene link is settled, whatever OBS shows | same file, "a re-Take after Out is drawn settled too" |
| AC-4: continuous motion keeps running | The snap arms timers and re-adopts loops, as a restart's snap does | same file, ss21: the playhead and the countdown keep moving after a settled Take. Mutation: pausing GSAP after the snap fails it (readings all 0) |
| AC-5: switch off, everything as today | No scene control, no payload field, no change to the ordinary link's code path (R4, R10) | `e2e/playout-folders.spec.ts` "OBS scenes" (off: no menu item, no `scenes` in the payload; on: a scene with its graphic, never its server clip; off again: the flag kept and nothing published); the regression selection below; the full suite in CI |

## Mutation checks run locally

- The `apply` guard removed (`src/output/main.ts`): `e2e/output-scene-link.spec.ts` test 1 fails, another
  scene's graphic `A1` is reported by the scene link. Restored.
- GSAP paused after the settled snap: the ss21 continuous-motion test fails. Restored.
- `onAirHere` without the scope (the final `/so`'s finding): `e2e/output-scene-link.spec.ts` test 3 fails, the
  reload waits on a graphic that left the scene. Restored.
- The snap with `timers: false` still passes the ss21 test: the loop and the countdown run without the
  machine's timers, so that test does not pin timers; `timers: true` stays because it is what a
  restart's snap uses.

## Local runs

- `node --test scripts/obs-scenes.test.mjs scripts/readiness.test.mjs`: pass (10, 15).
- `npm run gates -- run --changed origin/main`: 354 tests pass.
- `npx tsc --noEmit -p tsconfig.json`, eslint on every changed file: clean.
- Queued browser runs: `e2e/output-scene-link.spec.ts` (2 pass), `e2e/output-first-paint.spec.ts -g settled`
  (3 pass), `e2e/playout-folders.spec.ts -g "OBS scenes"` (pass).
- Regression selection (AC-5), one bounded run: `e2e/output-prepare`, `output-ready`, `output-first-paint`,
  `output-boot-resilience`, `output-typed-recovery`, `output-scene-link`, `playout-folders` and
  `publish-output-setup`: 112 passed in 6.2 min.
- `node scripts/e2e-capacity.mjs`: warnings only (93% of capacity, +0.4 min); `check-e2e-protection`: OK.

## Not checked here

- A live topic reconnect against a real backend: the configured suite is CI's (its selection is in the
  PR's CI run). The offline spec proves the scoping of every row the follow can deliver, because the
  follow, the refill and the catch-up all go through the same `apply`.
- OBS itself: whether OBS draws the settled frame without an old one (AC-13's stale-frame drill), and
  the OBS events' real order, are the owner's in OS2.
- Whether an imported OGraf package honours `skipAnimation`: the standard requires it; no package
  fixture was run for it.
- A hand-written template with no state machine whose one timeline is enter, hold, exit: a settled
  Take jumps every finite animation to its end (R9), so it would land in its exit pose, and a hide on a
  timer would fire at once. No catalog design is built that way (every house template has a machine).
  The owner checks any such event graphic in OS2 (checklist item 6).

## Placeholder production for OS2

Made in NoaCG in about ten minutes, no event graphics needed:

1. New production "OBS scenes test". Playout panel: switch **OBS scenes** on.
2. Add 24 catalog graphics (any lower thirds, bugs and scorebugs), two per scene, each in one scene
   only: until OS1b a graphic in two scenes shares one air state (spec R12).
3. Select each pair of cues and **New folder**; name the folders after your OBS scenes ("Gameplay",
   "Desk", ...). In each folder's ⋯ menu choose **OBS scene**.
4. **Publish**, then Take every cue once. Copy each scene link from its folder's ⋯ menu (**Copy scene
   link**).
5. In OBS, in each matching scene, add a Browser source with that link: 1920 × 1080, 60 fps, "Shutdown
   source when not visible" off, "Refresh browser when scene becomes active" off.

## OS2 checklist (owner, on the laptop)

Studio Mode on, a fade of 100 ms or more as the default transition (D9). Stats open, counters reset,
game capture, cameras and encoding running, every scene's source loaded.

1. 20 minutes of cutting between scenes through Studio Mode preview.
2. Stale frame: change a value while its scene is hidden, then take that scene ten times through
   Studio Mode preview, ten times with the default transition, ten times with a direct Cut.
3. The stinger's start, its cut point and the source's "on program" event, ten times (the event shows
   on the output's debug overlay: add `&debug=1` to one scene link for this drill).
4. Sign in to NoaCG inside a Custom Browser Dock.
5. A load failure on the laptop: repeat it on the show PC before any decision.
6. Any event graphic not made from a NoaCG template (hand-written or imported): Take it on its scene
   link and check it rests on air, not in its exit pose.

### Receipt template

```
OS2 receipt
OBS version:
Laptop (CPU, GPU, RAM):
Scenes loaded (n of n, 1920x1080, 60 fps):
1. 20 min cutting - frames skipped (encoding lag):     pass/fail
   frames missed (rendering lag) <= 0.1%:               pass/fail (value: )
   average render time <= 8 ms:                         pass/fail (value: )
2. Stale frame, Studio Mode preview, 10 takes, old frames seen:  (pass = 0)
   Stale frame, default transition, 10 takes, old frames seen:   (pass = 0)
   Stale frame, direct Cut, 10 takes, old frames seen:           (information)
3. Stinger start / cut point / on-program event, 10 times:       (information)
4. Sign-in inside a Custom Browser Dock:                          pass/fail
5. Load failures, and the show PC repeat:
6. Hand-written or imported graphics rest on air when taken:  pass/fail
Notes:
```
