// Which ref means "main" when you are asking whether something has LANDED.
//
// THE ANSWER IS `origin/main` WHENEVER THE LOCAL BRANCH IS BEHIND IT, and since the move to
// GitHub's merge queue that is always. Every landing used to fast-forward the primary checkout, so
// the local ref and the remote agreed and it did not matter which one a script read. The queue
// runs on GitHub and never touches this machine: the local ref stops moving the moment the last
// hand-merge does, and the lag only grows.
//
// WHAT IT COST, all on 2026-09-07, with the local ref ten commits behind:
//   - `merge-order` reported branches that had already landed as work that must land first, and
//     refused a branch for containing them;
//   - `cleanup-worktrees` refused to reclaim three landed worktrees, at about a gigabyte each;
//   - `worktree-activity` - the report the root AGENTS.md tells you to read before starting work
//     that might collide - listed nine worktrees as having work in flight, hundreds of files, all
//     but one already merged;
//   - `jobs.mjs` could read a landing that SUCCEEDED as one that never happened, which is the
//     input to deciding whether a dead landing job gets retried.
//
// Every one of those is a refusal or a warning that reads like a real risk, which is the worst
// shape for a false positive: the honest response to it is to stop and investigate.
//
// This file exists so there is ONE answer to that question. It is deliberately NOT used by
// `cleanup-worktrees`, which asks a DIFFERENT one - "is this work backed up off this machine?" -
// and must therefore always read `origin/main` with no fallback. Reaching for this helper there
// made a branch merged into a local main that was never pushed look safe to delete, and three
// tests caught it. The two questions look alike and the wrong answer to the second loses work.

/**
 * @param {(args: string[]) => {ok: boolean}} run  a git runner bound to the checkout to ask in
 * @param {string} [local='main']
 * @returns {Promise<string>|string} `origin/<local>` when it exists and contains `<local>`, else `<local>`
 *
 * Falls back to the local name when there is no remote-tracking ref at all - a fresh `git init`,
 * a clone with a different remote name - because a ref that does not exist answers nothing.
 * The caller's own freshness guard decides whether an unfetched `origin/main` is evidence;
 * this only decides which ref to point at.
 */
export function mainRef(run, local = 'main') {
  const remote = `origin/${local}`;
  const exists = run(['rev-parse', '--verify', '--quiet', remote]);
  const decide = (existsResult) => {
    if (!existsResult.ok) return local;
    const behind = run(['merge-base', '--is-ancestor', local, remote]);
    return behind instanceof Promise ? behind.then((r) => (r.ok ? remote : local)) : (behind.ok ? remote : local);
  };
  return exists instanceof Promise ? exists.then(decide) : decide(exists);
}
