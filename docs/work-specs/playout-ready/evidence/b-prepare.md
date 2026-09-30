# Landing b: Prepare for Live (AC-8 to AC-11)

2026-10-01, the owner's Windows laptop, the local Supabase stack (every migration in the tree),
never production.

## What ran

- **Unit** (`node --test scripts/prepare-live.test.mjs scripts/readiness.test.mjs`): 17 of 17.
  When an output has finished preparing (ready on the target; a change that failed or waits for
  air, answering this very request; gone past the threshold; not a moment after leaving), the
  checklist lines, the stamp and its words ("Ready for Live, checked 14:02 (v12)", "Checked 14:02
  on v12, 1 change since", the warnings and problems counted), the prepare request reader, and the
  Bridge and CasparCG lines (nothing configured, nothing said; a Bridge down; the layer holding
  this production, another one, or nothing; clips missing, named; a library that cannot be listed).
- **Offline e2e** (job j-2743, `e2e/output-prepare.spec.ts` with `output-ready` and `live-path`):
  11 of 11. The real renderer over a stood-in backend: a change that throws while preparing leaves
  the output on its version ("failed", naming Frost Quiz) with no reload and only the running
  frames on the stage; every change prepared and nothing on air, it reloads onto v2 by itself and
  never acts on the same request twice; with a graphic on air it keeps its version ("waiting",
  one on air); asked for the version it holds, it only checks again.
- **Configured e2e on the local stack** (j-2744): `live-prepare.spec.ts` and `live-ready.spec.ts`,
  2 of 2. Prepare for Live with nothing unpublished says so before the press, stamps "Ready for
  Live, checked hh:mm (v1)", the header reads "Ready for Live · 1 of 1 output · checked", the phone
  shows the same stamp; an edit makes the stamp read "Checked hh:mm on v1, 1 change since" and the
  note say the changes will be included; the next press publishes v2; with the output closed the
  stamp reads "Not ready, checked hh:mm (v2): 1 problem".
- **Four real hosts at once**, the built bundle served from this checkout (a small static server on
  127.0.0.1:5399), production "Host Walk" of the teammate account: CasparCG 2.5.0 and 2.3.2 from
  scratch configurations, the OBS test collection, and vMix's blank session with a browser input
  added through its API (the owner's own collection, profile and settings untouched, as in
  `a-readiness.md`).
  1. Modern Strap (optional chaining, which Chromium 71 cannot parse) removed, Prepare for Live:
     "Published your changes as v2", all four reloaded onto v2 within seconds, stamp "Ready for
     Live, checked 01:55 (v2)", header "● Ready for Live · 4 of 4 outputs · checked 01:55".
  2. Modern Strap added back, Prepare for Live: v3; CasparCG 2.5.0, OBS and vMix prepared the one
     change and reloaded onto v3; CasparCG 2.3 built it in a hidden frame, met the SyntaxError,
     and kept running v2: "CasparCG 2.3 1-20: Ready · 1 change not prepared: Modern Strap (script
     error)". Stamp "Checked 01:56 (v3): 1 warning".
  3. House Scorebug taken, the failing change removed, Prepare for Live: v4; the three outputs on v3
     read "Behind: showing v3 · v4 is prepared, but 1 graphic is on air here", none reloaded under
     the graphic on air; CasparCG 2.3, whose v2 renders exactly what v4 does, read "Ready for
     playout" without moving.
  4. **Found here and fixed:** after Out, pressing again finished at once with the last run's
     "waiting" answers, because they named the same version. Each answer now carries the request
     it answers (`ChangePrep.id`) and a run waits only for its own. Re-run on the rebuilt bundle
     (v5, v6): taken, changed, pressed ("Behind" on all four), Out, pressed again: "Preparing 0 of
     3" on all four as they reloaded, then "Ready for Live, checked 02:06 (v6)", 4 of 4.
- **NoaCG Bridge 0.7.0** from this branch's source (`node cli/dist/playoutEntry.js`, scratch
  `APPDATA`), paired from the studio page, connected to the CasparCG 2.5.0; the server's media
  scanner run from a scratch folder (without it CLS answers 501, and the check says it could not
  list the clips, with the Bridge's reason). Three server cues added (a still that exists, a clip
  that does not, a template that exists under another case). Prepare for Live: "NoaCG Bridge and
  CasparCG answer (CasparCG 2.5.0)", "Layer 1-20 holds this production's output", "1 clip the
  rundown cues is not on the server: intro-missing", "Every template the rundown cues is on the
  server (1)"; stamp "Not ready, checked 02:11 (v7): 1 problem". Put on air then aired
  `…/output?production=PO6yFcfOw9E6&name=CasparCG%201-20` (read back with `INFO 1-20`): the new
  output announced itself as "CasparCG 1-20", the one it replaced read "CasparCG 2.5 1-20 not
  answering (41 s)" in red, and Forget cleared it.
- **Screenshots** (session scratchpad `shots/`): `prepare-desk-1920-stamp`, `prepare-phone-390-stamp`,
  `prepare-desk-1920-not-ready`, `prepare-hosts-desk-1920-panel` (four hosts, 2.3's change not
  prepared), `prepare-hosts-phone-390-panel`.

## Limits

- The Prepare for Live stamp lives in the production page's browser and on the live topic; a
  hosted page opened while no production page is open shows no stamp.
- The Bridge checks ran against CasparCG 2.5.0 only.
