# wizard/keep-wizard-header-three-doors-shared

Rule: `wizard/keep-wizard-header-three-doors-shared`. Recorded 2026-09-28 on `claude/a-wizard-entry-nav` at 3e4140a.

Owner feedback 2026-09-28: Wizard and Home must share one top bar with logo, Home and + New graphic in the same positions, and the current page shown as current rather than as a clickable button. Before, the wizard put its step crumb between the logo and Home and rendered + New graphic as a no-op button on Entry, and Home's topbar showed Home as a dim crumb.

Why a rule rather than a fix, a mechanism or a check: Which door is current, and that the two bars share geometry, spans two components; the wizard-shell spec measures it, and the contract names the shared group so a new shell or a restyle joins it rather than forking a bar.
