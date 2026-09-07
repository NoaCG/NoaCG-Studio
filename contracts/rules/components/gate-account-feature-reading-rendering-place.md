---
v: 1
scope: src/components/**
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-gate-account-feature-reading-rendering-place.md
---
Gate an account feature by reading `useAuthState().needsSignIn` and rendering `SignInPrompt` in place of THAT feature - never block the app and never grow an app-wide gate. There is no login wall, ever, and an offline build with no backend configured must grow zero auth UI.
