// Where a plan run's recovery checkpoints live (run-recovery.mjs). They are the only copy of a
// continuing project's state, published on a claude/ branch because that is the namespace a
// cloud session's git connection accepts pushes to (refs/noacg-recovery/* was dropped,
// 2026-10-20). They are never merged, so cleanup must never delete them and listings of unlanded
// work must leave them out.
export const RECOVERY_BRANCH_PREFIX = 'claude/noacg-recovery/';

/** Is this branch (bare, `origin/...`, `refs/heads/...` or `refs/remotes/origin/...`) a checkpoint? */
export function recoveryCheckpointBranch(name) {
  return String(name ?? '').replace(/^(?:refs\/heads\/|refs\/remotes\/origin\/|origin\/)/, '').startsWith(RECOVERY_BRANCH_PREFIX);
}
