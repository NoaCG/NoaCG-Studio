# Were the four red main runs selection misses?

Read on 2026-10-10 from the CI logs (`gh run view`, job logs via `gh api .../jobs/<id>/logs`).
A main push runs the full suite, so a selection miss shows as a spec that fails on `main` after a
landing whose own pull request plan did not select it, and keeps failing until something fixes it.

| run | landing | what failed | selection miss? |
|---|---|---|---|
| 38015497259 | #941 (5619f765c), 2026-10-10 02:02 | `editor-fidelity-trim.spec.ts:50` failed on shard 9 and again in the same-commit retry: the exported `wizard.js` no longer matched `docs/research/editor-r1-1d/baseline/wizard.js` | **Yes.** Caused by #927 (6dd97b7d5, landed 01:47), which changed `src/templates/importedDesign/svg.ts`. #927's pull request plan (run 38013662731, job "E2E plan") was `subset` and did not contain `editor-fidelity-trim`; its own push run (38014548929) was cancelled by #941's. The spec's header did not list `svg.ts`. #947 re-recorded the baseline and 4a9e01e02 added `src/templates/importedDesign/svg.ts` and the baseline directory to the header by hand. |
| 37828961726 | #826 (a2523f820), 2026-10-08 19:02 | `editor-groups.spec.ts:342` failed on shard 3 and passed in the retry (32 passed); shard 8 was cancelled at its job cap, and its unreported files then ran once in the retry, where `video-hyperframes.spec.ts:24` failed | **No.** #826 changed only `.gitignore`, and the run before it on main (#824, 37825587057) was green, so no product change was in the window. The next full runs (37852246414 and on) passed both specs with nothing fixed. A flake plus a capped shard. |
| 37155254392 | #686 (3b1de749e), 2026-10-03 21:29 | `layout.spec.ts:177` ("mobile: Home leads with Productions") timed out on shard 1 and again in the retry | **No.** The same test failed on 37118148332 below, passed on the full runs between and after (37143991356, 37151656287, 37157623085, 37159133579, each with every shard green) with no change to it, and was fixed in the spec itself by 91b3672d6 ("Read the committed Home fixture on a fresh page": a hash-only navigation could keep Home's initial empty read). A timing race in the spec. |
| 37118148332 | #673 (f48659e95), 2026-10-03 10:58 | `layout.spec.ts:177` as above on shard 2; the Build job failed `cli/test/bridge-window.test.mjs` with `EADDRINUSE 127.0.0.1:38981`; the retry refused to run because only 8 of 9 shards uploaded a report | **No.** The layout race above, plus a port collision in a CLI unit test. |

So one of the four was a selection miss. It is the one this work exists for, and it is the shape
the traced map catches: a source file a spec executes that its header does not name.
