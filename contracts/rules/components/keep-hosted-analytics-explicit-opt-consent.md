---
v: 1
scope: src/components/AnalyticsConsentBanner.tsx, src/components/SettingsDialog.tsx
kind: invariant
fires: contract
status: active
since: 2026-09-07
record: contracts/records/components/2026-09-07-keep-hosted-analytics-explicit-opt-consent.md
---
Keep hosted analytics an explicit OPT-IN: the consent banner is non-blocking and mounts once in `App.tsx`, the settings dialog owns the reversible preference, and the undecided, declined, DNT/GPC and offline states create no identifier and send no events.
