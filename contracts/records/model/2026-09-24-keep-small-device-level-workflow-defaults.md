# model/keep-small-device-level-workflow-defaults

Rule: `model/keep-small-device-level-workflow-defaults`. Recorded 2026-09-24 on `claude/a-close-old-editor` at 2ef023324.

Superseded on 2026-09-24 by row A of the night wave: the rule it replaces listed the editor-visibility Advanced switch. The owner removed Advanced mode (goal 3) because a browser-local tick on a shared classroom computer sent every later student into the old code editor. prefs gained PREFS_VERSION = 2: version 1 (unstamped) drops advancedMode on read and is written back once, so the retired value leaves the browser; an unknown version is read as the defaults and savePrefs refuses to write over it, which is the root versioning invariant's read-only degrade.
