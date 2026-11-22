# Phase TL2 evidence: runtime compatibility

Base: `main` at `60a92df384015ac6abf4273e3bbe56a081cca0a0`. Acceptance for this phase, verbatim:
"AC-9: Graphics and exports made before this plan keep working; reimport keeps field ids and cue
values." The spec section met: "Runtime compatibility (before the first new kind)". Row class:
Risky (versioning and the old-interpreter refusal are state rules). Rules C1 to C8 were written
and pushed before code (a297952), challenged by a fresh read-only Rules-first `/so` (AGREE WITH
CORRECTIONS, seven corrections), and corrected (395da34) before any code.

## What was built

- `src/templates/importedDesign/behaviourReads.ts`: the vocabulary (C1, read off the raw table),
  the frozen pre-TL2 list `READS_BEFORE_TL2`, the additive `READS_ADDED` ledger (empty), the
  per-variant declaration, the reader for a saved runtime (declared, frozen cut, unknown, none)
  and the check `behaviourReadsVerdict`.
- `behaviourRuntime.ts` emits `var NOACG_BEHAVIOUR_READS = {...};` with the runtime (C2).
- `validateTemplate.ts` section 5e refuses a table word, or a table version, its own runtime does
  not read (export-blocking), and warns when a runtime's READS is a version this build does not
  know (C3, C6).
- Fixtures, committed bytes built at `df0c7a0` and never regenerated:
  `scripts/fixtures/pre-tl2/vote.json` (the Illustrator live vote, imported),
  `countdown.json` (the question timer board, imported) and `vote-package.zip` (the vote's
  downloaded package, SPX and OGraf in one folder). Built by bundling `git archive df0c7a0 src`
  with rolldown into a blank Chromium page and calling that revision's own
  `svgDraftFromImport`, `IMPORTED_SVG.create` and `buildGraphicPackage` (a blank page has no
  `/fonts`, so the package carries the licence note and no font files).

## AC-9, per part

| Part | Proof | Result |
| --- | --- | --- |
| Graphics made before this plan keep working | `scripts/pre-plan-graphics.test.mjs`: the frozen vote paints 70% / 20% / 10% from a cue and its drawn percents follow Live figures; the frozen countdown counts, warns inside 10 s and holds 0:00; both pass the check; saved code unchanged | pass (5/5) |
| Exports made before this plan keep working | same file: the 2026-11 package imported through today's zip door keeps `js/template.js` byte for byte, passes the check, keeps its field ids and plays; the package's own page, served as a playout server serves the folder, paints the same figures with no page error | pass |
| Reimport keeps field ids and cue values | same file: edited artwork (a text layer drawn in front of every field, the panel colour changed) built today and reimported over the frozen vote: no unresolved item, every old `field:title` kept although the build had moved the ids, the old cue paints the same figures and looks, and the rebuilt table passes against its new runtime | pass |
| The check (spec: refuse a word an old interpreter cannot read; additive stays readable; breaking migrates on read) | `scripts/behaviour-reads.test.mjs` (12/12): a hand edit asking the frozen vote for `share:count` (TL5's per-option count) is refused with exactly `derive:share.count`; a new kind, rule key and spec key are refused; asking nothing new passes; an additive key still parses; a version 2 table under a runtime that reads version 1 is refused; an unknown READS version warns and never passes | pass |
| The frozen list is complete (Rules-first `/so` item 6) | the frozen list equals, word for word, what the df0c7a0 runtime code in both fixtures compares, extracted mechanically; and every recipe with every option compiled with the df0c7a0 source (22 tables, 17 recipes) is read by the frozen list, 0 refused (scratch script over `git archive df0c7a0 src`, run 2026-11-22) | pass |
| Drift (C4) | per runtime variant (clock, awards), the emitted runtime's code compares exactly the words its READS declares; a planted READS-only `share:count` is caught, and passes once the code reads it; every recipe and option today (22 tables) compiles to a table its own runtime reads | pass |
| #2691 treated correctly | its runtime change added no word: the drift test passes with READS unchanged, and the df0c7a0 fixtures (before #2691) pass the check | pass |

## Other verification

- `npm run gates -- run --changed origin/main` (build tier): pass. `node scripts/gates.mjs audit`: OK.
- `npx tsc --noEmit`, `npx eslint` on the changed files: clean.
- Factory tier, changed: the new READS line moves the emitted js hash of every behaviour design,
  re-recorded in `scripts/fixtures/svg-corpus-passes.json` (emit `js`, 5 hashes) and
  `scripts/jev-svg-baseline.test.mjs` (quiz-1, quiz-3 `appearance.js`). The remaining local
  differences in `svg-import-passes` (inventory, bind, emit `html`, runtime) are this machine's
  Chromium 157 against the recorded 149: a control run of the same test on `origin/main` fails
  the same four records the same way. CI runs the recorded build.
- `e2e/import-svg-behaviour.spec.ts` and `e2e/import-svg-reimport.spec.ts`: see the PR.

## Not checked here

- Illustrator round trips belong to the owner phases (TL1o moved to TL8); none is claimed.
- The full configured set and the focus set: GitHub Actions (validateTemplate is core).
