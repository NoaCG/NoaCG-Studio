---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "A repo-wide citation sweep routed to Antigravity spends ~9 s and 18 K tokens and returns an empty response, because headless agy cannot grep."
serves: NOW
size: small
touches: scripts/agy-run.mjs, docs/HARNESS_ROUTING.md
needs-owner: none
---

# A sweep routed to Antigravity returns nothing, because headless `agy` cannot grep

**Filed:** 2026-09-09. **Source:** measured on the 2026-09-09 night drain, which was told to
delegate its citation sweep and could not. Ledger label `ad-handoff-citation-sweep`
(`~/.noacg/delegation-outcomes.jsonl`: antigravity / gemini-3.7-flash-high / doc-sweep /
`unusable` / cause `prompt`).

`npm run agy -- --write` with an eleven-filename sweep prompt returned an empty response after
8.8 s. `agy-run.mjs` diagnosed it correctly and the diagnosis is the finding: **only `read_file`,
`command` and `write_file` are real grant actions in `~/.gemini/antigravity-cli/settings.json`.
`list_dir`, `grep_search` and `codebase_search` are silently ignored as invalid.** A model asked to
search a repository reaches for `grep_search`, which cannot be granted, so in headless mode it is
auto-denied with no prompt to answer and the run ends with nothing.

## Why

The repo's own guidance sends this shape of work to Antigravity - long to do, short to specify,
and the exact task class (`doc-sweep`) the ledger records it doing well. But every sweep worth
delegating is a search, and search is the one thing this harness cannot do headlessly. Three
prompts have now hit the same wall from different directions; the wrapper warns about it in prose
at call time, which is the moment the caller has already written the prompt and is about to spend
the tokens.

The spend is small per attempt and the waste is total: a denied run still costs input tokens (the
wrapper records failed calls for exactly this reason), and it returns no partial result to salvage.

## What it would take

**Refuse earlier and route elsewhere.** `agy-run.mjs` already inspects the prompt well enough to
warn; it should refuse a prompt that reads like a search when no `command(...)` grant exists, and
`docs/HARNESS_ROUTING.md` should say plainly that repo-wide search does not go to Antigravity.
Today its judgement about this harness rests on task classes that never needed to search.

**The other option was considered and decided against, not deferred.** Granting `command(rg)` - or
a narrower target - in `~/.gemini/antigravity-cli/settings.json` would make the harness usable for
the work it is otherwise good at. It is not taken because it widens the machine's permission
posture, and a session may not do that on its own argument; that is the same edge on which
`docs/backlog/the-allowlist-is-not-what-stops-a-row-at-night.md` was parked. Refusing early costs
the capability and nothing else, and it is reversible the day the owner wants the grant. If he ever
does, the grant is the whole fix and this item becomes his.

## Evidence

- `scripts/agy-run.mjs` - the warning it prints when a prompt declares no tool set, and the
  diagnosis it prints on an empty response, both naming the three real grant actions.
- The run itself: `npm run agy -- --model gemini-3.7-flash-high --label ad-handoff-citation-sweep
  --write --prompt-file <sweep>`, 8.8 s, empty response, working tree unchanged.
- `~/.noacg/agy-usage.jsonl` and `~/.noacg/delegation-outcomes.jsonl`, label
  `ad-handoff-citation-sweep`.
- What the sweep was worth doing by hand: eleven filenames across the whole checkout, about three
  minutes with ripgrep, one live path citation and no prose citations found.
- `docs/HARNESS_ROUTING.md`, "A sweep must be handed its FILES - measured 2026-09-03" - the earlier
  half of this. That entry says to enumerate the files so only `read_file` is needed, which works
  when the delegate is told WHICH files to read. It does not cover a task whose question is "find
  every file that mentions X", where the enumeration is the answer rather than the input.
- `docs/backlog/harness-routing-doc-cites-four-refuted-claims.md` - a separate open item that also
  ends in an edit to `docs/HARNESS_ROUTING.md`. Worth taking in one pass; the two do not overlap in
  subject.
