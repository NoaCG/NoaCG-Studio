# Whole-graphic connections and downloadable data templates

Owner clarification, 19 October 2026. Planning refinement only: no product implementation or changes to the executable run plan. This refines P2 in [the proposed additions](09-owner-feedback-and-run-additions.md). Existing mockups illustrate interaction logic, not replacement styling for the production page.

## What already exists

- `src/components/home/ProductionDataPanel.tsx`, `BindingTable`: **Bind this graphic by title** and **Bind all by title** apply unambiguous suggestions in one explicit operation, preserving existing bindings.
- `src/model/productionData.ts`, `matchTitle` and `suggestPath`: title matching compares normalized leaf names and full paths; ambiguity yields no suggestion. This is not arbitrary workbook interpretation or semantic understanding of a bracket.
- `docs/work-specs/data-sources/spec.md`, Formats and AC-13: starter rows carry current content for known adapters. This is not yet a universal downloadable template for every custom graphic.

Evidence inspected in the working tree based on main `c9f1769c2147acf12f37e7a19192f9c4ce036fea`.

## Proposed primary interaction

1. Select a graphic in the existing production control panel beneath the monitors.
2. Open one **Connect data…** action. Choose an existing source or add one; choose the relevant sheet tab or defined table once where needed.
3. Propose mappings for the whole graphic, scoped to that source. Prefer supplied field identities/mappings; otherwise offer unique compatible name matches. Do not guess ambiguous matches or replace existing bindings silently.
4. Show a compact preview: for example, “28 matched · 2 need attention,” with sample values and the affected graphic/cues. Confirm once to connect all reviewed matches.
5. Use individual field connectors only to repair exceptions or deliberately connect a subset. Done hides editing controls; it does not pause the source. Connected state and meaningful errors remain visible.

Sources remain shared at production level. Bindings belong to the graphic and affect its cues; cue-specific identity selection is separate work. Connecting a graphic does not subscribe indiscriminately to every tab in a workbook. Multiple tables can be supported by explicit mappings rather than per-cell setup.

## Downloadable starter data

Add **Download data template** for a graphic's declared editable fields, populated with its current/default values and stable mapping keys. Start with CSV that can be imported into Google Sheets or Excel; downloading a file does not require creating a Sheet in the user's Google account. Local Excel live reading remains future work.

The generic fallback is a readable field/value table with generated keys. Its keys identify fields in the applicable graphic version, not universal semantic identities. Renamed labels must not break identity; incompatible reimports require mapping review. Do not introduce a new graphic engine or infer undeclared SVG controls to provide this feature.

For a structured graphic, prefer a table supplied with the graphic package and an explicit mapping. An illustrative bracket template could be:

| match_id | home_team | away_team | home_score | away_score |
|---|---|---|---|---|
| quarterfinal_1 | Harbour | North | 12 | 9 |
| quarterfinal_2 | East | West | 7 | 8 |

The supplied mapping identifies each match slot and its fields. Changing row order must not move teams to another match. An arbitrary custom graphic can receive the generic field/value template; producing this richer bracket layout requires declared structure or an authored recipe. A graphic that exposes a list as one field uses its compatible list adapter rather than pretending each item is a separately exposed field.

Changing scores updates values. It does not automatically advance winners, Take the graphic, or trigger animation steps. Such behavior needs its own explicit upstream or operator rules.

## Proposed acceptance additions for the planned run

- Connect one generated starter Sheet to a supported custom graphic in one confirmed operation, without mapping every field individually.
- Downloaded starter content round-trips through Sheets with field identities preserved; label edits do not silently redirect values.
- A partially matching existing Sheet exposes unmatched, duplicate and incompatible entries for repair without replacing established bindings.
- Reordering keyed bracket rows preserves their destination slots when using a supplied structured mapping; do not claim arbitrary bracket inference.
- Reuse a single source reader for all its fields and preserve current scalar override, list ownership, disconnect, prepared-message and playout boundaries.
- Keep the current control-panel appearance. The single connection action and optional field controls are additive; no separate connection tab is required for ordinary setup.

These are proposed refinements to reconcile into the formal plan before execution, not a claim that they are already implemented or qualified. The universal scalar template and bulk Sheet mapping should be made explicit in P2; richer package-specific layouts belong with their graphics packages.

## Future source issue

[Issue #1507: Excel Online and local TXT, CSV, JSON and XLSX files](https://github.com/NoaCG/NoaCG-Studio/issues/1507) records the requested later providers through the same connection flow. Local live sources require an authorized file-reading component; an open, unsaved Notepad window is not a file feed.

RSS/Atom stays in the current data-sources plan. Existing issues #787 (data-driven graphics/Sheets) and #764 (spreadsheet-to-rundown generation) are related but do not replace the future-provider issue.
