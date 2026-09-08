---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
asked: "I want a memory system that is smaller, current, internally consistent, and reliably surfaces the instructions that actually matter... audit and consolidate them yourself, then interview me only where you find genuine ambiguity or conflicts."
note: 10c48375 landed phase 1, the dated rulings moved into the repo; the store has since drifted back over both ceilings and phases 2 to 5 have not run
---
# Drain the memory store down to its charter

**Filed:** 2026-09-03. **Source:** owner ruling. The ARCHITECTURE landed the same day
(`docs/MISTAKE_TRIGGERS.md` "Memory: the weakest trigger", the rewritten `MEMORY.md` header, and
the extended `~/.claude/hooks/memory-audit.mjs`). **This item is the migration, not the design.**

## Why

The physics are fixed; the store is not. Measured 2026-09-03 by the upgraded audit hook:

| | before | after phase 1 | target |
|---|---|---|---|
| corpus | 182 KB / 49 entries | **97 KB / 30 entries** | 40 KB |
| entries claiming the retired `exit: never` | 41 | **0** | 0 |
| entries declaring `strength:` | 0 of 49 | **30 of 30** | all |
| `[[link]]` targets that do not exist | 42 | **0** | 0 |
| index | 61 lines, 20 links to deleted files | **59 lines, 0 dead** | under 60 |

**PHASE 1 IS DONE (2026-09-03, `10c48375`)** and every row above except the corpus is closed. What
shipped: four dated `owner-decisions` files plus the operator stories moved verbatim to
`docs/OWNER_RULINGS.md`; two receipts became backlog files (`open-threads-from-the-memory-cull.md`,
`wave-leftovers-2026-08-27.md`); seven money entries became one `money.md`; and four entries the
root `AGENTS.md` already carried in full were deleted after checking each phrase was really there
(`landing-is-serialized`, `commit-message-style`, `client-agnostic-and-no-mandatory-slots`, plus
`lite-brand-plan`, which summarised `docs/AI_LITE_BRAND_PLAN.md`). `merge-cost-is-the-bottleneck`
was retired into `fast-iteration-phase` with its premise marked lapsed.

**PHASE 2 IS UNBLOCKED FOR THE `AGENTS.md` HALF (2026-09-03, `claude/a-agents-md-headroom`).** Ten
entries are marked `(route)` in the index: they are contract-shaped rules that belong in the
`AGENTS.md` or workflow that loads where they fire, and the reason they had nowhere to go was that
every chain was at its byte ceiling. The root contract has since given up 11,343 bytes, felt by all
52 chains: the tightest, `src/components/wizard`, went from 365 bytes free to 9,708, and the next
nine all sit under 80% of the budget. A routed rule of a few hundred bytes now fits where it
belongs.

**The orchestrator half is still blocked.** Its always-loaded common path is 638 of 640 lines, and
nothing in this branch touched it - `.agent-workflows/orchestrator*` needs the same treatment
before a rule can be routed there. **Read
`docs/backlog/instruction-files-need-a-shrinking-mechanism.md` for the method**; the part of it
that applies to workflow files is unstarted. The residual after routing is the four big direction
entries (`owner-taste-rules-instrument`, `adapt-first-create-with-ai`, `owner-walk-agent-round-ux`,
`gtm-competitive`, ~28 KB between them), which want trimming rather than moving.

**A manual cleanup has already been tried and did not hold.** 203 entries were archived on
2026-08-25; nine days later the store was back to 49 entries and 168 KB, about five a day. So the
drain only pays off underneath the new rules - do the routing, not another cull.

## What it would take

Order matters; step 1 is what makes the rest safe.

1. **Map the graph before deleting anything.** `landing-is-serialized` has six inbound `[[links]]`
   and its content is already in root `AGENTS.md`; deleting the file naively creates six more
   dangling links, which is the fault being fixed. Deletion is a GRAPH operation: repoint inbound
   links at the live entry or at the repo doc that now holds the fact, then remove.
2. **Route by the charter, entry by entry.** For each: can it fire at a MOMENT? If yes it is a
   hook, a gate, or the contract that loads there - move the content and delete the memory. If no,
   it stays and gets `decided:`, `strength:` and `holds-while:`. Verified duplicates found so far,
   both safe once their links are repointed: `commit-message-style` and `landing-is-serialized`
   (both fully covered by root `AGENTS.md`).
3. **Drain the eight dated receipt files** - `owner-decisions-2026-08-08/27/29/30`,
   `wave-leftovers-2026-08-27`, `operator-stories-2026-08-27`, `open-threads`,
   `next-wave-candidate-rows`. These are meeting minutes: live rulings buried inside dead detail,
   which is exactly where a lapsed opinion later reads as a standing rule. `MEMORY.md` was already
   tracking one supersession in PROSE inside an index line ("machines bullet superseded"). Extract
   each live ruling to its own subject entry; delete the receipt. Git keeps the minutes.
4. **Fix the 42 dangling links** as a sweep once 1-3 are done, since those steps change the set.
5. **Re-run the hook until it is quiet.** It reports every one of these numbers, so "done" is a
   measurement rather than a feeling.

## Interview, not review

The owner ruled he will not read every file: *"interview me only where you find genuine ambiguity
or conflicts."* So a session doing this asks him ONLY where routing is genuinely undecidable, one
line each, batched as `kind: walk-p` owner-queue items ("is this still relevant?", "does this newer
rule replace this older one?"). **Ambiguity never blocks the drain** - route it, mark
`strength: preference` so it cannot bind, and ship the rest.

Two entries already checked and NOT ambiguous, recorded so they are not re-litigated:
`one-orchestrator-at-a-time` and `ai-gallery-sameness-verdict` are both well written, state their
why, their evidence and their own revisit test. The store's problem is systemic, not per-file - do
not arrive expecting to find bad memories.

## Evidence

- `node ~/.claude/hooks/memory-audit.mjs` - every number in the table above.
- `C:\claude\memory-archive-2026-08-25\` - 203 files, the cleanup that did not hold.
- `docs/MISTAKE_TRIGGERS.md` "Memory: the weakest trigger" - the charter, the precedence order and
  the chip-rule incident that showed a recorded, loaded, agreed-with rule can still never fire.

## Trend

- 2026-09-03, before: 182 KB / 49 entries, index 61 lines.
- 2026-09-03, after phase 1: 97 KB / 30 entries, index 59 lines.
- 2026-09-08: **109 KB / 33 entries, index 61 lines** - over both ceilings again (40 KB, 60 lines)
  and 12 KB above where phase 1 left it five days ago, at roughly 2.4 KB a day. One entry
  (`dont-wield-the-owners-deadline.md`) declares no `exit:`. The refill rate is lower than the
  ~5-a-day that followed the 2026-08-25 archive, so the new rules are doing something, but the
  store is still growing and phases 2 to 5 have not run. The `AGENTS.md` half of the routing is
  unblocked; the orchestrator half is blocked on
  `docs/backlog/instruction-files-need-a-shrinking-mechanism.md`, whose common path has since
  reached its line ceiling exactly.
