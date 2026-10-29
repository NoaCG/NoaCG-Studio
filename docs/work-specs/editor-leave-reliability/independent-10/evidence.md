# Tenth check facts

These are bounded JSON observations printed by independent Actions jobs, read through the GitHub job-log connector. They are facts from red tests, not a claim that those tests passed. The two fresh unedited cases fail; the edited control passes. All source and carried-file equality checks are documented in the receipt.

## Fresh challenge, initial corrected Actions job

[Run 39126381198, job 117672279521](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126381198/job/117672279521).

tenth-timeout.json

```json
{
  "mode": "without another edit",
  "before": {
    "graphicId": "fdc59c68-f9c4-42e5-9605-72b284eb517d",
    "dirty": false,
    "status": "idle"
  },
  "afterTimeout": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "afterAdoption": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "sourcePreserved": true,
  "homeAsked": 1,
  "question": "Unsaved changes\n✕\n\n“Tenth gamma” has unsaved changes. Save them before continuing?\n\nCancel\nDiscard changes\nSave first…",
  "winnerUnchanged": true,
  "records": 2
}
```

tenth-timeout.json

```json
{
  "mode": "after another edit",
  "before": {
    "graphicId": "f890a8fe-ea55-4d5d-80ec-eaef37b16c37",
    "dirty": true,
    "status": "idle"
  },
  "afterTimeout": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "afterAdoption": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "sourcePreserved": true,
  "homeAsked": 1,
  "question": "Unsaved changes\n✕\n\n“Tenth gamma” has unsaved changes. Save them before continuing?\n\nCancel\nDiscard changes\nSave first…",
  "winnerUnchanged": true,
  "records": 2
}
```

## Fresh challenge, final real-time job

[Run 39126488754, job 117672606522](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126488754/job/117672606522).

tenth-timeout.json

```json
{
  "mode": "without another edit",
  "before": {
    "graphicId": "4baede49-db58-4175-b524-6ebe071d6070",
    "dirty": false,
    "status": "idle"
  },
  "afterTimeout": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "afterAdoption": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "sourcePreserved": true,
  "homeAsked": 1,
  "question": "Unsaved changes\n✕\n\n“Tenth gamma” has unsaved changes. Save them before continuing?\n\nCancel\nDiscard changes\nSave first…",
  "winnerUnchanged": true,
  "records": 2
}
```

tenth-realtime.json

```json
{
  "clock": "real wall time, no clock injection",
  "before": {
    "graphicId": "b356688f-c5b0-44c4-be4e-7052a9ba8fa3",
    "dirty": false,
    "status": "idle"
  },
  "waitedMs": 10492,
  "afterTimeout": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "afterAdoption": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "exactSourcePreserved": true,
  "homeAsked": 1,
  "afterReload": {
    "graphicId": "b356688f-c5b0-44c4-be4e-7052a9ba8fa3",
    "dirty": false,
    "status": "idle"
  }
}
```

tenth-timeout.json

```json
{
  "mode": "after another edit",
  "before": {
    "graphicId": "222e4ae1-14d0-47cd-9ab9-20cd81bb552d",
    "dirty": true,
    "status": "idle"
  },
  "afterTimeout": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "afterAdoption": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "sourcePreserved": true,
  "homeAsked": 1,
  "question": "Unsaved changes\n✕\n\n“Tenth gamma” has unsaved changes. Save them before continuing?\n\nCancel\nDiscard changes\nSave first…",
  "winnerUnchanged": true,
  "records": 2
}
```

## Unchanged ninth checker

[Run 39126381198, job 117672279624](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39126381198/job/117672279624).

c-overlap.json

```json
{
  "mirrorHasBeta": true,
  "betaIsReserved": true,
  "conflicts": 1,
  "failures": [],
  "acted": [
    "hold L"
  ],
  "status": "Saved",
  "linkAfterSave": {
    "graphicId": "e23305b8-2e50-48e5-9d92-ce6e360acfbc",
    "dirty": false,
    "formatIssues": [],
    "status": "idle"
  },
  "slot": {
    "graphicId": "e23305b8-2e50-48e5-9d92-ce6e360acfbc",
    "dirty": false
  },
  "library": [
    {
      "id": "c9f9ae1e-8c16-42f0-9c99-757dc9db6f57",
      "name": "Alpha"
    },
    {
      "id": "e23305b8-2e50-48e5-9d92-ce6e360acfbc",
      "name": "Beta (conflicted copy)"
    }
  ],
  "linkAfterReload": {
    "graphicId": "e23305b8-2e50-48e5-9d92-ce6e360acfbc",
    "dirty": false,
    "status": "idle"
  },
  "saveNamed": 0,
  "alphaUnchanged": true,
  "libraryFinal": [
    {
      "id": "c9f9ae1e-8c16-42f0-9c99-757dc9db6f57",
      "name": "Alpha"
    },
    {
      "id": "e23305b8-2e50-48e5-9d92-ce6e360acfbc",
      "name": "Beta (conflicted copy)"
    }
  ]
}
```

v-reservations-newer-version.json

```json
{
  "shape": "newer version",
  "listBeforeReload": "{\"version\":2,\"ids\":[\"kept-by-a-newer-build\"]}",
  "linkAfterReload": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "records": 2,
  "mintedHoldsRequested": true,
  "newerListKept": "{\"version\":2,\"ids\":[\"kept-by-a-newer-build\"]}"
}
```

v-superseded-refused-by-localStorage.json

```json
{
  "shape": "refused by localStorage",
  "conflicts": 1,
  "linkHere": {
    "graphicId": "98f9c036-9b5e-4162-8e1f-fdb5b22e3a58",
    "dirty": false,
    "formatIssues": [],
    "status": "idle"
  },
  "otherLink": {
    "graphicId": "98f9c036-9b5e-4162-8e1f-fdb5b22e3a58",
    "dirty": false,
    "status": "idle"
  },
  "otherSaveNamed": 0,
  "alphaUnchanged": true,
  "libraryFinal": [
    {
      "id": "6c56c82e-3227-418e-82f0-892d7d4c2c36",
      "name": "Alpha"
    },
    {
      "id": "98f9c036-9b5e-4162-8e1f-fdb5b22e3a58",
      "name": "Beta (conflicted copy)"
    }
  ]
}
```

c-pull.json

```json
{
  "conflicts": 1,
  "failures": [],
  "linkAfterPass": {
    "graphicId": "a6fae7c4-938f-4cf7-bbbc-1d70f26be03e",
    "dirty": false,
    "formatIssues": [],
    "status": "idle"
  },
  "slotAfterPass": {
    "graphicId": "27f90dd4-2fe9-4aa0-a571-cdea11642aef",
    "dirty": false,
    "holdsOtherDevice": true,
    "reservedIsOwnBefore": true
  },
  "library": [
    {
      "id": "27f90dd4-2fe9-4aa0-a571-cdea11642aef",
      "name": "Alpha"
    },
    {
      "id": "a6fae7c4-938f-4cf7-bbbc-1d70f26be03e",
      "name": "Beta (conflicted copy)"
    }
  ],
  "otherLinkAfterPass": {
    "graphicId": "a6fae7c4-938f-4cf7-bbbc-1d70f26be03e",
    "dirty": false,
    "status": "idle"
  },
  "linkAfterReload": {
    "graphicId": "27f90dd4-2fe9-4aa0-a571-cdea11642aef",
    "dirty": false,
    "status": "idle"
  },
  "editorHoldsOtherDevice": true,
  "editorHoldsMine": false,
  "otherLinkAfterReload": {
    "graphicId": "27f90dd4-2fe9-4aa0-a571-cdea11642aef",
    "dirty": false,
    "status": "idle"
  },
  "saveNamed": 0,
  "libraryFinal": [
    {
      "id": "27f90dd4-2fe9-4aa0-a571-cdea11642aef",
      "name": "Alpha"
    },
    {
      "id": "a6fae7c4-938f-4cf7-bbbc-1d70f26be03e",
      "name": "Beta (conflicted copy)"
    }
  ],
  "alphaUnchanged": false,
  "alphaHoldsMine": false,
  "copyHoldsMine": true
}
```

v-reservations-missing.json

```json
{
  "shape": "missing",
  "listBeforeReload": null,
  "linkAfterReload": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "records": 2,
  "mintedHoldsRequested": true
}
```

v-superseded-newer-version.json

```json
{
  "shape": "newer version",
  "conflicts": 1,
  "linkHere": {
    "graphicId": "59638cdf-631f-4c9f-ae24-4e0508a1208f",
    "dirty": false,
    "formatIssues": [],
    "status": "idle"
  },
  "otherLink": {
    "graphicId": "59638cdf-631f-4c9f-ae24-4e0508a1208f",
    "dirty": false,
    "status": "idle"
  },
  "otherSaveNamed": 0,
  "alphaUnchanged": true,
  "libraryFinal": [
    {
      "id": "48e10278-cecd-4427-915e-c9587ac4a304",
      "name": "Alpha"
    },
    {
      "id": "59638cdf-631f-4c9f-ae24-4e0508a1208f",
      "name": "Beta (conflicted copy)"
    }
  ]
}
```

v-reservations-corrupt.json

```json
{
  "shape": "corrupt",
  "listBeforeReload": "{\"version\":1,\"ids\":[",
  "linkAfterReload": {
    "graphicId": null,
    "dirty": true,
    "status": "idle"
  },
  "named": 1,
  "records": 2,
  "mintedHoldsRequested": true
}
```


## Byte-identical carry

Final probe `9459323e2b84841fbdea911ea7860811a3ff55e5`. All 21 paths below match `9bef784b73fa979d24fe254da1dbc156cb7ba342`; product source and maintained matrix/helpers match `1ac6093aff11d14d4f9fcbb9f01e209d0ee4be91`. Git diff exits zero over both path sets.

| Path | SHA256 |
| --- | --- |
| `.github/workflows/configured-suite.yml` | `4715c208bd66fdff55b24a650e84f0ade04a05242992a24e6778ead2dea417da` |
| `.github/workflows/deploy-verify.yml` | `9896411ecef04158f22d10b98e820ca27501031ae4886808837f0598b180123c` |
| `e2e/configured/leave-eighth-device.spec.ts` | `a1a991e028777160ac90ceb446cdf8d02f9d8c65498a3ac114e29e69ccf28d51` |
| `e2e/configured/leave-ninth-device.spec.ts` | `dbeb98bede72ae22a1fe70b2dbe7cfbda4e15c7250cdf15dc79acf2a14e0de86` |
| `e2e/configured/leave-probe.spec.ts` | `1e3eccd9f359d96fa49122845dbe52af71467a413f250825d60f5dc5b9c45364` |
| `e2e/interaction-checker-nested.spec.ts` | `b8712d8315ca77679e2baaf7c6f8ef912cfe07b8839adf8ef2a3c61d2db5753e` |
| `e2e/interaction-probe-task.spec.ts` | `2f0c5e44483c58829f6cc18a59f9f3aeeb237e6fd6f2f0ccc9148010f021251f` |
| `e2e/leave-checker.spec.ts` | `28988d718686064e747d2bcda910d8d9a23b2fd62d3609ee044963780952d982` |
| `e2e/leave-eighth-checker.spec.ts` | `5f64b001034b780b0f3cc55f19a2aa26fffbc48cbd95072a9864e123668fe8c5` |
| `e2e/leave-fifth-b1-bounded.spec.ts` | `32b0d289b4f2798b4d37766b2d91b34b73ba1df3f515c0c06629e77b73718d53` |
| `e2e/leave-fifth-checker.spec.ts` | `145756a70880f2b3d2394e01650e37932f40c9f2c1592de04cd89c568f708f51` |
| `e2e/leave-fifth-diag.spec.ts` | `933d4b8e33258cf396edb11ee1e94a6fea795bae4415c1b1e9d59ee75a0efbb3` |
| `e2e/leave-fourth-checker.spec.ts` | `953172315c885923c32c90c0fd5cf6ff050fc07378f03dc288a4c519e7ca9abd` |
| `e2e/leave-ninth-checker.spec.ts` | `2e8fdba7d45b65a67649a4ce13cefe10707db157834b9af183079c1e92e00307` |
| `e2e/leave-reference-fifth.spec.ts` | `bae58ddbd1743207a6c2acc29004a82bc7f34dfd441369d193c5b415c3d23d7e` |
| `e2e/leave-reference-fourth.spec.ts` | `2447cef0eb2455da65fb0208fc83f30b55c49d6505f714f0f93adac67910d9cd` |
| `e2e/leave-reference.spec.ts` | `8aaf0a47cb11f261f07515b739d2e69c4b8e18a7178dcdaa5bb8c14372f403b3` |
| `e2e/leave-second-checker.spec.ts` | `ef78c1eb394c0c24abd7766a850c5dc980424eb6ca74cbf7bde0467226c8b162` |
| `e2e/leave-seventh-checker.spec.ts` | `352905b1322a11278a412969e6d31d40c782beb56ae3c7842b88e676f2f10262` |
| `e2e/leave-sixth-checker.spec.ts` | `0b5207f22bd73a9a3f3e98b5c46489ca851d9532f8df190045b6a770f9605c7d` |
| `e2e/leave-third-checker.spec.ts` | `71f8378b2bbb5ab00736c7811e51ac3b2ed4741f0ce28d2561039c929b0f1dab` |

## Independently fetched reference source hashes

These match the fresh reference-run log and earlier receipts. Every Studio file is also byte-identical to release `a1e9776120fa19d9f3f9d40ab4b10ae1be034347`.

| Reference / file | SHA256 |
| --- | --- |
| studio `apps/editor/src/panels/Menubar.tsx` | `8818c8ea961a2c69b88d75ffdeccfd0299d1bec4db01d3513b9c97cce278f1d5` |
| studio `apps/editor/src/state/fileIO.ts` | `ccb0eea8ab5e2a238aa2f326a2415599594a64c08c610361524bcd6b2e6c31c3` |
| studio `apps/editor/src/state/fileIO.test.ts` | `ce0ab6a442c82b1d366a35bbcf5ee0a3c6081010aee444ed262bb5599a0da030` |
| studio `apps/editor/src/state/projectStore.ts` | `a52fce8b17aadc063d36416cca5cf6517fd50b7ae695d910dd3657b36a8855df` |
| studio `apps/editor/src/state/projectStore.test.ts` | `2ff9abf9d0c21d147405d5b33275f33b00c459780ce12e6fff935ad950764d31` |
| studio `apps/editor/src/state/projectTimelineSync.test.ts` | `0edb4a4b86122a2f9a77a8ef6d7e32f1d4a776782188d71fc40082aec2585250` |
| studio `apps/editor/src/state/useAutosave.ts` | `7bde16c9d20ba7b44551116dbad372c4720542ae6568db929826756674ee9a46` |
| studio `apps/editor/src/canvas/Stage.tsx` | `20dab164db68b8f81e175f1f5892fcf009915e6c55a1246fbcd20b9b23cd628f` |
| studio `apps/editor/src/canvas/LayerNode.tsx` | `6f3ab3f58e42bc1ed6079564384a942bd8965b33964af35d47caf03696a9f859` |
| studio `apps/editor/src/state/historyStore.ts` | `21895f00b23025d889a5908d6aaa7c19e375b8f15ac66f44d8dd1e725acf76e8` |
| eyevinn `src/main.js` | `f64d086d1d9ed0a519ba14ad5c007ebdfdc7f77bd4f8e9102073f2248d0a7943` |
| eyevinn `src/services/TemplateManager.js` | `294be36dc53b92319c8bc3c2627e1f4138fa60c574a791ac4c539975080c9a2a` |
| eyevinn `src/models/OGrafTemplate.js` | `81bb9ea35762beb9158ea64b78314ec454bd687ddacf2e7d471b6a8011a18c55` |
| eyevinn `src/components/VisualEditor.js` | `0ffd159b5f7f56989beed3abd04ccdd1191d60a42c1181c48be1de0c9491e40a` |
| eyevinn `src/components/PropertyPanel.js` | `5ed93cad5b40ae4142f7ddb3ac9898aead86c4d9a0635e0fb1c098181ff1ba68` |
| eyevinn `test/bugfix-model-io.test.js` | `2947ff09946a6916b990f05fcb7a1a6588023a3f80d09e22acaccbcd193ea9b2` |
| eyevinn `test/ograf-lifecycle.test.js` | `8f102ad3b76cd0e92cf7c59d554062016bb94e36b5ee9d74201260d2a10631e5` |

## Local visual measurements

The unchanged carried spec produced these facts. Screenshots were opened, rather than inferred from test success.

| Task | CSS content | Canvas height | Timeline height | Inspector width | Outputs |
| --- | --- | --- | --- | --- | --- |
| desktop | 1920×1080 | 534.203125 | 334.796875 | 280 | SPX, CasparCG, OGraf; no errors |
| laptop | 1366×768 | 317 | 240 | 280 | SPX, CasparCG, OGraf; no errors |
| actual-125 | 1093×545 | 196 | 180 | 280 | SPX, CasparCG, OGraf; no errors |
