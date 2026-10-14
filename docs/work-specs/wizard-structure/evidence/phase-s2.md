# Phase S2: import drop doors (AC-2, AC-3, AC-6, AC-9)

Recorded by the S2 builder (branch `claude/plan-wizard-shell-p4-build`), 2026-10-14, Windows 10.
Before = `origin/main` at `1e9ff904b`. The local browser queue was not used: about 1.4 GB was
free against its 4 GB floor, so every journey runs on the pull request's CI.

## Prerequisite

`e2e/wizard-brand.spec.ts` revived through the export door in its own pull request, #1163,
landed before this one: seven tests that skipped through the retired-editor helpers
(`e2e/_create.ts`, #800) now run. Assertions unchanged; the wait after the door is the export
window opening instead of the wizard closing. `node scripts/check-e2e-protection.mjs --changed
origin/main`: OK.

## Commands and results

| Command | Result |
|---|---|
| `node --test scripts/import-drop.test.mjs` | 11 of 11 pass |
| mutation: `svgFonts` dropped from `artDropPatch` | "a dropped picture takes back every SVG answer an SVG clear does" fails |
| mutation: `brandOrClearPatch(null)` returning `brandClearPatch()` | "a new design takes the brand in force, or clears..." fails |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npx eslint` over the four changed `src` files | clean |
| `npm run depcruise` | no violations, no config change (1370 modules) |
| `npm run gates -- run --changed origin/main` | every gate ok, including `check:file-budgets` (2,482 of 2,482) |
| `git diff --name-only origin/main...HEAD -- src` (AC-9) | `CreationWizard.tsx`, `draft/template.ts`, `import/drop.ts`, `import/index.ts` |
| `node scripts/e2e-affected.mjs --list --files src/components/wizard/import/drop.ts` | 17 specs, among them `import-svg`, `import-graphic`, `import-prepare`, `import-name-collision` and `wizard-draft-guard` |
| browser journeys of the section 6 row (`import-svg`, `import-graphic`, `import-prepare`, `import-name-collision`, `wizard-brand`, `wizard-shell`) | on the pull request's CI; all are in the shell's affected plan |

## Section 5 counter, widened to `import/index.ts` (AC-6)

Run from the repository root. It reads every name `index.ts` exports (the names of each
`export * from` file, and each named re-export) and prints those found by text in a `.ts` or
`.tsx` file under `src/` outside `wizard/import/`.

```
node -e "const fs=require('fs');const d='src/components/wizard/import/';const ix=fs.readFileSync(d+'index.ts','utf8');const names=[];
for(const m of ix.matchAll(/^export \* from '\.\/(\w+)';/gm)){const s=fs.readFileSync(d+m[1]+'.ts','utf8');for(const n of s.matchAll(/^export (?:async )?(?:function|interface|type|const|class) (\w+)/gm))names.push(n[1])}
for(const m of ix.matchAll(/^export \{([^}]*)\}/gm))for(const p of m[1].split(','))names.push(p.trim().split(/\s+as\s+/).pop());
const w=(q,o=[])=>{for(const e of fs.readdirSync(q,{withFileTypes:true})){const p=q+'/'+e.name;if(e.isDirectory())w(p,o);else if(/\.tsx?$/.test(e.name)&&!p.includes('/wizard/import/'))o.push(p)}return o};
const f=w('src').map(x=>[x,fs.readFileSync(x,'utf8')]);let c=0;
for(const n of names){const re=new RegExp('(^|[^\\\\w$])'+n+'([^\\\\w$]|$)');const h=f.filter(([,t])=>re.test(t)).map(([x])=>x);if(h.length){c++;console.log(n,'<-',h.join(', '))}}
console.log(c,'of',names.length,'import/index.ts exports named outside import/')"
```

In bash, run `set +H` first. Result after this phase: **15 of 48**.

| Name | Read by |
|---|---|
| `SvgImportDraft`, `svgDesignOptions`, `withSvgImportPasses` | `draft/core.ts` |
| `behaviourSummary` | `steps/FinishStep.tsx` |
| `svgDropPatch`, `clearSvgPatch`, `artDropPatch`, `templateFileDropped` | `CreationWizard.tsx` (new) |
| `ImportStep`, `ImportDesignStep`, `PrepareDesignStep`, `PlaceFieldsStep`, `MapSvgFieldsStep` | `CreationWizard.tsx` (and comments elsewhere) |
| `armTimerClock`, `DesignFieldSpec` | comments only (`templates/behaviours/naming.ts`; `blocks/designFields.ts`, `ai/importAnalysis/normalize.ts`) |

Before (`1e9ff904b`), by the same count: 13 of 44, with `svgDraftFromImport` and
`svgDraftCleared` read by the shell in place of the four drop doors. After this phase the shell
names no `import/draft.ts` function (each `import/draft.ts` export checked against the shell by
name: none found).

## Shell size

2,516 lines before, 2,482 after; `scripts/file-budgets/components-wizard-CreationWizard.json`
lowered from 2,601 to 2,482 (AC-10).

## Limitations

No browser journey ran on this machine. The visible behaviour is unchanged by construction (the
patches are the same objects in the same spread order); the journeys that prove it are the CI run
of the pull request.
