# Hardware control research - running a NoaCG production from a Stream Deck and other panels

**Status: RESEARCH, nothing built (2026-09-30 to 2026-10-01).** No product code, schema or
infrastructure changed because of this document. Prototypes ran in a session scratchpad, against a
temporary Supabase preview branch (deleted afterwards) and an isolated Bitfocus Companion. Where this
document recommends, the recommendation is labelled a suggestion; §11 lists what is the owner's to
decide.

**The question.** How should an operator run a live NoaCG show from hardware buttons, with feedback on
the keys (on air, the selected cue, clip time left with the 10 s and 5 s warnings, which verbs are
allowed now), with minimal friction for a non-technical user, with the page's reliability guarantees
(Phase 6 Step 2: a stale or duplicate press is refused, never aired twice), and working the same way
with CasparCG, OBS and vMix?

**How to read the evidence tags.** **[code]** checked in source on `main` (05ddeacb5 to 1973c90c2).
**[measured]** run for this document, method in §6. **[doc]** a repo document, not re-checked.
**[web]** an external primary source, listed in §12. **[inferred]** reasoning, not observed.
**UNCONFIRMED** marks a claim no source settled.

---

## 1. Answers first

- **Suggested route: a NoaCG Companion module that talks to the NoaCG cloud and relays each press to
  the operator page that is already open, which runs it through its own verb dispatcher** (§10). A
  hardware Take is then the page's Take: the same refusals, the same log, the same Step 2 sender
  protocol, and every player that follows the production's output URL airs it with nothing
  player-specific. CasparCG server clips work too, because the page already drives them through
  NoaCG Bridge. Player actions (an OBS scene, a vMix input) stay with those players' own Companion
  modules on the same panel.
- **It works on all three installed players** [measured, §4]: a Companion press airs and takes off the
  scorebug in CasparCG 2.5.0, OBS 32.2.1 and vMix 29.0.0.49, each seen in the player's own captured
  frame.
- **Press to first frame on the output** [measured, §6.4; 10 presses each, p50 and worst]:

  | Route | p50 | worst |
  |---|---|---|
  | Keyboard, today | 133 ms | 180 ms |
  | Companion, through the cloud relay, to the open page | 192 ms | 230 ms |
  | The same relay pressed from a script | 189 ms | 391 ms |
  | A Bridge-shaped local relay to the page | 119 ms | 138 ms |
  | A second writer of the log, no page | 82 ms | 87 ms |

  The cloud relay's own hop is p50 68 ms (62 to 265); Companion's own dispatch is p50 15 ms.
- **Keep the keyboard route** as the zero-setup fallback it is today. It needs the page focused and
  the playout column on screen, and gives the keys no feedback.
- **Suggested not to build** the Bridge relay (it would make OBS and vMix users install Bridge for a
  panel, works only with Companion on the operator's own machine, and adds a panel credential to the
  process that holds AMCP), WebHID in the page (it takes the whole deck from Companion and Elgato's
  app, so player actions cannot share it; Chromium only), or a module that writes the log itself (the
  dispatcher written twice, and no server clips). An Elgato Stream Deck plugin speaking the same
  cloud protocol is a reasonable second host later.
- **The owner's decisions are in §11; two matter most:** whether this is the route (the 2026-09-28
  backlog note assumed the Bridge relay), and how a panel is authorised. The suggestion for the second
  is a per-production **panel key made by pairing**: the production page shows a short one-time code,
  the operator types it into the module, and the key can only ask an open page to run named verbs. It
  never writes the log, never reaches Bridge or AMCP, and can be revoked from the page.
- **Build estimate (§10.4): about 4 weeks** of focused work, plus Bitfocus's volunteer review before
  the module appears in Companion's store, whose length is not published.

## 2. What NoaCG has today

**Named verbs, one dispatcher, one keymap [code].** Every operator action a panel needs is already a
named verb in `src/components/playoutKeys.ts` (`take`, `retake`, `update`, `next`, `out`,
`select-prev`, `select-next`, `pause`, `resume`, `pause-toggle`, `all-out`, and the rundown editing
verbs), dispatched by the production page's `onVerb`. The hosted control page shares the keymap and
ignores the verbs it has no use for. `usePlayoutVerbKeys` listens on `window`, and only while the
playout surface is the one on screen: a verb acts on what the operator can see.

**The command log and its sender protocol [code, doc].** A Take is one `control_send_seq` call
(migration 0071): the items (update, stop previous, play, cue) plus `p_sender = {id, press, epoch,
base}`. The server answers a repeated `id:press` as a duplicate and inserts nothing, and refuses a
press whose `base` revision of a graphic no longer matches the head as `stale`
(`docs/work-specs/playout-runtime-reliability/step-2-design.md` §1.5). Every command also carries a
client-minted `oid`, and every consumer applies an `oid` once, whichever road brought it
(`src/control/commandRoads.ts`). The key to the RPC is the production's control slug, the capability
the hosted control page holds.

**What a panel could follow without any page [code].** Every inserting statement sends one frame on
the private topic `seq-<show id>` with a per-graphic summary (revision, on air, cue, step), and RLS
lets anyone who knows the show id read it (migration 0070). So "this graphic is on air" is available
from the server. The selected cue, which verbs are allowed, and a server clip's clock are not: they
live in the page.

**The feedback a panel needs, and where it lives [code, doc]**
(`docs/backlog/companion-and-stream-deck.md` has the full table):

| Feedback | Where it lives | Without an open page? |
|---|---|---|
| A graphic cue is on air | the log head, `seq-` frames | yes |
| The selected cue (what PREVIEW shows) | the page's `selectedCueId` | no |
| Which verbs are allowed now | the page's enabled states (`canTake` and the rest) | no |
| Clip time left, HOLDING, PAUSED, the 10 s and 5 s warnings | `clipClock()` over the page's store of Bridge readings | no |
| NEXT ON SERVER, replaced, unidentified | the page's server store | no |
| Bridge and server connection | the page's `bridgeStatus` | no |

**NoaCG Bridge [doc].** It binds `127.0.0.1:8899`, requires a per-machine token and an allowed page
origin, and exists so the page can reach CasparCG (`docs/BRIDGE.md` §3). Its token also opens
`/amcp`, the raw one-line route the terminal uses, which is why the standing rule is that a panel
never holds the credential that sends raw AMCP.

## 3. The routes

Each route: how a press travels, what was checked, and a verdict. §5 compares them on the brief's
criteria.

### 3a. Stream Deck as a keyboard (today)

A key sends SPACE, `0`, `R`, `U`, `N` or an arrow to the focused window. It works with every player
because the page does the rest. It needs the browser window focused and the playout column on screen,
gives the deck no feedback, and cannot be used from a second machine. With two production tabs open,
the focused one acts; a phone control page is out of reach. **Verdict: keep as the fallback; it needs
nothing built.**

### 3b. WebHID: the page drives the Stream Deck directly

`@elgato-stream-deck/webhid` 7.7.1 (MIT, 2026-09-29) drives every current Stream Deck model from a
page in Chromium [web].

- **Browsers.** Chrome and Edge 89 and later, and Opera. Firefox's standards position is negative and
  WebKit's is "oppose" [web]. IT can block it by policy (`DefaultWebHidGuardSetting`).
- **Permission.** The first pairing needs a click (`requestDevice` requires user activation); after
  that `getDevices()` reopens the deck with no gesture, and Chrome keeps the grant per USB serial
  number [web: the spec and Chromium's `hid_chooser_context.cc`]. Persistence per model is
  UNCONFIRMED.
- **Background tabs.** Input reports keep arriving in a hidden tab: Blink disables aggressive
  throttling for a frame with an open HID device, and HID messages run on a queue timers cannot
  throttle [web: Chromium source]. Timers in a hidden page still run at most once a second, and the
  library's README warns that background throttling "affects the draw rate". Whether an open HID
  device also exempts the page from Chrome's once-a-minute throttling after 5 minutes hidden is
  UNCONFIRMED; if not, a countdown key drawn by a hidden tab would update once a minute.
- **Coexistence.** Chrome opens the device shared on Windows and macOS, so nothing stops two programs
  driving one deck, and when that happens both act on every press and overwrite each other's key
  images (Companion issue 669) [web]. Elgato's app 7.1 can disable a deck so third-party software
  owns it [web]. Companion's own documentation says to close Elgato's software. On macOS a Node app
  holding the deck through hidapi seizes it by default, so Chrome would likely fail to open it
  [inferred from hidapi's source].
- **Two tabs of one production** would each open the deck and both act on a press [inferred]; the page
  would need cross-tab election (Web Locks) first.
- **In the wild.** Timers Studio ships it (MK.2 only, "no Elgato software, no background service", the
  deck reverts within a second of the tab closing) and sends every other device to its Companion
  module [web].
- **Not checked here:** nothing ran against a real deck (the owner's device was in use and not to be
  touched), so every WebHID statement above comes from documentation and source.

**Verdict: not now.** It is the lowest-friction route for one operator with one deck and no other
software, but it owns the whole deck, so the OBS or vMix buttons an operator wants beside NoaCG's
cannot live on it, and it is Chromium only.

### 3c. Companion to the NoaCG cloud

A Companion module keeps a persistent connection to the NoaCG cloud (Supabase Realtime plus RPC) with
a panel credential. Two variants:

- **3c-direct: the module writes the log itself.** It calls `control_send_seq` with its own sender id,
  press numbers and base revisions, so the server's refusals apply to it exactly as to a page: §6.4
  shows a repeated press answered as a duplicate and aired once, and a press made before another
  screen's change refused as stale with air unchanged. It is also the fastest route measured (p50
  82 ms), probably because no page runs before the send [inferred]. But the module would have to
  compose every verb's items (a Take is update, stop previous, play, cue, with the layer and
  SPACE-mode rules) and mint fresh command ids, which is the page's dispatcher written a second
  time, outside this repository, and it cannot reach CasparCG server clips at all. **Verdict: no**, unless the owner wants a no-page
  subset later (§11 Q3).
- **3c-relay: the module asks the open page to run the verb.** The press goes to the cloud and is
  broadcast to the production's answering operator page, which runs it through `onVerb`, the path a
  key press takes; the Take the page then sends carries its own Step 2 protocol. The page also
  publishes the feedback the keys need. **Verdict: suggested (§10).** Measured cost over a key press:
  about 55 to 60 ms at p50 (§6.4).

### 3d. Companion to NoaCG Bridge's local HTTP, relayed to the open page

The shape `docs/backlog/companion-and-stream-deck.md` sketched on 2026-09-28: the page publishes
feedback to the Bridge and asks it for pressed commands; Companion posts named verbs to the Bridge.

- The local hop is short (p50 3 ms page-side, §6.4), and server clips keep working if the cloud is
  unreachable, because page, Bridge and CasparCG are all local.
- But an OBS or vMix user would install and pair Bridge only to use a panel; Bridge binds loopback, so
  Companion must run on the operator's own machine, which is not how many studios place it; and Bridge
  would need a second, verb-scoped token and a non-browser client path beside the token that opens
  `/amcp`.

**Verdict: no.** The cloud relay reaches the same page and dispatcher, works for every player without
Bridge, and from any machine, for about 70 ms more at p50.

### 3e. A native Elgato Stream Deck plugin (no Companion)

Elgato's SDK (`@elgato/streamdeck` 3.0.1; Node plugins inside the Stream Deck app; Windows and macOS
only) gives keys `onKeyDown`, `setTitle`, `setImage` (SVG recommended), two states, and dials on the
Stream Deck + [web]. A plugin can keep a WebSocket to a cloud service; Companion's own Elgato plugin
does exactly that. Pairing can use `openUrl` and a `streamdeck://plugins/message/<UUID>` deep link, or
Elgato's OAuth redirect proxy [web]. Distribution is a `.streamDeckPlugin` file or the Marketplace,
whose review takes "4-10 working days" [web].

Two catches: a key the operator customises (their own title or image) hides the plugin's live
feedback, and it serves Stream Deck hardware only, where Companion also reaches X-keys, Loupedeck,
Blackmagic panels and others [web]. OBS (Elgato's own plugin) and vMix (vMix's own) have Stream Deck
app plugins for player actions; CasparCG has none, but a NoaCG operator's CasparCG clips are NoaCG
verbs anyway. The Stream Deck app's first-party "Website" action can fire a background GET, without
feedback [web].

**Verdict: a good second host later**, on the same cloud protocol as the Companion module, for
operators who live in Elgato's app.

### 3f. What else was looked at

- **Companion's HTTP and Satellite APIs [web, measured].** Companion 5.0.6 exposes
  `POST /api/location/<page>/<row>/<col>/press`, style and custom-variable endpoints on its admin
  port, with no authentication and CORS open by design ("intentionally cross-origin accessible").
  Satellite (TCP 16622, WebSocket 16623) lets any program register as a surface and receive rendered
  key bitmaps, with no authentication, on all interfaces [web: Companion source at v5.0.6]. So NoaCG
  could push to Companion or become a Companion surface, but both lean on interfaces Bitfocus treats
  as trusted-network only. Not suggested as the product route; §7 draws the security consequence.
- **Companion's Generic HTTP connection instead of a module [measured, web].** Generic HTTP 3.1.1 can
  POST a verb with a bearer header today and store a JSON response in a variable. It has no polling
  of its own; feedback would need a one-second Trigger per value per Companion, and every button is
  built by hand, with the token in ordinary, exportable action settings. Fine as a stopgap for
  pressing, poor for feedback. It is what the measurements used (§6).
- **Comparable products [web] (§8).** Companion is the norm; cloud products hand the panel an
  object-scoped bearer token (a Singular control-app token, a Flowics package token, a Stagetimer room
  key), and none scopes a panel's token to verbs. Sofie is the one system that separates the input
  device (its own device token, sending triggers to Core) from the only gateway that talks to
  CasparCG, which is the separation NoaCG wants.

## 4. Platform check on the installed players

Run on 2026-10-01 on this laptop, with a throwaway production published on the preview branch and its
operator page open and answering relayed presses. Each player loaded the production's output URL.
Each press was Companion's own HTTP API press on a button whose action is a Generic HTTP POST, which a
local forwarder passed to the relay RPC (§6.1), and which the page ran as SPACE, the take toggle. The
pictures are the players' own captures (CasparCG's image consumer, OBS's `GetSourceScreenshot`, vMix's
`SnapshotInput`), measured for where they are opaque.

| Player | Version, and the engine its output reported | How the output was loaded | Before | After press 1 | After press 2 | Press to screen |
|---|---|---|---|---|---|---|
| CasparCG | 2.5.0 (69e8ad5 Stable), Chromium 142 | `PLAY 1-20 [HTML]`, scratch config, AMCP on 5350 | scorebug up (box 465-1454 x 86-182 of 1920x1080) | nothing opaque | scorebug up, same box | 126 ms |
| OBS | 32.2.1, obs-websocket 5.7.4, Chromium 127 | browser source in a new scene collection | up (232-727 x 43-91 of 960x540) | nothing opaque | up, same box | 112 ms |
| vMix | 29.0.0.49 (trial edition), Chrome 115 | Web Browser input through the API | up (465-1454 x 86-182) | nothing opaque | up, same box | 115 ms |

- The scorebug was on air when the players loaded (the harness had left it up), so the first press
  took it off and the second put it back, in all three.
- "Press to screen" is each output's own report on the operator page's health line, measured from the
  moment the page ran the relayed verb; the relay hop is not in it.
- **vMix's engine, measured here:** vMix 29.0.0.49's Web Browser input reported Chrome 115, below the
  supported floor of 117, as `docs/PLAYOUT_TARGETS_RESEARCH.md` predicted from vMix's release notes.
  The scorebug rendered correctly. (`docs/PLAYOUT_COMPATIBILITY.md` still lists vMix as never
  measured; `docs/backlog/playout-engine-facts-and-guide-corrections.md` waits for it.) The health
  line named the CasparCG and OBS outputs by host but showed the vMix one only as "Chrome 115": the
  output does not recognise vMix as a host.
- **The owner's setups were left as found.** CasparCG ran from a scratch config written into its
  folder for the run and removed after. OBS worked in a new scene collection, was switched back to the
  owner's "Untitled" and closed normally, and the test collection's files were moved out. vMix was
  closed without saving; its `last.vmix` was not rewritten (its timestamp predates the run).

## 5. The routes compared

| | a. Keyboard (today) | b. WebHID in the page | c-relay. Companion, cloud relay to the page (suggested) | c-direct. Companion writes the log | d. Companion, Bridge relay to the page | e. Elgato plugin, cloud relay |
|---|---|---|---|---|---|---|
| CasparCG, OBS, vMix | all three | all three | all three (§4) | graphics only; no server clips | all three | all three |
| Page | open, focused, playout column on screen | open (a hidden tab takes input; key images slow) | open, any tab or machine, not focused | not needed | open on the Bridge machine | open, any machine |
| Bridge | only for server clips | only for server clips | only for server clips | cannot reach server clips | always, OBS and vMix users too | only for server clips |
| Press to first frame, p50 (§6.4) | 133 ms | not measured (the keyboard's path plus a USB report) | 192 ms with Companion | 82 ms | 119 ms | not built; about the cloud relay's |
| Key feedback | none | full, drawn by the page | full, pushed by the page; clocks counted in the module | on air only, from `seq-` frames | full, through Bridge | full, `setImage` |
| Setup | none | a Chrome permission; release the deck from Elgato's app and Companion | install a module, type a pairing code, drag presets | as c-relay | install and pair Bridge; Companion on the same machine | install a plugin (4-10 day store review, or sideload) |
| Credential on the panel | none | none (it is the page) | a verb-only panel key | one that can write the log | a new verb-scoped Bridge token beside the AMCP one | a verb-only panel key |
| Two production tabs | the focused one acts | both open the deck and act | only the answering page acts | not applicable | only the page paired to Bridge | only the answering page |
| Phone control page | unreachable | no (no HID on phones) | can be the answering page | not applicable | no | can be the answering page |
| No page open | nothing | nothing | refused, and the keys say so; on-air keys stay true | graphics work | nothing | refused, and the keys say so |
| Database outage | Takes fail (every route shares the log) | same | same; presses fail at the relay and the keys say so | same | presses reach the page; Takes still fail; server clips work | same as c-relay |
| Player actions on the same panel | other keys can be other apps' hotkeys | no: the page owns the deck | yes: the OBS, vMix and CasparCG modules beside it | yes | yes | yes: Elgato's OBS plugin, vMix's plugin |
| Other hardware | anything that types | Stream Deck family only | everything Companion supports | same | same | Stream Deck family only |
| Browsers | all | Chrome, Edge, Opera | all | all | all | all |
| Maintenance | none | a HID library and per-model quirks in our bundle | a module in Bitfocus's repo (MIT, their review) and one small cloud surface | the dispatcher twice, one copy outside the repo | a second Bridge API and token | a store plugin beside the module |

## 6. Measurements

### 6.1 Where and how

- **Machine:** the owner's Windows 10 laptop in Finland, on a busy night (other sessions were running
  browser jobs; free memory was 0.6 to 1.4 GB), so the numbers are conservative.
- **Backend:** a temporary Supabase preview branch of the production project (`qxaeqgjcnjhcvmahcjlm`,
  all 71 migrations), created for this and deleted afterwards; never production. One scratch RPC,
  `hwr_panel_press(topic, payload)`, stood in for a panel-press endpoint: a PostgREST call that
  broadcasts on a Realtime topic, the shape of the fast road inside `control_send_seq`.
- **The app:** this checkout's dev server in configured mode against the branch, Playwright's
  Chromium, the House Scorebug catalog design in a throwaway production. The relayed press was
  delivered by a subscriber added to the operator page that dispatched the key on `window`, so it
  took exactly the keyboard's path to `onVerb`; a product build would call the dispatcher directly.
- **Companion:** 5.0.6, run headless from a scratch copy of its install with the Stream Deck and
  X-keys surface modules removed and a scratch config directory, so it could not open the owner's
  deck or touch the owner's configuration; USB hot-plug and auto-enable were also off. Generic HTTP
  3.1.1. Presses came through Companion's HTTP API (`/api/location/.../press`), which runs a button's
  actions exactly as a deck or emulator key does; the emulator page itself was not used, because the
  admin UI could not be driven reliably from a hidden window. For the same reason the button's POST
  went to a local forwarder that passed it to the RPC at once, rather than being retargeted; the
  forwarder adds about a millisecond, and Companion's own dispatch was measured separately (§6.2).
- **Timing:** every interval is taken on one machine clock. "First frame" is the first animation
  frame inside the output's graphic document in which the graphic's effective opacity (the product
  of every ancestor's) rose above 0.05, stamped with `performance.timeOrigin + performance.now()`.
  The keyboard figure includes two small round trips the harness makes to clear focus before
  pressing, so it slightly overstates the keyboard.

### 6.2 Companion's own dispatch

Companion's HTTP API press on a button whose action is a Generic HTTP POST, to the moment a local
listener received the POST, 30 presses 500 ms apart: **p50 14.6 ms, p95 20.6 ms** (min 13.7, max
106.8). Companion answered the API call itself in about 3 ms.

### 6.3 The cloud hops

From this laptop to the preview branch, 30 of each:

| Hop | p50 | p95 | min | max |
|---|---|---|---|---|
| A panel press as an RPC that broadcasts, to a Realtime subscriber | 67.5 ms | 163.3 ms | 61.1 ms | 255.5 ms |
| The same RPC's round trip, as its caller sees it | 70.9 ms | 168.4 ms | 62.1 ms | 264.6 ms |
| A client broadcast (how a page would publish feedback), to a subscriber | 44.3 ms | 49.1 ms | 43.2 ms | 54.3 ms |

The broadcast reaches the subscriber slightly before the RPC answers its caller. Publishing feedback
as a client broadcast costs no database write.

### 6.4 Press to first frame, by route

10 presses each, one Take at a time, the graphic taken off and settled between presses. With ten
samples the worst is the p95.

| Route | p50 | min | worst | Hop to the page, p50 (min to worst) |
|---|---|---|---|---|
| a. Keyboard: SPACE to the focused page | 133 ms | 113 ms | 180 ms | not applicable |
| c-relay, pressed from a script: RPC, broadcast, page, Take | 189 ms | 163 ms | 391 ms | 68 ms (62 to 265) |
| c-relay with Companion: API press, Generic HTTP, RPC, page, Take | 192 ms | 168 ms | 230 ms | not separated |
| d. Local relay: a local process pushing to the page over SSE | 119 ms | 98 ms | 138 ms | 3 ms (2 to 5) |
| c-direct: a second writer calling `control_send_seq` itself | 82 ms | 76 ms | 87 ms | not applicable |

**The refusals hold for a writer that is not a page** [measured]. The second writer's repeated press
(same sender id and press number) was answered `duplicate: true` and aired once (`data-plays` rose by
one). A press it made after the page had changed the graphic, on revisions it had not seen, was
refused `stale`, and the scorebug stayed on air. One more thing a second writer must copy: its first
replays reused the page's command ids and were silently dropped by the output, correctly, because
each `oid` is applied once.

About 50 ms at p50 separate the keyboard (133 ms) from the second writer (82 ms). That is time spent
in the page, and in the harness's own focus check, before the send leaves; it was not investigated
further here.

For comparison, the Phase 6 evidence measured the page's own press to air at 113 to 194 ms on another
preview branch from this laptop (`evidence/publish-held.md`), and staging's health line read "press to
screen about 261 ms" from a GitHub runner on 2026-09-30.

### 6.5 What was not measured

- A real Stream Deck: the owner's deck was never touched. Companion's HTTP API stood in for its keys.
- WebHID and the Elgato plugin: documentation and source only.
- Hosted production: the branch is the same kind of project, but production was not used.
- A player's own delay after the output page paints (§4 has pictures and the outputs' own reports,
  not frame-exact player timings).

## 7. Security: the panel credential

**What must hold [doc]:** a panel never holds a credential that sends raw AMCP.

**What Companion is [web, measured].** Companion's HTTP API has no authentication and open CORS;
Satellite listens on all interfaces without authentication (running it made Windows raise a firewall
prompt, which was dismissed without allowing anything); Bitfocus's own security guide says none of its
features "makes an installation secure" and that it belongs on a trusted network. Anything that can
reach a Companion can press its buttons. NoaCG cannot change that; it can decide what a pressed NoaCG
button is able to do.

**The suggestion: a panel key that is its own capability**, not the control slug:

- scoped to one production;
- able only to ask an open operator page to run a named verb on that production, and to read the
  panel feedback that page publishes. It cannot write the command log, publish, edit cues or data, or
  reach Bridge, so it can never send AMCP of any shape;
- made by pairing: the production page shows a short code that lives a few minutes and works once
  (the pattern of Bridge's `/pair`), the operator types it into the module's connection settings, and
  the module exchanges it for a long secret kept in Companion's `secret-text` config field [web];
- listed on the production page with its last use, and revocable there;
- every relayed press recorded in the page's activity feed as coming from that panel.

A leaked key lets someone press Take, Out or Next on one production while its page is open, which the
page shows and the owner can revoke. The control slug, by contrast, writes any allowed item straight
into the log with no page open, and is shared with human operators, so revoking it also breaks their
pages.

## 8. What comparable products do

| Product | Route | What the panel holds | Key feedback | Needs its app open |
|---|---|---|---|---|
| SPX Graphics | Companion module | host and port; SPX's optional API key, which also guards `executeScript` | none in the module | yes (controller page) |
| H2R Graphics | Companion module (socket.io) | IP, port, project id; no authentication | rich: on-air states, countdowns computed locally from start and end times | yes |
| Singular.live | Companion module | control-app token in the URL, reaching the whole control-app API | none in the module; REST "about a second", data streams "below 300 ms" | no (cloud) |
| Flowics | Elgato plugin v0.1, and Generic HTTP | graphics-package token, reaching the whole API | none documented | no (cloud) |
| Stagetimer | Companion module | room or team key, reaching the whole API | live countdown colours, grouped presets | no (cloud) |
| CasparCG | Companion module | host and AMCP port; AMCP has no authentication, KILL is an ordinary command | none | server |
| vMix | its own Elgato plugin; Companion module | TCP API on 8099, no authentication | tally, time left (the module polls every 250 ms) | yes |
| OBS | Elgato's plugin; Companion module | obs-websocket password, no permission levels | media remaining-time threshold | yes |
| Sofie | Input Gateway (Stream Deck, X-keys, Skaarhoj, MIDI) | its own device id and token to Core; only the Playout Gateway talks to CasparCG | AdLib tally (active, next) | server |

Two observations carry weight. Good key feedback in these products comes from state pushed over a
persistent connection, and H2R's way of sending a clip's start and end and letting the panel count
down is the right one for the 10 s and 5 s warnings. And no product gives a panel a verb-scoped
credential; NoaCG would be the first to, which is cheap here because every press already goes through
one dispatcher on the page.

## 9. The brief's requirements, against the suggested route

| Requirement | How the suggested route meets it | Evidence |
|---|---|---|
| Run a live show from hardware buttons | every named verb, plus select and take cue N, as module actions | [code] `playoutKeys.ts` |
| Feedback: on air, selected cue, clip time left with the 10 s and 5 s warnings, allowed verbs | published by the answering page; clip clocks sent as start and end and counted in the module; on air also from `seq-` frames | [code], [measured] §6.3 |
| Minimal friction | one module install, one pairing code, presets built from the production's own cues | [web] Companion presets; §8 |
| A stale or duplicate press refused, never aired twice | the page's press-id memory and target check (design, §10.1), then the page's own Step 2 send | the server half [measured] §6.4 |
| CasparCG, OBS and vMix | the relayed press is the page's Take, which reaches every output URL | [measured] §4 |
| A panel never holds a credential that sends raw AMCP | the panel key can only ask an open page to run a named verb | §7 |
| Player actions stay with the players' own modules | Companion hosts the OBS, vMix and CasparCG modules beside NoaCG's | [web] §3f, §8 |

## 10. Suggestion and design sketch

### 10.1 The shape

```
Stream Deck, X-keys, Loupedeck ...
          |
      Companion --- OBS module ----> OBS
          |      --- vMix module ---> vMix
          |
    NoaCG module --(panel key)--> NoaCG cloud --(press relay)--> the answering operator page
          ^                                                         |  onVerb, the key's path
          |                                                         |--> control_send_seq (Step 2)
          +------------------(feedback state)-----------------------+--> Bridge --> CasparCG clips
                                                                       (the page's own token)
   outputs in CasparCG, OBS and vMix follow the production's log as they do today
```

Everything below is a suggestion for the build, not a decision.

- **Who runs a press: the open operator page.** The module sends `{verb, target, seen, id}`: the named
  verb, what the key showed it acting on (the cue or layer), the feedback version the key was drawn
  from, and a press id (panel instance plus a counter, reused on the module's own retries). The page
  runs it through `onVerb`; everything that greys a button on the page refuses the hardware press too.
- **Duplicate refusal, in two layers.** The page drops a press id it has already run (a short memory,
  like the head's `recent` list). The Take the page then sends carries the page's own sender id and
  press number, so the server's `id:press` rule covers the rest.
- **Stale refusal, in two layers.** The page refuses a press whose `target` no longer matches what the
  verb would act on now (the key said "Take Anna" and the selection has moved to Ben; the key said
  "Out: lower third" and it is already off), flashes the key and writes the refusal to the activity
  feed. What gets through is sent with the page's `base` revisions, so a change another screen made
  in between is refused by the server as today.
- **Which page answers: exactly one.** An explicit "Answer the panel on this page" switch on the
  production page and the hosted control page; the last one switched on wins and the others hear it
  and switch off; both pages and a panel key show which page answers. With no answering page the keys
  show "no operator page" and presses are refused, never queued. The refusals above make an
  accidental second executor harmless: its copy of a press targets a state that has already changed.
- **Feedback.** The answering page publishes one compact state object on each change: the selected
  cue, the per-layer on-air cue, the enabled state of each verb, Bridge and server status, and a
  server clip's clock as start, end, paused and looping, so the module counts down itself and the
  10 s and 5 s warnings need no per-second messages. Published as a client broadcast (p50 44 ms, no
  database write), with the last state kept for a module that connects later. Graphics' on-air state
  is also readable from `seq-` frames, so on-air keys stay true when no page answers.
- **The module.** TypeScript, companion-module-base API 2.x (Companion 4.3 and later): actions for
  every named verb plus "select cue N" and "take cue N" (added to the dispatcher, not the relay, as
  the backlog note already says), boolean feedbacks (on air, selected, verb allowed, warning, final,
  no page), variables (cue names, time left), and presets built from the production's own cues so a
  non-technical operator drags ready buttons onto the grid. Pairing in the connection settings. MIT,
  as Bitfocus requires.

### 10.2 What it deliberately does not do

- Run any verb with no page open (§3c-direct is the alternative, and its cost).
- Talk to Bridge, CasparCG, OBS or vMix. Player actions are the players' own modules' job.
- Edit cue values or data from hardware (the backlog note's first slice excludes it too).

### 10.3 The cases the brief names

| Case | Keyboard today | Suggested route |
|---|---|---|
| Two production tabs open | the focused one acts | only the answering page acts; the other shows who answers |
| A phone control page open | not reachable | can be the answering page (same dispatcher, without server clips) |
| No page open | nothing happens | keys show "no operator page"; presses refused; graphics' on-air keys still true |
| Database outage | the page's Take fails (every route writes the same log) | presses fail at the relay and the keys say so; server clips still work from the page's own keys |
| Realtime outage | unaffected until the page sends | presses and feedback stop; the keys show the connection is down |
| Bridge not installed | graphics work | graphics work; server-clip verbs are greyed as on the page |

### 10.4 Build estimate

About four weeks of focused work for one person, before Bitfocus's review:

| Part | What | Days |
|---|---|---|
| Server | panel keys and pairing codes (table, RPCs, revocation), the press relay RPC and topic policy, as a live-path migration with self-checks | 3-4 |
| Page | the answering-page switch and its announcement; the relay listener into `onVerb` with the press-id memory and target check; the feedback publisher with clip clocks as start and end; pairing and the panel list on the production page; the same on the hosted control page; "select cue N" and "take cue N" in the dispatcher | 5-7 |
| Companion module | connection with reconnect, pairing, actions, boolean feedbacks, variables, presets from the production's cues, HELP.md, tests; submission to Bitfocus | 6-8 |
| Verification | configured specs for the relay, the refusals and pairing; Companion's emulator; the three players; a practice run with a real deck | 2-3 |
| Documents | an operator guide page and `docs/` updates | 1 |

Bitfocus reviews modules with volunteers and publishes no turnaround; a private `.tgz` import works in
the meantime (Companion 5.0 allows it from the same machine). An Elgato plugin on the same protocol
would add about 5-8 days and Elgato's 4-10 working-day review.

## 11. The owner's questions

1. **Route.** Build the Companion module on a cloud relay to the open page as the one supported panel
   route, keep the keyboard, and not build WebHID or the Bridge relay? This changes the 2026-09-28
   note, which assumed the Bridge relay. *Suggestion: yes*, for the reasons in §3d. An Elgato plugin
   on the same protocol can follow if operators ask.
2. **How a panel is authorised.** *Suggestion:* a per-production panel key made by pairing (a one-time
   code shown on the production page, typed into the module), listed and revocable on the page, able
   only to ask an open page to run named verbs. Alternatives: reuse the control link (no new server
   work, but it writes the log with no page open and is shared with people), or sign in with the NoaCG
   account from the module (broad, and heavy for a school). Also yours: who may pair a panel (the
   owner only, or team members too), and whether keys expire.
3. **No page open.** Refuse presses and say so on the keys (*suggestion*), or later add a server-side
   verb engine for a no-page subset of graphics verbs?
4. **Which page answers.** An explicit "Answer the panel on this page" switch, last one wins
   (*suggestion*), or the most recently focused operator page automatically?
5. **Publishing the module.** It goes into Bitfocus's repository under an MIT licence with NoaCG's name
   on it, reviewed by their volunteers. Acceptable?
6. **The practice show next week** stays on the keyboard route; nothing here changes it.

## 12. Sources

Read on 2026-09-30 and 2026-10-01.

**This repository.** `src/components/playoutKeys.ts`; `src/control/commandRoads.ts`;
`src/control/hostedControl.ts` (`sendSeqBatch`); `src/output/main.ts`;
`supabase/migrations/0070_seq_topic.sql` and `0071_command_sequence.sql`; `docs/CLOUD_PLAYOUT.md` §2;
`docs/BRIDGE.md` §1-3; `docs/CONTROL_PANEL_ROAD.md` §4; `docs/backlog/companion-and-stream-deck.md`;
`docs/RUNDOWN_AUTOMATION_PLAN.md` item 7; `docs/LANDSCAPE.md` NEXT item 10;
`docs/work-specs/playout-runtime-reliability/step-2-design.md` §1.5 and `evidence/publish-held.md`;
`docs/OBS_ON_A_REAL_HOST.md`; `docs/PLAYOUT_TARGETS_RESEARCH.md`; `docs/PLAYOUT_COMPATIBILITY.md`.

**Stream Deck and WebHID.**
- @elgato-stream-deck/webhid: https://registry.npmjs.org/@elgato-stream-deck/webhid and
  https://github.com/Julusian/node-elgato-stream-deck (webhid README and source, core `id.ts` and
  `types.ts`, node `index.ts`, issue 129)
- WebHID: https://hid.spec.whatwg.org/ , https://chromestatus.com/api/v0/features/5172464636133376 ,
  MDN compatibility data (`api/HID.json`), https://github.com/mozilla/standards-positions/issues/459 ,
  https://github.com/WebKit/standards-positions/issues/510 ,
  https://raw.githubusercontent.com/WICG/webhid/main/blocklist.txt
- Chromium source: `chrome/browser/hid/hid_chooser_context.cc`,
  `third_party/blink/renderer/modules/hid/hid_device.cc`,
  `third_party/blink/renderer/platform/scheduler/main_thread/frame_scheduler_impl.cc`,
  `services/device/hid/hid_service_win.cc`, `services/device/hid/hid_service_mac.cc`,
  `chrome/browser/performance_manager/policies/discard_eligibility_policy.cc`, the
  `DefaultWebHidGuardSetting` policy definition
- Chrome: https://developer.chrome.com/blog/timer-throttling-in-chrome-88 ,
  https://developer.chrome.com/blog/freezing-on-energy-saver ,
  https://blog.chromium.org/2021/12/chrome-windows-performance-improvements-native-window-occlusion.html
- hidapi on macOS: https://github.com/libusb/hidapi (`mac/hid.c`)
- Elgato: Stream Deck 7.1 release notes
  https://help.elgato.com/hc/en-us/articles/41533810232721-Elgato-Stream-Deck-7-1-Release-Notes ,
  the HID protocol https://docs.elgato.com/streamdeck/hid/ , the SDK https://docs.elgato.com/streamdeck/sdk/
  (plugin environment, keys, dials, settings, UI, system, deep linking, manifest, distribution,
  changelog), https://registry.npmjs.org/@elgato/streamdeck , Maker Console review
  https://docs.elgato.com/maker-console/review-process , the Website action
  https://help.elgato.com/hc/en-us/articles/360028234471 , Companion's Elgato plugin
  https://github.com/bitfocus/io.bitfocus.companion-plugin
- Timers Studio: https://docs.timers.studio/stream-deck/

**Bitfocus Companion** (source at the v5.0.6 tag, https://github.com/bitfocus/companion/tree/v5.0.6):
`SECURITY.md`, `docs/user-guide/security.md`, `docs/user-guide/5_remote-control/`,
`companion/lib/UI/Express.ts`, `companion/lib/Service/HttpApi.ts`, `SatelliteTcp.ts`,
`SatelliteWebsocket.ts`, `companion/lib/Data/UserConfig.ts`; the Satellite API
https://companion.free/for-developers/Satellite-API ; module development
https://companion.free/for-developers/module-development/ ; https://github.com/bitfocus/companion-module-base ;
https://github.com/bitfocus/companion-module-generic-http ;
https://github.com/bitfocus/companion-module-generic-websocket ;
https://github.com/bitfocus/companion-module-casparcg-server ;
https://github.com/bitfocus/companion-module-obs-studio ;
https://github.com/bitfocus/companion-module-studiocoast-vmix ;
https://github.com/bitfocus/companion-surface-elgato-stream-deck ;
https://github.com/bitfocus/companion/issues/669 . The installed Companion 5.0.6 itself (its first-run
settings and module list) [measured].

**Comparable products.** SPX: https://spxgraphics.com/software/integrations/ ,
https://spxgc.tawk.help/article/help-api , https://github.com/bitfocus/companion-module-spx-graphics-controller ,
https://github.com/TuomoKu/SPX-GC . H2R: https://h2r.graphics/docs/api/companion/ ,
https://github.com/bitfocus/companion-module-h2r-graphics . Singular:
https://developer.singular.live/rest-api/authorization.md , https://developer.singular.live/rest-api/rate-limits ,
https://developer.singular.live/data-stream-api/introduction.md ,
https://support.singular.live/hc/en-us/articles/360043456932 ,
https://github.com/bitfocus/companion-module-singularlive-studio . Flowics:
https://support.flowics.com/en/articles/8872359 , https://support.flowics.com/en/articles/8872364 .
UNO: https://resources.overlays.uno/post/uno-app-api-companion-stream-deck . Stagetimer:
https://stagetimer.io/docs/integration-with-streamdeck-companion/ . AMCP:
https://github.com/CasparCG/help/wiki/AMCP-Protocol . Sofie: https://github.com/Sofie-Automation/sofie-core
(user guide, installing a gateway). vMix: https://www.vmix.com/help28/TCPAPI.html ,
https://www.vmix.com/help28/ControllerOptions.html . OBS:
https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md ,
https://help.elgato.com/hc/en-us/articles/7262866127757 .
