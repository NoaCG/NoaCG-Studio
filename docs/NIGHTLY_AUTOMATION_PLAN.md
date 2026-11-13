# Nightly automation - the plan

A design doc (not yet built) for **nightly recurring automation** in this repo. Two goals:

1. **Generate** new broadcast graphics every night and land them **for a human to review and possibly
   publish** to the community gallery - **never auto-published**.
2. **Health-check** the repo and the hosted stack nightly (build, E2E, dependency/security, content
   quality) and surface anything broken.

It reuses what already exists: the Claude provider (`src/ai/claudeProvider.ts`, forced `emit_template`
tool), the validate + bench gate (`src/validation/` + `src/community/gate.ts`), the headless bench
harness (`scripts/ai-bench.mjs`), and the Era 5.5 community backend (`community_templates` + the 🛡
moderator queue).

> Status: **job A is BUILT, re-scoped by trigger** (2026-07-21): the commit-driven gates
> (build + offline E2E + the template-factory gates — six promotion gates, pack taxonomy,
> literal token drift) run in `.github/workflows/ci.yml` on every push and PR, and the
> time-driven check (`npm audit` at the high/critical threshold + a staleness report) runs in
> `.github/workflows/weekly-audit.yml` on a Monday cron with a rolling failure issue. A
> scheduled repeat of the lockfile-pinned gates would only re-prove yesterday, which is why
> job A split by what actually drifts. Both are secret-free. This closes Phase 3's
> scheduling-harness item (docs/noacg-master-goals.md). **Jobs B/C (generation + staging + the
> review agent) remain PLAN ONLY** — they spend real API money nightly, require migration
> `0012`, and wait on the §10 decisions; if B lands, a nightly cadence returns with it. Read
> `docs/ERA5_PLAN.md` and `docs/GOALS_ARCHIVE.md` first; this plan slots in as a new operability layer
> on top of the shipped Era 5.5 community feature.

---

## The long-term product direction (committed vision, not yet scheduled)

This nightly job is the first step toward a standing product capability:

> **The site continuously generates and publishes new premium-quality broadcast graphics - so a huge,
> free, ready-made library covers almost any use case a user could need.**

Concretely, the destination is:

- **A large free library** of high-quality broadcast graphics that grows on its own, on a regular
  cadence (e.g. nightly). Users arriving with a need should almost always find something ready to use.
- **Broad coverage on every axis** - use case, format, style, and occasion. Across categories:
  lower thirds, titles/opens, timers/countdowns, tickers, scoreboards, event graphics, holiday &
  seasonal graphics, sports graphics, news graphics, social-media formats (vertical/square), and other
  useful templates. Generation should deliberately spread across this space (rotate categories,
  styles, palettes, and topical/seasonal occasions) rather than churning out variations of one thing.
- **An automatic quality + safety gate that can stand on its own.** Before anything is published, it
  must pass automated checks; anything **broken, low-quality, inappropriate, off-brand, or otherwise
  not good enough is auto-rejected** and never appears on the site. The gate is the platform's
  responsibility, not the model's - the same posture as the export validator and the community
  publish gate.

**The trajectory (how the plan below leads here).** The two are not in conflict; they are phases:

1. **Now (this plan): human-reviewed.** Every draft lands as `pending` and a human approves it. This
   is the safe default *and* it produces the labeled approve/reject signal that tells us how good the
   automatic gate actually is.
2. **Later: trusted auto-publish behind a strong automatic gate.** As the automatic quality + safety
   gate proves it matches human judgment on that accumulated signal, publishing shifts from
   human-approved to gate-approved - graphics that clearly pass go live automatically; borderline ones
   still route to a human; failures are auto-rejected. Human review never disappears; it becomes the
   exception path and the ongoing calibration loop for the gate.

What the automatic gate must eventually cover (beyond today's `publishGate`, which is correctness +
share-safety): **taste/quality** (marketplace-grade, on the DESIGN_LANGUAGE bar, not a tutorial demo),
**motion correctness** (the deterministic multi-timestamp checker in §5), **brand/design-language
conformance**, **appropriateness/content-safety** (nothing offensive, misleading, or legally risky),
and **de-duplication** (genuinely new, not a near-copy of existing library entries). Each is a
buildable check; none needs to exist for phase 1, but the human-review data from phase 1 is what
justifies trusting them in phase 2.

This is written down as **committed product direction**. It does not need to be built now - but the
nightly pipeline below should be built so this is the natural next step (which it is: the automatic
gate is the same `publishGate` + motion + taste checks, and "auto-publish" is just letting a
high-confidence pass skip the human instead of waiting for one).

---

## 0. The one finding that shapes everything (verified against the SQL)

A red-team pass over the guardrail *"a nightly draft can never reach the public gallery without a
human"* **refuted the naive version** of the plan. The facts, from
`supabase/migrations/0004_community_templates.sql`:

- `community_templates.status` **defaults to `'approved'`** (line 57), and the gallery RPCs
  `community_list` / `community_get` return **only `status='approved'`** rows (lines 152, 168).
- The `community_moderation_guard` **`BEFORE INSERT` trigger forces `new.status := 'approved'` for any
  non-moderator writer** (lines 99-104). So a nightly job that just does
  `insert into community_templates(...)` - even if it explicitly passes `status:'pending'` - **is
  silently rewritten to `approved` and goes live immediately.** That is an auto-publish, which the
  brief forbids.
- **`service_role` does not save you.** `BYPASSRLS` suppresses *RLS policies only, never triggers*; the
  trigger still fires, and a `service_role` JWT carries no `sub`, so `auth.uid()` is null →
  `is_moderator()` is false → status is *still* forced to `approved`.
- The **only** identity that can insert a `pending` row today is a **moderator** (the guard skips the
  downgrade for moderators) - **but that same role can also `approve`** (the `community_moderate`
  UPDATE policy). Coupling "can stage a draft" with "can approve a draft" makes the guardrail a policy
  promise, not a structural one.

**Conclusion:** staging AI drafts for review *without* granting the bot the power to publish them
**requires a small schema change** - a dedicated least-privilege staging path. This is migration
**`0012`** below, and it is the linchpin of the whole plan. (See §3.)

Everything else - the generator, the gate, the health checks, the review UI - is reuse.

---

## 1. Principles (inherited + new)

- **Never auto-publish.** A nightly draft is *structurally* incapable of becoming `approved`. The
  only path from draft → gallery is a **human clicking Approve** in the 🛡 Moderation queue. No agent,
  script, or service key can shortcut it. (Made structural by `0012`.)
- **Reuse, don't reinvent.** The generator is `claudeProvider.generate`. The safety gate is
  `publishGate` (`validateTemplate` + `templateBench`). The render/screenshot/overlap harness is
  lifted from `scripts/ai-bench.mjs` + `scripts/ai-compare.mjs`. The review surface is the existing
  🛡 queue.
- **Offline-invariance is untouched.** Nothing here changes the shipped SPA, its bundle, or the
  offline export. All new code is either CI scripts (`scripts/`, `.github/`) or an additive migration.
  A self-hoster who never runs the nightly job sees zero difference.
- **Secrets never enter the bundle.** The Anthropic key, Supabase `service_role`, and the bot's
  credentials live only in CI secrets. `VITE_`-prefixed vars are unchanged.
- **Deterministic where it can be, agentic where it must be.** Pure CI (build, E2E, audit, generate,
  gate, motion-check) runs in GitHub Actions. Judgment that needs an LLM or an MCP tool (taste
  scoring, dedup, Supabase advisors, the digest) runs in a scheduled cloud agent that **only reads and
  reports** - it never mutates the queue.

---

## 2. Architecture at a glance

```
                         ┌───────────────────────────── nightly (cron, UTC) ─────────────────────────────┐
                         │                                                                                 │
  GitHub Actions         │   A. nightly-health.yml            B. nightly-generate.yml                      │
  (deterministic CI)     │   • npm ci                          • npm ci + start dev server                 │
                         │   • npm run build (tsc+vite)        • node scripts/nightly-generate.mjs         │
                         │   • npm run test:e2e (offline)        - generate N briefs (claudeProvider)      │
                         │   • npm audit / npm outdated          - publishGate (validate+bench)            │
                         │   • upload reports                     - motion/overlap check (multi-timestamp) │
                         │   • open issue on failure              - dedup vs catalog + live gallery        │
                         │                                        - stage survivors as PENDING via 0012 RPC│
                         │                                        - upload assets to community-assets/<uid>│
                         │                                      • upload review dossier (shots + JSON)     │
                         │                                                                                 │
                         └──────────────────────────────────────┬──────────────────────────────────────┬─┘
                                                                 │                                      │
                                                                 ▼                                      ▼
  Scheduled cloud agent    C. nightly-review routine (runs ~1h later, READ-ONLY on the queue)
  (agentic triage)            • pull the dossier / re-query pending drafts
                              • Supabase get_advisors (security + performance) via MCP
                              • taste-judge + rank + flag near-dupes (multi-agent)
                              • re-run publishGate on the LIVE approved gallery (regression sweep)
                              • write a human digest (GitHub issue + notification) - NEVER approves

  Human (the only publish path)
                              • opens 🛡 Moderation → "AI drafts (pending)" filter
                              • reviews each in the sandboxed live preview
                              • Approve / Reject / edit-then-approve
```

**Why this split.** GitHub Actions is the reliable, reproducible, secret-holding workhorse for
anything that is a shell command with a pass/fail (build, test, audit, generation, gate). A scheduled
cloud agent is the right home for the parts that are *inherently* agentic - taste judgment, semantic
dedup, and `get_advisors` (a Supabase MCP tool with no deterministic CLI equivalent). Keeping the
agent **read-only on the queue** preserves the hard guardrail: even the agent cannot publish.

---

## 3. The linchpin: migration `0012_nightly_drafts.sql`

> Numbering note: this plan originally called the migration `0006`, written before `0006` was
> taken by open signup (2026-07-08). Migrations now run through `0009_graphic_kind.sql`, so the
> nightly-drafts migration takes the next free slot - renumber again if something lands first.

A least-privilege staging path so a bot can create `pending` drafts but **can never approve, edit, or
publish** anything. New surface, minimal:

1. **Provenance column** on `community_templates`:
   ```sql
   alter table public.community_templates
     add column if not exists source text not null default 'user'
       check (source in ('user', 'ai-nightly'));
   ```
   Lets the queue filter/label AI drafts and lets the gallery stay honest about origin later.

2. **A `nightly_bots` role table** (same admin-only pattern as `moderators`):
   ```sql
   create table if not exists public.nightly_bots (
     user_id uuid primary key references auth.users(id) on delete cascade,
     note text, created_at timestamptz not null default now()
   );
   alter table public.nightly_bots enable row level security;  -- no policy ⇒ admin-only
   create function public.is_nightly_bot() returns boolean ...  -- SECURITY DEFINER, like is_moderator()
   ```

3. **A `SECURITY DEFINER` insert RPC** - the *only* way the bot writes, and it can only ever produce a
   `pending` draft:
   ```sql
   create function public.community_stage_draft(p_kind text, p_name text, p_summary text,
                                                p_category text, p_body jsonb)
   returns text  -- the slug
   language plpgsql security definer set search_path = '' as $$
   begin
     if not public.is_nightly_bot() then raise exception 'not authorized'; end if;
     insert into public.community_templates(kind, name, summary, category, body,
                                            status, source, author_name)
       values (p_kind, p_name, p_summary, p_category, p_body,
               'pending', 'ai-nightly', 'Nightly AI')      -- status is HARD-CODED pending
       returning slug into ...;
     return ...;
   end $$;
   revoke execute on function public.community_stage_draft(...) from public, anon;
   grant execute on function public.community_stage_draft(...) to authenticated;  -- gated by is_nightly_bot() inside
   ```
   Because status is a literal `'pending'` inside a definer function, and the bot has **no** moderator
   UPDATE policy, the bot is *provably* incapable of publishing. The
   `community_moderation_guard` INSERT branch must be extended to allow a bot's `pending` insert
   through unchanged (today it would force `approved`); the guard already keys on roles, so this is a
   one-branch addition: `if public.is_nightly_bot() then ... allow pending, null audit ... end if;`.

4. **Bot account setup** (one-time, via `service_role`, no schema): create an
   `nightly-bot@<domain>` auth user, allowlist it (`scripts/allowlist.mjs`), and insert its uid into
   `nightly_bots`. The bot signs in with email/password in CI to get a normal `authenticated` JWT;
   its assets land under its own `<uid>/` folder in `community-assets` via the existing storage policy.

**Alternative considered and rejected:** a separate `nightly_candidates` staging table with its own
RLS + review UI + import-on-approve path. Rejected because it duplicates ~everything `0004` already
does (RLS, the asset bucket, the sandboxed preview, the import path) and splits moderation across two
surfaces. Reusing `community_templates` with a `pending`/`source` discriminator means the human reviews
in the **same** 🛡 queue they already use, and Approve reuses the **same** `moderate(id,'approved')`
path that ships today.

---

## 4. The nightly jobs

### A. `nightly-health.yml` (GitHub Actions cron, ~00:00 UTC)

Pure repo hygiene - no secrets except the default token.

| Step | Command | Gate |
|------|---------|------|
| Typecheck + build | `npm run build` | fail → issue |
| Offline E2E | `npm run test:e2e` (the offline-pinned suite) | fail → issue, upload Playwright report |
| Dependency review | `npm audit --json` parsed to a threshold (fail on `high`/`critical`) | fail → issue |
| Staleness | `npm outdated --json` (report only, non-blocking) | digest |

Notes: install Playwright browsers (`npx playwright install --with-deps chromium`). This is the same
green-build gate CLAUDE.md already calls CI, now on a schedule.

### B. `nightly-generate.yml` (GitHub Actions cron, ~00:30 UTC)

The generation pipeline. Needs server secrets: `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`NIGHTLY_BOT_EMAIL`, `NIGHTLY_BOT_PASSWORD` (and `SUPABASE_SERVICE_ROLE_KEY` only for the one-time bot
setup, not the nightly run). Steps:

1. `npm ci`; start the dev server (`npm run dev &`, wait for `:5174`) - the harness drives the app the
   same way `ai-bench.mjs` does (imports `/src/...` modules in a Playwright page).
2. `node scripts/nightly-generate.mjs` (new; see §5).
3. Upload `nightly-out/` (screenshots + `results.json` + rejected-draft code dumps) as a build
   artifact - this is the raw material for the human digest and for system-prompt iteration.

### C. `nightly-review` (scheduled cloud agent / routine, ~01:30 UTC) - READ-ONLY on the queue

The agentic layer. It **never** calls `moderate()` and holds no moderator/bot credentials that could
mutate the gallery. It:

1. Pulls the staged `pending` drafts (bot JWT, read-only) + the generation dossier.
2. Runs **Supabase `get_advisors`** (security + performance lints) via the Supabase MCP - the one check
   with no deterministic CLI equivalent, which is why it lives in the agent.
3. Runs a **taste + dedup pass** (small multi-agent judgment): score each draft against
   DESIGN_LANGUAGE tokens, flag near-duplicates of the existing catalog and of already-approved
   gallery rows, and rank.
4. **Content-quality regression sweep** on the *live* gallery: re-run `publishGate` + the overlap check
   over currently-`approved` community rows to catch drift (a dependency that rotted, an asset that
   404s, a row that no longer validates).
5. Writes a **human digest** - a GitHub issue (or notification) with the ranked drafts, thumbnails,
   gate/motion/taste results, advisor findings, and a deep link to 🛡 Moderation. Files separate
   issues for any health/advisor failures.

---

## 5. `scripts/nightly-generate.mjs` - the reuse map

Modeled directly on `ai-bench.mjs` (which already generates → validates → screenshots → overlap-checks
headlessly). The additions are the gate, the multi-timestamp motion check, dedup, and staging.

```
for each brief in the nightly bank (rotating; brand-matched variants optional):
  change   = claudeProvider.generate(brief, ctx)          // REUSE: the real provider + repair round
  gate     = publishGate(change.template)                 // REUSE: validate + bench (the publish gate)
  if !gate.ok: record as REJECTED (code dump for prompt iteration); continue

  render change.template via composeDocument in an iframe  // REUSE: ai-bench render recipe
  motion   = sampleOverlaps(mid + settled + one more)      // REUSE + EXTEND ai-compare's multi-ts sampler
  if motion.overlaps: record as REJECTED (with the shots); continue

  if isDuplicate(change.template):                         // NEW: content-hash + near-dup vs catalog/queue
      record as SKIPPED; continue

  externalize assets → community-assets/<bot-uid>/<hash>   // REUSE: communityData.publishGraphic's codec
  slug = rpc('community_stage_draft', {kind, name, summary, category, body})  // NEW: 0012 RPC → PENDING
  save screenshot + metadata to nightly-out/
```

Key reuse points, concretely:
- **Generation:** `claudeProvider.generate(brief, { images, palette, resolution, fps })` - identical
  to how the bench and the app call it, so drafts get the full house-contract system prompt + the
  automatic validation repair round.
- **Safety gate:** `publishGate(template)` from `src/community/gate.ts` - the *same* gate the
  interactive publish path runs, so a nightly draft is held to the exact standard a user submission is
  (external-dep and missing-asset promoted to blocking; un-serializable/oversized blocked;
  unsafe JS - network, storage, dynamic code, cross-frame reach - blocked outright).
- **The deterministic motion checker** GOALS/ERA5 call the one justified generation-side investment:
  land it here as a shared `scripts/lib/motionCheck.mjs`, lifting `ai-compare.mjs`'s mid-motion +
  settled overlap sampler and adding a third sample. The bench and this job both import it.
- **Asset transport + staging:** reuse `externalizeAssets` (from `src/backend/assets.ts`, already used
  by `communityData.publishGraphic`) to push fonts/images to the public bucket and keep only sentinels
  in the row body; then the `0012` RPC instead of a raw insert.

**Cost control is built into the script** (see guardrails): a hard `MAX_DRAFTS` and a token/spend
ceiling, aborting before overspending, exactly like `ai-bench.mjs` aborts when no key is present.

---

## 6. The human review workflow

1. **Morning digest.** The reviewer gets one GitHub issue / notification: N drafts staged last night,
   each with a thumbnail, its gate result (always pass - failures never stage), motion-check result,
   taste rank, dedup flags, and a link to 🛡 Moderation. Plus any health/advisor failures as separate
   issues.
2. **Review in-app.** Open the app (signed in as a moderator) → 🛡 Moderation → new **"AI drafts"**
   filter (`status='pending'` AND `source='ai-nightly'`). Each renders in the existing **sandboxed
   `allow-scripts` live preview** - the reviewer judges the real animated graphic, not a screenshot.
3. **Decide.** Per draft:
   - **Approve** → `moderate(id, 'approved')` (the *exact* call the queue already makes) → it enters
     the gallery via the shipped publish path. Assets are already in the public bucket.
   - **Reject** → `moderate(id, 'rejected', note)`. Rejected rows are invisible and the note feeds the
     `ai-bench` → review → system-prompt loop GOALS already defines.
   - **Edit-then-approve** → import the draft into the builder, refine, and publish through the normal
     user path (then reject the raw draft). Optional nicety, not required for v1.
4. **Queue never overflows.** If the pending count exceeds a cap, the nightly job skips staging that
   night and just reports - the human sets the pace.

**UI delta (small).** `ModerationQueue.tsx` today lists all statuses and already has the
`act(id, 'approved')` button (used for "Restore"). Additions: an "AI drafts (pending)" filter tab, a
provenance/`source` badge, and relabel the approve action for pending rows to "Approve & publish".
No new data path - `listAllForModeration`, `getModeratorItem`, and `moderate` all already handle
`pending`.

---

## 7. Guardrails (the brief's explicit ask)

- **Never auto-publish - structural, not procedural.** The bot writes only via
  `community_stage_draft`, which hard-codes `status='pending'`; the bot has no moderator UPDATE policy;
  the gallery is `approved`-only. There is no code path from bot → `approved`. The review agent is
  read-only on the queue. Publishing is exclusively a human click. *(This is the fix for the §0
  finding - without `0012` the naive plan auto-publishes.)*
- **Least privilege.** The bot can create pending drafts and write under its own asset folder - nothing
  else. It cannot read other users' rows (RLS), cannot approve/edit/remove, cannot touch `moderators`.
- **Cost cap + kill switch.** `MAX_DRAFTS` per night and a hard spend ceiling in the script (abort
  before overspending); model pinned (Sonnet 5, matching the bench); a repo variable / `workflow_dispatch`
  input to disable generation; auto-pause staging when the pending queue is backed up.
- **Idempotency / anti-flood.** Dedup each draft by content hash + near-duplicate check against the
  catalog, the already-`pending` queue, and `approved` rows, so the queue doesn't fill with twelve
  near-identical lower thirds. Cap staged-per-night.
- **Secrets hygiene.** Anthropic key + Supabase URL + bot creds in CI secrets only; `service_role`
  used *only* in the one-time bot-setup script, never in the nightly run and never in the bundle. The
  SPA remains byte-identical; offline export gains no network dependency.
- **Staging into prod is safe and deliberate.** Pending rows are invisible (gallery is `approved`-only;
  RLS hides them from non-moderators), so staging into the live Supabase is safe *and* lets the human
  review + approve in the real 🛡 UI (a Supabase branch DB couldn't reach prod on approval). Documented
  as an intentional choice.
- **Auditability.** Every draft carries provenance: `source='ai-nightly'`, `author_name='Nightly AI'`,
  and the dossier records the brief id, model, gate/motion/taste results, token spend, and the CI run /
  commit. A reviewer knows exactly how each draft was made.
- **Fail-safe + fail-loud.** Any job failure opens/updates a tracking issue and notifies; a red nightly
  never affects prod or users (drafts are invisible; the SPA is untouched). The generation job failing
  is a non-event for end users.
- **Migration reviewed like `0004`.** `0012` gets the same adversarial SQL review the community
  migrations got (author-self-approve, audit forgery, anon EXECUTE via Supabase default grants - the
  bugs 0004/0005 caught) before it's applied to live Supabase.

---

## 8. How to run it - recommendation

**Primary: GitHub Actions scheduled workflows.** There is no `.github/workflows/` today; add it. Cron
is UTC. Actions is the right host for jobs A and B: reproducible, encrypted secrets, retained
artifacts, no dependency on anyone's laptop or an always-on process, and it's where `npm run build` /
`npm run test:e2e` / `npm audit` naturally live. Vercel already auto-deploys on push to `main`; these
workflows are orthogonal to deploy (they never push).

**Complementary: one scheduled cloud agent** (via the `schedule` skill / a routine) for job C - the
agentic triage that needs an LLM and the Supabase MCP (`get_advisors`), and that produces the human
digest. It runs after B and is **read-only on the queue**.

- Optional job D: `nightly-live-e2e.yml` running `npm run test:e2e:live` nightly for the authed
  community flows. Written when that could mean "against prod with the `synctest` creds"; it
  cannot now - since issue #2495 the suite refuses any backend but a stack it owns, so this is
  what `configured-suite.yml` already does on a local stack, and a hosted tier is
  `hosted-latency.yml` against staging.

*(Cadence, exact UTC times, and per-night volume are the open decisions in §10 - I've defaulted to
midnight-ish UTC and a small N.)*

---

## 9. Phased implementation (when we build)

1. **Phase N0 - migration + bot.** Write `0012_nightly_drafts.sql` (source column, `nightly_bots`,
   `is_nightly_bot()`, `community_stage_draft`, guard branch). Adversarial SQL review. Apply to live
   Supabase via MCP. Create + allowlist the bot account. Build green; offline E2E green (offline path
   unchanged - it's an additive migration).
2. **Phase N1 - the generator script.** `scripts/nightly-generate.mjs` + `scripts/lib/motionCheck.mjs`
   (the deterministic motion checker, shared with the bench). Dry-run mode that generates + gates +
   shoots but does **not** stage. Verify the dossier locally.
3. **Phase N2 - stage for real.** Wire the `community_stage_draft` RPC call; stage a handful of drafts
   into prod as `pending`; confirm they appear only to a moderator and only in the queue, never in the
   gallery. Live-verify the guardrail two ways: (a) a moderator sees + can approve a pending draft;
   (b) the bot literally cannot approve (RPC/permission denied).
4. **Phase N3 - the moderator UI delta.** "AI drafts" filter + `source` badge + "Approve & publish"
   relabel in `ModerationQueue.tsx`. E2E spec for the pending-draft review flow (configured suite).
5. **Phase N4 - GitHub Actions.** `nightly-health.yml` + `nightly-generate.yml`, secrets configured,
   artifacts + failure-issue wiring.
6. **Phase N5 - the review agent.** The scheduled cloud routine: dossier pull, `get_advisors`, taste +
   dedup, live-gallery regression sweep, digest issue. Read-only on the queue, verified.

Each phase: `npm run build` green + offline E2E green before commit; server paths live-verified by the
maintainer per the Era 5 "verified vs deferred" convention.

## 10. Open decisions (need your call before building)

1. **Volume + cadence.** How many drafts per night, and how many nights per week? (Cost scales
   linearly; I've assumed a small nightly N with a hard cap.)
2. **Generation host.** GitHub Actions for the generator (recommended, deterministic) vs. doing the
   generation *inside* the scheduled cloud agent too. I recommend Actions for B and an agent only for
   C.
3. **Brief source.** Fixed rotating bank (like the bench's 12) vs. brand-matched variants vs. an
   agent inventing fresh briefs nightly. I lean: a curated rotating bank first, agent-invented briefs
   later once the loop is trusted.
4. **Auto-reject junk?** Should the review agent be allowed to *reject* (not approve) obviously-broken
   drafts to keep the queue clean? That needs a separate least-privilege "reject-only" path; default is
   **no** - the agent only recommends, humans decide.
