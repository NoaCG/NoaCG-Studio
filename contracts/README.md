# The rule store

The loaded contracts are compiled from here. Nothing in this directory loads into a session by
itself; `scripts/compile-contracts.mjs` turns the active rules into the root `AGENTS.md` (the
`**` rules, loaded by every session and held to a byte budget), `.claude/rules/*.md` (which
Claude Code loads only when a matching file is read), the nested `AGENTS.md` Codex reads, and
`index.md`. The design and the
measurements behind it are in `docs/WORKFLOW_ARCHITECTURE.md` §5.3.

## Layout

- `rules/<area>/<slug>.md` - one rule per file. The id is the path: `<area>/<slug>`.
- `records/<area>/<date>-<slug>.md` - one incident per file: the date, the run, the measurement,
  the reasoning. Never loaded, linked from the rule.
- `index.md` - generated, every rule with its scope and status.

## A rule file

```
---
scope: src/components/wizard/**, src/templates/shared/base.ts
kind: trap            # invariant | trap | rule | taste
fires: contract       # contract | hook:<name> | gate:<script> | test:<spec path>
status: active        # active | retired
since: 2026-09-02
supersedes:           # comma-separated rule ids, optional
record: contracts/records/wizard/2026-09-02-inline-hidden-holder.md
---
An input-only value lives in a holder carrying `class="noacg-data-source"`, never an inline
`style="display:none"`: the entrance reset clears inline properties and the raw value airs.
```

The text is imperative, one to three sentences, with symbols in backticks. It carries no date,
run id or measurement; the compiler refuses those, because that is evidence and it goes in the
record. `allow-numbers: true` admits a number that IS the rule (a budget, a reserve).

`fires:` says what carries the rule. A rule a hook, gate or spec carries costs the compiled
contracts nothing: the mechanism fires at the moment, and the index still lists it. `contract`
means prose is the only home it has.

## Before writing one: the ladder

A mistake is evidence, not automatically a rule. Climb this ladder and stop at the first step
that works:

1. **Fix the cause.** Change the code, the name, the default or the doc so the mistake cannot
   happen again. No rule.
2. **Make it mechanical.** A test, gate, hook or better default whose failure message is the
   rule. Set `fires:` to it and the rule costs the loaded contracts nothing.
3. **Scope it.** Give it the narrowest `scope:` where it matters, so it loads only there.
4. **Always-loaded, last.** A `**` scope goes into every Claude and Codex session. `learn`
   refuses one without `--always`, and the root budget (`KERNEL_MAX_BYTES`) means adding a
   rule there retires another.

A single ordinary mistake is evidence, not a rule: record it and move on. Act on a repeated,
expensive or systemic failure, and write a rule only when a fix, a mechanism or a check cannot
carry the lesson. State the outcome and its reason, never "ask the owner first" on its own. Plain text, no shouted emphasis: current
models over-apply it. `npm run audit:instructions` checks the whole system about monthly. When the agents move to a substantially newer model, review the always-loaded rules and retire what the model now does reliably by default. After any change to
how instructions load, measure it: `node scripts/instruction-load-probe.mjs run <files>` lists
every instruction file a fresh session received and flags one that arrived twice.

## Recording a lesson

```
npm run learn -- --area wizard --evidence "what happened"
```

That records an observation: one record under `contracts/records/<area>/`, no rule, nothing
recompiled. The monthly review reads the records for patterns. When the ladder says a rule is
right:

```
npm run learn -- --area wizard --scope "src/components/wizard/**" --kind trap \
  --rule "..." --because "why a fix, a mechanism or a check does not cover it" --evidence "..."
```

`learn` refuses evidence in the rule text, appends the evidence to an existing rule's record when
the rule is already in the store (no second rule), refuses a `fires:` naming a mechanism that is
not in the tree, and recompiles. Commit the rule, the record and the regenerated files together.
Retire a rule by setting `status: retired` (and `supersedes:` on its replacement); never delete
the file, so a lost symbol is a visible change rather than a missing paragraph.

## Gates

- `npm run check:contracts` - the store parses, no rule carries evidence, no two active rules
  read as one, every named mechanism exists, the generated files are current.
- `npm run check:contract-evidence` - a hand-written `AGENTS.md` may not gain a line carrying a
  date, a run id or a measurement; the count is a limit that only tightens.
- `scripts/check-contract-freshness.mjs` - a backticked path or script a rule names must exist.
