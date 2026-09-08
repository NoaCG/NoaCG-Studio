---
v: 1
scope: src/model/styleVocabulary.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-holds-words-ranges-both-style-surfaces.md
---
`styleVocabulary.ts` holds the WORDS and ranges both style surfaces render: the role label for each `:root` variable (a user-facing name, never CSS jargon), the group it belongs to, which tokens are lengths and over what range, the shadow presets, and the two size ladders. The wizard and the editor read them from here; neither writes its own.
