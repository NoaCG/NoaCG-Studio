# Per-graphic replacement: implementation evidence, 2026-10-08

Branch `claude/per-graphic-replacement`. Commands ran on Windows, offline suite on the dev server.

| AC | Evidence | Result |
|---|---|---|
| AC-1 | `e2e/output-prepare.spec.ts` "a change off air swaps in place while another graphic stays on air untouched": the scorebug on air keeps its frame element, its field value and its machine state; the lower third gets a new frame with the new body; the next Take airs it | pass, 3 of 3 repeats (job j-3748) |
| AC-2 | same spec: "a change on air waits ..." (Update still reaches the old frame, `chg.w` names it, Out swaps it with its values) and "a Take that replaces an on-air graphic airs its waiting change at once" | pass, 3 of 3 |
| AC-3 | `e2e/live-field-change.spec.ts` with `NOACG_FIELD_CHANGE_ALL=1`: every catalog variant (528) taken on air, then sent an Update with a field only a newer version has, and Updates lacking each field in turn; a rename keeps the field id (`setFieldTitle`) | 528 of 528, 0 findings (job j-3754); the default run covers one variant per category (23). Mutation check: a shared `update()` that blanks unsent fields gives 24 findings |
| AC-4 | output-prepare: "a change that fails keeps its old frame and is named; the other changes still swap" | pass, 3 of 3 |
| AC-5 | the AC-1 and AC-2 tests assert one document (no reload) and an unchanged `data-plays` | pass |
| AC-6 | not run on a real CasparCG. The renderer code is the same on a slot; new code in `src/output` uses no syntax or API newer than Chromium 71 (es2017 build target; no `at`, `replaceAll`, `allSettled`, `matchAll`) | owner walk |
| AC-7 | an output from before this change: untouched (no protocol change). Pages from before: read `chg` as today (`waiting` reads "Behind", `failed` reads "change not prepared"); new pages read old outputs (`scripts/readiness.test.mjs`) | pass (Node) |
| D2 | output-prepare: another resolution reloads only once air clears; a new renderer build at the output's URL reloads once air clears | pass |
| D4 | output-prepare: an added graphic joins at once and is takeable; a removed one stays while on air and leaves after its Out | pass |

Also: `scripts/swap-plan.test.mjs`, `scripts/readiness.test.mjs`, `scripts/playout-status.test.mjs`
(Node), `npm run build` (exit 0, 2543 Node tests, no dependency violations, job j-3752),
`npm run test:e2e:affected` (279 passed, 22 skipped, job j-3750).

Not run here: the configured two-output spec `e2e/configured/per-graphic-replacement.spec.ts`
needs a local Supabase stack (dispatched separately on `configured-suite.yml`).
