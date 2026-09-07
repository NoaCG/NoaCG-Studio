# Re-measured 2026-09-07, after `src/components/wizard` migrated

The third area, and the one the phase was really for: `src/components/wizard/AGENTS.md` was the
tightest instruction chain in the repository, 102,879 bytes of a 110,000 ceiling with 7,121 free -
inside the 4,096-byte reserve away from failing the build.

| Metric | After `src/templates` | After `src/components/wizard` |
|---|---|---|
| Contract corpus | 548,519 B / 106 files | **521,467 B / 105** |
| Hand-written bytes | 520,874 B / 104 files | **467,883 B / 102** |
| `src/components/wizard/AGENTS.md` | 53,101 B | **25,608 B** |
| Its chain | 102,879 B, 7,121 free | **75,604 B, 34,396 free** |
| Tightest chain in the repository | `src/components/wizard`, 93.5% | **`src/ai/pro/harness`, 82.8%** |
| Chains within the 4 KB reserve | 1 | **0** |
| Compiled layer | 632 B launch, 33,824 B scoped | 632 B launch, **85,940 B scoped** |

**Nothing is near the ceiling any more.** That is the number this phase existed to move: the
build fails a chain with under 4,096 bytes free, and the wizard chain sat 3,000 bytes the safe side
of that for weeks, which meant any lesson learned in the wizard had nowhere to go. It now has
34,396.

**The compiled layer is where the bytes went, and it is not a chain cost.** 85,940 bytes of scoped
rules against 632 bytes that load at launch. A scoped file is read only when a session opens a file
the rule names, so the wizard's 101 rules are not 101 rules' worth of tokens in any session - most
of them name a single component and arrive only with it.
