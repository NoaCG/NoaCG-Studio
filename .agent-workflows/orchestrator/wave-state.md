# The wave-state file - the plan's durable copy

At the path `node scripts/wave-plan-store.mjs --path <date> <day|night>` prints - the store beside
the job store, NEVER a checkout. It holds: `## Wave table` (columns L, goal, START, TOUCHES, MINTS,
POOL, browser); every prompt verbatim; `Pools at plan time:`, `Window starts: <iso>`, `Window ends:
<iso>` lines (read by `wave-horizon.mjs`), and on a night wave a `## Candidates` TABLE the refill
loop draws on, columns in `night.md`; `## Handoffs`, one line per file read (`- consumed: <file> ->
row B`); `## Weekly review` and `## Owner receipts`, one line per item `weekly-candidates.mjs` and
`owner-receipts.mjs` list; then the tick's heartbeat lines and whatever the morning report needs
nowhere else - a ruling taken for the owner, an unplanned launch and its reason. The scripts read
`## Wave table`, `## Candidates` and `## Handoffs` by name; a receipt slug or an alignment id
satisfies the check anywhere in the file, so the other two headings are for the reader. **A plan
launches when `node scripts/wave-plan-check.mjs` passes.** What it refuses is enumerated in its own
header comment, not cached here; a night plan with no `Window ends:` line is the one most often
tripped. A correction sends the rows back through the collision pass before it ships.
