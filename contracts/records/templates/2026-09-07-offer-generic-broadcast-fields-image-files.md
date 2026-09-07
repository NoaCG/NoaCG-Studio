# templates/offer-generic-broadcast-fields-image-files

Rule: `templates/offer-generic-broadcast-fields-image-files`. Recorded 2026-09-07 on `claude/templates-contract-migration` at 0e351ca6.

The original contract records the rationale and constraints below. Source: src/templates/AGENTS.md, lines 571-575. - Field types offered to users are the ones live graphics actually use: `textfield`, `textarea`,   `number`, and **`filelist` = the image field** (SPX lists files from   `assetfolder: './images/'`). `dropdown`/`checkbox`/`color` exist in the SPX format but are   reserved for genuinely constrained design choices (e.g. the quiz's correct-answer dropdown) -   don't offer them in generic field UIs.
