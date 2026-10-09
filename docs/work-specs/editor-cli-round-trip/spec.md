# CLI-generated source round-trip (bounded R1.3b)

Baseline: fetched origin/main 00767d2e1, branch codex/editor-cli-round-trip.
Previous phase: #835 / 9a19ac2b. Dedicated managed worktree.

## Problem and goal
An agent authors a portable HTML/CSS/JS package. Qualify the actual locally built
CLI -> normal ZIP import -> visual edit -> save/reopen -> rehearsal -> browser
exports journey before assuming a defect. Fix only concrete reproduced gaps,
retaining readable source and current editor ownership.

## Scope and decisions
- Exercise scaffold, validate and inspect against this worktree's dev server.
  Import a real ZIP through the existing product route, then editor Alpha.
- Development example: typeless community-event strap, live fields, decorative
  static text, local logo/font and unrelated source. Independent example: sports
  scoreboard scaffold with its existing operator machine.
- Reuse source adapters, fields, history, preview, persistence, cues and exports.
  Preserve unsupported source and refuse unsupported edits explicitly. No new
  document model or general conversion layer.
- Shared scheduler for builds/browser work; rescan active export/import work and
  fetch before overlapping edits and landing; reconcile with landed main.
- Execute comparable import/edit/save/reopen in a pinned working reference;
  record version, paths, interactions and rendered differences. No broadcast
  source equivalent means verify NoaCG's contract without claiming parity.
- Reversible unattended assumptions: synthetic data; local/offline persistence;
  1093x614 is the existing 125% viewport proxy, not actual browser/OS zoom.

## Observable acceptance
1. Actual visual controls edit supported imported text/artwork; saved source and
   rendering reflect the edits.
2. Field keys/defaults, excluded static text, stable source IDs, font/logo bytes,
   existing cues/machine and unrelated source survive edit/history/reopen.
3. One completed edit is one undo; redo restores it. Escape cancellation and stale
   or unsupported commands preserve source/history through existing handlers.
4. Save confirms durable persistence; reopen retains edits. Rehearsal and executed
   SPX, CasparCG and OGraf browser exports agree on data and lifecycle/machine
   actions, with no browser or network errors.
5. Inspect rendered tasks at 1920x1080, 1366x768 and 1093x614. Record captures,
   commands, results and limits; include the independent task.

## Non-goals and exit
Paired live MCP (R3.2), WebMCP, general help, funding/BYOK, broader B17/B18/E23,
physical hosts, whole-editor usability/default-switch acceptance and unrelated
transform/property/save-sync work remain separate.
Commit verified phases, /check, /queue-merge, actual merge, post-land checks and
production deployment verification. Record the next bounded step. Reproduction
determines the implementation scope before product edits.

## Reproduction and bounded implementation
- Plain locally built CLI scaffold/validate/inspect passed. Adding an inert JSON
  metadata script caused the importer to append JSON to executable JavaScript,
  producing a syntax error and disabling fields/lifecycle. Preserve data scripts
  in HTML through the existing adapter.
- The normal finished-template import reaches Finish without the existing Edit
  this graphic door. Wire that shared door through applyImportedFile and the
  existing editor navigation; retain byte-faithful import and walk-back guards.
- The real scaffold repeats its panel selector for layout and appearance. The
  existing CSS writer patched the first rule, so a visual colour edit was hidden
  by the later rule. Patch the effective declaration with the existing scanner,
  retaining important priority. New declarations stay in the first owned rule
  for anchor/group readers; preserve nested/unrelated rules.
- Custom non-field HTML spans are outside the existing target registry. Preserve
  their text/IDs and test honest command refusal; do not add general HTML editing.

- Executing the edited package found that OGraf dropped inert head JSON even after import
  preserved it. Keep inert head/body blocks in the scoped graphic DOM with the shared
  script classifier; do not inject authored data into the renderer head.
