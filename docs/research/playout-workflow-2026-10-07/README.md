# Playout workflow simplification: design draft (2026-10-07)

Status: design under owner review. Not a spec yet and nothing is implemented. When the owner
approves the mockup, this becomes `docs/work-specs/playout-workflow-simplification/spec.md`.

Mockup screenshots are in `mockup/`. The same boards are interactive in the owner's private canvas.

## Why

Over the week of 2026-10-01 to 10-07 the production page's playout surface grew, one studio
problem at a time:

- a status pill, an output label, a "Publish & check readiness" button and a session timer in the
  header;
- a six-section status panel;
- an output chooser at the first publish;
- a readiness checklist that repeats the live status;
- route badges and route colours;
- a cloud chip that turns amber on every edit;
- shortcut and Stream Deck activation steps that do nothing useful.

Each addition answered something real (specs `studio-day-playout`, `publish-rundown-clarity`,
`studio-feedback`, `studio-evening-reliability`). Together they made going live a procedure and
filled the UI with explanatory paragraphs.

## The owner's goal

Professional playout software that feels obvious. A non-technical operator can run a show without
reading anything, and an experienced operator is never slowed down or blocked from doing what
they want. Specifically:

- Every button does something meaningful. No ceremony, no activation steps without a strong
  reason. Genuine safety confirmations stay.
- Normal UI is short labels, states and actions. No paragraphs explaining controls; clarification
  goes in a tooltip or an info button, and real errors may explain.
- Alarms only when something actually needs attention. Normal editing and normal pre-show states
  never look like something is wrong.
- Choosing CasparCG unlocks CasparCG features; it never creates a separate workflow, and the
  browser source always stays available.
- Do not make the cue rundown worse. Today's rows (34 px, one line) stay as they are.

## The model

**Four plain facts, and no online/offline session.**

| State | Meaning |
|---|---|
| Published | Persistent output, control, audience and presenter URLs. Done once. Costs one database row while unused (`docs/CLOUD_PLAYOUT.md`, "Publication lifecycle"), so there is no expiry. |
| Connected | A NoaCG renderer page (OBS, vMix or CasparCG all load the same `/output` page) or the Bridge is reporting over Realtime Presence right now. |
| On air | Something is visible. Shown by the rundown tally and the program monitor, not the header. |
| All out | Clears everything visible, always enabled once published, whatever the page believes. |

**Header** (`mockup/08-header-states.png`).

- One playout control and at most one action. Before the first publish it is a split "Publish ▾"
  button; after that it is a status pill.
- The action slot shows whichever is due: "Load on 1-20" (CasparCG on, slot not ours) or
  "Update outputs" (edits that change what renderers draw).
- Removed: the "Browser source" label, the separate readiness button and the timer.

**Status colours.** Grey, green and red only, always with text.

- Grey: "Not published", "Not connected", "Publishing…", "Updating outputs…".
- Green: "Connected".
- Red only when something needs attention:
  - a renderer seen in this session disappears ("OBS lost");
  - a Take is sent with no usable output ("No output");
  - "Bridge not running", "CasparCG not answering", "Another production on 1-20";
  - a graphic cannot play.

  Take is never blocked. Outputs from earlier sessions are not expected. A host is named only when
  it identifies itself (OBS and CasparCG inject markers; vMix only by user agent).

**Playout panel** (`mockup/01`, `03`, `04`, `05`, `09`).

- Contents: renderers with their state, the browser source URL with Copy and a ⋯ menu ("Download
  as template file", the SPX/CasparCG-template wrapper of the same output), a "CasparCG via
  Bridge" switch, and Playout settings…
- With the switch on: Bridge state, then the output slot with Load or Unload, then a one-line
  confirm before replacing another production.
- Removed:
  - the readiness checklist and its stamp;
  - "What is checked?";
  - the output chooser and "Change output…";
  - rundown colours;
  - the links section;
  - Unpublish.

**Setup menu** (`mockup/06`, `10`).

- Items: Share with team…, Links… (control page, presenter, audience link and its readable name),
  Stream Deck panel…, Playout settings…, Export… (standalone packages: SPX, HTML overlay, H2R,
  CasparCG, OGraf, LiveOS), and Data ↗ and Audience ↗ when used.
- Elsewhere: the Bridge download is in Playout settings with CasparCG on, and the Companion module
  is in the Stream Deck dialog.

**Edits after publishing.**

- "Update outputs" appears only when needed and runs today's publish, prepare and ping in one
  press.
- Renderers move to the new version only when nothing is on air there.
- Automatic following is a later step, once a renderer can swap one graphic without a full reload
  and only one page publishes.

**CasparCG.**

- One visible switch per production, with an account default for new productions.
- On reveals Bridge status, "CasparCG files…", Audio, channel badges and the CasparCG section of
  Playout settings. Off hides them and stops the Bridge poll.
- Server cues already in the rundown stay, marked off and not takeable.
- Publishing with the switch on also loads the renderer on the slot. After that, Load and Unload
  are the only session actions, because they claim or free a physical slot.

**Before the first publish: local rehearsal.**

- TAKE drives only the local monitor. It is not red; red is reserved for air.
- The program monitor reads OFFLINE, and no text says "on air".
- Server cues do not air.
- Publishing starts clean.

**Going offline.**

- The standalone Unpublish is removed from the UI.
- Today it deletes audience messages and votes, paired panels, history and the live data tree, and
  it is no real revocation, because re-publishing restores the same addresses.
- Deleting a production still unpublishes.

**Rundown.**

- Rows are unchanged: 34 px, one line.
- With CasparCG off there is no route badge, because it would say the same thing on every row.
- With CasparCG on, a fixed right-hand column shows "NoaCG" or the channel-layer ("2-10") in the
  channel's colour. The channel colour is set on its row in Playout settings.
- The per-cue highlight stays.

**Cloud chip.**

- "Synced" at rest, and a quiet neutral "Syncing" while a change is on its way.
- Amber "Not synced" only after a change has stayed out of the cloud for 60 s. Signed out shows
  at once.
- Never claims Synced before the cloud confirms.
- Fix the causes:
  - a sync pass on every window focus;
  - re-uploading unchanged pictures on every pass;
  - stuck amber in a second tab.

**Keyboard shortcuts** (`mockup/09`).

- Ordinary keyboard input, including a Stream Deck that sends keystrokes. They need NoaCG
  focused; there is no pairing or ownership.
- Assigning a key works immediately: "Apply cue shortcuts" and "Assign shortcut" go.
- The capture box records exactly what is pressed: Ctrl, Shift, Alt, Ctrl+Shift, Å, Ä, Ö,
  Shift+digit. It refuses only what a page cannot receive (Ctrl+N/T/W/Tab, OS keys), Ctrl+Alt
  (AltGr on Nordic Windows layouts), F5/F11/F12 and the built-in playout keys.
- A conflict offers "Move it here".

**Paired hardware panel (Companion).**

- Direct control whatever app has focus.
- A page must execute presses today, because it holds the selection, the on-air map, the
  dispatcher and the Bridge token.
- Ownership is automatic when free and never stolen. The first eligible Playout page takes it,
  and another page shows who has it and offers "Use here". A closed or crashed page releases it
  through a short server lease.
- The "Answer the panel on this page" switch goes.
- Flow: pair, assign, use.

## Facts behind it (verified by reading the code at d27c44c03)

- "Offline" is only `!hostedSlug` (`src/components/home/ProductionPage.tsx:4242`). Publishing and
  the readiness check are already one call (`src/components/control/PrepareForLive.tsx:196-247`).
- The timer is time since the page mounted (`ProductionPage.tsx:657`).
- "Waiting for output: Browser source" is a destination-tag check (`src/control/playoutStatus.ts:99-111`)
  that old links never satisfy.
- Unpublish cascades from `control_shows` to `control_events`, `control_heads`, the audience tables
  (0035), the panel tables (0073), cue arms (0075) and the data tree (0060).
- A renderer that loads while its production is unpublished stops polling for good
  (`src/output/main.ts:101-135, 196-200`).
- All out is enabled only when the page believes something is on air (`ProductionPage.tsx:3992`).
- Shortcut limits: `src/model/cueShortcuts.ts:3-8`, `src/components/home/CueShortcutDialog.tsx:31`.
  The bindings freeze at page open (`src/components/playoutKeys.ts:139-146`).
- Panel claim: forgotten on reload (`src/components/control/PanelControl.tsx:74`), never expires on
  the server (`supabase/migrations/0073_panel_relay.sql`).
- Cloud chip: immediate pending and a 2.5 s debounce (`src/backend/syncController.ts:238-249`),
  re-uploads (`src/backend/assets.ts:69-76`), focus pass (`syncController.ts:301`).

## Behaviour checks so far

Observed offline (Playwright against this branch):

- **Before the first publish**, TAKE is solid red with the tooltip "Air the previewed cue". After
  a Take, the cue editor reads "EDITING ON-AIR CUE" and "changes push live on ✎ Update".
- **A newly assigned shortcut** does nothing until "Apply cue shortcuts" is pressed.
- **The capture box** ignores Å, Ä, Ö, Shift+1, Ctrl+K, Ctrl+Shift+K, Alt+K and F2.

Not yet run, because they need a backend:

- connection and loss timing;
- what airs on the first publish;
- renderer recovery;
- All out after a desync;
- cloud chip timing;
- the panel in a hidden or covered tab.

An attempt to measure Chrome hidden-tab throttling under Playwright was inconclusive, because
automated pages never became hidden.

## Open questions

- Is "Update outputs" the right compromise, or should renderers follow edits automatically sooner?
- Should the hosted phone control page follow this model now or later?
- Does the panel need anything for a second operator (producer laptop, phone) beyond "Use here"?
