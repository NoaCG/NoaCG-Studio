# Test maintenance after subject review

The original 78 broad entries are withdrawn. They treated an old-editor skip-helper call as
proof that the behavior was retired. The owner now accepts retaining #800 for current behavior.

The seven-file first source PR keeps every test body. Its no-old-editor covers-header correction
does not remove a declaration, so it needs no removal allowance. Keep the existing module-load
guard, routing checks and active root rule identity.

For each later PR, classify the exact removed declarations from test-cases.tsv:

1. Retired old-editor interaction: name the interaction and removed surface.
2. Current behavior already protected: name the running check and demonstrate that it covers
   the same failure, including relevant negative cases. A similarly named test is insufficient.
3. Current protection gap: implement and verify the smallest suitable Node/browser check first.

Only then write one Test maintenance line per affected spec in the removal PR's spec.md,
with the exact case identities, retained current checks and supporting receipt. No blanket
permission, budget exception or unconditional replacement skip. This evidence file deliberately
contains no active maintenance section and cannot authorize a gate bypass.

Pure formatter/runtime assertions can use Node; live DOM, import/export, persistence and
on-air behavior retain the needed browser/integration boundary. Retire redundant walks once
their protection is demonstrated. #800 closes only when every retained subject has a running
home and no test calls the retired bootstrap helpers.
