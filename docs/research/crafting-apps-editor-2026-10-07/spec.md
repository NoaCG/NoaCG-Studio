# Crafting Apps editor research spec

2026-10-07. Research and documentation only, on `codex/crafting-apps-editor-research`.

## Why and goal

The owner wants a familiar editor that completes import/create, edit, expose text,
animate, save/reopen and use. Examine EffectCraft, VectorCraft and FilmCraft at
pinned revisions to find concrete reuse or behavior evidence that shortens that
journey. Establish current NoaCG main first; historical receipts are evidence,
not a current baseline.

## Non-goals

No production implementation, document migration, second editor, Adobe feature
parity, new AI product, paid service, or changes to save/sync, production/playout
or control ownership. Disposable external experiments remain ignored.

## Decisions

Compare observed behavior separately from source/test evidence and declared
features. Keep the current HTML/SVG/source adapters and In/Next/Out contracts
unless a demonstrated alternative warrants an explicit owner decision. Evaluate
Rust/WASM fairly, including licenses, assets and browser/output compatibility.
Use existing jobs for builds/browser experiments; inspect rendered results.

## Observable acceptance

1. Record fetched NoaCG main, worktree/PR ownership and actual relevant source/tests.
2. Pin all three external commits with date, source modules, licenses/notices,
   release/issue evidence and honest runtime/build limits.
3. Exercise relevant available workflows or record concrete attempts and blockers;
   distinguish tests read, tests run, browser observations and unverified claims.
4. Compare five reuse routes against text/fields, source preservation, history,
   identity, browser costs and live editable outputs, with adopt/adapt/defer/reject.
5. Rank at most three near-term recommendations, map them to existing plan scopes,
   give a checkable human/agent task and a bounded pasteable implementation prompt.
6. Update only justified editor scope/order, preserve acceptance boundaries, review
   and verify the docs, then land through check and queue-merge with actual outcome.
