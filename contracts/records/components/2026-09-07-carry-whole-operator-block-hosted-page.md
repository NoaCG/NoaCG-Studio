# components/carry-whole-operator-block-hosted-page

Rule: `components/carry-whole-operator-block-hosted-page`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

The page is login-optional by design - the slug is the capability - and offline builds answer the route honestly, which is why e2e/hosted-control.spec.ts covers only the publish-side spec build and e2e/configured/hosted-control-recovery.spec.ts is the live half.
