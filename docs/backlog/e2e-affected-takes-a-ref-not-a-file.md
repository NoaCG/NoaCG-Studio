---
v: 2
source: derived
kind: finding
raised: 2026-09-28
state: unstarted
found: "scripts/e2e-affected.mjs takes a base REF as its argument, so `node scripts/e2e-affected.mjs --list <file>` fails with a git error, while the orchestrator's collision contract and the night-wave row prompts tell sessions to run it over a row's TOUCHES"
serves: reliability
size: small
touches: scripts/e2e-affected.mjs, .agent-workflows/orchestrator/collisions.md
covered-by: none
needs-owner: none
---
# e2e-affected takes a base ref, but the collision contract calls it with files

**Filed:** 2026-09-28. **Source:** wave finding, reproduced by the wizard entry follow-up row.

## Why

`.agent-workflows/orchestrator/collisions.md` says to "run `node scripts/e2e-affected.mjs --list`
over each row's `TOUCHES`", and the night-wave row prompts repeat it. The script's only positional
argument is a base ref (`npm run test:e2e:affected -- <ref>`), so passing a file path fails with a
git error instead of listing specs. A collision check that cannot run is skipped, and two rows
sharing an e2e flow then meet in the merge queue instead of in the plan.

## What it would take

One of:

- the CLI grows a files mode (for example `--files <paths>`) that maps paths to specs through the
  same `// covers:` index the ref mode uses; or
- the contract text and the row prompt template change to the real usage.

The files mode is the better fit: planning happens before any branch exists, so there is no ref to
diff yet.

## Evidence

```
$ node scripts/e2e-affected.mjs --list src/components/wizard/steps/EntryStep.tsx
fatal: ambiguous argument 'src/components/wizard/steps/EntryStep.tsx...HEAD': unknown revision or path not in the working tree.
```

Usage lines at the top of `scripts/e2e-affected.mjs` (lines 8 to 13) document only the ref form.
