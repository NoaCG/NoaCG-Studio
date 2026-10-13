# Phase S1a: instruction relief (AC-7)

Recorded by the S1a builder (branch `claude/plan-wizard-shell-p1-build`), 2026-10-13, Windows 10.
Before = `origin/main` at `4508e1331`. After = the contracts commit `0e912b7f6` (the three
marker files and the compiler's output; no rule file, no product code).

## What changed

`src/components/wizard/import/AGENTS.md`, `steps/AGENTS.md` and `steps/ai/AGENTS.md` were created
holding only the compiler's marker line, copied from line 1 of `src/components/wizard/AGENTS.md`.
`npm run contracts:compile` then regenerated those three contracts, wrote a `.gitattributes`
beside each, and rewrote `src/components/wizard/AGENTS.md`. `.claude/rules/` did not change.

The 92 rules the wizard contract held are all still there, each exactly once:

| Contract | Rules | Bytes (LF) |
|---|---:|---:|
| `src/components/wizard/AGENTS.md` before | 92 | 35,238 |
| `src/components/wizard/AGENTS.md` after | 31 | 11,367 |
| `src/components/wizard/import/AGENTS.md` | 19 | 7,538 |
| `src/components/wizard/steps/AGENTS.md` | 20 | 8,058 |
| `src/components/wizard/steps/ai/AGENTS.md` | 22 | 9,041 |

Checked by listing every rule id in the old contract and in the four new ones: none missing, none
added, none duplicated.

## Chain per edited file

`node scripts/check-shared-instructions.mjs` prints the three tightest chains (more only when more
are above 80% of the cap) and `npm run metrics:contracts` the five tightest, so neither prints all
four of these. They are
computed the way `check-shared-instructions.mjs` counts a chain: every `AGENTS.md` from the root
down to the file's folder, LF-normalised, plus 2 bytes per join. The steps/ai figure matches the
chain the check itself printed after the change (51,910).

| Edited file | Before | After | Chain after |
|---|---:|---:|---|
| `src/components/wizard/CreationWizard.tsx` | 58,678 | 34,807 | root 2,750 + src 8,987 + components 11,697 + wizard 11,367 + 6 |
| `src/components/wizard/import/draft.ts` | 58,678 | 42,347 | the shell chain + import 7,538 + 2 |
| `src/components/wizard/steps/BrowseStep.tsx` | 58,678 | 42,867 | the shell chain + steps 8,058 + 2 |
| `src/components/wizard/steps/ai/MoreControlPanel.tsx` | 58,678 | 51,910 | the steps chain + steps/ai 9,041 + 2 |

Against the 65,536-byte cap (the build fails below 4,096 free), the tightest wizard chain went from
6,858 to 13,626 bytes free. Against the 40,960-byte target of `docs/METRICS.md`, which is reported
and not gated: the shell chain is under it; import (+1,387), steps (+1,907) and steps/ai (+10,950)
are over it. The next candidates for those three chains are named in the spec's S1a phase notes.

## Commands and output

`npm run metrics:contracts`, before (tightest chains block):

```
  tightest chains (bytes, files):
       58678  4  src/components/wizard  (~14,670 tokens)
       58150  5  src/ai/pro/harness  (~14,538 tokens)
       55713  4  src/templates/importedDesign  (~13,928 tokens)
       50225  4  src/ai/pro  (~12,556 tokens)
       48481  4  src/templates/infographics  (~12,120 tokens)
```

After (run on the committed tree, since the script lists tracked files):

```
  tightest chains (bytes, files):
       58150  5  src/ai/pro/harness  (~14,538 tokens)
       55713  4  src/templates/importedDesign  (~13,928 tokens)
       51910  6  src/components/wizard/steps/ai  (~12,978 tokens)
       50225  4  src/ai/pro  (~12,556 tokens)
       48481  4  src/templates/infographics  (~12,120 tokens)
```

The corpus went from 102 files and 480,479 bytes to 105 files and 481,245 bytes (+766 bytes: the
three new contracts total 24,637 bytes against the wizard contract's 23,871-byte drop; the
difference is their own headers).

`node scripts/check-shared-instructions.mjs`, before:

```
Shared instructions OK: 55 AGENTS.md/CLAUDE.md pair(s), 16 Claude/Codex workflow pair(s), 3 alias(es), 1 documented tool-specific exception(s).
  - src/components/wizard/AGENTS.md: 58678 bytes used, 6858 free (89.5%)  <-- near the limit
  - src/ai/pro/harness/AGENTS.md: 58150 bytes used, 7386 free (88.7%)  <-- near the limit
  - src/templates/importedDesign/AGENTS.md: 55713 bytes used, 9823 free (85.0%)  <-- near the limit
```

After:

```
Shared instructions OK: 58 AGENTS.md/CLAUDE.md pair(s), 16 Claude/Codex workflow pair(s), 3 alias(es), 1 documented tool-specific exception(s).
  - src/ai/pro/harness/AGENTS.md: 58150 bytes used, 7386 free (88.7%)  <-- near the limit
  - src/templates/importedDesign/AGENTS.md: 55713 bytes used, 9823 free (85.0%)  <-- near the limit
  - src/components/wizard/steps/ai/AGENTS.md: 51910 bytes used, 13626 free (79.2%)
```

Other checks on the contracts commit:

- `npm run contracts:compile -- --check`: `OK - 560 rule(s), 259 generated file(s) current`.
- `node --test scripts/compile-contracts.test.mjs`: 28 pass, 0 fail.
- `node scripts/gates.mjs run --changed origin/main`: every selected gate ok (shared-instructions,
  contract-freshness, contract-citations, client-secrets, client-neutral, copy,
  preview-serialization, contract-evidence, retired-names); `check-shared-instructions.test.mjs`
  10 pass.
- `npm run depcruise`: no dependency violations (1,362 modules).
- `node scripts/e2e-affected.mjs --list --files <the four contracts>`: "these paths touch nothing
  the offline e2e suite covers", so no browser spec ran locally; section 6's wizard-shell entry
  for S1a asks only that the contracts compile and load.
- `git diff --name-only origin/main...HEAD -- contracts/rules`: empty.
