# The render rate-limit rule is still in log mode

**Filed:** 2026-09-26. **Source:** carried over from retired working notes; the rule's creation is
documented in `docs/RENDER.md`.

## Why

A render start costs real compute. The Vercel WAF rule on `/api/render/start`
(`rule_rate_limit_render_starts_PnbUUg`) was created with `--rate-limit-action log` so its
matches could be read before it refused anything, and it was never switched to `deny`: today it
records a flood instead of stopping it. Outcome 5 in `docs/GOALS.md` depends on the hosted
service staying up and affordable.

## What it would take

Read the rule's matches over a representative window. If they show only abuse, edit the rule to
`deny` (`docs/RENDER.md`, "The WAF rate-limit rule", has the commands); if they show real
render starts, write down why it stays in log mode. An ordinary security change inside the
product's own configuration; no owner decision.

## Evidence

`docs/RENDER.md` "The WAF rate-limit rule (Vercel, not in this repo)" records the log-first plan.
