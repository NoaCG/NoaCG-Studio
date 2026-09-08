# Re-measured 2026-09-07, after `src/ai` migrated - and the first answer to "is it still worth loading"

`src/ai/AGENTS.md` was 42,259 bytes read by eight instruction chains. This is also the first row run
under `docs/backlog/are-the-big-contracts-still-worth-loading.md`, which asks for three outcomes per
paragraph rather than two.

| Metric | Before this row | After |
|---|---|---|
| Contract corpus | 514,435 B / 104 files | **491,526 B / 103** |
| Hand-written bytes | 441,613 B / 100 files | **399,878 B / 98** |
| `src/ai/AGENTS.md` | 42,259 B | **18,826 B** |
| Its multiplier (bytes x chains) | 333,480 | **150,608** |
| Tightest chain in the repository | `src/ai/pro/harness`, 91,026 B | **`src/components/wizard`, 68,617 B** |
| Tightest chain, headroom | 18,974 B free | **41,383 B free** |

## The extraction was delegated; the verification was not, and that is where the value was

64 rules came from a delegated pass. Reading the file afterwards found **four binding rules it had
missed**, each of which would have been silently lost:

- **the anti-anchoring rule** - no catalog design code reaches any CREATE prompt. Stated as
  absolute in the contract, and the one that keeps a create round measuring composition rather than
  recall;
- **the category allowlist** - a generated graphic can only be a category the catalog already
  carries, which is what makes it operable in the control panel by the same machine as a hand-picked
  one;
- **how the parts check measures** - by driving every text-bearing field to a sentinel and re-reading
  the painted frame, because markup cannot see a row a runtime BUILDS from one field;
- **how the kind check answers** - by identity against the resolved chassis, reporting only when both
  sides are known.

Four in sixty-eight is a good hit rate for a delegate. It is also four invariants that a green audit
would have passed over, because the audit measures backticked tokens and these are arguments.

## What was NOT migrated, and why - the owner's third bucket

**Nothing was false.** Unlike `src/templates` and `src/components/wizard`, which each carried a claim
the code had stopped honouring, this file was accurate throughout. It is the best-maintained large
contract in the repository, and the reason is visible in its own opening: every `##` section states
its status as **LIVE**, **EXPERIMENT** or **RETIRED** in its first line, and somebody has kept that
true.

**But 16% of it should not have been in this file at all, by its own rule.** The contract opens by
saying "A section that describes ONE directory belongs there, not here", and then carries six
sections describing six subdirectories that each already have their own `AGENTS.md`:

| section | bytes | its own contract |
|---|---|---|
| `NoaCG Pro (pro/)` | 1,721 | `pro/AGENTS.md`, 18,414 B |
| `NoaCG Lite (lite/)` | 1,563 | `lite/AGENTS.md`, 15,338 B |
| `Phase-C creative pilot (creative/)` - RETIRED | 1,322 | `creative/AGENTS.md`, 1,322 B |
| `The TASTE instrument (spike/)` - EXPERIMENT | 746 | `spike/AGENTS.md`, 5,615 B |
| `Import analysis (importAnalysis/)` - EXPERIMENT | 675 | `importAnalysis/AGENTS.md`, 1,359 B |
| `The structured setup (spec/)` | 657 | `spec/AGENTS.md`, 2,080 B |
| | **6,684 B** | **53,472 B of multiplier across 8 chains** |

Each is a pointer plus a couple of rules that genuinely reach outside its directory. The pointers are
worth keeping - a reader needs to know the sub-contract exists. The retirement and experiment
NARRATIVES are not: the Phase-C section spends 1,322 bytes explaining a decision from 2026-08-09 that
is already written up in `creative/AGENTS.md` and in `docs/AI_ATTEMPTS.md`, and every session
touching the harness paid for it. The binding rules are now in the store, scoped to where they bind,
so the narrative has nowhere left to hide.

**This is what the owner's question was for.** Not one of those six sections was wrong. Every one was
true, and every one was being read by eight chains that did not need it.

## The pattern worth carrying to the next row

The status labels are the thing to copy. A file whose sections say LIVE, EXPERIMENT or RETIRED can be
triaged in one pass: the RETIRED and EXPERIMENT sections are where dead weight collects, and here
they were 2,743 bytes of it. No other large contract in the repository labels itself this way, which
means the next row has to make the judgement paragraph by paragraph instead of reading it off.
