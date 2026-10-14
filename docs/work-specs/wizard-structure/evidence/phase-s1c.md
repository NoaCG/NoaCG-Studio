# Phase S1c: defect decisions (AC-12)

Recorded by the S1c builder (branch `claude/plan-wizard-shell-p3-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `d8c967270`. The local browser queue was not used: free RAM stayed at
2.0 to 2.3 GB against its 4 GB floor, so every journey ran on CI.

## How each item was reproduced

One probe branch (`claude/plan-wizard-shell-p3-probe`, never landed) carried every reproduction
and characterisation journey on unfixed `d8c967270`, run by dispatch
(`gh workflow run ci.yml --ref claude/plan-wizard-shell-p3-probe -f diff_base=d8c967270...`):
run 38485638743, then run 38486142632 after one selector fix (the rail's format Change shares
its class with the kit's "All graphics" link). Each regression journey then landed with its fix
in its own pull request, whose CI ran it green; each was written first and seen red on the
unfixed code in the probe, which for the guard fix (R7) is also its mutation test: removing the
guard is the unfixed code.

## The eight items

| Item | Verdict | Reproduction | What it showed | Decision |
|---|---|---|---|---|
| S1 stale `importedFile` makes an empty walk held | reproduced | wizard-draft-guard, "a walk started over holds no dropped file" (and a probe-only "the ✕ alone") | `heldWalk` true after Start fresh over a dropped template file, and true after the ✕ rewind (`Expected: false, Received: true`, both runs) | fixed in #1146 (`e47c39627`): fresh open and rewind both clear the file and its error |
| S1b-1 Continue after a dropped template file lands on Entry | reproduced | wizard-draft-guard, "Continue keeps a dropped template file" (S1b's journey) | the import card is not on screen after Continue (`element(s) not found`; also S1b's run 38467355045) | fixed in #1149 (`ef2ca46ee`): a mode change starts the walk's furthest step at the step it happened on, not 0 |
| S2 Browse re-pick and the deep link keep `animation.steps` | reproduced (Browse); refuted (deep link) | wizard-shell, "a design picked again on Browse asks the steps question again" | Clean Steps' box unticked, Browse, Frost Checklist: the box stayed unticked (`Expected: checked, Received: unchecked`). The deep link starts from `initialDraft()`, so it had no answer to keep | fixed in #1151 (`2fee11e04`): Browse and the deep link send `steps: null` as the Template step does, so all three picks are one patch |
| S3 a deep link drops the production-context brand | reproduced | wizard-shell, "a deep link builds in the brand in force, and a fresh open takes none from the walk before" | opened for a production branded Signal Red, then `#/new/lt01`: the chooser named the brand and the preview's accent was Hairline's own (`Expected: "#e63946", Received: "#e8c547"`). Reachable without the rare one-shot pair: any brand in force when a link lands | fixed in #1154 (`cc888e7d0`): the link applies the brand in force exactly as the Browse pick; the open writes its choice to a ref because a warm link lands in the same commit as the open |
| S4 rewind keeps what fresh clears, and the reverse | decided | from the code, cell by cell (table in the phase notes) | two accidental differences: the dropped file (S1) and, within it, its error; everything else differs on purpose or is unobservable | the file's two fields fixed with S1 in #1146; the rest recorded as intended in the phase notes' table |
| S5a `editSummaryStep` bypasses `moveKitTo` in kit mode | refuted | wizard-kit, "a kit hub has no read-back rows, so no summary jump can skip recording a graphic" (passed, both runs) | the one-graphic Finish that calls `editSummaryStep` renders only when `!kit`; the hub has no summary rows | characterised, no `src/` change |
| S5b `revealFormatPicker` bypasses `moveKitTo` in kit mode | reproduced | wizard-kit, "the rail's format Change from a kit graphic keeps the edit made on it" | an edit typed on a kit graphic, the rail's Change, Next back to the hub: the graphic came back with its starter text (`Expected: "Kept across Change", Received: "READING"`). `reconcileKit` keeps the unrecorded draft | fixed in #1155 (`1b00addc0`): the fallback goes through `moveKitTo` in a kit |
| S5c `kitBusy` never reset on open | refuted | wizard-finish, "a kit save held across a close outlives it: the next walk waits for it, then it lands" (passed, both runs) | with the library write held, the kit door pressed, Home, Start fresh, a new kit built: its doors stay disabled; on release the first save lands and moves the reader to its production | characterised: `kitBusy` belongs to the save and its own `finally` clears it, so it cannot stick; a reset on open would let a second set save start while the first still writes |
| S1b-2 a reload of a non-template step URL does not land on that step | refuted (intended) | wizard-shell, "a cold open on a step only another walk has lands on Entry" (passed, both runs) | `images`, `template`, `design`, `prepare`, `text`, `template-file`, `create`, `video`, `kit`: each cold open shows Entry, no step counter | characterised: a reload keeps no walk's material (the file, the artwork, the AI thread, the kit are memory only), so Entry is the honest landing; the svg walk's `fields` resolving to the template walk's Fields is the existing template reload journey |
| S1b-3 a second press of the production door during a held save | reproduced, decided a defect | wizard-finish, "production door pressed twice while its save is held" | two productions named "Friday Show", each pooling the graphic (`+ Received + 6` lines against one production) | fixed in #1158 (`PR6SHA`): one press, one production, as the entry's New production; the S1b journey that pinned it "recorded, not endorsed" now asserts one production |

## Checks per pull request

Each fix pull request: `node scripts/check-file-budgets.mjs` (2,492, 2,494, 2,495, 2,504, 2,507 and 2,516 of 2,601 lines, the later ones including the svg-import-engine landings),
`node scripts/check-e2e-protection.mjs --changed origin/main` OK,
`node scripts/e2e-capacity.mjs --changed origin/main` 94% (table value, under the refusal line),
`node scripts/gates.mjs run --changed origin/main` green, eslint on the changed files, the AC-9
fence (`git diff --name-only origin/main...HEAD -- src` listing only
`src/components/wizard/CreationWizard.tsx`), then its CI and the merge group.

## Limitations

- No local browser run: every journey's evidence is CI's.
- `tsc` was not run locally (memory); each pull request's CI build ran it.
- The S3 fix's same-commit case (a warm deep link opening the wizard) is pinned by the second
  half of its journey; the cold case by the S1b deep-link journey.
- The held kit save's landing over a walk opened after it (S5c) is recorded as today's
  behaviour, not judged: the window needs a durable write held for seconds.
