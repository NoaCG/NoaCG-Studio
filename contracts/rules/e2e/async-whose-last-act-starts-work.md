---
v: 1
scope: e2e/**
kind: trap
fires: contract
status: active
since: 2026-10-08
record: contracts/records/e2e/2026-10-08-async-whose-last-act-starts-work.md
---
An async `page.evaluate` whose last act starts UI work (a `navigate`, a store write the page renders) must answer from a later task, `await new Promise((r) => setTimeout(r))` before it returns: V8 holds the settled promise only weakly until it replies, so a garbage collection in the render's microtasks drops the answer, and Playwright reports that as "Execution context was destroyed" with no navigation.
