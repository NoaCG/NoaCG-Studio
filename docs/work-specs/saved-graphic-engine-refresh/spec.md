# Refreshing a saved graphic's engine

Status: draft, waiting for the owner's choice of option (issue #2182). Nothing is built.

## Why

A saved graphic carries its whole runtime in its own `template.js`. Publishing sends that copy:
`buildOutputPayload` (src/control/hostedControl.ts) takes each graphic through
`templateForSavedGraphic` (src/model/library.ts), which returns the library record's template, and
nothing rebuilds it from the catalog. So an engine fix reaches only graphics created after it lands.

Measured on a local Supabase stack on 2026-11-05 (evidence/2026-11-05-publish-probe.md):

- A Debate Floor saved by the code before #2173 (391a9e3e) holds no `debateMachinePlay`.
- The same account on main (a00505d5) pulled that record from the cloud, put it in a new
  production and published it. The `control_shows.output` payload has no `debateMachinePlay`:
  air runs the old engine.
- Control: a Debate Floor made from the catalog on main holds it.

So the fix for #2175 (keep the floor with the running speaker through a Take on air or a Snap)
looks landed while a show built before it still has the fault. Workaround today: remake the board
from the catalog, or press Reset before Switch after a Take on air with a clock running.

Any later fix to an embedded engine (match clock, scoreboards, credits, the animation
interpreter outside an edit) has the same gap.

## Goal

A saved graphic whose engine is a known older version of a catalog engine reaches air with the
current engine, without the operator remaking it and without losing anything they changed.

## Non-goals

- Changing a design's look, fields, data or animation. Only the engine text is in scope.
- Refreshing hand-edited engine code. Text that is not an exact known older version stays as it is.
- Moving engines out of the template. Exports (SPX, CasparCG, OGraf) must stay self-contained.
- Rewriting every library record in the background. That would set off a sync for each record
  (src/model/AGENTS.md: the library is not rewritten wholesale).

## What there is to build on

The animation interpreter already upgrades exact known older bodies, recognized by content hash
(src/templates/shared/animRuntimeLegacy.ts, `writeOutData` in src/templates/shared/animRuntime.ts).
It does so only when the editor rewrites the animation data, so a graphic nobody edits keeps its
old interpreter too.

An engine is not fixed text: the debate engine embeds the design's element ids
(`${idOf('clockA')}` in src/templates/scoreboards/debateFloor.ts). So "a known older version" means
the older generator's output for this design's ids. Each released engine generator has to be kept,
frozen, as the interpreter's are, so its output can be recognized. The engine's own header comment
(`// ---- The debate floor's two clocks ...`) up to the next `// ----` header marks the region.

## Options

1. **Leave it, and say so.** Release note and the workaround. No code. A show built before a fix
   keeps the fault until someone remakes the board.
2. **Refresh on read, in memory.** `templateForSavedGraphic` swaps a recognized older engine region
   for the current one each time it builds a template. Publish, the PROGRAM monitor, the panel spec
   and exports all get the current engine. The record is not written, so there is no sync storm.
   The record gets the new text the next time someone saves it. The editor shows the record as
   saved until then.
3. **Refresh at publish only.** As 2, but only in `buildOutputPayload`. Smallest change. The
   PROGRAM monitor would then run a different engine from air, which is the kind of split the
   monitor work has spent weeks removing. Not recommended.
4. **An "Update engine" action.** The production page marks a graphic whose engine is a known older
   version and offers one press that rewrites the record through the normal save. Visible and
   explicit, but the operator has to notice it before the show, and a team member's copy updates only
   through sync.
5. **Engines by reference.** The template names an engine and version, and the renderer injects
   the current one. Every renderer, export and the Bridge would need it, and exports would stop
   being self-contained. Out of proportion.

## Recommendation

Option 2, debate engine first, with the recognizer written so the next engine joins by adding its
frozen older generators. It fixes the fault where the operator meets it (a republish, a monitor) and
writes nothing. Option 4's marker can follow later if the owner wants operators to see that a
graphic was refreshed.

One effect to accept: republishing a live show swaps the engine on air at the next Take or
reload of the output, as any republish of a changed design does today. The new engine works with
the wire as it is on main (#2161, #2175).

## Acceptance criteria

### AC-1: a saved Debate Floor from before #2175 publishes with the current engine
Configured suite, added to an existing spec: a record holding the pre-#2175 engine for its ids is
published, and the payload holds `debateMachinePlay`. Red without the change.

### AC-2: the refreshed board behaves as a new one on air
Configured suite, real /output: after the publish in AC-1, Take on air with A running, then Switch:
the wire and the screen both name B (the #2175 walk, run on the refreshed board).

### AC-3: anything not exactly known is left alone
Node test: an engine region with one character changed, and a graphic with no engine region, come
back byte for byte.

### AC-4: nothing is written to the library
Node test: refreshing reads no store and writes no record. The record's `updatedAt` and its cloud
row are unchanged after a publish (configured suite, same walk as AC-1).

### AC-5: the PROGRAM monitor runs the same engine as air
Configured suite, same walk: the monitor's stage document holds the same engine as the payload.

## Open for the owner

- Which option. The recommendation is 2.
- Whether a republish may swap the engine on a show that is on air, or only at the next Take.
