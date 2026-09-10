# Stack freshness — what rots, and what watches it

Everything this project depends on falls into one of two groups: things `npm` can see, and
things it cannot. The second group is the dangerous one, because nothing in the normal
development loop ever mentions it. This document is the register of both, and it names the
check that watches each — a list nobody runs is a list that goes stale itself.

The whole time-driven half runs in **`.github/workflows/weekly-audit.yml`** (Mondays 06:00
UTC, `workflow_dispatch` for an on-demand run) and files ONE rolling, self-closing issue.
Run it locally with:

```bash
npm run check:freshness
```

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

Exit codes are three-valued: `0` clean, `1` new findings, **`2` could not check** (no token, or
no baseline yet). "Could not check" is deliberately not "clean".

The baseline is recorded: **70 findings** as of 2026-08-03 — 49 security (19 authenticated and 13
anon `SECURITY DEFINER` functions, 16 deny-all tables, leaked-password protection) and 21
performance (11 unindexed foreign keys, 8 unused indexes, 2 overlapping policies).

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

**Not in CI.** It needs a Management API personal access token and `weekly-audit.yml` is
secret-free on purpose. Whether it ever joins is a decision about putting a Supabase token in
Actions, and should be made deliberately rather than drifted into.

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
