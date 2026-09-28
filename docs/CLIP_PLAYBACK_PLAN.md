# Clip and audio playback, and the rundown around it - the plan

**Draft, revision 2, 2026-09-27. Phases 0 to 4 are built (§16).** It comes from an owner planning session.
The owner approved the design and answered its five questions (§15). An independent review of the
plan and the code it touches (Codex, at `5b3b044`) agreed with the direction and corrected the
server model, the record and the guards. **Every finding and what was done with it is in §19.** §16
lists every file each phase touches, §17 where the plan meets the repository's standing rules, and
§18 every failure case with the test that guards it. Once approved it replaces §3 ("Build 2: basic
media") of [`RUNDOWN_AUTOMATION_PLAN.md`](RUNDOWN_AUTOMATION_PLAN.md) and closes the open half of
[`backlog/video-through-playout-wrapper.md`](backlog/video-through-playout-wrapper.md).

The mockups are drawn, not built. They live beside the research in
[`research/clip-playback-2026-09-27/`](research/clip-playback-2026-09-27/), with `mockup.html` as
their source. Revision 2 changed two things the pictures do not show yet: rows keep a small
`AIR`/`PVW` tag, a note mark and the layer-clash warning (§6.2), and the Level slider has no live
effect on air (§6.6).

| File | Shows |
|---|---|
| `today-1600.png` | the production page as it is today, a server clip selected |
| `clock-single-clip-1920.png` | full HD: one clip on air that holds its last frame; the clock, the minimal rundown, a clip's settings |
| `clock-single-clip-last-seconds-1920.png` | the same clip in its last seconds: the clock's warning |
| `clock-clip-then-clip-1920.png` | a clip that plays the next clip automatically: `TO STUDIO` big, the clip's own time small |
| `clock-clip-then-clip-1366.png` | the same at the 1366×768 floor: the clock folded to one thin row, rundown dragged narrow |
| `clock-last-clip-last-seconds-1366.png` | the last clip of that sequence in its final seconds, at 1366 |
| `graphics-only-1920.png` | a quiz production with no playout server: twelve fields and seven controls |
| `graphics-only-wide-rundown-1920.png` | the same production with the rundown dragged wide |

---

## 1. Why

A show is graphics and clips. The moment a clip has to roll, the operator leaves NoaCG for the
CasparCG Client, and the owner named that as "one reason I can't use it in my productions". Outcome
5 in `GOALS.md` asks for "clips and audio play reliably from the rundown through CasparCG, with
volume, loop and the other attributes a production genuinely needs".

The operator's needs, in the owner's words from this session:

- choose how a clip ends: hold the last frame, clear, loop, or play the next clip;
- fade in and out, and set the sound level;
- sound on its own, a sting or a music bed, that never knocks the video off;
- a folder of clips that plays start to finish, or all at once (a video with its own audio file);
- **a very clear countdown when a clip is ending**, so the operator can count the director out;
- a long rundown that is easy to follow, with room that the operator decides;
- none of it cluttering the screen for someone who only runs graphics.

## 2. Goal and non-goals

**Goal.** One operator runs a whole show from the NoaCG production page on a 1920×1080 screen:
graphics, clips and audio from one rundown, with the clips' endings, fades, levels and sequences
carried out by the playout server itself, and a countdown the operator can trust.

**Non-goals, deliberately:**

- **No video through the web.** The file stays on the server; only its name travels
  (`backlog/video-through-playout-wrapper.md`).
- **No timer in the page that fires a clip.** The server switches clips (`LOADBG … AUTO`); the
  Bridge queues the next file (§6.10); the page only asks and shows. This is `BRIDGE.md` §5a's rule.
- **No live level changes while a clip is on air** in these phases (§6.6, and §19 finding 2).
- **No promise that separate video and audio files start on the same frame** (§6.6, "All together").
- **No mixer items** (picture-in-picture, crop, opacity, colour), no push/wipe/slide transitions, no
  input routing, recording or streaming, no raw AMCP command items.
- **No new features on the phone surfaces** (the hosted Control page, the Presenter link, the
  exported controller). They keep working; §8.
- **No change to the graphic editor** or to the editor-opening code on Home, the graphic control
  page or the wizard.

## 3. What exists today

- **Server clips play from the rundown** through NoaCG Bridge: Take, Out, Pause, Resume, and Loop
  since 2026-09-25. Each verb is one AMCP line (`cli/src/playout/adapters/casparcg.ts:43-81`), and
  the page never composes AMCP itself (`BRIDGE.md` §3).
- **Every clip shares layer 10**, and an audio file is treated as a clip on the same layer, so a
  sting replaces the VT (`src/model/shows.ts:526`). The picker keeps a clip's length and drops the
  server's kind word (`src/components/home/PlayoutItemPicker.tsx:102`).
- **One server file is one item, shared by its cues.** `addPlayoutItem` de-duplicates on adapter,
  kind and name (`src/model/shows.ts:536-567`), so the same clip added twice, or a duplicated cue,
  gives two cues over one `PlayoutItem`. Its slot and `loop` are therefore shared by every cue of
  that file.
- **What is on air on the server is page memory only** (`livePlayout`, `ProductionPage.tsx:369-378`),
  so a reload forgets it, and nothing reports back what the server really holds.
- **The rundown is a fixed 380px column** (`src/styles/playout-dashboard.css:231-237`). Each row is
  two lines: the name, then the cue's note or its kind and graphic, a layer badge that turns into a
  clash warning when two graphics share a layer, and `AIR`/`PVW` tags (`ProductionPage.tsx:3566-3641`).
- **The production page is 4,165 lines in one component**, and a split is already planned
  (`backlog/production-page-phases.md`), with the rule that `liveCue` and `selectedCueId` never move.
- **The layout has an owner-set contract** (`PLAYOUT_DASHBOARD.md`, 2026-08-21): the minimum
  supported window is 1366×768, the class laptops' size. The verb bar sits beside PROGRAM down to
  that width, the monitors never change size with the selected cue, only the control area scrolls,
  and a phone (≤900px) stacks everything in one scrolling column with the verbs pinned to the bottom.
- **The hosted Control page** ("Operate from a phone or tablet") lists server cues as disabled,
  because a phone cannot reach the operator's Bridge (`src/components/HostedControlPage.tsx:1261`).
  The exported controller and packs keep graphic cues only (`src/export/showExport.ts:274-278`,
  `src/packs/graphicsPack.ts:420-448`).

## 4. What CasparCG does, checked against its source

Checked against the server's source at the `v2.3.3-lts-stable` and `v2.5.0-stable` tags
(github.com/CasparCG/server), and re-checked by the review. The AMCP wiki is labelled "may not be
valid for versions newer than 2.0.x", so the source is the authority. **Every line still needs the
real 2.5.0 server** (§12). Paths are under `src/`.

| Behaviour | Where in the source | Consequence for NoaCG |
|---|---|---|
| A clip that reaches its end without `LOOP` keeps showing its **last frame**. | `core/producer/layer.cpp`, `receive()`: an empty frame falls back to `last_frame()` | Hold last frame is today's behaviour and the default. |
| A **still image** has no end: its length defaults to "forever" unless `LENGTH` is given, so `AUTO` behind it never fires. Its state carries `file/path`, not the video producer's `file/name`. | `modules/image/producer/image_producer.cpp:63, 97, 113` | Stills get Hold and Out only. State parsing is per producer. |
| `LOADBG c-l <clip> [MIX n] AUTO` plays the background when the foreground ends. One background per layer. | `layer.cpp`, `auto_play_`; `protocol/amcp/AMCPCommandsImpl.cpp`, `loadbg_command` | The server switches with the page closed; something must queue each next file (§6.10). |
| **`LOADBG … AUTO` onto an empty layer plays at once.** | `layer.cpp:59`, `load()`: `if (auto_play_ && foreground_ == empty) play()` | A late queue after Out would air the follower. Every queue carries a generation (§6.10). |
| With **MIX**, `AUTO` starts the transition that many frames before the end, so it finishes on the last frame (at least one frame). Other transition types differ and are not used. | `core/producer/transition/transition_producer.cpp:97`, `auto_play_delta()` | A Clear with a 1 s fade starts fading 1 s before the end. Two clips crossfaded with a 1 s MIX overlap by 1 s, so a sequence is **shorter than the sum of its clips** (§6.4). |
| A MIX **crossfades the audio** too. | `transition_producer.cpp`, `audio_transform.volume` | Fades are sound and picture together. |
| The `AUTO` check runs **before** the pause check, and `play()` clears pause. | `layer.cpp:114-128` | A follower queued while the clip is paused inside its last `n` frames starts at once. The runner never queues onto a paused layer (§6.10). |
| A `PLAY c-l "<clip>"` that **fails to load** (404) leaves the layer's previous background, and its `AUTO`, in place. | `AMCPCommandsImpl.cpp:353-368`, `play_command` | A failed replacement Take must be followed by a disarm (§6.10). |
| `LOADBG` without `AUTO` switches `AUTO` off; `STOP` empties the foreground and switches it off but keeps the background loaded; `CLEAR c-l` removes both. | `layer.cpp`, `load()`, `stop()`; `core/producer/stage.cpp:314`, `clear(index)` erases the layer | Out on a slot with a queued follower sends `CLEAR c-l` (§6.10). |
| `EMPTY` is a transparent colour producer (`#00000000`). | `core/producer/color/color_producer.cpp`, `get_hex_color` | "Clear" leaves a transparent layer; `INFO` reports a colour producer. |
| `PLAY`/`LOADBG` take `SEEK`, `IN`, `OUT`, `LENGTH` and an **audio filter `AF`** (FFmpeg syntax), in 2.3.3 and 2.5. | `modules/ffmpeg/producer/ffmpeg_producer.cpp`, parameter parsing | Trim is cheap. A per-cue level travels **with the clip** as `AF "volume=<linear>"`. |
| `MIXER c-l VOLUME` is a **layer** gain that multiplies with the clip's own `AF` gain and outlives the clip. | `AMCPCommandsImpl.cpp:1308`, the mixer commands | NoaCG does not send it in these phases (§6.6). |
| **`INFO <channel>`** reports each layer's foreground and background. For the video producer, `file/time` is the **position in the whole file** and the **whole file's** length; the played segment is `file/clip` (start and length). `paused`, `loop` and the producer's name are there too. | `layer.cpp` `state_`; `modules/ffmpeg/producer/av_producer.cpp:1006-1007` | The countdown is computed from the segment, never from `file/time` alone (§6.7). |
| `BEGIN … COMMIT` batches commands, but is **not a transaction**: it can answer `202 COMMIT PARTIAL` after applying the successful ones; `BEGIN` has no reply of its own; a one-command batch takes a shortcut. Not in 2.3.3. | `protocol/amcp/AMCPProtocolStrategy.cpp:215`, `AMCPCommandQueue.cpp:115` | Not used in these phases (§6.6, "All together"). |

**Measured on the real 2.5.0, 2026-09-28** (phase 2; `cli/test/fixtures/info/README.md`,
`BRIDGE.md` §3b). The `INFO` rows above held, with three things the source did not show:

- **`SEEK`, `IN`, `OUT` and `LENGTH` count frames at the CHANNEL's rate**, not the file's: `SEEK 250
  LENGTH 375` on a 25 fps file in a 50p channel is 5 s in and 7.5 s long. Phase 3's trim, like its
  fades, converts seconds with the channel's rate.
- **`INFO` is one data line of XML** after `201 INFO OK`, its own line breaks bare LF, and `INFO
  c-l` answers the whole channel. A queued background is a `transition` producer wrapping its file,
  and `frames_left` appears on the foreground only while that background waits with `AUTO`.
- **`202 PLAY OK` comes before the clip is on the layer.** For about a tenth of a second the layer
  still shows what it held before: nothing, or, on a re-take of the same file, that file at its
  end. A reading in that window must not end or restart anything (§6.7, `arriving`).
- **2.3 answers `INFO` the same way**, read from this machine's 2.3 build (`2.3.2 4de6d18f Dev`):
  the same segment for the same trim, with no `<format>` element and a clip named with its
  extension, so a reading is matched to an item without the extension.

**Measured again for phase 3, 2026-09-28**, on 2.5.0 and 2.3 (§12, `BRIDGE.md` §3b; captures
`p3-*.json` and `format-*.json` in `cli/test/fixtures/info/`). The source's rows above held, with
four things it did not show:

- **A follower queued with `AUTO` within about 60 ms of `PLAY … IN n` (or `SEEK n`) fires at once**,
  on both versions: it airs and the trimmed clip never does. From about 90 ms it waits for the
  trimmed end. So nothing is queued with the Take behind a clip that starts part way in; the Bridge
  queues it once `INFO` shows the clip inside its segment.
- **INFO's `framerate` is what `MIX`, `SEEK` and `LENGTH` count, interlaced or not**: 50 on 1080i50
  as on 1080p50, 60000/1001 on 1080i5994. Seconds are multiplied by it as it stands.
- **2.3 writes a transition without naming the producer inside it**, so a MIX and a fade to empty
  are read off what the transition carries.
- **`AF "volume=0.2512"` is 12.0 dB quieter** than the same clip at 0 dB, through a Take and through
  an automatic switch, on both versions, with the layer's own volume untouched.

## 5. What other tools do

From the research of 2026-09-27 (CasparCG Client and SPX read from source; vMix, TriCaster, Viz
Mosart, Cuez and Grass Valley from their documentation's search snippets):

- **CasparCG Client**: settings in an **Inspector panel beside the rundown**. A Group with "Auto
  play" sequences clips through the server's `LOADBG AUTO`, queuing the next when OSC says a clip
  started. Weaknesses: a group cannot loop, and auto-play stops when its tab is not the active one.
- **SPX**: the rundown takes about 60% of the width; editing happens inside the row. No clips.
- **vMix, TriCaster, OBS**: every clip has an end choice. Hold the last frame is the usual default;
  then loop, or auto-next.
- **Broadcast automation** (Sofie, Viz Mosart, Grass Valley iTX): the clip is the main event, and
  graphics and audio are **attached** to it at an offset ("lower third in at 0:05 for 8 s").
- **What nobody does**: auto-take a graphic by guessing its length; chain clips from a timer in the
  client; leave a finished clip frozen on air by accident.

## 6. The design

### 6.1 One screen, sized by the operator

- **Design target 1920×1080. Floor 1366×768**, as the layout contract says (owner, Q1). Below the
  floor the existing phone layout takes over, unchanged.
- **The rundown's width is the operator's.** A drag handle on the divider, from 320px to 60% of the
  window, also moved with the arrow keys; double-click returns it to the default (about 40% at
  1920, 380px at 1366). Remembered per machine as a preference, never in the production.
  **Built with a narrower default** (owner, 2026-09-27): 23% of the window, never under 380px, so
  about 440px at 1920. 40% left the 1080p monitors 250px tall, under the 300px the owner had ruled
  too small on 2026-08-21 (`PLAYOUT_DASHBOARD.md` §2); at 23% they keep 343px.
- **The monitors keep their rule**: sized from the room that is left, per production and never per
  cue, so they never jump between cues. A wider rundown makes them smaller; the verb column stays.
- **The cue panel reflows to its own width**, through CSS container queries, never the window's:
  graphic fields fill as many columns as fit (`repeat(auto-fill, minmax(200px, 1fr))`; built on the
  grid that already does this, keeping `PLAYOUT_DASHBOARD.md` §2d's measured 250px floor, since a
  number control is 245px wide and a 200px track lets it paint over its neighbour), and a clip's
  settings put each label above its control below 620px. **Scrolling stays where the contract puts
  it**: the control area (`.pd-control-area`) is the one scroller; the cue panel gets no scroller of
  its own (`PLAYOUT_DASHBOARD.md` §2, the fixed-panes rule).

  So a quiz with twelve fields and seven controls fits at 1920 with the rundown at 440px
  (`graphics-only-1920.png`), and folds into more rows when the rundown is 860px wide
  (`graphics-only-wide-rundown-1920.png`).

### 6.2 The rundown row: one line, nothing lost

Every row is one line, 34px, so about twenty rows show at 1080p against ten today. What today's
second line carries is kept, moved, never dropped:

| Part | Shows | For |
|---|---|---|
| number, kind icon | `▶` clip, `♪` audio, `T` graphic, `▤` folder. The icon's accessible name and tooltip say the kind in words ("Lower third · Hairline", "Server clip · 2-10"). | every row |
| name, then a dim summary | a graphic's first field values (`Alexandra Riva`); a clip's own name | every row |
| **note mark** | `✎` when the cue has an operator note; the note in its tooltip and accessible name | any cue with a note |
| end mark, after the name | `⟲` loops, `→` plays the next, `⌀` clears; nothing for Hold, the default | clips only |
| length, right-aligned | `3:00`; while on air, the **remaining time** (`-0:09`) | clips only; the column is absent when the rundown has no server cue |
| slot | `2-10` for a server cue, `L20` for a graphic, as today. **When two graphics share a layer the badge is the clash warning it is today**, with its sentence, and a click opens the layer repair (§6.5) | every row |
| state tag | `AIR` or `PVW`, as today, small, at the row's end. The red tint and amber outline stay; the tag is what a colour-blind operator and a screen reader get | on air, preview |

A clip queued on the server to play next wears **`NEXT ON SERVER`** after its name.

**Rejected: a NOW / NEXT strip above the rundown.** The monitors say what is on air and in
preview, the clip clock says what ends when, and the list follows the air. A strip would say it a
third time and cost two rows.

**Rejected: separate state and ends columns.** A graphic row would leave both empty.

**The list follows the air**: when a cue goes on air off-screen, the list scrolls it into view.
It does **not** scroll while a row is being dragged, while a row's menu is open, while focus is
in the rundown, or for ten seconds after the operator scrolled it by hand.

### 6.3 The monitors

- **No labels over the picture.**
- **One small `STILL` tag** on a server clip's picture: the page shows the clip's thumbnail, not the
  server's moving video, and an operator who does not know that could wait for a picture to move.
- **PREVIEW** shows a clip's length in its corner (`3:00`). **PROGRAM** shows no time: the clip
  clock sits right beside it.

### 6.4 The clip clock

The owner called the countdown "one of the most important things when you play a clip". His
review set its shape: **one clear number, and nothing that moves the rest of the page.**

**Where.** Under the verb buttons, beside PROGRAM, in the column the layout contract left free. It
appears only while a server clip or audio file is on air and takes **only the height left in that
column**: its bottom edge is PROGRAM's, never lower. In CSS it is a flex item of the verb column
with `container-type: size`, so its content cannot make the stage taller, and its number scales with
its own height (`cqh`). Below about 96px it folds to **one thin row**: label and number only.

**What it shows** depends on what happens at the end:

| When the clip ends it... | The clock shows | Warns (red, then pulsing) |
|---|---|---|
| **holds the last frame** or **clears** | one big number, the remaining time of the segment on air, and `then holds the last frame` / `then clears to studio` | on that number |
| **plays the next clip** (Play next, or a Play-through folder) | **`TO STUDIO`** big: the time until the sequence ends on air (below), and small: `clip -0:09 · next INTRO_VT 0:20` | on **TO STUDIO only**; the clip's own time never warns when a clip follows |
| **loops**, or the sequence ends in a loop | the clip's remaining time, small, and `loops until Out`. No studio time: there is none | never |

- **TO STUDIO** is the sum of the remaining segments in the sequence **minus every transition
  overlap**: three 10-second clips joined by two 1-second MIX transitions end after about 28
  seconds, not 30 (§4, the MIX row). A member whose length is unknown makes it `TO STUDIO ?`.
- **The warning**: the last ten seconds turn the box red; the last five pulse it. Colour is never
  the only signal: the digits count too.
- **At zero on Hold** the number turns amber and counts up, `HOLDING +0:03`. **On Clear** it goes.
- **Paused** reads `PAUSED -0:09`, and TO STUDIO stops with it.
- **One clock, one clip.** It follows the server clip or audio file the operator took last (for an
  All-together folder, its longest file). Any other server file on air shows its time on its own row.
- **Honest about certainty.** The number comes from the Bridge's reading of the server (§6.7). It
  reads `estimated` when it is not: an old Bridge that cannot read `INFO`, no fresh reading for 3
  seconds, or a segment the server did not report.

### 6.5 The cue panel (left of the rundown, where graphics are edited today)

Selecting a cue opens its settings here, the same place and shape for every kind.

**A graphic.** Unchanged in what it offers: title, fields, controls, note. One move: its playout
layer goes under **Advanced** (closed by default, with a one-line summary: `Layer 21`). **When the
graphic's layer clashes with another's, Advanced opens by itself** and shows today's repair; the
rundown's clash badge opens it too, so the repair is never hidden.

**A server clip or audio file.** Basic, always visible:

| Setting | Choices | On air |
|---|---|---|
| **At the end** | **Hold last frame** (default) / **Clear** / **Loop** / **Play next** (movies and audio; a still has Hold only) | the server does it |
| **Fade** | In: Cut / Short / Long. Out: Cut / Short / Long | §6.6 |
| **Level** | a slider in dB, -60 to +6, 0 by default, with Reset | **applies at the next Take**; while the cue is on air the slider says so, as Loop does today |
| **Note** | free text | - |

**Advanced** (closed, summary `Channel 2 · layer 10 · whole clip`): channel, layer, start at and
end at (trim, validated: start before end, both inside the file), and the kind when the server's
word was missing on an older item. Short is 0.5 s and Long 1 s, converted to the channel's frames by
the adapter; they are not settings. Channel and layer belong to the file (every cue of one server
file shares its slot, as today); everything else belongs to **this cue** (§7).

**A folder.** Its name; **How it plays** (One by one / Play through / All together); for Play through,
**At the end** (As the last clip says / Loop the folder); and what airs on which slot.

**A clip inside a Play-through folder** shows `→ Plays the next, set by the folder` in place of its
At the end, except the folder's last clip, which keeps its own Hold / Clear / Loop.

### 6.6 The rules, on air

**At the end**, for one clip outside a Play-through folder:

- **Hold last frame**: nothing more is sent. Default, and every existing clip.
- **Clear**: the Take also queues `LOADBG c-l EMPTY [MIX n] AUTO`, where `n` is the cue's **fade
  out**. With a fade, the fade starts `n` frames before the end, and the setting says so.
- **Loop**: `PLAY … LOOP`, as shipped.
- **Play next**: the Take starts a **sequence** (§6.10): this clip, then the next clip or audio cue
  on the same slot, looking past any graphics in between (owner, Q3), never past the end of the
  clip's folder, and then whatever that clip's own At the end says (it may play next again). The
  target is resolved **from the rundown as it stands at the Take**, and named where the choice is
  made: `Then plays: STUDIO_BG (cue 5, after 2 graphics)`. When no clip qualifies the choice is
  disabled with the reason: "no clip after this one plays on 2-10", "the next clip is in another
  folder", "the next clip is shorter than 2 seconds".

**The transition between two clips** is decided by the **incoming** clip: its fade in is the MIX
into it (`Cut` means a cut). The outgoing clip's fade out is used only when it ends into nothing:
Out, or Clear at its end. So each switch has exactly one transition, and it is visible where the
incoming clip is edited.

**A clip ending never takes a graphic.** Graphics are taken by the operator. A graphic that should
come in with a clip is a later feature, attached to the clip at an offset with a stated length,
built on the timed cues of `RUNDOWN_AUTOMATION_PLAN.md` §2.

**A Take never moves the selection by itself**, and neither does a server-side switch.

**Level.** The cue's level goes out with the clip as `AF "volume=<linear gain>"` (`10^(dB/20)`,
written with four decimals), so each clip keeps its own level when the server switches to it by
itself. NoaCG sends **no `MIXER VOLUME`** in these phases: the layer gain multiplies with the clip's
own, outlives the clip into every automatic follower, and cannot be reset without touching the clip
still on air (§19, finding 2). A **live fader** for a slot is a later feature, designed as the
slot's own setting (like a fader on a sound desk), never as a change to a clip.

**Audio files** become their own kind (`mediaKind: 'audio'`, from the server's list) on their own
default layer, **5**, below clips on 10. A sting never knocks a VT off, and a bed survives both.

**Folders:**

- **One by one**: tidiness, the way a quiz groups its rounds. Collapsing hides its cues; the
  operator takes each. Works for graphics as much as clips.
- **Play through**: one Take plays the folder's clips and audio in order on **the folder's one
  slot**, as one sequence (§6.10). Each file keeps its own fade in, trim and level. The last file
  ends by its own setting, or the folder's **Loop the folder** starts the sequence again. Graphics
  cannot be put in a Play-through folder, and the drop says why.
- **All together**: one Take starts every cue in it: the server cues one after another, as fast as
  the Bridge can send them, then the graphics through the web. **Before anything is sent**, two cues
  of the folder on the same slot refuse the Take with the reason. Each cue's result is shown on its
  own row; when some fail, the others stay on air, the folder says `2 of 3 on air`, and nothing is
  retried by itself. How far apart the starts land is measured on the real server (§12); separate
  video and audio files are not promised to start on the same frame. Frame-exact starts
  (`BEGIN … COMMIT`, 2.5 only) are later, once partial results are designed for.
- **Out on a folder** takes all of it off. **All out** is unchanged.
- **Folders do not nest.**

### 6.7 The server tells the truth

While any server cue is on air, the page asks the Bridge for the state of each channel it has cues
on, **twice a second**, never overlapping one request with the next. The Bridge reads `INFO
<channel>` (§4) and answers in the protocol's words, per slot:

```ts
interface SlotState {
  producer: 'video' | 'still' | 'colour' | 'html' | 'other';
  file?: string;                // video: file/name; still: file/path
  segment?: { start: number; length: number };  // seconds in the file, from file/clip
  position?: number;            // seconds into the segment: file/time[0] - segment.start
  paused: boolean;
  loop: boolean;
  transition?: { progress: number };            // while a MIX is running
  queued?: { file: string; auto: boolean };     // the background
  instance?: string;            // the Bridge's own id for what it started here (§6.10)
  generation: number;           // the slot's action counter at this reading (§6.10)
  observedAt: number;           // the Bridge's monotonic clock, ms
}
```

Remaining = `segment.length - position`. The page counts down between readings from `observedAt`,
and a reading whose `generation` is older than the page's last accepted action on that slot is
ignored, so a slow answer from before a Take can never overrule the Take (§18, case 14).

From the state the page shows: the clock, remaining time on rows, `NEXT ON SERVER`, ON AIR including
a clip the server ended or switched by itself, and **`replaced on the server`** when a slot holds
something this Bridge did not start. After a reload, a slot whose `instance` this Bridge recorded
is matched to its cue exactly; anything else is shown as **an unidentified item on 2-10**, never
guessed from the file name.

**As built in phase 2** (`src/control/playoutProtocol.ts`), the shape differs from the sketch above
in four ways: each slot carries its `layer`, since the reply is per channel; `producer` has
`empty` too, what a `STOP` leaves; `observedAt` and the Bridge's `session` are on the reply, not on
each slot; and a slot adds `cueId` (the cue the page named on its Take, so a reload finds the row)
and `arriving` (the Bridge's Take is accepted but not on the layer yet, §4's measured race).

### 6.8 A production with no playout server

Nothing in §6.2 to §6.7 that belongs to the server appears unless the production has a server cue:
no length column, no end marks, no clock, no `STILL`, no "From the playout server" button until a
Bridge is paired. The rundown is still resizable and one line per row, and **folders** (One by one
and All together) work for graphics. The next graphics-first work after these phases is the timed
cues of `RUNDOWN_AUTOMATION_PLAN.md` §2 (owner, Q4).

### 6.9 Any playout system: what the Bridge speaks, and what the target can do

Two different questions, answered in two places (§19, finding 7):

- **What this Bridge understands**: `/health` gains `features` (for example `state`, `playback`,
  `sequence`). It has no target, so it says nothing about a server.
- **What this target can do**: `/status` (which names a target) gains `capabilities`, from the
  adapter and the server's version: `end`, `fade`, `trim`, `level`, `sequence`, `state`. The OGraf
  adapter answers none of them.

The page offers a control only when both say yes. **A cue that already carries a setting the
running Bridge or target cannot honour is not taken silently the old way.** Its Take is disabled
with the reason ("This cue clears with a fade. Update NoaCG Bridge to take it, or set it to Hold").
A **legacy cue**, one with no new setting, sends exactly today's line. The Bridge also **refuses** an
action carrying a field its adapter does not support (the OGraf adapter refuses media fields and a
level-only `update`), with the hop named, rather than dropping the field.

### 6.10 The sequence runner, in the Bridge

**Why the Bridge.** A browser slows a hidden tab's timers (Chrome's intensive throttling runs them
about once a minute after five minutes hidden), so a queue kept by the page would stall a folder of
short clips run from a background tab. The Bridge is an ordinary local process, already running
whenever a server cue can be taken. The review agreed (§19, question 1).

**What it holds.** In memory, per server slot: the **instance** it started (an id, with the cue id
and position in the sequence), the list still to play, the file it last queued, and the slot's
**generation**, a counter every action on the slot increases. `/state` reports all of it. This is
the one exception to the Bridge keeping no state (`BRIDGE.md` §3), recorded there when it lands.

**How it works:**

1. **One queue per slot.** Every action on a slot (the page's verbs and the runner's own queuing)
   runs through one serial queue for that target, channel and layer, in order, one at a time.
2. **Generations.** A Take, Out, Clear or a new sequence on the slot increases its generation
   **before** anything is sent. Runner work carries the generation it was planned under and is
   dropped, unsent, when the slot's generation has moved on. A late `LOADBG … AUTO` can therefore
   never reach a slot that was taken off or replaced (§4, the empty-layer row).
3. **Queue ahead.** When a sequence starts, the Take plays its first file and queues the second
   with `LOADBG … AUTO`. While a sequence runs, the Bridge reads the slot's state **four times a
   second**; when it sees the switch, it queues the next. A sequence member must be **at least 2
   seconds** long, so the next is always queued well before the one on air ends.
4. **Never queue onto a paused slot.** While paused, the runner waits; on Resume it continues
   (§4, the pause row).
5. **Disarm.** Out on a slot with a queued follower sends `CLEAR c-l` (foreground and background
   gone), or with a fade out `PLAY c-l EMPTY MIX n`, which replaces the background. A **failed**
   replacement Take (the `PLAY` refused) is followed by `LOADBG c-l EMPTY`, without `AUTO`, so the
   old follower cannot air (§4, the failed-PLAY row).
6. **Foreign content.** When the slot holds something the runner did not start (another client),
   the runner ends its sequence for that slot, sends nothing, and the page shows `replaced on the
   server`.
7. **Restart.** A restarted Bridge has no sequences. `/state` still answers; it reports the slot as
   the server has it, with no instance: an unidentified item. Whatever the server already had
   queued still plays by the server's own rule (a queued loop keeps looping); the page says the
   sequence stopped.
8. **One authority per slot.** Two operators on two machines have two Bridges. The Bridge that
   last took a slot owns its sequence; any other Bridge that sees the slot change ends its own and
   never re-queues. A page never takes over another Bridge's sequence; it shows it as unidentified.

## 7. The record

All additive and optional, so `Show.version` stays 2
(`root/version-every-persisted-format-ship-breaking`). **The file and the cue are kept apart**
(§19, finding 5): what the file *is* stays on the `PlayoutItem`, shared; how *this cue* plays it goes
on the `ShowCue`.

On `PlayoutItem` (`src/model/shows.ts:56-83`), facts about the file:

```ts
/** The server's own word from its list. Absent on items saved before it: resolved from the
 *  server's list (CLS) before the cue can join a sequence, else treated as a movie. */
mediaKind?: 'movie' | 'still' | 'audio';
// existing, unchanged: name, layer, channel, frames, fps, loop (legacy, below)
```

On `ShowCue` (`src/model/shows.ts:24-40`), how this cue plays it:

```ts
playback?: {
  /** Absent = hold, unless the legacy item.loop says loop (below). */
  end?: 'hold' | 'clear' | 'loop' | 'next';
  fadeIn?: 'short' | 'long';
  fadeOut?: 'short' | 'long';
  levelDb?: number;             // -60 to +6; absent = 0 dB
  trimIn?: number;              // seconds into the file; absent = its start
  trimOut?: number;             // seconds into the file; absent = its end
};
folderId?: string;
```

**Loop has one writable place in this build** (§19, finding 8). The effective ending of a cue is
`cue.playback.end` when present, else `'loop'` when the legacy `item.loop` is true, else `'hold'`.
This build writes only `cue.playback.end`, always explicitly once the operator chooses, and
**never writes `item.loop`**; it removes `item.loop` when every cue of that item has an explicit
end. An older build that toggles `item.loop` therefore still changes the cues that never had an
ending chosen in this build, and cannot re-enable a loop this build turned off. A spec pins it with
edits made through the **previous build's own functions** (`setPlayoutItemLoop` as shipped),
not only its reader.

On `Show`:

```ts
folders?: ShowFolder[];

interface ShowFolder {
  id: string;
  name: string;
  mode: 'manual' | 'through' | 'together';
  end?: 'loop';                 // 'through' only; absent = the last clip's own ending
  slot?: { channel?: number; layer?: number };  // 'through' only; absent = the clip defaults
  collapsed?: boolean;
}
```

**Where a folder sits, and how it stays whole:**

- **A folder always holds at least one cue.** It is made from the selected cues ("New folder from
  selection"), and it is removed when its last cue leaves. So it is placed by its **first member**,
  and there is never an empty folder to place.
- **Its cues are contiguous in the flat list.** Every writer in this build keeps them so: add,
  duplicate (the copy joins the original's folder, right after it), remove, drag, move, the pack
  installer (`setShowCues` drops `folderId`, since packs carry no folders) and the team merge.
- **When they are not** (an older build moved a cue out of the middle, or two teammates' edits
  crossed), the team merge gathers each folder's cues at its first member's position after merging
  and reports `folders` among the changes it could not keep as made (`FIELD_LABEL` in
  `src/model/teamShowMerge.ts:26-37`). A record read with a split folder shows each run with its
  own header, the second marked `(continued)`, until the next move gathers them. Nothing reorders
  on read.
- **Readers that know nothing of folders** (an older build, the hosted page, the exported
  controller, packs) keep the **flat order**. They do not keep folders: an export or pack of a
  production with folders is **not** a folder round-trip, by design.

## 8. The other surfaces, frozen on purpose

The hosted Control page, the Presenter link and the exported controller get **no new features**
(owner, Q2 and Q5). They must keep doing what they do today, each checked for what it actually does:

| Surface | Today | Pinned by |
|---|---|---|
| hosted `?control=` page | lists graphic cues and takes them; lists server cues **disabled** with their `2-10` address | a new assertion in `e2e/hosted-control.spec.ts`, with a production carrying folders and cue playback settings |
| Presenter link (`src/join/main.ts`) | reads audience data only, never cues | unchanged; no spec needed beyond today's |
| exported controller | graphic cues only, in order; **server cues are dropped** (`showExport.ts:274-278`) | an assertion in the export spec that a production with folders exports every graphic cue in order |
| graphics pack | graphic cues only, in order; folders and server cues dropped | `e2e/production-pack.spec.ts` with a production carrying folders |

The production page's **phone layout** (≤900px) gets no design work: the drag handle is hidden, the
clip clock sits in the stacked column, and the existing phone spec stays green.

## 9. Bridge and protocol

Additive in protocol v2 (`src/control/playoutProtocol.ts`, mirrored byte for byte in
`cli/src/playout/protocol.ts`), so `PLAYOUT_V` stays 2.

- **One playback descriptor** for a media take and for each entry of a sequence (§19, finding 6):

  ```ts
  interface MediaPlayback {
    end?: 'hold' | 'clear' | 'loop';   // what the LAST file does; 'next' is a sequence
    fadeIn?: number;                   // seconds; the adapter converts to channel frames
    fadeOut?: number;                  // seconds; used on Clear at the end, and on Out
    gain?: number;                     // linear, from levelDb
    trim?: { in?: number; out?: number };  // seconds into the file
  }
  ```

  `take` on media carries `playback?`; `out` carries `fadeOut?`. The Bridge validates each field
  and refuses a malformed one with the hop named.
- **`sequence`**: `{ slot, entries: [{ item, playback, cueId }], loop?: boolean }`, taken with the
  first entry; the Bridge runs the rest (§6.10) and answers the slot's new `instance` and
  `generation`.
- **`/state`**: `{ target, channel }` → `SlotState` per layer (§6.7), with the running sequence.
- **Every action's reply** carries the slot's new `generation`.
- **`/health`** gains `features`; **`/status`** gains `capabilities` (§6.9).
- **The adapter keeps writing every AMCP line itself.** An action with no new field writes exactly
  today's line; the unit tests pin every line and its order.

## 10. Making it robust before making it bigger

- **Pin today's behaviour first** (phase 0): the exact action of every verb on a clip and a
  template, All out, reload behaviour, the hosted page's lists, and baseline screenshots at 1920 and
  1366.
- **Split the page along its seams**, as `backlog/production-page-phases.md` plans, behaviour
  unchanged, `liveCue` and `selectedCueId` staying where they are. No general playout framework is
  built during the split (§19, question 4).
- **Two kinds of server state, two update speeds** (§19, finding 10). The clock and the rows'
  remaining time change twice a second and subscribe to a small store of their own. Who owns a
  slot, what is on air, and whether a verb or All out is allowed change only on an action or a
  switch, and they are what the verb dispatcher (`onVerb`, `ProductionPage.tsx:2640`), `canTake`
  (2148) and All out's enabled state (2691) read. A spec counts renders to prove the page does not
  re-render twice a second, and proves All out and the verbs are right after a server-side switch.
- **Time in the tests is controlled on both sides** (§19, finding 11). Playwright's `page.clock`
  moves the browser's time only. The fake CasparCG (`cli/test/_fakeCasparServer.mjs`) and the
  Bridge's runner take an **injectable clock**, advanced by the test. The runner is tested in
  `node:test` against the fake server with the real Bridge code, including after the page has gone.
  The e2e specs fake `/state` answers at the network layer, as `playout-cues.spec.ts` fakes the
  Bridge today. Answers captured from the real server are kept as fixtures, apart from the fake's
  own model.
- **Pure rules are tested in Node, without a browser**, the way `scripts/team-show-merge.test.mjs`
  already tests `teamShowMerge.ts` (Node strips the types on import): the effective ending and loop
  precedence, Play next's target, TO STUDIO's arithmetic, and a folder's contiguity after each
  writer, in `scripts/server-playout.test.mjs` (new). A module that pulls in the browser store is
  kept apart from these pure functions so they stay importable.
- **Guards are tested to fail.** Each guard in §18 has a test that breaks it on purpose (a delayed
  reply, a refused command, a stale reading) and shows the guard catching it, as
  `e2e/AGENTS.md` asks of guards.
- **Browsers**: Chrome, Edge and Firefox, the ones the Bridge supports (Safari cannot reach a local
  Bridge, `BRIDGE.md` §1b). Container queries and the drag handle work in all three.

## 11. Phases

Each lands on its own, through the queue.

| # | What | Size | Why that size | What could break, and the guard |
|---|---|---|---|---|
| **0** | **Safety net and seams.** Characterisation specs; the split's first two phases plus the server-playout module; the fake server with an injectable clock. No visible change. | medium | careful moves, nothing designed | a moved piece behaves differently: every existing spec and the baseline screenshots pass unchanged |
| **1** | **Layout for everyone.** Resizable rundown, one-line rows keeping note, kind, clash and state tags, container-query cue panel, layer under Advanced with the clash repair, the list following the air. | medium | every production sees it | a graphics-only operator loses information: the row table of §6.2 is a spec; the phone spec stays green |
| **2** | **The clock and the server's truth.** `/state` with the normalised `SlotState`, generations on replies, the poller, the clock, remaining time, `STILL`, instance ids and unidentified items after reload. Works for today's clips before any new setting. Bridge release. | medium | one route, one parser per producer, one panel | a wrong number: segment arithmetic pinned against real `INFO` fixtures; `estimated` whenever it is not the server's |
| **3** | **Clip settings and sequences.** At the end (all four), fades, level, trim, audio on layer 5, stills Hold-only; the playback descriptor; **the sequence runner** (Play next); capabilities and the disabled Take for unsupported settings. Bridge release. | large | the runner is the hard part and is needed as soon as Play next exists (§19, finding 6) | a follower airing when it must not: every §18 runner case, fault-injected |
| **4** | **Folders.** The three modes, made from selection, drag in and out, collapse, folder Take and Out, Play through as a sequence, Loop the folder, All together with per-cue results; the merge's gathering. Bridge release only if the runner needs a change. | large | a new record shape and every writer of the cue order | a folder torn apart: every writer and the merge are specs, with old-build edits |
| later | A live fader for a slot; graphics attached to a clip; frame-exact All together; Load and preloading | - | each after its own measurement or plan | - |

**Order**: 0 → 1 → 2 → 3 → 4, then the timed graphics cues (owner, Q4).

**Owner checks**, only where a person must judge (`root/verify-proportion-change-against-spec-acceptance`):
phase 1's look at 1920 and 1366 (a desktop check), and phases 2 to 4 on the real CasparCG server (a
production check). The refactor of phase 0 and the Bridge releases need no owner: routine releases
need no owner (`GOALS.md`, "Autonomous work").

**Acceptance, observable on a CasparCG server:**

- Phase 1: at 1920 and 1366, drag the rundown from narrow to wide; the scoreboard's fields reflow and
  nothing overlaps; the width survives a reload; a clash still shows on its row and its repair opens.
- Phase 2: take a 15-second clip trimmed from a longer file; the clock counts the **trimmed** length
  to 0:00 within half a second of the server, turns red at 10 and pulses at 5, then reads `HOLDING
  +0:01`; reload mid-clip and the clock comes back right; take the same file from the CasparCG Client
  and the row says `replaced on the server`.
- Phase 3: a clip set to Clear with a short fade leaves the layer empty with the page closed; a sting
  on layer 5 plays over a VT without stopping it; a clip at -12 dB is audibly quieter than the same
  clip at 0 dB; three clips set to Play next play with no black between them, and TO STUDIO reaches
  0:00 when the last one ends; Out in the middle stops the sequence and nothing else airs.
- Phase 4: a Play-through folder plays through and, with Loop the folder, starts over; an
  All-together folder with a video and its audio file starts both, and the measured gap is recorded.

## 12. Needs the real CasparCG 2.5.0 server

Each is a measurement in `e2e/configured/bridge-real-server.spec.ts` (which runs only with
`BRIDGE_REAL=1`), or a line in that phase's owner check:

1. `INFO <channel>` on 2.5.0 for a video, a trimmed video, a still, an audio file, a looping clip, a
   paused clip, a clip with a queued background and a MIX in progress: kept as fixtures. **Done
   2026-09-28**: eighteen captures in `cli/test/fixtures/info/`, captured by hand with a throwaway
   script rather than in the configured spec, and read by `cli/test/state.test.mjs`. §4 records
   what they settled.
2. How long `INFO` takes to answer, and whether four readings a second disturb playout. **Half done
   2026-09-28**: a median 1.5 ms and at most 3 ms over forty readings a quarter of a second apart
   (`info-timing.json`). Whether the rate ever costs a frame on air needs the channel's output
   watched, and is in phase 2's owner check.
3. Clear with a fade: the fade overlaps the clip's last frames. **Done 2026-09-28**: `MIX 25` began
   0.50 s before the end (0.51 s on 2.3) and `MIX 50` 1.0 s, and the layer was the empty colour
   after.
4. `AF "volume=…"`: the measured level of a clip at -12 dB against 0 dB, through a manual Take and
   an automatic switch. **Done 2026-09-28**: recorded with a FILE consumer and measured with ffmpeg's
   volumedetect, -23.0 dB mean at 0 dB and -35.0 dB at `volume=0.2512`, 12.0 dB apart in every case
   on both versions; `MIXER … VOLUME` still read 1.
5. `LOADBG` without `AUTO` cancels a queued clip; `CLEAR c-l` removes a queued follower; a refused
   `PLAY` leaves the old follower armed until the disarm. **Done 2026-09-28**: all three, on both
   versions, and `PLAY c-l EMPTY MIX n` also replaces the queued file.
6. Pause just before, at, and after the MIX threshold of a clip with a follower queued. **Done
   2026-09-28**: before the window the follower waits; inside it the MIX freezes and carries on at
   Resume; a follower queued onto a clip already paused in its last frames starts at once. PAUSE
   lands about two frames after it is sent.
7. `AUTO` with `IN`/`OUT`: the follower starts at the trimmed end. **Done 2026-09-28**, with the
   early-queue finding in §4: queued at least 90 ms after the `PLAY`, it starts at the trimmed end,
   and a follower trimmed with `IN` airs at its own trimmed start.
8. The gap between two cues of an All-together folder sent one after another. **Done 2026-09-28**:
   the page sends them one after another through the Bridge, each waiting for its answer. A video
   on layer 10 and its own WAV on layer 5 started within one frame of each other on 2.5.0 (the audio
   20 ms ahead in all ten tries) and within two on 2.3 (0 to 40 ms, the audio ahead): the WAV reaches
   the layer sooner than the video, whose first frame takes longer (item 9). INFO counts in frames,
   so a frame is the resolution. Frame-exact All together (BEGIN/COMMIT) stays for later.
9. The delay between Take and first frame, to decide on preloading. **Done 2026-09-28**: about
   115 ms from `202 PLAY OK` to the clip on the layer on 2.5.0 (95 ms on 2.3), about 55 ms
   preloaded, with no black between clips either way. Preloading is not built: it would take the
   layer's one background, which a sequence needs.
10. Whether 2.3 servers are still in use anywhere NoaCG plays out.
11. Loop the folder across two wraps. **Done 2026-09-28**, through the Bridge's runner on both
    versions: three 3-second clips ran A, B, C, A, B, C, A with each clip on the layer for its
    3 seconds and no black at any switch, the wrap included, in a FILE consumer's recording read with
    ffmpeg's blackdetect (black only before the Take and after Out). The same with the middle clip
    trimmed with `IN` and `OUT`: it played its 3-second segment on every lap.
12. An AUTO switch into a clip trimmed with `IN`, and a `LOADBG … AUTO` sent just after it (the
    wrap's race). **Done 2026-09-28**: the first INFO answer after the switch already reads the
    trimmed start, on both versions, and a follower queued 27 to 57 ms after the switch started at
    the end of the segment (3.001 to 3.008 s after the switch on 2.5.0, 3.021 to 3.024 s on 2.3),
    never early. Unlike a `PLAY … IN` (§4), an AUTO switch opens no window, so the fake server's
    `autoStarting` stays off by default. Captured as `p4-auto-into-in` in `cli/test/fixtures/info/`.

## 13. Decisions

**Build (phases 0 to 4):** resizable rundown; one-line rows that keep note, kind, clash and state;
the clip clock with segment arithmetic and transition overlaps; `/state` from `INFO`; At the end with
four choices; fades decided by the incoming clip; a per-cue level at Take; trim; audio on its own
layer; sequences run by the Bridge with generations and disarm; folders in three modes; capabilities
split between Bridge and target; the phone surfaces frozen and pinned.

**Later:** a live fader per slot; graphics attached to a clip; frame-exact All together; Load and
preloading, if measured; Invoke; a second-channel preview; Bitfocus Companion and a Stream Deck
with live feedback, through the Bridge (`backlog/companion-and-stream-deck.md`: every action is a
named verb and every state plain data from one store, kept so from phase 2).

**Not built:** a clip end that takes a graphic; a NOW / NEXT strip; state and ends columns; mixer,
route, record and stream items; raw AMCP command items; transitions other than MIX; nested
folders; a timer in the page that fires or queues a clip.

**Changes to earlier plans, once approved:** `RUNDOWN_AUTOMATION_PLAN.md` §3 is replaced by this
plan, and build 1's `At clip end` choice is dropped, because a clip's end now belongs to the clip and
its folder. `BRIDGE.md` §5a's sketch is superseded, and §9's milestone 2 (OSC) is not needed for
position readout.

## 14. For a reviewer

Revision 1's eight questions and the review's answers are in §19. What revision 2 most needs checked:

1. Do the runner's rules (§6.10) close every case in §18's runner group, including one not listed?
2. Is the loop precedence (§7) right for every mix of old-build and new-build edits?
3. Does anything in §16 still miss a writer of the cue order?

## 15. The owner's answers, 2026-09-27

- **Q1. The screen.** Full HD is the design target, and the page must still work at 1366×768.
- **Q2. The phone surfaces.** Frozen: they keep working with no new features. "No need to remove if
  it works."
- **Q3. Play next.** Plays the next clip on the same slot and looks past graphics.
- **Q4. The order.** Phases 0 to 4 as recommended, then the timed graphics cues.
- **Q5. The dashboard-parity rule.** Loosened: "It's okay if they look different. We will 100% focus
  on making sure that the computer view works... Phone is a nice add-on if it works." Recorded as
  a superseding rule (§17, item 1). Folders stay on the production page.
- **The clip clock** (design review): it fits under the buttons and never reaches below the
  monitors; one clear number; what comes next only when something follows automatically, the
  clip's own time and the time to the studio kept apart, the warning on the time to the studio; no
  second line for a sound against a video.

**Decided in revision 2, after the review, and reversible** (§19): the Level slider applies at the
next Take, with no live change on air; All together does not promise same-frame starts; rows keep
small `AIR`/`PVW` tags, the note mark and the clash warning; Play next moves into phase 3 with the
runner; playback settings belong to the cue, not the shared file.

## 16. Every file each phase touches

Line numbers are at `ca54e17` (2026-09-27) and will drift; the names will not. "New" is a file the
phase creates. Each phase gives its new specs a `// covers:` header naming the files they cover, in
the same commit, as `root/give-any-new-flow-playwright-spec` requires (`cli/` selects no e2e spec).

### Phase 0 - safety net and seams (no visible change)

It runs the first two phases of [`backlog/production-page-phases.md`](backlog/production-page-phases.md)
as written, plus the server-playout module. **`liveCue` and `selectedCueId` do not move.**

| File | Change |
|---|---|
| `src/components/home/ProductionPage.tsx` | the rundown `<aside className="pd-rail">` (3519-3862) and the monitors (2754-2851) move out; the server cue editor (3194-3329) moves out; `livePlayout` (369-378), `playoutVerb` (1924-1984), `dropLivePlayout` (1917) and the server half of `outAll` (2122-2130) move into the module below. `liveCue`, `selectedCueId`, the draft and `runVerb` stay. |
| `src/components/home/CueRundown.tsx` (new) | as `production-page-phases.md` §3 specifies |
| `src/components/home/PlayoutMonitors.tsx` (new) | as that plan's §4 specifies, `programRef` forwarded from the page |
| `src/components/home/ServerCueEditor.tsx` (new) | the server cue editor, props only |
| `src/control/serverPlayout.ts` (new) | plain functions: what a verb sends for a server cue, the on-air map, All out's server half |
| `src/control/serverPlayoutStore.ts` (new) | two subscribable parts: the **ownership** part (on air, per slot, what verbs are legal) and the **timing** part (positions), so each consumer re-renders only for what it reads |
| `cli/test/_fakeCasparServer.mjs` (new) | a stateful fake with an **injectable clock**: layers, lengths, `PLAY`/`LOADBG … AUTO`/`STOP`/`CLEAR`/`PAUSE`/`RESUME`/`INFO`, the empty-layer `AUTO` rule and the failed-`PLAY` rule of §4. `_fakeCaspar.mjs` stays for the parser tests. |
| `e2e/playout-cues.spec.ts` | characterisation: every verb's exact action after a reorder and after a reload; All out across two channels |
| `e2e/playout-baseline.spec.ts` (new) | screenshots of a graphics-only and a mixed production at 1920×1080 and 1366×768 |
| `e2e/hosted-control.spec.ts` | the hosted page lists server cues disabled with their address (nothing asserts it today, 1261-1292) |
| `docs/backlog/production-page-phases.md` | its phases 1 and 2 marked done |

**Built 2026-09-27**, as the table says, with three differences worth knowing:

- `src/control/playoutSlots.ts` (new) holds `slotAddress` and `compareSlots`, re-exported from
  `playoutLink.ts`, so `serverPlayout.ts` imports nothing but types and that file and runs in Node.
  `scripts/server-playout.test.mjs` (new) pins the moved rules there, and
  `cli/test/fake-caspar-server.test.mjs` (new) pins the fake against §4 through the real adapter.
- The hosted page cannot be mounted by an offline spec (it needs the backend), so its assertion
  pins the published payload and the page's own source for the server-cue list, the way
  `hosted-control.spec.ts` already pins the page's Next and Update wiring.
- The baselines are in the focus list (`scripts/e2e-lists.mjs`), because a stylesheet change is
  CORE and reaches no map row. Re-recording them is described at the head of the spec.

### Phase 1 - layout for everyone

| File | Change |
|---|---|
| `src/styles/playout-dashboard.css` | `.pd-body` (231-237) uses `var(--pd-rail-w)`; `.pd-cue` (1359-1449) one line, with the note mark, the clash badge and the state tag; the field grid by container query; phone rules (1457-1554, 1652-1761) untouched except hiding the handle. Any row rule that would hurt the hosted page is scoped to the production page. |
| `src/components/home/ProductionPage.tsx` | `ProductionShell` (3892-4135) places the handle and sets `--pd-rail-w`; the graphic editor block (2963-~3185) puts the layer under Advanced and opens it on a clash |
| `src/components/home/RailResizer.tsx` (new) | pointer drag, arrow keys, double-click reset, limits |
| `src/model/prefs.ts` | the per-device rail width (a `spx-gfx-*` key; `model/never-rename-persisted-deployed-identifiers-storage`) |
| `src/components/home/CueRundown.tsx` | the one-line row of §6.2; following the air, with its pauses |
| `src/components/HostedControlPage.tsx` | nothing required; it shares the `.pd-cue` styles, and the frozen-surface assertions prove it still lists and takes its cues |
| `e2e/playout-fixed-panes.spec.ts` | only the control area scrolls, with the rail narrow and wide |
| `e2e/playout-rail-width.spec.ts` (new) | drag, keys, reset, limits, reload; a twelve-field graphic at 1366 with the rail at its widest overlaps nothing; the row keeps note, kind (accessible name), clash and state tag; the list does not scroll during a drag or with a menu open |
| `docs/PLAYOUT_DASHBOARD.md` | §2 and §4 |

**Built 2026-09-27**, as the table says, with these differences worth knowing:

- **The default width is 23% of the window**, never under 380px, by the owner's decision (§6.1).
- **The re-record job came first.** `.github/workflows/rerecord-screenshots.yml` (#474) re-records
  a screenshot spec's Linux baselines on a runner, so this phase's changed look needed no failing
  CI round trip.
- **The row keeps today's words**: the tag reads `ON AIR` / `PVW` ("as today", §6.2), and a
  looping clip keeps its `⟲` and a clip its length, both from the record, since neither needs the
  server. The marks sit right after the name and the dim summary gives way first.
- **Advanced is remembered for the graphic it was opened on**, and held open (its toggle disabled)
  while the layer clashes. The clash badge selects the cue, scrolls the repair into view and
  focuses its button.
- **The monitors' headers shrink** (`.pd-monitor-name`): at the widest rundown on a 1366 window
  PROGRAM is 143px wide, and its header ran under TAKE.
- `.pd-editor` is the container, not the control area, so the hosted page's editor (the same
  class) reflows by its own width too: its band headings drop above their fields whenever that
  editor is under 620px wide, which on a desktop window of about 900 to 1030px is new.
- The one-line row rules are scoped to `.pd-rundown`, so the hosted page keeps its two-line rows.

### Phase 2 - the clock and the server's truth

| File | Change |
|---|---|
| `src/control/playoutProtocol.ts` and `cli/src/playout/protocol.ts` (`cli/test/playout.test.mjs:18` refuses drift) | `HealthReply.features`, `StatusReply.capabilities`, `SlotState`, `generation` on `ActReply` |
| `cli/src/playout/server.ts` | `/health` (248) `features`; `/status` (298) `capabilities`; `/state` beside `/act` (325), token-checked; the per-slot generation counter |
| `cli/src/playout/amcp.ts` | `parseInfo`, per producer (video, still, colour, html), tolerant of fields a version lacks |
| `cli/src/playout/adapters/casparcg.ts` | `state()`, with the segment arithmetic of §6.7; `capabilities()` (151-157) from the server's version |
| `cli/src/playout/adapters/ograf.ts` | `capabilities()` (262-264) answers none; `/state` answers `unsupported` |
| `cli/src/commands/bridge.ts` | reviewed: reads the protocol version only (23); unchanged |
| `src/control/playoutLink.ts` | keeps `features` from `reachBridge` (396) and `capabilities` from `testConnection` (502); `readState` beside `act` (520); a poller that never overlaps and drops stale generations |
| `src/control/serverPlayout.ts`, `serverPlayoutStore.ts` | readings into the two store parts; reload matching by instance; unidentified items |
| `src/components/home/ProductionPage.tsx` | `onVerb` (2640), `canTake` (2148) and All out's enabled state (2691) read the ownership part of the store, so a server-side switch updates what the verbs may do |
| `src/components/home/ClipClock.tsx` (new) | §6.4 |
| `src/components/home/PlayoutMonitors.tsx` | `STILL`; PREVIEW's length |
| `src/components/home/CueRundown.tsx` | remaining time, `NEXT ON SERVER`, `replaced on the server`, unidentified items |
| `src/styles/playout-dashboard.css` | the clock, the still tag |
| `cli/test/playout.test.mjs`, `cli/test/caspar.test.mjs` | `parseInfo` against the real-server fixtures (§12, item 1); segment arithmetic for a trimmed file; `/state` auth and origin |
| `e2e/playout-clock.spec.ts` (new) | counts, warns at 10 and 5, HOLDING, PAUSED, a trimmed clip, reload mid-clip, a stale reading after a Take ignored, the Bridge gone, an old Bridge's `estimated`, render counts, All out and verbs right after a server-side end |
| `cli/BRIDGE_CHANGELOG.md`, `cli/package.json` | the release; its notes follow `cli/write-every-published-text-person-who` |
| `docs/BRIDGE.md` | §3, §3a, §3b, §5, §9 |

**Built 2026-09-28**, as the table says, with these differences worth knowing:

- **The parser is its own file**, `cli/src/playout/info.ts`, not part of `amcp.ts`: `INFO`'s answer
  is XML, and the line protocol stays about lines. The per-slot generations and instances are
  `cli/src/playout/slots.ts` (new), the Bridge's one piece of memory beside its token (`BRIDGE.md`
  §3). Their tests are `cli/test/state.test.mjs` (new) against the real captures in
  `cli/test/fixtures/info/` (§12, items 1 and 2), and the fake server now answers `INFO` in the real
  shape.
- **The page's side is `src/control/serverState.ts` (new)**: plain functions that fold a reading or
  an accepted action into the store's two parts, and the clip clock's answer as data (`clipClock`).
  A fold that changes nothing hands back the same object, which is what keeps the page from
  re-rendering. `scripts/server-playout.test.mjs` tests them in Node.
- **The real server showed a race the plan did not have** (§4): `202 PLAY OK` comes before the clip
  is on the layer. The first readings after a Take would have taken a fresh clip off air, and a
  re-take of the same file read as somebody else restarting it. The Bridge marks such a reading
  `arriving` for up to 1.5 s, and a reading taken while an action is still in flight reports the
  generation from before it.
- **A Take carries the cue's id** (`cueId`, additive), kept with the instance, so a reload finds
  the row by instance rather than by the item alone.
- **Pause and Resume became named verbs** (`pause`, `resume` in `components/playoutKeys.ts`) with no
  key yet, dispatched by `onVerb` like the rest, for the hardware panel filed in
  `backlog/companion-and-stream-deck.md`.
- `src/components/home/serverThumbnail.ts` (new) is the one thumbnail cache the picker, PREVIEW and
  PROGRAM share. PROGRAM's still sits under the output stage, and with no picture PROGRAM names the
  clip rather than saying nothing is on air.
- **The version** was already 0.4.2 and unreleased (the CLI's own changes), so the Bridge ships as
  0.4.2 without a bump.
- `e2e/playout-baseline.spec.ts` masks the clock's number and an on-air row's time, which move.
- `cli/test/caspar.test.mjs` needed no change.
- **The poll is its own file**, `src/control/serverStatePoll.ts` (new), so Node tests it: never two
  readings out, and a reading the page cannot fold ends that round rather than the poll.
- **Found by the review before landing**: a still got a clock that could never count (the clock now
  follows a clip or audio file only, by the server's reading or, before it, the list's length);
  Pause and Resume now move the generation too, so a reading from before a Pause cannot restart the
  clock; a paused loop says PAUSED; and an instance of this Bridge's for a cue of the rundown names
  that cue wherever it plays, which covers a re-take whose reading beats its answer, another tab of
  the same production, and a cue moved to another layer while it was up. 2.3 was read as well as
  2.5.0 (§4).

### Phase 3 - clip settings and sequences

| File | Change |
|---|---|
| `src/model/shows.ts` | `PlayoutItem.mediaKind`; `ShowCue.playback`; the effective-ending function and loop precedence of §7 (`setPlayoutItemLoop`, 589-597, is no longer called by this build; it stays for reading old records); setters for the cue's playback; `addPlayoutItem` (536-567) records `mediaKind` and puts audio on `PLAYOUT_AUDIO_LAYER = 5` |
| `src/components/home/PlayoutItemPicker.tsx` | `add` (101-105) passes the server's kind word; the `onAdd` type (46) carries it |
| `src/components/home/ServerCueEditor.tsx` | At the end (with Play next's target and its reasons), Fade, Level (applies at next Take), Advanced with validated trim; controls off without the capability |
| `src/control/serverPlayout.ts` | the playback descriptor from the cue; Play next resolved from the rundown at the Take into a `sequence`; a legacy cue sends today's action; a cue the Bridge cannot honour is not taken |
| `src/components/home/ProductionPage.tsx` | `canTake` (2148) and the Take button say why a cue cannot be taken with this Bridge |
| `src/components/playoutKeys.ts` (43-69) | `p` toggles pause on a server clip (`components/keep-every-playout-verb-key-keymap`); bound only while playout is on screen, not in Data or Audience, not while typing, and a held key does not repeat |
| `src/control/playoutProtocol.ts` and its mirror | `MediaPlayback`, `sequence` |
| `cli/src/playout/server.ts` | `readAction` (185-207) validates the descriptor and `sequence`; the per-slot serial queue and the runner's state |
| `cli/src/playout/runner.ts` (new) | the sequence runner of §6.10, with an injectable clock |
| `cli/src/playout/adapters/casparcg.ts` | `casparLine` (43-81) becomes the lines for an action: `PLAY … [IN] [OUT] [MIX n] [AF "volume=…"] [LOOP]`, `LOADBG … AUTO` for Clear and followers, `CLEAR`/`PLAY EMPTY MIX` for Out with a follower, `LOADBG EMPTY` after a refused `PLAY`; fades converted with the channel's frame rate, read once per target and channel and read again when the channel's format changes |
| `cli/src/playout/adapters/ograf.ts` | refuses media playback fields and a level-only `update` (332) |
| `cli/test/playout.test.mjs`, `cli/test/runner.test.mjs` (new) | every line and its order; the exact old line for a legacy action; 25p, 50p, 29.97 and interlaced conversions; every runner case of §18 against the fake, fault-injected |
| `e2e/playout-cues.spec.ts` | each setting's action; a legacy `loop: true` cue still loops; audio on layer 5; a cue with a fade on an old Bridge cannot be taken and says why |
| `e2e/playout-sequence.spec.ts` (new) | Play next's target and reasons; TO STUDIO with overlaps; Out mid-sequence |
| `cli/BRIDGE_CHANGELOG.md`, `cli/package.json`, `docs/BRIDGE.md` | the release; §3 records the runner as the Bridge's one piece of state |

**Built 2026-09-28**, as the table says, with NoaCG Bridge 0.5.0, and these differences worth
knowing:

- **The runner is its own file, `cli/src/playout/runner.ts`**, and what it remembers - the sequence,
  the follower queued behind a clip, the serial queue per slot - is in `cli/src/playout/slots.ts`
  beside the generations and instances. Its tests are `cli/test/runner.test.mjs`: every runner case
  of §18 against the stateful fake, each guard broken on purpose to see its test fail.
- **The real server found a race the source did not show** (§4): behind a clip that starts part way
  in, a follower queued with the Take airs at once. Such a take plays its clip alone, and the runner
  queues its follower - or its Clear at the end - once the clip is inside its segment. The fake
  server models the window.
- **The runner reads the slot once more right before it queues**, since no generation of its own
  moves when another client or another Bridge takes the slot (§6.10, rules 6 and 8).
- **2.3's transitions name no producer**, so a MIX read as something unknown there, which the runner
  would have taken for another client's content; the wrapped producer is now read off what the
  transition carries.
- **A cue whose only setting is Loop goes out as the old `loop` field**, which every Bridge
  understands, so it needs no new Bridge; `playback` carries only what a newer Bridge must honour.
  A fade out on a clip that holds is Out's, not the Take's.
- **A sequence entry carries the server's word for its file and its length** (`media`), so the
  Bridge refuses a still, an unknown length and a member under two seconds, and the page's clock
  counts TO STUDIO from the Bridge's own list of what is left after a reload.
- **Pause and Resume keep a running sequence** and move the generation, so a queue decided on a
  reading from before a Pause is dropped; Take, Out, Clear and a new sequence end it.
- **Out with a follower queued sends `CLEAR c-l`**, and a refused replacement Take is followed by
  `LOADBG c-l EMPTY` only when a file of a sequence was queued: a Clear at the end left armed is the
  old cue's own ending.
- **Play next skips anything on another slot**, not only graphics, and says what it skipped. A
  member whose own Play next cannot be found ends the run by holding; the TAKEN cue's must be found,
  or its Take is off with the reason.
- **An older item learns its kind and length from the server's list** once per production when the
  Bridge answers, and the kind can be named under Advanced when the list does not have the file.
- **`P` acts on the selected cue's clip when it is the one up, else the clip the clock follows**
  (`pauseTarget` in `serverState.ts`), so it reaches the clip on air while the selection walks on.
- The version: the CLI's unreleased 0.4.2 notes and this Bridge ship as **0.5.0**, since the
  Bridge had already released 0.4.2.

### Phase 4 - folders

| File | Change |
|---|---|
| `src/model/shows.ts` | `Show.folders`, `ShowCue.folderId`; every writer keeps folders whole: `addShowCue` (499-522, also Duplicate), `addGraphicToShow` (393-432), `addPlayoutItem` (536-567), `moveShowCue` (687-697), `removeShowCue` (707-719), `removeShowGraphic` (434), `removePlayoutItem` (625), `setShowCues` (659-684, drops `folderId`); new `addFolderFromSelection`, `renameFolder`, `setFolderMode`, `removeFolder` (keeps the cues), `moveCueIntoFolder` |
| `src/model/teamShowMerge.ts` | `FIELD_LABEL` (26-37) gains `folders`; after `mergeItems` (60-80), a step that gathers split folders and reports `folders` |
| `src/components/home/CueRundown.tsx` | folder rows, indentation, collapse, drag in and out (3570-3585 today), the folder menu through `LibMenu` (`home/AGENTS.md`: it measures which way it opens), `(continued)` runs |
| `src/components/home/FolderEditor.tsx` (new) | §6.5, a folder |
| `src/components/playoutKeys.ts` | `stepSelection` (109-119) walks visible rows; a folder row is one step; Space on a folder row takes the folder in every Space mode |
| `src/components/home/ProductionPage.tsx` | `onVerb` (2640) dispatches a folder as well as a cue; `canTake` and All out know folders |
| `src/control/serverPlayout.ts` | a folder Take: Play through → one `sequence`; All together → its cues one after another with per-cue results, conflicting slots refused before sending; folder Out |
| `src/components/home/ProductionAudienceWorkspace.tsx` (467, 517) | reviewed: finds cues by id; unchanged |
| `src/components/home/sections/ProductionsSection.tsx` (58) | reviewed: counts cues, and folders are not cues; unchanged |
| `src/control/hostedCombine.ts` (112), `src/model/profile.ts` (683), `src/control/combine.ts` | reviewed: combined controls reference cues by id; unchanged |
| `src/export/spxLeftBehind.ts` (72) | reviewed: exported cue references by id; unchanged |
| `api/_lib/dataIngest.ts` (247) | reviewed: the data API finds published cues by id; unchanged |
| `src/control/hostedControl.ts`, `HostedControlPage.tsx`, `src/export/showExport.ts`, `src/control/productionControllerHtml.ts` (663), `src/packs/graphicsPack.ts`, `api/_lib/me/packageShape.ts` | **not changed**: folders are not published, exported or packed; each keeps the flat order, pinned per §8 |
| `e2e/playout-folders.spec.ts` (new) | from selection, rename, drag in and out, collapse, keyboard, removed when empty, duplicate joins the folder, a split folder read and gathered, the three modes against the fake, Loop the folder, All together's partial result and its refused conflicting slots; folder changes report success only after the durable write (`components/never-report-save-storage-layer-has`) |
| `e2e/production-pack.spec.ts`, `e2e/production-persistence.spec.ts` | a production with folders round-trips a reload; a pack keeps graphic order and drops folders |
| `scripts/team-show-merge.test.mjs` | the existing merge tests grow the folder cases: one teammate folders A and B, the other orders A, C, B, D; the result is gathered and reported; two teammates adding folders at once keep both |
| `docs/PLAYOUT_DASHBOARD.md`, `docs/BRIDGE.md` | the new behaviour |

**Built 2026-09-28**, as the table says, with NoaCG Bridge 0.6.0 for Loop the folder, and these
differences and decisions worth knowing:

- **The record** is `Show.folders` (`id`, `name`, `mode`, and for Play through `end: 'loop'` and a
  `slot`, plus `collapsed`) and `ShowCue.folderId`, both optional, so the version stays 2. A folder
  has no member list: its cues stand together in the flat cue list. Reading tolerates what an older
  build or a whole-record write can leave: a `folderId` naming no folder reads as none, a folder no
  cue names is not drawn, and a folder in two runs shows its later run as `(continued)`. Nothing
  reorders on read; the next folder writer settles the record (drop what is dangling, then gather).
  The pure steps are `src/model/showFolders.ts`, the rows as drawn `src/model/rundownRows.ts`.
- **Writers found beyond the table** (§14, question 3): the Audience workspace's stage tally and
  the page's picture upload both append through `addShowCue`/`addGraphicToShow`; the whole-record
  paths - a sync pull and its conflict copy (`upsertShow`), a team production applied from the
  server, another tab's write adopted by the durable store, and moving a production to a team -
  write records as they come. None of them does folder work, and none needs to: an append never
  lands in a folder, and a record they bring is read as above. The new `moveInRundown` is the one
  writer every drag goes through, so a drag is one write, where the old walk wrote once per step.
- **The last cue leaving a folder takes the folder with it**, whichever way it leaves; a removal,
  a server item's removal, a graphic's removal and a whole-rundown replacement all drop a folder
  left with no cue.
- **Duplicate goes right after the original everywhere**, in its folder when it is in one, and now
  carries the cue's playback, which it used to drop. `e2e/productions.spec.ts` changed one line.
- **A new folder** is One by one, named one past the highest `Folder N` in use, and does not move
  the cursor. It comes from a shift-click range (its own state beside `selectedCueId`, owner answer
  1; a collapsed header stands for its hidden cues) or from a cue's menu; a cue made into a new folder
  leaves its old one and lands right after it.
- **Where a drop lands** is read from the third of the row under the pointer: the middle third is
  the old drag exactly, the top and bottom thirds land before and after and join that row's folder,
  a header's top third lands above the folder, the rest of it first in an open folder or last in a
  collapsed one. A folder never goes inside another; dropped on another folder's row it lands beside
  that folder. A pointer in the gap between rows keeps its aim, and while a row is dragged the list
  ends with a strip to drop it at the end. A drop that cannot land (a graphic, still, template or
  missing file into a Play-through folder) says why under the list while it hovers and after, and
  writes nothing.
- **Collapse is stored on the record**, so it follows the production to a teammate; the list never
  opens a folder by itself. A collapsed header carries the tally, the clash badge and "replaced on
  the server" of the cues it hides, and a dashed ring when the selected cue is one of them.
- **The keys walk the rows as drawn**: a header is a stop, a collapsed folder is one step, and a
  `(continued)` run is a stop of its own. A held key fires once on a header (`VerbPress`), since a
  folder's Take is several actions; `NO_REPEAT` is unchanged, so a held SPACE on a cue row still
  repeats as it did on both React surfaces. `folder-new` and `folder-toggle` are named verbs with no
  key yet, for a Companion button.
- **A held header reads as "no cue selected"** to every cue verb, the editor and the graphic's
  actions, by the null path an empty rundown already takes. `selectedCueId` still holds one cue,
  the folder's first, so the cursor stays put if the folder goes. No Take changes the selection.
- **SPACE on a header takes or takes off in both Space modes**, never previews: the same
  `spaceAction` with `previewed: true`, so the table the hosted page and the exported controller
  share is untouched. PREVIEW shows a Play-through or All-together folder's first cue ("first in
  Block A") and says a One-by-one folder has nothing to preview.
- **One by one** is tidiness only: TAKE is off with "Take each cue in this folder.", its cues are
  taken one at a time exactly as outside a folder, and TAKE OFF, `0` and Out on the header take off
  only its own cues, each server cue with its own fade out and its graphics together.
- **Play through** plays on the folder's slot, layer 10 on the clip channel unless the panel sets
  one (owner answer 2). A clip before the last gives up its own ending and keeps its fades; the last
  keeps its own ending, with a stored Play next read as Hold ("Play next does not leave the folder").
  A Take on a clip in the folder plays from it to the end, rotated when the folder loops, and a
  one-clip folder is a plain take. Loop the folder needs NoaCG Bridge 0.6.0 (`sequence-loop`): with
  an older Bridge the Take is off and says so rather than stopping after the last clip. The page
  reads the folder's loop only from the Bridge's `sequence.loop`, never from the slot's own `loop`.
  A folder moved to another slot while it plays is taken off its old slot first. One file never airs
  on two slots through this page: another cue of a file that a folder has up elsewhere is refused
  with where it is.
- **All together** checks everything before it sends anything - a file or graphic gone, two server
  cues on one slot, two cues of one graphic, two graphics on one layer, NoaCG Bridge not there, any
  cue's own Take check, and a cue set to Play next - then sends the server cues in rundown order and
  then the graphics, each awaiting its answer, with no retry. A cue that did not go up says NOT
  TAKEN on its own row with the reason, and the note line counts what went up. Out and All out stop
  a Take still being sent: what lands after is taken back off (cut, after All out) and nothing after
  it is sent. The clip clock follows the longest file that ends.
- **What a header shows** is one pure function (`src/control/folderAir.ts`) over the ownership part
  and `liveCue`, never the timing part, so a reading that only moves a clip's position renders
  nothing but the clock and the rows (pinned with both kinds of folder up). A Companion button can
  light from the same data.
- **Folder writes that report** (make, move, remove) wait for the durable write and claim its
  failure on the line under the list; renaming, the mode, the end, the slot and collapsing are
  background writes that report nothing.
- **Every folder style starts at `.pd-rundown`** (or the folder panel), pinned by
  `scripts/folder-css-scope.test.mjs`, so the hosted page's rows draw as they did.
- **The Bridge**: `sequence` takes `loop`; the entry after the last is the first; a reading's
  `sequence` lists every other entry in the order they come round, with `loop: true`; no entry of a
  looping run carries an ending, the two-second minimum covers the first entry too, and the runner
  keeps reading until Out. A switch to the same file is seen by the position jumping back more than
  0.1 s. `loop` is refused on any verb but `take` and `sequence`, and the page and the Bridge share
  `MAX_SEQUENCE_ENTRIES` (100).
- **An adversarial review before landing** (four reviewers, each finding put to a skeptic) found
  seven defects, all fixed: a folder record with no mode, or one this build does not
  know, could be taken as All together while it was drawn as One by one (a folder is now told from a
  cue by having no source, and every reader goes through `folderMode`); All out was off while a
  folder's Take was still being sent with nothing landed; the header could say a folder loops from
  the record rather than the server; just after a Take, the old copy of the same file still on the
  layer could make the Bridge think the next copy had started; a folder dragged beside another drew
  its line on the row under the pointer; a menu left open on a row a collapse hid held the list
  still; and a refused team save that merged twice reported only the first merge's losses. Five
  have a test that fails without the fix. The menu case is out of reach of a press on this page (an
  outside press closes the menu) and the team save needs a team backend, so those two were checked
  by reading.
- **A merge that puts a folder back together says so on its own line** ("A folder the two versions had
  pulled apart is back together in the rundown."), never as a change of the operator's that theirs
  replaced, which it is not. A one-clip Play-through folder may loop on any Bridge, since it goes
  out as a plain looping take.
- **One sentence is loose**: Play next's "the next clip is in another folder" is also what a clip in
  no folder hears when the next clip on its layer is in a folder.
- **Measured on the real servers** (§12, items 8, 11 and 12): no black at any switch of a looping
  folder, the wrap included; a video and its own audio file sent one after another start within a
  frame or two; and after an AUTO switch into a clip trimmed with `IN`, nothing is queued early.

### Not touched by any phase

The editor (`src/components/editorFoundation/**`, `src/editor/**`, `src/App.tsx`), the
editor-opening code in `HomePage.tsx`, `GraphicControlPage.tsx` and `CreationWizard.tsx`; the output
renderer (`/output`); the database and its migrations; the Presenter page.

## 17. Where this plan meets the repository's standing rules

1. **The dashboard-parity invariant, retired 2026-09-27.** It said the hosted page and the
   production page render identically and every control goes on both in one commit. The owner
   loosened it (Q5), and `components/build-playout-dashboard-desktop-production-page` supersedes it:
   the production page leads, the hosted page is a best-effort companion that may look different or
   lack controls, a control that needs the Bridge lives only on the production page, and **no change
   may break what the hosted page already does** (§8).
2. **`backlog/production-page-phases.md`**: phase 0 runs its phases 1 and 2 as written; `liveCue`
   and `selectedCueId` never move.
3. **The Bridge keeps no state** (`BRIDGE.md` §3), with two exceptions, both in memory: since phase
   2 each slot's generation and instance (§6.7), recorded in `BRIDGE.md` §3; from phase 3 the
   sequence runner (§6.10), kept beside them.
4. **Bridge releases** are routine and need no owner (`GOALS.md`, "Autonomous work"). Their notes
   follow `cli/write-every-published-text-person-who`.
5. **Owner checks only where a person must judge** (`root/verify-proportion-change-against-spec-acceptance`):
   §11 lists them.
6. **Saves are reported only once landed** (`components/never-report-save-storage-layer-has`):
   folder creation, moves and removal await the durable write before they say done or continue.
7. **One keymap** (`components/keep-every-playout-verb-key-keymap`): `P` lives in `playoutKeys.ts`,
   bound only while playout is on screen.
8. **Popovers through `LibMenu`** (`src/components/home/AGENTS.md`): the folder menu measures which
   way it opens and closes on Escape and an outside press.
9. **Guards tested to fail, and duplicate entrances asserted as arithmetic** (`e2e/AGENTS.md`).
10. **Layer-clash warnings and each export target's validation** stay as they are; §6.2 and §6.5
    keep the clash visible.
11. **Additive fields, no version bump** (`root/version-every-persisted-format-ship-breaking`), and
    the old-writer behaviour of §7 pinned with the old build's own functions.

## 18. What could go wrong, and the test that guards it

"Runner" tests run in `node:test` against the fake server with an injectable clock (§10); "e2e"
tests run in Playwright with the Bridge faked at the network layer. Every guard has a test that
breaks it on purpose.

**The sequence runner and the server**

| # | Case | Guard | Test |
|---|---|---|---|
| 1 | A runner queue arrives after Out, onto an empty layer, which would play it at once | generations: work planned under an old generation is dropped unsent | runner: delay the queue across Out and across a new Take; assert no old follower ever airs |
| 2 | A replacement Take's `PLAY` is refused; the old follower stays armed | `LOADBG c-l EMPTY` after a refused `PLAY` | runner: refuse the `PLAY`; advance past the old clip's end; nothing new airs |
| 3 | Pause inside the MIX threshold; a follower queued while paused starts at once | never queue onto a paused slot | runner: pause before, at and after the threshold; try to queue while paused; resume |
| 4 | A still in a sequence never ends | stills are Hold-only; the Bridge refuses a still in a sequence | runner and e2e: a still offered Play next; a sequence entry of a still refused |
| 5 | An old item with no `mediaKind` joins a sequence | resolved from `CLS` first; unresolved, not allowed in a sequence | e2e: an old record's clip set to Play next |
| 6 | A trim outside the file, or start after end | validated in the panel and refused by the Bridge | e2e and unit: invalid ranges |
| 7 | Fades at 50p, 29.97 and interlaced channels | seconds converted with the channel's rate, cached per target and channel, re-read on a format change | unit: each format; runner: a format change |
| 8 | A follower clip shorter than the queue-ahead margin | members of at least 2 seconds; the runner reads four times a second | runner: a 2-second member queues its follower in time; a shorter one is refused |
| 9 | Another client takes the slot | the runner ends its sequence and sends nothing; the row says `replaced on the server` | runner and e2e |
| 10 | Two Bridges on one slot | the last taker owns it; the other ends its own and never re-queues | runner: two runners against one fake server |
| 11 | The Bridge restarts mid-sequence | `/state` answers with no instance; the page says the sequence stopped; a queued loop keeps looping | runner: restart separately from a dropped connection |
| 12 | A cue with new settings on an old Bridge or an unsupported target | Take disabled with the reason; legacy cues send today's line | e2e with a fake 0.4 Bridge and an OGraf target |
| 13 | The Bridge refuses a field its adapter lacks | refused with the hop named, never dropped | unit: OGraf with media fields and a level-only `update` |

**Timing and the page**

| # | Case | Guard | Test |
|---|---|---|---|
| 14 | A slow `INFO` answer from before a Take arrives after it | readings older than the page's last accepted generation are ignored | e2e: delay a pre-Take reading past the Take |
| 15 | Twice-a-second updates re-render the whole page | two store parts; only the clock and rows read timing | e2e: render counts bounded; verbs and All out right after a server-side end |
| 16 | A hidden or closed tab | the Bridge runs sequences; the page re-reads `/state` on return | runner: the page gone mid-sequence; e2e: a hidden tab |
| 17 | Reload mid-clip, same file twice, adjacent identical clips | matched by instance; otherwise an unidentified item | e2e: each, including a same-file retake by another client |
| 18 | TO STUDIO wrong with crossfades or trims | segment lengths minus overlaps; `?` when unknown | unit and e2e: 3×10 s with two 1 s MIXes reads 0:28 |
| 19 | Keyboard | `P` and folder steps in `playoutKeys.ts` | e2e: folder selection, every Space mode, a held `P`, focus in a field, Data and Audience open |

**Built in phase 2** (2026-09-28), each with its guard broken on purpose to see the test fail:
case 14 (`e2e/playout-clock.spec.ts`, "a reading from before a Take that lands after it is
ignored"; the Bridge's half, a reading taken while a Take is in flight, in
`cli/test/state.test.mjs`); case 15 (the same spec's render count, with the page's clock frozen so
its own timers cannot pass for the store's, and "a clip ended on the server takes the row, Out and
All out with it"); the page's half of case 16 ("the tab coming back into view reads the server at
once"; the Bridge's half comes with the runner); case 17 ("a reload finds its own clip by
instance", a same-file take by another client, a restarted Bridge's unidentified item, and a
same-file re-take by this page that must not read as a restart).

**Built in phase 3** (2026-09-28), each guard broken on purpose to see its test fail: cases 1 to 11
in `cli/test/runner.test.mjs` (case 1 twice, a queue decided before Out, a new Take or a Pause, and
one waiting in the slot's queue; case 3 before, at and inside the MIX window; case 10 including a
queue decided just before the other Bridge's take), the page's halves of cases 4 to 6 and 18 in
`scripts/server-playout.test.mjs` and `e2e/playout-sequence.spec.ts`, case 12 in
`e2e/playout-cues.spec.ts` (a 0.4 Bridge and a 2.2 server), case 13 and 24 in
`cli/test/playout.test.mjs`, case 19's `P` in `e2e/playout-clock.spec.ts` (held, typing, on Data), and
case 23 in `e2e/playout-cues.spec.ts` through the shipped `setPlayoutItemLoop`. The Bridge's half of
case 16 is the runner playing with nobody reading `/state`.

**The record**

| # | Case | Guard | Test |
|---|---|---|---|
| 20 | A `folderId` naming no folder | read as no folder; removing a folder clears its cues' ids | e2e: an orphan in a record |
| 21 | A folder split by an older build or a merge | shown as `(continued)` runs; gathered by the next move and by the merge, which reports it | e2e and a merge test: the A, C, B, D case |
| 22 | Concurrent moves and deletes, duplicate, import | every writer of §16 phase 4 keeps folders whole | e2e per writer |
| 23 | An older build edits loop | §7's precedence; this build never writes `item.loop` | e2e: edits through the shipped `setPlayoutItemLoop`, then this build reads |
| 24 | Level applied twice | no `MIXER VOLUME` is ever sent; the level is the clip's `AF` | unit: no MIXER line in any action; real server: measured level (§12, item 4) |
| 25 | The frozen surfaces | each checked for what it does today (§8) | e2e: hosted page, export and pack with folders and playback settings |

**Built in phase 4** (2026-09-28), each guard broken on purpose to see its test fail, in
`e2e/playout-folders.spec.ts` unless named: case 19's folder half (the walk over the rows as drawn,
a held SPACE and a held `0` on a folder, both Space modes); case 20 and 21's rundown half (an
orphan and an empty folder drawn as nothing, a split folder's `(continued)` run held by the keys
and gathered by the next drag in one write) with the merge half in
`scripts/team-show-merge.test.mjs`; case 22 through every writer against the durable store (a
removal, a step, the appends, a server item's and a graphic's removal, a whole-rundown replacement)
and the property tests of `scripts/show-folders.test.mjs`; case 25 as one test building the
published payload, two export packages and a pack from a production with folders, none of which
carries one. The Loop-the-folder runner cases are in `cli/test/runner.test.mjs`, each guard broken
by editing `cli/dist`.

## 19. The review of revision 1, and what was done

Codex reviewed revision 1 at `5b3b044` against the code and the CasparCG source (2026-09-27): "AGREE
WITH CORRECTIONS. The overall direction is sound, including putting sequence execution in the
Bridge." Each finding was checked against the source before it was accepted; none was rejected.

| # | Finding | Done |
|---|---|---|
| 1 | The countdown is wrong for trimmed clips (`file/time` is the whole file) and sequences (overlaps) | accepted: `SlotState` with segment and position (§6.7); TO STUDIO minus overlaps (§6.4) |
| 2 | Live volume stacks with the clip's `AF` and leaks into followers | accepted: no `MIXER VOLUME` at all; the level applies at the next Take; a live fader later (§6.6) |
| 3 | Cancelling a sequence does not cancel the server's queued follower (late queue, failed PLAY, pause) | accepted: serial queue per slot, generations, disarm, no queue while paused (§6.10) |
| 4 | `BEGIN … COMMIT` is not a transaction and does not prove sync | accepted: All together sends one after another, per-cue results, conflicting slots refused; batching later (§6.6) |
| 5 | The file, the cue and a playback instance are conflated | accepted: playback on the cue (§7), instance ids (§6.10), unidentified items after reload (§6.7), one authority per slot |
| 6 | Take lacks the end fade; Play next needs the runner in phase 3; the transition between two clips is undefined | accepted: one playback descriptor (§9); runner in phase 3 (§11); the incoming clip decides (§6.6) |
| 7 | Capabilities are per target, and old Bridges silently change authored playback | accepted: `/health` features and `/status` capabilities; Take disabled with a reason; the Bridge refuses, never drops (§6.9) |
| 8 | Folders split under the team merge; loop has two writable places; empty folders have no place | accepted: gathered and reported by the merge; one writable loop; folders made from selection and removed when empty (§7) |
| 9 | Stills, MIX-only overlap, frame arithmetic, 2.4 vs 2.5 batching | accepted: §4 corrected; producer-aware parsing; format conversion per target and channel; batching dropped |
| 10 | §16 misses page wiring and consumers | accepted: `onVerb`, `canTake` and All out wiring per phase; every consumer listed with "unchanged because" (§16) |
| 11 | `page.clock` does not drive the fake server; guards were happy paths | accepted: an injectable clock in the fake and the runner; fault-injected guards (§10, §18) |
| 12 | The denser row drops note, kind, clash and state; scrolling must stay on the control area | accepted: §6.2 keeps each; §6.1 keeps the one scroller; the list does not follow the air during edits |
| 13 | §17 cited retired rules and over-required owner items | accepted: §17 and §11 cite the active rules |

Its answers to revision 1's questions: the Bridge runner, yes; polling twice a second, a reasonable
start to be measured, with commands given priority; Play next past graphics, keep it but name the
exact target and the skipped cues; flat folders, a foundation that needed the rules §7 now has; the
phase 0 split, yes, without building a general framework; graphics-only losses, yes, now kept.
