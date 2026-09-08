# Re-measured 2026-09-07, after the compiler learned to write a nested contract

Taken on this branch against `origin/main` at `93001bc7`. The row built the generator and migrated
one area with it: `src/templates/versus`, the smallest contract in the tree.

| Metric | Before | Now | Reading |
|---|---|---|---|
| Contract corpus | 108 files, 574,356 B | 107 files, 574,477 B | one file fewer (the `CLAUDE.md` sibling is gone) and 121 bytes more |
| `src/templates/versus` in the Codex chain | 981 B + 61 B sibling = 1,042 | 1,163 B generated | **+121 bytes. The migration made this chain BIGGER** |
| `src/templates/versus` in a Claude session | 981 B, loaded whenever the directory is touched | 0 B in the chain; 1,093 B loaded only when a versus file is read | the bytes moved from always to on-demand |
| Compiled layer | 1 file, 632 B at launch, 0 B scoped | 2 files, 632 B at launch, 1,093 B scoped | the kernel did not move; the new file is path-scoped |
| Kernel against its ceiling | n/a | 632 of 8,192 B | `npm run contracts:compile -- --report` prints it, and the compiler refuses a kernel over it |
| Hand-written contract files | 108 | 106 | `npm run metrics:contracts` now reports this row directly; the target is zero |

**The row got BIGGER, and that is the honest reading of it.** A generated contract carries about
200 bytes of fixed overhead - the marker the compiler, the edit guard and `check-shared-instructions`
all read, a heading, and one line saying where to change a rule. `versus` was chosen first because
it is the smallest contract in the tree, so it is the worst case for that overhead: three rules do
not amortise it. The header was cut from five lines to one when this number was first measured,
which is why it is +121 bytes rather than +300.

**So the byte win is not what this phase buys, and the plan should stop implying it is.** What it
buys is measurable in three other places, and those are the numbers the next rows should carry:

- **Conflicts.** Three rules that were one paragraph in one file are now three files. The
  `build`-line evidence in `WORKFLOW_ARCHITECTURE.md` §1.4 is that one-file-per-item directories
  absorbed 811 commits with 11 resolutions, against 66 edits and 15 resolutions on a single line.
  `npm run metrics:conflicts` is where this shows up, and not for weeks.
- **Evidence out of the loaded chain.** The three records under `contracts/records/templates-versus/`
  carry the why - the dropped `card05`, the symmetry argument for the field numbering - and nothing
  loads them. In the prose version that reasoning either sat in the chain or was lost.
- **Claude's load moved from always to on-demand.** 981 bytes left every session that touches the
  directory; 1,093 arrive only when a versus file is actually read.

**Where the byte win has to come from instead:** the areas where the prose is large. The tightest
chain is `src/components/wizard` at 102,598 bytes and `src/templates/AGENTS.md` is 52,368 bytes
across 24 chains - 1,256,832 bytes of multiplier from one file. A row that turns 50 KB of prose
into 40 rules pays the 200-byte overhead forty times over. Re-measure this table after
`src/templates` migrates; if the corpus has not fallen by then, the design is wrong and not merely
early.
