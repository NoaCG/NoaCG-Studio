# Deployment - CI, Vercel production, previews, and what to do when it stops

The runbook for the path from a `main` commit to the live product, and for every alarm on
that path. Binding: keep it updated when the pipeline changes.

The cost and capacity policy for the Pro account is
[`VERCEL_PRO_NO_OVERAGE_PLAN.md`](VERCEL_PRO_NO_OVERAGE_PLAN.md).

## The pipeline

1. **CI (`.github/workflows/ci.yml`)** runs on every push to `main` and every PR (a branch
   pushed without an open PR runs nothing). It is the **per-change tier**: Build (typecheck +
   lint + bundle) and the factory gates always run, while the E2E job runs only **the specs
   that cover the change**.

   An `E2E plan` job answers that first, by running `scripts/e2e-affected.mjs --json
   --integration` against the diff base (the PR base, or the previous branch tip on a push).
   Its output decides both which specs run and how many runners they get - about three measured
   minutes of test execution per runner, capped at nine, from the durations table in
   `scripts/e2e-durations.json`. It also raises the **catalog calibration gate** for changes
   that can move catalog output or the bench.

   `--integration` is what makes a MERGE COMMIT honest. Without it the base is the pre-merge
   branch tip, so the diff is only what `main` brought in and the branch's own work goes
   unplanned; replayed over the last 120 merge-of-main commits here, 71 would have been planned
   differently, 17 of them skipping the catalog gate. On a branch that merged nothing the flag
   changes nothing. See docs/VERIFICATION.md, "A clean merge is not proof the integration
   worked".

   **`main` is the exception: a push there runs the FULL suite, whatever the diff says** (and
   the sprint's focus collapse does not apply - focus keeps BRANCH runs cheap, and `main` is
   where the paused areas still need watching). Scoping answers "what can this change have
   broken", which is the right question for a branch and the wrong one for the branch
   production ships from: a spec that no change maps to is never selected, so it can break and
   stay green indefinitely. On 2026-08-07 `e2e/public-service.spec.ts` was red on `main`
   through eight consecutive green `main` runs, and what surfaced it was an unrelated branch
   escalating to the full suite by accident. This buys **latency, not coverage** - the nightly
   already ran everything - and costs about two minutes of wall clock, because the nine
   shards run in parallel and the catalog gate (3 min) finishes inside them.

   **Scoping is only safe because the mapper fails toward running more:** an unmapped file, a
   shared-core file (`src/store`, `src/model`, `src/preview`, `src/validation`, the shell), or
   a diff base that cannot be resolved all escalate to the full suite. When the plan skips the
   E2E job entirely, the gate counts that skip as a pass - but the plan job itself is
   *required*, so a crashed planner can never be mistaken for "nothing to test".

   **What can red the gate is only what tests code:** build, the plan, the factory gates, the
   E2E shards and the catalog tripwire. `Combined E2E report` merges the shards' artifacts into
   a browsable HTML report, runs no test, and is deliberately outside the gate's `needs` - its
   failure costs you a report, not a verdict, and it adds no coverage (a shard producing no
   blob report already fails in the shard). See "A red run that is not a verdict" below.

   On `main`, in-progress runs are never cancelled by a newer push (branches/PRs still
   cancel), so every `main` HEAD ends with a real verdict. A red gate names the failing job in
   an error annotation; Playwright's `github` reporter annotates the exact failing tests.

1. **`nightly` (`.github/workflows/nightly.yml`)** is the **exhaustive tier**, at 02:00 UTC
   (04:00-05:00 Helsinki, so a red result is filed before the day starts): the **whole** E2E
   suite in eight shards, plus the three catalog-wide gates that nothing else schedules - the
   calibration tripwire, `type-floor.mjs` and `overflow-sweep.mjs --baseline`. It also carries
   the **E2E time budget** (`scripts/e2e-budget.mjs`), because the nightly is the only run whose
   aggregate is comparable night to night - everything else tests a subset. The budget enforces
   the MEAN per test and only reports the total: shipping a spec with a new pack is healthy
   growth and must not fail a gate, while tests getting slower is the regression worth catching.
   Raising the ceiling is a deliberate act, argued in the commit that does it. Its rolling
   issue names **the commits since the last green nightly**, which is what keeps a red night
   from turning into a bisect.

   **`nightly-drift` (`.github/workflows/nightly-drift.yml`)** is its belt, twice a day: it
   alarms when NO nightly has run in 26 hours. A red nightly files an issue; an absent one
   looks exactly like a healthy night, which is the same shape as the outage this runbook
   exists for. The window is generous because GitHub delays scheduled runs under load - a
   23:43 cron here was observed running at 01:11 - and can drop them; two check slots mean one
   dropped slot cannot hide a missing nightly. It lives in its own workflow deliberately: a
   check inside `nightly.yml` could not fire when the nightly did not.
2. **Vercel** builds production from **`main` only** (project `noacg-studio`,
   team `noacg`, production URL <https://noacg.studio>). Every push to
   `main` triggers a production deployment via the Git integration; CI and Vercel run in
   parallel and do not gate each other (see "Known limits").
3. **`deploy-verify` (`.github/workflows/deploy-verify.yml`)** watches the deployment:
   - a **failed** production deployment becomes a red run on that commit;
   - a **successful** one is verified live: `https://noacg.studio/version.json`
     (written by `scripts/write-version.mjs` at the end of `npm run build`) must serve that
     commit (or a newer `main` commit containing it), and `/` and `/app` must answer;
   - a **drift check** four times a day alerts when production does not contain the newest
     `main` commit older than 90 minutes - the belt for "no deployment was even created".

   The drift check is a belt, not the alarm: it found the 2026-08-07 config refusal about seven
   hours after it started, because it runs four times a day and GitHub dispatches a schedule
   1-2 h late. So CI's **`Vercel accepted the commit`** job (`ci.yml`, `main` only) asks the
   same question in the run that is already happening: it polls the `Vercel` commit status for
   up to five minutes and reds the run with the refusal's own words. A missing verdict is not a
   refusal - it says so and leaves the case to the drift belt. It is deliberately **outside the
   CI gate**: a deploy fault is not a code fault, and the production rolling issue belongs to
   deploy-verify.

## Alerting (rolling issues - one per failure class, no duplicates)

Nine self-closing rolling issues, all following the weekly-audit pattern (one open issue,
one comment per newly failing commit, the same commit never alerts twice, auto-closed by
the next healthy state):

| Issue title | Raised by |
|---|---|
| `CI is red on main` | the CI gate, on a red `main` run |
| `Production is not running the latest main commit` | deploy-verify: failed deploy, failed live verification, or drift |
| `Nightly full test suite is red` | nightly: the full suite or a catalog gate failed - the body lists the suspect commits |
| `Hosted-latency suite is red` | nightly: the configured specs against a HOSTED project, where latency-shaped defects live |
| `Configured (authenticated) E2E suite is red` | configured-suite, on every landing and nightly: the signed-in tier against a local Supabase stack |
| `Nightly sweep has not run` | nightly-drift (twice a day): no nightly at all in 26 h - the belt against a schedule that silently stops firing |
| `Configured suite is not running on its schedule` | nightly-drift: the same belt for configured-suite |
| `Catalog gates are not running on their schedule` | nightly-drift: the same belt for the catalog gates |
| `Weekly dependency audit is red` | weekly-audit (Mondays): a new high/critical advisory |

**They are read back where somebody is already looking.** Filing an alarm and reading it are
two different mechanisms, and for a long time only the first existed: `scripts/main-health.mjs`
reads ci.yml and nothing else, and the landing queue gates on ci.yml alone - deliberately, so
a Docker image pull failing cannot freeze it. So a break in any other tier cost nothing and
slowed nothing down. Issue #56 (`Configured (authenticated) E2E suite is red`) stood for eight
hours and forty-three minutes overnight on 2026-09-05 with three landings stacked on top of it,
and the owner noticed it before the machine did. `scripts/alarm-issues.mjs` now prints whatever
is open at the top of `npm run jobs` and in every session's opening context, from a cache shared
by all worktrees. It is a REPORT and never a gate: gating on these tiers is a separate decision
with a real cost, argued against in the header of `configured-suite.yml` itself. The titles are
checked against the workflows in `npm run build` (`scripts/alarm-issues.test.mjs`), because the
first version of that reader recognised five of the nine and the four it missed were the four
that report SILENCE.

GitHub also emails the pusher on any failed run of their push (account notification
settings, on by default). **Drill:** to prove the alarm path works, push a `main` commit
with a deliberately broken test (or run the drift job via *Actions → deploy-verify → Run
workflow* while production is behind) and watch the rolling issue appear; revert and watch
it close.

## A red run that is not a verdict (GitHub Actions is degraded)

A run can come back `failure` without a single line of this repository having executed, and in
`gh run list` that looks exactly like a real failure. Check before you go hunting for a bug:

    gh api repos/{owner}/{repo}/actions/runs/<RUN_ID>/jobs \
      --jq '.jobs[] | select(.conclusion != "success")
            | {name, conclusion, steps: [.steps[] | {name, conclusion}]}'

The job was **damaged, not failing**, if it shows `steps: []` (killed while queued), a lone
failed `Set up job` step (runner acquisition, before checkout), a `cancelled` nobody asked for -
especially several jobs cancelled in the same second, which is a whole-run kill - or a wall time
past its own `timeout-minutes`. That last one is the counter-intuitive part: **`timeout-minutes`
only runs while a job is EXECUTING**, so it cannot cut short a job stuck in the queue, and the
reported start time is when the job entered the queue, not when it ran.

Confirm against `curl -s https://www.githubstatus.com/api/v2/status.json` (detail in
`.../incidents/unresolved.json`). This is not rare: on **2026-08-06** a critical Actions incident
ran over five hours and damaged three runs here, two on `main`, filing `CI is red on main`
against a commit that had passed every code-testing job twice. It also cancelled a
`deploy-verify` drift job, which files a *different* rolling issue for the same non-reason.

**A damaged run carries no verdict.** There is nothing to fix and nothing to revert. Re-run it
once; if the re-run also queues without starting, that is confirmation, not a reason to wait.
The rolling issue is self-closing, so it clears on the next healthy run - comment on it rather
than closing it by hand, so the record says why it was open. safe-merge Phase 3 has the matching
rule for a landing: a damaged Route A run is no run, so it falls through to Route B.

## The serverless function budget (the >12 functions error)

The Vercel **Hobby plan caps a deployment at 12 serverless functions**. Every file under
`api/` that is not in `api/_lib/` (and not a `.test.ts`) becomes one function. In July 2026
the api/ tree grew to 29 files and **every production deploy failed for days while the repo
stayed green** - the wake-up call this runbook exists for.

The fix was consolidation to **10 functions** via one catch-all per area
(`api/admin/[...path].ts`, `api/ai/[...path].ts`, `api/ai/lite/[...path].ts`,
`api/ai/tasks/[...path].ts`, `api/render/[...path].ts`) plus the standalone entrypoints
that need their own runtime config in `vercel.json` (`api/ai/generate.ts`,
`api/render/start.ts`, `api/render/cleanup.ts`) and the small singles (`api/events.ts`,
`api/me/entitlement.ts`). **A new endpoint goes INSIDE an existing catch-all** (a new route
in its `_lib` router), never as a new top-level file, unless it genuinely needs its own
`functions` entry - and then check the count first.

**`npm run check:function-budget` now counts them in the build gate**
(`scripts/check-function-budget.mjs`), implementing Vercel's routing rule rather than an
approximation: everything under `api/` is a function except paths with an `_` segment and
`.d.ts` files. It prints the headroom on every build (10 of 12 today) and fails over the cap,
so the count cannot climb back to 29 unnoticed. `scripts/check-function-budget.test.mjs`
tests the rule against a fixture tree, since `api/` alone only ever exercises today's shape.

## Traps that already cost days (check these FIRST on a failing Vercel build)

- **Vercel typechecks `api/` with the ROOT `tsconfig.json`, not `tsconfig.api.json`.** The
  root lib is pinned to ES2020 and `tsconfig.api.json`'s lib now matches it, so the local
  gate reproduces production. If a Vercel build dies with a TS error CI never saw (e.g.
  TS2550 on `.at()`), an api file is using a library surface newer than the root lib -
  fix the code, do not widen the lib.
- **The function count** (above): "No more than 12 Serverless Functions" in the build log.
- **An invalid route pattern in `vercel.json` leaves NO trace on Vercel at all.** Config is
  validated *before* a deployment is created, so there is no failed build, no deployment row,
  and a project page that looks idle and healthy - production just keeps serving the last
  commit that deployed. On 2026-08-07 the header source `/join(/(.*))?` (an unnamed group
  inside an optional group - not valid path-to-regexp, though it reads like the `/(.*)` rules
  beside it) stopped eight consecutive `main` commits this way. The only signal is the
  **`Vercel` commit status** on GitHub: `gh api repos/NoaCG/NoaCG-Studio/commits/<sha>/status`
  → `"description": "Deployment failed."` with a `vercel.link/...` target URL naming the class.
  `gh run list` never shows it, because no workflow of ours deploys.
  **`npm run check:vercel-config` now runs this locally in the build gate**
  (`scripts/check-vercel-config.mjs`, over Vercel's own `@vercel/routing-utils`), so this class
  cannot reach `main` again; `scripts/check-vercel-config.test.mjs` mutation-tests the gate.
- Build log access: `vercel.com/noacg/noacg-studio` → the deployment → Build Logs,
  or the Vercel MCP `get_deployment_build_logs`.

## Previews (opt-in, never production)

Production deploys **only from `main`**; a branch push can never replace production - it
would only ever create a Preview deployment. Since dozens of worktree branches are active
at once and CI already builds each of them, previews are **opt-in**:
`scripts/vercel-ignore-build.mjs` (wired as `ignoreCommand` in `vercel.json`) skips the
Vercel build for every non-`main` branch unless the head commit message contains
`[preview]`. The script fails open (builds) on any error.

**`main` builds only when the commit can change what production serves.** The list of paths
that can is `scripts/deploy-affecting-paths.mjs`, and the range measured is
`VERCEL_GIT_PREVIOUS_SHA..HEAD` - the last SUCCESSFUL deployment, so a skipped change is
carried into the next decision rather than forgotten. Vercel clones shallowly, so the script
deepens once and builds if the diff still cannot be read.

Why: measured over the 2026-08-08..2026-09-07 billing cycle, `main` took 719 pushes and
9.31K build CPU minutes for $32.39 against a $20 credit, and **48% of those pushes changed
only documentation, contracts, workflow tooling or tests** - rebuilding a byte-identical site.
Replaying the cycle through the filter leaves 371 builds instead of 718.

**The list is a DENY list, and that direction is the safety argument.** A file is
deploy-affecting unless it is named, so an unrecognised directory builds. The two mistakes are
not symmetric: a needless build costs about $0.045, a wrongly skipped one leaves production
serving an older commit with every gate green. `scripts/deploy-affecting-paths.test.mjs` pins
that property, and pins that every script named by the `build:vercel` line is on the allow
list - add a check there without naming it here and changing that check stops triggering the
build that runs it.

**The drift alarm reads the same list.** `deploy-verify.yml`'s drift check asks
`--last-affecting` for the newest deploy-affecting commit at or before matured `main`, and
expects production to serve that - not simply the newest commit, which would make every
deliberate skip look like a failed deployment.

## What Vercel builds (and why it is not `npm run build`)

`vercel.json`'s `buildCommand` runs **`npm run build:vercel`**, not the full `npm run build`.
The two are deliberately different:

- **`npm run build` is the gate.** Typecheck (`tsc` twice), `eslint`, `depcruise`, the ~30
  `node --test` suites, the repo-shape and shared-instruction checks. It runs on the laptop
  and in CI, and CI gates the merge - so by the time a commit reaches `main` that whole
  chain has already passed on that exact commit.
- **`npm run build:vercel` is the deploy.** It produces the artifact and keeps only the
  checks CI cannot substitute for: `check-vercel-config` and `check-function-budget` (both
  refuse the deployment BEFORE it exists, so a failure shows nowhere on the Vercel dashboard
  - each froze production once), `check-api-route-depth`, and `check-client-secrets` run
  twice - once on source, once against the built `dist`, which is the only place the real
  output is inspected.

Why: Vercel bills Build CPU minutes against the plan's monthly credit, and re-running a
chain CI already passed cost about 78 s of every ~238 s production build - roughly a third
of the monthly credit for zero added safety. Measured on the 2026-08-23 production build:
`tsc` + `tsc -p tsconfig.api.json` + `eslint` + `depcruise` were 65 s, the `node --test`
suites 13 s. The remaining large phase is Vercel's own per-function TypeScript compile of
`api/` (~89 s for 11 functions) which is the builder's, not ours, and has no skip flag.

**If you add a check that must run at deploy time, add it to `build:vercel` too** - putting
it only in `build` means Vercel never runs it. The test for "must" is narrow: it either
inspects the built output, or it catches a failure that is invisible on the dashboard.

## Auth email: confirmations, SMTP, and one trap

The studio signs people in with **email + password** (`signInWithPassword`) or **Google
OAuth** - never magic links (`src/backend/auth.ts`). That matters: with confirmations off,
the email + password path needs no working mail at all, and Google needs none ever. The only
remaining mail dependency is **password reset** (`resetPasswordForEmail`).

**Email confirmation is off** - decided and verified live on 2026-08-24
(`GET /auth/v1/settings` returns `"mailer_autoconfirm": true`). During the student push the point is that
someone can make an account and start working, and we do not need to prove they own the
address. What that costs, so it is a decision and not an accident:

- Anyone can sign up with **someone else's** address. Turning confirmations back on later
  does not retroactively verify those accounts, and a squatted real address is a takeover
  vector against a future reset flow.
- Password reset still sends mail. A student who forgets their password is stuck if mail is
  broken or rate-limited, confirmations or not.

### Confirmations off + Google = the password quietly stops working

**Automatic** identity linking is always on and is NOT the "Allow manual linking" toggle (that
one gates `linkIdentity`/`unlinkIdentity`, which this codebase does not call; it is off).
Supabase links identities that share an email address, and because auto-linking to an
*unverified* address would enable pre-account-takeover, the guard is that linking **removes
any unconfirmed identities** on that user.

With confirmations off, every email/password identity we mint is unconfirmed. So once Google
sign-in is provisioned:

> A student signs up with `x@arcada.fi` + password, then later clicks "Continue with Google"
> on the same address. Supabase links Google to the same user - the account and all their
> work survive - **and deletes the unconfirmed email identity, so their password stops
> working.**

Documented Supabase behaviour, not a bug, but it reads as one from the student's side. The
mirror case: signing up with email after having used Google on that address returns a
deliberately obfuscated response and sends nothing, to block user enumeration. Turning
confirmations back on is what removes this sharp edge.

**Supabase's built-in email sender is a testing facility, not a service.** It sends from a
Supabase address rather than ours, and it is hard-capped at a handful of messages per hour -
a cap the docs say is *only* changeable by attaching custom SMTP. Custom SMTP means pointing
Supabase at an email provider we hold an account with (Resend, SendGrid, AWS SES, Postmark,
Mailgun); Supabase then authenticates to that provider and sends as `noacg.studio`. We do not
run a mail server - the provider does.

Setting it up, when reset mail needs to be reliable:

1. Verify `noacg.studio` as a sending domain with the provider - SPF/DKIM DNS records. **This
   is the step with lead time.** Start it weeks before a production date, not days.
2. Take the provider's SMTP credentials: host, port 587, username, password.
3. Dashboard -> Authentication -> Emails -> SMTP Settings: enable, paste, set sender address
   and name.
4. Dashboard -> Authentication -> Rate Limits: attaching custom SMTP defaults to **30 new
   users per hour**, which is exactly one class arriving at once. Raise it deliberately.
5. Turn **off link tracking** at the provider - it rewrites Supabase's single-use confirmation
   and reset links and breaks them.

## Google sign-in (the button ships; the provider is not provisioned)

**State on 2026-08-24, read from the live project** (`GET /auth/v1/settings` returns
`"google": false`): Google is **not enabled** on the hosted project, while
`SignInDialog.tsx` renders "Continue with Google" unconditionally. Anyone clicking it today
gets an error. The code side is complete - `signInWithGoogle`, the button, and
`[auth.external.google]` reading `SUPABASE_AUTH_GOOGLE_CLIENT_ID` /
`SUPABASE_AUTH_GOOGLE_SECRET` - so this is provisioning work only, done in two consoles.

Step by step, when the time comes:

1. **Google Cloud Console** -> create or pick a project for NoaCG.
2. **OAuth consent screen**: type External; app name, our support email, the logo; scopes
   `email`, `profile`, `openid`. While it is in Testing only listed test accounts can sign in
   - publish it before a class, or every student bounces.
3. **Credentials -> Create credentials -> OAuth client ID -> Web application.**
4. **Authorized JavaScript origins**: `https://noacg.studio`.
5. **Authorized redirect URI**: `https://kprolrchuldgfrzspthy.supabase.co/auth/v1/callback` -
   Supabase's callback, *not* our own URL. This is the field people get wrong.
6. Copy the **client ID** and **client secret**.
7. **Supabase Dashboard -> Authentication -> Sign In / Providers -> Google**: enable, paste
   both, save.
8. **Supabase -> Authentication -> URL Configuration**: Site URL `https://noacg.studio`, and
   the redirect allow-list must cover where the app actually lives. `OAUTH_REDIRECT` in
   `src/backend/auth.ts` is `origin + pathname`, deliberately not the bare origin - so the
   allowed URL is `https://noacg.studio/app`, not `https://noacg.studio`.
9. Verify with `curl https://kprolrchuldgfrzspthy.supabase.co/auth/v1/settings -H "apikey:
   <publishable key>"` - `"google"` flips to `true` - then sign in for real.

**The button is hidden until this is done.** `GOOGLE_SIGN_IN_ENABLED` in
`src/components/auth/SignInDialog.tsx` is `false`, which hides the button and its `or`
divider together; the handler and the OAuth wiring stay in place because nothing about them
is wrong. **Flip it to `true` in the same change as step 7** - the two belong together, and
flipping it early puts the always-erroring button back in front of users.

### Trap: never run `supabase config push`

`supabase/config.toml` is the **local dev** config. Its `site_url` is
`http://localhost:5174`, and the CLI offers `config push` with no `pull` and no diff - so a
push overwrites the linked production project's site URL with localhost and breaks every
OAuth redirect and password-reset link in production. Auth settings on the hosted project are
changed in the **dashboard**; the toml is kept in step by hand, as a record of intent.

## Where to look when production stops updating

1. **The rolling issues** (above) - if the machinery works, the answer is already filed.
2. `gh run list --limit 15` - is `main` red (which gate?), or green but undeployed?
3. Vercel dashboard / MCP `list_deployments` - is there a production deployment for the
   commit at all, and did it ERROR (open build logs; check the traps above)?
4. **No deployment row for the commit?** Read the `Vercel` commit status on GitHub before
   suspecting the webhook - a rejected `vercel.json` fails there, silently and invisibly on
   Vercel's side (trap above). `ignoreCommand` is the other cause, but it never skips `main`.
5. `curl https://noacg.studio/version.json` - what commit is actually live?
6. E2E-red-without-a-code-fault has four known non-code causes (stale dev server, parallel
   sessions on one checkout, HMR ghost modules, offline pin vs a manual server) - reproduce
   locally with `npm run test:e2e -- <spec>` before assuming the code broke.
7. **A user on a school/corporate network who "can't use the site": have them open
   `https://noacg.studio/app?diag=1`** and send a screenshot. That is the CONNECTION CHECK -
   an inline script in `app.html`, so it runs even when a filtering proxy blocks the app's
   JS chunks - and it names what the network or browser policy is blocking (app files,
   fonts, /api, IndexedDB, the sandboxed preview frame, third-party internet). The same
   inline script is the boot watchdog: a boot that never mounts paints a plain-HTML
   diagnosis pointing there instead of a white screen. Pinned by
   `e2e/network-resilience.spec.ts`; born from the 2026-08-20 Yle demo failing inside the
   wizard on Yle's restricted network with nothing recorded anywhere.

## Known limits (deliberate, revisit when they hurt)

- Vercel deploys `main` without waiting for CI: a bad merge can be live for the minutes
  until the gate reddens. The repo-side fix would be deploy-on-workflow-success (CI-driven
  `vercel deploy --prebuilt` or Vercel's "only deploy when checks pass" project setting);
  adopt it if a red-but-deployed `main` ever causes real damage. The safe-merge flow verifies
  the exact commit it promotes before anything lands, so `main` should be red only when a
  merge race slips through - and both alarm classes above catch it within minutes. Its gate
  covers e2e for a reason: until 2026-07-30 the flow gated on `build` alone, which runs no
  e2e spec at all, and four template packs landed in a row that each passed it while leaving
  `main` red for two hours on `catalog-baseline.spec.ts`. A gate that cannot fail the way
  production fails is not a gate.
- **That verification now happens in CI, not on the developer's machine.** `ci.yml` triggers
  on every branch push (not just `main`), so safe-merge's Phase 3 waits for the run whose head
  SHA is exactly the commit being promoted and cites it, falling back to the local
  `npm run build` + `npm run test:e2e:focus:queued` pair only when no such run exists. This is
  more coverage, not less: CI adds the factory gates and runs the affected plan across up to
  nine shards on a clean checkout, in about ten minutes of somebody else's compute. The local
  pair was costing far longer than that and taking the machine out of service while it ran -
  measured on a Ryzen 7 5800H / 16 GB laptop at 59 concurrent browser shells and 35 MB of
  free RAM, which is a paging laptop, not a test run.
- The drift check trusts `version.json`; if the endpoint is unreachable the check alerts
  rather than guessing.
