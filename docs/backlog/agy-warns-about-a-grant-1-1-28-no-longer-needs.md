---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "scripts/agy-run.mjs warns on every call that a missing command grant makes listings and directory walks auto-deny silently, but on Antigravity 1.1.28 a listing with no command grant returns a complete and accurate answer"
serves: NEXT
size: small
touches: scripts/agy-run.mjs, scripts/harness-capabilities.json
covered-by: scripts/harness-usage.test.mjs
needs-owner: none
---
# The agy wrapper warns about a grant that 1.1.28 no longer needs

**Filed:** 2026-09-09, from the harness verdict's re-probe
(`docs/metrics/2026-09-09-harness-verdict.md`, question 2).

## What was measured

`npm run agy:read`, no `command` grant, asked to list a directory, returned a complete listing in
6.5 seconds: 16 files with their sizes, every one checked against the filesystem and correct,
including a file 120 bytes long created four minutes earlier. The capability entry
`agy-headless-auto-denies-ungranted-tools` has been refuted twice now, on 1.1.27 and again on
1.1.28 with the accuracy check added.

`scripts/agy-run.mjs` still prints, on that same call:

> no `command(...)` grant and the prompt declares no tool set: any shell, listing or directory
> walk the prompt needs is auto-denied silently. Declare the tool set (read_file, write_file, NO
> SHELL) at the top of the prompt and enumerate the files instead of naming a directory.

So the wrapper tells a session to work around a limitation the installed build does not have, and
`scripts/harness-capabilities.json` says so in the entry beside it. Two files in this repository
disagree about the same fact, which is the part we own.

## Why it is not simply deleted

Only ONE ungranted action was probed: a directory listing. The original observation covered
`list_dir`, `grep_search` and `codebase_search` alike, and nothing says all three changed
together. Deleting the warning on one probe would replace a stale caution with a confident wrong
one, which is the failure mode `docs/HARNESS_ROUTING.md` describes at length under the
subagent-notification correction: a probe that exercises one path measures that path.

## What it would take

- Probe the other ungranted actions the warning covers, each with its own call, and record which
  of them still auto-deny on the installed build.
- Then either narrow the warning to the actions that genuinely still fail, or remove it and let
  the preflight's grant checks stand alone. Whichever way it goes, move the capability entry's
  `measuredOn` in the same commit so the two stop disagreeing.
- Keep the `write_file` and `read_file` grant refusals exactly as they are; nothing here touches
  them.
