# Stack freshness — what rots, and what watches it

Everything this project depends on falls into one of two groups: things `npm` can see, and
things it cannot. The second group is the dangerous one, because nothing in the normal
development loop ever mentions it. This document is the register of both, and it names the
check that watches each — a list nobody runs is a list that goes stale itself.

Most of the time-driven half runs in **`.github/workflows/weekly-audit.yml`** (Mondays 06:00
UTC, `workflow_dispatch` for an on-demand run) and files ONE rolling, self-closing issue.
Run it locally with:

```bash
npm run check:freshness
```

The one time-driven job that is not in that file is
**`.github/workflows/e2e-durations-refresh.yml`** (Mondays 05:30 UTC), because it is the only one
that PROPOSES a change instead of reporting one — it opens a pull request against the measured
shard table. It is kept separate so the audit job stays read-only, and its own section is at the
end of Group 2.

**A third kind of staleness lives outside this document: harness capability observations.**
`scripts/harness-capabilities.json` records what Claude Code, Codex and Antigravity were each
measured to do, pinned to the CLI build that was running at the time. `npm run harness:usage`
compares each entry's `measuredOn` against the installed build and reports every one that has
gone `UNVERIFIED` since — the same report-never-auto-upgrade posture as the rest of this
document, but for CLI behaviour instead of package versions. Nothing re-probes them on a
schedule yet; each one is re-measured by hand, by running the command its own `reprobe` field
names, whenever a routing decision leans on it.

## The rule: report, never auto-upgrade

No automated dependency bumps, and no Dependabot. This is a deliberate call, not inertia:

- **Remotion is exact-pinned in three package files** (`package.json`, `render-worker/`,
  `player-host/`) and they must move together. The split exists so a source-available licence
  never enters the AGPL bundle.
- **`@vercel/sandbox` is exact-pinned** and runs the render worker. It is pinned to the version
  `@remotion/vercel` is built against, and **its peer range is not evidence of anything**:
  `@remotion/vercel` declares `@vercel/sandbox: ">=1.0.0"`, so npm will happily install a v2 that
  its own compiled code cannot call. v2 removed the `sandboxId` API entirely — sandboxes are
  addressed by `name` with session resume — while `@remotion/vercel@4.0.488`'s built output still
  calls `Sandbox.get({ sandboxId })` and reads `sandbox.sandboxId` (`dist/index.mjs`, three
  places). Our own three call sites in `api/_lib/executorSandbox.ts` fail typecheck, which is the
  visible half; the dependency's calls fail at RUNTIME on a real hosted render, where no local
  gate looks. **Checked 2026-08-03 against 2.9.2 and reverted.** It unblocks only on a
  `@remotion/vercel` release built against v2 — check its compiled code, not its peer range.
- **The Vite build target must stay `es2017`** while CasparCG 2.3.x is supported
  (docs/CLOUD_PLAYOUT.md §3). A 2.3.2 client embeds a Chromium 71 CEF that rejects `?.` and
  `??` outright — a dead layer with nothing in the log. No automated gate catches this class.

An auto-merged upgrade can satisfy every check in CI and still take playout off air. So the
machine's job is to notice; applying an upgrade stays a human step with the relevant
verification attached.

## Group 1 — npm can see it

| What | Watched by | Blocking? |
|---|---|---|
| Root dependencies, advisories | `npm audit --audit-level=high` | yes |
| Root dependencies, staleness | `npm outdated` | no — a new release is news, not a fault |
| `render-worker/`, `player-host/` | `npm --prefix … outdated` | no |
| Playwright browser binaries | follows the `@playwright/test` bump | n/a |

The audit threshold is `high` on purpose. Low and moderate advisories that have been read and
accepted belong in the staleness report, not in a weekly alarm — an alarm that cries about
something you have consciously accepted trains you to ignore it. **`npm audit` currently reports
zero, and keeping it there is the point:** a clean run is only useful as a signal while nothing
in it is routinely ignored.

**The browserslist advisory, and the shape of a finding that is simply FIXED (2026-09-08).** The
two entries below are overrides taken because no upgrade existed, which makes them the memorable
cases and therefore the wrong template. This one was the ordinary kind and is written down so the
ordinary kind has a precedent too: `browserslist <=4.28.6` (GHSA-c83g-rgw3-j3cx unbounded memory
growth, GHSA-73wf-gq98-2v4g prototype write via untrusted `browserslist-stats.json`), high, one
transitive dev dependency of `@babel/helper-compilation-targets`, patched in 4.28.7.

Neither advisory could reach this build — we ship no `browserslist-stats.json` and run no
long-lived browserslist process — but **the gate does not grade risk, and it should not.** A high
advisory with a patch inside the range its parent already declares costs one lockfile bump, and
arguing about reachability costs more than taking it. `npm update browserslist --package-lock-only`
moved six lockfile entries, all of them browserslist's own data packages (`caniuse-lite`,
`electron-to-chromium`, `node-releases`, `baseline-browser-mapping`, `update-browserslist-db`),
touched no other file, and `npm run build` stayed green — which is the check that matters, because
browserslist feeds autoprefixer.

It was red for six days and cost the weekly alarm two consecutive Mondays. The reason it sat is
worth more than the fix: **the audit does not gate the merge queue, which reads `ci.yml` alone**,
so a red weekly survives every landing until a person reads it.

**The `dompurify` override, and what it does NOT do (2026-08-04).** `package.json` pins
`overrides: { "dompurify": "3.4.13" }`. Upgrading `monaco-editor` could never have closed those
advisories — monaco pins dompurify exactly, so its version moves only when monaco's does (0.55.1
carried 3.2.7, 0.56.0 carries 3.4.8, the advisory covers `<=3.4.11`, the fix landed in 3.4.12,
and `npm audit fix --force` "solves" it by DOWNGRADING monaco to 0.53.0). The override was taken
deliberately, for audit hygiene rather than for a live exposure.

Be precise about its effect, because it is easy to overstate: **it changes the dependency graph
npm audits, not the code we ship.** `monaco-editor`'s ESM build — the one Vite bundles — imports
`./dompurify/dompurify.js`, a copy VENDORED inside the package at 3.4.8, and never imports the
npm `dompurify` package at all. So the override silences the finding and carries no regression
risk, and equally no runtime benefit. Which is why the vendored copy is listed in Group 2 below:
after this change, a green `npm audit` says nothing about the sanitizer that actually runs.

The advisories were also assessed as unreachable in this build before the override was taken,
and that assessment is the reason nothing more urgent was done. All three are CONFIG-path bugs:
`CUSTOM_ELEMENT_HANDLING` bypassing `afterSanitizeElements`, `ALLOWED_ATTR` pollution via
`setConfig()`, and a Trusted Types policy surviving `clearConfig()`. Monaco's `domSanitize.js`
calls `purify.sanitize(untrusted, …)` with a per-call allowlist, removes all hooks in a
`finally`, and never calls `setConfig()` or `clearConfig()` nor passes `CUSTOM_ELEMENT_HANDLING`.
Nothing in `src/` imports dompurify directly. **Recheck those three call-site facts, not the
advisory text, if monaco's sanitizer is ever rewritten** — that is the assumption that would
break.

**Remove the override when monaco vendors 3.4.12 or newer**, or it silently holds a future
dompurify back. Nothing enforces that; it is why it is written here.

**The `path-to-regexp` override (2026-08-13).** `package.json` pins
`overrides: { "path-to-regexp": "6.3.0" }`, closing the ReDoS advisory (GHSA-9wv6-86v2-598j,
range `4.0.0 - 6.2.2`) that `@vercel/routing-utils` drags in. As with dompurify, no upgrade
existed: 6.4.1 IS the latest routing-utils, and it declares `path-to-regexp: 6.1.0` exactly
while carrying the patched 6.3.0 alongside it as the alias `path-to-regexp-updated`. `npm audit
fix --force` "solves" this by DOWNGRADING routing-utils to 4.0.0 — the package
`check:vercel-config` is built on, and the one thing standing between an invalid `vercel.json`
and a production freeze (`docs/DEPLOYMENT.md`). Never take that fix.

The override just promotes the exact pin to the version upstream already ships beside it, so
it is a smaller change than it reads as. It is also DEV-only in a second sense: routing-utils
is a devDependency used by one build-time script that parses our own committed `vercel.json`,
never a user's input, so the backtracking blowup had nothing to reach it with.
`npm run check:vercel-config` and its seven tests — including every negative case, which is
what exercises the regex compiler — pass on 6.3.0. **Remove the override when routing-utils
declares a patched `path-to-regexp` itself**, or it holds a future one back.

Both overrides existing at once is the signal worth reading: three of the last four high
advisories here were in build tooling that no user ever loads. That is exactly the noise the step
ordering below defends against. But only two of the four needed an override — browserslist above
had a patch waiting — so **check for an upgrade path before reaching for one.** An override is
what you take when there is nothing to take.

**`npm audit` runs LAST in the job on purpose (2026-08-13).** It used to run first, and a step
that exits non-zero ends the job — so from 2026-08-03 to 2026-08-13 two dev-only advisories
kept `check:vendored` and `check:models` from running at all, for three consecutive weeks. Those
are the checks that exist precisely because npm cannot see what they watch, and `check:models`
is the only one here that catches a failure production alone would show. The noisiest input must
never be able to hide the quietest signal; anything that can block one runs after it.

The threshold cuts the other way too, so read the severity rather than the count: on 2026-08-03 a
**high** undici advisory (response desynchronization; cross-user disclosure) sat in this list
unnoticed behind two moderates, which means the blocking gate was genuinely failing and not
merely reporting accepted noise. Both copies were fixable inside the ranges their parents already
declared.

Playwright gets no separate check. The actionable signal is the package bump, which `npm
outdated` already reports; the browser revision follows from it.

## Group 2 — npm cannot see it

This is why this document exists.

### Vendored libraries — `scripts/check-vendored-versions.mjs`

`src/assets/gsap.min.js` and `src/assets/lottie.min.js` are **committed files**, not
dependencies. They are bundled locally because a generated template must play offline with no
CDN reference (`root/keep-generated-template-self-contained-runtime`) — which means they ship
inside every graphic every
user exports, and no dependency tool has ever had an opinion about them.

The check reads each file's own version banner and compares it against the npm registry. It
reads the banner rather than a version recorded beside it, because a number kept separately
goes stale exactly when someone updates the library without updating the note.

When it fires, upgrading is a real piece of work, not a version bump: the new file has to be
re-minified into place, and its output re-checked against the es2017 floor above.

### A library vendored inside a DEPENDENCY — monaco's DOMPurify

GSAP and Lottie are vendored by us, in files we can see in a diff. `monaco-editor` vendors one
too: `esm/vs/base/browser/dompurify/dompurify.js`, currently 3.4.8, imported by relative path
from `domSanitize.js`. It is the sanitizer that actually runs in the editor — hover tooltips and
suggest documentation — and **no tool here has an opinion about it.** `npm audit` reads the
declared dependency graph, where the `dompurify` entry is a different artefact that monaco's ESM
never imports; since 2026-08-04 an override pins that entry to 3.4.13, so audit reports zero
while the vendored 3.4.8 keeps running (Group 1 above says why that was accepted).

`scripts/check-vendored-versions.mjs` reads it, as a third entry beside GSAP and Lottie — same
method, the file's own banner rather than a number recorded next to it. It differs from those
two in three ways, each written into the entry:

- **`optional`** — it lives in `node_modules`, so a checkout with no install has nothing to
  read. That prints `NOT CHECKED` and does not pass: "could not look" is never "looked, fine".
- **`advisory`** — a lag is REPORTED under "worth knowing", never counted as a finding, and
  never touches the exit code. Nothing here can act on it; the file moves only when monaco
  publishes a release vendoring a newer copy. A row that goes red the moment upstream diverges
  and stays red for months is the standing alarm Group 1 above refuses to keep.
- **`scan: Infinity`** — the banner sits far past the first few KB, unlike the two minified
  bundles.

Advisory does NOT mean unmonitored: a file that is present but whose banner no longer matches
is a hard finding, because that means the upstream layout moved and the row has silently
stopped measuring anything. Today it reports
`fyi dompurify vendored 3.4.8 latest 3.4.13`.

What it still cannot do is decide for you. On the next monaco upgrade, read that row and the
advisories against the version it names rather than trusting a green `npm audit` — and drop the
`dompurify` override once the vendored copy reaches 3.4.12 or newer.

### Pinned model ids — `scripts/check-model-ids.mjs`

Every managed-gateway id hard-coded in `src/ai/` and `api/_lib/` (`PRO_STANDARD_ROUTES`, the Lite
profile, `aiModelCatalog`, the settings picker), checked against the live public listing.

**This is the only staleness in the stack that fails in production rather than in a build.**
Nothing references a *version* of a model id — the id IS the contract — so typecheck, lint,
the e2e suite and every gate stay green while a real user's generation returns a provider
error. Providers retire ids on their own schedule and nothing tells us.

It reads only literals in route position (`model: '…'` / `id: '…'`) in shipped source, never in
tests or comments, so a candidate discussed in a comment is not mistaken for one we route to.
The listing endpoint is public: no key, no tokens.

The video harness already syncs its own catalog (`npm run video:models:sync`); this covers the
SPX/Lite/Pro routes, which had nothing watching them.

**All four providers are covered, but only two without a key.** The Vercel AI Gateway listing and Hugging Face are
public and always checked. OpenAI and Anthropic need a key, taken from the real environment or
from the checkout's `.env` through `scripts/read-dotenv.mjs` (the one definition of that, shared
with the advisor check); without one they are reported **NOT CHECKED** and never counted as ok — "could
not check" is not "clean" — but they do not fail the run, because the weekly workflow is keyless
by design and a permanent red there trains everyone to ignore it.

So the weekly job checks 12 of 16 ids; a local `npm run check:models` checks all 16.

This split exists because the gap bit once. The check began gateway-only and caught
`openai/gpt-5.6`; the second dead id was one entry above it in the same file, on the direct-OpenAI
provider the check could not see, and only a manual listing call settled it.

Two things it took a mutation test to get right, both worth keeping in mind if you extend it:
the Hugging Face Hub answers an unauthenticated request for a nonexistent repo with **401, not
404** (it will not leak which private names are taken), so treating only 404 as missing reported
a dead id as UNCHECKED; and `settings.ts` must not also be scanned for slashed route literals,
because `openai/gpt-oss-120b` is a Hugging Face repo id in one entry and a gateway route in
another — attributing every slashed id to the gateway would report a HF-only model as gone from a
listing it was never in.

### Things with no version at all — the `MANUAL_REVIEW` table

A woff2 carries no version string, and a Supabase platform upgrade is a dashboard action that
never appears in git. Neither can be checked; both can be *reviewed*. The table in
`scripts/check-vendored-versions.mjs` records only when someone last looked, and the check goes
red when the interval elapses.

Provenance for the bundled faces is deliberately NOT duplicated here — it already lives in one
place, `src/assets/OFL.txt`, which names every upstream project (src/export/AGENTS.md owns that
rule). Update `lastReviewed` when you actually check, not when the reminder fires.

The third row is a different animal and shows what else this table is for. **`gsap-licence`** is
not a file at all: it is the written clarification we owe ourselves from Webflow/GSAP on the
prohibited-uses clause, which covers tools "that allow users to build visual animations without
code" (`docs/OGRAF_FIRST_REVIEW.md` §11). Only the owner can ask it - it needs an identity we do
not hold - and on 2026-09-05 he ruled it not yet, and asked to be reminded in six months. A
reminder with a date is a mechanism, so it became a row here rather than a note somewhere:
the weekly audit goes red around 2027-03-04 and files the rolling issue he watches. Nothing about
the standing requirement changed in the meantime - preserve GSAP’s replaceability, per the
GOALS ladder.

### Node

`.nvmrc` and an `engines.node` field in all three package files pin Node 24, matching the
`node-version: 24` every workflow already hard-codes and giving Vercel an explicit runtime
rather than a default. There was no pin at all before, which is the same shape as the
`tsconfig.api.json` trap: local and deployed toolchains diverging with nothing saying so.

### Supabase advisors — `scripts/supabase-advisors.mjs` (`npm run check:advisors`)

Security and performance advisor findings, diffed against `supabase/advisor-baseline.json`.

Most of what the advisors report here is the project working as designed and will never clear:
~30 `SECURITY DEFINER` functions callable by `anon` (the capability-URL model — a CasparCG or OBS
client holding an output slug is unauthenticated by construction) and 16 tables with RLS enabled
and no policies (which is deny-all, the *stricter* posture; the linter cannot tell that from
"forgot to write policies"). A permanent wall of forty-plus warnings trains you to ignore the
report, and then a genuinely new one arrives into a list nobody reads.

So the baseline records what has been seen and accepted, and the check alarms only on what is
new — the same shape as `scripts/overflow-sweep.mjs`, for the same reason. The per-class reasons
live in `ACCEPTED_CLASSES` in the script.

**A new member of an accepted class still fails.** A new table with RLS and no policies is
exactly the case worth catching, so the reason explains the class without admitting its future
members. A finding that *disappears* is reported but never fails — good news must not be an
alarm — though it should be re-recorded, or the baseline decays into a list of things that no
longer exist.

Exit codes are four-valued, and the split between the two "could not check" codes is whose defect
it is: `0` clean, `1` new findings, **`2` could not check and the fault is ours** (no token, no
project ref, no baseline, a baseline whose shape changed, a bug in the script), **`3` could not
check and the fault is upstream** (the Management API would not answer, or answered something that
could not be compared). "Could not check" is deliberately not "clean", and neither is `1` —
post-land reds on `1` and `2` and only warns on `3`, so an outage must not borrow the code that
means "somebody shipped something new", and a deleted baseline must not quietly switch the alarm
off while every landing stays green.

The baseline holds **109 findings** as of 2026-09-24. The last full breakdown was taken at 70 on
2026-08-03 — 49 security (19 authenticated and 13 anon `SECURITY DEFINER` functions, 16 deny-all
tables, leaked-password protection) and 21 performance (11 unindexed foreign keys, 8 unused
indexes, 2 overlapping policies) — and the growth since is the same two classes.

**The token comes from `.env` or the environment.** `SUPABASE_ACCESS_TOKEN=<token>` in the
checkout's `.env` is enough — the script reads it through `scripts/read-dotenv.mjs`, the same
shared reader the model check uses, and a real environment variable still overrides the file.
Create the token at <https://supabase.com/dashboard/account/tokens>. It reads `.env` rather than
only the environment because every other key here lives in that file: a check that reported "not
set, so nothing was checked" on a fully configured machine looked like a missing token instead of
a missing `export`, which is the most misleading answer it has.

Re-record after a deliberate change:

```bash
node scripts/supabase-advisors.mjs --update-baseline
```

Read the diff before committing it — recording accepts everything currently reported.

**The live fetch path was proved on 2026-08-03** and agrees with the baseline exactly: `70 advisor
findings; 70 accepted in the baseline. No change against the baseline.`, exit 0. That matters
because the baseline itself was first recorded through the Supabase MCP connector rather than the
Management API — same data and same `cache_key` identities, but a different door, so until that
run nothing had exercised the HTTP path. It now has, and the two doors agree. If a future run
disagrees, suspect the fetch before suspecting the database.

Errors in a baseline fail in the safe direction, which is why hand-assembling one was acceptable:
a missing entry makes its finding read as NEW and turns the run red, and a key that does not exist
shows up as "gone". Neither can silently accept something.

**It runs in `post-land.yml`, after the step that pushes migrations, and a new finding turns that
run red (2026-09-16).** That is the only moment it can run: it reads the live project, so a new
definer function is there to be found only once the migration creating it has applied, which
happens after the merge. Post-land already holds the token, inside the `production` environment.

It is not in `weekly-audit.yml`, which stays secret-free. That workflow has `workflow_dispatch`
and no environment, so a token there would be readable by YAML on whatever branch someone
dispatches it from — post-land's is scoped to an environment — and it would answer a week late
about a database that changes on landings.

**Failing the job is deliberate, and the alternative was a `::warning` on a green run.** Post-land
runs after the merge, so this is an alarm and can never be a gate. But the defect it replaces was
a gate nothing ran, which sat red for thirteen days unnoticed; a warning inside a run that
concludes `success` is that same defect with a paper trail. A red conclusion is the channel this
repo already reads — `scripts/ci-watch.mjs` polls every run and logs each red one — and it is
what a failed `db-push` in the same job already uses to say the same kind of thing.

**When it fires**, read the finding in the run log. Either it is a real mistake, and the fix is a
migration; or it is another member of a class `ACCEPTED_CLASSES` already accepts for a reason that
holds for this occurrence too, and the fix is to re-record the baseline with the judgement written
down. Check the live database rather than the migration text — the migration is a claim, and the
advisors report on what is actually there.

**The finding is not always the landing's own.** The step runs on a failed push too, so a landing
that only broke the staging half can still surface production's news; and when Supabase ships a
new advisor lint, every existing object matching it reads as new on whatever lands next. So read
what the finding names before assuming the author caused it — and when you re-record, say in the
commit which migration actually introduced it.

**The decay this was written to stop, measured once: 2026-09-16.** The gate had been green on
2026-09-09 and ran nowhere. Seven days later it was red at 110 live against a 106 baseline — four
findings from migration 0060's two slug-addressed functions — and nothing had said a word. The
four were read against the live database and accepted: `anon` holds no privilege at all on
`control_shows`, so those functions are the only door, and the one that writes the column
wholesale (`control_data_apply`) is `service_role` only. Baseline re-recorded at 110.

**The second re-record, 2026-09-24: 109.** Post-land went red on every landing after pull request
#402 (runs 36029914027 and 36044954410) on one new INFO finding, `unused_index` on
`agent_packages_user_created_idx`. Migration 0065 (`0065_agent_packages.sql`) introduced it: the
index backs the waiting-packages list on Home -> Productions, and it was unused only because nobody
had opened that list in production yet. It belongs to the class `ACCEPTED_CLASSES` already accepts
for indexes of features production has not exercised, and the reason holds for this member too.
By the time it was read, production had scanned it (`pg_stat_user_indexes`, read at about 20:25 UTC:
5 scans, the latest at 20:12 UTC), so the live report no longer carried it and the re-record does not
either. The same
runs reported `render_jobs_active` (0007) gone, for the same reason in reverse: production used it
at 03:30 UTC that day, so a render job has read the queue. 0065 did not cause that one. The
baseline dropped that entry and holds 109.

The shape is worth knowing: every migration that adds an index lands an `unused_index` finding,
and post-land stays red on every landing after it until production uses the index or somebody
re-records. The baseline cannot be recorded ahead of the landing, because production does not
have the index yet. That is the rule "a new member of an accepted class still fails" doing what
it says, and for this one INFO class it is noise that can hide a real finding.
`docs/backlog/new-index-reddens-post-land-until-re-recorded.md` holds the proposed fix. Until it
lands: read it, re-record, and name the migration.

Accepting that reachability is not a claim that the door's own guard is tight, and on this
occasion it is not — `docs/backlog/the-operator-door-guards-a-branch-and-not-a-leaf.md` measured
the hole the same day, and migration 0061 is the fix. The two judgements are separate on purpose:
the advisors ask who can call a function, and a bug inside the function is not answered by
revoking a grant the product needs.

### The measured E2E shard table — `.github/workflows/e2e-durations-refresh.yml`

`scripts/e2e-durations.json` says how long each spec file takes and what a shard costs besides its
tests. CI divides the suite by those numbers (`packShards`) and judges whether a shard fits its
20-minute cap by them, so they are not documentation — they are an input to a gate.

**They can only be measured on CI's hardware, from a green FULL run on `main`,** and blob artifacts
expire after 7 days. That is what makes this a freshness problem rather than a test: no laptop can
produce the number, and no commit makes it wrong on its own. The suite simply grows, specs get
slower, and the table describes a suite that no longer exists — 15 days of it in August, 12 more in
September, both while `npm run check:e2e-durations` said so correctly inside the weekly report.

So the refresh is a job now. Weekly, it re-records from the newest green full run and opens a pull
request when the recording clears a threshold tied to a real cost: a spec file nobody has measured,
10% on the suite total, a minute on a shard's budget, or 1.5 table-minutes off the slowest shard
(`REFRESH_THRESHOLDS`). Below those it throws the recording away and stays quiet. The two that could
fire on noise sit above a measured floor - two green full runs an hour apart, recorded over the same
151 spec files, disagreed by 4.0% on the total and 0.6 table-minutes on the slowest shard.

**It proposes; it never pushes.** A job that both measures the shard budget and commits the
measurement is a gate editing its own budget, so the pull request carries no `noacg/reviewed`
stamp, no `land` label and no auto-merge, and a person takes it through the queue. Read the diff
the way you would read a re-recorded advisor baseline: recording accepts whatever the run reported.

By hand, the same thing: `npm run record:e2e-durations`, or `node scripts/e2e-durations.mjs
--refresh` for the recording plus the verdict on whether it was worth having.

## Standing upgrade debt

Two deliberate exceptions, both waiting on the same upgrade, and one pin that must not be tidied.

- **`react-hooks/refs` and `react-hooks/set-state-in-effect` are OFF** in `eslint.config.js`. They
  flag the intentional state-mirrored-into-a-ref and reset-dialog-on-open patterns. Revisit both
  when React 19 / the Compiler goes in - not before, and not one at a time.
- **zustand 5** is the other half of that upgrade and has not been attempted.
- **`@emnapi/core` and `@emnapi/runtime` are pinned in devDependencies ONLY** so a
  Windows-written lockfile passes `npm ci`: npm omits the wasm binding's dependencies when the
  native binding installs, a known optional-deps bug. **Do not "clean up" those pins.** Verify
  `npm ci` locally after any lockfile regeneration.
