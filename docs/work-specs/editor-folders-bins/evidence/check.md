# R1.2b.7 engineering check

Review: inline, 13 confirmed findings fixed. The first 12 are reproduced and
covered in review.md, the focused browser acceptance and native guards. The
build's script-discovery refusal is retained in build-discovery.log; registering
the existing mutation bench makes the unchanged discovery gate pass.
No independent review capability was callable in this session.

Simplify: inline. Reuse the existing parser, source operation registry,
transaction/history, asset moves/imports and saved-graphic APIs. One shared
inline name control and one inert-header partition replace duplicated behavior.
No further cleanup is needed in the final diff.

Verify: inline. Product code was unchanged after the passing final collision
repair. The later package edit only registers that already executed bench.

| Criterion | Observation |
| --- | --- |
| AC-1 | Written-first j-3516 on unmodified main: existing group navigation passed, four new cases failed on absent folder/bin controls. The real template task was also written before implementation. |
| AC-2 | j-3577: folder creation, inline rename, collapse, nesting, release, editor ordering, root/local membership and canvas selection passed. Folders have no transform or bar. Artwork, CSS, motion, fields and asset bytes remain exact. |
| AC-3 | j-3577: persistent empty bins, reference-safe asset moves/renames, bucket ownership, field defaults/live samples and exact undo passed. Shared asset helpers retain inert metadata; other AssetsPanel callers keep existing APIs. |
| AC-4 | j-3577 and seven native guards: stale source/assets, cycles, mixed scopes, duplicate paths/names, unknown operations/versions, Escape/input keys and same-saved-document drafts passed with exact refusal and atomic history. |
| AC-5 | Hairline task: draw/group, organize root/local folders, import/place a sponsor image, move to a bin, save/reopen and execute SPX, CasparCG and OGraf exports. Geometry differs by less than 0.05px; image loads; task/output page-error list is empty. All six committed captures were visually inspected at 1920x1080, 1366x768 and the 1093x614 CSS viewport proxy for 125% zoom. Stage/root return are visible and asset controls fit the dock. |
| AC-6 | j-3584, queued with E2E_WORKERS=3 and cap 120: full browser suite 1,528 passed and 542 existing skips; catalog battery 35 passed. Includes editor/assets, anim-engine and inspector. j-3578: control green, eight isolated mutations killed, about two-second write/restore waits and byte-exact source restoration. Historical generated artifacts restored before commit/build. |
| AC-7 | Unverified in this pre-landing review. The exact-tip build, check stamp, merge-queue entry, merge, deployed version and durable continuation require their actual observations. The landing receipt will close only this bounded criterion after those occur. |

The full suite intentionally logs some fixture errors; its green result is not
a blanket claim that every fixture has no console errors. The Hairline task
explicitly checked its own empty page-error list.

Full B02/B04, owner desktop/taste judgment, actual OS/browser 125% zoom and
physical receiving-host acceptance remain open. The configured authenticated
suite was not run here. Existing main alarms #706, #707 and #716 are outside
this slice and are not claimed fixed.


## Immutable review and complete scope

Reviewed revision: `99398353619d172b6f85409755a85de143893d42`.

```json
{
  "branch": "codex/editor-folders-bins-r1-2b-7",
  "mergeBase": "297591f7262164c62e2d08cd897a4b35cdbe60ca",
  "files": [
    "docs/EDITOR_PLAN.md",
    "[docs/acceptance/owner-queue/2026-10-07-editor-folders-bins.md](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/acceptance/owner-queue/2026-10-07-editor-folders-bins.md)",
    "docs/research/editor-acceptance-register-2026-09-17.md",
    "docs/research/editor-r1-2b-7/README.md",
    "docs/research/editor-r1-2b-7/desktop-bins.png",
    "docs/research/editor-r1-2b-7/desktop.png",
    "docs/research/editor-r1-2b-7/laptop-125-bins.png",
    "docs/research/editor-r1-2b-7/laptop-125.png",
    "docs/research/editor-r1-2b-7/laptop-bins.png",
    "docs/research/editor-r1-2b-7/laptop.png",
    "docs/work-specs/editor-folders-bins/evidence/acceptance.log",
    "docs/work-specs/editor-folders-bins/evidence/asset-metadata.md",
    "docs/work-specs/editor-folders-bins/evidence/asset-written-first.log",
    "docs/work-specs/editor-folders-bins/evidence/baseline.log",
    "docs/work-specs/editor-folders-bins/evidence/build-discovery.log",
    "docs/work-specs/editor-folders-bins/evidence/check.md",
    "docs/work-specs/editor-folders-bins/evidence/mutations.log",
    "docs/work-specs/editor-folders-bins/evidence/native-writer.md",
    "docs/work-specs/editor-folders-bins/evidence/nested-bin-written-first.log",
    "docs/work-specs/editor-folders-bins/evidence/readonly-written-first.log",
    "docs/work-specs/editor-folders-bins/evidence/regressions.log",
    "docs/work-specs/editor-folders-bins/evidence/review-written-first.log",
    "docs/work-specs/editor-folders-bins/evidence/review.md",
    "docs/work-specs/editor-folders-bins/evidence/session-written-first.log",
    "docs/work-specs/editor-folders-bins/evidence/source-format.md",
    "docs/work-specs/editor-folders-bins/evidence/written-first.spec.ts.txt",
    "docs/work-specs/editor-folders-bins/spec.md",
    "docs/work-specs/editor-folders-bins/work.json",
    "e2e/editor-folders-bins.spec.ts",
    "package.json",
    "scripts/editor-organization-mutation-bench.mjs",
    "scripts/editor-organization.test.mjs",
    "src/assets/assetInfo.ts",
    "src/assets/assetUtils.ts",
    "src/blocks/assetOps.ts",
    "src/blocks/editorOrganization.ts",
    "src/components/AssetsPanel.tsx",
    "src/components/editorFoundation/EditorFoundation.tsx",
    "src/components/editorFoundation/InlineOrganizationName.tsx",
    "src/components/editorFoundation/OrganizationControls.tsx",
    "src/components/editorFoundation/Timeline.tsx",
    "src/components/editorFoundation/foundation.css",
    "src/components/editorFoundation/operations.ts",
    "src/components/editorFoundation/session.ts",
    "src/model/editorOrganization.ts"
  ],
  "deleted": []
}
```
