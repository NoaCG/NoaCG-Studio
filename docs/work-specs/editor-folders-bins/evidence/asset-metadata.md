# Inert metadata and existing asset transforms

Written-first browser run j-3545 failed because moving `images/First/red.svg`
rewrote the identical folder label to `images/Second/red.svg`; the inferred
First bin also disappeared. See `asset-written-first.log`.

A direct native invocation of the existing pure reference counter returned 1
for an asset path appearing only in that inert folder label, instead of 0.
The native probe used Sucrase and omitted unrelated browser imports.

The model now partitions its leading organization header from artwork. Asset
moves and inlining retain that raw header; artwork/CSS/JS references still use
the existing exact-string convention. Reference counts exclude the header.
Moving an asset refuses unsupported metadata at the shared writer boundary.
The editor registry snapshots inferred bins before moves/removals so empty bins
retain the same persistence and history behavior as explicitly created bins.

`node --test scripts/editor-organization.test.mjs`: 6 passed, including actual
pure move/inlining/counter functions, old-source migration, header ownership,
unknown-version refusal and byte-preserving source round trips. Final browser
acceptance and mutation/regression receipts verify the complete registry/UI.
