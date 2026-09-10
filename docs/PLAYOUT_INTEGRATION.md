# Getting NoaCG graphics on air

The setup guide for the playout side: **CasparCG**, **OBS Studio**, **vMix**, and **SPX
Graphics**. It is written for the person configuring the playout machine, not for someone
working on this codebase — the internal contracts live in `docs/CLOUD_PLAYOUT.md` (the browser
output), `docs/CONTROL_LAYER.md` (operator surfaces) and `docs/SPX_TEMPLATE_FORMAT.md` (the SPX
template contract).

Every route below renders the same graphics. Nothing here is a different product tier, and none
of it costs anything.

## 1. Pick a route

There are three ways a NoaCG graphic reaches a video mixer, and the honest way to choose between
them is "what does this venue's network look like?".

| Route | What you point the playout at | Use it when |
|---|---|---|
| **NoaCG Cloud Output** | one persistent URL, `…/output?production=<slug>` | The playout machine has internet. One URL, loaded once, for the whole production. Operators drive it from anywhere, including a phone. |
| **Self-hosted output** | your own copy of the exported package, served by you | You want the cloud operator workflow but the pages on your own hosting. |
| **Portable export** | a downloaded folder or single file, played from disk | Closed networks, archives, or anywhere you need the graphic to work with no network at all. |

The first two are the same production operated over the same command log; only where the page is
hosted differs. The third is a self-contained file — fonts, images, GSAP and all — that plays
from `file://`.

**A production is not the same thing as a graphic.** One graphic is one template; a *production*
is a pool of graphics plus a cue rundown, and it gives you **one output URL for all of them**.
Each graphic in the pool is its own layer, and several can be on air at once — a bug, a lower
third and a ticker together. If you only ever need one graphic on screen, a portable export is
simpler.

## 2. What every browser-based playout needs

These four apply to CasparCG, OBS and vMix alike.

- **Transparency.** Every NoaCG page is transparent by default; you do not need to set a chroma
  key, and you should not. If you see a black or white box behind the graphic, something in the
  host is forcing an opaque background — check its "custom CSS" / background settings first.
- **Match the resolution exactly.** Graphics are designed in real pixels (1920×1080 unless you
  chose otherwise). Set the browser source to the same numbers. The output page letterboxes
  itself into whatever size it is given, so a mismatch does not crop — but it does scale, and
  scaled text is softer than text rendered at its own size.
- **Do not scale the source afterwards.** Resize the *source*, never the resulting layer.
- **Frame rate.** Set the browser source's FPS to the channel's. Motion is authored in seconds,
  so it plays correctly at any rate, but a browser source running at 30 in a 50 Hz channel
  judders in a way that looks like the graphic's fault.

## 2a. Pictures on air

A production often needs a still on screen - a holding slide, a photo of the person being
interviewed, a sponsor card, a scanned rules sheet. You do not need a template for that, and you
do not need to open the editor.

On the production page, **"＋ Add pictures…"** beside the graphics pool takes image files
straight from your machine. Each picture becomes its **own cue** in the rundown, named after the
file, and you air one exactly like any other cue: select it, ⟳ Take, ■ Out. It fades in and out
full-frame over whatever is behind it.

**One picture graphic per production, and that is on purpose.** However many pictures you add,
they all live on a single generated graphic occupying a single playout layer - so taking picture
3 while picture 1 is up **replaces** it. Pictures never stack, never end up hidden behind one
another, and never need a separate layer each. If you want two stills on screen at once, that is
a design with two slots, not two picture cues.

**Twenty pictures per production.** That ceiling is real, not a taste limit: every picture is
embedded into the production's published output, which the renderer and every operator page load
in full. Uploads are downscaled to the frame's own size before being stored, which puts a
production at roughly 15 MB at the limit - heavy but workable. A show that needs more stills than
that wants a media server or a playlist, not more cues here.

Two practical notes:

- **A picture added to a published production reaches the playout on the next publish.** The
  output is pinned when you publish it, so re-publish after adding stills - the upload says so
  on screen too.
- **SPX has no picture player either**, so this is not a NoaCG limitation being worked around.
  The SPX answer to "put a still on air" is the same shape: a template with a file-list field
  pointed at a folder on the SPX machine, and someone copying files into `ASSETS` beforehand.
  Uploading here is that step, without the file copy - and it works identically on the cloud
  output URL, in an exported package, and through the SPX template file of §6a.

## 3. CasparCG

CasparCG plays a web page through its **HTML producer**.

### Which version you have matters

| Server | Bundled browser engine | Consequence |
|---|---|---|
| **2.3.x** (the older LTS / teaching install) | CEF 3.3578 = Chromium 71 (measured 2026-09-10 on the `v2.3.3-lts-stable` download) | **Old, and not what designs are built against.** It rejects JavaScript syntax that every current browser accepts, and drops modern CSS silently. See below. |
| **2.4.x** | CEF 117 | **The oldest version NoaCG supports.** Nothing special to do. |
| **2.5.x** | CEF 142 | Current (measured 2026-08-07). |

**On 2.3.x, a page that is too modern does not degrade — it dies silently.** The layer goes on
air showing nothing, and the reason is a `SyntaxError` in a log you have to go looking for. We
hit exactly this on a real 2.3.2 server: the output page was rejected outright with
`Uncaught SyntaxError: Unexpected token ?`, because optional chaining (`?.`) needs Chromium 80.

NoaCG builds for that engine on purpose — the browser output page and everything it loads are
compiled down, and the page carries shims for the APIs 2.3.x lacks. **You do not have to do
anything about this**; it is recorded here because if you write your own template code, or edit
an exported one, the same bar applies to what you write.

If you can choose, run 2.4 or newer. If you cannot, the live route still works on 2.3.x, and
one CSS feature that engine lacks is handled for you: flexbox `gap` (Chromium 84) is parsed and
then ignored there, so a scorebug would air as `HOME3` instead of `HOME 5`. Every export and the
output page carry a small script that puts those gaps back as margins on that engine and does
nothing on any newer one. What is NOT handled is listed in the next section: a design that uses
`color-mix()`, the `inset` shorthand or `backdrop-filter` still renders differently on 2.3.x,
and the export screen tells you which of those your graphic uses.

### The graphic's own CSS is a separate question, and the studio now answers it

Compiling the JavaScript down does not help a **stylesheet**. A CSS declaration an old engine
does not understand is dropped in silence, and what it was painting simply is not there — a
panel background, the spacing between rows, a chip behind each answer. Nothing errors, so the
graphic looks like a design mistake rather than an engine limit. Two catalogue designs were
found on air that way on 2026-08-06.

So every export screen carries a **Playout compatibility** section: one line per playout system
saying whether the graphic renders as designed there, and a "what exactly does it use?" list of
the declarations involved, with the version each one needs. It is measured from the graphic's
own emitted code, so it is right for a template you edited yourself too. It never blocks an
export — a graphic that needs Chromium 111 is completely correct in SPX, in a current OBS
(measured at Chromium 127) and in CasparCG 2.4+. It is **not** correct on an OBS or vMix that
has not been updated since 2023, both of which embed a Chromium 103 engine. The per-system list
on that screen is what tells you which case you are in.

**Which CEF does my server actually have?** The 2.3 line shipped more than one, so the version
number alone does not settle it. Load the production's output URL with `&debug=1` and read the
`engine:` line on the status readout — that is the browser doing the rendering, reporting
itself.

Maintainers: `node scripts/engine-floor.mjs` sweeps the whole catalogue against a chosen engine
(`--engine casparcg-24`, `--chromium 80`) and reports per design and per declaration.

### Playing the cloud output URL

```
CG 1-20 ADD 1 "https://<your-noacg-host>/output?production=<slug>" 1
```

- `1-20` is channel 1, layer 20 — use whatever layer your rundown expects.
- The URL is a **capability**: anyone holding it can render the production, so treat it like a
  password. It does not let the holder operate the show.
- Load it **once**, at the start of the production, and leave it up. Graphics are cued by the
  operator over the command log, not by re-adding the layer.
- Add `&debug=1` while setting up to get a status readout on screen (connected, graphics
  loaded). Take it off before air — it draws over the picture.
- The page recovers by itself. If the machine loses the network, or you restart the layer, it
  rebuilds whatever was on air, without replaying the animations on screen.

### Letting NoaCG load the layer for you

The command above is the whole live link, so NoaCG can send it instead of you typing it into the
CasparCG Client. **Settings -> Playout** holds one server for the whole studio - host, AMCP port,
channel and layer - and the production page then grows a **CasparCG** row beside its output URL
with **Put on air** and **Take off**.

It needs one thing running on the machine you operate from, because a browser cannot open a raw
TCP socket and AMCP is one:

```bash
noacg caspar agent
```

Leave that terminal open. It prints an address and a token to paste into the Playout section, and
it listens on `127.0.0.1` only - CasparCG itself may be any machine on the studio LAN, exactly as
with the Client. **Test connection** round-trips a real AMCP `VERSION` and shows the server's own
version string.

Two practical notes:

- On the hosted studio, Chrome asks once whether `noacg.studio` may reach your local network.
  Answer it and the setting sticks. A self-hosted NoaCG on the studio LAN is never asked.
  Safari refuses this outright - there, use the terminal route below.
- Everything works without any of this. `noacg caspar play --url "<output URL>"` sends the same
  command with no browser involved at all, and loading the URL by hand in the CasparCG Client
  remains exactly as supported as it was.

Full detail, including what was measured and what is deliberately not built: **`docs/CASPARCG_CONNECT.md`**.

### Playing an exported file

Export a graphic with the **CasparCG export** target and you get one self-contained `.html`.
Drop it into the server's `template` folder and load it as a normal HTML template:

```
CG 1-20 ADD 1 "<template-name>" 1 "<templateData>…</templateData>"
CG 1-20 PLAY
CG 1-20 NEXT
CG 1-20 STOP
```

Field data arrives through the usual `templateData` shim, in either JSON or XML form. The file
needs no network at all — fonts and images are inlined.

### Which field is which (FIELDS.md)

A CasparCG client sends values by **id** — `f0`, `f1`, … — and nothing on its screen says what
they mean. So every exported package (all six targets, and both production flavours) ships
**FIELDS.md**: each field's id, its name, its type and its default, plus paste-ready JSON and
`componentData` payloads built from that graphic's own ids. A production package's root
FIELDS.md lists every graphic with the playout layer it was assigned. Keep it open beside the
client; it is the only place the two vocabularies meet.

## 4. OBS Studio

1. **Sources → + → Browser**.
2. For the cloud output: paste the `…/output?production=<slug>` URL.
   For an exported overlay: tick **Local file** and pick the `.html`.
3. Set **Width** and **Height** to the graphic's own resolution (1920 × 1080 unless you chose
   otherwise), and **FPS** to your channel's.
4. Leave the background alone — the page is already transparent.

Two OBS-specific notes:

- **"Shutdown source when not visible"** will tear the page down every time you hide the scene,
  which throws away a cloud output's connection and forces a full rebuild on the way back. Leave
  it **off** for a production output.
- An exported overlay package ships a **local relay + launcher**: double-click
  "Start controller.cmd" (Windows) or "start-controller.command" (macOS; Linux
  `./start-controller.sh`). It serves the folder at `http://localhost:<port>/`, opens the
  operator page, and relays every command through an ordered log — the only route into a
  graphic loaded by OBS/vMix's own browser engine. Point the browser source at the graphic ON
  that address (not the file on disk) and operate from the panel. Fully offline, no installs
  (Windows PowerShell / macOS python3 are OS-bundled).
- Without the launcher, `controlpanel.html` still pairs with the graphic over a **same-origin
  browser channel**: both pages from one http(s) address in one browser (files opened straight
  from `file://` get private origins and can never pair, and the panel says so when nothing
  answers). An OBS **Custom Browser Dock** pointing at the panel on the same local address
  works too. For remote operation use the hosted control page instead.

## 5. vMix

1. **Add Input → More → Web Browser**.
2. URL: the cloud output URL, or the full local path to an exported file
   (`file:///C:/overlays/lower-third.html`).
3. Set the width and height to the graphic's resolution.
4. Use it as an overlay channel input.

## 6. SPX Graphics

SPX is the format NoaCG treats as canonical, so this is the most direct route of all. There are two
ways in, and they answer different questions.

### 6a. The whole production, live (the SPX template file)

An SPX rundown lists template **files** from `ASSETS/templates` - there is nowhere in it to paste a
URL. So a production hands you the URL *as a file*:

1. Open the production, **Links → SPX template → ⬇ Download**. You get one `.html`.
2. Drop it into SPX's `ASSETS/templates/` (a folder of your own inside it is fine).
3. Add it to a rundown like any template. **Play** puts the output frame up, **Stop** takes it down.
4. Cue the graphics from the NoaCG production page, its control link, or a phone - that is what
   drives which graphic is on air, on which layer. The SPX item is the frame, not the rundown.

The file wraps the production's output URL, so it stays correct across re-publishes and needs no
re-download when the graphics change. Two things worth knowing:

- **It carries the output link**, which is a capability: anyone holding the file can render the
  production. Keep it as private as the URL.
- The rundown item's fields let you point it at **another production** (paste a different output
  URL), turn on the `&debug=1` status overlay while setting up, and keep the frame dark until Play.

The same file works in a CasparCG template folder, or as a local file in an OBS/vMix browser
source, for the same reason - nothing in it is SPX-specific except the definition.

### 6b. One graphic, packaged (the SPX export)

1. Export with the **SPX export** target — you get a starter folder.
2. Extract it into SPX's `ASSETS/templates/` directory.
3. Add the template to a rundown. The operator's fields appear automatically; they come from the
   template's own definition.
4. **Play** airs the graphic, **Continue** walks its steps, **Stop** plays it out.

The number of Continue presses is one less than the template's `steps` count — a three-phase
graphic takes two presses before Continue stops doing anything. `docs/SPX_TEMPLATE_FORMAT.md` §2
explains the counting if a rundown disagrees with what you expect.

Fonts travel in the folder, so a machine without the typeface installed still renders correctly.

## 7. When it does not work

| What you see | Usually means | Do this |
|---|---|---|
| Layer is on air, nothing renders, no error anywhere | CasparCG 2.3.x rejected the page's JavaScript | Check the server log for `SyntaxError`. If it is your own template code, remove `?.` and `??`. Upgrading to 2.4+ removes the constraint. |
| Part of the graphic is missing — a panel, a background, the space between rows | The engine dropped a CSS declaration it does not know | Open the graphic's export screen and read **Playout compatibility**; it names the declaration and the version it needs. Upgrading the server, or picking another design, are the two real fixes. |
| Black or white box behind the graphic | The host is forcing an opaque background | Clear any custom CSS setting a background; do not add a chroma key. |
| Graphic looks soft, or is the wrong size | Source dimensions do not match the design | Set the browser source to the graphic's own resolution; resize the source, never the layer. |
| Motion judders | Browser-source FPS does not match the channel | Set the source's FPS to the channel's. |
| Output URL shows "not available" | Wrong slug, or the production was unpublished | Re-copy the URL from the production page. Unpublishing kills the URL on purpose. |
| Cloud output goes blank after a network drop | It is rebuilding | Wait — it recovers on its own, without replaying animations on screen. If it does not, reload the layer. |
| Operator takes a cue and nothing airs | The production is not published | Read the mode strip in the production header. `○ NOT PUBLISHED` means the verbs are driving the page's own PROGRAM monitor and nothing reaches the wire; publish, then take again. `● SHOW` means it did go out, so the fault is downstream: check the renderer status row and the layer. |
| Settings → Playout says the agent is not running | `noacg caspar agent` is not up, or is on another port | Start it and re-copy the address it prints. It must run on the machine with the browser, not on the playout box. |
| It says your browser is asking about local network access | Chrome gates a hosted page reaching `127.0.0.1` | Answer the prompt at the top of the window. If it was dismissed, allow "local network access" for the site in the icon left of the address bar. |
| It says CasparCG did not answer | Nothing is listening on that host and AMCP port | `noacg caspar status` makes the same call from the terminal and takes the browser out of the question. |
| Fonts wrong on the playout machine | An export that could not embed its font | Re-export; NoaCG fails the export rather than shipping a missing face, so this should not happen with a current build. |

## 8. What has actually been tested

Stated plainly, because an integration guide that implies more coverage than it has is worse
than one that admits the gaps.

- **Verified on real hardware** (2026-08-03): the cloud output URL playing in **OBS** and in
  **CasparCG 2.3.2**, at 1920×1080, transparent, surviving a refresh and a kill-and-reopen with
  commands issued while the renderer was down; the hosted control page driving it from a phone;
  two operators agreeing on which cue is live.
- **Verified by the test suite, not on hardware**: the exported packages open and play from
  `file://` with no network, fonts and images inlined; the bundled control panel pairs with
  its graphic over one http origin (and honestly reports the no-listener case elsewhere —
  `file://` pages can never pair, see §4).
- **Not yet verified on hardware**: a CasparCG channel restart under a live output URL; vMix;
  CasparCG 2.4/2.5 (the engine versions in §3 come from the CasparCG changelog, not from a
  machine we have run); and **the CasparCG connection of §3** - its AMCP wire is verified against
  a fake listener and its browser half against a fake agent, but no command has yet reached a real
  server (`docs/CASPARCG_CONNECT.md` §6).

The maintainer's own acceptance checklist is `docs/ACCEPTANCE_SPX_CASPARCG.md`, and
`docs/CLOUD_PLAYOUT.md` §8 carries the live-verify steps for the browser output.
