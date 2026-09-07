---
kind: walk
date: 2026-09-07
---
# src/components contract: seventeen paragraphs kept out, and three tooltips corrected

**Date:** 2026-09-07. **Route:** open
`docs/metrics/2026-09-07-components-migrated.md` and read the section "True, but no longer worth
loading". Then, in the app at `/app`, hover the **Home** button in the topbar.

## What to look at

**The decision that is yours.** `src/components/AGENTS.md` became 44 rules in the store. Seventeen
units of it were true but were not migrated, and they are listed with a reason each. Eight of the
seventeen are pointers - one section per subdirectory saying that the subdirectory has its own
contract. Nothing was deleted: the whole file is kept verbatim in
`contracts/records/components/2026-09-07-the-contract-this-replaced.md`. If you want any of them
back, say which and it becomes a rule.

The question behind the list is the one you asked on 2026-09-07: these files may have grown because
nothing ever left them. In this area what never left was the index each file kept of the files
around it.

**The one visible change.** Three topbar tooltips still offered "packages", which was retired from
the product in the student release. They now read "your graphics, productions, control panels, and
videos", matching the wizard's header, which was already correct. The editor, the video shell and a
graphic's control page each carry one.
