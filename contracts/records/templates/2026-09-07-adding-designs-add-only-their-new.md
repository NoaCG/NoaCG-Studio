# templates/adding-designs-add-only-their-new

Rule: `templates/adding-designs-add-only-their-new`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below.

## Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 35-46. **But `overflow-baseline.json` is the one file whose own updater breaks that rule.** Re-recording it with `--update-baseline` on a clean tree produced **+12 / -98** (2026-08-23): the deletions were `-mask:y` self-clip rows on designs nothing had touched - card05, card17, card18, card21, card33, card44, ss05, ss10, ss18 and more. Those rows sit within a pixel or two of `CLIP_TOLERANCE` (2px), so whether they appear depends on font loading and machine load rather than on the code. A full re-record bakes one run's coin flips into the committed reference, and the NEXT run reports the ones that came back as regressions. **Add only the new rows by hand and leave every existing one alone**, then re-run `node scripts/overflow-sweep.mjs --baseline` to confirm PASS:  ```bash node -e "const fs=require('fs');const p='scripts/overflow-baseline.json';const j=JSON.parse(fs.readFileSync(p,'utf8'));j.myNewId={off:[],clip:['.prefix-mask:y']};fs.writeFileSync(p,JSON.stringify(j,null,1))" ```
