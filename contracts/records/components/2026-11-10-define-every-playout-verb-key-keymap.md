# components/define-every-playout-verb-key-keymap

Rule: `components/define-every-playout-verb-key-keymap`. Recorded 2026-11-10 on `claude/plan-live-publishing-1-build` at e6be4cf.

The hosted control page (HostedVerbs) is retired by docs/work-specs/retire-hosted-control/spec.md; the production page (ProductionShell usePlayoutVerbKeys) is the one React surface left reading playoutKeys.ts.

Why a rule rather than a fix, a mechanism or a check: The keymap rule stands; only its second surface, the hosted control page, is retired, so the rule is rescoped rather than dropped.
