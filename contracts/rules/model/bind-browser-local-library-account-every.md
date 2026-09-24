---
v: 1
scope: src/model/accountScope.ts, src/model/durableStore.ts, src/backend/accountLibrary.ts, src/backend/sync.ts, src/backend/syncController.ts
kind: invariant
fires: contract
status: active
since: 2026-09-24
record: contracts/records/model/2026-09-24-bind-browser-local-library-account-every.md
---
Bind the browser's local library to ONE account: every account that signs in keeps its documents under its own key names from `model/accountScope.ts`, only the library in use is loaded, and sync runs only while that library is the signed-in account's own. Signing in adopts the signed-out workspace, merges it through the cloud, or switches with a reload, and a deliberate sign-out returns to the signed-out workspace. Never re-mint a record the cloud refused for another account - that copies one account's work into another's.
