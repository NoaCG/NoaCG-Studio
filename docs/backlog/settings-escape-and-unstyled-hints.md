# Settings ignores Escape, and four of its hint lines render at body size

**Filed:** 2026-09-24. **Source:** the live walk of the closed old code editor on noacg.studio
(`docs/handoffs/2026-09-24-h-old-editor-live-walk.md`), at 1366x768.

## Why

Two small defects on a dialog every student opens.

1. **Escape does nothing.** The wizard, the confirm dialogs and the team dialogs all close on
   Escape; Settings only closes on its ✕ or a backdrop click. Measured on the live site: the
   dialog was still open after Escape (`settings open after Escape=1` in the walk log).
2. **Orphan hints are 16px white text.** `.dlg-hint` is only styled as
   `.dlg-row > .dlg-hint` (`src/styles/wizard-and-dialogs.css`, line near 221). A `p.dlg-hint`
   placed straight inside a section gets no rule at all, so it renders at the body size and
   colour, beside 12px dim hints that say the same kind of thing. On the live site that is the
   analytics status line ("Not allowed. No analytics identifier..."), the connection-check line
   under Workflow defaults, and both paragraphs at the foot of the Playout panel
   (`src/components/PlayoutSettingsPanel.tsx`, "No connection?..." and "Which server versions
   work...").

## What it would take

1. `useEscapeToClose(onClose)` from `src/components/teams/useEscapeToClose.ts` in
   `SettingsDialog`, after checking that no surface that hosts it (Home, `AuthStatus` in a
   topbar, the new editor) also acts on the same Escape. A Playwright line in the Settings test
   of `e2e/no-old-editor.spec.ts`.
2. A base `.dlg-hint { font-size: 12px; color: var(--text-dim); }` rule, keeping the grid-column
   placement for the in-row case, then a look at every other dialog that uses the class
   (`AiProviderSettings.tsx`, `PlayoutSettingsPanel.tsx`) to confirm nothing relied on the
   unstyled size. The connection-check line also carries an em dash
   ("shows what is blocked — screenshot it").

## Evidence

- `C:\claude\noacg-live-walks\2026-09-24-h\05-settings.png` (the analytics line at body size)
  and `05b-settings-workflow.png` (the Playout paragraphs and the connection-check line).
- The walk log `C:\claude\noacg-live-walks\2026-09-24-h\walk.json`, clause `settings-side-checks`.
