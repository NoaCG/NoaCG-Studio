# Continue hardware panel control: the production page, then the docs and Bitfocus

The build of `docs/work-specs/hardware-panel-control/` (spec, wire protocol in `protocol.md`,
evidence beside them), decided by the owner on 2026-10-01. Start from updated `origin/main` in a
new worktree.

## What landed (2026-10-02)

| Piece | Pull request | What |
|---|---|---|
| 1 | NoaCG/NoaCG-Studio#618 | spec and wire protocol |
| 2 | NoaCG/NoaCG-Studio#622, #634 | `companion-module/` (companion-module-base 2.0.4, MIT, own yarn project, outside the app's build); #634 shows No operator page when hello is refused for a switched-off production |
| 3 | NoaCG/NoaCG-Studio#626 | migration 0073 (panel keys, pairing codes, claim, press relay, the `pnp-`/`pfb-` topic policies), `/panel.json`, `e2e/configured/panel-relay.spec.ts`, the advisor baseline |
| 4a | NoaCG/NoaCG-Studio#627 | `select-cue` and `take-cue` in `playoutKeys.ts` |
| 4b | NoaCG/NoaCG-Studio#632 | the page side on the HOSTED control page: `src/control/panelFeedback.ts` (pure), `src/control/panelRelay.ts` (wire), `src/components/control/PanelControl.tsx` and `panel.css`, `e2e/configured/panel-page.spec.ts` |

**0073 on production was HELD** by post-land at every landing so far (productions were live at
08:11 and 10:07 UTC); staging has it. The next landing retries it by itself, and post-land goes red
if the hold passes a day. Until it applies, the hosted page's Panel dialog on noacg.studio says the
panel list did not load, and switching the answer on reports a failure; nothing else changes. Check
with `node scripts/migration-drift.mjs` or the post-land log before telling anyone panels work on
noacg.studio.

**The end-to-end and player evidence** is in `evidence/companion-end-to-end.md` (press to first
frame through Companion: p50 168 ms against the research's 192; keyboard 115) and
`evidence/players-casparcg-obs-vmix.md` (one relayed Take and Out each, owners' setups as found;
note the owner's obs-websocket is switched off, and OBS needs its start-up "Plugin Load Error" box
closed before its main window will close). The preview branch used for all of it was deleted.

## Next, in order

1. **The production page hook-up** (`src/components/home/ProductionPage.tsx`), after the playout
   session's `claude/studio-day-status` lands (it holds that file). The shape is the hosted page's
   (`HostedControlPage.tsx`, search `usePanelAnswer` and `panel.feed`):
   - `usePanelAnswer({ slug: hostedSlug, where: 'production', label: 'Production page', runs })`
     before the page's `if (!show)` early return, with all 13 panel verbs in `runs`;
   - `onVerb`: `select-cue` (a cue: `selectCue`; a folder row id: `selectFolder`) and `take-cue`
     (on air: take that cue off, `graphicsOff([cue])` or `serverVerb(cue, 'out')`; else `takeCue`
     when `takeBlockerFor(cue)` is null), reading the row from `press.cue`;
   - after `onVerb`, `panel.feed(snapshot, (verb, target) => onVerb(verb, { repeat: false, cue: target }), note)`
     where the snapshot is: `selected: cursorRow`; `space`: the folder's or the cue's; `live`: cues
     where `cueOnAirNow`; `allowed`: take `!takeButton.disabled`, retake `selectedCueIsLive`,
     update `editingIsLive`, next `selectedLayerLive && nextMoves`, out as the Out button,
     pause/resume/pause-toggle from the transport and `pauseTarget`, all-out as `allOutEnabled`;
     `blocked`: cues with a `takeBlockerFor` or a server cue while Bridge is down, plus folder
     rows; `clip: panelClip(clipClock(...), Date.now())`; `bridge` from `bridgeStatus`; `rows`
     from `rundown.rows` plus the cues of collapsed folders;
   - a `PanelButton` beside the Playout door and the `PanelDialog`;
   - the page spec for it, a copy of `panel-page.spec.ts` on the production page, plus a server
     clip's clock if a Bridge-less way to put one up exists (otherwise the clock stays covered by
     the module's unit tests and `panel-feedback.test.mjs`).
2. **The operator docs section** (`docs.html`, after `#dashboard`, nav entry under "Run the show"),
   once (1) has landed AND the module can be installed by a reader: today it cannot (not yet in
   Bitfocus's list, no published package). Everything on that page must have been run.
3. **Bitfocus submission (owner step, decided 2026-10-01: publish under MIT)**: Bitfocus creates
   `bitfocus/companion-module-noacg-studio` on request; copy `companion-module/` there. This is a
   public action under NoaCG's name, so it goes to the owner queue rather than being done by a
   session. Until then a Companion 4.3+ user can import the `.tgz` from `yarn package`.
4. **Convergence review** of the spec (`node scripts/work-spec.mjs status
   docs/work-specs/hardware-panel-control/work.json`): every AC has evidence files now except the
   production page's share of AC-3/AC-6/AC-7 and AC-13's full configured run.

## Facts worth not relearning

- Realtime puts its own `id` into every payload the database broadcasts; the relay therefore sends
  `press_id` (protocol §5).
- The hosted page renders its graphic in a sandboxed `srcdoc` frame; timing the first frame needs
  the watcher inside that frame (Playwright frame handle), as `companion-end-to-end.md` describes.
- Companion 5's admin UI cannot be driven reliably from the hidden browser pane (screenshots time
  out, layout collapses). Element references and `form_input` work; a drag worked once with a
  1400x900 emulated viewport. Its HTTP API runs a key exactly as a deck does, and
  `GET /api/variable/<label>/<name>/value` reads the module's variables.
- Production's Supabase ref is `kprolrchuldgfrzspthy`; preview branches come from
  `POST /v1/projects/<ref>/branches` with the management token. `qxaeqgjcnjhcvmahcjlm` in the
  research doc was a since-deleted branch.
