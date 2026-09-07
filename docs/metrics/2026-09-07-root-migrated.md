# Re-measured 2026-09-07, after the ROOT contract migrated

`AGENTS.md` was 23,436 bytes read by fifty-four instruction chains - a multiplier of 1,265,544, by
a wide margin the most expensive file in the repository and roughly double what `src/templates` was
before its own row.

| Metric | Before | After |
|---|---|---|
| Root `AGENTS.md` | 23,436 B | **15,432 B** |
| Its multiplier (bytes x chains) | 1,265,544 | **833,328** |
| Per session, at four bytes a token | ~5,859 tokens | **~3,858 tokens** |
| Kernel (`.claude/rules/everywhere.md`) | 632 B | **7,443 B of 8,192** |
| Tightest chain in the repository | `src/ai/pro/harness`, 75.5% | unchanged, but 83,022 B not 91,026 |

## The kernel cap did the work, and it fired

The 8,192-byte ceiling was a guess written when the store was empty. Migrating the root filled it to
**8,381 bytes and the compile refused** - the first time that gate has ever fired. It is the whole
mechanism working exactly as intended: the question "does EVERY session need this before touching
anything?" cannot be dodged once the budget is real.

Two rules were scoped out of the kernel to fit, and both deserved it. Neither is less true:

- **worktree cleanup** (524 B) - `.agent-workflows/cleanup-worktrees.md` carries the contract in
  full and loads when the workflow is invoked. The kernel copy was a summary of a file that arrives
  exactly when it is needed.
- **production migrations** (412 B) - the root text itself said `supabase/AGENTS.md` "is
  authoritative ... it loads when you work in that directory". A kernel rule pointing at an
  authoritative file that loads on its own is a rule every session pays for and nobody reads there.

Two more were scoped because they were never global to begin with: the Playwright-spec rule binds
`src/**` and `e2e/**`, and the open-studio rule binds `src/**` and `api/**`.

**The remaining kernel is 7,443 bytes and I would not cut it further without an argument.** It is
twenty rules: the six non-negotiable principles, the landing and publishing rules, how to end a
turn, what makes a question the owner's, and the pillars.

## What did NOT become a rule

**6,796 bytes of orientation moved to `docs/PRODUCT_AND_MAP.md`** - what the product is, the current
push, the commands table, and where the code lives. None of it is wrong and none of it is a rule.
Fifty-four chains were carrying a product pitch and an npm reference into every session's first
tokens; a reader takes that in once. Same judgement, same reason, as the template category index in
the `src/templates` row.

## The compiler had to learn one thing

`deepestOwner` returned null for the repository root by design - a `**`-scoped rule was a KERNEL
rule and the kernel was Claude's `.claude/rules/everywhere.md`. But **Codex reads `AGENTS.md` files
and nothing else**, so a generated root was the only way it could see the global rule set at all -
including "never merge into `main` yourself" and "publishing past `main` needs the user". The root
is now a directory like any other once it carries the marker.

## Why the cut is 34% and not more

A rule binding two sibling areas - `src/templates/**` and `src/blocks/**`, say - has its deepest
common owner at `src/`, which has no contract, so it lands at the root. That is correct: the root is
the only place both sessions see it. It is also why the generated root is 15,432 bytes rather than
the kernel's 7,443. **Giving `src/` its own contract would move those rules one level down and off
fifty-four chains onto the handful that touch `src/`** - the obvious next cut, and the first one
this measurement makes visible.
