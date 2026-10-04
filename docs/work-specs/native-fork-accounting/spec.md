# Preserve native fork rollout identity

Why: the landed native ID preference still lets later inherited parent metadata overwrite a
reviewer's first rollout header, so deduplication drops real reviewer usage.

Goal: keep the first session metadata header's rollout identity throughout parsing.

Non-goals: change counters, window math, other metadata, reporting, or provider routing.

Decision: retain the first header's `id`, with the existing legacy `session_id` and filename
fallbacks. Later metadata may still update the other existing metadata fields.

Acceptance:
- A parent and nested reviewers remain distinct when reviewers contain later parent metadata.
- Copies of one reviewer rollout still deduplicate, with the richer snapshot set winning.
- Legacy headers and filename fallback retain their behavior; counter and window tests pass.
- A metadata-only comparison confirms the actual B and C reviewer IDs match their first headers.

Verification: reproduce the actual B reviewer mismatch, run a synthetic regression red before
green, run the script suite and build, and record the metadata-only comparison without private
transcript contents.
