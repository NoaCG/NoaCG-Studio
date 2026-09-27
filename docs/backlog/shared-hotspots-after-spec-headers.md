# The shared files parallel projects still collide on, now the spec map is in spec headers

**Filed:** 2026-09-27. **Source:** measurement, when the spec-to-source map moved out of
`scripts/e2e-affected.mjs` into each spec's `// covers:` header (docs/TEST_SELECTION.md "Where the
map lives").

## Why

The owner wants parallel projects (playout, editor, CLI and agent import, SVG import, AI generation
and video, the landing page) that stop colliding on shared files. The spec map was the worst
offender and is gone. These are the next ones, counted the same way: first-parent landings on
`main` from 2026-09-06 to 2026-09-27 (344) whose diff touched the file.

| file | landings | what it is |
|---|---:|---|
| `contracts/index.md` | 42 | generated rule index; has a merge driver (`merge=noacg-contracts`), so a collision is regenerated rather than hand-merged |
| `scripts/e2e-affected.mjs` | 40 | the old spec map - fixed by the header move |
| `docs/README.md` | 24 | the docs index, hand-kept; every new doc adds a row |
| `scripts/copy-baseline.json` | 21 | per-file counts of copy tells, rewritten by `npm run check:copy -- --update` |
| `scripts/e2e-lists.mjs` | 16 | FOCUS and CONFIGURED_TRIGGERS - fixed by the header move |

## What it would take

- `contracts/index.md`: probably nothing. It is generated and carries a merge driver, so the cost is
  a regeneration, not a conflict a person resolves. Confirm from the queue's logs that it never
  blocks a landing before spending anything on it.
- `docs/README.md`: the same move as the spec map. Each doc could declare its own index line in its
  header and the index be generated, or the index could be split per area. Judge by how often its
  collisions actually cost a landing, not by the count alone.
- `scripts/copy-baseline.json`: a per-file baseline is a natural candidate for per-file storage (a
  line in each file's own header, or one baseline file per area). It only shrinks, so collisions are
  two branches both lowering counts - a merge driver that takes the minimum per key would settle it.

## Evidence

`node` over `git rev-list --first-parent --since=2026-09-06 origin/main`, diffing each landing
against its first parent, on 2026-09-27. Other frequently touched files in that window
(`src/components/home/ProductionPage.tsx` 30, `docs.html` 27) are product surfaces with one owner at
a time, not shared registries, so they are not on this list.
