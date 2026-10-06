# Studio feedback follow-up

Baseline: current main `ba8ad8738`, including PRs 711, 712 and 713. 2026-10-06.

Why: routine saving interrupts operation, output setup implies CasparCG is NoaCG, and normal
rundown editing remains incomplete. Preserve the reliability release and existing productions.

Goal: quiet, honest cloud-save state; one understandable production output setup; contextual
CasparCG UI; readable readiness; responsive colors; safe session-local rundown editing.

Non-goals: live command changes, publication rollback, editor history, persisted history,
rewriting productions, replacing installed Bridge, or speculative browser routing controls.

## Decisions and slices

1. Quiet saving and output setup. Routine pending/anonymous states use the header indicator.
   Retain persistent recovery for expired sessions and actual failed saves. Playout settings
   shows this production's output choice, browser URL and optional CasparCG configuration.
   Browser source is the common name for OBS, vMix and HTML sources. Bridge is optional and
   independently enabled. Keep existing destination identifiers and legacy productions.
   SPX remains a template export, with no new live mode. Suppress publication counters in the
   operator UI while retaining internal revisions and readiness checks.
2. Colors and conventional selection/delete. Reproduce the color write path and coalesce
   continuous picker edits without losing the final value or changing air. Verify existing
   clipboard and additive/range selection. Delete uses the existing safe removal workflow.
3. Undo prerequisites, then history. Reassess `../rundown-undo/plan.md` against the release's
   checked cue update and team flush additions. Prove operation-specific acknowledgements and
   atomic conditional restore before exposing history. Follow that spec's live, identity,
   conflict, native text, grouping and retention requirements in verified slices.

These unattended decisions are recorded here for review. This session owns the global cloud
notice; the active editor folders/bins session was notified to avoid a competing fix.

## Acceptance

- AC-1: routine pending saves and anonymous work cause no popup or layout shift. Every main
  authoring shell reports local/pending/confirmed/failed state persistently and accurately.
  Expiry, retry and pending-team export remain reachable.
- AC-2: Playout settings names and changes the current production outputs, exposes its browser
  URL even with CasparCG enabled, and reveals CasparCG configuration only when relevant.
  Existing links, source records and active playback are unchanged by a setup choice.
- AC-3: browser-only productions have no disconnected-Bridge warnings, CasparCG file-add doors
  or CasparCG instructions in generic controls. Existing native server cues still show their
  actual dependency, even after changing the output choice.
- AC-4: repeated readiness checks retain asset/command/connection safety without prominent
  publication version counters or redundant success prose. Check without drift does not publish.
- AC-5: continuous color input visibly follows the picker without a persistence write per event;
  its final value survives blur, switching cues, closing and reload. Failure remains observable.
- AC-6: additive and range selection, copy/paste and Delete operate on the intended rows only;
  inputs, IME, menus, modals and hidden workspaces retain their native key handling.
- AC-7: all persistence and history acceptance cases in the rundown-undo spec pass before Undo
  is exposed. No inverse dispatches a live command or overwrites newer/concurrent work.

## Browser outputs research

[OBS Browser Source](https://obsproject.com/kb/browser-source) accepts a URL per source and can
unload it when hidden. [vMix Web Browser](https://www.vmix.com/help29/WebBrowser.html) accepts
transparent browser inputs and independently mixes their audio. Separate overlays can therefore
help with scene-specific lower thirds versus persistent scorebugs, or separate audio mixes.
This is a use-case inference, not a measured demand count.

Current NoaCG destination IDs identify mirrors and readiness peers. `src/output/main.ts` does
not filter graphic commands by destination, and `readOutputSetup` permits one browser mirror.
True separate channels require routing in the publication, dispatcher, renderer, readiness,
local monitors and exports, plus safe removal/reassignment while sources are live. They are
useful but not an existing capability to expose with extra controls. Keep one effortless
browser source now; record a routing proposal and owner decision separately.
