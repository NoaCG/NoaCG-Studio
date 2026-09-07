# components/import-every-dropped-file-call-import

Rule: `components/import-every-dropped-file-call-import`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

Images, .webm and .mp4 loops, Lottie JSON and fonts all land in the same bucket, so the type gates are what keep an unrelated .json out. Pinned by e2e/assets.spec.ts and e2e/asset-workflow.spec.ts.
