# Phase 31: Add the server decision adapter and task policy

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-6: "Correct decision adapter and explicit consent boundary; server-only credentials;
  request/token/attempt/cost bounds; validated provider policy; deterministic fallback."
- Row 31: "Use mocked provider calls to verify decision payloads, audited prices/routes, size
  limits, reservations, cancellation, bounded retry and fail-closed privacy policy. No paid call
  or database migration."

## Pinned main

Worktree from `ea0eaa119e891def97d6db15151a644280613e74` (PR #2000, row 30). Previous verified
main: that SHA. Revert this row after it lands with `git revert -m 1 <merge sha>`.

## What the endpoint is

Read on 2026-11-03 from the free, unauthenticated gateway listing (`GET /v1/models`) and the
gateway's Decision docs, not from memory. `typesafe-ai/jev-1.14.0` is a decision model (listing
type `evaluation`): it answers boolean, choice and score questions about a `state` with
probabilities. The gateway serves decision models from `POST /v1/evaluate` only, never from Chat
Completions. Listing: $0.042 per million input tokens, $0 output, 32,000-token context, one
provider (`typesafe-ai`), ZDR and no-training listed for all providers, us region. The floating
`typesafe-ai/jev` alias is a different, unpinned entry.

## Decisions

- **A narrow adapter, `api/_lib/aiDecisionGateway.ts`.** It speaks `/v1/evaluate` only. The
  chat adapter is untouched; its error classification (`providerFailure` in `aiGateway.ts`) is
  exported and reused rather than copied.
- **Candidates, not approvals.** Jev 1.14.0 and Elephant-1 go in a separate
  `DECISION_MODEL_CANDIDATES` list in `aiModelCatalog.ts`, not in `APPROVED_MODEL_CATALOG`.
  Every approved entry records a ZDR verification made by a real call, and this row makes none.
  The task still sends `zeroDataRetention: true`, so the gateway refuses the call if no provider
  qualifies. Language-model comparators (Haiku, Luna, Gemini) keep using the chat adapter; this
  row adds no entry for them.
- **The registry keeps the two kinds apart.** `structuredMode: 'decision'` marks a decision task.
  A decision task names only decision candidates and a chat task can never name one, in either
  direction, before any call. A decision route is funded under the same per-million ceiling as a
  text route, because it bills per token.
- **One allowance with graphic analysis.** The ledger's `profile` column admits no new value
  without a migration, and this plan adds none. The task books against `import-analysis` and
  reads its quotas from `importAnalysisProfile()`.
- **Consent boundary.** The global AI notice stays at `ai-disclosure-v1`: bumping it would ask
  every user to re-accept for a feature that is off. The task needs that notice accepted
  (`hasCurrentAiConsent`, which fails closed on a lookup error), and the artwork's text goes only
  with the request's explicit include-text choice. Two short strings for that choice are in
  `src/ai/consentNotice.ts` for the row 35 and 36 UI. No preview image goes in this row.
- **How the route stays off.** `AI_TASK_SVG_INTERPRETATION_ENABLED` is unset by default, so the
  task is disabled and refuses before building anything. The existing route kill switch
  (`system_settings.disabled_routes`) is a second stop. No HTTP route calls the adapter yet:
  that is row 35.
- **Size bound per route.** The request bound is the smaller of 24,000 bytes and the model's
  context minus framing (a token is at least one byte). Found by the tests: Elephant-1's context
  is 16,384, so one fixed 24,000-byte bound would have overrun it.
- **Retry policy.** Retry only transient failures (timeout, network, 429, 5xx). A refusal, an
  invalid answer, a cancel or a different serving model is not retried.

## Rules (stated with the code, challenged by the final /so)

1. A request is sent only after, in order: flag on, registry gate, priced listed route, kill
   switch off, current consent, evidence and questions within policy, request within size, priced
   worst case of all attempts within the ceiling, managed key present, not cancelled, reservation
   created. Any refusal before the reservation books nothing and sends nothing.
2. One logical request makes at most two provider attempts.
3. Every outcome after a reservation settles it out of the active statuses, so the user and fleet
   slots are released: `usable` on success, `failed` with a reason otherwise.
4. Spend is settled in every case: the gateway's reported cost; else usage at the audited price;
   else the attempt's worst case. A sent attempt with an unknown bill (timeout, network, cancel,
   5xx) is charged its worst case. A 4xx refusal before inference is charged nothing.
5. A cancel stops the current attempt and starts no new one.
6. An answer counts only if every question is answered once, with its own type and options, and
   nothing else, and it came from the requested model and an allowed provider. Otherwise the
   request fails and is not retried.
7. Every refusal and failure says `fallback: 'deterministic'`: the caller keeps the deterministic
   import's proposal.
8. The key appears only in the Authorization header: no outcome, ledger record or error carries
   it, and no provider body is copied into one.
9. SVG names and text are values in `state`. The questions are the server's own and never contain
   anything from the artwork.

## Verification

- `api/_lib/aiDecisionGateway.test.ts`: 23 tests, mocked fetch only, no network. Each point of the
  row: payloads (body shape, strict answers), audited prices and routes, size limits (evidence,
  questions, whole request, per-route context), reservations (book, settle, release, in-flight
  hold, duplicate, exhausted allowance), cancellation (in flight and before start), bounded retry
  (503, 429, timeout, refusals), fail-closed privacy (no consent, text without the choice, a
  preview key, unknown route, unknown price, kill switch, no key).
- Mutation: removing the consent check, the include-text check, the kill switch, the answer type
  check, the name bound, the size bound, either cost ceiling, the 5xx charge, the cancel check,
  or the release on failure each fails a test. Adding a decision-fallback `models` list fails a
  test.
- Existing `aiTaskRegistry`, `aiGateway` and `aiLite` suites: 89 pass, unchanged.
- No paid call, no network call to a model, no migration.

## Traps

- `npm run test:ai-gateway` runs an explicit file list (`scripts/run-ai-gateway-tests.mjs`); a new
  `api/_lib/*.test.ts` file runs in CI only once it is listed there.
- The server cannot import `src/ai/svgInterpretation/contract.ts` as is: probed with
  `tsc -p tsconfig.api.json`, it fails on its `.ts` import extension (TS5097) and on DOM types it
  pulls in through `src/assets/svgImport.ts`. Row 35, which maps decisions onto `SvgProposal`
  on the server, has to reconcile that boundary.
