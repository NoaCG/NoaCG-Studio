# Continue hardware panel control: the docs and Bitfocus, after the production page's first configured run

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
| 4c | branch `claude/confident-bohr-vjr8eh` | the page side on the PRODUCTION page: `ProductionPage.tsx`, `rundownPanelRows` in `panelFeedback.ts`, `e2e/panel-production-page.spec.ts` (offline), `e2e/configured/panel-production-page.spec.ts` (not yet run) |

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

1. **Done: the production page hook-up** (branch `claude/confident-bohr-vjr8eh`, evidence in
   `evidence/page-on-production-page.md`). `ProductionPage.tsx` answers a panel as the hosted page
   does, with all 13 verbs; the Panel door sits in the header's right cluster where the Playout
   settings door stood, left of Export and All out. What differs from the plan above, and why:
   - `selected` is the held folder's header, else the selected cue's own id, not `cursorRow`: the
     rows list a collapsed folder's cues, and with one of those selected `cursorRow` is the
     header while Take acts on the cue.
   - `take-cue` leaves the production page's cursor where it was; the hosted page's `take-cue`
     selects the cue first. A deck's per-cue key firing a cue mid-show should not move what SPACE
     acts on under the operator. The two pages now differ here; the owner's choice is asked in
     `docs/acceptance/owner-queue/2026-10-02-a-panel-cue-key-and-the-cursor.md` (spec D4 does not
     say), and either answer is one line in each page's `onVerb` and spec.
   - `pause-toggle` from a panel pauses the clip its key named (the clip the clock follows, its
     target per protocol §7.3), and is allowed exactly when the state carries a clip. P on the
     keyboard still goes by the selection first. `VerbPress.cue` says so now.
   - Take is not offered to a panel while the selected server cue cannot be taken because the
     Bridge is down (the button stays lit there, but `onVerb` runs nothing).
   - The clip clock moves in the server store without re-rendering the page, so while it answers
     the page subscribes the answer to the store's timing part (`panel.changed`, new on the hook),
     publishing after the whole fold so new timing is never paired with old ownership. What moves
     with time alone rides the render the header clock causes every second.
   - The `.pd-target` door styles went with the Playout settings door in #640, which left the
     hosted page's Panel door unstyled too; they now live in `control/panel.css`.
   - #640 also removed the SHOW chip `panel-page.spec.ts` waited for after publishing; it now
     waits for the status control's `data-started`. The module's side of both page specs is in
     `e2e/configured/_panel.ts`.

   **Still owed from (1):** the first run of `e2e/configured/panel-production-page.spec.ts` (and of
   the edited `panel-page.spec.ts`). The building session was a cloud session with no Supabase
   token, so it ran only the offline spec and the unit tests; CI's configured suite runs both on
   the next landing, or a local session runs them through the job queue. The production page's
   clip clock to a panel has no configured coverage: a Bridge-less clip needs the fake Bridge of
   `e2e/playout-clock.spec.ts` inside a configured spec. Until then it rests on
   `panel-feedback.test.mjs` (`panelClip`) and the module's own clock tests.
2. **The operator docs section** (`docs.html`, after `#dashboard`, nav entry under "Run the show"),
   once (1) has landed AND the module can be installed by a reader: today it cannot (not yet in
   Bitfocus's list, no published package). Everything on that page must have been run.
3. **Bitfocus submission (owner step, decided 2026-10-01: publish under MIT)**: Bitfocus creates
   `bitfocus/companion-module-noacg-studio` on request; copy `companion-module/` there. This is a
   public action under NoaCG's name, so it goes to the owner queue rather than being done by a
   session. Until then a Companion 4.3+ user can import the `.tgz` from `yarn package`.
4. **Convergence review** of the spec (`node scripts/work-spec.mjs status
   docs/work-specs/hardware-panel-control/work.json`): every AC has evidence files now; the
   production page's share of AC-3, AC-4, AC-6 and AC-7 waits on the configured run in (1), and
   AC-13 on the full configured suite.

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
