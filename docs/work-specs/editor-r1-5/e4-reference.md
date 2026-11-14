# E4 working-reference tasks

Open Graphics Studio 0.17.0 was executed in Chromium at 1366×768 on
2026-11-12T11:30:38Z. [The sanitized receipt](e4-reference-receipt.json) pins its
binary SHA256 and source. The phase's requested pin is
`3142fc7d02934494931eb14e7dc255393e4110d0`; the official 0.17 binary manifest names
`a1e9776120fa19d9f3f9d40ab4b10ae1be034347`. A fresh GitHub source comparison showed
only `.github/workflows/release.yml` differs: application/runtime/build inputs
are identical. This is explicit source applicability, not a claim that the
binary's manifest names the requested commit.

The executed path created text `Harbour bulletin`, applied the News broadcast
style pack, used Edit Undo (no pack/tokens) and Redo (News restored), named a Brand
Kit `Harbour TV`, and saved one native `.ogs` file. New created a second text
`Harbour intro`, saved a second native file, then Open first file restored
`Harbour bulletin`. The documented browser download/input fallback was used in
headless Chromium; native OS file-picker behaviour was not tested. Final job
j-0054 passed without console errors. Diagnostic attempts j-0052 and j-0053 failed
on incorrect reference-only selectors (hidden heading, guessed tab class), then
DOM inspection located its actual accessible tabs; they remain failed attempts.

NoaCG's corresponding journeys select three catalog graphics, create/apply a
brand with font/logo, undo/redo the source and brand receipt together, preserve
local overrides on explicit reapplication, and switch/reopen independent drafts.
The reference's style pack and two saved files are useful interaction/rendered
comparisons; they do not establish equivalence to NoaCG's named brand/logo
three-way comparison, durable per-document history, Home membership, selective
rundown installation, interrupted-write receipts or conditional rollback. Those
contracts are verified directly in `e2e/editor-projects.spec.ts` and the isolated
backend qualification. No whole-editor usability parity or comparison timings
are claimed, and no reference code/artwork was copied into the product.
