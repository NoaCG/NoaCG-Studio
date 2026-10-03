---
v: 2
source: owner
kind: ask
raised: 2026-10-03
state: advanced
note: "2026-10-03: all seven feedback points mapped to existing wave rows; later normalization and Setup colors scoped here. Plans delivered, implementation and acceptance remain with their named rows."
asked: "normalize audio later; customize rundown colors under Setup with strong defaults; track the seven playout feedback points (paraphrase)"
---
# Playout feedback: coverage and later work

2026-10-03 owner feedback, seven numbered points. This is a coverage index and two later plans,
not seven new tasks. The night-wave rows retain ownership; planned work is not marked built.

## Why

Keep each feedback point assigned once, and preserve the explicitly later requests while the
current wave fixes readiness, rundown controls and editing. The table is a coverage index;
the two later sections are the unstarted remainder, not extra implementations of active rows.

## Coverage

| Point | Request | One existing owner / next proof |
|---|---|---|
| 1 | Relevant output health, without a manual playout mode | Row B, `codex/b-relevant-playout-health`; existing [output-health receipt](output-health-indicator.md). Prove browser-only, intended disconnected CasparCG and mixed targets. |
| 2 | Understand Publish, preparation and readiness | Row B, same health/readiness work. Establish publish guarantees and automatic output checks while preserving published/live isolation; [one-press backlog](go-live-one-press.md) remains the broader ask. |
| 3 | Graphic/audio folders, attached sounds and levels | Row D, [existing sound receipt](sound-with-graphics-and-steps.md) and [code-grounded proposal](../research/playout-audio-2026-10-03.md). Current cue levels exist; attachments remain proposed. Normalization stays later below. |
| 4 | Rundown + becomes Add graphic/video/audio/folder | Row C, `codex/c-readable-rundown-controls`, after B lands. Reuse existing add/picker paths and preserve routing. |
| 5 | Multi-step Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Row E, `codex/e-rundown-undo`, after C lands. Editing history must leave text-input undo and on-air commands alone, and avoid overwriting concurrent edits. If not safely built, E owes a precise implementation plan. |
| 6 | Clear pending-cut behavior | Row C. Say cues remain until paste moves them and Escape cancels the pending move; prove clipboard behavior and labels together. |
| 7 | Distinct item types, hierarchy and output address | Row C assesses defaults with rendered evidence. Optional Setup colors remain later below; the default must already be readable. |

Rows C/E are sequenced work, not completed work. The private wave/result ledger records launches,
checks and landing verdicts. Update this index's outcomes when those rows finish; do not mint
parallel Add, clipboard, undo, readiness or audio tasks from the same feedback.

## Later: audio normalization (point 3)

**Why:** different source levels defeat predictable audio even with a dB gain slider.
**Scope:** uploaded audio and video audio, following a separate media-processing plan.
CasparCG cues currently reference server files; NoaCG cannot normalize bytes it does not have.
First define whether analysis/derived files belong to an upload pipeline, Bridge or server workflow.

Plan a non-destructive analyzed/derived version with original preserved, clear processing/error
status, measured loudness and peak metadata, cancel/retry and ordinary cue selection. Source
gain, normalization gain and any later live fader must compose once. File identity and publication
must keep the version already on air stable; normalization never changes current playback.

Before building, choose loudness/peak targets and channel policy from the production need and
primary audio guidance. Compare quiet/loud speech, music, silence, short effects and video with
mixed channel layouts; measure output and clipping. A peak-only adjustment must not be called
loudness normalization. No automatic processing, target value or audio standard is selected here.
This section owns the later ask; a detailed spec can replace it when scheduled.

## Later: Setup colors (point 7)

**Why:** productions may emphasize cue types or output channels differently.
**Goal:** optional production-level accents under Setup with an immediate, readable default.
Use existing cue kind and channel metadata; retain icons, words, indentation and output addresses
so color never carries meaning alone. Do not recolor ON AIR/PVW, warnings or errors as type accents.

Start with named type accents and an optional channel accent, a preview and Reset to defaults.
Define type-versus-channel precedence before implementation; keep channel identity visible as
a label even when the type accent wins. Save in production settings, absent values use defaults,
and team members opening that production see the same choices. Do not invent per-row styles.

Acceptance: defaults distinguish graphic/video/audio/folder and hierarchy at desktop and phone
width; custom accents keep labels/selection/tally legible in both themes; invalid/absent colors
fall back safely; save/reopen/team sharing and reset work. Row C's rendered defaults establish
the baseline before this optional customization is built. No customization is required to operate.
