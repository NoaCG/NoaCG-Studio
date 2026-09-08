# Re-measured 2026-09-08: `src/` gets a contract, and the kernel is two numbers

Two findings from auditing phase 2 against the tree rather than against its own handoffs.

## 31 rules had no Codex home at all

`deepestOwner` walks up from a rule's scope looking for an owned directory and returns null when it
finds none - it never falls back to the repository root. So a rule whose scope spans two trees under
`src/` (say `src/templates/**` and `src/blocks/**`) had an owner of `src`, which had no contract,
and therefore appeared in **no `AGENTS.md` at all**. Claude Code still loaded it from
`.claude/rules/`; Codex, which reads `AGENTS.md` files and nothing else, never saw it.

Giving `src/` a generated contract fixes it:

| | before | after |
|---|---|---|
| Rules reaching Codex only through prose | 80 | **49** |
| `src/AGENTS.md` | did not exist | 10,249 B, 31 rules |
| Root `AGENTS.md` | 15,841 B | 15,841 B - unchanged |

**The root did not shrink, and an earlier claim in this session that it would was wrong.** Those 31
rules were never in the root to move out of it; they were homeless. The fix is worth landing for the
Codex visibility alone.

## The 8 KB ceiling was being checked on a different file than the baseline

`WORKFLOW_ARCHITECTURE.md` §5.3 says "Kernel `AGENTS.md` (≤ 8 KB)" and §9 tracks "Kernel bytes
22,733 → ≤ 8,192". Those are two different files:

- **`.claude/rules/everywhere.md`** - the one compiled file with no `paths:` scope, so every Claude
  session pays for it at launch. **7,852 of 8,192 bytes, and `kernelBudget()` refuses it over.**
  This is what the ceiling was always about, and it is met.
- **the generated root `AGENTS.md`** - 15,841 bytes, because it carries the kernel PLUS every rule
  whose scope spans two trees. The 22,733-byte baseline was taken from THIS file.

So the metric compared a baseline from one file against a ceiling enforced on another. §5.3 now
says which is which.

**The root is not a number to drive under 8 KB.** A cross-tree rule is only visible to both trees
from the root, and Codex has no other way to see it. The way to shrink the root is to give a shared
ancestor its own contract, which moves those rules down - `src/AGENTS.md` is the first, and
`control/` and `production/` are the ones phase 2b already plans.
