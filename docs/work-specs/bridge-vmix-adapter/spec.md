# vMix as a NoaCG playout target, through NoaCG Bridge

## Problem and authority

An operator who plays out through CasparCG runs the whole show from the NoaCG production page:
the graphics go on air through the output URL on a CasparCG channel, and the rundown's clips play
on a clip channel that feeds the vision mixer. A vMix user has none of that. The output URL works
as a Web Browser input added by hand (measured, `docs/VMIX_ON_A_REAL_HOST.md` §2), the clips are
loaded into vMix by hand, and nothing in the studio knows vMix exists.

Authority: the owner's ask of 2026-10-14. Make vMix a NoaCG playout target through NoaCG Bridge
that an operator uses the way they use CasparCG today: NoaCG is the playout client, vMix is the
mixer. (1) A vMix connection in Settings > Playout and per-production buttons that work like the
CasparCG ones. (2) Graphics on vMix overlay channels, mapped with evidence. (3) Clips and other
inserts as vMix inputs that play files on the vMix computer, the way CasparCG's clip channel
feeds a mixer. (4) Driving NoaCG from vMix's own buttons is out of scope; the design must not
close that door. Invent no new workflow, follow common vMix practice, and make the defaults work
with no setup. Also `docs/GOALS.md` outcome 5 (one production workflow that plays out to every
environment) and [issue #760](https://github.com/NoaCG/NoaCG-Studio/issues/760) (owner,
2026-09-29: "be compatible with vMix in every way we can", before the vMix trial ends about
2026-11-28). The setup follows the CasparCG owner decisions of 2026-09-30 by analogy: connecting
may happen by itself, putting on air never does, nothing is retyped.

This spec replaces the revision of 2026-10-12, which centred on item (4). What still holds from it
(the connection, the failure states, security, the read-back, and the first slice already on
`main`, `evidence/slice-1.md`) is kept below; what is set aside is under **Later**.

## Answers first

- **Graphics: the whole production is one Web Browser input on one overlay channel, the highest
  this vMix has** (8 on vMix 29, 4 on vMix 28, 1 on Basic HD). NoaCG's own layers stay inside that
  page. This is what every graphics tool documented for vMix does (H2R, SPX, Singular, Flowics:
  one browser input on an overlay), it keeps NoaCG's entrances and exits (vMix's own overlay off
  removes the input with no exit, measured), and it costs one input and one browser engine.
- **Clips: one vMix input the Bridge makes, `NoaCG Clips`, a Video List.** NoaCG's Take puts the
  cue's file in it and plays it; the vMix operator cuts to that input the way a vision mixer cuts
  to the CasparCG clip channel. vMix's own Auto Play, Auto Pause and Auto Restart are off on it, so
  it plays what NoaCG took however vMix is cut, exactly as a CasparCG channel does (measured).
  Hold, Loop and Play next are vMix's own list behaviour (measured). Audio files get a second list,
  `NoaCG Audio`, heard whatever is on Program.
- **The files live on the vMix computer**, in one media folder the Bridge lists (default: the
  Windows Videos folder of the user running it). A cue keeps the file's path inside that folder.
- **NoaCG never changes vMix's Program, Preview or transitions.** vMix is the mixer.
- **Five phases**, each one pull request, three Bridge releases. The first release (phase V1)
  gives an operator Load and Unload of the output on vMix from the production page.

## The two models side by side

| | CasparCG | vMix | Source |
|---|---|---|---|
| What NoaCG talks to | a server on the LAN, AMCP on 5250 | vMix on this computer, the TCP API on 8099, no password | measured (`VMIX_ON_A_REAL_HOST.md` §7); documented, [TCP API](https://www.vmix.com/help29/TCPAPI.html) |
| Where things play | channels, each with numbered layers; a layer holds one producer | inputs (a clip, a camera, a browser…); one Program and one Preview; overlay channels drawn over Program | documented, [Overlays](https://www.vmix.com/help29/Overlay2.html), [Cut](https://www.vmix.com/help29/Cut.html) |
| Stacking | a higher layer draws over a lower one | a higher overlay channel draws over a lower one, all over Program | measured (8 over 2 over 1) |
| Places for graphics | any channel and layer | overlay channels: 8 on vMix 29 HD and up, 4 on vMix 24 to 28, 1 on Basic HD | documented, [help29 Overlays](https://www.vmix.com/help29/Overlay2.html), [help28](https://www.vmix.com/help28/Overlay2.html), [KB 164](https://www.vmix.com/knowledgebase/article.aspx/164/why-do-i-only-see-1-overlay-channel-in-vmix) |
| Who mixes | a vision mixer (an ATEM, or the channel itself on a one-channel setup) | vMix: Cut, Fade, Merge, Stinger, the four transition buttons | documented, [Transitions](https://www.vmix.com/help29/Transitions.html) |
| A clip | `PLAY c-l FILE` on a layer | a Video input, or an item of a Video List input, played with `Play` | documented, [Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html); measured (research §1, §5) |
| End of a clip | holds its last frame; `LOOP`; `LOADBG … AUTO` plays the next | pauses on its last frame, state `Completed`; `LoopOn` loops it; a Video List's Auto Next plays the next item | measured (research §5 to §7); documented, [Video List](https://www.vmix.com/help29/VideoList.html), [Loop](https://www.vmix.com/help29/Loop.html) |
| Nothing on a layer | `STOP`, `CLEAR`: empty, black on the mixer | `ListRemoveAll` on a list: black | measured (research §10) |
| A clip starting on a cut | never: the channel plays what it was told | by default yes: Auto Play starts a clip when a transition begins, Auto Pause pauses it when it leaves; per input, `AutoPlayOff` and the rest turn that off | documented, [Options](https://www.vmix.com/help29/Options.html); measured (research §11, §12) |
| Sound | a layer's sound goes out with the channel | an input's sound follows the picture to Program by default (Audio Auto) | measured (research §15, §16) |
| The media library | the server's media folder, listed by its scanner (`CLS`) | none: a file is a path on the vMix computer | documented ([Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html) `AddInput`, `ListAdd` take paths) |
| Reading state | `INFO`, per channel | `XML`: every input's `state` (`Running`, `Paused`, `Completed`), `position` and `duration` in ms, `loop`, `selectedIndex`, the list's items; which input is on which overlay | measured (research §1 to §10) |

## Research findings

Each claim is **measured** (this repository's records), **documented** (the vMix page named) or
**assumed**. `research` is `evidence/research-2026-10-14.md`; `host` is
`docs/VMIX_ON_A_REAL_HOST.md`.

### Graphics

- Measured: the output URL in a Web Browser input on an overlay ran a three-layer production with
  live updates and exits (host §2); `AddInput Value=Browser|<url>` makes that input, type
  `Browser` (host §7), although `Browser` is not in the documented `AddInput` list (documented
  absence, [Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)).
- Measured: vMix's own overlay Out or Off removes the input without NoaCG's exit animation
  (host, answers first). So vMix's overlay buttons must not be how one graphic leaves the air.
- Documented: H2R Graphics ([vMix guide](https://h2r.graphics/docs/how-to-use-with/vmix/)), SPX
  (the "URL for OBS / vMIX" renderer field, [SPX-GC](https://github.com/TuomoKu/SPX-GC)),
  Singular ([vMix article](https://support.singular.live/hc/en-us/articles/360012717332-Singular-and-vMix))
  and Flowics ([vMix integration](https://support.flowics.com/vmix/integrating-graphics-with-vmix))
  all put their whole output in one Web Browser input on an overlay. None names a default
  channel, and no vMix page assigns roles to channels (assumed from absence).
- Documented: 8 overlay channels on vMix 29 HD, 4K, Pro and MAX, 1 on Basic HD; 4 on vMix 24 to
  28 ([help29](https://www.vmix.com/help29/Overlay2.html), [help28](https://www.vmix.com/help28/Overlay2.html),
  [help27](https://www.vmix.com/help27/Overlay2.html)). The XML lists 16 `<overlay>` elements on 29
  (measured), so the count comes from version and edition, as `vmixOverlayCount` does.
- Documented: the 60-day trial has every Pro feature
  ([KB 59](https://www.vmix.com/knowledgebase/article.aspx/59/which-edition-is-the-trial));
  Basic HD has 4 inputs, 1 overlay and no Video List ([purchase](https://www.vmix.com/purchase/)).
- Assumed: a Web Browser input counts as one of the edition's inputs; there is no separate limit.
- Measured: there is no per-layer output page today: the output URL renders every layer, and a
  second output page is a later idea ([issue #767](https://github.com/NoaCG/NoaCG-Studio/issues/767)).

**Recommended mapping for graphics, and why.** One output, one Web Browser input, one overlay
channel, the highest the vMix offers. A layer per overlay channel was rejected: it needs per-layer
output pages NoaCG does not have, an input and a browser engine per layer, more channels than
vMix 28 and Basic HD have (4 and 1), and the only thing it buys is pressing a layer off in vMix,
which kills the exit and is item (4) anyway. The highest channel is the default because higher
channels draw on top (measured), so NoaCG's graphics stay above the operator's own overlays, and
operators fill channels from 1 (assumed: vMix's buttons and every guide above start at 1). The
channel is a setting because an operator who already uses the top channel (a stinger, their own
bug) must be able to move NoaCG below it.

### Clips as inputs

- Documented: `AddInput` takes `Video|<path>` and `VideoList|<path>`; `ListAdd`, `ListRemove`,
  `ListRemoveAll`, `SelectIndex`, `NextItem`, `Play`, `Pause`, `Restart`, `SetPosition` (ms),
  `LoopOn`/`LoopOff`, `AutoPlayOn`/`Off`, `AutoPauseOn`/`Off`, `AutoRestartOn`/`Off`,
  `AutoPlayNextOn`/`Off`, `AudioAutoOn`/`Off`, `AudioOn`/`Off`, `SetVolume`, `RemoveInput`,
  `QuickPlay` ([Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)).
  `AddInput` has no name and returns no key, so the Bridge finds the new input in the XML and
  names it with `SetInputName`, as it already does for the output (measured, slice 1).
- Measured (research §1, §2): `AddInput Value=VideoList|` with no file makes an empty Video List;
  after `ListAdd` its XML `title` is `<name> - <file>` and its `shortTitle` stays the name, so a
  list is found by key, else by `shortTitle`.
- Measured (research §5 to §10): `SelectIndex` and `Play` start an item, with `position` in ms;
  with Auto Next off it ends `Completed` on its last frame; `LoopOn` loops the item; `SelectIndex`
  while playing switches at once (the XML shows it about 0.3 s later); `Pause` and `Play` resume;
  `ListRemoveAll` leaves a black picture and an empty list.
- Measured (research §5): with Auto Next on (vMix's default) the list plays its next item by
  itself, and each switch sends `ACTS OK InputPlaying <n> 0` and `… 1` in the same millisecond. A
  still in a list plays forever (position 0, duration 0).
- Documented: a Video List's Loop plays it "from the beginning when it reaches the end of the
  list" ([Video List](https://www.vmix.com/help29/VideoList.html)). Not measured with Auto Next on.
- Measured (research §3): `ListAdd` of a missing file answers `FUNCTION ER File Not Found: <path>`.
  vMix's `OK` still proves nothing for most functions (host §7), so every verb reads back.
- Measured (research §11, §12): vMix's defaults start a paused clip on a cut to it and pause it on
  a cut away; with `AutoPlayOff`, `AutoPauseOff` and `AutoRestartOff` on the input, cuts change
  nothing, and `Play` runs a clip that is on neither Program nor Preview (§13).
- Documented: there is no "transition on completion" setting; an `OnCompletion` trigger is set in
  vMix's dialog and has no function to create it ([Triggers](https://www.vmix.com/help29/Triggers.html);
  assumed from the function list). Operators send Program back to a camera by hand or with that
  trigger ([forum](https://forums.vmix.com/posts/m24099-Video-remains-paused-on-completion)).
- Documented as forum practice: a VT is its own input, cut or faded to Program with Auto Play
  ([forum](https://forums.vmix.com/posts/t11629--Go-to-the-next-input-after-playback)); broadcast
  automation (Sofie's vMix integration) adds clips with `AddInput` and `SetInputName` and plays
  them with `Play` ([TSR](https://github.com/Sofie-Automation/sofie-timeline-state-resolver/blob/main/packages/timeline-state-resolver/src/integrations/vmix/vMixInputHandler.ts)).
- Measured (research §15, §16): an input's sound follows the picture (muted off Program); with
  `AudioAutoOff` and `AudioOn` an audio list is heard on the master whatever is on Program.
- Documented: Video List is not in Basic HD ([purchase](https://www.vmix.com/purchase/)).
- Assumed: a UNC path works in `ListAdd`; an `http(s)` address does not (a 2017 forum report of
  `File Not Found` for a stream URL, [forum](https://forums.vmix.com/posts/t10730-vMIX-API-AddInput-Stream);
  streams are a separate Stream input, [Stream](https://www.vmix.com/help29/Stream.html)).

**Recommended mapping for clips, and why.** CasparCG's clip channel is one place the vision mixer
cuts to, and NoaCG decides what plays there. Its vMix counterpart is one input NoaCG owns and the
vMix operator cuts to: a Video List, because it is the one vMix input whose file can be changed
over the API (a Video input's file cannot), and its own Auto Next, Loop and end-of-item hold are
the endings NoaCG already offers. A separate input per clip was rejected: it is how vMix users
load VTs by hand, but then a Take that does not touch Program plays where nobody sees it, and a
Take that does cut Program needs an Out that cuts back to a camera NoaCG knows nothing about.
Audio files get their own list for the reason CasparCG gives them layer 5: a sting must never
knock the VT off, and it must be heard while a camera is on Program.

### What NoaCG's clip cues become in vMix

A cue keeps everything the CasparCG one has (its item, endings, folder, the clock), with a vMix
item: `{ adapter: 'vmix', kind: 'media', name: '<path inside the media folder, with />' }` and
its file kind (`movie`, `still`, `audio`) from the Bridge's list. It has no channel or layer: a
movie or a still plays in `NoaCG Clips`, an audio file in `NoaCG Audio`. The verbs:

| NoaCG | vMix, on the player input by key |
|---|---|
| Take | `ListRemoveAll`, `ListAdd` the file, `SelectIndex 1`, `Play`; read back until the item is `Running` |
| At the end: Hold (default) | `AutoPlayNextOff`, nothing more: vMix holds the last frame (`Completed`) |
| At the end: Loop | `LoopOn` |
| At the end: Clear | the Bridge sees `Completed` on its own take and sends `ListRemoveAll` |
| Play next, a Play-through folder | every file added in order, `AutoPlayNextOn`, `SelectIndex 1`, `Play`; the last item's ending as above; Loop the folder is the list's Loop once measured, else the Bridge's runner |
| Change the ending while it plays | `LoopOn` / `LoopOff`, or arming the Clear |
| Pause, Resume | `Pause`, `Play` |
| Out, Clear, All out | `Pause`, `ListRemoveAll` (black) |
| Level | `SetVolume` on the player at the Take, once its curve is measured; refused until then |
| Fade in, fade out, trim | refused with the reason: a list has no per-item transition, and a fade on Program is the vMix operator's transition |

### Where the files must live

On the vMix computer, which is where the Bridge runs. The Bridge lists one **media folder**
(`/list media` with a path inside it, the way the CasparCG picker browses the server's folders),
only files vMix plays as movie, still or audio, never anything outside the folder, and joins the
cue's name to it at the Take. Default: the Videos folder of the Windows user running the Bridge.
The folder is a setting because no vMix setting names one (documented absence) and productions
keep media on a dedicated drive (assumed); the Bridge keeps it per vMix, beside its token, so
every browser paired with it sees the same folder, as it keeps a CasparCG server's studio setup.
A file that is not there is refused by vMix with its path (measured), and the page says so.

### What Load and Unload need beyond studio UI

The Bridge half is on `main` (slice 1, `@noacg/cli` 0.11.0) but in no Bridge download (the latest
is `bridge-v0.9.0`). The studio needs: to read `/health` `adapters` (nothing reads it today), a
target-aware request layer (`targetOf` and `slotOf` in `src/control/playoutLink.ts` return
CasparCG only), the production's title as the item's `label` (the vMix adapter refuses a url
without one), the setup sentences for `not-running` and `not-vmix` (`AgentError.setup` is read
nowhere in `src/`), the `/state` overlays read for the row's state, and a release. No Bridge code
change is needed for phase V1.

### What a fake vMix proves, and what needs the real one

`cli/test/_fakeVmix.mjs` already answers as vMix 29 did. It proves the wire: which lines are sent
in which order, that every `Input=` is a key, refusals before anything is sent, read-back,
`uncertain` on a lost answer, and the parsing of the XML. Extended with a Video List model
(items, `selectedIndex`, `state`, a position that advances on a clock the test controls, Auto
Next, Loop, `File Not Found`) it proves the clips verbs, the readings and the runner's rules. The
studio side is proven against the fake Bridge in `e2e/_fakeBridge.ts`.

Only the real vMix proves what vMix does with them: the picture (`SnapshotInput`), first-frame
delay, the list's Loop with Auto Next on, the `SetVolume` curve, UNC paths, a preset saved with
the players and opened again, and vMix's Chrome rendering the output. The owner's vMix 29 trial on
the development laptop is the host. **The builder runs it, not the owner**, through the TCP and
HTTP APIs, as on 2026-10-12 and 2026-10-14: back up `%APPDATA%\last.vmix` and vMix's
`user.config` first, start vMix, measure, force-close it, put both files back and compare their
SHA-256, leave the background service alone. The owner is asked nothing in any phase; once a
release is out he uses it on his own shows and reports what real use breaks. Editions other than
the trial (vMix 28, Basic HD) cannot be measured here and stay documented only.

## Behaviour

### Settings > Playout: the vMix section

Shown when the paired Bridge lists `vmix` in `/health` `adapters`; with an older Bridge, nothing
about vMix is offered. It holds:

- the connection line: **vMix 29.0.0.49, Trial, 8 overlay channels, on this computer**, from
  `/status` with `{ adapter: 'vmix' }`, or the sentence for the Bridge's `setup` state with
  **Try again** (`/connect`):

  | State | What the Bridge saw | What the page says |
  |---|---|---|
  | `not-running` | nothing listening on the port | vMix is not running on this computer. Start vMix. |
  | `not-vmix` | the port accepts, but no `VERSION OK` greeting within 3 s | Something on port `<port>` is not vMix's TCP API. |

- **NoaCG output**: the overlay channel, a choice of 1 to the vMix's count, default the highest.
  Stored app-wide as `PlayoutSettings.vmix = { overlay? }` (`src/control/playoutLink.ts`); absent
  means the highest. A stored channel above this vMix's count reads as the highest, and the line
  says so.
- **Media folder** (from phase V3): the folder the Bridge lists, its default shown as the path.

The pairing page, after `/pair`, asks for vMix once; when it answers it adds **Connected to vMix
29.0.0.49 on this computer** under the CasparCG lines. Connecting is the greeting and one `XML`
read, so it happens by itself; a vMix that does not answer adds nothing there.

### The production: vMix via Bridge

The Playout panel (`src/components/home/PlayoutPanel.tsx`) gets a **vMix via Bridge** section
beside **CasparCG via Bridge**, with the same parts: the switch, the Bridge row (Download and Pair
when unpaired), and one row **Output on Overlay 8** with its state (on air, off, or holding
another input by its vMix name) and **Load** or **Unload**. Load when the channel holds another
input asks first, as CasparCG does before replacing another production: **Replace "<input>" on
Overlay 8?** The switch follows `casparSwitch`'s rules in its own field (`vmix?` on the output
setup): the operator's choice wins; until then a production with vMix cues, or whose output
profile is vMix, is on; a new one takes the account default. Load sends the output URL named
`vMix Overlay 8` (so the playout status names it) with the production's title as `label`, which
names the input `NoaCG <title>`. First publish loads it when the switch is on, as CasparCG does.

From phase V3 the rundown's **From the playout server…** picker offers **From vMix…** on a
production with the vMix switch on: the media folder, browsed by folder, added as vMix cues. The
cue editor says where it plays (**NoaCG Clips** or **NoaCG Audio**) where a CasparCG cue has its
channel and layer. Every control the CasparCG clip has appears only when `/status` lists the
capability for vMix, as today.

### Target, slot, item and routes (protocol v2, additive)

- target `{ adapter: 'vmix', port? }` (unchanged).
- slot `{ adapter: 'vmix', overlay }` for the output (unchanged) and, new, `{ adapter: 'vmix',
  player: 'clips' | 'audio' }` for the players.
- items: `url` on an overlay slot; `media` on a player slot, `name` the path inside the media
  folder with `/`, never absolute and never with `..`. `template` refused.
- `/list media` with a vmix target and an optional `path`: the folders and media files there, each
  with `kind` `movie`, `still` or `audio` and, for movies and audio, `frames` and `fps` from
  vMix if it can say, else none (the clock then reads the length from `/state`).
- `/studio` with a vmix target keeps `{ mediaFolder }` per vMix port beside the token
  (`vmix-setup.json`), with the players' keys; feature `vmix-media`.
- `/state` with a vmix target answers `VmixStateReply` with, new, `players`: one `SlotState` per
  player, read from its XML (`producer` `video`, `still` or `empty`, `file`, `segment { 0,
  duration }`, `position`, `paused`, `loop`, `sequence`, `instance`, `cueId`, `generation`).
- `capabilities` for vMix: `state`, then `end` and `sequence` once phase V4 lands, `level` once
  measured; never `fade`, `trim` or `image-fit`. Verbs: `take`, `out`, `clear` (V1); `pause`,
  `resume`, `ending` (V2); `sequence` (V4).
- The players are made when first needed: `AddInput Value=VideoList|`, then `SetInputName`
  (`NoaCG Clips`, `NoaCG Audio`), `AutoPlayOff`, `AutoPauseOff`, `AutoRestartOff`,
  `AutoPlayNextOff`; for audio also `AudioAutoOff` and `AudioOn`. Found by the key the Bridge
  kept, else by `shortTitle`, reused when it is a `VideoList`, refused when that name is another
  kind of input. Load also makes the players a production's cues need, so the vMix operator can
  put them on a button before the show.

### Session, failure and security (kept)

- One connection per vMix port, opened by the first request that needs it; a read that finds it
  closed opens a new one and reads again. One action at a time per vMix. A `FUNCTION` whose
  answer never came is `uncertain` and never resent; reads are `unreachable`; each verb has one
  7 s budget. vMix closing reads `not-running` until it is back.
- From phase V2 the Bridge reads a player that holds its own take four times a second while that
  take has an ending to carry out (Clear) or a sequence, like the CasparCG runner, with the slot's
  generation guarding every command it sends by itself; nothing else contacts vMix unasked.
- vMix's TCP API has no authentication; the Bridge connects to `127.0.0.1` only. The Bridge's own
  properties (loopback, token, origin allowlist, no DNS rebinding) are unchanged.
- **New boundary (owner decision 2):** the Bridge reads the local disk for the first time, one
  folder, only media file names, and never a path outside it.
- Preserved: every CasparCG, OGraf and OBS route and reply; the output URL in vMix with no Bridge
  behaves exactly as today; Program, Preview and transitions are never addressed.

## Where the 2026-10-12 spec was wrong or over-built for these priorities

1. **Its centre was item (4).** Cue inputs, the Bridge holding the production's control link,
   `vmix-links.json`, `/vmix/link`, the `SUBSCRIBE ACTS` press handling with its settle window and
   preset-burst rules, and the kept reconnect timer serve driving NoaCG from vMix's buttons, which
   is now out of scope. They also carried the plan's largest security change (a take capability
   that cannot be rotated, stored on the operator's computer). All of it moves to **Later**,
   unbuilt, with its measured facts kept.
2. **Put on air and Take off are called Load and Unload now.** The CasparCG buttons the owner asked
   vMix to match are **Load** and **Unload** (`PlayoutPanel.tsx`, the playout-workflow
   simplification); vMix uses the same words. The owner's wording names the function, not labels.
3. **"Set up in vMix" and the per-layer channel suggestions** are dropped: with no cue inputs there
   is nothing to set up, and the output's channel is the only one NoaCG uses for graphics.
4. **"`template` and `media` are refused"** no longer holds: media on a player slot is phase V2.
5. **"vMix answers OK to everything"** was too strong: `ListAdd` of a missing file answers `ER`
   (measured). The rule stays (read back every effect), and an `ER` is now shown, not swallowed.
6. **A list is found by `shortTitle`, not `title`**, because a list's `title` carries the playing
   file (measured). The output's Browser input keeps `title` = name (measured).
7. **A read right after `SelectIndex` can show the old item** (measured), so the clips verbs read
   back with a short wait, as Put on air already does after `AddInput`.

## Decisions

### Owner decisions (asked 2026-10-14; the run stops before the phase that depends on one still open)

1. **A clip Take does not touch vMix's Program**: it plays in `NoaCG Clips`, and the vMix operator
   cuts to that input, with vMix's Auto Play, Pause and Restart off on it. Recommended: it is the
   CasparCG model the owner named (NoaCG plays, vMix mixes) and the only one with an honest Out.
   The alternative, Take also cuts the clip to Program (vMix's Quick Play, measured to work), suits
   a one-person show but needs a "back to camera" NoaCG cannot know. Depends: V2.
2. **The Bridge lists one media folder on the vMix computer**, default the Windows Videos folder,
   media files only, nothing outside it, the folder chosen in Settings. Recommended: vMix has no
   library of its own, and this keeps the new disk access to one folder. Depends: V2.
3. **No fades or trim for vMix clips in this plan**; level only if `SetVolume` maps to dB.
   Recommended: a Video List has no per-item transition and a fade on Program is the vMix
   operator's transition; GOALS outcome 5 asks for "volume, loop and the other attributes a
   production genuinely needs", which Hold, Loop, Clear, Play next and level cover. Depends: V4.

### Derived (revertible; each says how)

1. One output on the highest overlay channel, a setting to move it (revert: change the default in
   the one function that picks it).
2. Two players by kind, `NoaCG Clips` and `NoaCG Audio`, no per-cue choice (revert: the slot
   already names the player, so a third player is a new value).
3. The media folder and the players' keys are kept by the Bridge, the overlay choice by the
   browser, as CasparCG splits server setup and page preference (revert: move the overlay into
   `vmix-setup.json`).
4. Basic HD: the output works on its one channel; clips are refused with the edition named,
   because it has no Video List (documented).
5. The Bridge, not the page, carries out a Clear at the end and runs sequences, as for CasparCG
   (`BRIDGE.md` §5a: no timer in the page fires a clip).

## Acceptance criteria

### AC-1: The Bridge finds vMix on this computer

Against a fake vMix TCP server in `cli/test` (greeting, `XML` with version, edition, overlays and
inputs, `FUNCTION` answers, `ACTS` lines): `/status` for `{ adapter: 'vmix' }` reports the version
and edition; nothing listening is `not-running`, a port that greets wrongly is `not-vmix` within
3 s; `overlays` is 8 for a vMix 29, 4 for a 28 and 1 for Basic HD; `--vmix-port` is honoured;
`/health` lists `vmix`.

### AC-2: Settings and pairing know vMix

With a Bridge that lists `vmix`: Settings > Playout shows the vMix section with the connection
line, or the `not-running` / `not-vmix` sentence and **Try again**, which connects once vMix
answers; the NoaCG output channel offers 1 to the vMix's count, defaults to the highest, and a
choice survives a reload; the pairing page says it is connected to that vMix. With a Bridge that
does not list `vmix`, nothing about vMix appears anywhere.

### AC-3: Put on air and Take off drive the output input

Put on air creates `NoaCG <title>` as a Browser input on the output URL (or reuses one of that
name) and puts it on the chosen overlay by key; Take off takes it off with the channel's
transition, and sends nothing when the channel holds another input or none; a name held by
another kind of input is refused with nothing changed; Program and Preview are never addressed;
every function that takes an input names it by key.

### AC-4: Load and Unload on the production

On a production with **vMix via Bridge** on, **Load** sends one `take` of the output URL named
`vMix Overlay <n>` with the production's title as `label` on `{ adapter: 'vmix', overlay: n }`;
the row then reads on air from `/state`; **Unload** sends `out` with the same item; a channel
holding another input asks before replacing it and sends nothing on Cancel; a Bridge error with a
`setup` shows its sentence; the switch follows the rules above (operator's choice, vMix cues or a
vMix output profile, account default); the CasparCG section behaves exactly as before.

### AC-5: A Bridge release carries each usable step

Each of phases V1, V3 and V4 lands a `cli/BRIDGE_CHANGELOG.md` section for a version the release
workflow accepts, written for the operator (what was missing, what it does now, what to do), and
the release workflow publishes that version's exe; `docs/BRIDGE.md` describes the vMix adapter as
built so far.

### AC-6: Failure never airs anything twice

A dropped connection mid-function answers `uncertain` and nothing is resent; a function with no
answer is `uncertain`; `FUNCTION ER` is `refused` with vMix's words; vMix closing reads
`not-running` until it is back; a verb vMix cannot honour (`update`, `next`, `template`, a fade, a
trim, a thumbnail) is refused before anything is sent; one connection serves every request; a
command the Bridge sends by itself (a Clear at the end, a sequence step) is dropped unsent once
the player's generation has moved.

### AC-7: The clips player plays what NoaCG takes

Against the fake vMix with a Video List model: a media Take on `{ player: 'clips' }` makes
`NoaCG Clips` once (an empty Video List, named, Auto Play, Pause, Restart and Play Next off) and
reuses it by key, then by `shortTitle`; it sends `ListRemoveAll`, `ListAdd` with the file joined
to the media folder, `SelectIndex 1`, `Play`, every `Input=` a key, and answers only once the XML
shows the item running; Loop sends `LoopOn`; Pause and Resume; the `ending` verb switches Loop
and Hold; Out, Clear and All out send `Pause` and `ListRemoveAll`; a missing file is refused with
vMix's `File Not Found` and its path; Basic HD refuses with the edition named; `/state` reports
the player as a `SlotState` with the file, position and length in seconds, paused, loop, instance,
cueId and generation; Program, Preview and transitions are never addressed. On the real vMix 29:
the same Take, Loop, Hold, Pause, Out, with snapshots of the input showing the clip, its last
frame and black, recorded in the phase's evidence.

### AC-8: The Bridge lists one media folder

`/list media` with a vmix target lists the media folder's subfolders and its movie, still and
audio files (by extension), one level at a time with `path`; a `path` with `..`, an absolute path,
a drive letter or a link leading outside the folder is refused; `/studio` keeps the folder per
vMix port across a Bridge restart, defaulting to the user's Videos folder; nothing outside the
folder is ever listed or played.

### AC-9: vMix clip cues on the production page

With the vMix switch on and a Bridge with `vmix-media`: **From vMix…** browses the media folder
and adds cues; the cue editor shows **NoaCG Clips** or **NoaCG Audio** instead of channel and
layer; Take, Out, Pause, Resume and the clip clock work from the fake Bridge's `/state`, and a
reload puts the playing clip back on its cue by its instance; controls for capabilities vMix does
not list (fade, trim, image fit) are absent or disabled with the reason; Settings shows the media
folder and changes it through `/studio`; CasparCG cues in the same rundown are unchanged.

### AC-10: Play next, folders, Clear at the end, stills and audio

Against the fake vMix: Play next and a Play-through folder add every entry in order with
`AutoPlayNextOn` and play the first, and `/state` names the entry on air and the ones to come; a
Clear at the end sends `ListRemoveAll` once the Bridge's own take reads `Completed`, and nothing
when a newer action moved the generation; a still plays in `NoaCG Clips`; an audio file plays in
`NoaCG Audio`, made with `AudioAutoOff` and `AudioOn`, without touching `NoaCG Clips`; level sends
`SetVolume` by the measured curve or is refused with the reason. On the real vMix 29: a
three-file folder plays through, the Loop the folder behaviour is measured and the spec updated,
an audio file is heard on the master while a camera is on Program, and the `SetVolume` curve is
recorded.

### AC-11: A real vMix round

On the trial's vMix 29, with the released Bridge exe and the production page: a production with
three graphics on its overlay, two clips, a still, a sting and a Play-through folder is loaded,
operated (take, update, out of graphics; take, loop, hold, out of clips while vMix cuts to
`NoaCG Clips`; the sting over a camera) and unloaded, and the record in
`docs/VMIX_ON_A_REAL_HOST.md` §8 says what was seen in vMix's snapshots, with vMix's files restored
byte for byte.

### AC-12: The operator's guide says how

`docs/PLAYOUT_INTEGRATION.md` §5 and the website's vMix guide (`docs.html`) describe Load and
Unload from NoaCG, the overlay choice, the players and the vMix operator's cut to them, the media
folder, and what vMix cannot do here (fades, trim, Basic HD clips); `docs/GOALS.md` outcome 5's
current state names vMix; issue #760 has a summary comment with what remains (Later).

## Phases

Each phase is one pull request, runs `/check` and lands with `/queue-merge`; the builder adds the
next phase's notes under `## Phase notes`. `plan-run` numbers the phases 1 to 5; phase n is Vn,
and evidence files are `evidence/phase-vN.md`. A phase marked **real vMix** has its builder run
vMix 29 on this laptop by the procedure in "What a fake vMix proves"; the owner is asked nothing.
A checker re-runs the fake-based tests and the e2e journeys and reads the builder's real-vMix
evidence; it starts vMix itself only when that evidence is missing or contradicts the code.

1. **V1. Load and Unload on vMix, and the first Bridge download** (AC-2, AC-4, AC-5; AC-1 and AC-3
   are already met by slice 1; **real vMix**: the built exe, Load and Unload from the dev server's
   production page, the snapshot of Program with the output on Overlay 8).
   Files: `src/control/playoutLink.ts` (requests with an explicit target and slot, `adapters` from
   `/health`, `vmix` settings), a new pure `src/control/vmixPlayout.ts` (the default channel, the
   setup sentences, the row's words) with `scripts/vmix-playout.test.mjs`,
   `src/components/PlayoutSettingsPanel.tsx` with a new `VmixSettingsSection.tsx`,
   `src/components/home/PlayoutPanel.tsx` (`VmixSection`), `src/components/home/ProductionPage.tsx`
   (wiring only, no new logic), `src/model/outputSetup.ts` (`vmix?` and its switch rule),
   `src/components/BridgePairPage.tsx`, `src/control/playoutStatus.ts`, `e2e/_fakeBridge.ts` and
   the vMix journeys in `e2e/bridge-connect.spec.ts`, `cli/BRIDGE_CHANGELOG.md` (version 0.11.0 if
   `cli/src/playout` is unchanged since `cli-v0.11.0`, else the next minor in `cli/package.json`),
   `docs/BRIDGE.md` (the vMix adapter table), `docs/PLAYOUT_INTEGRATION.md` §5 (Load from NoaCG),
   `evidence/phase-v1.md`. No change under `cli/src` unless the real round finds one.
2. **V2. The clips player and the media folder in the Bridge** (AC-6, AC-7, AC-8; **real vMix**:
   Take, Loop, Hold, Pause, Out with input snapshots; a UNC path if a share is reachable, else
   recorded as not tried). Stops before starting if owner decisions 1 or 2 are open.
   Files: `cli/src/playout/adapters/vmix.ts` (with a new `vmixPlayers.ts` if it passes 500
   lines), `cli/src/playout/vmixTcp.ts` (list items, `shortTitle`, `state`, `position`,
   `duration`, `selectedIndex`), a new `cli/src/playout/vmixMedia.ts` (the folder, the listing,
   the path rules), `cli/src/playout/server.ts` (`/list`, `/studio`, `/state` for vmix),
   `cli/src/playout/slots.ts` (player keys), `cli/src/playout/protocol.ts` and its mirror
   `src/control/playoutProtocol.ts`, `cli/test/_fakeVmix.mjs` (the Video List model),
   `cli/test/vmix.test.mjs`, a new `cli/test/vmix-media.test.mjs`, `evidence/phase-v2.md`. No
   release: nothing in the studio uses it yet, so no changelog section.
3. **V3. vMix clip cues on the production page, and the second download** (AC-5, AC-9).
   Files: `src/model/shows.ts` (`PlayoutItem.adapter` `'casparcg' | 'vmix'`, additive),
   `src/components/home/PlayoutItemPicker.tsx` and `CueRundown.tsx` (From vMix…),
   `src/components/home/ServerCueEditor.tsx` (where it plays), `src/control/serverPlayout.ts` and
   `src/control/playoutLink.ts` (the item's target and slot from its adapter),
   `src/components/home/ProductionPage.tsx` (wiring only), the media folder line in
   `VmixSettingsSection.tsx`, `e2e/_fakeBridge.ts` and vMix journeys in
   `e2e/playout-cues.spec.ts` and `e2e/playout-clock.spec.ts`, `cli/BRIDGE_CHANGELOG.md`,
   `cli/package.json`, `docs/BRIDGE.md`, `evidence/phase-v3.md`.
4. **V4. Play next, folders, Clear at the end, stills, audio and level** (AC-5, AC-10; **real
   vMix**: a folder plays through, Loop the folder measured, the sting heard over a camera, the
   `SetVolume` curve). Stops before starting if owner decision 3 is open.
   Files: `cli/src/playout/adapters/vmix.ts` or `vmixPlayers.ts`, `cli/src/playout/runner.ts`
   only if Loop the folder needs the runner, `cli/test/_fakeVmix.mjs`, `cli/test/vmix.test.mjs`,
   the capability gating in `src/control/cuePlayback.ts` if a vMix case needs it, vMix journeys
   in `e2e/playout-sequence.spec.ts` and `e2e/playout-folders.spec.ts`, `cli/BRIDGE_CHANGELOG.md`,
   `cli/package.json`, `docs/BRIDGE.md`, `evidence/phase-v4.md`.
5. **V5. The full round and the operator's guide** (AC-11, AC-12; **real vMix**: the round of
   AC-11 with the released exe). Files: `docs/VMIX_ON_A_REAL_HOST.md` §8,
   `docs/PLAYOUT_INTEGRATION.md` §5, `docs.html` (the vMix guide), `docs/GOALS.md` (outcome 5's
   current state, one sentence), `evidence/phase-v5.md`, and the summary comment on issue #760.
   No product code; a defect found becomes a fix in this phase only when small and contained,
   otherwise an issue.

## Readiness

Before V1: this spec and `work.json` on `main`, the "Runnable plans" line present, `origin/main`
green, the owner's window supplied, and vMix 29 trial installed on this laptop (it is, 29.0.0.49,
trial ending about 2026-11-28). Before V2 and V4: the owner decisions they depend on answered.
Before V5: the V4 Bridge release published. Every real-vMix step: vMix not already running (if it
is, the owner is using it: wait, never close it), ffmpeg present for test media (`C:\ffmpeg`).

## Execution settings and how the owner starts this plan

`/plan-run vmix`, sequential, `wave-row` (Opus, high) builders; checkers in fresh sessions. The
start template:

```
/plan-run vmix until <date and time with UTC offset>
```

**Estimate:** about 3 to 4 hours per building phase (V1 to V4) with its check, and 2 hours for V5:
14 to 18 hours of run time, so one window of about 20 hours, or two evenings. It must finish
before the trial ends (about 2026-11-28).

## What the plan can demonstrate, and what stays uncertain

Demonstrable: Load and Unload of the output on vMix from the production page; clips, stills and
audio from the rundown in vMix inputs the vMix operator cuts to, with Hold, Loop, Clear, Play next
and folders; every wire proven against the fake vMix and every picture on vMix 29. Uncertain:
vMix 28 and Basic HD (documented only); first-frame delay of large files on slower machines; the
operator's own presets saved with the players in them (keys survived a preset within and across
sessions for images, measured; not yet for lists).

## Later (not planned, door kept open)

Driving NoaCG from vMix's own buttons (item 4). The 2026-10-12 revision designed it: a transparent
image **cue input** per cue, `SUBSCRIBE ACTS` on the kept connection, a press read as a Take
through the production's command log, with the Bridge holding the production's control link
(`git show edea69c72:docs/work-specs/bridge-vmix-adapter/spec.md`, "The production link the Bridge
holds" to "Decisions"). Nothing in this plan closes it: inputs are found by key, the connection is
one per vMix and can subscribe, the players and the output are inputs vMix buttons can already
press, and the slot shape has room for another kind. Its measured facts stay below. Also later:
mirroring NoaCG's state onto vMix's buttons, Companion
([issue #809](https://github.com/NoaCG/NoaCG-Studio/issues/809)), a second output page per overlay
([issue #767](https://github.com/NoaCG/NoaCG-Studio/issues/767)), fades and trim, thumbnails of vMix
media, setting the Browser input's size by API.

## Measured so far

**On vMix 29.0.0.49, 2026-10-12** (`docs/VMIX_ON_A_REAL_HOST.md` §3 and §7, `evidence/slice-1.md`):
the greeting `VERSION OK 29.0.0.49` about 20 ms after connecting; `XML <n>` counts the body's
UTF-8 bytes, ending `\r\n`; `FUNCTION OK Completed` for an unknown function and for a key no
input has; an unknown command is `<COMMAND> ER Unknown Command`; parameters are URL-decoded;
`OverlayInput<N>Out` and `Off` ignore `Input=`; `AddInput Value=Browser|<url>` makes a `Browser`
input that loads the whole URL; higher overlay channels draw on top (8 over 2 over 1); the XML
lists 16 `<overlay>` elements; keys survive `SavePreset` and `OpenPreset`, also across sessions;
vMix's engine is Chrome 115; a blank session's two `Blank` inputs are replaced by the first inputs
added. For item (4): `SUBSCRIBE ACTS` reports `ACTS OK Overlay<N> <input number> 1` about 2 ms
after the press, a replace as a `0` and a `1` in the same millisecond, an Out about 510 ms later
(at the end of a 500 ms transition), `Off` and `AllOff` at once; opening a preset sends an
`InputPlaying`, `Fullscreen`, `MasterVolume`, `MasterHeadphones` burst, and its overlay lines
about a second later; a transparent PNG on an overlay leaves Program byte-identical.

**On vMix 29.0.0.49, 2026-10-14** (`evidence/research-2026-10-14.md`): the Video List rows quoted
in "Research findings" above.

**Still open on a real vMix:** a Cut (0 ms) overlay transition's timing; enhanced security with a
Web Controller password; the `edition` string of Basic HD and vMix 28's four channels; the Browser
input's size against a production of another resolution; the list's Loop with Auto Next on; a
list item's first-frame delay; UNC paths; the `SetVolume` curve; a preset saved with the players.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found, and
the check's findings.

### Before V1 (the plan, 2026-10-14)

- The vMix adapter's Put on air reads the output input by `title`; that is right for a `Browser`
  input. Players are found by `shortTitle` (a list's `title` changes with its file).
- `PlayoutSettings` has no `vmix` and `targetOf`/`slotOf` are CasparCG-only; `/health`
  `adapters` is parsed into `BridgeReply` and read nowhere; `AgentError.setup` is read nowhere in
  `src/`. Generalise them without changing a CasparCG request byte (the CasparCG journeys in
  `e2e/bridge-connect.spec.ts` must pass unchanged).
- The CasparCG per-production buttons are **Load** and **Unload** (`caspar-put-on-air`,
  `caspar-take-off-air` test ids); give vMix's their own ids (`vmix-load`, `vmix-unload`).
- `ProductionPage.tsx` is already very large; put vMix state and words in `control/` and the panel
  component, and keep the page to wiring.
