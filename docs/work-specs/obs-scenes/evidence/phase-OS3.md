# OS3: Monitoring, settings and the settled export, evidence

Acceptance AC-6, and the settled export and guide of AC-12 (`docs/work-specs/obs-scenes/spec.md`).
Rules M1 to M11 are in the spec's phase notes. Also in this phase: #2474 (M10) and #2454 (M8).
Simulated checks only: nothing here is OBS hardware proof.

## Per clause

| Clause | Changed behaviour | Proof |
| --- | --- | --- |
| AC-6: each scene row shows loaded, not loaded, connected, unknown before any event, preview, program | `sceneRows` (`src/control/obsSceneRows.ts`) over the Presence entries of scene links; `ObsSceneRows` under the switch (`src/components/home/PlayoutPanel.tsx`) | `scripts/obs-scene-rows.test.mjs` "M3, M4" and the random walk against an oracle from M3's words; `e2e/configured/live-ready.spec.ts` "OBS scene rows" (real Presence, a link page sending `obsSourceVisibleChanged`, `obsSourceActiveChanged`, `obsSceneChanged`); `e2e/playout-folders.spec.ts` "one row per scene" (Not loaded, Not yet seen) |
| AC-6: loaded twice | Two or more instances of one scene's link read amber | Node "M3, M4"; the configured walk opens the link in a second browser |
| AC-6: stale presence after the page goes away | Not answering (age), grey then red after 15 s, the tick kept | Node "M3, M6"; the configured walk closes the link's browser |
| AC-6: "seen in OBS scene" after a walk-through | The link reports `seen` (M5), a shared source in each OBS scene (D9) | Node "M5" (OBS's order, a cut away never ticked, a shared source ticked once it stayed, bounded); `e2e/output-scene-link.spec.ts` "reports every OBS scene"; the configured walk |
| AC-6: the settings section shows each link with Copy; Copy all copies every link with its scene name; the guide link | `ObsScenesSettings` in Playout settings (M7) | `e2e/playout-folders.spec.ts` "one row per scene": links before and after an output link, the clipboard after Copy and Copy all, the guide's address |
| AC-6: more than 16 outputs refused in words | The expected list stops at 16 and the Outputs section says so; Playout settings says so past 16 scenes (M9) | Node "M9"; `e2e/playout-folders.spec.ts` "more than 16 scenes" |
| AC-12: the settled option draws at rest from load, no entrance, no automatic Out, no reaction to OBS's show and hide | `settledAutoplayScript` (`src/export/targets/htmlOverlay.ts`), for scene graphics of the production's overlay package (`src/export/showExport.ts`), offered in the export dialog while the switch is on (M11) | `e2e/exports.spec.ts` "html overlay, settled": every frame probed for a running entrance, with today's file as the contrast that shows one; OBS events and a 500 ms `out` change nothing; a panel Play is settled too. `e2e/playout-folders.spec.ts`: Settled offered on the overlay target only, scene graphics settled, Hand (no scene) as today, the README lists each scene's files, unticked as today |
| AC-12: the guide explains the fallback group | `docs/OBS_SCENES.md` | Read it; indexed in `docs/README.md` |
| #2474 | An unresolved link asks again, 2 s doubling to 30 s, then boots (M10) | `e2e/output-scene-link.spec.ts` "opened before its production is published": open, publish, Take; and publish, open, Take |
| #2454 | Switching off with a link loaded asks first, naming how many go empty; Cancel keeps it on (M8) | Node "M8"; the configured walk (asked with a link loaded, Cancel; not asked with none); `e2e/playout-folders.spec.ts` (not asked when nothing can be loaded) |

## For the owner in OS7 (not proven here)

Simulated events are not hardware proof. In OBS, confirm:

1. Each scene row through the walk-through: Not yet seen, then "Seen in OBS scene" after cutting to it.
2. A shared source (Add Existing in two OBS scenes): a direct Cut between them ticks both names.
   This rests on OBS keeping such a source active across that cut, which was never measured.
3. Preview and Program on a row follow Studio Mode.
4. Closing a source (or OBS) reads Not answering, and a refresh brings the row back to Ready.
5. The settled fallback group: network off, empty browser caches, each group shown, graphics placed
   and settled with their fonts and images (AC-12's owner half).

## Mutation checks run locally

- "Loaded twice" only from three instances: two Node tests fail. Restored.
- A pending shared-source name kept after the source leaves program: the M5 test fails. Restored.
- The 16-output cap removed: the M9 test fails. Restored.
- The settle removed from a settled file's play: `e2e/exports.spec.ts` "settled" fails with "no frame
  of an entrance". Restored.

## Checks run

- Node: `scripts/obs-scene-rows.test.mjs` (7), `obs-scenes` (10), `readiness` (15), `obs-scene-copies` (19), all pass.
- Browser, on this cloud machine through the job queue: `e2e/exports.spec.ts`,
  `e2e/playout-feedback-health.spec.ts`, `e2e/output-first-paint.spec.ts` and
  `e2e/playout-folders.spec.ts` whole (95 pass); `e2e/output-scene-link.spec.ts` whole (6 pass).
- `npm run gates -- run --changed origin/main`, `tsc --noEmit` and ESLint on the changed files: clean.
- E2E capacity: warns (backend tier at 94%), does not refuse.

## Not checked here

- The configured walk in `e2e/configured/live-ready.spec.ts`: CI's configured selection.
- `check-e2e-protection`: its base copy has no dependencies on this machine; CI runs it.
- OBS itself: OS7.
