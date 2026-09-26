# Agent-made graphics - the proof-case fixture

`vote-show.noacgpack.json` holds the two graphics of the vote-show proof case
(`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §3a and §3b), both **authored through the CLI against the
shipped `noacg-graphic` skill** rather than scaffolded from a type, and packed with
`noacg pack` so one import installs the production the spec beside it drives.

- **Votes board** (layer 7) - sixteen operator inputs plus a hidden reported `Shown` field, one
  authored group `off → votes → revealed → out`, and one operator arrow `reveal` whose control
  carries `payload: ["f15"]` and `set: { "f16": "revealed" }`. Its `markGuesses()` sits in the
  template's own JS after the marked animation region.
- **Totals board** (layer 8) - ten inputs, two groups (`main` off/board/out and a `flash`
  none/shown), and **eleven** operator controls: `+1`/`−1` per panelist plus a destructive
  `New game`. Its `sortRows()` re-ranks the board on the same press that moved the number.

Both passed `noacg validate` with zero errors. The votes board raises exactly one warning,
`bench-field-unpainted` on the reported field, which is the pattern working and not a defect
(`cli/skill/noacg-graphic/references/contract.md` §5c says so in as many words).

## Regenerating it

The authored sources are not kept here - the pack carries every graphic whole, so nothing is
lost, and two copies of GSAP and a variable font are not worth the repository weight. To rebuild
the pack from sources, author each board with the loop in `cli/skill/noacg-graphic/SKILL.md`
(the 2026-09-15 walk's verbs and wall clocks are in `docs/AGENT_CLI.md`), and then:

```bash
noacg pack ./votes-board ./totals-board --out ./vote-show.noacgpack.json \
  --name "Vote show" --layer 7 --layer 8
```

The production name is plain ASCII on purpose: it becomes a slug, so the fixture reads the same
on every filesystem.
