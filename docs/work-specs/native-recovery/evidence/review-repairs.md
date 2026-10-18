# Review-edge repair after #1378

Source reviewed: `a986056d548c24a1f2c9243a60fdf5dd0f5cbac2`, based on main
`6f91096350150627887bbd81886b1042410731a3`. Same Codex coordinator; no new worker or wake.
Modes: review inline, simplify inline, verify inline. Scope: the native recovery contract and
context reader, their two test files, and this spec's unchanged acceptance/evidence plus the
review-only `work.json` refresh. This new receipt follows the reviewed source in its own
evidence directory; no existing evidence, specification or authority is rewritten.

The automated review of #1378 identified two confirmed defects. They were reproduced with two
new regression cases before changing the implementation: health returned pending for a wake
at/beyond the original deadline, and the reader accepted partial usage after discarding an
invalid Codex counter row. Both regressions failed on the landed implementation. The repair
rejects the wake bounds and rejects missing/negative/inconsistent cumulative counters or an
invalid usage timestamp. Native rate-limit-only heartbeats without usage remain supported.
The same tests then passed: contract **8/8**, context **7/7**. Targeted ESLint and diff whitespace
checks passed. No tests, assertions, limits or native permissions were relaxed. Simplify kept
the validation at the existing input boundaries; there is no new scheduler or retry mechanism.

The ancestry finding was checked independently: the actual GitHub Git commit object for
`0778333c570a4b744c7ac035160036ff7668299a` names
`82765306fe8b08abfc6fbb22289ad9044a92f3a1` as its single direct parent. Local Git agrees,
`merge-base --is-ancestor` exits zero and the delivered ledger reports zero structural problems.
The asserted sibling snapshot was not the delivered history. No ancestry or review-pin rewrite
is warranted; the reply is on #1378 discussion 4302549430.

#1378 merged through the queue as `9259a20516dc06eb64aac0a781968013d8bc6803` before the attempted
hold completed. Source CI 39027099253, merge-group CI 39042632632, exact-SHA main CI 39043384506,
Post-landing 39043384535, configured-suite 39043384437 and Quarantine 39043384448 all passed.
Deployment verification was skipped. The two confirmed edges are repaired in this separate
owned worktree/branch through the same check/queue path; one repair attempt, same coordinator.

The real two-delivery idle-wake/re-arm/stop receipt is unchanged and remains valid for its
stated scenario. The one-shot stayed disabled; its original window was not renewed. AC-1/2/3
retain that bounded scope. AC-4 remains unverified because native loaded-context and usage
counters are unavailable. #1301/#805, remote fencing and external reconstruction remain open.
