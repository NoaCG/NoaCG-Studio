# The Data workspace still writes the whole show record on every keystroke

**Filed:** 2026-09-17. **Source:** row TM (`claude/tm-one-edit-one-write`), found while fixing the
same bug one block up the same page. Read from the code and from the write path, not reproduced
against a published production.

## Why

TM made the Data tab's value boxes and binding boxes cost ONE write per edit instead of one per
character, and left `src/components/home/useDeferredEdits.ts` behind as the mechanism. Two
surfaces on the same page were not converted and still write per character.

**The dataset cells** (`src/components/home/ProductionDataWorkspace.tsx` - `renameShowDataset`,
`renameDatasetColumn`, `updateDatasetRow`, all on `input`). Each goes through `patchShow`
(`src/model/shows.ts`), which loads every show, mutates one, saves them all, and bumps
`updatedAt`. Typing a twenty-character column header is twenty of those. `productionState.ts`'s own
header says where that ends: `updatedAt` per tick means a document sync per tick, and a
two-operator production mints a conflict copy that unpublishes itself mid-show. That is the reason
the live tree was kept off the show record in the first place, and the tables are on it.

**The audience broadcast rows** (`src/components/home/ProductionAudienceWorkspace.tsx`, the
`broadcastBody` patches) are a backend round trip per character, on text a producer is writing for
air. Different budget from the tables, and a different investigation.

Shipping "one edit, one write" for the Data *panel* while the Data *workspace* two tabs over still
does this is a half-kept promise, and an operator types into both.

## What it would take

The dataset cells are the strong candidate and are the cheap one: about five lines per input
against the existing hook, which already carries the settle timer, the unload doors and the rule
that keeps an arriving write out of a box under the cursor. One key per cell (dataset id, column
key, row id), and the commit calls the same `patchShow` it calls today.

Watch the same two things TM hit. An element whose TYPE is chosen from text that moves while
somebody types will swap under an idle caret when the settle timer fires - choose it from something
a commit cannot change. And any test that counts writes must not pin how fast the machine running
it is: `expectOneEditOneWrite` in `e2e/production-data.spec.ts` allows one write plus one per
settle window the typing actually spanned, which is the shape to copy.

The audience rows want their own look first: a network write per character is a different cost from
a storage write per character, and whether the right answer is deferral or a different endpoint is
not obvious from the call site.

## Evidence

`src/components/home/useDeferredEdits.ts` names both surfaces in its own doc block.
`docs/handoffs/2026-09-17-tm-one-edit-one-write.md` carries the measurement that started this: a
twelve-character edit cost twelve writes before, and one after.
