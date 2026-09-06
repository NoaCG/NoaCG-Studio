---
kind: walk
date: 2026-09-06
---
# The learning write path: `npm run learn` and the compiled rules

**What changed.** Phase 0 of `docs/WORKFLOW_ARCHITECTURE.md`. A lesson no longer goes into an
`AGENTS.md` paragraph. `npm run learn -- ...` writes one rule file under `contracts/rules/` and
one record under `contracts/records/`, refuses dates and measurements in the rule text, appends
evidence to an existing rule instead of minting a twin, and recompiles the path-scoped
`.claude/rules/*.md` files Claude Code loads only when a matching file is read. Two gates hold
the line: `check:contracts` (the store compiles and the generated files are current) and
`check:contract-evidence` (a hand-written contract may not gain an evidence paragraph). The
queue now reads the `/check` stamp: `npm run queue:merge` refuses a tip the stamp does not cover,
and `--unreviewed "<reason>"` is the visible way past. `npm run metrics:*` reproduces the
baseline in `docs/METRICS.md`.

**Route, under a minute.**

    npm run learn -- --area wizard --scope "src/components/wizard/**" --kind trap \
      --rule "Try it with a date in here, 2026-09-06." --dry-run

refuses and says why; drop the date and it prints the rule file it would write. Then
`cat .claude/rules/everywhere.md` shows the one compiled rule that loads at launch, and
`npm run check:contracts` says the store is current.

**What to look at.** Whether the refusal messages read as help rather than as a wall, and
whether the rule text format (one to three imperative sentences, symbols in backticks, no
evidence) is what you want every session writing from now on. The format is cheap to change
today and expensive after phase 2b migrates 108 files into it.
