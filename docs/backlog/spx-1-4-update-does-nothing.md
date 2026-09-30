---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "On SPX 1.4.1 Update changes nothing on air for any template, NoaCG's or not, because of an SPX defect with an open upstream fix (pull request 161); on 1.2.1 it works. Our SPX packages do not tell the operator (docs/SPX_ON_A_REAL_SERVER.md §2)"
serves: NOW
size: small
touches: src/export/targets/spxStarter.ts, src/export/showExport.ts, src/export/targets/ograf.ts
needs-owner: none
---

# Say in the SPX package that Update does nothing on SPX 1.4

**Filed:** 2026-09-30. **Source:** measurement on real SPX 1.4.1 and 1.2.1 servers,
[`SPX_ON_A_REAL_SERVER.md`](../SPX_ON_A_REAL_SERVER.md) §2.

## Why

Changing a score or a name on air is routine. On SPX 1.4 the Update button silently does nothing,
and an operator will blame the graphic. We cannot fix SPX, but our package can say what works.

## Reproduction

On SPX 1.4.1, play any template, edit a field, Save, press Update: nothing changes, and the
renderer throws `TypeError: Cannot read properties of null (reading 'value') at updateItem`. On
1.2.1 the same steps update the graphic.

## Cause (SPX's)

Update posts its data without the project format; the renderer defaults an update to OGraf and
calls the controller's `updateItem()`, which does not work in the renderer
(`views/view-renderer.handlebars`, `case 'updateTemplate'`). Still so on SPX's master branch; an
open pull request, <https://github.com/TuomoKu/SPX-GC/pull/161> (2026-03-13), fixes the default.

## What it would take

- One line in the SPX README and GETTING-ON-AIR guide of both exports: on SPX 1.4, Save, then Stop
  and Play, to change a graphic on air; Update works on 1.2 (and on 1.3, by the upstream report).
- Drop the line for HTML templates when an SPX release ships the fix. It does not cover the OGraf
  route: there the renderer always calls the controller's `updateItem()` (`updateLayer` in
  `views/view-renderer.handlebars`), so the OGraf package's README needs the same line until SPX
  changes that too. The OGraf package's README carries it since `SPX_ON_A_REAL_SERVER.md` §10.

## Evidence

`docs/SPX_ON_A_REAL_SERVER.md` §2 and §3.
