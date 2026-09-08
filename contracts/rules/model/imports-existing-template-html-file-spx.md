---
v: 1
scope: src/model/importTemplate.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-imports-existing-template-html-file-spx.md
---
`importTemplate.ts` imports an EXISTING template - an .html file or an SPX-style zip - and splits it into the editor's three panes. A foreign template rarely follows the house contracts, so the surfaces DEGRADE GRACEFULLY rather than refusing: the Style panel explains that it found no variables, the Inspector says there is no managed animation, validation shows what is missing, and the AI panel's playout-ready action is the guided fix path. Nothing here rewrites a foreign template silently.
