# Playout workflow simplification

Baseline: main `d27c44c03`, 2026-10-07. Design, mockups and the independent review it answers:
[`docs/research/playout-workflow-2026-10-07/`](../../research/playout-workflow-2026-10-07/README.md).
Supersedes studio-day-playout AC-7's state words and D16's offline wording for browser graphics,
publish-rundown-clarity's first-publish output chooser, and `docs/backlog/go-live-one-press.md`.

## Problem

In one week the playout surface grew:
- a status pill, an output label, a "Publish & check readiness" button and a session timer;
- a six-section panel whose readiness checklist repeats the live status;
- an output chooser at first publish;
- a destination-tag check that old links can never satisfy;
- an Unpublish button that deletes audience data and panel pairings;
- route badges that print the same output name on every row;
- a cloud chip that turns amber on every edit;
- shortcut and Stream Deck activation steps that add nothing.

Going live reads as a procedure, normal pre-show states look like faults, and paragraphs explain
controls. All out skips browser graphics whenever this page's own on-air list is empty, which is
exactly the stuck case.

## Owner decisions (2026-10-07, binding)

1. **Lifecycle.** Published, Connected, On air and All out are the only lifecycle facts. Publish
   once; URLs persist; no online/offline session, no expiry, no routine Go offline.
2. **Status.** One control, worst state wins, always words beside the colour. Healthy reads
   "Connected".
   - Never-yet-connected is quiet.
   - Red is for a renderer seen this session that disappears, a Take that reaches no usable
     output, and real Bridge/CasparCG/graphic faults.
   - Host names appear only when the host identifies itself.
3. **Edits after publishing** go out with one press that appears only when needed. Automatic
   following comes later, after per-graphic replacement.
4. **CasparCG is one visible switch per production**, with an account default. It never removes
   the browser source.
5. **Publish with the switch on also loads the renderer on the slot.** It stops at the first
   failure, naming the step, and asks before replacing another production. Load and Unload remain
   as the slot's own actions.
6. **Native CasparCG operation never depends on publication or internet** (confirmed again on
   2026-10-07). Before the first publish, only NoaCG browser graphics are local rehearsal, and that
   rehearsal is unmistakable.
7. **The standalone Unpublish leaves the UI.** Control, presenter and audience links stay usable
   while the production exists. Deleting a production still unpublishes.
8. **No explanatory text in normal operation.** Short labels, states and actions. Tooltips or an
   info button where genuinely needed; real errors may explain.
9. **The cue rundown must not get worse.** Today's 34 px rows keep their information and density.
10. **Cloud state is calm.** Synced at rest, a neutral Syncing, amber only when a change has stayed
    unconfirmed for 60 s, and real failures at once.
11. **Keyboard shortcuts work immediately** and capture any combination the browser can receive,
    Nordic letters included.
12. **The paired hardware panel is owned automatically when free and never stolen**; "Use here"
    moves it. Keyboard shortcuts stay separate from it.
13. **One persistent graphic (a corner bug, a scoreboard) must never block another graphic's
    update.**

## Derived decisions (revertible; each says how)

- **D1. The header holds one playout control and one action slot.**
  - The control is a status pill in every state, "Not published" before the first publish, with
    "Publish" in the action slot. The mockup's split "Publish ▾" became the pill (2026-10-08):
    native CasparCG cues air before any publish, so "Bridge not running" and "CasparCG ready"
    need the same place before the first publish as after it, and the pill never changes shape.
    Revert: a split button before the first publish.
  - The action slot shows the most important due action: "Load on 1-20", then "Publish changes".
  - The slot has a reserved width, so Setup and All out never move.
  - The panel lists every due action.
  - Revert: put the actions back in the panel only.
- **D2. "Publish changes", not "Update outputs".** The cue editor's ✎ Update already means "send
  these values live", and one word must not mean two things. Revert: rename the label.
- **D3. Connected needs a graphics renderer.** That means a browser renderer reporting, or a
  CasparCG renderer on its slot that reports. The Bridge answering alone is not Connected.
  Revert: count Bridge ok.
- **D4. Expectation without ceremony.** The CasparCG switch is the expectation for CasparCG: its
  slot shows Load until loaded. Browser outputs carry no expectation until one has reported in this
  page's session. "Remembered outputs" become session-scoped (`readiness.ts`, `readyMemory.ts`).
  Revert: restore the per-browser memory.
- **D5. Readiness lives in the renderer rows.** Each renderer row carries its state:
  - Ready;
  - Preparing n of m;
  - Waiting for clear (vN);
  - Change failed: <graphic>;
  - Commands slow;
  - Lost (with Dismiss).

  In the pill, a failed graphic reads red, and waiting or slow reads amber. "Check now" re-runs
  prepare and ping without publishing. The readiness checklist, its stamp and "What is checked?"
  go. Revert: re-mount `PrepareForLive`'s section.
- **D6. The template file stays visible.** A quiet "Template file" button sits beside the browser
  source's Copy. It is the live output in file form (SPX, a CasparCG template folder); Export
  remains the standalone package. Revert: move it back to Links.
- **D7. Setup › Links… holds the control page, presenter and audience links.** Each is marked
  Private or Public, and the audience link keeps its readable-name field. The panel stays about
  output. Revert: re-mount `ProductionLinkRows` in the panel.
- **D8. Bridge discovery.** With the switch on and no Bridge answering, the panel's Bridge row
  shows "Download Bridge" and "Pair". Revert: leave it to Playout settings.
- **D9. Rundown colours move into Playout settings** (the NoaCG output row, then each channel
  row). Revert: re-mount `RundownColors` in the panel.
- **D10. The route badge text shortens; layers stay.**
  - With one output the badge reads "G20".
  - With CasparCG on it reads "G20" beside the carrier slot, and native cues keep "2-10".
  - Clash repair, the type line, tags, summary, hotkey and highlight are unchanged.
  - Revert: `graphicBadge` in `CueRundown.tsx`.
- **D11. All out clears what the server says is on.**
  - The page keeps the head frames' per-graphic `on` flag, which it currently discards. All out
    stops every graphic that is on there or in this page's own list, as the existing `all_out`
    stop, with no migration.
  - The button is enabled whenever the production is published or anything local is up.
  - It reads "Clearing…" until the heads report clear, and names a failure if they do not.
  - Revert: the `liveLayers.length === 0` return.
- **D12. Before the first publish, browser-graphic Takes are rehearsal.**
  - TAKE is neutral, not red, for a browser-graphic cue.
  - The program monitor reads "NOT PUBLISHED" while only rehearsal is up.
  - Tallies read UP, and editor words never say on air.
  - Native cues keep their ON AIR treatment (D16 stands).
  - Publishing clears the rehearsal layers from the local monitor.
  - Revert: `spaceMode`, `PlayoutMonitors` and the editor kicker conditions.
- **D13. Shortcuts bind by physical key plus modifiers.** The key is matched by `code` plus the
  Ctrl, Alt and Shift modifiers. Its label is the layout's own character, captured at assignment.
  Existing `v` / `shift+f` bindings keep working.
  - Refused:
    - keys a page cannot receive (Ctrl or Ctrl+Shift with N, T, W or Tab);
    - Ctrl+Alt, which is AltGr;
    - F5, F11 and F12;
    - the built-in verb keys with or without Shift;
    - the rundown's Ctrl+C, X, V, Z, Y and Ctrl+Shift+Z.
  - A conflict offers "Move it here".
  - Revert: the old regex.
- **D14. Cloud pending age counts from the oldest unconfirmed change.** Known write failures,
  expired sessions and rejected team saves show at once. Team productions use the same chip.
  Second-tab stuck amber and the focus pass are fixed only once reproduced. Revert: the 60 s
  constant.

## Behaviour

### AC-1: One control, one action slot, stable header
- The header shows a status pill with at most one action in a reserved slot: "Publish" before
  the first publish, then "Load on 1-20" or "Publish changes". Before the first publish the pill
  reads "Not published", or with CasparCG on "CasparCG ready" or the Bridge's fault.
- The "Browser source" label, the header readiness button and the timer are gone.
- Setup and All out keep their x position across every state at 1920, 1366 and 1280 px, in team,
  personal and signed-out productions.

### AC-2: Status words and colours
- **Grey:** "Not connected" (published, nothing reporting), "Publishing…", "Preparing…".
- **Green:** "Connected".
- **Amber:** "Waiting for clear", "Commands slow".
- **Red:**
  - "<host> lost" (a renderer seen this session gone for 15 s);
  - "No output" (a Take sent while nothing usable reports);
  - "Bridge not running" and "CasparCG not answering" (switch on);
  - "Another production on 1-20";
  - "Not ready: <graphic>";
  - "Cue settings unavailable".
- A page opened before the studio is up shows no red. The Bridge alone never reads Connected.
- Take is never blocked or delayed.

### AC-3: The playout panel
In order:
1. The status line.
2. Renderers, one row each with the D5 states and "Check now".
3. Browser source: the URL, Copy, Template file.
4. "CasparCG via Bridge", with the switch, then the Bridge row (or Download/Pair), the slot row
   with Load/Unload and a one-line replace confirm, then Playout settings…
5. Every due action.

No readiness checklist, no "What is checked?", no output chooser, no Links section, no rundown
colours, no Unpublish.

### AC-4: CasparCG switch
- New productions take the account default; productions with native cues or a CasparCG
  destination start on.
- On shows CasparCG files…, Audio, channel slots, Bridge status and the CasparCG section of
  Playout settings. Off hides them and stops the Bridge status poll for this production; native
  cues already in the rundown are marked "CasparCG off" and not takeable.
- The first-publish chooser dialog and "Change output…" are gone. Settings offers "Use CasparCG
  in new productions".

### AC-5: Publish and Publish changes
- **Publish:** publishes; with the switch on it loads the renderer on the slot, asking before
  replacing another production; then the renderers report.
- **A failure** names the step ("Publish failed", "Bridge not running", "CasparCG refused 1-20").
- **"Publish changes"** appears in the header only when a publish would change what renderers
  draw. The panel offers it for any unpublished change, since cue edits also reach the control and
  presenter pages. It runs publish, prepare and ping, and the rows then show each renderer's
  adoption.

### AC-6: Native CasparCG cues never need publication
- A production whose rundown holds only server cues, with the switch on and a Bridge paired,
  Takes, Updates, Nexts and All-outs them before any publish.
- The monitor and tallies call them on air.

### AC-7: Rehearsal before the first publish is unmistakable
D12, observed: a browser-graphic Take before publishing shows a neutral TAKE, a monitor reading
NOT PUBLISHED, an UP tally, and no on-air words. After the first publish nothing rehearsed
remains up locally.

### AC-8: No Unpublish; links persist
- No UI control unpublishes except deleting the production, which keeps its existing confirm.
- Setup › Links… shows control page (Private), presenter (Private) and audience (Public) links,
  each with Copy, and the readable name with "Use this name".
- Data and Audience still open in a new tab.

### AC-9: Rundown unchanged except the badge words
- Row height (34 px), the two-line label (name and type line), the summary, hotkey, tags, the
  per-cue highlight, the layer badge with clash repair, and slot badges are as at the baseline.
- Only the badge text changes (D10).
- Judged by screenshot comparison at 1366 px and in the phone layout.

### AC-10: No explanatory sentences in normal operation
The header, the status panel, Setup, Links, Playout settings, the rundown and its add menu, the
cue editors, colours, the shortcut dialog, the Stream Deck dialog and empty states carry labels,
states, actions and real errors only. The 60 REMOVE items of the audit are gone, the 82 TOOLTIP
items are tooltips or info buttons, and the stale "Start production" texts are fixed.

### AC-11: Shortcuts
- Assigning takes effect at once on this page and on the hosted page; there is no Apply.
- The capture records Å, Ä, Ö, Shift+1, Ctrl+K, Ctrl+Shift+K, Alt+K and F2, and dispatch fires
  them.
- Refused keys say why in one line (D13).
- Typing, modal, IME, menu and Data/Audience-view guards hold.

### AC-12: Cloud chip
- At rest the chip reads "Synced" in green.
- While a change is unconfirmed it reads "Syncing" in the same neutral style; after 60 s from the
  oldest unconfirmed change it reads amber "Not synced".
- A failed write, an expired session or a rejected team save shows at once.
- It never shows Synced before confirmation.
- Team productions use the same chip.

### AC-13: All out clears the stuck cases
After an unpublish and re-publish, or for a graphic whose cue marker is missing, All out clears
every graphic the server reports on. It also clears folder sends and unidentified rundown slots,
as today, and leaves other server layers alone. The button shows Clearing… until confirmed, or
names the failure.

## Preserved behaviour

- **Verbs and live operation:** Take, Out, Next, Update, Re-take, the SPACE modes, folder runs and
  the output-slot guard behave as before.
- **Recovery and history:** Snap recovery, the Activity log and the hosted page's READY line
  remain.
- **Back compatibility:** old output URLs (tagged or not), old pages and older Bridges keep
  working.
- **Live-path tooling:** the Bridge studio setup and the panel relay protocol are unchanged.
- **Shortcuts:** existing cue hotkeys keep firing.

## Non-goals (separate specs, in this order)

1. **Per-graphic replacement** (decision 13): a renderer swaps one changed, off-air graphic in
   place, leaving live layers and their state alone. The design is
   `docs/PLAYOUT_ISOLATION_RESEARCH.md` §10.2-10.5 (the step-4 manifest, a logged switch, per-graphic
   held versions).
2. **Panel ownership lease** (decision 12): an atomic server lease with stale-owner protection,
   automatic acquisition, eligibility by executable verbs, a quiet owner indicator, "Use here" on
   the phone, and a heartbeat that survives hidden tabs. Proven for simultaneous opens, reloads,
   crashes, network loss and covered windows.
3. **Publish guard:** a compare-and-set on the published version, so a stale teammate cannot
   silently overwrite newer graphics.
4. **Local and offline operation** (see the section below).
5. Automatic following of edits, independent browser outputs, a renderer clear-all command type.

## Local and offline operation (findings, 2026-10-07)

What works today without internet. This is a code audit; nothing was measured.

| Scenario | Native server cues through the Bridge | NoaCG graphics on /output |
|---|---|---|
| A. Page open, internet lost | Works: every verb is a loopback call to the Bridge. Caveats below. | Does not: commands travel only through Supabase; renderers keep their last picture; All out leaves them up. |
| B. Reload during the outage | Does not: `/app` comes from Vercel with no service worker. | Does not. |
| C. Start a prepared show offline | Does not: same reason as B. | Does not: `/output` needs the backend. |

Caveats for A:
- **Editing pauses when the session token expires**; transport stays.
- **On a team production a server verb awaits a cloud save first** (`ProductionPage.tsx:2740`,
  whose save RPC has no timeout). On a network that swallows requests, that delays a Take.
- **Companion panels go through Supabase.**

The only offline lever for graphics today is CasparCG "Take off" (`STOP 1-20`).

In this spec (it serves decision 6 directly and is contained):

### AC-14: A native cue's Take never waits on the cloud
A server verb sends to the Bridge without awaiting a team save or history flush; the save
continues behind it. On a network that never answers, a server-cue Take airs within the Bridge's
own round trip.

The offline-operation spec (non-goal 4), in order:
1. A service worker precaching `/app`, so B and C open with server cues. Team productions need a
   read-only offline copy, which is an owner decision because it reverses the lab-computer
   memory-only rule.
2. Bridge-delivered commands into an already-loaded `/output` (CasparCG AMCP `CALL`, to be measured
   on 2.3 and 2.5; OBS through the planned adapter). Commands sent offline are uploaded when the
   connection returns.
3. The research's local runtime L1 (`docs/PLAYOUT_ISOLATION_RESEARCH.md` §12): the Bridge caches
   and serves the renderer and a local log.

It stays behind the command-path foundation, as `playout-runtime-reliability` decided. The
workaround that holds today is to export graphics to CasparCG and cue them as server templates.

## Verification

- **Node tests:** the status roll-up (every state, worst wins, session-scoped loss, Take with no
  output); shortcut normalisation and dispatch (Nordic, modifiers, legacy); the cloud pending age;
  the All out target set.
- **Offline e2e:** header positions; the panel; the switch; the rehearsal look; Links; the shortcut
  capture and immediate dispatch; the rundown screenshot at baseline density; the absence of the
  removed controls.
- **Configured e2e** on a local stack or staging, where credentials allow: publish and Publish
  changes, loss detection, Take with no output, and All out after a desync.
- **Native cues before publish**, and a Take while a team save hangs, both through the fake Bridge
  (`e2e/_fakeBridge.ts`).
- **Screenshots** judged at 1366 and 390 px.
- `/check`, then `/queue-merge`.
