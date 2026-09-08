# components/read-before-writing-dialog-markup-every

Rule: `components/read-before-writing-dialog-markup-every`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

The anatomy exists because six dialogs each invented a header and each grew its own defects. It moved out of this contract to src/styles/ on 2026-08-29 so the wizard and the editor read one source; restating it in a component is how the copies drift apart again.
