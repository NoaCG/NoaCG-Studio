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

**The owner's answers, later on 2026-10-14** (recorded under "Owner decisions"): NoaCG leaves
vMix's Program alone, it only adds graphics and runs clips as inputs, and the directing happens in
vMix; the Bridge reads one media folder on the vMix computer; vMix clips get the same controls as
CasparCG clips (trim, fades, a fade to black or a held last frame at the end, Play next, folders
that play through or loop); a production chooses CasparCG or vMix, and choosing vMix reveals the
vMix controls across the playout system, which must not break CasparCG; the Bridge works for vMix
the way it does for CasparCG (double-click it, the browser opens, pair).

This spec replaces the revision of 2026-10-12, which centred on item (4). What still holds from it
(the connection, the failure states, security, the read-back, and the first slice already on
`main`, `evidence/slice-1.md`) is kept below; what is set aside is under **Later**.

## Answers first

- **A production plays out through CasparCG, vMix or neither: one choice.** Switching vMix on turns
  CasparCG off for that production and reveals the vMix controls (Load and Unload, From vMix…, the
  clip controls); cues made for the other system stay in the rundown, disabled with the reason.
  The choice is routed through one function first, with no visible change, so CasparCG is proven
  unchanged before any vMix control appears (phase V1).
- **Graphics: the whole production is one Web Browser input on one overlay channel, the highest
  this vMix has** (8 on vMix 29, 4 on vMix 28, 1 on Basic HD). NoaCG's own layers stay inside that
  page. This is what every graphics tool documented for vMix does (H2R, SPX, Singular, Flowics:
  one browser input on an overlay), it keeps NoaCG's entrances and exits (vMix's own overlay off
  removes the input with no exit, measured), and it costs one input and one browser engine.
- **Clips: one vMix input the Bridge makes, `NoaCG Clips`, a Video List.** NoaCG's Take puts the
  cue's file in it and plays it; the vMix operator cuts to that input the way a vision mixer cuts
  to the CasparCG clip channel. vMix's own Auto Play, Auto Pause and Auto Restart are off on it, so
  it plays what NoaCG took however vMix is cut, exactly as a CasparCG channel does (measured).
  Audio files get a second list, `NoaCG Audio`, heard whatever is on Program.
- **The same clip controls as CasparCG.** Hold, Loop and Play next are vMix's own list behaviour;
  trim, fades, a fade to black at the end and the level are carried out by the Bridge with vMix's
  `SetPosition`, `SetAlpha`, `SetVolumeFade` and `SetVolume` (all measured to work on the list).
- **The files live on the vMix computer**, in one media folder: the Windows Videos folder until
  the operator presses **Choose folder…**, which makes the Bridge open Windows' own folder picker
  on that computer. The page never sends a path.
- **One NoaCG Bridge for every playout system.** The download is 89 MB, of which 86 MB is the Node
  runtime inside it; the vMix adapter adds about 28 KB. Nothing is chosen at launch: the Bridge
  finds vMix on its own computer and CasparCG at the server the page connects to.
- **NoaCG never changes vMix's Program, Preview or transitions.** vMix is the mixer.
- **Eight phases**, each one pull request, four Bridge releases. The first release (phase V2)
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
| Trim | `SEEK` and `LENGTH` on the `PLAY` | `MarkIn`/`MarkOut` do nothing on a list item; `SetPosition` in ms does | measured (research §17) |
| Fades | `MIX` into a clip; `PLAY … EMPTY MIX` out | no per-item transition in a list; `SetAlpha` 0 to 255 fades the input's picture, `SetVolumeFade` its sound | measured (research §18 to §21) |
| Level | `AF "volume=<gain>"` with the clip | `SetVolume` 0 to 100, gain (fader / 100)^4; `SetGain` 0 to 24 dB above that | measured (research §20); documented (`SetGain`) |
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
  `AutoPlayNextOn`/`Off`, `AudioAutoOn`/`Off`, `AudioOn`/`Off`, `SetVolume`, `SetVolumeFade`,
  `SetGain`, `SetAlpha`, `MarkIn`/`MarkOut`, `RemoveInput`, `QuickPlay`
  ([Function reference](https://www.vmix.com/help29/ShortcutFunctionReference.html)).
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
- Measured (research §17 to §21): `MarkIn` and `MarkOut` do nothing on a list item; `SetAlpha`
  fades the list's picture on Program to black and 26 calls take 21 ms; `SetVolume` follows a
  fourth-power curve (50 is 6.25 % gain); `SetVolumeFade` fades the sound by itself.
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
endings NoaCG already offers. A separate input per clip was rejected: it is how vMix users load
VTs by hand, but then a Take that does not touch Program plays where nobody sees it, and a Take
that does cut Program needs an Out that cuts back to a camera NoaCG knows nothing about. Audio
files get their own list for the reason CasparCG gives them layer 5: a sting must never knock the
VT off, and it must be heard while a camera is on Program.

### What NoaCG's clip cues become in vMix

A cue keeps everything the CasparCG one has (its item, endings, trim, fades, level, folder, the
clock), with a vMix item: `{ adapter: 'vmix', kind: 'media', name: '<path inside the media folder,
with />' }` and its file kind (`movie`, `still`, `audio`) from the Bridge's list. It has no
channel or layer: a movie or a still plays in `NoaCG Clips`, an audio file in `NoaCG Audio`.

| NoaCG | vMix, on the player input by key |
|---|---|
| Take | `LoopOn` or `LoopOff` as the cue's ending says, and `AutoPlayNextOff` (both are settings of the input, not of an item, so every Take sets both, measured: research §7); `SetAlpha 255` and the level unless the cue fades in; `ListAdd` the file, `SelectIndex` to it, `SetPosition` to its in point when trimmed, `Play`; read back until that item is `Running`; then `ListRemove` the items before it. Replacing in that order keeps the old clip on screen until the new one plays, as CasparCG's `PLAY` does, where `ListRemoveAll` first would flash black (measured, research §8 and §10); V3 measures it, and falls back to `ListRemoveAll` first if removing earlier items disturbs the one playing |
| Fade in | the Take starts at `SetAlpha 0` and volume 0, then the Bridge steps `SetAlpha` up once per frame and sends `SetVolumeFade` to the cue's level over the fade. One input shows one file, so a fade in from a clip that was playing goes through black, where CasparCG's `MIX` crossfades |
| Trim | in point: `SetPosition` before `Play`; out point: the Bridge's clip timer acts there (below), since marks do nothing on a list (measured) |
| At the end: Hold (default) | untrimmed: vMix holds the last frame (`Completed`); trimmed: `Pause` at the out point |
| At the end: Loop | untrimmed: `LoopOn`; trimmed: `SetPosition` back to the in point at the out point |
| At the end: Clear | `ListRemoveAll` at the end; with a fade out, the Bridge steps `SetAlpha` to 0 and sends `SetVolumeFade` to 0 over the fade so that it ends at the end: a fade to black |
| Play next, a Play-through folder | every file added in order and played by the Bridge's runner, one after another, each with its own trim, fade in and level; untrimmed entries with no fade may use the list's Auto Next; Loop the folder starts the first again after the last |
| Change the ending while it plays | `LoopOn` / `LoopOff` for an untrimmed clip, else the clip timer's ending; arming a Clear |
| Pause, Resume | `Pause`, `Play` (the clip timer pauses with it) |
| Out, Clear, All out | `Pause`, `ListRemoveAll` (black); Out with a fade out fades first, as above |
| Level | at or below 0 dB: `SetVolume` 100 x 10^(L/80) (measured curve); above 0 dB: `SetVolume 100` and `SetGain` L (documented, measured in V6) |

**The clip timer.** CasparCG ends a trimmed clip by itself (`LENGTH`), and a fade by itself
(`MIX`). vMix does neither for a list item, so the Bridge does what the CasparCG runner already
does for sequences: while its own take is on a player and has an out point, a fade or a sequence,
it reads the player's position (the XML, at most four times a second, and a single value with
`XMLTEXT` between them if that is lighter) and schedules the next step from the last reading, so
the step lands within a frame or two of its time (assumed; V6 measures how close). Every step it
sends by itself is dropped once the player's generation has moved.

**A file's length.** The page needs each file's length for the clock's "TO STUDIO" and refuses a
sequence member without one (`sequenceMembers`, `src/control/serverPlayout.ts`; `SequenceEntry
.media.seconds`). vMix reports the length of the item that is selected and of nothing else
(measured, research §5), so the Bridge reads it from the file itself when it lists the folder:
the `mvhd` box of an MP4 or MOV and the header of a WAV, which needs no tool beside the Bridge;
any other file is listed with no length and can play on its own, but not in a sequence.

### Where the files must live

On the vMix computer, which is where the Bridge runs. The Bridge lists one **media folder**
(`/list media` with a path inside it, the way the CasparCG picker browses the server's folders),
only files vMix plays as movie, still or audio, never anything outside the folder, and joins the
cue's name to it at the Take. A file that is not there is refused by vMix with its path
(measured), and the page says so.

**How the folder is chosen** (owner, 2026-10-14: one folder, chosen how?). CasparCG's folder is
named in its own configuration; vMix has none (documented absence). So:

- **Default: the Windows Videos folder** of the user running the Bridge, where Windows and most
  users already keep clips, so a clip there shows in **From vMix…** with no setup.
- **Choose folder…** in Settings asks the Bridge to open Windows' own folder picker on that
  computer, where the operator sits (the Bridge only listens on that computer). The choice is kept
  by the Bridge per vMix, beside its token, so every browser paired with it sees the same folder,
  as it keeps a CasparCG server's studio setup. **The page never sends a path**: a paired page can
  ask for the picker and read the folder's contents, never point the Bridge somewhere itself.
- If the Bridge cannot open the picker (V3 measures it from the unsigned exe; it is a PowerShell
  `FolderBrowserDialog` child process), the Bridge's own window asks for the folder instead, as it
  already offers a pairing link there, and the page says where to look.

### What Load and Unload need beyond studio UI

The Bridge half is on `main` (slice 1, `@noacg/cli` 0.11.0) but in no Bridge download (the latest
is `bridge-v0.9.0`). The studio needs: to read `/health` `adapters` (nothing reads it today), a
target-aware request layer (`targetOf` and `slotOf` in `src/control/playoutLink.ts` return
CasparCG only), the production's title as the item's `label` (the vMix adapter refuses a url
without one), the setup sentences for `not-running` and `not-vmix` (`AgentError.setup` is read
nowhere in `src/`), the `/state` overlays read for the row's state, and a release.

One Bridge gap: Load (the adapter's Put on air) reuses an existing `NoaCG <title>` Browser
input by its name alone (`cli/src/playout/adapters/vmix.ts`), so two productions with one title
share an input, and an input made from a development server keeps that address. V2 fixes it by
identity, not by title: the output address carries the production's slug, which is stable and
unique, so the Bridge remembers the key of the input it made for each address (without the
`&name=` part) in `vmix-outputs.json` beside its token. Load and Unload find the output by that
key, so a renamed production still unloads and its input is renamed to the new title. An input
of the same name that the Bridge did not make for this address is never reused: Load adds a new
input named `NoaCG <title> (2)`. A key vMix no longer lists (a new session with another preset)
is forgotten, and Load adds the input again. If vMix's XML turns out to name a Browser input's
address (V2 measures it), that check is added; it is not relied on.

### One Bridge for every playout system

Owner, 2026-10-14: separate downloads per system if one exe grows large, else one. Measured: the
0.9.0 exe is 89 MB (`gh release view bridge-v0.9.0`), and the Node runtime inside it is 86 MB
(`node.exe` 24.13.0); the vMix adapter and its TCP layer are about 28 KB of source beside 38 KB
for CasparCG's. So one exe stays: a second download would add 86 MB for kilobytes of difference,
double the releases, the unsigned-exe warnings and the pairings, and a studio that has both
CasparCG and vMix would run two Bridges. Nothing is chosen when the Bridge starts: it answers for
vMix on its own computer and for CasparCG at the address the page connects to, and the
production's choice decides which the page uses. Double-clicking it opens the pairing page, as
today.

### What a fake vMix proves, and what needs the real one

`cli/test/_fakeVmix.mjs` already answers as vMix 29 did. It proves the wire: which lines are sent
in which order, that every `Input=` is a key, refusals before anything is sent, read-back,
`uncertain` on a lost answer, and the parsing of the XML. Extended with a Video List model
(items, `selectedIndex`, `state`, a position that advances on a clock the test controls, Auto
Next, Loop, alpha and volume, `File Not Found`) it proves the clips verbs, the readings, the clip
timer and the runner's rules. The studio side is proven against the fake Bridge in
`e2e/_fakeBridge.ts`.

Only the real vMix proves what vMix does with them: the picture (`Snapshot`, `SnapshotInput`),
first-frame delay, how close the clip timer lands, the smoothness of an alpha fade, the list's
Loop with Auto Next on, `SetGain`, UNC paths, a preset saved with the players and opened again,
the folder picker from the unsigned exe, and vMix's Chrome rendering the output. The owner's vMix
29 trial on the development laptop is the host. **The builder runs it, not the owner**, through
the TCP and HTTP APIs, as on 2026-10-12 and 2026-10-14: back up `%APPDATA%\last.vmix` and vMix's
`user.config` first, start vMix, measure, force-close it, put both files back and compare their
SHA-256, leave the background service alone. The owner is asked nothing in any phase; once a
release is out he uses it on his own shows and reports what real use breaks. Editions other than
the trial (vMix 28, Basic HD) cannot be measured here and stay documented only.

## Behaviour

### The production: one playout system

The production's output setup already holds the CasparCG switch (`caspar?` in
`src/model/outputSetup.ts`, read through `casparSwitch` in six files: `ProductionPage.tsx` in 14
places, `CueRundown.tsx`, `PlayoutSettingsDialog.tsx`, `RundownColors.tsx`, `playoutStatus.ts`,
`DefaultOutputPreference.tsx`). It gains `vmix?`, and one function, `playoutSystem`, answers
`'casparcg'`, `'vmix'` or `null` for a production, so every place that asks "is CasparCG on" asks
it the same way and a vMix branch has one place to start:

- the operator's choice wins; switching one on switches the other off, stored together;
- until the operator chooses: CasparCG exactly as `casparSwitch` decides today (a CasparCG
  destination, server cues, the account default, legacy activity); vMix only for a production
  that already has vMix cues. The older `vmix` output profile does not turn vMix on: it means a
  Browser input added by hand, and loading a second one over it would double the graphics. There
  is no account default for vMix;
- a cue for the system that is not chosen stays in the rundown, disabled with the reason ("This
  cue plays on CasparCG; this production plays out through vMix"), as a server cue is today when
  CasparCG is off.

### The production: vMix via Bridge

The Playout panel (`src/components/home/PlayoutPanel.tsx`) gets a **vMix via Bridge** section
beside **CasparCG via Bridge**, with the same parts: the switch, the Bridge row (Download and Pair
when unpaired, Update when the paired Bridge has no `vmix` in `/health` `adapters`), and one row
**Output on Overlay 8** with its state (on air, off, or holding another input by its vMix name)
and **Load** or **Unload**. Load when the channel holds another input asks first, as CasparCG does
before replacing another production: **Replace "<input>" on Overlay 8?** Load sends the output
URL named `vMix Overlay 8` (so the playout status names it) with the production's title as
`label`, which names the input `NoaCG <title>`. First publish loads it only when the operator has
switched vMix on, as CasparCG does when its switch is on.

With vMix chosen, the rundown's **From the playout server…** picker offers **From vMix…**: the
media folder, browsed by folder, added as vMix cues. The cue editor says where it plays
(**NoaCG Clips** or **NoaCG Audio**) where a CasparCG cue has its channel and layer, and offers
the same clip controls (At the end, fades, trim, level) as for CasparCG, each shown only when
`/status` lists its capability for vMix, as today.

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
- **Media folder** (from phase V4): the folder the Bridge lists, as a path, and **Choose folder…**.

The pairing page, after `/pair`, asks for vMix once; when it answers it adds **Connected to vMix
29.0.0.49 on this computer** under the CasparCG lines. Connecting is the greeting and one `XML`
read, so it happens by itself; a vMix that does not answer adds nothing there.

### Target, slot, item and routes (protocol v2, additive)

- target `{ adapter: 'vmix', port? }` (unchanged).
- slot `{ adapter: 'vmix', overlay }` for the output (unchanged) and, new, `{ adapter: 'vmix',
  player: 'clips' | 'audio' }` for the players.
- items: `url` on an overlay slot; `media` on a player slot, `name` the path inside the media
  folder with `/`, never absolute and never with `..`. `template` refused.
- `/list media` with a vmix target and an optional `path`: the folders and media files there, each
  with `kind` `movie`, `still` or `audio` and, for MP4, MOV and WAV, the length the Bridge read
  from the file (as `frames` and `fps`, the fields the page already reads); other files have none.
- `/studio` with a vmix target answers `{ mediaFolder }` and never takes one; `/vmix/choose-folder`
  (token) opens the picker on that computer and answers the folder chosen, or that it was
  cancelled. The folder and the players' keys are kept per vMix port in `vmix-setup.json` beside
  the token. Feature `vmix-media`.
- `/state` with a vmix target answers `VmixStateReply` with, new, `players`: one `SlotState` per
  player, read from its XML (`producer` `video`, `still` or `empty`, `file`, `segment` (the trim,
  else `{ 0, duration }`), `position` within it, `paused`, `loop`, `sequence`, `instance`,
  `cueId`, `generation`), with a new optional `player` naming it and `layer` 0, so the required
  field keeps its meaning for every CasparCG reading. A vMix `PlayoutItem` likewise keeps `layer`
  0 and no `channel`, so a stored item stays valid for an older page.
- `capabilities` for vMix: `state` (V2); `end` (V3); `fade`, `trim`, `level` (V6); `sequence` (V7);
  never `image-fit` (vMix scales a still itself). Verbs: `take`, `out`, `clear` (V2); `pause`,
  `resume`, `ending` (V3); `sequence` (V7). Features `sequence-loop` and `ending` apply as today.
- The players are made when first needed: `AddInput Value=VideoList|`, then `SetInputName`
  (`NoaCG Clips`, `NoaCG Audio`), `AutoPlayOff`, `AutoPauseOff`, `AutoRestartOff`,
  `AutoPlayNextOff`; for audio also `AudioAutoOff` and `AudioOn`. Found by the key the Bridge
  kept, else by `shortTitle`, reused when it is a `VideoList`, refused when that name is another
  kind of input. Load also makes the players a production's cues need, so the vMix operator can
  put them on a button before the show.

### Session, failure and security

- One connection per vMix port, opened by the first request that needs it; a read that finds it
  closed opens a new one and reads again. One action at a time per vMix. A `FUNCTION` whose
  answer never came is `uncertain` and never resent; reads are `unreachable`; each verb has one
  7 s budget. vMix closing reads `not-running` until it is back.
- From phase V6 the Bridge's clip timer and from V7 its runner read a player that holds its own
  take while that take has an out point, a fade or a sequence, like the CasparCG runner (which
  today ends every sequence that is not on a CasparCG slot, `cli/src/playout/runner.ts`), with the
  slot's generation guarding every command it sends by itself; nothing else contacts vMix unasked.
- vMix's TCP API has no authentication; the Bridge connects to `127.0.0.1` only. The Bridge's own
  properties (loopback, token, origin allowlist, no DNS rebinding) are unchanged.
- **New boundary:** the Bridge reads the local disk for the first time: folder and media file
  names under the one folder the operator picked on that computer (or the Videos folder), never a
  path a page sent, never a path outside the folder, never a file's contents beyond a media
  header's length.
- Preserved: every CasparCG, OGraf and OBS route and reply; every CasparCG request the page sends,
  byte for byte; the output URL in vMix with no Bridge behaves exactly as today; Program, Preview
  and transitions are never addressed.

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
4. **"`template` and `media` are refused"** no longer holds: media on a player slot is phase V3.
5. **"vMix answers OK to everything"** was too strong: `ListAdd` of a missing file answers `ER`
   (measured). The rule stays (read back every effect), and an `ER` is now shown, not swallowed.
6. **A list is found by `shortTitle`, not `title`**, because a list's `title` carries the playing
   file (measured). The output's Browser input keeps `title` = name (measured).
7. **A read right after `SelectIndex` can show the old item** (measured), so the clips verbs read
   back with a short wait, as Put on air already does after `AddInput`.
8. **It treated vMix as a target beside CasparCG, not instead of it.** It never said how a
   production chooses, and it left the studio's 14 `casparOn` checks in `ProductionPage.tsx` as
   they were. The owner's answer (one choice) gets its own phase, V1, so the playout system is
   changed with nothing else and proven unchanged for CasparCG first.

## Decisions

### Owner decisions (2026-10-14)

1. **NoaCG leaves vMix's Program alone.** A clip Take plays in `NoaCG Clips`, and the directing
   happens in vMix: the vMix operator cuts to that input, with vMix's Auto Play, Pause and Restart
   off on it. (Answered: yes.)
2. **The Bridge reads one media folder on the vMix computer.** (Answered: yes; how it is chosen was
   left to this plan: the Videos folder until **Choose folder…** opens Windows' picker on that
   computer, and the page never sends a path. Revert: a typed path in Settings is one field and
   one route.)
3. **vMix clips get the same controls as CasparCG clips**: trim, fade in and out, a fade to black
   or a held last frame at the end, Loop, Clear, level, Play next, folders that play through or
   loop, and changing the ending while it plays. (Answered: yes, reversing this plan's first
   recommendation to leave fades and trim out.)
4. **A production plays out through one system: CasparCG, vMix or neither.** Choosing vMix reveals
   the vMix controls and turns CasparCG off for that production; the other system's cues stay,
   disabled with the reason. (Answered: one choice, over two independent switches.)
5. **One Bridge exe for every playout system**, on the owner's own rule (separate only if one grows
   large), measured above. (Decided here on that rule; revert: a build flag in
   `cli/scripts/build-bridge-exe.mjs` could leave adapters out of a second exe.)

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
5. The Bridge, not the page, carries out every timed step (an out point, a fade, a Clear at the
   end, the next file), as for CasparCG (`BRIDGE.md` §5a: no timer in the page fires a clip).
6. A fade into a clip that replaces another goes through black, because one input shows one file
   (revert: an A/B pair of clip players, a later design).

## Acceptance criteria

### AC-1: The Bridge finds vMix on this computer

Against a fake vMix TCP server in `cli/test` (greeting, `XML` with version, edition, overlays and
inputs, `FUNCTION` answers, `ACTS` lines): `/status` for `{ adapter: 'vmix' }` reports the version
and edition; nothing listening is `not-running`, a port that greets wrongly is `not-vmix` within
3 s; `overlays` is 8 for a vMix 29, 4 for a 28 and 1 for Basic HD; `--vmix-port` is honoured;
`/health` lists `vmix`.

### AC-2: One playout system per production, CasparCG unchanged

`playoutSystem` answers `'casparcg'`, `'vmix'` or `null` for every stored output setup (CasparCG
on, off and unset; a CasparCG destination; server cues; legacy activity; the account default;
vMix on; vMix cues; the older `vmix` profile), proven by a Node test; storing one choice clears the
other; every place that read `casparSwitch` reads the choice through it; and every CasparCG
journey (`e2e/bridge-connect.spec.ts`, `e2e/playout-cues.spec.ts`, `e2e/playout-sequence.spec.ts`,
`e2e/playout-clock.spec.ts`, `e2e/playout-folders.spec.ts`) passes with no change to the spec
files, with nothing about vMix visible yet.

### AC-3: Settings and pairing know vMix

With a Bridge that lists `vmix`: Settings > Playout shows the vMix section with the connection
line, or the `not-running` / `not-vmix` sentence and **Try again**, which connects once vMix
answers; the NoaCG output channel offers 1 to the vMix's count, defaults to the highest, and a
choice survives a reload; the pairing page says it is connected to that vMix. With a Bridge that
does not list `vmix`, Settings and the pairing page show nothing about vMix, and the panel's vMix
switch offers Update.

### AC-4: Load and Unload drive the output input

Load (the adapter's Put on air) creates `NoaCG <title>` as a Browser input on the output URL (or
reuses the one the Bridge made for this address, by the key it kept) and puts it on the chosen
overlay by key; Unload (Take off) takes it off with the channel's transition, and sends nothing
when the channel holds another input or none; Program and Preview are never addressed; every
function that takes an input names it by key. Two productions with one title get two inputs
(`(2)` on the second); a production renamed while loaded still unloads, and its input takes the
new name; an input the Bridge did not make for this address is never reused; a kept key vMix no
longer lists is forgotten and the input made again.

### AC-5: Load and Unload on the production

Choosing **vMix via Bridge** turns CasparCG off for the production and back; **Load** sends one
`take` of the output URL named `vMix Overlay <n>` with the production's title as `label` on
`{ adapter: 'vmix', overlay: n }`; the row then reads on air from `/state`; **Unload** sends `out`
with the same item; a channel holding another input asks before replacing it and sends nothing on
Cancel; a Bridge error with a `setup` shows its sentence; first publish loads only when the
operator switched vMix on; with vMix chosen, a CasparCG cue is disabled with the reason.

### AC-6: A Bridge release carries each usable step

Each of phases V2, V5, V6 and V7 lands a `cli/BRIDGE_CHANGELOG.md` section for a version the
release workflow accepts, written for the operator (what was missing, what it does now, what to
do), and the release workflow publishes that version's exe; `docs/BRIDGE.md` describes the vMix
adapter as built so far. V2 releases 0.12.0 (its output identity changes the Bridge, and npm
already shipped 0.11.0); its section covers every Bridge change since 0.9.0, which is the vMix
adapter. Every version is bumped the way `Release @noacg/cli 0.11.0` (`2128d984d`) did, every
file it touched, with a `cli/CHANGELOG.md` section (`cli/test/release-notes.test.mjs` requires one).

### AC-7: Failure never airs anything twice

A dropped connection mid-function answers `uncertain` and nothing is resent; a function with no
answer is `uncertain`; `FUNCTION ER` is `refused` with vMix's words; vMix closing reads
`not-running` until it is back; a verb vMix cannot honour (`update`, `next`, `template`, an image
fit, a thumbnail) is refused before anything is sent; one connection serves every request.

### AC-8: The clips player plays what NoaCG takes

Against the fake vMix with a Video List model: a media Take on `{ player: 'clips' }` makes
`NoaCG Clips` once (an empty Video List, named, Auto Play, Pause, Restart and Play Next off) and
reuses it by key, then by `shortTitle`; every Take sets `LoopOn` or `LoopOff`, `AutoPlayNextOff`
and full alpha, adds the file joined to the media folder, selects it, sends `Play`, answers only
once the XML shows that item running, and then removes the items before it; a Hold after a Loop
sends `LoopOff`; Pause and Resume; the `ending` verb switches Loop and Hold; Out, Clear and All
out send `Pause` and `ListRemoveAll`; an audio file plays in `NoaCG Audio`, made with
`AudioAutoOff` and `AudioOn`, without touching `NoaCG Clips`; a still plays in `NoaCG Clips`; a
missing file is refused with vMix's `File Not Found` and its path; Basic HD refuses with the
edition named; `/state` reports each player as a `SlotState` with `player`, the file, position
and length in seconds, paused, loop, instance, cueId and generation; every `Input=` is a key;
Program, Preview and transitions are never addressed. On the real vMix 29: the same Take, Loop,
Hold, Pause and Out, a Take while a clip plays, and a sting heard over a camera, with snapshots
showing the clip, its last frame, the replacement without a black frame (or the fallback
recorded) and black after Out, in the phase's evidence.

### AC-9: The Bridge lists the media folder the operator picked

`/list media` with a vmix target lists the media folder's subfolders and its movie, still and
audio files (by extension), one level at a time with `path`, with the length read from MP4, MOV
and WAV headers; a `path` with `..`, an absolute path, a drive letter or a link leading outside the
folder is refused; the folder is the user's Videos folder until `/vmix/choose-folder` sets
another from the picker, and survives a Bridge restart; no route takes a folder path from a page;
nothing outside the folder is ever listed or played. On this laptop: the picker opens from the
built exe and its choice is listed, or the Bridge-window fallback is built and recorded.

### AC-10: vMix clip cues in the rundown

With vMix chosen and a Bridge with `vmix-media`: **From vMix…** browses the media folder and adds
cues as vMix items (`layer` 0, no channel); the cue editor shows **NoaCG Clips** or
**NoaCG Audio** instead of channel and layer; Take, Out, Pause and Resume send the vMix target and
player slot; Settings shows the media folder and **Choose folder…**; CasparCG cues in the same
rundown are disabled with the reason and send nothing.

### AC-11: The clip clock and a reload

From the fake Bridge's vMix `/state`: the page polls the players its cues use, the clip clock
counts down a vMix clip, the row says on air and `replaced` when the player holds what this
Bridge did not start, and a reload puts the playing clip back on its cue by its instance; a
reading older than the last accepted action is ignored, as for CasparCG.

### AC-12: Trim, fades, the end and the level

Against the fake vMix and its clock: a trimmed Take sets the in point before `Play`, and at the
out point Hold pauses, Loop goes back to the in point and Clear removes; a fade in starts at alpha
0 and volume 0 and reaches full alpha and the cue's level over the fade, one `SetAlpha` per frame
and one `SetVolumeFade`; a fade out on Out or at a Clear ends at black and silence at its time; a
level sends `SetVolume` by the measured curve, and above 0 dB `SetGain`; changing the ending while
it plays works for trimmed and untrimmed clips; every step the Bridge sends by itself is dropped
once the player's generation moved; the cue editor offers these controls for a vMix cue because
`/status` lists `fade`, `trim` and `level`. On the real vMix 29: how close a Pause lands to an out
point, a fade to black seen in Program snapshots, and `SetGain` at +6 dB, recorded.

### AC-13: Play next and folders

Against the fake vMix: Play next and a Play-through folder play every entry in order with its own
trim, fade in and level, `/state` names the entry on air and the ones to come, Loop the folder
starts over after the last, and Out stops it with nothing more sent; an entry with no length is
refused with the reason. On the real vMix 29: a three-file folder plays through and loops, with
the gap between files recorded.

### AC-14: A real vMix round

On the trial's vMix 29, with the released Bridge exe and the production page: a production with
three graphics on its overlay, two clips (one trimmed with fades), a still, a sting and a
Play-through folder is loaded, operated (take, update, out of graphics; take, loop, hold, fade
out of clips while vMix cuts to `NoaCG Clips`; the sting over a camera) and unloaded, and the
record in `docs/VMIX_ON_A_REAL_HOST.md` §8 says what was seen in vMix's snapshots, with vMix's
files restored byte for byte.

### AC-15: The operator's guide says how

`docs/PLAYOUT_INTEGRATION.md` §5 and the website's vMix guide (`docs.html`) describe choosing vMix
for a production, Load and Unload, the overlay choice, the players and the vMix operator's cut to
them, the media folder and **Choose folder…**, the clip controls, and what vMix cannot do here (a
crossfade between two clips, Basic HD clips); `docs/GOALS.md` outcome 5's current state names
vMix; issue #760 has a summary comment with what remains (Later).

## Phases

Each phase is one pull request, runs `/check` and lands with `/queue-merge`; the builder adds the
next phase's notes under `## Phase notes`. `plan-run` numbers the phases 1 to 8; phase n is Vn,
and evidence files are `evidence/phase-vN.md`. A phase marked **real vMix** has its builder run
vMix 29 on this laptop by the procedure in "What a fake vMix proves"; the owner is asked nothing.
A checker re-runs the fake-based tests and the e2e journeys and reads the builder's real-vMix
evidence; it starts vMix itself only when that evidence is missing or contradicts the code.

1. **V1. One playout system per production, with no visible change** (AC-2). `playoutSystem` and
   `vmix?` in `src/model/outputSetup.ts` with a Node test in `scripts/`; `casparOn` in
   `src/components/home/ProductionPage.tsx` derived from it, and the other five readers
   (`CueRundown.tsx`, `PlayoutSettingsDialog.tsx`, `RundownColors.tsx`, `src/control/playoutStatus.ts`,
   `DefaultOutputPreference.tsx`) moved onto it where they read the switch; `withCasparSwitch`
   storing the one choice. No UI for vMix, no Bridge change, no e2e spec file changed:
   the CasparCG journeys listed in AC-2 are the guard and run in the pull request's CI.
2. **V2. vMix in Settings and on the production, and the first Bridge download** (AC-3, AC-4,
   AC-5, AC-6; the review also records AC-1 from `evidence/slice-1.md`; **real vMix**: whether
   the XML names a Browser input's address, then the built exe with Load and Unload from the dev
   server's production page and the snapshot of Program with the output on Overlay 8).
   Files: `src/control/playoutLink.ts` (requests with an explicit target and slot, `adapters` from
   `/health`, `vmix` settings), a new pure `src/control/vmixPlayout.ts` (the default channel, the
   setup sentences, the row's words) with `scripts/vmix-playout.test.mjs`,
   `src/components/PlayoutSettingsPanel.tsx` with a new `VmixSettingsSection.tsx`,
   `src/components/home/PlayoutPanel.tsx` (`VmixSection`), `src/components/home/ProductionPage.tsx`
   (wiring only, no new logic), `src/components/BridgePairPage.tsx`, `src/control/playoutStatus.ts`,
   `e2e/_fakeBridge.ts` and the vMix journeys in `e2e/bridge-connect.spec.ts`,
   `cli/src/playout/adapters/vmix.ts`, a new `cli/src/playout/vmixOutputs.ts` (the kept keys),
   `cli/test/_fakeVmix.mjs` and `cli/test/vmix.test.mjs` (the output identity only),
   `cli/BRIDGE_CHANGELOG.md` and the version bump of AC-6, `docs/BRIDGE.md` (the vMix adapter
   table and the "Nearly stateless" row), `docs/PLAYOUT_INTEGRATION.md` §5, `evidence/phase-v2.md`.
3. **V3. The players and the media folder in the Bridge** (AC-7, AC-8, AC-9; **real vMix**: Take,
   a Take over a playing clip, Loop, Hold, Pause, Out, a sting over a camera with input and
   Program snapshots; the folder picker from the built exe; a UNC path if a share is reachable,
   else recorded as not tried). Files: `cli/src/playout/adapters/vmix.ts` (with a new
   `vmixPlayers.ts` if it passes 500 lines), `cli/src/playout/vmixTcp.ts` (list items,
   `shortTitle`, `state`, `position`, `duration`, `selectedIndex`), a new
   `cli/src/playout/vmixMedia.ts` (the folder, the picker, the listing, the length headers, the
   path rules), `cli/src/playout/server.ts` (`/list`, `/studio`, `/vmix/choose-folder`, `/state`
   for vmix), `cli/src/playout/slots.ts` (player keys), `cli/src/playout/protocol.ts` and its
   mirror `src/control/playoutProtocol.ts`, `src/control/playoutSlots.ts` (`slotAddress` and
   `compareSlots` for a player slot, which the protocol change reaches), `cli/test/_fakeVmix.mjs`
   (the Video List model), `cli/test/vmix.test.mjs`, a new `cli/test/vmix-media.test.mjs`,
   `evidence/phase-v3.md`. No release: nothing in the studio uses it yet.
4. **V4. vMix clip cues in the rundown** (AC-10). Files: `src/model/shows.ts`
   (`PlayoutItem.adapter` `'casparcg' | 'vmix'`, additive), `src/components/home/PlayoutItemPicker.tsx`
   and `CueRundown.tsx` (From vMix…, the other system's cues disabled),
   `src/components/home/ServerCueEditor.tsx` (where it plays), `src/control/serverPlayout.ts` and
   `src/control/playoutLink.ts` (the item's target and slot from its adapter),
   `src/control/cuePlayback.ts` (the capability gating for vMix), `src/components/home/ProductionPage.tsx`
   (wiring only), the media folder line and **Choose folder…** in `VmixSettingsSection.tsx`,
   `e2e/_fakeBridge.ts` and a vMix journey in `e2e/playout-cues.spec.ts`, `evidence/phase-v4.md`.
   No release: without the clock (V5) a vMix clip is not yet usable on air.
5. **V5. The clip clock, the reload, and the second download** (AC-6, AC-11). Files:
   `src/control/serverState.ts` (`applyReading` and the slot it builds, keyed by player for vMix),
   `src/control/serverPlayout.ts` (`pollServerState` by target), the state poll in
   `src/components/home/ProductionPage.tsx` (which picks channels from `itemSlot().channel` today:
   move the choice into `control/`), `src/control/playoutLink.ts` (`readState` for a vmix target),
   `e2e/_fakeBridge.ts` and a vMix journey in `e2e/playout-clock.spec.ts`, `cli/BRIDGE_CHANGELOG.md`
   and the version bump of AC-6, `docs/BRIDGE.md`, `evidence/phase-v5.md`.
6. **V6. Trim, fades, the end and the level, and the third download** (AC-6, AC-12; **real vMix**:
   the out point's accuracy, a fade to black in Program snapshots, `SetGain`). Files: a new
   `cli/src/playout/vmixClipTimer.ts` (the clip timer), `cli/src/playout/adapters/vmix.ts` or
   `vmixPlayers.ts`, `cli/test/_fakeVmix.mjs` (alpha, volume, a controllable clock),
   `cli/test/vmix.test.mjs`, `src/control/cuePlayback.ts` and `src/components/home/ServerCueEditor.tsx`
   only where a vMix case differs, a vMix journey in `e2e/playout-cues.spec.ts`,
   `cli/BRIDGE_CHANGELOG.md` and the version bump of AC-6, `docs/BRIDGE.md`, `evidence/phase-v6.md`.
7. **V7. Play next and folders, and the fourth download** (AC-6, AC-13; **real vMix**: a folder
   plays through and loops, the gap between files). Files: `cli/src/playout/runner.ts` (a vMix
   branch, or a vMix runner beside it, on the clip timer), `cli/src/playout/adapters/vmix.ts` or
   `vmixPlayers.ts`, `cli/test/_fakeVmix.mjs`, `cli/test/vmix.test.mjs`,
   `src/control/serverPlayout.ts` (`sequenceMembers` for a vMix target), vMix journeys in
   `e2e/playout-sequence.spec.ts` and `e2e/playout-folders.spec.ts`, `cli/BRIDGE_CHANGELOG.md` and
   the version bump of AC-6, `docs/BRIDGE.md`, `evidence/phase-v7.md`.
8. **V8. The full round and the operator's guide** (AC-14, AC-15; **real vMix**: the round of
   AC-14 with the released exe). Files: `docs/VMIX_ON_A_REAL_HOST.md` §8,
   `docs/PLAYOUT_INTEGRATION.md` §5, `docs.html` (the vMix guide), `docs/GOALS.md` (outcome 5's
   current state, one sentence), `evidence/phase-v8.md`, and the summary comment on issue #760.
   No product code; a defect found becomes a fix in this phase only when small and contained,
   otherwise an issue.

## Readiness

Before V1: this spec and `work.json` on `main`, the "Runnable plans" line present, `origin/main`
green, the owner's window supplied, and vMix 29 trial installed on this laptop (it is, 29.0.0.49,
trial ending about 2026-11-28). Every owner decision is answered. Before V8: the V7 Bridge
release published. Every real-vMix step: vMix not already running (if it is, the owner is using
it: wait, never close it), ffmpeg present for test media (`C:\ffmpeg`).

## Execution settings and how the owner starts this plan

`/plan-run vmix`, sequential, `wave-row` (Opus, high) builders; checkers in fresh sessions. The
start template:

```
/plan-run vmix until <date and time with UTC offset>
```

**Estimate:** about 2 to 3 hours each for V1, V4 and V5, 3 to 4 hours each for V2, V3, V6 and V7
(real vMix, and three of them a release), and 2 hours for V8, each with its check: 22 to 28 hours
of run time, so two windows (the plan-run ceiling is 24 hours), V1 to V4 and V5 to V8. It must
finish before the trial ends (about 2026-11-28).

## What the plan can demonstrate, and what stays uncertain

Demonstrable: one playout system per production with CasparCG unchanged; Load and Unload of the
output on vMix from the production page; clips, stills and audio from the rundown in vMix inputs
the vMix operator cuts to, with the CasparCG clip controls; every wire proven against the fake
vMix and every picture on vMix 29. Uncertain: vMix 28 and Basic HD (documented only); how close
the clip timer lands on a slower machine; first-frame delay of large files; the operator's own
presets saved with the players in them (keys survived a preset within and across sessions for
images, measured; not yet for lists).

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
([issue #767](https://github.com/NoaCG/NoaCG-Studio/issues/767)), a crossfade between two clips
(an A/B pair of players), thumbnails of vMix media, setting the Browser input's size by API.

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
in "Research findings" above, and the trim, fade and level rows (§17 to §21).

**Still open on a real vMix:** a Cut (0 ms) overlay transition's timing; enhanced security with a
Web Controller password; the `edition` string of Basic HD and vMix 28's four channels; the Browser
input's size against a production of another resolution; the list's Loop with Auto Next on; a
list item's first-frame delay; UNC paths; `SetGain`; how close the clip timer lands; the folder
picker from the unsigned exe; a preset saved with the players.

## Phase notes

Each phase's pull request adds here what the next phase must allow for, newest first: the
previous verified `main` sha, the merge sha, the revert command, decisions taken, traps found, and
the check's findings.

### Before V1 (the plan, 2026-10-14)

- The vMix adapter's Put on air (Load) finds the output input by `title` today; V2 makes it the key
  kept per output address. Players are found by `shortTitle` (a list's `title` changes with its file).
- `PlayoutSettings` has no `vmix` and `targetOf`/`slotOf` are CasparCG-only; `/health`
  `adapters` is parsed into `BridgeReply` and read nowhere; `AgentError.setup` is read nowhere in
  `src/`. Generalise them without changing a CasparCG request byte (the CasparCG journeys in
  `e2e/bridge-connect.spec.ts` must pass unchanged).
- The CasparCG per-production buttons are **Load** and **Unload** (`caspar-put-on-air`,
  `caspar-take-off-air` test ids); give vMix's their own ids (`vmix-load`, `vmix-unload`).
- `ProductionPage.tsx` is already very large; put vMix state and words in `control/` and the panel
  component, and keep the page to wiring. V1 is the place to keep it lean: the choice lives in
  `outputSetup.ts`, the page only reads it.
- From the plan's review: the studio's state path is keyed by CasparCG channel and layer
  (`serverState.ts` `applyReading`, `playoutSlots.ts`, the page's poll), which is why V5 exists
  apart from V4; a protocol change to `VmixSlot` reaches `playoutSlots.ts` already in V3.
- Loop and Auto Next are settings of the list input, not of an item, and so are alpha and volume:
  a Take that does not set them inherits the last cue's.
