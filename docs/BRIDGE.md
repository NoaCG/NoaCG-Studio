# NoaCG Bridge - the local program that lets the NoaCG page drive a playout server

**What this is.** NoaCG runs in the cloud; CasparCG runs on a studio network that must never be
reachable from the internet. NoaCG Bridge is a small program on the operator's own machine that
holds the socket a browser cannot, so the NoaCG page can put a production on a CasparCG channel,
list the templates and clips already on the server, and cue them from the rundown - without the
CasparCG Client. It is `noacg bridge` in the CLI, and `NoaCG-Bridge.exe` on every release is that
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

1. Once, ever, on the machine you operate from: download **NoaCG-Bridge.exe** (the studio's
   Settings -> Playout links it; it is the newest GitHub Release) and double-click it. It opens a
   page in your browser; one click pairs the browser with the Bridge. The link carries a one-time
   code that lives two minutes; the token never travels in a URL. On the hosted studio that click
   is also where Chrome asks whether the site may reach your local network, and the page says so
   first.
2. Once, per studio: fill in the CasparCG host and AMCP port under **Settings -> Playout**, name
   the server's channels (they start as `Channel 1`, and **Add channel** adds `Channel 2`; NoaCG
   does not assume what a studio puts on which channel, so the operator renames them), say
   which channel the production's graphics go to (and on which layer) and which one new clips go
   to, and press **Test connection**. It round-trips a real AMCP `VERSION` and prints the
   server's own version string. The settings are **app-wide and persisted** - they survive
   switching productions, reloading and closing the browser, because a studio has one playout
   server and not one per show. **NoaCG owns this configuration**; the Bridge is told its target
   on every call and stores nothing but its own token.
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
| One-time pairing | `/pair` spends the code the Bridge printed and carried in the link it opened: two minutes, first use only, origin-checked. |
| No AMCP of unknown shape from the page | The page never composes AMCP text. It sends a target, an item, a slot and a verb (§3a); the adapter writes the one line. `/amcp` takes one raw line for the terminal route and refuses an embedded CR or LF; every quoted argument is escaped the way the server's tokenizer reads it, and a reply is capped at 8 MB. |
| Stateless | Each request names its target. The Bridge keeps its token, the pairing code in memory, and nothing else; a connection is opened per command. |

### 3a. The playout protocol (v2)

`cli/src/playout/protocol.ts`, mirrored byte for byte at `src/control/playoutProtocol.ts` (a test
refuses drift). The vocabulary is deliberately not CasparCG's, so OBS, vMix and an OGraf renderer
can add an adapter without the page's model moving:

- **target** - `{ adapter: 'casparcg', host, port }`, which server.
- **item** - `{ kind: 'template' | 'media' | 'url', name }`, what is in its library (`url` is a web
  page its browser engine loads, the NoaCG output URL being one; never listed, only taken).
- **slot** - `{ adapter: 'casparcg', channel, layer }`, where on it. Channels and layers exist only
  inside the casparcg slot.
- **verb** - `take` (with `data` for a template, `loop` for a clip), `update` (data), `next`,
  `out`, `pause`, `resume`. A slot-only verb may name the `item` the page believes is in the slot,
  because `out` on a template plays its exit through the CG layer where `out` on a clip stops the
  video layer.

Routes, all JSON:

| Route | Token | Does |
|---|---|---|
| `GET /health` | no | `{ ok, agent: 'noacg-bridge', v: 2, version, adapters }` - presence, protocol version, nothing about the studio |
| `POST /pair` | code | `{ code }` -> `{ token }`, once |
| `POST /status` | yes | `{ target }` -> the server's version (`VERSION`) |
| `POST /list` | yes | `{ target, kind }` -> the library of that kind (`TLS` / `CLS`) |
| `POST /thumbnail` | yes | `{ target, name }` -> a clip's PNG, base64 (`THUMBNAIL RETRIEVE`) |
| `POST /act` | yes | `{ target, action }` -> one command |
| `POST /amcp` | yes | one raw line, the terminal's route |

An error names its hop: `{ hop: 'agent' | 'target', code, detail, raw? }` with `code` one of
`no-media-scanner`, `refused`, `unreachable`, `not-found`, `unsupported`, `usage`.

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
| take `media` | `PLAY c-l "NAME"` (+ `LOOP`) |
| pause / resume | `PAUSE c-l` / `RESUME c-l` |
| list template / media | `TLS` / `CLS` |

The data is JSON, which is what SPX sends and what every NoaCG export reads (its shim also takes
CasparCG's XML). Field ids are the export's own `f0`, `f1`, ... as `FIELDS.md` documents them.

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

**The pain this answers** (`docs/backlog/video-through-playout-wrapper.md`): a show is graphics
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
  clip default, so a stock one-channel server never has a clip aimed at a channel it lacks. Every server cue then picks its channel in its editor, beside the layer,
  from that list - never a typed number - and the rundown row wears the address as the server
  writes it (`2-10`). `PlayoutItem.channel` is optional and a plain number: absent means the
  graphics channel, which is where every item saved before it has always played, and a number
  the studio does not name (a production made elsewhere) stays listed as itself. The channel
  lives on the item beside the layer, so every cue of one server item shares its slot, the way
  every cue of one graphic shares its layer. The production's own graphics stay on the graphics
  channel with the output URL; a second output page on another channel is a later slice.
- **Layers.** A server template takes the next free layer counted across graphics and templates,
  like a graphic. Clips share layer 10, below every graphic, on purpose: one clip at a time, and
  a strap never disappears behind a rolling VT.
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
- **What the page believes.** ON AIR on a server cue means the command was accepted; nothing
  reports back what the server holds until OSC state arrives (milestone 2). A refused command
  never marks a row, and the note line says which hop refused and why.

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
| Fade in | `PLAY c-l "CLIP" MIX <frames>` (also `PUSH`, `WIPE`, `SLIDE`, with an easing) | proposed, below |
| Fade out | `PLAY c-l EMPTY MIX <frames>` (mixes the layer to nothing, then it is empty) | proposed, below |
| Play the next clip when this one ends | `LOADBG c-l "NEXT" AUTO` (optionally `MIX <frames> AUTO`) | proposed, below |
| Loop switched on or off while playing | `CALL c-l LOOP 1` / `LOOP 0` | later |
| Start part-way / trim | `SEEK <frame>`, `IN`/`OUT`, `LENGTH` | later |
| Volume / audio fade | `MIXER c-l VOLUME <0-1> <frames>` | later |

**The proposal for the rest, smallest first, each one additive in the record and in protocol v2
(no version bump), each needing one Bridge release:**

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
  `https://github.com/NoaCG/NoaCG-Studio/releases/latest/download/NoaCG-Bridge.exe` is always the
  newest Bridge, even with the older `cli-v*` Releases from before the split still on the page;
  the Downloads page asks GitHub for the newest `bridge-v*` release BY TAG and links its asset;
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
| `bridge` | `/health` unreachable with the permission not in the way | Start NoaCG Bridge on this machine (double-click NoaCG-Bridge.exe; Settings -> Playout links the download). |
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
- **Covered by the test suite**: `cli/test/playout.test.mjs` (every verb's exact line, quoting,
  the 501 mapping, pairing, the refusals), `e2e/bridge-connect.spec.ts` (Settings, pairing, the
  one button, each hop), `e2e/playout-cues.spec.ts` (the picker, the cues, each verb's envelope,
  the scanner-missing and Bridge-missing sentences).
- **In production, 2026-09-25** (an operator, Firefox on Windows, a school laptop set to forget
  everything on close): the Bridge paired and drove a multi-channel show. Firefox's prompt came
  once at pairing and again in the production tab when clips were first listed (§1b-ff).
- **NOT verified**: the hosted-origin permission prompt in Chrome on `https://noacg.studio`
  (needs a person at the keyboard); that the Firefox and Chrome policies in §1b-ff silence the
  prompt on that laptop; a Linux server (whether its media scanner is running there); Safari;
  SmartScreen on a machine that never saw the exe; a genuine 2.3.3. Loop through `PLAY … LOOP`
  is pinned in the adapter's tests and was not run against the real server this time.

---

## 9. What comes next

- **Milestone 2 - richer fields and state.** NoaCG's CasparCG and SPX exports embed a
  `graphics-data-definition` block, so GDD-aware clients see the fields; layer and clip position
  from OSC (2.4+ can subscribe over AMCP), pushed to the page over a streaming `GET /events`
  behind the same permission; "Find servers" (a subnet probe of 5250); `--install-startup`.
- **Milestone 3 - remote operators and more adapters.** `noacg bridge follow --production
  <slug>`: the Bridge follows the durable command log with the output-slug capability and
  executes `{ t: 'playout' }` rows only after its start cursor, so a phone can roll a clip and a
  recovery never re-rolls one. `adapters/obs.ts` (obs-websocket v5), `adapters/vmix.ts` (its HTTP
  API), `adapters/ograf.ts` (an OGraf server or renderer), each with its own item kinds and slot.
- **Not part of this**: uploading or syncing files to the server's folders. AMCP has no upload;
  that is a helper on the server box or a share the Bridge writes to, a separate design.
