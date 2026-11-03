# Phase 35: Connect qualified model proposals to the existing import flow

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-5: "Automatic working preview, existing control renderer and ordinary Finish/save; no routine
  layer-by-layer acceptance. Material ambiguity alone causes a compact decision."
- AC-6: "Correct decision adapter and explicit consent boundary; server-only credentials;
  request/token/attempt/cost bounds; validated provider policy; deterministic fallback."
- Row 35: "Exercise an opt-in preparation request through the task route into a reversible draft;
  verify timeout, cancellation, stale response and saved-edit protection using a stubbed model.
  Existing vision flow remains intact. Respect the verdict: limited go admits only named families;
  no go leaves the route disabled and verifies deterministic behavior with mocks, without new paid
  calls."

## Pinned main

Worktree from `origin/main` `3215c7ac731f463c8e6d056612ec8f29b5db8d0e` (PR #2029, row 34).
Previous verified main: that SHA. Revert this row after it lands with
`git revert -m 1 <merge sha>`. A revert removes the route entry, the route file, the client and
the tests; nothing is stored, and no migration or setting changes.

## The verdict this row follows

Row 34 gave **no go** (PR #2029, holdout run `41643649692`): structured Jev 1.14's consequential
errors rose in quiz (0 to 5) and credits (3 to 6). So this row takes the spec's no-go branch.
The model route is built and connected to the draft, and it stays **off** for every user and
every family. No paid call, Gateway call or evaluation dispatch was made. No switch, setting or
copy offers AI preparation.

## What was built

- `api/_lib/svgInterpretation/analyze.ts`, the HTTP half of the task, served at
  `POST /api/ai/tasks/svg-interpretation` (one segment, as the catch-all requires). Ladder:
  method, **verdict** (`MODEL_ROUTE_QUALIFIED`, false), flag, per-IP burst limit, sign-in, body
  shape, then row 31's `runSvgInterpretation` (registry, ledger, kill switch, entitlement,
  consent, evidence policy, size, cost, reservation, call, settlement). The body carries only an
  idempotency key, the evidence and the include-text choice. The **questions are built on the
  server** from the frozen `prompts.json` templates and reader-made layer ids (phase-31 rule 9).
  The answer is a reading: per asked text layer, operator field or not; families only when
  admitted (`ADMITTED_FAMILIES`, empty). Every refusal carries `fallback: 'deterministic'`.
- `api/ai/tasks/[...path].ts`: the new segment in the dispatch table.
- `src/ai/svgInterpretation/client.ts`: `svgPreparationEvidence` (the bounded inventory, read
  from the reader's own sanitized markup mounted off screen; text only with `includeText: true`),
  `requestSvgInterpretation` (one opt-in request: a new idempotency key each time, its own timeout,
  the caller's cancel; never throws, every failure is the deterministic fallback) and
  `svgProposalWithReading` (the reading laid onto the draft's own `svgProposalOfDraft`, changing
  only an asked text layer's `on`; a layer a behaviour picks keeps its decision; another revision
  is `stale`).
- The reading reaches the draft only through the existing door, `svgDraftWithProposal`, which
  refuses a stale revision and keeps every correction (rows 4 and 5).

## Rules

1. The shipped route answers `503 profile_disabled` with `fallback: 'deterministic'` before it
   reads the body, whatever `AI_TASK_SVG_INTERPRETATION_ENABLED` says, while
   `MODEL_ROUTE_QUALIFIED` is false. Nothing a request carries can change that.
2. No family reaches the browser unless it is in `ADMITTED_FAMILIES` (empty under no go).
3. The browser never sends a question, model, route or prompt; an unknown body key is refused.
4. A request is opt-in by its caller, and no surface calls it. A dropped SVG asks the route
   nothing and imports exactly as before.
5. An answer about other artwork than the draft holds is refused twice: by the client (`stale`)
   and by the draft's door (`stale-revision`). The draft is unchanged.
6. An answer never overrides an edit the author made, including one made while it was out.
7. The model's changes are reversible: the drop's own deterministic proposal, applied after it,
   puts back what the model changed and still keeps the author's edits.
8. A timeout, a cancel or any refusal leaves the draft deterministic. On the server a timeout
   makes at most two attempts and settles the booking `failed`; a cancel stops the attempt and
   starts no other.

## Rules found after coding

From the `/check` review round:

9. A crowded artwork is asked about fewer layers, never refused for size: the last field
   questions give way until the request fits the route's size bound, and the layers they named
   are listed in `notAsked`, as is any text layer whose id the reader did not make.
10. A lookup failure on the server (settings, consent, entitlement, ledger) answers
    `unavailable`, not a provider timeout. A refusal keeps the server's `retryable` flag.

Not changed, with reasons (each is a limit of the switched-off route, listed under "What turning
it on would need" where it matters):

- `vercel.json` gives the tasks function no `maxDuration`; a long provider wait could outlive a
  shorter platform default and leave a booking `model_running` until its lease expires.
- `crypto.randomUUID` needs a secure context, as in the existing analysis client: on plain http
  the request fails closed as `unavailable`.
- The reservation-to-HTTP mapping restates the one in `importAnalysis/analyze.ts`, which does not
  export it and is outside this row.
- The walks read the in-memory ledger's private map, as row 31's tests do.

## Decisions

- **`ImportDesignStep.tsx` is not changed.** Under no go no model proposal may reach a user, and
  the spec forbids a switch or copy, so there is no entry point to add. The step would only gain
  dead code. The integration seam is the draft's door, which the step's mapping already uses;
  that is what the walks drive. A later go wires an opt-in where the wizard holds the draft
  (`CreationWizard.tsx`, outside this row), listed below.
- **A code verdict, not only the env flag.** The flag alone would let a deployment setting expose
  an unqualified route. A constant makes turning it on a reviewed code change.
- **The server restates the frozen templates and the question builder** instead of importing
  `src/ai/svgInterpretation/questions.ts`, which the api build refuses (phase-31 trap). The walk
  holds them equal to `prompts.json` and to `buildSvgQuestions`, so they cannot drift.
- **Behaviour families are not applied to the draft.** A family answer names no layers, so it
  cannot become a component with picks; the deterministic behaviour stays. Only field on/off is
  laid onto the proposal.
- **The tests sit in `e2e/jev-svg-preparation.spec.ts`,** the row's only test file. The server
  half runs in the Playwright test process with a stubbed model and an in-memory ledger; the
  page's requests to the route are served by that same real handler, so the browser walk goes
  through the task route. One walk asks the dev server's real dispatcher, unmocked, and gets the
  route's own refusal. A Node test under `scripts/` would be the cheaper layer but is outside the
  row's files.

## Carried items

- **Row 31 (PR #2002)**: questions are built on the server (done, rule 3). The import-analysis
  allowance stays shared: nothing books against it while the route is off. SVG outcomes stay
  apart from image-analysis outcomes because the SVG client never calls
  `import-analysis-outcome`; the outcome route itself still accepts any `import-analysis`
  generation id (listed below). The api code imports nothing from `src/ai/svgInterpretation/`.
- **`AI_SVG_DISCLOSURE`** says "layer names, positions and text lengths"; the evidence also
  carries reader ids, layer kinds and hierarchy. The string is shown nowhere (no surface offers
  the request) and lives in `src/ai/consentNotice.ts`, outside this row; it must be corrected
  before any surface shows it (listed below).
- **Row 6**: a correction surviving a UI-driven reanalysis of look-alike layers. There is no UI
  reanalysis under no go. This row proves it on the twins fixture through the real route and the
  door (the opt-in walk: the author's edits on `t1` and `t2` survive the answer and a revert). The
  UI-driven proof belongs to whichever row adds a UI entry point after a qualified verdict.

## What turning it on would need (not built)

1. A new independent holdout that qualifies named families (spec, "Corpus and evaluation gate":
   an exposed holdout is regression evidence only). Row 34's reporting-only Elephant (73/14) and
   Haiku numbers are not a selection and are not wired as a fallback.
2. `MODEL_ROUTE_QUALIFIED` true and `ADMITTED_FAMILIES` naming only the qualified families, with
   a rule for which field answers apply when only some families are admitted.
3. An opt-in in the wizard where the draft lives (`CreationWizard.tsx`), cancelling the request
   on a new drop, a clear or leaving the step, and applying through `svgDraftWithProposal`.
4. `AI_SVG_DISCLOSURE` matching what is sent: reader ids, kinds and hierarchy as well as names,
   positions and text lengths.
5. `import-analysis-outcome` refusing SVG generations (its `model` column tells them apart), or an
   SVG outcome of its own; and a decision on whether one shared allowance is right (a separate
   one needs a migration and an owner decision).
6. The env flag, the provider allowlist and a qualified ZDR entry for the route, as row 31 left
   them.
7. A `maxDuration` for `api/ai/tasks/[...path].ts` in `vercel.json` that covers two attempts at
   the configured timeout, or a shorter timeout.

## Verification

- `e2e/jev-svg-preparation.spec.ts`, queued locally: 6 of 6 pass (the three existing walks and
  three new ones). No network call to a model, no key, no paid call.
- Mutations, each run through the job queue: the verdict constant set true, the admitted-family
  filter removed, the client's stale check removed, the picked-layer guard removed, the size
  trimming removed, and evidence text sent without the choice each fail a walk. Two expected
  survivors: the server's own include-text coercion (the adapter refuses text without the choice
  in any case) and the client's post-body abort check (an abort before the body throws first).
- `npm run gates -- run --changed origin/main`: pass, including `test:ai-gateway`,
  `check:function-budget` (12, unchanged) and `check:api-route-depth`.
- `npx eslint` on the changed files and `npx tsc --noEmit` with `tsconfig.json` and
  `tsconfig.api.json`: clean.

## Traps

- A cloud worker cannot run `npx playwright test` directly; the config refuses it outside the
  job queue. A mutation loop that ignores the exit reason reads every mutation as killed.
- The e2e folder is outside both tsconfigs, so a duplicate `const` there passes eslint and tsc and
  fails only when Playwright compiles the spec.
- `page.route` handlers run newest first: register the handler that answers before one that holds
  requests and falls back to it.
