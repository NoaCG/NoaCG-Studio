---
v: 1
scope: src/model/fieldModel.ts
kind: invariant
fires: contract
status: active
since: 2026-09-08
record: contracts/records/model/2026-09-08-every-surface-edits-field-renders-never.md
---
EVERY surface that edits a field renders `FieldDescriptor`s, never raw fields, so the SPX Data panel, the SPX operator panel and the video Content panel are literally the same component (`components/fields/FieldControl.tsx`) and cannot drift. An SPX DataField becomes a descriptor through `control/controlModel.ts` `fieldDescriptors`, a `VideoInput` through `videoTypes.ts` `videoInputDescriptor`. A new field kind is added HERE, mapped in the two adapters, and rendered once.
