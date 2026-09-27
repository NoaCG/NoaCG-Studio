# wizard/carry-beta-tag-inside-create-title

Rule: `wizard/carry-beta-tag-inside-create-title`. Recorded 2026-09-27 on `claude/p2-resolve` at ee19d6b57.

Review of the wizard entry change found the disabled Video card read as closed to signed-in users while auth was loading, and left a signed-out visitor with 'Sign in to try it.' and nothing to press.

Why a rule rather than a fix, a mechanism or a check: The door's gate is a UI state choice in one component; the wizard-entry-fit spec pins the offline path, and the signed-out path has no configured-suite spec yet, so the contract states the intent.
