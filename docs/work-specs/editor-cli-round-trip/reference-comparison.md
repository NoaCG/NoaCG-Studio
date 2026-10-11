# Pinned reference comparison

VectorCraft v0.4.0 portable Windows release, revision
`a26aa5b203c901979eb447d28e34e7357138c789`. Published SHA-256 matched:
`fa8d7dc5590ebf1adb93d040dd7420441a2e55db2971f33c05c0c0e5edde0fec`.
A private copy ran with its loopback control server. No reference code or runtime
was copied into NoaCG or the fixtures.

Exact inspected paths and blob identities are in `reference-source.json`:
`apps/vectorcraft/src/control_server.rs`, `crates/ui-egui/src/control.rs`, and
`crates/engine/src/cmd/{typecmd,object,edit}.rs`. The control server dispatches
`engine.execute` to existing commands; `text.setText` preserves text styling;
`object.transform` changes geometry; Edit owns undo/redo; File owns native save.

Executed task: open an independently authored 1920x1080 SVG strap, change Amira
Solano to Elena Marquez, translate that text by (70,30), keyboard Undo and Redo,
save as native `.vectorcraft`, reopen, inspect text and geometry and render.
All passed. `reference-round-trip.json` records actual calls and responses;
`reference-edited.png` and `reference-ui.png` show the rendered document and GUI.
An initial harness assertion compared the bounds of two different words. It was
corrected to compare translation against the bounds after the text edit; that
failed assertion was not a reference product defect.

The native reference has a direct vector/text canvas and compact tool/property
panels. Its SVG importer produces native nodes (the panel becomes a path).
NoaCG retains readable HTML/CSS/JS with stable source IDs and edits through the
existing inspector and timeline. These are deliberately different persistence
contracts. The comparable subset is imported text/artwork, history and durable
reopen. No equivalent exists in this reference for a CLI HTML/JS broadcast
package, SPX fields, local script metadata, cues, operator events or executable
SPX/CasparCG/OGraf exports. Those must pass NoaCG's own contract; this comparison
makes no claim about whole-editor parity or broad B17/B18/E23 acceptance.

NoaCG rendered and interaction findings are recorded after the actual browser
journey in README.md. The post-landing checker repeats the comparable subset
independently, as required by the scoped reference rule.
