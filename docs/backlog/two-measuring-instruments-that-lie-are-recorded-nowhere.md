---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "A timing wrapper spawned with `shell: true` on Windows destroys quoted arguments, and a hidden browser pane throttles requestAnimationFrame so an exit animation reads as a graphic stuck on air. Both were measured; neither is written anywhere a session would look."
serves: NOW
size: small
touches: docs/VERIFICATION.md, docs/AGENT_CLI.md
needs-owner: none
---

# Two measuring instruments that lie about the product, recorded nowhere

**Filed:** 2026-09-09. **Source:** the "Traps that exist in no repo file" section of the CLI
time-to-air walk, `git show a2ab4097:docs/handoffs/2026-09-09-a-cli-minutes-to-air.md`. That file
is consumed; the third of its three traps is durable in `scripts/dev-worktree.mjs:64-67`, and these
two are not.

## Why

Both produced a wrong reading that looked exactly like a product defect, and one nearly became a
filed bug.

**A timing wrapper spawned with `shell: true` on Windows destroys quoted arguments.** Node joins
argv with spaces before handing it to `cmd.exe`, so `--name Football` arrives as two arguments and
a stray word appears from nowhere. Node warns (`DEP0190`) and the warning is easy to scroll past.
The walk's first `scaffold` run came back with a stray `scoreboard` in it and the row nearly filed
a product bug; re-running the command by hand with real quotes is what separated the harness from
the product - and the CLI *was* wrong, just differently, in that it ignored the stray word rather
than refusing it. That is now `refuseStrayArgs` (`cli/src/output.ts:112`) and the reason the
remaining guardless verbs have their own backlog item.

The mechanism is written down once, in `scripts/agy-run.mjs:145-150`, as an argument for preferring
a real `.exe` to a launcher when spawning `agy`. Nobody writing a timing harness reads that file.

**A hidden browser pane throttles `requestAnimationFrame`.** A GSAP exit animation freezes mid-way
and advances one step per screenshot, which reads precisely like a graphic that will not come off
air - the single most alarming thing a broadcast graphic can appear to do. The repo already has the
right instruments (`noacg screenshot`, the bench); what it does not have is the sentence saying the
pane is not one of them.

## What it would take

A short section, most naturally in `docs/VERIFICATION.md` since it owns what counts as a
measurement here, naming both instruments and the rule that covers them: **re-run a surprising
result outside the harness before writing it down.** Roughly fifteen lines. The CLI half could also
sit beside "Time to air, measured" in `docs/AGENT_CLI.md`, which is where the next person timing the
CLI will be standing.

Worth pairing with the delegation lesson at the same altitude - re-derive the receipt, never the
report (`docs/HARNESS_ROUTING.md`, "Split a sweep's file list") - since all three are the same
sentence pointed at three different tools.

## Evidence

- `git show a2ab4097:docs/handoffs/2026-09-09-a-cli-minutes-to-air.md`, "Traps that exist in no
  repo file" - both traps in the words of the row that hit them.
- `scripts/agy-run.mjs:145-150` - the `shell: true` mechanism, in the one place it is written.
- `cli/src/output.ts:100-121` - the product defect the wrong reading was nearly filed against, and
  what it actually was.
- `scripts/dev-worktree.mjs:64-67` and `docs/DEV_PORTS.md:85` - the third trap from the same
  section, which does have a home. It is the shape to copy.
