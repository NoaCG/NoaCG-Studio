# Owner decision: retire the admin page

On 2026-10-17 the owner approved removing the admin page and replacing it with commands,
operator sessions and routines. A clean codebase and fast iteration are the current priority.
Future role management does not justify keeping an unused dashboard.

The implementation is specified in `docs/work-specs/admin-command-operations/spec.md`.
Shared access enforcement, persisted roles/data, migrations and audit history remain live.
Weekly reporting must expose missing information as missing, including failed data reads.
No future model promotion, paid testing or access changes are authorized by a reporting routine.

Issue #800 remains open for live-feature tests bootstrapped through the retired editor.
Resolve that work inside the cleanup run after shell removal and before final helper cleanup;
do not delete live-feature coverage merely because its old bootstrap is skipped.
