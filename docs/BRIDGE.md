# NoaCG Bridge - the local program that lets the NoaCG page drive a playout server

Version 0.9.0 preserves significant filename spaces in playback state and supports exact-slot
Stop/Clear recovery. Native picture cues default to Fit with opaque black padding on their own
slot; choose Stretch in the selected cue editor when proportions should change. Fit requires
Bridge 0.9.0 and CasparCG 2.5 or later. An older Bridge or unsupported file/channel format gives
an explicit error before replacing foreground. Updating the Bridge does not require changing
CasparCG configuration or upgrading the server. Existing Bridge installations are not updated
automatically by a website release.

**What this is.** NoaCG runs in the cloud; CasparCG runs on a studio network that must never be
reachable from the internet. NoaCG Bridge is a small program on the operator's own machine that
holds the socket a browser cannot, so the NoaCG page can put a production on a CasparCG channel,
list the templates and clips already on the server, and cue them from the rundown - without the
CasparCG Client. It is `noacg bridge` in the CLI, and `NoaCG-Bridge-<version>.exe` on every release is that
same command with Node inside, for a playout laptop with nothing installed.

**What this is not.** It is not a new way to get on air, and nothing here is load-bearing for a
show. The shipping route already works and is unchanged: load the production's `/output` URL or an
exported file by hand (`docs/PLAYOUT_INTEGRATION.md`). If the Bridge is not available, every route
there still is. And NoaCG's own graphics never travel through the Bridge as graphics: a quiz's
reveal, a scoreboard's +1 and every future behaviour stay in NoaCG's own runtime, driven over the
command log the `/output` page follows. The Bridge transports commands; it never re-implements
graphic logic.

**Security, in one sentence.** NoaCG Bridge listens only on `127.0.0.1`; CasparCG is reachable
only on the trusted studio LAN and is never exposed to the internet.

This file was `docs/CASPARCG_CONNECT.md` until 2026-09-22, when the agent it described became
the Bridge. Section 1 is unchanged: it is the measurement the whole shape rests on.

---

## 1. The transport, measured before it was designed

The shape of this feature is decided by what a browser physically cannot do. Everything in this
section was reproduced on this machine on **2026-08-24** against a fake AMCP listener and a fake
local agent, in **real Chromium 149.0.7827.55** (Playwright's, not an app shell), not taken from
memory or from how SPX's UI looks.

### 1a. A browser cannot open a raw TCP socket. AMCP needs one.

A page has exactly one socket primitive - `WebSocket` - and it is not a socket, it is an HTTP
Upgrade handshake. Pointed at AMCP on 5250, the browser really does connect, and then it sends
this:

```
GET / HTTP/1.1
Host: 127.0.0.1:5250
Connection: Upgrade
Upgrade: websocket
Sec-WebSocket-Key: T9Jheii0GzuSQo14pwCZRg==
```

CasparCG's AMCP parser answers that the only way it can - with an AMCP status line, which is not
an HTTP response - and the browser aborts:

```
WebSocket connection to 'ws://127.0.0.1:5250/' failed:
  Error during WebSocket handshake: net::ERR_INVALID_HTTP_RESPONSE
```

This is not a CORS problem, a policy problem or a version problem, and no server setting fixes
it. **The socket has to live outside the browser.** That is why SPX itself is a local Node
process, and the owner accepted the price of a small local process on 2026-08-24.

A Vercel function cannot take the socket either: `noacg.studio` runs in a datacentre and
`192.168.x.x` is somebody's studio. There is no route from one to the other.

### 1b. Chrome's Local Network Access gates the page -> loopback hop, and it is a PROMPT

The old rule most documentation still describes - answer the CORS preflight with
`Access-Control-Allow-Private-Network: true` - **is dead**. Measured, with the agent sending
exactly that header:

| Origin the page is on | Reaching `http://127.0.0.1:7710` | Result |
|---|---|---|
| `http://127.0.0.1:7710` (agent's own) | same address space | **HTTP 200** |
| `http://192.168.0.120:7711` (a LAN self-host) | private -> loopback | **HTTP 200**, no prompt |
| `https://noacg.studio` (hosted) | public -> loopback | **blocked** |
| `https://noacg.studio` + `Access-Control-Allow-Private-Network: true` | public -> loopback | **still blocked** |
| `https://noacg.studio` + the `local-network-access` permission granted | public -> loopback | **HTTP 200** |
| control: `--disable-features=LocalNetworkAccessChecks` | public -> loopback | HTTP 200 |

The refusal, verbatim:

```
Access to fetch at 'http://127.0.0.1:7710/status' from origin 'https://noacg.studio'
has been blocked by CORS policy: Permission was denied for this request to access
the `loopback` address space.
```

The good news is that this is a **permission, not a wall**, and the page can ask what state it
is in before it tries:

```js
await navigator.permissions.query({ name: 'local-network-access' })
// hosted, untouched: { state: 'prompt' }      <- a browser prompt stands in the way
// after granting:    { state: 'granted' }
```

Two consequences the UI is built around:

- **A pending request means the prompt is up.** Measured headed: with the permission in
  `prompt` state, the `fetch` does not fail - it *hangs* while a permission bubble waits above
  the page, where a user watching the settings panel will not look. Every call therefore carries
  an `AbortController` timeout, and a timeout is reported as "your browser is asking - answer
  the prompt at the top of the window", never as "unreachable".
- **Self-hosting on the studio LAN needs no permission at all.** A NoaCG served from
  `http://192.168.x.x` reaches a loopback Bridge with nothing granted (row 2 above). Worth knowing
  before telling a school to click through a security prompt.

Since Chrome 147 the same permission also gates a WebSocket from a public page to loopback, so a
push channel later costs no second prompt. Safari blocks `https` -> `http://localhost` outright
with no permission to grant. Not measured here (no Safari on this machine) and stated as a limit,
not a claim: the Settings panel and the Downloads page name Safari as not supported for this one
feature and say so rather than looking broken.

### 1b-ff. Firefox has the same gate, and on a machine that forgets, it asks again

Added 2026-09-25, from a production test on a shared school laptop.

**Firefox 153 turned Local Network Access on for every desktop user** (Mozilla's support
article, "Control personal device and local network permissions in Firefox"). It splits the gate
in two, and the Bridge is the first half. The loopback half prompts *"<site> wants to access
other apps and services on this device"*. The other half is about devices on the local network.
The Bridge works in Firefox once that prompt is answered. The operator ran a two-channel show
through it. So Firefox is **supported**, and Chrome and Edge stay **recommended** (Downloads,
"Which browser").

**Why it asked again when clips were added.** The first prompt came in the tab the Bridge
opened to pair. The second came in the production tab when the picker made that tab's first
Bridge request. The laptop runs Firefox set to delete everything when it closes. These are the
likely causes, stated as causes and not as a measurement: nobody reproduced it at a keyboard here.

- Firefox only keeps an Allow permanently when it is allowed to remember decisions. The prompt
  in the operator's screenshot had no remember option at all.
- When Firefox cannot remember, the Allow is **temporary**. It belongs to the tab that asked,
  and it expires, by default after an hour (`privacy.temporary_permission_expire_time_ms`).
  So every new tab asks again, and a long show can be asked again in the middle.
- A profile that clears site settings on close also loses a permanent Allow every night. The
  Bridge token in localStorage goes with it, so the operator pairs again every day.

The Bridge cannot make any of this go away. A page cannot grant itself a permission, and
the fetch is already one address (`127.0.0.1:<port>`) from one tab. What the code does:

- It asks `navigator.permissions` for **`loopback-network`** first, the name Firefox and current
  Chrome use, and falls back to `local-network-access`. Before this it asked only for the old
  name. Firefox threw on that name, so a Firefox operator facing a waiting prompt was told
  "this browser cannot do it (Safari)". Now the diagnosis quotes the words Firefox's own prompt
  uses.
- Safari is now named by its user agent. A browser that simply has no such permission (Firefox
  before 153) is told the true hop: the Bridge is not running.
- The pairing page and Playout settings link the Downloads page's browser notes when the prompt
  repeats.

**The durable fix is a browser policy, on the machine.** Policy survives "delete everything on
close" because it is not site data:

| Browser | Policy | Value |
|---|---|---|
| Firefox | `LocalNetworkAccess` -> `SkipDomains` (`policies.json` or GPO `Software\Policies\Mozilla\Firefox\LocalNetworkAccess\SkipDomains`) | `noacg.studio` |
| Chrome / Edge | `LoopbackNetworkAccessAllowedForUrls` (older: `LocalNetworkAccessAllowedForUrls`) | `https://noacg.studio` |

A self-hosted NoaCG on the studio LAN needs neither (§1b row 2).

### 1c. So: whose machine, and which hop

```
 operator's browser  --HTTP/loopback-->  NoaCG Bridge          --TCP/AMCP-->  CasparCG :5250
 (any origin)            token +           (127.0.0.1 only,       (same box or anywhere
                       origin check         operator's box)         on the studio LAN)
```

**The Bridge runs on the operator's machine, not on the playout box.** That is what keeps the
bind on `127.0.0.1` while still letting CasparCG be a different machine: only AMCP crosses the
LAN, which is exactly what the CasparCG Client does today. Putting the Bridge on the playout box
and reaching it over the LAN would mean binding `0.0.0.0`, and a `0.0.0.0` bind turns any web
page the operator visits into a remote control for the playout server. The Bridge refuses to do
it (§3).

### 1d. Verdict

**Not ugly. Build it.** The constraint is one local process (already the price of every
comparable product) plus one browser permission the user grants once, whose state the app can
read and explain. There is no behaviour here that will not sit still. The one honest limit -
Safari, and any embedded browser with no way to show a prompt - has a terminal route around it
that needs no browser at all (`noacg caspar play`, §4).

---

## 2. What it does, from the operator's side

1. Once, ever, on the machine you operate from: download **NoaCG Bridge** (the studio's
   Settings -> Playout links the Downloads page, which offers the newest GitHub Release) and double-click it. It opens a
   page in your browser; one click pairs the browser with the Bridge. The link carries a one-time
   code that lives two minutes; the token never travels in a URL. On the hosted studio that click
   is also where Chrome asks whether the site may reach your local network, and the page says so
   first.
   **The same page then connects to CasparCG** (0.7.0, owner decisions of 2026-09-30,
   docs/work-specs/bridge-casparcg-connect/spec.md). The Bridge remembers the servers the page
   CONNECTED to (`caspar-servers.json` beside its token, host and port, most recent first, at most
   eight), so the page asks it for them, tries the last one at once and, when it answers, just says
   "Connected to CasparCG <version> at <address>". Otherwise the address is filled in and every
   server used before is one click. Connecting is a `VERSION` and nothing else, so it may happen by
   itself; putting the output on air never does. A browser that forgets its storage every session
   (Firefox set to forget on close) therefore re-pairs but never retypes the server. With a Bridge
   from before 0.7.0 the page tries the server this browser last used instead.
   **Since 0.8.0 the setup comes with the server** (owner decision of 2026-10-01, "In the Bridge, per
   server"; docs/work-specs/studio-day-playout AC-11, D17 to D19). Each remembered server carries the
   studio's `studio` for it: the named channels, the NoaCG output's slot and the New media channel.
   A browser that pairs and connects takes it, so a second browser, another account's browser
   profile or one that forgot opens with the same setup, and a laptop used with two servers keeps
   each server's apart. The page says one line per step with the details behind info buttons, offers
   **This computer** (`127.0.0.1:5250`) beside every server used before, and shows how to pair
   another browser: copy a link into it. Before pairing the link is the page's own, whose code is not
   spent yet; after it, and in Playout settings, a paired page asks the Bridge for a fresh code
   (`/pair-link`), and Enter in the Bridge window prints one. Each code works once, for two minutes,
   and several may be open at once.
2. Once, per studio: the CasparCG host and AMCP port (filled in by the connect step above, and
   under **Settings -> Playout** with **Connect** beside **Test connection**), name
   the server's channels (they start as `Channel 1`, and **Add channel** adds `Channel 2`; NoaCG
   does not assume what a studio puts on which channel, so the operator renames them), say
   which channel the production's graphics go to (and on which layer) and which one new clips go
   to, and press **Test connection**. It round-trips a real AMCP `VERSION` and prints the
   server's own version string. The settings are **app-wide and persisted** - they survive
   switching productions, reloading and closing the browser, because a studio has one playout
   server and not one per show. **NoaCG owns this configuration**; the Bridge is told its target
   on every call. What it stores is its own token and the list of servers the page connected to,
   each with the studio's setup for it (0.8.0), which it only ever reads back to the page: it never
   contacts a remembered server on its own. **Test connection** remembers nothing; **Connect** is
   the same round trip and remembers. The browser keeps a copy of the setup, which is what every
   surface reads: it takes the Bridge's when it connects and when a production page or Playout
   settings opens, and gives the Bridge its own when the operator changes it there. A change the
   Bridge has not confirmed (it was not running) stays marked and is given to it when it answers,
   so the Bridge's older copy never replaces it. A server the Bridge keeps no setup for takes the
   browser's unless that is the untouched default, which is how a studio's setup moves into a
   0.8.0 Bridge the first time it sees the server (`control/studioSetup.ts`). With an older Bridge
   each browser keeps its own, as before.
3. Per production, on the production page: **Links -> CasparCG -> Put on air**. That is one
   action, `take` of the output URL, which the Bridge sends as

   ```
   PLAY 1-20 [HTML] "https://noacg.studio/output?production=<slug>"
   ```

   From that moment every cue, take, update, reveal, score change and recovery flows through the
   durable command log the `/output` page already follows (`docs/CLOUD_PLAYOUT.md`), inside
   CasparCG's own browser. **Take it off** sends `STOP 1-20`. Loading the layer once and leaving it
   up is the documented CasparCG workflow (`docs/PLAYOUT_INTEGRATION.md` §3), not a shortcut.
4. Per production, in the rundown: **＋ From the playout server…** lists the templates and clips
   already on the CasparCG box and adds them as cues beside the production's graphics (§5).

---

## 3. The Bridge (`noacg bridge`, `cli/src/playout/`)

It lives in the existing `noacg` CLI rather than as a second local process, for the reason
`docs/PLAYOUT_INTEGRATION.md` §4 already established with the exported package's relay and
launcher: the project ships one local helper, not a family of them. The exe is that command
packaged (§6). In code it is the playout agent (`cli/src/playout/`); to a person it is the Bridge.

**Every security property is a refusal, not a convention:**

| Property | How |
|---|---|
| Loopback only | Binds `127.0.0.1`. `--host` with anything but a loopback address is refused at startup, with the reason. |
| Token required | A stored per-machine token (`%APPDATA%\noacg\caspar-agent.json`, the file the first agent used, so nobody re-pairs for a rename), in `Authorization: Bearer`. Compared in constant time. `/health` and `/pair` are the routes without it. |
| Origin allowlist | Only the configured NoaCG origin (`--origin`, default `https://noacg.studio` plus `localhost`/`127.0.0.1` dev ports). Any other origin gets 403 and **no** CORS headers, so a stray tab cannot read a reply even if it guessed the token. `/health` is the deliberate exception - see below. |
| No DNS rebinding | The `Host` header must itself be loopback. A name that resolves to `127.0.0.1` from a page's own domain does not get in. |
| One-time pairing | `/pair` spends a code the Bridge minted: the one it printed and carried in the link it opened, or one a paired page asked for with `/pair-link` or Enter in its window printed (0.8.0). Two minutes, first use only, origin-checked; at most eight open at once. |
| No AMCP of unknown shape from the page | The page never composes AMCP text. It sends a target, an item, a slot and a verb (§3a); the adapter writes the one line. `/amcp` takes one raw line for the terminal route and refuses an embedded CR or LF; every quoted argument is escaped the way the server's tokenizer reads it, and a reply is capped at 8 MB. |
| Nearly stateless | Each request names its target; a connection is opened per command. The Bridge keeps its token, the servers the page connected to (`%APPDATA%\noacg\caspar-servers.json`, 0.7.0, with the studio's setup for each since 0.8.0; read back to the page, never contacted by the Bridge itself; from 0.8.0 on a field a newer Bridge wrote survives a rewrite, while 0.7.0 rewrites host and port only and so forgets every setup), the open pairing codes in memory, and, per slot and also only in memory, a counter, the id of what it last started there, what it queued behind it, and the sequence it runs there (below). The one thing it ever sends by itself is the next file of a sequence the page started. |

**What it remembers per slot, and why** (`cli/src/playout/slots.ts`, since 0.4.2; the runner
since 0.5.0). Reading the server's state honestly, and playing one clip after another with the page
closed, need facts only the process that sent the commands can hold:

- **A generation.** Every Take, Out, Clear, Pause, Resume and new sequence on a slot moves the
  slot's counter BEFORE its command is sent; Update and Next change nothing the clock shows and
  leave it. The action's reply carries the new number and so does every reading, and a reading
  taken while an action is still on its way reports the number from before it. The page ignores a
  reading older than the last action it saw accepted, so an answer that left the server before a
  Take or a Pause can never undo it on screen.
- **An instance.** What this Bridge last started on the slot: an id (`<session>.<n>`), the item, and
  the cue id the page named. A reading carries it only while the slot still plays that item and
  nobody restarted it, so the page can tell its own clip from another client's, and put a clip back
  on its cue after a reload, wherever the cue's item is set to play now. In a sequence it follows
  the file on air, and names that file's cue.
- **A follower.** What the Bridge queued behind the clip with `LOADBG … AUTO` that has not aired:
  Out then clears the layer instead of stopping it, and a refused Take disarms it (§3b).
- **A sequence, and the runner that plays it** (`cli/src/playout/runner.ts`,
  `CLIP_PLAYBACK_PLAN.md` §6.10). A layer has one background, so the server can only ever hold the
  NEXT file; something has to queue each one after that. A browser slows a hidden tab's timers to
  about once a minute, so that something is the Bridge, which reads a slot with a sequence on it
  four times a second and, when it sees the server switch, queues the next file. Its rules: one
  serial queue per slot for every command, the page's and its own; work planned under a
  generation is dropped unsent once the generation moves, so a late `LOADBG … AUTO` never reaches a
  layer that was taken off, where it would play at once; nothing is queued onto a paused clip, since
  the server checks AUTO before pause; the slot is read once more right before a file is queued, so
  another client's or another Bridge's take ends the sequence and nothing is sent; a member after
  the first plays at least two seconds, so the next is always queued in time.
- **A sequence that starts over** (0.6.0, a Play-through folder set to Loop the folder,
  `CLIP_PLAYBACK_PLAN.md` §6.6). With `loop` the entry after the last is the first, so the runner
  queues the first file again while the last one plays, and keeps reading the slot until Out. No
  entry of a looping run carries an ending, and the two-second minimum covers the first entry too,
  since it follows the last. The runner sees a switch to the same file (a folder of one file twice)
  by its position jumping back more than 0.1 s.

A restarted Bridge remembers nothing. Its session id is new and its readings carry no instances, so
the page shows whatever the server holds as unidentified rather than guessing from the file name,
and says that Play next stopped there. What the server already had queued still plays by the
server's own rule.

### 3a. The playout protocol (v2)

`cli/src/playout/protocol.ts`, mirrored byte for byte at `src/control/playoutProtocol.ts` (a test
refuses drift). The vocabulary is deliberately not CasparCG's, so OBS, vMix and an OGraf renderer
can add an adapter without the page's model moving. OGraf did exactly that (below), additively,
so the version stayed 2:

- **target** - `{ adapter: 'casparcg', host, port }` or `{ adapter: 'ograf', baseUrl }`, which
  server.
- **item** - `{ kind: 'template' | 'media' | 'url', name }`, what is in its library (`url` is a web
  page its browser engine loads, the NoaCG output URL being one; never listed, only taken). An
  OGraf graphic is a `template` whose name is the graphic's id.
- **slot** - `{ adapter: 'casparcg', channel, layer }` or `{ adapter: 'ograf', rendererId,
  renderTarget }`, where on it. Channels and layers exist only inside the casparcg slot; an OGraf
  `renderTarget` is the renderer's own shallow identifier, shaped by its `renderTargetSchema`.
- **verb** - `take` (with `data` for a template, `loop` for a clip, the page's `cueId`, and a
  clip's `playback`), `update` (data), `next`, `out` (with a clip's `fadeOut`), `pause`, `resume`,
  `clear` (remove at once, no exit: OGraf's All out), and `sequence` (0.5.0: several files played
  one after another, below; 0.6.0: `loop` to start over after the last). A slot-only verb may name the `item` the page believes is in the slot,
  because `out` on a template plays its exit through the CG layer where `out` on a clip stops the
  video layer.
- **playback** (0.5.0, `CLIP_PLAYBACK_PLAN.md` §9) - how a clip plays, in seconds, never frames:
  `end` (`hold`, `clear`, `loop`; a following file is a sequence, not an ending), `fadeIn`,
  `fadeOut` (used by Clear at the end), `gain` (linear, from the cue's dB), `trim` (`in`, `out`,
  seconds into the file). Every field is optional, and an action without one is sent exactly as it
  always was. A field the Bridge does not know is refused by name, never dropped, and so is one on
  the wrong verb: an update carrying a level would look applied and change nothing.
- **sequence** - `{ slot, entries: [{ item, cueId, playback, media: { kind, seconds } }], loop? }`, at
  least two and at most 100 (`MAX_SEQUENCE_ENTRIES`, shared with the page). `loop: true` (0.6.0,
  feature `sequence-loop`) starts the run over after its last entry until Out; `loop` on any verb
  but `take` and `sequence` is refused. The first plays at once and the Bridge runs the rest (§3). `media` is what the
  server's own list says the file is: the Bridge refuses a still (it never ends), a file of unknown
  length, and a member after the first shorter than two seconds, and only the last entry may have
  an ending of its own.

Routes, all JSON:

| Route | Token | Does |
|---|---|---|
| `GET /health` | no | `{ ok, agent: 'noacg-bridge', v: 2, version, adapters, features }` - presence, protocol version, what this Bridge understands, nothing about the studio |
| `POST /pair` | code | `{ code }` -> `{ token }`, once |
| `POST /status` | yes | `{ target }` -> the server's version (`VERSION`) and what that server can do (`capabilities`); remembers nothing |
| `POST /connect` | yes | 0.7.0: `/status`, and on success the server goes first in the remembered list; the reply adds `servers` |
| `POST /servers` | yes | 0.7.0: `{}` -> `servers`, the CasparCG servers the page connected to, most recent first, each with its `studio` once one is kept (0.8.0); a route with no target |
| `POST /studio` | yes | 0.8.0: `{ target, studio }` -> `servers`: the setup kept on that server's entry, its place in the list unchanged. Refused for a server the Bridge never connected to; contacts no server |
| `POST /pair-link` | yes | 0.8.0: `{}` -> `{ code, expiresIn }`, one more one-time pairing code for another browser, which the page puts in a link on its own origin; a route with no target |
| `POST /list` | yes | `{ target, kind }` -> the library of that kind (`TLS` / `CLS`), and for OGraf the `renderers` it can play on |
| `POST /thumbnail` | yes | `{ target, name }` -> a clip's PNG, base64 (`THUMBNAIL RETRIEVE`) |
| `POST /channels` | yes | 0.8.1: `{ target }` -> `channels`, each `{ channel, mode }` as the server reports it (a bare `INFO`); touches no layer |
| `POST /state` | yes | `{ target, channel }` -> what each layer of the channel holds, one `SlotState` per layer (`INFO <channel>`); not logged, since it runs twice a second |
| `POST /act` | yes | `{ target, action }` -> one action, one or more commands; the reply carries the slot's `generation`, the Bridge's `session`, for a take or a sequence its `instance`, and a `warning` when a later command of the action was refused after the first went through |
| `POST /amcp` | yes | one raw line, the terminal's route |

**Two lists, two questions** (0.4.2, `CLIP_PLAYBACK_PLAN.md` §6.9). `features` on `/health` is what
this Bridge build understands; it names no server, so it says nothing about one. `capabilities` on
`/status` is what the named target can do, from its adapter and its version. 0.5.0 lists the
features `state`, `playback` and `sequence`, 0.6.0 adds `sequence-loop` (a 0.5.0 Bridge would
read a sequence's `loop` field by field and drop it, so the page never sends one without the word),
0.7.0 adds `servers` (`/servers` and `/connect`, which an older Bridge answers with a 404, so the
page uses them only when the word is there), and 0.8.0 adds `studio` (each server's `studio` and
`/studio`; without it the setup stays in the browser) and `pair-link`; a CasparCG 2.3 or later has the capabilities `state`,
`end`, `fade`, `trim`, `level` and `sequence`, an older one only `end` (Clear at the end is a plain
`LOADBG … EMPTY AUTO`), and an OGraf target none. The page offers a control only when both lists
say yes, and a cue that already carries a setting the running Bridge or its server cannot honour
cannot be taken and says why: it is never sent the old way with the setting dropped. A Bridge from
before 0.4.2 sends neither list, and the page then counts a clip from its own Take and says so.

**`SlotState`**, per layer, in the protocol's words rather than CasparCG's: `producer` (`video`,
`still`, `colour`, `html`, `empty`, `other`), `file`, a clip's `segment` (its start in the file and
its length, seconds) and `position` (seconds into the SEGMENT, never into the file), `paused`,
`loop`, a MIX's `transition.progress`, what is `queued` behind it and whether it plays by itself,
the slot's `generation`, and, while this Bridge's take still plays there, its `instance` and
`cueId`, and, while a sequence runs, the entries still to play (`sequence.next`; for a looping run,
every other entry in the order they come round, and `sequence.loop`). `arriving` says the server has accepted this Bridge's Take but the layer still shows what
it held before: CasparCG answers a `PLAY` before the clip is on the layer (measured, below). The
reply also carries the Bridge's `session` and `observedAt`, its own monotonic clock at the reading.

An error names its hop: `{ hop: 'agent' | 'target', code, detail, raw? }` with `code` one of
`no-media-scanner`, `refused`, `unreachable`, `not-found`, `unsupported`, `usage`, `uncertain`.
`uncertain` means the command was sent and no clear answer came back, so it may have happened:
look at the output before repeating it. The Bridge never retries one.

**The OGraf adapter** (`adapters/ograf.ts`) speaks the EBU OGraf Server API, with every route and
body taken from the pinned OpenAPI (`ebu/ograf` at `c821671`, `v1/specification/open-api/server-api.yaml`).
`baseUrl` gets `/ograf/v1` appended unless it already ends in it, so `http://gfx:8080` and
SuperFly.tv's `http://gfx:8080/api/ograf/v1` both work. Paths below are under that root:

| verb | Server API |
|---|---|
| status | `GET /` |
| list template | `GET /graphics`, then `GET /renderers` and `GET /renderers/{id}` for each: the graphics, and where they can play |
| take | `PUT .../clear` (filter: the render target), `POST .../load` (`params.data` = the cue's data), `POST .../playAction` (`params: {}`) |
| update | `GET /renderers/{id}/target?renderTarget=<json>`, then `POST .../updateAction` (`params.data`) |
| next | the target read, then `POST .../playAction` (`params: { delta: 1 }`) |
| out | the target read, then `POST .../stopAction` (`params: {}`); nothing loaded is already out |
| clear (All out) | `PUT .../clear` (filter: the render target) |

`...` is `/renderers/{rendererId}/target/graphicInstance`. The adapter keeps nothing: a take
replaces what the render target holds, the way a CasparCG take replaces its layer, and later verbs
read the target for its graphic instance rather than remembering an id, so a Bridge restart or a
second controller strands nothing; update, next and out act on whatever graphic the target holds,
as they would on a CasparCG layer. Each verb gets one 7 s budget for all its requests, so the
Bridge answers, uncertain if need be, before the page stops waiting. A `200` is the graphic accepting the call, never its animation
finishing; a `200` whose `statusCode` is not 2xx is the graphic refusing, and a `200` with no
`statusCode` is `uncertain`. A take that loads and then does not play says so. The standard has no
upload route, so the adapter plays what is already on the server, and a vendor's private upload
endpoint is not treated as the standard. `media`, `url`, `pause` and `resume` are refused before
anything is sent.

**Why `/health` answers any origin.** A cross-origin refusal is *opaque* to the page that made
it: JavaScript cannot tell "403, wrong origin" from "nothing is listening there". A Bridge that
refused this route by origin would therefore make the panel say *"start NoaCG Bridge"* to
somebody whose Bridge is already running, and merely started for a different deployment. The
reply carries presence and a protocol version - no token, no studio, no word about the playout
server - and any local page could learn as much from how fast a refused connection comes back.

### 3b. The CasparCG adapter, one line per verb

| verb | AMCP |
|---|---|
| take `url` | `PLAY c-l [HTML] "URL"` |
| take `template` | `CG c-l ADD 1 "NAME" 1 "<json data>"` - play-on-load, so a take is one round trip |
| update | `CG c-l UPDATE 1 "<json data>"` |
| next | `CG c-l NEXT 1` |
| out (template) / out (clip or url) | `CG c-l STOP 1` / `STOP c-l` |
| take `media` | `PLAY c-l "NAME"` (+ `LOOP`); with playback, `PLAY c-l "NAME" [IN a] [OUT b] [MIX n] [AF "volume=g"] [LOOP]`, and for Clear at the end then `LOADBG c-l EMPTY [MIX n] AUTO` |
| sequence | `PLAY` the first entry as above, then `LOADBG c-l "NEXT" [IN] [OUT] [MIX n] [AF] [LOOP] AUTO` for the second; the runner queues each later one the same way, and after the last its own Clear |
| out `media` with `fadeOut` / with a follower queued | `PLAY c-l EMPTY MIX n` / `CLEAR c-l` |
| a refused take with a follower of a sequence queued | then `LOADBG c-l EMPTY`, without AUTO |
| pause / resume | `PAUSE c-l` / `RESUME c-l` |
| list template / media | `TLS` / `CLS` |
| state | `INFO c` (the whole channel), on a 2.3 or later server |
| channels | `INFO` (bare): one line per channel, `1 1080i5000 PLAYING`, on every version |

The data is JSON, which is what SPX sends and what every NoaCG export reads (its shim also takes
CasparCG's XML). Field ids are the export's own `f0`, `f1`, ... as `FIELDS.md` documents them.

**A clip's playback, as lines** (0.5.0, measured on 2.5.0 and 2.3 on 2026-09-28; the captures are
`p3-*.json` and `format-*.json` under `cli/test/fixtures/info/`, and `cli/test/playout.test.mjs` pins
every line and its order):

- **Times become the channel's frames at the rate INFO reports** (`framerate`, a fraction), read
  once per target and channel and refreshed by every reading the Bridge makes. For an interlaced
  format that rate is already the field rate, which is what `MIX`, `SEEK` and `LENGTH` count:
  `MIX 50` took a second on 1080p50 and 1080i50 alike, 1.67 s at 29.97 and 0.83 s at 59.94. A fade
  is at least one frame.
- **The level is `AF "volume=<gain>"`**, four decimals, on the clip itself. -12 dB (`0.2512`)
  measured 12.0 dB quieter than the same clip at 0 dB on both versions, through a Take and through
  an automatic switch, with the layer's `MIXER VOLUME` still at 1. No action ever sends `MIXER`.
- **Clear at the end** is the empty colour queued behind the clip. With a fade the server starts
  the mix that many frames before the end (0.5 s for `MIX 25`) so it finishes on the last frame; the
  outgoing clip's file fields vanish from INFO the moment the fade starts.
- **Behind a clip that starts part way in, nothing is queued with the take.** A `LOADBG … AUTO`
  sent within about 60 ms of `PLAY … IN n` (or `SEEK n`) fires at once on both versions: the
  follower airs and the trimmed clip never does; from about 90 ms on it waits for the trimmed end.
  Such a take plays its clip alone, and the runner queues its Clear or its next file once INFO shows
  the clip inside its segment.
- **Disarming**, measured: `LOADBG c-l EMPTY` without AUTO and `CLEAR c-l` each stop a queued file
  from airing; a refused `PLAY` (`404`) leaves it armed until one of them; `PLAY c-l EMPTY MIX n`
  fades the clip out and replaces the queued file.
- **Pause and AUTO:** paused before a follower's MIX window it waits; paused inside it the MIX
  freezes and carries on at Resume; a follower queued onto a clip already paused in its last frames
  starts at once. PAUSE lands about two frames after it is sent.
- **Preloading is not worth building yet:** a direct Take reaches its first frame about 115 ms after
  `202 PLAY OK` on 2.5.0 (95 ms on 2.3) with no black between clips, and a preloaded one about 55 ms,
  but a preload would take the layer's one background, which a sequence needs.
- **2.3 names no producer inside a transition**, so a MIX and a fade to empty are read off what the
  transition carries (a colour, a clip's segment, a path). Its AUTO cut dropped about 40 ms of sound
  and held the outgoing clip's last frame one extra frame; 2.5.0's was clean.

**Reading `INFO`** (`cli/src/playout/info.ts`, `slotReading` in `adapters/casparcg.ts`). Measured on
the real 2.5.0 on 2026-09-28, with every capture kept under `cli/test/fixtures/info/` and the parser
tested against them rather than against the fake server:

- `INFO 2` answers `201 INFO OK` and ONE data line of XML whose own line breaks are bare LF.
  `INFO 2-10` answers the same whole-channel document, so the adapter asks for the channel.
- A clip's `file/time` is the position in the WHOLE file and the file's length; the part that plays
  is `file/clip`, its start and length. The countdown is `clip length - (time - clip start)`. A
  30-second file trimmed to 7.5 s from 5 s in, 1.04 s into the trim, reads time `[6.04, 30]` and
  clip `[5, 7.5]`: 6.46 s remain, not 23.96.
- `SEEK`, `IN`, `OUT` and `LENGTH` count frames at the CHANNEL's rate, not the file's: `SEEK 250
  LENGTH 375` on a 25 fps file in a 50p channel is 5 s in and 7.5 s long. Phase 3's trim and fades
  convert with the channel's rate.
- A clip and an audio file are both `ffmpeg`; a still is `image` and names itself by `file/path`;
  `PLAY c-l EMPTY` leaves a `color` producer; `STOP` leaves `empty`.
- A MIX under way is a `transition` foreground wrapping the incoming clip. A queued background is a
  `transition` wrapping its file too, and `frames_left` appears on the foreground only while that
  background waits with `AUTO`.
- **`202 PLAY OK` comes before the clip is on the layer.** An `INFO` a few milliseconds after the
  reply showed the layer still empty, or, on a re-take of the same file, that file still at its end;
  one about 130 ms later showed the new clip at 0. So for a second and a half after a Take, a
  reading that cannot be the new clip yet (nothing, another file, or further in than the time since
  the Take) is marked `arriving` and neither ends nor restarts anything. After that it means what it
  says.
- An `INFO` round trip took a median 1.5 ms and at most 3 ms over forty readings a quarter of a
  second apart with a clip playing (`info-timing.json`). Whether that rate ever costs a frame on air
  was not measured. The Bridge gives up on one after 1.2 s, before the page's own 1.5 s, so a server
  that stops answering never has two readings of a channel open at once.
- **2.3 answers the same way** (the build in this machine's 2.3.3 LTS folder, which reports
  `2.3.2 4de6d18f Dev`, captured the same day as `v2.3-*.json`): the same segment for the same trim,
  pause, loop and queued file, but no `<format>` element, and a clip named WITH its extension
  (`NOACG_FIXTURE/COUNT30.mp4`). Matching a reading to an item therefore ignores the extension, the
  case and the slashes' direction, on the Bridge (`playsItem`) and on the page (`namesItem`).

### AMCP, precisely

- **CRLF line protocol.** Every command ends `\r\n`; so does every response line. The wire is
  UTF-8: a clip named `Jääkiekko` lists and plays under its own name (measured 2.5.0, 2026-09-22;
  the first agent wrote latin1 and mangled it).
- **Responses are numeric codes**: `2xx` fine (`201` = one data line follows, `200` = several
  until a blank line, `202` = done, no data), `4xx` the client's fault (`404 PLAY FAILED` for a
  missing file), `5xx` the server's.
- **Quoting.** Inside a double-quoted argument the server's tokenizer reads exactly `\\`, `\"` and
  `\n`; anything else after a backslash is dropped. `amcpQuote` escapes those three and refuses a
  carriage return, which would end the command.
- **CG addressing is `<channel>-<layer>`.**
- A connection that opens and says nothing is normal - CasparCG has no greeting banner, so the
  Bridge must not wait for one before writing.

---

## 4. The route with no browser in it

Every browser-side constraint in §1b disappears if the operator is in a terminal, so the same
commands exist there and are the honest answer for Safari, for a locked-down browser, and for a
machine where clicking a permission prompt is not going to happen:

```bash
noacg caspar play --url "https://noacg.studio/output?production=my-show" --channel 1 --layer 20
noacg caspar send 'CG 1-21 ADD 1 "HOUSE_STRAP/HOUSE_STRAP" 1 "{\"f0\":\"Anna\"}"'
```

`noacg caspar status` is the same round-trip as the Settings button, and is the first thing to
run when the panel says something is unreachable - it tells you whether the problem is between
the browser and the Bridge, or between the Bridge and CasparCG.

---

## 5. The playout server's own library, cued from the rundown

**The pain this answers** ([`docs/backlog/video-through-playout-wrapper.md`](https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/video-through-playout-wrapper.md)): a show is graphics
AND clips, and the moment a clip had to roll the operator left NoaCG for the CasparCG Client.
The model is SPX's `filelist`, copied exactly: the operator picks a NAME from what is already on
the server, and the machine that owns the file plays it. Nothing is uploaded, ever.

- **Discovery is the server's library, through AMCP only.** `TLS` and `CLS` (and `THUMBNAIL
  RETRIEVE` for a clip's picture, asked for as rows scroll into view) go through the Bridge to
  the server, which answers them from its media scanner. The scanner runs on the SERVER box and
  is reachable only by the server itself; nothing here reads a folder on the laptop or mounts a
  share. When the scanner is not running the server answers `501 TLS FAILED`, about five seconds
  late (its own timeout toward the scanner, measured on 2.5.0), and the picker says exactly that,
  with a name box under it so an operator who knows the template's name is never at a dead end.
  On the server source the AMCP proxy carries `/cls`, `/tls`, `/fls`, `/cinf` and `/thumbnail`
  only; the scanner's richer `/templates` (GDD) is not reachable this way, and no scanner port is
  opened for it.
- **Browsed as folders** (2026-09-25). The server names a file by its path under its media or
  template folder (`SPORTS/HOCKEY/GOAL_REPLAY`). Listed flat, a deep library's names pushed the
  Add buttons out of the popover. The picker now shows the folders at the current level first,
  then the files there by their own name, truncated, with the full name on hover. A path line
  above steps back out. The list is still one `CLS` or `TLS`; the folders are drawn from the names
  on the page (`folderView` in `PlayoutItemPicker.tsx`), so no new Bridge route was needed.
- **A PlayoutItem** in the show record (`src/model/shows.ts`, additive optional): adapter, kind,
  the server's name, the channel and layer, a clip's length, whether a clip loops (§5a), a
  template's fields. A cue over it is an ordinary `ShowCue` with `source: 'playout'`.
- **Channels** (2026-09-23). A real broadcast runs graphics on one CasparCG channel and video
  inserts on another, and one rundown holds both. Settings -> Playout names the server's channels
  once (`spx-gfx-caspar`, additive: a record from before reads as one row, its one channel) and
  holds two defaults: the GRAPHICS channel, where the output URL and new server templates go,
  and the CLIP channel, where new clips go. A row starts named by its number (`Channel 2`; until
  2026-09-25 the defaults were `Graphics` and `Inserts`, which assumed a use) and a name the
  operator has not changed follows the row's number. Adding the first extra channel makes it the
  clip default, so a stock one-channel server never has a clip aimed at a channel it lacks. With a Bridge that has the `channels` feature (0.8.1) the table shows each row's video mode as the server reports it, says which row the server has no channel for, and Add channel adds the next channel the server has rather than the next number up; with an older Bridge, or a server whose reply it cannot read, the table works as before. Every server cue then picks its channel in its editor, beside the layer,
  from that list - never a typed number - and the rundown row wears the address as the server
  writes it (`2-10`). `PlayoutItem.channel` is optional and a plain number: absent means the
  graphics channel, which is where every item saved before it has always played, and a number
  the studio does not name (a production made elsewhere) stays listed as itself. The channel
  lives on the item beside the layer, so every cue of one server item shares its slot, the way
  every cue of one graphic shares its layer. The production's own graphics stay on the graphics
  channel with the output URL; a second output page on another channel is a later slice
  ([issue #767](https://github.com/NoaCG/NoaCG-Studio/issues/767)).
- **No purpose names (2026-10-01, docs/work-specs/studio-day-playout).** Settings calls the two
  defaults what they are: **NoaCG output** (the slot the output URL plays on, stored as
  `channel`/`layer`) and **New media** (the channel a new video, still or audio file starts on,
  stored as `clipChannel`). A new item stores its channel as a number. Channel and layer sit
  beside the note for every server item, clips included. The output's own slot is guarded: a
  server item set to it is refused at Take with the reason, because playing anything there
  replaces the output (measured on 2.3 and 2.5), and no default puts an item there.
- **Layers.** A server template takes the next free layer counted across graphics and templates,
  like a graphic, skipping the NoaCG output's layer on its channel. Clips share layer 10, below every graphic, on purpose: one clip at a time, and
  a strap never disappears behind a rolling VT. Audio files (the server's own word for them, kept
  since 2026-09-28) play on layer 5, below the clips, so a sting never knocks a VT off and a music
  bed survives both.
- **Fields.** A template NoaCG exported brings its fields back from the library, matched by its
  export slug (`HOUSE_STRAP/HOUSE_STRAP` on the server was exported from the graphic whose slug
  is `house_strap`). Any other template takes the field ids the operator types (`f0, f1`), and the
  cue editor grows a field on demand. The cue editor is the same shape as a graphic's: title,
  fields, note, layer - with the Bridge's last word on the server where the unsent line would be,
  polled every few seconds, and Take disabled with that sentence while the server is not there.
- **Verbs** go through the Bridge as one action each and never as a row in the command log:
  nothing renders a server item, the `/output` page would have nothing to do with it, and a
  phone cannot reach the operator's Bridge. The published payload still carries the playout cues
  (`OutputPayload.playoutCues`, additive, each with the channel and channel name the operator's
  studio resolved at publish) so the hosted control page lists them with the same `2-10`
  address - honestly disabled, with the sentence that says why. Until 2026-09-23 the payload
  reader dropped the list, so the hosted page never showed it.
- **Where a verb goes.** A take goes to the slot the cue is set to now; the page remembers that
  slot, and Update, Next, Pause, Resume and Out go where the take WENT, so a channel changed while
  a cue is on air never strands it. A take onto a slot another cue of the rundown holds replaces
  it there too. **All out** sends one Out per server cue the rundown has up, each on its own
  channel and layer, and no channel-wide `CLEAR`: another client's layers on the same server are
  not the rundown's to clear.
- **What the page believes, and what the server says** (phase 2 of `CLIP_PLAYBACK_PLAN.md`,
  2026-09-28). An accepted command marks the row ON AIR at once; a refused one never marks it, and
  the note line says which hop refused and why. Then the server has the last word: while the
  production has server cues and both the Bridge and the server can be read (§3a), the page asks
  `/state` for each channel its rundown uses, twice a second while something is up there and every
  three seconds otherwise, never with a second request out, and at once when the tab comes back
  into view. A clip the server ended or someone replaced takes its row off air with it, so the verbs
  and All out follow the server, not the page's memory.
  - **A reading only changes what the page believes.** Nothing in the poll can send a command, and
    no timer on the page ever fires or queues a clip.
  - **A reading older than the last action the page saw accepted is set aside**, by the
    slot's generation (§3), so a slow answer cannot undo a Take or a Pause on screen.
  - **After a reload** a clip this Bridge started is put back on its cue by its instance, on the
    layer where it plays even if its cue has since been set to another layer of that channel (a
    channel the rundown no longer names is not read after a reload). Anything
    else on a rundown slot is listed as `Unidentified item on 2-10` with its file, never matched
    by file name. A slot another client took over marks its cue `replaced on the server`.
  - **Two update speeds.** The clip clock and the rows' remaining times read a small timing store of
    their own; the rest of the page re-renders only when what is on air changes. What the page
    shows is described in `PLAYOUT_DASHBOARD.md`.
  - **Still planned** (`docs/RUNDOWN_AUTOMATION_PLAN.md` §2.7): after an accepted Take or Out the
    page writes the cue's ON AIR marker, never the verb, to the command log, so the hosted page and
    a timed clip's deadline can read it. The verb still goes only through the Bridge.

### 5a. Clip playback: what CasparCG already does, and what NoaCG uses

A show that has to open the CasparCG Client to loop a background is a show NoaCG did not serve.
The rule is the one the whole Bridge follows: **use the server's own AMCP parameter, never a
timer in the page**. A page-side timer dies with the tab. A native parameter keeps running on
the server whatever happens to the operator's laptop.

What CasparCG 2.3-2.5 does natively for a clip on a layer:

| Operator wants | Native AMCP | In NoaCG |
|---|---|---|
| Play once / stop | `PLAY c-l "CLIP"` / `STOP c-l` | since 2026-09-22 |
| Pause / resume | `PAUSE c-l` / `RESUME c-l` | since 2026-09-22 |
| **Loop** | `PLAY c-l "CLIP" LOOP` | **2026-09-25**: a Loop box in the clip's cue editor (`PlayoutItem.loop`, additive). Protocol v2 already carried `loop`, so the Bridge 0.4 on the Releases page plays it with no new download. |
| Fade in | `PLAY c-l "CLIP" MIX <frames>` (also `PUSH`, `WIPE`, `SLIDE`, with an easing) | **2026-09-28** (Bridge 0.5.0): Fade In, Short or Long, as `MIX` |
| Fade out | `PLAY c-l EMPTY MIX <frames>` (mixes the layer to nothing, then it is empty) | **2026-09-28**: Fade Out, on Out and on Clear at the end |
| Play the next clip when this one ends | `LOADBG c-l "NEXT" AUTO` (optionally `MIX <frames> AUTO`) | **2026-09-28**: At the end, Play next, run by the Bridge (§3) |
| Clear the layer when the clip ends | `LOADBG c-l EMPTY AUTO` | **2026-09-28**: At the end, Clear |
| Level | `AF "volume=<gain>"` on the clip (`MIXER c-l VOLUME` is a layer gain that outlives the clip, and is not used) | **2026-09-28**: Level in dB, applied at the next Take |
| Loop switched on or off while playing | `CALL c-l LOOP 1` / `LOOP 0` | **2026-10-02**: the Bridge's `ending` verb changes a playing clip's ending without playing it again (feature `ending`, not yet released); the page does not send it yet ([backlog](https://github.com/NoaCG/NoaCG-Studio/issues/763)) |
| Start part-way / trim | `SEEK <frame>`, `IN`/`OUT`, `LENGTH` | **2026-09-28**: Start at and End at under Advanced, as `IN`/`OUT` |

**Built 2026-09-28** (phase 3 of [`CLIP_PLAYBACK_PLAN.md`](CLIP_PLAYBACK_PLAN.md), NoaCG Bridge
0.5.0): every row above but the live loop switch. Each setting belongs to the cue, not the shared
file; the lines are in §3b and what the operator sees in `PLAYOUT_DASHBOARD.md` §2h. The plan was
decided with the owner and reviewed against the code and the CasparCG source; its §4 corrects the
sketch below where they differ (a fade at the end overlaps the clip's last frames; a still never
ends; `MIXER VOLUME` is not used). The sketch was its input and is kept as the record of it.
Each item in it is additive in the record and in protocol v2 (no version bump), and each needs a
Bridge release:

1. **Fade.** One per-clip setting, *Fade: none / short / long*, stored as frames. None is 0,
   short 12, long 25, counted in the channel's own frames because that is what `MIX` counts.
   Take sends `MIX n` after the clip name. Out on a faded clip sends `PLAY c-l EMPTY MIX n`
   instead of `STOP`, so the clip fades away and leaves the layer empty. That changes `take` and
   `out` by one optional `transition: { type: 'mix', frames }` field, and `casparLine` by two
   branches. It is the one change operators will feel on every insert.
2. **Then play.** One per-clip pick, *Then play: nothing / <another clip cue on the same slot>*.
   After a Take, the page sends `LOADBG c-l "NEXT" AUTO` (with the fade if the next clip has
   one). CasparCG switches at the last frame by itself: no timer, no gap, and it works with the
   page closed. The limit is native too. A layer has one background, so this chains ONE clip
   ahead. A longer playlist needs the page to learn when the switch happened and queue the next
   one, which is OSC state (§9, milestone 2). Until then a rundown of clips is taken cue by cue,
   the way the CasparCG Client's own rundown does it without its auto-step.
3. **Not proposed:** a NoaCG-side playlist engine, clip trimming, or audio mixing. Each is a
   real feature of a dedicated playout tool, and none of them was what sent the operator back to
   one. The Loop and Fade rows above were.

---

## 6. The exe

`cli/scripts/build-bridge-exe.mjs`: esbuild bundles `cli/src/playoutEntry.ts` (the bridge command
alone - the headless browser and the MCP server never enter the file) into one CommonJS file,
Node turns it into a single-executable blob, the running `node.exe` is copied and `postject`
injects the blob. The version is baked in, because the exe has no `package.json` beside it. The
script refuses to report success until the result has started on a free port and answered
`/health` as NoaCG Bridge with the package's version. Measured on this machine: 86 MB, starts,
answers.

**Two products, two homes.** To the people who use them, the NoaCG CLI (making graphics) and
NoaCG Bridge (connecting NoaCG Playout to CasparCG) are two tools with nothing in common, and the
release path keeps them apart: the CLI is published to npm by `release-cli.yml` on a `cli-v*`
tag, and the Bridge is published to the repository's GitHub Releases page by
`release-bridge.yml` on a `bridge-v*` tag. Both are described, side by side, on the public
Downloads page (`/downloads`, `downloads.html`), which the landing page, the docs and the
studio's Playout settings all link.

**One version, two channels (owner, 2026-09-23).** The Bridge IS `noacg bridge` from the CLI
package, so the two share one version number, `cli/package.json`'s, and never grow a second one.
What is separate is the CHANNEL: a version reaches npm on a `cli-v*` tag and the Releases page on
a `bridge-v*` tag, and either may skip a version the other ships. So "latest" is resolved per
channel, never shared:

- the Bridge: every Bridge release is created with `--latest`, so
  `https://github.com/NoaCG/NoaCG-Studio/releases/latest` is always the newest Bridge, even with
  the older `cli-v*` Releases from before the split still on the page; the Downloads page asks
  GitHub for the newest `bridge-v*` release BY TAG and links its asset. The file name carries the
  version (`NoaCG-Bridge-0.6.1.exe`, with `.sha256` beside it), so there is no fixed direct link;
  0.4.0 to 0.6.0 were published as plain `NoaCG-Bridge.exe` and the page still accepts that;
- the CLI: npm's `latest` for `@noacg/cli`, which the Downloads page reads from the registry.

Each card on the Downloads page shows the version of the file it links to, so a CLI release with
no new exe simply shows two different numbers. `noacg bridge` still runs the Bridge for a
developer who has the CLI; that is the one place the shared package shows. A Bridge
release is `git tag bridge-vX.Y.Z <commit on main> && git push origin bridge-vX.Y.Z`; the
workflow refuses a commit that is not on main, a tag that disagrees with the package version, a
version already released, and a version with no section in `cli/BRIDGE_CHANGELOG.md`, written
for the operator deciding whether to download again. The Release page is that section placed
into `cli/BRIDGE_RELEASE.md` (what it is, what changed, how to install, where the guide is), and
`node cli/scripts/release-notes.mjs --bridge` prints it. A Bridge release may skip versions
that only changed the CLI. The Actions tab's "Run workflow" is a rehearsal by default and keeps
the exe as a workflow artifact.

**Unsigned, for now.** The injection invalidates node.exe's own signature and there is no NoaCG
code-signing identity yet, so SmartScreen shows "Windows protected your PC" (More info -> Run
anyway) on a machine that has never seen the file, and a school's AppLocker may refuse it
outright. Signing is an identity the project has to buy (Azure Trusted Signing is the cheap
route). The studio compares the Bridge's protocol version from `/health`, not its semver: an
older Bridge is told apart from a missing one, and Settings -> Playout says "update NoaCG
Bridge".

---

## 7. Diagnosing it - the hops, never one generic red

The panel never says "failed". It says which hop failed, because the hops have nothing to do
with each other and most of them are the user's to fix:

| State | What the app saw | What it says |
|---|---|---|
| `permission` | `navigator.permissions` reports `prompt` for `loopback-network` (or `local-network-access`) | Your browser is asking - answer the prompt at the top of the window. In Firefox, the sentence quotes Firefox's own words: "access other apps and services on this device". |
| `permission` | it reports `denied` | Allow "local network access" for this site, in the icon left of the address. |
| `permission` | no name is known AND the browser is Safari | Safari will not do it at all. Use Chrome, Edge or Firefox, or `noacg caspar play`. |
| `bridge` | no name is known, not Safari (a browser without the gate) | Start NoaCG Bridge: nothing stands in the way, so the Bridge is simply not answering. |
| `bridge` | `/health` unreachable with the permission not in the way | Start NoaCG Bridge on this machine (double-click the NoaCG Bridge file you downloaded; Settings -> Playout links the download). |
| `bridge` | `/health` answered, then a route came back 403 | The Bridge is running for a **different** deployment. Restart it with `--origin <this site>`. |
| `outdated` | `/health` answered as the old agent, or below protocol 2 | Update NoaCG Bridge. |
| `token` | `/health` answered, then 401 | The Bridge rejected the token. Pair this browser again from the link it prints. |
| `server` | the Bridge answered, the AMCP socket did not | CasparCG did not answer on `<host>:<port>`, with the socket error in brackets. |
| `server` | the server answered with a `4xx` | CasparCG refused the command, quoting its status line (`404 PLAY FAILED` reads "no such file"). |
| `scanner` | a list came back `501` | The server answered, but its media scanner is not running. |
| `ok` | AMCP `201 VERSION OK` | Shows the server's own version string. |

`config` is one more state for settings that are not filled in yet, and it is why **Test
connection** is disabled rather than offering a call that must fail. `permission` is only ever
offered when it is possible - a NoaCG on `http://localhost` or a LAN self-host cannot hit it
(§1b), and saying so there would be a lie.

---

## 8. What has actually been verified

Stated plainly, because this doc's whole purpose is to not overstate.

- **Reproduced on this machine (2026-08-24)**: everything in §1.
- **On real servers on this machine, 2026-09-10** (2.3.2 and 2.5.0, screen consumer): the output
  URL loaded with one command, cued from the dashboard, updated live, recovering after a channel
  restart and a server `RESTART`; the first agent's `status`, `play` and `stop`.
- **On the real 2.5.0 with its media scanner, 2026-09-22**: `TLS`, `CLS`, `CINF`, `THUMBNAIL
  LIST` and `THUMBNAIL RETRIEVE` captured and written into the parsers' tests; a clip named
  `Jääkiekko` played under its own name; `CG ADD` with data holding a quote, a newline and an `ä`
  accepted; `404 CG ADD FAILED` and `404 PLAY FAILED` for missing files; with the scanner stopped,
  `VERSION` answers and `TLS` answers `501 TLS FAILED` after about five seconds. The whole
  milestone walk - the exe paired, a published quiz and scoreboard on the channel through the
  Bridge, revealed and scored from the dashboard, a server template and a still cued, taken,
  updated and taken off - is `e2e/configured/bridge-real-server.spec.ts` (`BRIDGE_REAL=1`), with a
  `PRINT 1` frame after every step; its record is the owner-queue file of that date.
- **On the real 2.5.0 with two channels, 2026-09-23** (a second `<channel>` with a screen consumer
  in `casparcg.config`): one rundown took a server template on 1-21 and a clip on 2-10, moved the
  template to channel 2 while on air (Out reached 1-21, the next Take landed on 2-21), and All out
  cleared channel 2 back to an empty frame while a still played on 1-5 by hand stayed up. The
  walk is the second test in `e2e/configured/bridge-real-server.spec.ts`, with `PRINT 1` and
  `PRINT 2` frames after each step. The same server's `CLS` lines are what showed the last field
  is a time base, not a rate (`cli/src/playout/amcp.ts` `parseCls`).
- **On the real 2.5.0, 2026-09-28** (two 1080p50 channels): the `INFO` captures of §3b, and the
  page's clip clock against them with this branch's Bridge in process. The clock matched `INFO` to
  the second across six samples; it warned at -0:10 and pulsed at -0:05, then read `HOLDING +0:00`
  and `+0:01`; a reload mid-clip restored the row and the clock; a `PLAY` of the same file from
  another client marked the cue `replaced on the server`; Out cleared it. The first run is also what
  found the `202 PLAY OK` race of §3b: a fresh Take dropped off air for one reading, and a re-take of
  the same file read as someone else's restart.
- **On the real 2.5.0 and 2.3, 2026-09-28, for 0.5.0**: the measurements of §3b (fade timing, the
  level through a FILE consumer and ffmpeg's volumedetect, disarming, pause around a MIX, `IN` and
  `OUT` under AUTO, frame rates in four formats, Take to first frame). Then the built 0.5.0 Bridge,
  through its own HTTP route and a logging proxy in front of 2.5.0, with `INFO` sampled every 50 ms:
  a three-clip sequence with 1-second fades and a Clear with a half-second fade out (each MIX began
  1 s before the end of the clip before, the clear fade 0.5 s before the last one's, never a frame
  of nothing between); a first clip trimmed to start 4 s in, seven times, three of them with the
  runner's reading forced into the first 90 ms (it read the clip as not yet started and queued
  nothing, and the trimmed clip aired every time); Out in the middle (`CLEAR 2-10`, nothing aired in
  the 28 s after); a single take with a Clear, a fade out and -12 dB (the channel's peak meter fell
  to a quarter); a refused replacement take (`404`, then `LOADBG 2-10 EMPTY`, and the queued clip
  never aired); a Pause the moment the next clip came up (eleven readings while paused, nothing
  queued, the rest queued 107 ms after Resume). Two things the run showed: INFO can still show a
  queued file for about 80 ms after the `LOADBG` that replaced it, so a reading just after an action
  may carry the new generation with the old background for one reading; and a queued Clear is a
  nameless colour, so a reading never shows it as queued.
- **On the real 2.5.0 and 2.3, 2026-09-28, for 0.6.0**: the built Bridge through its own HTTP
  route, with `INFO` read over one open connection about every 20 ms. A looping run of three
  3-second clips went A, B, C, A, B, C, A, each on the layer for its 3 seconds, with no black at any
  switch, the wrap included, in a FILE consumer's recording read with ffmpeg's blackdetect; the same
  with the middle clip trimmed with `IN` and `OUT`, which played its segment on every lap. After an
  AUTO switch into a clip trimmed with `IN`, the first reading already shows the trimmed start, and
  a follower queued 27 to 57 ms later waited for the end of the segment: unlike a `PLAY … IN`, the
  switch opens no window. A video and its own WAV taken one after another, as an All-together folder
  sends them, started within one frame on 2.5.0 and two on 2.3, the audio ahead.
- **On the real 2.5.0 and 2.3, 2026-10-02, for 0.8.0**: this branch's Bridge with a scratch
  `APPDATA`, two scratch servers and two browser profiles. A setup made in one browser was kept in
  `caspar-servers.json` on the server's entry, a second profile paired from a link the first one
  made and opened with it, and the two servers kept their own setups, one press each
  (docs/work-specs/studio-day-playout/evidence/landing-3.md).
- **Covered by the test suite**: `cli/test/playout.test.mjs` (every verb's exact line, quoting,
  the 501 mapping, pairing, the refusals, every playback line and its order, the conversions, no
  `MIXER`), `cli/test/runner.test.mjs` (every runner case of `CLIP_PLAYBACK_PLAN.md` §18 against a
  stateful fake server with each fault injected), `cli/test/state.test.mjs` (the `INFO` parser
  against the real captures, the segment arithmetic, generations, instances, the arriving window,
  `/state`'s token and origin), `cli/test/servers.test.mjs` (the remembered servers and their setups,
  `/studio`, `/pair-link`, the file a newer Bridge wrote), `cli/test/bridge-window.test.mjs` (the
  window's words and Enter), `scripts/studio-setup.test.mjs` (which copy of a setup wins),
  `e2e/bridge-connect.spec.ts` (Settings, pairing, the one button, each hop, a setup per server, a
  second browser, a link for it), `e2e/playout-cues.spec.ts` (the picker, the cues, each verb's envelope and each
  setting's, the scanner-missing and Bridge-missing sentences, a cue an old Bridge cannot play),
  `e2e/playout-sequence.spec.ts` (Play next and TO STUDIO), `e2e/playout-clock.spec.ts` (the clock,
  the rows and the server's word with `/state` faked at the network layer, and `P`).
- **In production, 2026-09-25** (an operator, Firefox on Windows, a school laptop set to forget
  everything on close): the Bridge paired and drove a multi-channel show. Firefox's prompt came
  once at pairing and again in the production tab when clips were first listed (§1b-ff).
- **NOT verified**: the hosted-origin permission prompt in Chrome on `https://noacg.studio`
  (needs a person at the keyboard); that the Firefox and Chrome policies in §1b-ff silence the
  prompt on that laptop; a Linux server (whether its media scanner is running there); Safari;
  SmartScreen on a machine that never saw the exe; a genuine 2.3.3; the level heard on an audio
  output (it was measured on a recording and the peak meter); phase 3 driven from the page itself on
  the real server, which is the owner's check.

---

## 9. What comes next

- **Milestone 2 - richer fields and state.** NoaCG's CasparCG and SPX exports embed a
  `graphics-data-definition` block, so GDD-aware clients see the fields; "Find servers" (a subnet
  probe of 5250); `--install-startup`. **Layer and clip position no longer need OSC**: `/state`
  reads them from `INFO` (0.4.2, §3a and §3b), which answers in about 1.5 ms, and the page polls it.
  A streaming `GET /events` would only matter if polling ever proved too slow or too costly.
- **Clip playback** (`CLIP_PLAYBACK_PLAN.md` §11) is built through its phase 4, folders, with
  Loop the folder in 0.6.0. What is left there is later work: frame-exact All together, a live
  fader, Load and preloading, and the timed graphics cues.
- **A hardware panel** ([issue #809](https://github.com/NoaCG/NoaCG-Studio/issues/809)): Bitfocus Companion and a
  Stream Deck driving the same named verbs and showing the same state the page draws, through this
  Bridge's local HTTP.
- **Milestone 3 - remote operators and more adapters.** `noacg bridge follow --production
  <slug>`: the Bridge follows the durable command log with the output-slug capability and
  executes `{ t: 'playout' }` rows only after its start cursor, so a phone can roll a clip and a
  recovery never re-rolls one. `adapters/obs.ts` (obs-websocket v5) and `adapters/vmix.ts` (its
  HTTP API), each with its own item kinds and slot.
- **OGraf, the rest of it.** The protocol and `adapters/ograf.ts` landed on 2026-09-26 (§3a),
  proved against a fake server by `e2e/bridge-ograf.spec.ts`. Still to come: a playout target of
  kind OGraf in Settings, a cue's "Plays on" pick of renderer and render target built from the
  renderer's schema, and a real round against a pinned SuperFly.tv `ograf-server`
  ([issue #790](https://github.com/NoaCG/NoaCG-Studio/issues/790)).
- **Not part of this**: uploading or syncing files to the server's folders. AMCP has no upload;
  that is a helper on the server box or a share the Bridge writes to, a separate design.
