# Re-measured 2026-09-07, after `src/templates` migrated

The row above ended by saying the byte win had to come from the large areas, and that if the
corpus had not fallen once `src/templates` migrated the design was wrong rather than early. This
is that measurement. `src/templates/AGENTS.md` was 53,037 bytes read in full by every session
touching any template.

| Metric | Before `versus` | After `versus` | After `src/templates` |
|---|---|---|---|
| Contract corpus | 574,356 B / 108 files | 574,477 B / 107 | **548,519 B / 106** |
| `src/templates/AGENTS.md` | 52,368 B | 52,368 B | **26,482 B** |
| Its multiplier (bytes x chains) | 1,256,832 | 1,256,832 | **635,568** |
| Tightest chains, top five | 3 of 5 were template chains | same | **none are** |
| Compiled layer | 632 B launch, 0 scoped | 632 B, 1,093 scoped | 632 B launch, **33,824 B scoped** |
| Hand-written contract files | 108 | 106 | **104** |

**The design holds.** One area, 86 rules, and the corpus fell 25,958 bytes while the file's
multiplier halved. `src/templates/importedDesign`, `infographics` and `types` were three of the
five tightest chains in the repository before this row and none of them is in the top five now -
they were tight because of the parent, not because of themselves.

**Where the bytes actually went, because the corpus fell by less than the file did.** The contract
lost 25,886 bytes and the corpus lost 25,958. The rules that replaced it are not in the corpus at
all: 33,824 bytes of them are in `.claude/rules/`, loaded only when a session reads a file the rule
scopes to. Forty-one rules are catalog-wide and 45 name the single file they bind, so most of that
33 KB never loads in a given session. The reasoning - every incident, date and measurement the
prose carried - is in 86 records under `contracts/records/templates/` that nothing loads at all.

**The near-duplicate threshold is calibrated, and the answer is that it needs no change.**
`DUPLICATE_THRESHOLD = 0.6` was set on a store of two rules and phase 2b lists recalibrating it as
its own row. Across 86 rules written from one contract it refused nothing: zero `--distinct`
overrides were needed. On its first real corpus it produced no false positives, so the row that
was going to re-measure it can be closed by this number instead.

**What this row does not prove.** The conflict argument (`WORKFLOW_ARCHITECTURE.md` §1.4) is still
unmeasured - `npm run metrics:conflicts` reads 45 days of history and every commit in that window
predates the store. The first honest reading is weeks away, and until then the case for one file
per rule rests on the `build`-line evidence rather than on this repository's contracts.
