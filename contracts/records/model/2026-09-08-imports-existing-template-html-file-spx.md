# model/imports-existing-template-html-file-spx

Rule: `model/imports-existing-template-html-file-spx`. Recorded 2026-09-08 on `claude/a-model-contract` at 684e2bf2.

Extracted from `src/model/AGENTS.md`, corrected against the code twice over. The contract named the Style/Motion panels; there is no Motion panel - the editor's tabs are Inspector, Content, Rehearse, Style, Assets, AI and Export, and motion lives in the Inspector, whose empty state reads 'No managed animation in this template.' And the AI panel's button says 'Make it playout-ready', not 'Make SPX-ready'; the old label survived in `importTemplate.ts`'s own header comment, which was corrected on the way in. The rule names the affordance rather than the label so a copy change cannot make it stale.
