---
v: 2
source: derived
kind: finding
raised: 2026-10-03
state: unstarted
found: "Writing the live-safe updates spec, seven platform behaviours its guarantees touch were not settled by a primary source or a measurement."
serves: NOW
size: standard
needs-owner: none
---

# Live-safe updates: platform questions the spec could not settle

**Filed:** 2026-10-03. **Source:** the session that amended
[`work-specs/live-safe-migrations/spec.md`](../work-specs/live-safe-migrations/spec.md) to the
owner's ruling that nothing NoaCG ships may interrupt a show.

## Why

The spec's web and client guarantees (L10 to L14) and its stall budget (L3) rest on platform
behaviour. Where the vendor's documentation settles it, the spec cites it. These did not, and each
one can turn a stated guarantee into a wrong one, so the build must answer them before it claims
the criterion that depends on it.

## What is unknown

1. **The project's Skew Protection maximum age, and whether the API reads it.** Vercel's default is
   one day from deployment creation, and a pinned request older than that answers 404. Nobody has
   read this project's value, or checked whether the REST API exposes it for AC-13's check or only
   the dashboard does. If only the dashboard, setting it to the production retention is a
   one-time step for whoever holds the Vercel account.
2. **Whether Vite can put `?dpl=` on every built URL.** HTML entry scripts, CSS links, dynamic
   `import()` and the preload helper, and `url()` inside CSS all need it (L10). `renderBuiltUrl`
   may not reach all of them; a build experiment decides, and bundling supabase-js into the output
   entry removes the renderer's need either way.
3. **How long a PostgREST schema-cache reload stalls requests on the hosted project, and how.**
   Every DDL fires Supabase's `pgrst_ddl_watch`. PostgREST's documentation (v12, v13) says requests
   wait for the reload; supabase/supabase#50043 (2026-09-05, open) reports hosted PostgREST
   answering 503 PGRST002 at once for 20 to 25 s per reload on that project, and Realtime's daily
   partition maintenance firing the trigger about 85 times a day. The research saw a reload as
   effectively immediate on a preview branch of this project. AC-3 records this project's figure;
   if a reload alone takes more than 300 ms, no migration meets the half second and it goes to the
   owner as a decision with the figure. Realtime's own reloads, if this project sees them, are a
   show risk NoaCG does not ship (item 6).
4. **Production's Postgres major version.** `supabase/config.toml` says 15 for the local stack and
   a preview branch of the project reported 17.6. PostgreSQL 17's `transaction_timeout` would
   bound a file's whole hold, but it terminates the session and its documentation does not say
   whether setting it inside a transaction covers that transaction, so L3 bounds the hold by
   per-statement timeouts instead.
5. **The lock modes of `create policy`, a table `grant` and `alter function`.** PostgreSQL's
   explicit-locking page does not list them. L3 counts an unlisted form as ACCESS EXCLUSIVE, which
   is safe but may make some files retry more than they need; measuring each on staging can relax
   that.
6. **Supabase and Vercel maintenance.** A Postgres upgrade, a PostgREST or Realtime restart or a CDN
   incident is not something NoaCG ships, and the spec leaves it out. Whether Supabase announces or
   lets a project schedule its maintenance, and what a show sees during it, is unknown.
7. **Playout software that reloads an output by itself.** OBS browser sources have options to
   refresh when the scene becomes active and to shut down when hidden; vMix and CasparCG have their
   own. L10 makes such a reload land on a working build, but the picture is rebuilt from the log
   while it reloads. Which defaults each one ships with, and what the operator docs should tell
   people to set, is unknown.

## What it would take

One build-phase session: read the Vercel project setting (1), run the Vite experiment (2), and
measure 3 and 5 on staging alongside AC-3. Items 6 and 7 are documentation research with no
code; 7 ends in a short paragraph in the operator docs.

## Evidence

The spec's Sources section lists what was read and when. Item 3: supabase/supabase#50043 and
`docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.5. Item 4: `supabase/config.toml` (`major_version = 15`)
and the research's preview branch (Postgres 17.6). Item 1: research §5.5 measured `?dpl=`
answering 200, which shows Skew Protection is on, not what its maximum age is.
