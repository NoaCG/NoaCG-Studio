# Three private copies of "enumerate Win32_Process through PowerShell"

**Filed:** 2026-09-08. **Source:** the 2026-09-02 RAM-reclaim session, simplify leg (handoff since
drained)

## Why
`scripts/e2e-runs.mjs:68` and `:129` and `scripts/reclaim.mjs:344` each spawn their own
`Get-CimInstance Win32_Process | Select-Object ... | ConvertTo-Json -Compress`, with their own
field list, their own parse and their own empty-result shape. `scripts/jobs.mjs:1066` reasons
about the cost of that enumeration in a comment while calling none of them. Three copies of one
platform-specific incantation drift, and the failure mode is a silent empty list, which reads as
"no processes" rather than as an error.

## What it would take
`enumerateProcesses({ fields, filter })` in one module, returning parsed rows and `[]` on failure;
the three callers ask for the fields they need. It ripples outside any one diff, which is why the
reclaim branch left it as a note.

## Evidence
`scripts/e2e-runs.mjs:56-68`, `:129`; `scripts/reclaim.mjs:344`; `scripts/jobs.mjs:1066`.
