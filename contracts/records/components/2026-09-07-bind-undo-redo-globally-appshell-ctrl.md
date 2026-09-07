# components/bind-undo-redo-globally-appshell-ctrl

Rule: `components/bind-undo-redo-globally-appshell-ctrl`. Recorded 2026-09-07 on `claude/components-contract-migration` at 550fd5cf.

Monaco carries its own undo stack, and a global binding that fires inside it undoes a document change the reader was not looking at.
