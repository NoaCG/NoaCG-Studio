---
v: 1
scope: src/control/productionDataSession.ts
kind: rule
fires: contract
status: active
since: 2026-11-20
record: contracts/records/control/2026-11-20-bound-press-declared-goes-out-through.md
---
A bound press (an `adjust`, a declared `set`) goes out through `pressBound` as a RELATIVE operation with a press id, never as a figure counted from the page's tree: the server folds it under the row lock into one absolute merge patch and records the id, so a resend counts once and the tree write stays absolute state. A queued press is never in the tree; air takes the figure from the server's rows.
