---
kind: agent
date: 2026-09-17
---
# `noacg doctor` says when the door is serving last month's instructions

This laptop - the machine demos run from - has been loading a `noacg-graphic` skill
nineteen days old, and nothing said so. `claude plugin list` reports `noacg@noacg-studio` 0.2.0
while the marketplace ships 0.3.3, and nothing auto-updates a Claude Code marketplace. `noacg
doctor` now names it, and names the command that fixes it.

## The route, under a minute

From this branch's worktree, one command, no install:

```
node cli/dist/index.js doctor
```

(or `noacg doctor` once this is published, which is the owner's call and not part of this).

**The stale state, which is what this laptop is in today.** The last two lines of the report:

```
skill        0.2.0 in Claude Code, but this CLI ships 0.3.3 - an installed plugin never updates itself
             run: claude plugin marketplace update noacg-studio && claude plugin update noacg@noacg-studio
```

**The matching state, which the same run also proves.** Codex on this machine holds 0.3.3, the
version the CLI ships, and it prints NOTHING - no row, no reassurance, no line at all. That it was
found rather than missed is visible in the machine-readable report:

```
node cli/dist/index.js doctor --json
```

`skills` lists both installs: Claude Code at 0.2.0 with its update command, Codex at 0.3.3 with
its own. Only the one that disagrees reaches the screen.

**What to look at.** That the 0.2.0 line names Claude Code and not Codex, and that the command
under it is the Claude one - the two harnesses spell the update differently, and the wrong one
would waste a minute in front of a room. Running that command is a MORNING job on a quiet machine:
it swaps the skill text under every session using that checkout, which is why tonight's rows left
it alone.

There is a second, quieter line. When the CLI executing `doctor` is behind npm's `latest`, it
prints `update npm's latest @noacg/cli is X - run: npm i -g @noacg/cli@latest`. It says nothing
today because this checkout is current. To see it, plant a cache file and point the run at it:

```
node -e "require('fs').writeFileSync('C:/Users/ahonemi/AppData/Local/Temp/fake.json',JSON.stringify({latest:'9.9.9',checkedAt:Date.now()}))"
NOACG_CLI_LATEST_CACHE_FILE=C:/Users/ahonemi/AppData/Local/Temp/fake.json node cli/dist/index.js doctor
```

Neither line changes the exit code: a version report is a report, so nothing that gates on
`doctor` starts failing the day a release lands.
