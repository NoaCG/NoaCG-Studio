# Running NoaCG without leaving vMix: which route, and why

Desk research, 2026-09-30. vMix was not launched for it; the walk on a real vMix is separate work
(`docs/backlog/vmix-trial-walk-and-local-docker.md`), and every claim below that only a running
vMix can settle is marked UNVERIFIED and listed in §5 as a check for that walk. Claims about vMix
link the vMix help page they come from; where the only source is a user forum post, the text says
so. It builds on `docs/PLAYOUT_TARGETS_RESEARCH.md` §1 and does not repeat it.

**The question.** A vMix operator's hands are on vMix: its input bar, its overlay buttons, its
keyboard shortcuts. vMix has no plugins and no docks (research §1.1), so NoaCG cannot put a panel
inside it. What is the smoothest workflow that still lets that operator run a NoaCG production
without switching to another window?

## Answers first

- **Recommended route: the NoaCG output stays on one overlay channel all show, and the Bridge turns
  vMix overlay presses on small NoaCG cue inputs into NoaCG takes and outs.** Each cue in the
  rundown appears in vMix as an invisible input named after the cue. Pressing its Overlay button,
  or any shortcut or trigger that does the same, airs the cue with its animation; pressing it again
  plays the cue out. §3 gives the reasons, §4 the operator's steps and the first build step.
- **The owner's workflow, "a vMix Overlay press read as a NoaCG take while the overlay stays
  active", works only once the two jobs are split.** If the press lands on the NoaCG output input
  itself, it carries one bit (on or off) and cannot say which cue, and pressing it off makes vMix
  remove the picture at once, so no exit animation is ever seen (§2.7). With the output input
  carrying the pixels and staying on, and a separate cue input carrying each press, both problems
  go away.
- **Nothing inside vMix can call NoaCG by itself.** Shortcuts, triggers and web scripting only call
  vMix functions, and the function reference has no function that makes a web request. The one
  way out is VB.NET scripting, which the help reserves for the 4K and Pro editions. So something outside vMix
  must listen, and the documented thing to listen to is the TCP API's activator subscription,
  which pushes overlay changes as they happen. The NoaCG Bridge is that listener.
- **A NoaCG control page can run inside vMix, with limits.** The hosted control page needs no
  login, and vMix lets the operator click in a Web Browser input. Typing needs the input's
  keyboard mode, which switches off every vMix shortcut while it is on, and vMix's Chromium (115
  from vMix 27, by its release notes) is below NoaCG's supported floor of 117. It is a fallback worth trying in the walk, not the route.

## 1. What vMix offers, as documented

| Door | What it can do | What it cannot do | Source |
|---|---|---|---|
| Keyboard and controller shortcuts | Call any vMix function, from keys, MIDI or X-Keys; several functions on one shortcut | Call a URL: the function reference has no web-request function | [Shortcuts](https://www.vmix.com/help29/KeyboardShortcuts.html), [Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html) |
| Input triggers | Run a function when an input goes in or out of output or an overlay (OnTransitionIn/Out, OnOverlayIn/Out, OnCompletion, and others), with a delay of up to 30 s | Anything but a vMix function | [Triggers](https://www.vmix.com/help29/Triggers.html) |
| Web scripting | Run several functions in a row with `Sleep` between them | Anything but a vMix function | [Web Scripting](https://www.vmix.com/help29/WebScripting.html) |
| VB.NET scripting | Call functions, read the XML state, and use .NET classes, `System.Net.WebClient` among them, so a script can call an HTTP address; started from a shortcut with ScriptStart | Run on HD or Basic HD: the help calls scripting a 4K and Pro feature (MAX, and the purchase page's reading of it, UNVERIFIED) | [VB.NET Scripting](https://www.vmix.com/help29/VBNETScripting.html), [Scripting](https://www.vmix.com/help29/Scripting.html), [Scripting and Automation](https://www.vmix.com/help29/ScriptingandAutomation.html) |
| Web Controller | vMix's own page for shortcuts, switching, titles and tally on another device | Host a page of ours: the help describes no way to add one | [Web Controller](https://www.vmix.com/help29/WebController.html) |
| HTTP API (8088) | Every function, and the whole state as XML, overlay channels included | Push anything: it answers requests | [Developer API](https://www.vmix.com/help29/DeveloperAPI.html) |
| TCP API (8099) | FUNCTION, XML, XMLTEXT, and `SUBSCRIBE ACTS`, which pushes activator changes until the connection closes; no authentication is described | Report a shortcut press or a function call as such | [TCP API](https://www.vmix.com/help29/TCPAPI.html) |
| Web Browser input | Show a page with transparency; the page can be clicked "on either the Input window or the Preview/Output"; keyboard on request | Tell the page anything; take typing without disabling shortcuts | [Web Browser](https://www.vmix.com/help29/WebBrowser.html) |
| Dynamic values | SetDynamicValue1 to 4 store a value a shortcut can use later | Be pushed: a forum user reads them from the XML at `//dynamic/value1`, so a listener would have to poll | [Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html), [forum](https://forums.vmix.com/posts/t29539-Vmix-Scripting--How-can-I-get-into-a-variable-a-DynamicValue) |

Three more facts the route depends on:

- **Overlay channels.** An input goes on an overlay from the Overlay 1 to 8 buttons in the input
  bar. The channel's transition "will run forward when the overlay is activated and run in reverse
  when the overlay is closed", and an overlay duration of 0 keeps it up until closed
  ([Overlays](https://www.vmix.com/help29/Overlay2.html)). OverlayInputNIn and OverlayInputNOut put
  a named input on and off a channel, and OverlayInputAllOff switches every overlay off at once
  ([Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)). vMix 29 went
  from four channels to eight and added "shortcuts and activators ... to support additional
  overlays" ([release notes](https://www.vmix.com/software/download.aspx)).
- **Editions.** Basic HD has 4 inputs and 1 overlay channel; HD, 4K, Pro and MAX have 1000 inputs
  and 8 overlay channels ([purchase](https://www.vmix.com/purchase/)).
- **Adding inputs by API.** AddInput takes Video, Image, Photos, Title, VideoList, Colour,
  AudioFile, Flash and PowerPoint, and SetInputName names an input
  ([Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)). Browser is
  not in that list (research §1.3).

## 2. The routes, weighed

Weighed by what the operator does during the show, what it costs to build, and where it breaks.

### 2.1 Shortcuts alone

A vMix shortcut can do anything vMix can, and nothing else. It cannot reach NoaCG, because no
function makes a web request. What a shortcut can do is press an overlay, which makes shortcuts
part of whichever route listens to overlays (§2.7), at no extra cost.

### 2.2 Triggers

A trigger fires a function on an input's own events, overlay in and out among them. For the HTML
overlay export, a trigger calling BrowserReload on OnOverlayIn might replay the entrance each time
the graphic goes on air, with no NoaCG code at all (research §1.8; UNVERIFIED). That serves one
exported overlay without the Bridge; it cannot pick a cue, update a field or play an exit, so it
is a guide paragraph, not the route.

### 2.3 VB.NET scripting

A script can call NoaCG over HTTP, so a shortcut running ScriptStart could take a cue with nothing
installed beside vMix. Against it: the help puts scripting in 4K and Pro only (the exact
gate is UNVERIFIED, research §1.5); each cue would need its own
script holding the production's control capability in plain text inside the vMix preset; and the
operator would have to paste code. The enhanced-security option also "disables dynamic scripting"
([Web Controller](https://www.vmix.com/help29/WebController.html)); whether named scripts keep
working is UNVERIFIED. Rejected as the route: it asks the most of the operator and serves the
fewest editions.

### 2.4 Web Controller and the HTTP API

The Web Controller is vMix's page for another device, so using it is leaving vMix. The HTTP API
answers requests and pushes nothing. Both are how the Bridge acts on vMix (add an input, put it on
an overlay), not how the operator reaches NoaCG.

### 2.5 The TCP API subscription

`SUBSCRIBE ACTS` is the only documented push from vMix, and overlay channels are among its
activators: the TCP API page says the input number can be left blank "for Input, InputPreview and
Overlay1,2,3,4,5,6,7,8" ([TCP API](https://www.vmix.com/help29/TCPAPI.html)). The documented reply
shape is `ACTS OK Input 1 1` (activator, input number, state); the exact line for an overlay event,
and whether it arrives when the transition starts or ends, are UNVERIFIED. There is no event for a
shortcut press or a dynamic value, so the press a listener can hear is an overlay (or preview, or
program) change on an input.

### 2.6 A NoaCG Bridge adapter

The Bridge already runs on the operator's machine, already pairs with the page, and is a separate
process, so vMix's LAN-only default and its enhanced-security option do not block it (research
§1.3; that the TCP API still answers a local client with enhanced security on is UNVERIFIED). It is
the one place that can hold the TCP subscription open for the whole show. Every route that lets a
vMix press drive NoaCG runs through it or through a script (§2.3).

### 2.7 A vMix Overlay press read as a NoaCG take

This is the workflow the owner has in mind. Two readings:

- **The press lands on the NoaCG output input.** The Bridge hears "Overlay 2 on, NoaCG output" and
  takes a cue. But which one? A production is several layers (bug, lower third, ticker) and many
  cues, and a press on one input carries one bit. Worse, pressing it off makes vMix run the
  channel's transition in reverse and remove the input, so NoaCG's exit is cut off whatever the
  Bridge does after hearing it. The earlier plan in `docs/backlog/bridge-vmix-adapter.md` had the
  Bridge send OverlayInputNOut after the exit had "had time to play"; that works for Out pressed in
  NoaCG, not for Out pressed in vMix.
- **The press lands on a cue input, and the output stays on.** The NoaCG output input sits on one
  overlay channel for the whole show, as the cloud output is designed to (it is transparent until
  a take, `docs/CLOUD_PLAYOUT.md` §3). Each cue has its own small input in vMix: a transparent
  image, so it shows nothing even when on an overlay. A press on a cue input says exactly which cue;
  the Bridge takes it through the production's command log, and the graphic animates in inside
  the output input that never left. Pressing the cue input off makes the Bridge play the cue out,
  if that cue is still the one on air on its layer, and the exit is seen because the output is
  still up. The off of a cue that another cue has already replaced changes nothing. vMix's own button shows the cue as lit
  while it is on air, which is the tally the operator already reads.

The second reading is the recommended route (§3).

### 2.8 A NoaCG control page inside vMix

The hosted control page (`?control=<slug>`) needs no login and gives the cue strip, the fields and
the verbs (`docs/CLOUD_PLAYOUT.md` §4), so it can be a Web Browser input today. vMix documents that
the page can be clicked in the Input window or in Preview and Output
([Web Browser](https://www.vmix.com/help29/WebBrowser.html)). Against it as the route:

- typing a name needs the input's keyboard mode, and "When this option is enabled, keyboard
  shortcuts in vMix will no longer be active" (same page);
- vMix 27 moved its browser to Chromium 115 ([release notes](https://www.vmix.com/software/download.aspx));
  28 and 29 name no change, so they are presumably still 115 (UNVERIFIED, research §1.6), below the
  floor of 117 that NoaCG supports (`src/validation/engineSupport.ts`, whose vMix row still says
  103, filed in `playout-engine-facts-and-guide-corrections.md`); the control page has never been
  measured there;
- it is an input, so it renders all show and can be put on air by mistake;
- the Input window's size and whether scrolling works well are unknown; an old forum thread
  reports scrolling only on the scroll bar
  ([forum, 2018](https://forums.vmix.com/posts/t14216-Please-help-me-better-understand-the-features-of-Browser-Input-with-Mouse-enabled)).

It needs no build and helps an operator who wants to click Take without leaving the vMix window, so
it is a walk check (§5) and, if it works, a paragraph in the vMix guide beside the recommended route.

### 2.9 Routes left out

- **Dynamic values as a message channel** (a shortcut sets `noacg take 3`, the Bridge polls the XML
  and clears it): works on every edition but depends on polling and a forum-only XML path, and the
  overlay route does the same job with a documented push and a visible tally.
- **InputPlaying on a short looping clip as the button:** a push as well, but Play is not how a
  vMix operator airs a graphic.
- **One browser input per NoaCG graphic**, each on its own overlay: the press would name the
  graphic, but every exit would still be cut off (§2.7), and every graphic would cost its own
  browser. Rejected.

## 3. The recommendation and its reasons

**Route: the NoaCG output stays on one overlay channel, and the Bridge turns overlay presses on
NoaCG cue inputs into takes and outs through the production's command log.**

- **It is the vMix gesture.** The operator airs a NoaCG cue the way they air a vMix title: its
  Overlay button in the input bar. Everything in vMix that can press an overlay (keyboard
  shortcuts, MIDI and X-Keys controllers, triggers, the Web Controller's switcher) then drives
  NoaCG with no extra work, because the Bridge listens to the result, not to the control.
- **Animations are seen both ways**, because the pixels never leave the air: vMix only moves the
  invisible cue inputs.
- **NoaCG's model stays whole.** The take goes into the same durable command log as a take from the
  production page or a phone (`docs/CLOUD_PLAYOUT.md` §4), so the other surfaces show it, a second
  operator can take the same cue out from a phone, and recovery replays it. The Bridge acts as an
  operator surface, which is why it uses the control capability; the Data API key cannot take, by
  design (`docs/DATA_API.md`).
- **It needs nothing inside vMix but inputs**, so it works on HD and every edition above it, with
  no scripts and no settings changed.
- **What it costs:** a TCP subscription and a cue-to-input map in the Bridge, a way to hand the
  Bridge a production's control link, and the setup that adds the inputs. The playout protocol's
  page-to-Bridge direction is not needed for the first slice.

**One decision in it, recorded so it can be reversed.** The Bridge today stores only its own token
and the servers the page connected to (`docs/BRIDGE.md` §2). This route has it hold a production's
control link, a take-capable capability that cannot be rotated. Chosen: the Bridge keeps it in its
own config file beside its token, it arrives over the paired channel or on standard input and
never in a URL or a command-line argument, and it is forgotten when the production is unlinked.
The alternative, if that boundary is not wanted: the Bridge only reports vMix presses, and a paired
NoaCG page (the production page, or the hosted control page itself) sends the take. That keeps the
capability out of the Bridge but makes every press depend on a page staying open and awake.

**Limits, said plainly:**

- **Basic HD cannot use it**: 4 inputs and 1 overlay channel. It keeps today's route (the output
  on its one overlay, cues taken from NoaCG).
- **Eight overlay channels are a vMix 29 figure.** Before vMix 29 there were four, so on vMix 28
  the output and three layers use every channel.
- **Overlay channels are a budget.** The output uses one. Cues on the same NoaCG layer share a
  channel, so pressing another lower third on that channel replaces the first in vMix as it does in
  NoaCG. A production that holds more layers at once than the channels left free after the
  operator's own vMix overlays cannot give each its own channel; the Bridge mirrors NoaCG's state
  back so the lit buttons stay true (slice 3 in the backlog item).
- **It needs the internet**, like the cloud output. An offline show keeps the exported overlay and
  its local relay (`docs/PLAYOUT_INTEGRATION.md` §4, whose relay notes cover vMix too).
- **Text is edited in NoaCG.** Cues carry their prepared values, so most shows need no typing in
  vMix. A live correction is made on the production page or the phone control link, and Update is
  sent from there.

## 4. What the operator does, and the first build step

### Step by step

Once per machine, as today: install NoaCG Bridge and pair it (`docs/BRIDGE.md` §2).

Once per show:

1. On the production page, **Links, then vMix, then Set up in vMix.** The page hands the Bridge the
   production's control link, and the Bridge adds, through the vMix API:
   - the **NoaCG output** input, a Web Browser input on the production's output URL at the
     production's resolution (if AddInput cannot create a browser input, the page asks the operator
     to add it once and give it that name, and the Bridge finds it);
   - one **cue input** per cue, a transparent image named after the cue, for example
     `NoaCG: Anna, host`;
   - and it shows which overlay channel each NoaCG layer should use (lower thirds on 2, the bug on
     3, and so on), leaving channels the operator already uses alone.
2. In vMix, put **NoaCG output** on its overlay channel and leave it there. The Bridge can do this
   for the operator.

During the show, entirely in vMix:

3. Press **Overlay 2** on `NoaCG: Anna, host` (or the shortcut assigned to it). The lower third
   animates in; the button is lit.
4. Press `NoaCG: Ben, guest` on Overlay 2. vMix swaps the cue inputs, and NoaCG replaces Anna with
   Ben on the same layer, with the graphic's own transition: the Bridge takes Ben and ignores
   Anna's off, because Anna is no longer the cue on air there.
5. Press Ben's lit button again. The lower third animates out, and the button goes dark.
6. The bug on Overlay 3 and a ticker on Overlay 4 stay up independently of the lower thirds.
7. Emergency: OverlayInputAllOff clears the frame at once, output included. Whenever the NoaCG
   output input leaves its overlay, for that or any reason, the Bridge clears every NoaCG layer at
   once, so that putting the output back up brings nothing back with it.

Text corrections, steps (Next) and anything unusual stay on the production page or the phone.

### The first build step

Filed in `docs/backlog/bridge-vmix-adapter.md` as slice 1: **the Bridge hears an overlay press on a
NoaCG cue input and takes or outs that cue through the production's control link, proven against a
fake vMix TCP server.** The Bridge adding the inputs, the page's Set up button, and mirroring
NoaCG's state back onto vMix's buttons are slices 2 and 3. The walk checks in §5 that decide
slice 1's details are marked there, and running them first saves rework.

## 5. Checks for the vMix walk

Only a running vMix answers these. The first five decide slice 1.

1. The exact `SUBSCRIBE ACTS` line for an overlay change (`ACTS OK Overlay2 <input> 1`?), whether
   it arrives when the transition starts or ends, and what a replace on the same channel sends
   (the old input off, then the new one on?).
2. Whether an input's `key` in the XML survives saving and reopening the vMix preset, so the Bridge
   can map cue inputs by key rather than by name.
3. Whether a transparent PNG image input on an overlay shows nothing at all, and what its thumbnail
   looks like in the input bar.
4. Whether the TCP API answers a local client with enhanced security on and a Web Controller
   password set.
5. The delay from an overlay press to the NoaCG graphic starting to animate in the output input,
   through the cloud log, measured over several presses.
6. Whether `AddInput` with `Value=Browser|<url>` creates a Web Browser input, and whether its size
   can be set afterwards.
7. The stacking order of overlay channels (is 8 above 1?), so the guide can say which channel the
   NoaCG output should use.
8. Whether an input's Mouse Click Action ([Input Settings](https://www.vmix.com/help29/InputSettingsGeneral.html))
   can be set to toggle an overlay, so a single click on a cue input's thumbnail airs it.
9. The hosted control page as a Web Browser input: does it render and work on vMix's Chromium, how
   big is the Input window, can Take be clicked there, and how bad is keyboard mode in practice.
10. The measured Chromium version in vMix 29 (`&debug=1` on the output).
11. OnOverlayIn calling BrowserReload on an exported overlay: does the entrance replay cleanly.
12. Whether named VB.NET scripts still run with enhanced security on (only matters for §2.3).
