# Studio day follow-up: server media on any channel, one playout status, the studio kept in the Bridge

Follows the studio test of 2026-10-01 (CasparCG 2.5 through NoaCG Bridge, three productions,
three accounts, one laptop). Builds on [`playout-ready`](../playout-ready/spec.md) (READY,
Prepare for Live, the ping) and keeps its AC-5 (nothing blocks Take because of READY) and AC-7
(old outputs and pages keep working).

## Problem

The core playout path worked all day. What cost time was uncertainty and setup:

- Pictures and graphics showed on the page's monitor but did not air. The monitor renders the
  local production, Take on an unpublished production stays on the page, and the monitor is
  labelled "PROGRAM · ON AIR" either way. A graphic edited in the library never counts as an
  unpublished change, so Prepare for Live can say "Nothing changed" while a publish would send a
  new design. An open output keeps the version it loaded until Prepare for Live or a reload.
- With the Bridge, the READY line stays hidden until an output has reported, so an output that
  never loaded is an absence. Publish, Put on air and the status live in three different places.
- Server media could not obviously be moved between channels: the channel pick is under
  Advanced, and Settings describes a "Graphics" and a "Clips" channel.
- Nothing stops a server clip or template from being played on the NoaCG output's own layer,
  which replaces the output (measured on CasparCG 2.3 and 2.5).
- The studio's server and channels live in one browser's storage, so a second browser or a
  wiped cache starts over, and the pairing step showed no servers used before (Bridge 0.6.0).
- The header's team button sits right of Playout and changes width, so Playout moves.

## Owner decisions (2026-10-01, binding)

1. Server media (video, stills, audio) and server templates get a Channel and a Layer per item.
   NoaCG-rendered graphics stay on the configured NoaCG output slot; rendering NoaCG graphics on
   several channels is not built now.
2. Channels are Channel 1, Channel 2 and so on. NoaCG does not say what a channel is for.
3. The studio setup (server, channels, NoaCG output slot, default channel for new media) is
   remembered in the Bridge, per server.
4. One status control in the header, worst state wins, always with a short text beside the
   colour: grey for intentionally offline (not started), amber for attention needed but not
   broken (unpublished changes, behind, preparation incomplete), green for live, connected and
   healthy, red for something that should work and does not (Bridge lost, output not
   responding, another production on the expected slot, renderer unhealthy). Clicking it opens
   one Playout panel that shows which check caused the state: status first, then the actions,
   then the setup folded once it works, then the browser-output links. The monitor reads
   PROGRAM · ON AIR only when live, else PREVIEW · NOT LIVE. No Go live button yet: publishing,
   putting on air and preparing stay separate presses until the flow is proven.
5. Every publish also prepares the open outputs (the request Prepare for Live sends). Only the
   operator's press triggers it: no timers, no polling, no automatic publishing.
6. Until production starts next week, migrations may be pushed immediately.

## Derived decisions (revertible; each says how to revert)

- **D1. The NoaCG output is one slot, default 1-20,** named "NoaCG output" in Settings (it was the
  "Graphics" channel and layer). Revert: rename the label back.
- **D2. Default layers keep media under the graphics:** a new video or still on layer 10, audio on
  layer 5, a server template on the next free layer above the output's on the output channel.
  A layer above the output's puts media over the graphics. Revert: the constants in `shows.ts`.
- **D3. The output slot is guarded.** A server item set to the output's channel and layer is
  marked in its editor, and its Take is refused with "Layer 20 on Channel 1 is the NoaCG output".
  This is a guard against wiping the output, not a readiness check: it refuses only that slot.
  Revert: drop the check in the take path.
- **D4. New media starts on a neutral default,** "New media" in Settings (it
  was the "Clips" channel). Revert: rename the label back.
- **D5. Unpublished changes are judged by content:** the version hash a publish would write
  (`ver.h`, R2 of `playout-ready`) computed from the current production and library, compared
  with the published one. Revert: the timestamp comparison.
- **D6. Header order keeps primary controls fixed:** variable-width controls sit left of the
  fixed ones. Revert: the order in `ProductionShell`.
- **D7. The Bridge keeps the studio per server** in `caspar-servers.json`, as additive fields on
  each server entry; a page with an older Bridge keeps using browser storage. Revert: the page
  stops reading the fields.
- **D8. Pairing says only what is needed:** one line per step, details behind small info buttons,
  "This computer" offered beside the servers used before, which stay visible, and a visible
  "copy this link for another browser". Revert: the old copy.
- **D9. The hosted page keeps its READY line.** The status's Bridge and slot checks need the
  operator's own Bridge, which lives on the production page only; both pages read the same
  outputs through `useReadinessView`. Revert: render the status control on the hosted page from
  the READY facts alone.
- **D10. Setup in the panel is a one-line summary and a button to the existing Playout settings
  dialog,** folded once the Bridge answers; the header's own Playout button is gone. Revert: put
  the header button back in `ProductionShell`.
- **D11. An empty output slot is red only while no output reports READY:** a studio may air the
  graphics in OBS or vMix and use the Bridge for media alone. Another production on the slot is
  always red once started. Revert: the `readyAny` condition in `control/playoutStatus.ts`.
- **D12. A Bridge too old to read its slot reads grey "Connected",** never green on that alone.
  Revert: count `unreadable` as on air.
- **D13. A graphic that cannot play reads red in the status** and stays amber on READY's own line,
  whose wording is preserved. Revert: drop `broken` from the status facts.
- **D14. Only a re-publish of a started production sends the prepare request,** for the same 60 s
  as Prepare for Live; Start production does not, because the outputs load the first version
  fresh. Put on air and Take off read the slot again at once. Revert: the `wasStarted` condition
  in `publishNow`.

## Behaviour

### AC-1: Every server item has Channel and Layer side by side

A server video, still, audio file or template shows Channel and Layer side by side in its editor,
in the same place for every kind and with nothing to open first. Changing the channel is one pick
from the studio's channel list, as easy as the layer. Judged rendered at 1366 and 390 px wide.

### AC-2: Settings names no channel by purpose

Settings lists the channels as Channel 1, Channel 2 (each may carry a name), one "NoaCG output"
slot (channel and layer), and one "New media" default channel. The words "Graphics channel" and
"Clips channel" are gone from the app and the user guide.

### AC-3: Nothing replaces the NoaCG output by accident

A server item on the output's channel and layer is marked in its editor, and Take refuses it with
a message naming the slot (on the production page: the hosted page lists server cues but never takes
them, since they go through the operator's own Bridge). A new server template never
defaults onto that slot. Every other channel and layer, including layers above the output's on its
channel, plays as chosen.

### AC-4: Server media plays on any channel of a real server

On CasparCG 2.3 and 2.5 through the Bridge: a video, a still and an audio file play on channel 1
and channel 2 at their chosen layers; media under the output's layer sits under NoaCG graphics and
media above it over them; alpha rendered premultiplied composites exactly; Out on a media layer
leaves the output in place. The user guide says to render alpha video premultiplied.

### AC-5: A change a publish would send counts as unpublished

Editing a graphic in the library that the production uses, adding a picture, or changing a cue
marks the production as having unpublished changes; undoing the change clears it. Prepare for
Live publishes such a change instead of saying "Nothing changed".

### AC-6: Header controls stay put

The production page header's Playout, Export and All out keep their positions whether the
production is a team production, a personal one, signed out, or saving. Judged at 1920, 1366 and
1280 px wide.

### AC-7: One status control says whether this production can play

The header shows one control with a colour and a short text, worst state wins: grey "Offline"
(not started) or "Checking…"; amber "Unpublished changes", "Behind: showing v2", "Preparing 3 of
8", "No output connected"; green "Ready · on air 1-20" or "Ready · 2 outputs"; red "Bridge not
running", "CasparCG not answering", "Output not on air", "Another production on 1-20", "Output not
responding", "Not ready: <graphic>". With the Bridge configured and the production started, an
output slot that holds nothing while no output reports reads red, never nothing (D11). Take is
never blocked or delayed by it. The hosted page keeps its READY line over the same outputs (D9).

### AC-8: One Playout panel holds status, actions, setup and links

Clicking the status opens one panel: the checks behind the state first (each green, amber, red or
grey, each saying what to do), then the actions (Start production or Publish changes, Put on air
and Take off, Prepare for Live, Check again), then the server and channel setup, folded once it
works (D10), then the browser-output links. Output links and Playout settings are no longer
separate header controls.

### AC-9: The monitor says whether it is on air

The page's monitor reads PROGRAM · ON AIR when the production is live and PREVIEW · NOT LIVE when
it is not started, so a Take that stays on the page is never mistaken for one on air.

### AC-10: Every publish prepares the open outputs

After Publish changes, each open output that holds the older version prepares the changes and
moves onto the new version when nothing is on air there; with a graphic on air it stays and the
status reads Behind. No output acts without a press.

### AC-11: The studio setup follows the Bridge, not the browser

After the studio's server, channels and output slot are set once, a second browser paired with the
same Bridge, or another account on the same browser, opens with the same setup and no typing. A
laptop used with two servers keeps each server's channels apart.

### AC-12: Pairing is short and remembers servers

The pairing page's server step reads one line ("Enter the IP address of your CasparCG server."),
with the rest behind info buttons; it offers "This computer" and every server used before, also
after it has connected by itself; and it shows how to copy the pairing link into another browser.
The Bridge window says the same.

## Preserved behaviour

Take, Out, Next and All out behave as before; nothing new waits or blocks except the output-slot
guard (D3). READY's wording, Prepare for Live's checks and the ping stay. Old outputs, old pages
and older Bridges keep working; a Bridge without the studio fields leaves the setup in the browser.
A production made in another studio keeps its items' channels and layers.

## Non-goals

NoaCG graphics on several channels (several renderers). A Go live button. Sound tied to an
animation step (research first). Discovering servers on the network. Studio profiles in the
account. Automatic publishing. Reading the channel count from the server (backlog).

## Verification

- Node tests for the slot guard, the default layers, the content hash comparison and the status
  roll-up (every state, worst wins).
- Offline e2e for the editor's Channel and Layer, Settings, the header positions, the status
  control, the Playout panel and the monitor label. Configured e2e on a local stack for publish
  prepares and the status with a real output.
- Real hosts from scratch configs only: CasparCG 2.3 and 2.5 (two channels, AMCP outside
  5180-5298), this checkout's Bridge with a scratch APPDATA, the built-in browser.
- Screenshots judged at desktop and phone width. Evidence in `evidence/`.
- Owner checks: the ATEM DSK's Pre Multiplied Key with premultiplied alpha video over SDI fill and
  key (no hardware here), and the flow in the studio.
