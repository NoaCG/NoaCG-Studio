---
v: 1
scope: src/model/videoTypes.ts
kind: rule
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-what-each-upload-lives-project-rather.md
---
`assetUses` - what each upload is FOR - lives on the PROJECT rather than in the wizard, because a video project is created instantly and its first generation runs later, in the shell: a reference kept in wizard state would never be read. It is additive optional, so no version bump and no migration, and an ABSENT map means every asset is composition material.
