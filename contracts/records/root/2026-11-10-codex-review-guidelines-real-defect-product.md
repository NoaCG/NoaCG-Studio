# root/codex-review-guidelines-real-defect-product

Rule: `root/codex-review-guidelines-real-defect-product`. Recorded 2026-11-10 on `claude/plan-cicd-followup-cf21-build` at ca0a3a41.

Owner decision 2026-11-07 (cicd-followup cf21, change 5): review rounds, not CI, hold merge time; the JEV sample shows up to four Codex rounds per PR.

Why a rule rather than a fix, a mechanism or a check: Codex reviews read the folder AGENTS.md of the files a PR changes; no check can tell a reviewer what a real defect is, and the owner's cf21 decision asks for these guidelines as a rule. The root AGENTS.md is at its byte ceiling, so the rule is scoped to the product folders.

Rescoped 2026-11-10 to `**` on `claude/plan-cicd-followup-cf21-codex-root`: the owner raised the root ceiling so Codex applies this rule on every PR (docs/work-specs/cicd-followup/evidence/owner-decision-2026-11-10-codex-root.md).
