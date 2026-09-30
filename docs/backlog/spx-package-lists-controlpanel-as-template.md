---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "SPX's template browser lists the SPX package's controlpanel.html beside the graphic's template in every folder, on 1.2.1 and 1.4.1; choosing it fails with SPX's template-definition-missing error (docs/SPX_ON_A_REAL_SERVER.md §2)"
serves: NOW
size: small
touches: src/export/targets/spxStarter.ts, src/export/showExport.ts
needs-owner: none
---

# SPX offers the control panel page as a template

**Filed:** 2026-09-30. **Source:** measurement on real SPX 1.4.1 and 1.2.1 servers,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §2.

## Why

The first thing an SPX operator does with our folder is pick the template from SPX's browser, and
every folder offers two files, one of which is not a template. Half the first guesses fail with an
SPX error that does not mention NoaCG.

## Reproduction

Put an exported SPX folder under `ASSETS/templates/`, open project settings, add a template and
open the folder: the list reads `controlpanel.html` and `<graphic>.html`.

## What it would take

- SPX's browser skips files whose names start with `_` or `.` (`GetFilesAndFolders` in 1.4.1's
  `utils/spx_server_functions.js`). Name the page `_controlpanel.html`, or move it into a
  subfolder, in the single-graphic export and the production export, and update the READMEs and
  guides that name it.
- Check that nothing else links the old name (the control panel's own references, e2e specs).

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §2.
