# components/route-every-studio-surface-door-wizard

Rule: `components/route-every-studio-surface-door-wizard`. Recorded 2026-09-28 on `claude/a-wizard-entry-nav` at 3e4140a.

Owner feedback 2026-09-28: the current page is shown as current and is not a clickable button. On the wizard's front page the door was a button whose press did nothing; it now renders as an aria-current item in the same box.

Why a rule rather than a fix, a mechanism or a check: The door's contract spans every studio surface; the wizard-shell and project specs pin the wizard's two states, and the contract keeps a new surface from hand-rolling its own.
