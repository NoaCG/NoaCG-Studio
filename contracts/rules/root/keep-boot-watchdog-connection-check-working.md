---
v: 1
scope: app.html, src/main.tsx, e2e/network-resilience.spec.ts
kind: trap
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-keep-boot-watchdog-connection-check-working.md
---
Keep the `/app` boot watchdog and connection check working: `?diag=1` renders the inline diagnostics with main.tsx standing down, durable-store hydration times out to localStorage, and a boot that never mounts paints a plain-HTML diagnosis.
