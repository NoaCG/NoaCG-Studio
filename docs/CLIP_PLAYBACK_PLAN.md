# Clip and audio playback, and the rundown around it - the plan

**Draft, 2026-09-27. Nothing in it is built.** It comes from an owner planning session; the owner
has answered its four questions (§15) and approved the design, and it now waits on one independent
review of the plan AND the code it touches before phase 0 starts. §14 says what to challenge, §16
lists every file each phase touches, §17 where the plan meets the repository's standing rules, and
§18 every failure case with its guard. Once approved it replaces §3
("Build 2: basic media") of [`RUNDOWN_AUTOMATION_PLAN.md`](RUNDOWN_AUTOMATION_PLAN.md) and closes
the open half of [`backlog/video-through-playout-wrapper.md`](backlog/video-through-playout-wrapper.md).

The mockups are drawn, not built. They live beside the research in
[`research/clip-playback-2026-09-27/`](research/clip-playback-2026-09-27/), with `mockup.html` as
their source:

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
- **No NoaCG-side timer that fires a clip.** The server does the sequencing (`LOADBG … AUTO`); the
  page only queues the next file and reads back what happened. This is `BRIDGE.md` §5a's rule.
- **No mixer items** (picture-in-picture, crop, opacity, colour), no push/wipe/slide transitions, no
  input routing, recording or streaming, no raw AMCP command items.
- **No new features on the phone surfaces** (the hosted Control page, the Presenter link, the
  exported controller) in these phases. They keep working; §8.
- **No change to the graphic editor** or to the editor-opening code on Home, the graphic control
  page or the wizard.

## 3. What exists today

- **Server clips play from the rundown** through NoaCG Bridge: Take, Out, Pause, Resume, and Loop
  since 2026-09-25. Each verb is one AMCP line (`cli/src/playout/adapters/casparcg.ts:46-80`), and
  the page never composes AMCP itself (`BRIDGE.md` §3).
- **Every clip shares layer 10**, and an audio file is treated as a clip on the same layer, so a
  sting replaces the VT (`src/model/shows.ts:526`). The picker keeps a clip's length and drops the
  server's kind word (`src/components/home/PlayoutItemPicker.tsx:102`).
- **What is on air on the server is page memory only**, so a reload forgets it, and nothing reports
  back what the server really holds (`BRIDGE.md` §5, "What the page believes").
- **The rundown is a fixed 380px column** (`src/styles/playout-dashboard.css:235`). Each row is two
  lines tall, so about ten rows show at 1080p.
- **The production page is 4,165 lines in one component** (`src/components/home/ProductionPage.tsx`),
  and server playout, the rundown, the cue editor and the verbs all live in it.
- **The layout has an owner-set contract** (`PLAYOUT_DASHBOARD.md`, 2026-08-21): the minimum
  supported window is 1366×768, the class laptops' size. The verb bar sits beside PROGRAM down to
  that width, the monitors never change size with the selected cue, and a phone (≤900px) stacks
  everything in one scrolling column with the verbs pinned to the bottom.
- **The hosted Control page** ("Operate from a phone or tablet") lists server cues as disabled,
  because a phone cannot reach the operator's Bridge (`src/components/HostedControlPage.tsx:1261`).

## 4. What CasparCG does, checked against its source

Checked on 2026-09-27 against the server's source at the `v2.3.3-lts-stable` and `v2.5.0-stable`
tags (github.com/CasparCG/server). The AMCP wiki is labelled "may not be valid for versions newer
than 2.0.x", so the source is the authority. **Every line still needs the real 2.5.0 server** (§12).

| Behaviour | Where in the source | Consequence for NoaCG |
|---|---|---|
| A clip that reaches its end without `LOOP` keeps showing its **last frame** until something replaces it. | `core/producer/layer.cpp`, `receive()`: an empty frame falls back to `last_frame()` | Hold last frame is today's behaviour and the default. |
| `LOADBG c-l <clip> [transition] AUTO` plays the background by itself when the foreground ends. One background per layer. | `layer.cpp`, `auto_play_`; `AMCPCommandsImpl.cpp`, `loadbg_command` | The server can chain one clip ahead with the page closed. The page queues the next as each one starts. |
| With a MIX (or any) transition, AUTO starts the transition **that many frames before the end**, so the transition finishes on the last frame. | `transition_producer.cpp`, `auto_play_delta()` returns the duration | A clip set to Clear with a Long (1 s) fade starts fading 1 s before its end, and loses its last second. Said on screen. |
| A MIX transition **crossfades the audio** too. | `transition_producer.cpp`, `audio_transform.volume` | Fades are sound and picture together, with nothing extra. |
| `EMPTY` is a transparent colour producer (`#00000000`), not an empty layer. | `color/color_producer.cpp`, `get_hex_color` | "Clear" leaves a transparent layer. Invisible on air; `INFO` reports a colour producer. |
| `LOADBG` without `AUTO` sets `auto_play_ = false`. | `layer.cpp`, `load()` | Queuing EMPTY without AUTO cancels a pending switch. |
| `PLAY`/`LOADBG` of a clip take `SEEK`, `IN`, `OUT`, `LENGTH`, and an **audio filter `AF`** (FFmpeg syntax), in 2.3.3 and in 2.5. | `ffmpeg_producer.cpp`, parameter parsing | Trim is cheap. A per-clip level can travel **with the clip** as `AF "volume=0.5"`, so it stays right when the server switches clips by itself. |
| `MIXER c-l VOLUME <gain> [frames]` is a linear gain on the **layer** (1.0 = original), and it outlives the clip. | `AMCPCommandsImpl.cpp`, `mixer_volume_command` | Used only for a live nudge while on air, and reset to 1 at each manual Take. |
| `BEGIN` … `COMMIT` runs a batch of commands on the **same frame**, across layers and channels. **2.5 only**; absent in 2.3.3. | `AMCPProtocolStrategy.cpp`, `parse_batch_commands`; `AMCPCommandQueue.cpp`, `Execute` | "All together" is frame-exact on 2.5, and one command after another on 2.3. |
| `INFO <channel>` reports each layer's foreground `file/name`, `file/time` (elapsed and length in seconds), `paused` and `loop`, and its background producer. | `layer.cpp` `state_`; `av_producer.cpp`, `file/time` | **The page can read the truth** every half second: what is on air, the real remaining time, and what is queued. No OSC needed. |

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
  graphics and audio are **attached** to it at an offset ("lower third in at 0:05 for 8 s"). They
  move with it.
- **What nobody does**: auto-take a graphic by guessing its length; chain clips from a timer in the
  client; leave a finished clip frozen on air by accident.

## 6. The design

### 6.1 One screen, sized by the operator

- **Design target 1920×1080. Floor 1366×768**, as the layout contract already says (owner, Q1).
  Below the floor the existing phone layout takes over, unchanged in behaviour.
- **The rundown's width is the operator's.** A drag handle on the divider, from 320px to 60% of the
  window; double-click returns it to the default (about 40% at 1920, 380px at 1366). Remembered per
  machine in `localStorage`, never in the production: two operators of one show sit at different
  screens. Everything else on the left takes what is left.
- **The monitors keep their rule**: sized from the room that is left, computed per production and
  never per cue, so they never jump between cues (`PLAYOUT_DASHBOARD.md`, 2026-08-21). A wider
  rundown makes them smaller; the verb column beside PROGRAM stays.
- **The cue panel reflows to its own width**, through CSS container queries, never the window's:
  - graphic fields fill as many columns as fit (`repeat(auto-fill, minmax(200px, 1fr))`);
  - a clip's settings put each label above its control when the panel is narrower than 620px;
  - the panel scrolls inside itself when it is taller than the room, as the control area already
    does, and the monitors and verbs never scroll away.

  So a quiz with twelve fields and seven controls fits at 1920 with the rundown at 440px
  (`graphics-only-1920.png`), and folds into more rows when the rundown is dragged to 860px
  (`graphics-only-wide-rundown-1920.png`) without breaking.

### 6.2 The rundown row: minimal, one line

Every row is one line, 34px, so about twenty rows show at 1080p against ten today.

| Part | Shows | For |
|---|---|---|
| number, kind icon | `▶` clip, `♪` audio, `T` graphic, `▤` folder | every row |
| name, then a dim summary | a graphic's first field values (`Alexandra Riva`); a clip's own name | every row |
| end mark, after the name | `⟲` loops, `→` plays the next, `⌀` clears; **nothing** for Hold, the default | clips only |
| length, right-aligned | `3:00`; while on air, the **remaining time** in red (`-0:09`) | clips only, and the column is absent when the rundown has no server cue |
| slot | `2-10` for a server cue, `L20` for a graphic, as today's rows already write them | every row |

The row's **state is its colour**, as today, with no state column: red tint and a thin progress
bar along its bottom while on air, amber outline while in preview, dimmed once played. One word is
kept, because it is a promise the server will keep by itself: a clip queued to play next on the
server wears **`NEXT ON SERVER`** after its name.

**Rejected: a NOW / NEXT strip above the rundown** (it was in the first mockups). The monitors
already say what is on air and what is in preview, the clip clock (§6.4) says what ends when, and
the rundown follows the on-air row (below). A strip would say all of it a third time and cost two
rows of rundown.

**Rejected: a state column and an ends column.** Five columns on a graphic row would be empty.
The colour carries state and a glyph carries the ending, both without a column.

**The list follows the air**: when a cue goes on air off-screen, the list scrolls it into view,
unless the operator scrolled by hand in the last ten seconds.

### 6.3 The monitors

- **No labels over the picture.** The first mockups printed "first frame" and "from the server";
  they are gone.
- **One small `STILL` tag** on a server clip's picture, because the page cannot play the server's
  video: it shows the clip's thumbnail. An operator who does not know that could wait for a picture
  to move.
- **PREVIEW** shows a clip's length, small, in its corner (`3:00`). **PROGRAM** shows no time at
  all: the clip clock sits right beside it (§6.4), and one number is clearer than two.

### 6.4 The clip clock

The owner called the countdown "one of the most important things when you play a clip", so the
operator can count the director back to the studio. Owner review of 2026-09-27 set its shape: **a
clear number, and nothing that moves the rest of the page.**

**Where.** Under the verb buttons, beside PROGRAM, in the column the 2026-08-21 layout contract
left free. It appears only while a server clip or audio file is on air, and it takes **only the
height left in that column**: its bottom edge is PROGRAM's bottom edge, never lower. In CSS it is a
flex item of the verb column with `container-type: size`, so its content can never make the stage,
and so the monitors, taller. Its number scales with its own height (`cqh` units). When less than
about 96px is left, as at 1366×768, it folds to **one thin row**: the label and the number, nothing
else (`clock-clip-then-clip-1366.png`).

**What it shows** depends on what happens at the end of the clip:

| When the clip ends it... | The clock shows | Warns (red, then pulsing) |
|---|---|---|
| **holds the last frame** or **clears** | one big number, the clip's remaining time, and one small line: `then holds the last frame` / `then clears to studio` (`clock-single-clip-1920.png`) | on that number |
| **plays the next clip** automatically (Play next, or a Play-through folder) | **`TO STUDIO`** as the big number: this clip's remaining time plus the length of every clip that will follow it automatically, up to the one that holds or clears. One small line: `clip -0:09 · next INTRO_VT 0:20` (`clock-clip-then-clip-1920.png`) | on **TO STUDIO only**. The clip's own countdown never warns when another clip follows, because nothing happens on air at that moment |
| **loops** | the clip's remaining time, small, and `loops until Out`. No studio time: there is none | never |

- **The warning**: the last ten seconds turn the box red; the last five pulse it
  (`clock-single-clip-last-seconds-1920.png`, `clock-last-clip-last-seconds-1366.png`). Colour is
  never the only signal: the digits count too.
- **At zero on Hold** the number turns amber and counts up, `HOLDING +0:03`, so nobody forgets a
  frozen frame on air. **On Clear** it disappears with the clip.
- **Paused** reads `PAUSED -0:09`, and the studio time stops with it.
- **One clock, one clip.** It follows the server clip or audio file the operator took last (for an
  All-together folder, its longest file). Any other server file on air shows its remaining time on
  its own rundown row, never as a second line in the clock: the owner's shows do not run a separate
  sound against a video, and a second line would crowd the one number that matters.
- **Where the number comes from**: the server's own `INFO`, read twice a second (§6.7), with the
  page's clock filling in between reads so the seconds tick evenly. With a Bridge too old to answer
  `INFO`, the clock counts from the Take and the clip's length and says `estimated`.
- **TO STUDIO is computed, and says so when it cannot be**: it adds the lengths the server listed
  (trimmed where the clip is trimmed). A clip with no known length in the chain makes it read
  `TO STUDIO ?` rather than a wrong number.

### 6.5 The cue panel (left of the rundown, where graphics are edited today)

Selecting a cue in the rundown opens its settings here, the same place and shape for every kind.

**A graphic.** Unchanged in what it offers: title, fields, controls, note. One move: its playout
layer goes under **Advanced**, beside the operator-facing rarities, which gives a many-field graphic
its room back.

**A server clip or audio file.** Basic, always visible:

| Setting | Choices | On air |
|---|---|---|
| **At the end** | **Hold last frame** (default) / **Clear** / **Loop** / **Play next** | the server does it |
| **Fade** | In: Cut / Short / Long. Out: Cut / Short / Long | a MIX on Take, and on Out or Clear |
| **Level** | a slider in dB, -60 to +6, 0 by default, with Reset | stored level travels with the clip; a change while on air goes out with Update |
| **Note** | free text | - |

Under **Advanced**, closed by default, with a one-line summary when closed
(`Channel 2 · layer 10 · whole clip`): channel, layer, start at and end at (trim), and the kind
(movie or audio) when the server's word was wrong. Short is half a second and Long one second,
turned into the channel's own frames by the adapter (§18, case 7); they are not settings.

**A folder.** Its name, **How it plays** (One by one / Play through / All together), for Play
through **At the end** (As the last clip says / Loop the folder), and a small picture of what airs
on which slot.

**A clip inside a Play-through folder** shows `→ Plays the next, set by the folder` in place of its
At the end, except the folder's last clip, which keeps its own Hold / Clear / Loop.

### 6.6 The rules, on air

**At the end** (one clip, outside a Play-through folder):

- **Hold last frame**: nothing is sent; the server holds it (§4). Default, and every existing clip.
- **Clear**: the Take also queues `LOADBG c-l EMPTY [MIX n] AUTO`. With an out fade, the fade
  starts that many frames before the end (§4), and the setting says so.
- **Loop**: `PLAY … LOOP`, as shipped.
- **Play next**: when this clip ends, the server plays the **next clip or audio cue on the same slot**,
  looking past any graphics in between (owner, Q3), and never past the end of the clip's folder.
  The Take queues it with `LOADBG c-l <next> [MIX n] AUTO`. The target is named where the choice is
  made (`Then plays: STUDIO_BG, cue 3`) and in the clip clock. When there is no such clip, the
  button is disabled and says why ("the next cue is a graphic", "the next clip plays on 2-5").

**A clip ending never takes a graphic.** Graphics are taken by the operator. A graphic that should
come in with a clip is a later feature, **attached** to the clip at an offset with a stated length
(the broadcast pattern in §5), and it needs the timed cues of `RUNDOWN_AUTOMATION_PLAN.md` §2.

**A Take never moves the selection by itself**, and neither does a server-side switch: somebody may
be editing the next cue (`RUNDOWN_AUTOMATION_PLAN.md` §2.1).

**Level.** The stored level goes out with the clip as `AF "volume=<linear>"`, so a clip keeps its own
level when the server switches to it by itself. A change while on air goes out as
`MIXER c-l VOLUME <gain> 12` (half a second's ramp) on Update. Every manual Take first resets the
layer's mixer to 1, so no clip inherits a nudge meant for another.

**Audio files** become their own kind (`mediaKind: 'audio'`, from the server's list) on their own
default layer, **5**, below clips on 10. A sting never knocks a VT off, and a bed survives both.
Two audio files at once need one moved to another layer in Advanced.

**Folders:**

- **One by one**: a folder for tidiness, the way a quiz groups its rounds. Collapsing it hides its
  cues; the operator takes each as today. Works for graphics as much as clips.
- **Play through**: one Take plays the folder's clips and audio in order on **the folder's one
  slot** (the clip layer on the clip channel, changeable in the folder's Advanced), each ending into
  the next, which is what lets the server switch with no gap. Each file keeps its own fades and
  level. The **last** file ends by its own setting (Hold, Clear or Loop), so an opening sequence can
  end on a looping background; or the folder's **At the end** is **Loop the folder**, which the
  CasparCG Client cannot do. Graphics cannot be put in a Play-through folder
  (they would need a length; see "attached", above), and the drop says so.
- **All together**: one Take starts every cue in it. On 2.5 the server cues go in one
  `BEGIN … COMMIT` batch and start on the same frame; on 2.3 they go one after another. A NoaCG
  graphic in the folder travels through the web and lands a moment after the server cues; that is
  stated in the folder's panel. This is also the owner's "a video with its own audio file" and the
  plan's older "linked cues" item: a lower third and a clip on one press.
- **Out on a folder** takes all of it off. **All out** is unchanged.
- **Folders do not nest.** One level of indentation, which the owner called important, and nothing
  deeper.

**Who queues the next file in a sequence** (Play next more than one clip deep, or a Play-through
folder): **the Bridge, not the page.** The page hands the Bridge the whole list once, at the Take
(`sequence`, §9). The Bridge queues the first follower with the Take, watches the slot with `INFO`,
and queues the next file each time the server switches. Only the server ever switches.

*Why not the page*, which is what the CasparCG Client does: a browser slows the timers of a tab
that is hidden. Chrome's "intensive throttling" allows a hidden tab's chained timers to run about
once a minute after five minutes hidden, so a folder of 20-second clips, run from a tab the
operator switched away from, would stall after the queued one and hold a frozen frame on air. The
Bridge is an ordinary local process that nothing throttles, and it is already running whenever a
server cue can be taken. It also means two pages open on one show never both queue.

*The cost*: the Bridge has so far kept no state (`BRIDGE.md` §3, "Stateless"). A sequence is the
one exception, deliberately small: per slot, the list still to play and the file it last queued,
in memory only. It is reported by `/state`, so any page sees it. A Bridge restart forgets it; the
server still plays the file already queued, then holds its last frame, and the page says the
sequence stopped. Out, All out, or a new Take on the slot ends the sequence in the Bridge before
anything is sent to the server.

### 6.7 The server tells the truth

While any server cue is on air, the page asks the Bridge for `INFO <channel>` of each channel it
has cues on, twice a second. From the answer it knows, per layer: the file on air, elapsed and
length, paused, looping, and what is queued behind it. That drives:

- the clip clock and the rows' remaining time;
- `played`, `NEXT ON SERVER` and ON AIR, including a clip the server cleared or switched by itself;
- a warning when the server holds something the rundown did not send (another client took the
  layer): the row says `replaced on the server`.

It stops polling when nothing of the rundown's is on air on the server. It is one short AMCP
command; the Bridge already opens one connection per command.

### 6.8 A production with no playout server

Nothing in §6.2 to §6.7 that belongs to the server appears unless the production has a server cue:

- no length column, no end marks, no clip clock, no `STILL`, no "From the playout server" button
  until a Bridge is paired (the button's rule today);
- the rundown is still resizable and one line per row, so a forty-graphic quiz shows twice as much;
- **folders** (One by one and All together) work for graphics;
- the cue panel's reflow is what gives a scoreboard or quiz its room (§6.1).

**Graphics are not neglected, and should not look it.** A graphics-only production gets the wider
and denser rundown, folders for rounds and segments, one press for two graphics, and a cue panel
that fits a twelve-field scoreboard. The next graphics-first work after these phases is the timed
cues of `RUNDOWN_AUTOMATION_PLAN.md` §2 (owner, Q4).

### 6.9 Any playout system, not only CasparCG

Each new ability is a **capability** the adapter declares, and the page shows a control only when
the running Bridge's adapter lists it: `endModes`, `fade`, `level`, `trim`, `batch`, `state`. The OGraf
adapter declares none of them today, so an OGraf target sees none of these controls. A future OBS
or vMix adapter declares what it can do, and the page's model does not move.

## 7. The record

All additive and optional, so `Show.version` stays 2 and an older build keeps the fields untouched
(`root/version-every-persisted-format-ship-breaking`).

On `PlayoutItem` (`src/model/shows.ts:55`):

```ts
/** The server's own word from its list. Absent on items saved before it: a movie. */
mediaKind?: 'movie' | 'still' | 'audio';
/** What the server does at the clip's end. Absent = hold. `loop: true` on an older item reads
 *  as 'loop', and the field is written only for a non-default choice. */
end?: 'clear' | 'loop' | 'next';
fadeIn?: 'short' | 'long';
fadeOut?: 'short' | 'long';
/** dB, -60 to +6. Absent = 0 dB. */
levelDb?: number;
/** Trim in seconds from the file's start. Absent = the whole file. */
trimIn?: number;
trimOut?: number;
```

`loop` stays readable and is still written beside `end: 'loop'`, so an older build keeps looping.

On `Show`, and one field on `ShowCue`:

```ts
folders?: ShowFolder[];

interface ShowFolder {
  id: string;
  name: string;
  mode: 'manual' | 'through' | 'together';
  end?: 'loop';                    // 'through' only; absent = the last clip's own ending
  slot?: { channel?: number; layer?: number };  // 'through' only; absent = the clip defaults
  collapsed?: boolean;
}

// ShowCue:
folderId?: string;
```

**Cues stay one flat, ordered list**, and a folder's cues are contiguous in it; the rundown's
moves keep them so. Every reader that knows nothing of folders (an older build, the hosted page,
the exported controller, a graphics pack) sees the same cues in the same order.

## 8. The other surfaces, frozen on purpose

The hosted Control page (phone or tablet), the Presenter link and the exported controller get **no
new features in these phases** (with the one exception the dashboard rule may ask for: §17, item 1,
and Q5). They keep doing exactly what they do today, and a spec pins that a
published production with folders and clip settings still loads on each and lists its graphic cues
in order. Server cues stay listed and disabled there, as today.

The production page's **phone layout** (≤900px) gets no design work: the drag handle is hidden, the
clip clock takes its place in the stacked column, and the existing phone spec must stay green.

**Rejected: switching the phone surfaces off.** The owner offered it. The Control page is how a
second operator or a presenter's phone joins a live show, which is outcome 5's "no one person a
single point of failure". Freezing costs one spec per phase; switching off costs a feature somebody
may rely on in a show. The owner chose freezing (Q2): "no need to remove if it works".

## 9. Bridge and protocol

Additive in protocol v2 (`src/control/playoutProtocol.ts`, mirrored in `cli/src/playout/`), so
`PLAYOUT_V` stays 2. Each phase that touches it ships one Bridge release.

- `take` on media gains `end?`, `next?` (the item to queue), `fadeIn?`, `levelDb?`, `trimIn?`,
  `trimOut?`; `out` gains `fadeOut?`; `update` on a media slot may carry `levelDb` alone.
- A new verb **`sequence`**: `{ slot, items: [...], end }`, taken with the first item. The Bridge
  plays the first, queues the second with `LOADBG c-l <item> [MIX n] AUTO`, and runs the rest as
  §6.6 says. `out`, `clear` and a new `take` on the slot end it. Its state is in `/state`.
- A new route **`POST /state`** `{ target, channel }` → the layers' state from `INFO`, parsed by the
  adapter into protocol words (`file`, `elapsed`, `length`, `paused`, `loop`, `queued`), never raw
  XML, so an OBS adapter can answer the same shape.
- A **batch** on `/act`, `{ target, actions: [...] }`, sent as `BEGIN … COMMIT` where the adapter
  has `batch`, else one after another, with each action's result.
- `/health` gains `features`, so a page never sends a setting a running Bridge would ignore: an old
  Bridge gets the controls greyed with "Update NoaCG Bridge to use this".
- **The adapter keeps writing every AMCP line itself.** The page sends words, never AMCP, and the
  unit tests pin each line (`cli/test/caspar.test.mjs`, against `cli/test/_fakeCaspar.mjs`).

## 10. Making it robust before making it bigger

The production page is already large, and the owner is right that adding to it as it is would make
it brittle. So the first phase changes nothing on screen:

- **Pin today's behaviour first.** Before moving code, add the missing e2e checks for what exists:
  the exact action of every verb on a clip and a template, a graphics-only rundown's rows, reload
  behaviour, the hosted page's lists, and screenshots of the page at 1920 and 1366 as the baseline.
- **Split the page along its seams**, as `backlog/production-page-phases.md` already plans (§16,
  phase 0), behaviour unchanged, each piece in its own file with its own
  comment block: the rundown list and row, the cue panel for server cues, and server playout as a
  module of plain functions (what each Take sends, how a chain is queued, how an `INFO` answer
  becomes on-air state) with a thin React hook over it. Plain functions can be checked without a
  browser.
- **Fake the server with time in it.** The CLI's fake CasparCG and the e2e fake Bridge learn
  `INFO`, `LOADBG … AUTO` and clip lengths on a clock, so a Play-through folder, a Clear at the end
  and the clip clock are all tested against a server that switches by itself, with Playwright's
  clock (`page.clock`) driving time.
- **Browsers**: Chrome, Edge and Firefox, the ones the Bridge supports (`BRIDGE.md` §1b; Safari
  cannot reach a local Bridge at all). The new CSS is container queries and a drag handle, both in
  every supported browser. The existing `playout-fixed-panes` spec keeps guarding the layout.

## 11. Phases

Each lands on its own, through the queue, with its own owner-queue item.

| # | What | Size | Why that size | What could break, and the guard |
|---|---|---|---|---|
| **0** | **Safety net and seams.** Characterisation specs, the split of §10, the timed fake server. No visible change. | medium | moving code in a 4,165-line component is careful, not clever; nothing new is designed | a moved piece behaves differently: every existing spec plus the new baseline screenshots must pass unchanged |
| **1** | **Layout for everyone.** Resizable rundown, one-line rows, container-query cue panel, the graphic's layer under Advanced, the list following the air. | medium | touches every production; CSS and two small components | graphics-only productions look different: the owner-queue item walks one at 1920 and at 1366, and the phone spec stays green |
| **2** | **The clip clock and the server's truth.** `/state` and `INFO` polling, the clock, remaining time and progress on rows, `STILL`, `played`. Works for today's clips (once and loop) before any new setting. Bridge release. | medium | one route, one poller, one panel; the parsing is pinned by CLI tests | a wrong or late number: the clock says `estimated` when it is not the server's; measured on the real server first |
| **3** | **Clip settings.** At the end (all four), fades, level, audio as its own kind on layer 5, Advanced with trim. `/health` features. Bridge release. | medium | a handful of AMCP forms, all pinned by unit tests; one panel | an old clip playing differently: absent fields keep today's exact AMCP line, pinned |
| **4** | **Folders.** The three modes, drag in and out, collapse, folder Take and Out, the Play-through chain, `BEGIN … COMMIT` on 2.5, Loop the folder. | large | a new record shape, rundown moves that keep folders whole, and the chain | a folder's cues out of order in older readers: the flat order is the invariant, pinned on the hosted page and in a pack |
| later | Graphics attached to a clip at an offset | medium | needs the timed cues of `RUNDOWN_AUTOMATION_PLAN.md` §2 | - |
| later | Load (first frame on air, paused) and preloading the next clip | small | only if the take delay measured on the real server is visible | - |

**Order**: 0 → 1 → 2 → 3 → 4, then the timed graphics cues (owner, Q4). Phase 2 comes before 3
because the clock helps every clip that already exists, and because Clear and Play next must not
ship until the page can see the server do them.

**Acceptance, observable on a CasparCG server** (each phase's owner-queue item carries its own):

- Phase 1: at 1920 and 1366, drag the rundown from narrow to wide; the scoreboard's fields reflow
  and nothing overlaps or scrolls off; the width is still there after a reload.
- Phase 2: take a 15-second clip; the clock counts down to 0:00 within a second of the server, turns
  red at 10 and pulses at 5, then reads `HOLDING +0:01`; reload the page mid-clip and the clock comes
  back with the right number.
- Phase 3: a clip set to Clear with a short fade fades out and leaves the layer empty with the page
  closed; a sting on layer 5 plays over a running VT without stopping it; a clip at -12 dB is audibly
  quieter, and a live nudge is reset by the next Take.
- Phase 4: a three-clip Play-through folder plays through with no black between clips; with Loop the
  folder, it starts over; an All-together folder of a video and its audio file stays in sync to the
  end (on 2.5).

## 12. Needs the real CasparCG 2.5.0 server

Nothing here is assumed; each is a line in the phase's owner-queue item or a measurement in
`e2e/configured/bridge-real-server.spec.ts`:

1. What `INFO <channel>` really returns on 2.5.0 (the fields of §4) and how long it takes.
2. Clear with a fade: the fade overlaps the clip's last frames (§4).
3. Per-clip level through `AF "volume=…"`, and that a MIXER nudge does not stack with it wrongly.
4. `LOADBG` without `AUTO` cancels a queued clip.
5. `BEGIN … COMMIT` starts a video and its audio file on the same frame.
6. The length an audio-only file reports in `CLS` and `INFO`.
7. The delay between Take and the first frame on air, to decide on preloading.
8. Whether 2.3 servers are still in use anywhere NoaCG plays out (it decides whether 2.3's
   one-after-another "All together" needs saying on screen).

## 13. Decisions

**Build (phases 0 to 4):** resizable rundown; one-line rows with end marks and remaining time; the
clip clock; `INFO` polling; At the end with four choices; fades; level in dB; audio on its own layer;
trim under Advanced; folders in three modes with Loop the folder; capability-gated controls; the
phone surfaces frozen and pinned.

**Later:** graphics attached to a clip at an offset (after timed cues); Load and preloading, if
measured; Invoke; a second-channel preview.

**Not built:** a clip end that takes a graphic; a NOW / NEXT strip; state and ends columns; mixer,
route, record and stream items; raw AMCP command items; transitions other than MIX; nested
folders; a NoaCG-side playlist timer.

**Changes to earlier plans, once approved:**

- `RUNDOWN_AUTOMATION_PLAN.md` §3 is replaced by this plan. Build 1's `At clip end` choice is
  dropped, because a clip's end now belongs to the clip and its folder; build 1 keeps timed cues
  for graphics ("After 8 s → Out") and remains the next graphics work.
- `BRIDGE.md` §5a's fade and "then play" sketch is superseded; §9's milestone 2 (OSC) is no longer
  needed for position readout.

## 14. For the reviewer

The questions this plan most needs challenged:

1. **Is `INFO` polling twice a second sound** as the source of truth (load on the server, the
   Bridge's connection per command, a slow answer), or does it need one held connection? And is the
   Bridge's one piece of state, a running sequence (§6.6), the right place for it, against a
   page-side queue plus a warning to keep the tab visible?
2. **Play next "looking past graphics"**: is it clear enough to an operator which clip it will play,
   and does limiting it to the same slot and the same folder remove every surprising case?
3. **Is the flat cue list with `folderId` enough** to keep every older reader correct, and do the
   rundown's moves really keep a folder's cues contiguous in every case (drag, delete, paste, import)?
4. **Is Phase 0's split worth its cost** before Phase 1, or should the split happen piece by piece
   inside the phases that need each piece?
5. **Is anything a graphics-only operator loses** (the layer moving under Advanced, one-line rows
   hiding a second line of detail) that this plan does not see?
6. **Does the per-clip `AF` level really survive the server's own switch**, and is resetting the
   mixer on every manual Take safe when two cues share a slot?
7. **For the code review, not only the plan**: check §16 against the code at the commit you
   review. Is any caller of `show.cues`, `PlayoutItem` or the playout protocol missing from it
   (the list of order-reading files is `shows.ts`, `ProductionPage.tsx`, `playoutKeys.ts`,
   `hostedControl.ts`, `HostedControlPage.tsx`, `showExport.ts` → `productionControllerHtml.ts`,
   `graphicsPack.ts`, `teamShowMerge.ts`)? Does any AMCP form in §4, §9 or §18 disagree with the
   CasparCG source at `v2.5.0-stable`? Is any case in §18 missing its guard, or any guard untestable
   as described?
8. **§17's four conflicts with standing rules**: is any other rule in the root, `src/components`,
   `src/components/home`, `src/model`, `e2e` or `cli` contracts crossed by a phase?

## 15. The owner's answers, 2026-09-27

- **Q1. The screen.** Full HD is the design target, and the page must still work at 1366×768.
- **Q2. The phone surfaces.** Frozen: they keep working with no new features. "No need to remove if
  it works."
- **Q3. Play next.** Plays the next clip on the same slot and looks past graphics, as recommended.
- **Q4. The order.** Phases 0 to 4 as recommended, then the timed graphics cues.
- **The clip clock** (design review): it must fit under the buttons and never reach below the
  monitors; one clear number matters most; show what comes next only when something follows
  automatically, with the clip's own time and the time to the studio kept apart, and warn on the
  time to the studio; no second line for a sound running against a video. §6.4 is written to that.
- **The review**: the plan and the code it touches go to an independent reviewer (Codex) before
  phase 0 starts. §16 is written for that review.

- **Q5 (open, needs: alignment). Folders on the hosted Control page.** The repository's rule is
  that both dashboards render identically (§17, item 1). Recommendation: in phase 4 the hosted page
  shows folders as headers with indentation, display only (no folder Take there), which keeps the
  two dashboards alike for a few lines of code; the alternative is to amend the rule so folders are
  production-page only.

## 16. Every file each phase touches

Line numbers are at `ca54e17` (2026-09-27) and will drift; the names will not. "New" is a file the
phase creates. Each phase also adds its specs to `scripts/e2e-affected.mjs` (the playout rows are
at 601-634; `cli/` maps to no e2e spec at 207) in the same commit, as
`root/add-playwright-spec-any-new-flow` requires, and files its own owner-queue item.

### Phase 0 - safety net and seams (no visible change)

It runs the first two phases of the split already planned in
[`backlog/production-page-phases.md`](backlog/production-page-phases.md), plus one piece that plan
did not have. That plan's rule binds here too: **`liveCue` and `selectedCueId` do not move**
(`src/components/home/AGENTS.md`, "ProductionPage is being SPLIT"), and its note that the owner
runs these phases awake stands.

| File | Change |
|---|---|
| `src/components/home/ProductionPage.tsx` | the rundown `<aside className="pd-rail">` (3519-3862) moves out; the monitors `.pd-monitors` (2754-2851) move out; the server cue editor (3194-3329) moves out; `livePlayout` (369-378), `playoutVerb` (1924-1984), `dropLivePlayout` (1917) and the server half of `outAll` (2122-2130) move into the server-playout module below. `liveCue`, `selectedCueId`, the draft and `runVerb` stay. |
| `src/components/home/CueRundown.tsx` (new) | the rundown, as `production-page-phases.md` §3 specifies: owns `menuCueId`, `armedRemove`, `addPick`; takes `liveCue` read-only |
| `src/components/home/PlayoutMonitors.tsx` (new) | the monitors, as that plan's §4 specifies, with `programRef` forwarded from the page and the measurement keyed on the node |
| `src/components/home/ServerCueEditor.tsx` (new) | the server cue editor (loop row, pause/resume, channel, layer, note), props only |
| `src/control/serverPlayout.ts` (new) | plain functions with no React: what a verb sends for a server cue (today's `playoutVerb` logic), the on-air map, `outAll`'s server half. Later phases add the `INFO` reading and sequence display here. |
| `src/control/serverPlayoutStore.ts` (new) | a tiny subscribable store for server on-air state, so phase 2's twice-a-second updates reach only the components that read them (§18, case 15) |
| `cli/test/_fakeCasparServer.mjs` (new) | a fake CasparCG with state: layers, clip lengths on a clock, `PLAY`/`LOADBG … AUTO`/`STOP`/`PAUSE`/`RESUME`/`INFO`/`MIXER`/`BEGIN`/`COMMIT`. The existing `cli/test/_fakeCaspar.mjs` (26 lines) only answers a scripted line per command and stays for the parser tests. |
| `e2e/playout-cues.spec.ts` | `fakeBridge` (52-139) learns `/state` behind an option, off by default; new characterisation tests: the exact action of every verb on a clip and a template after a reorder, All out across two channels (exists) and after a reload |
| `e2e/playout-baseline.spec.ts` (new) | screenshots of a graphics-only and a mixed production at 1920×1080 and 1366×768, compared against themselves before and after the split |
| `e2e/hosted-control.spec.ts` | new: a production with server cues publishes, and the hosted page lists them disabled with their `2-10` address (today nothing asserts it, 1261-1292) |
| `docs/backlog/production-page-phases.md` | its phases 1 and 2 marked done, with the commit |

### Phase 1 - layout for everyone

| File | Change |
|---|---|
| `src/styles/playout-dashboard.css` | `.pd-body` (231-237): the fixed `380px` becomes `var(--pd-rail-w)`; `.pd-cue` (1359-1449) one line; the cue panel's field grid by container query; phone rules (1457-1554, 1652-1761) untouched except hiding the handle |
| `src/components/home/ProductionPage.tsx` | `ProductionShell` (3892-4135) renders the drag handle between the stage and `.pd-body`'s rail and sets `--pd-rail-w` |
| `src/components/home/RailResizer.tsx` (new) | the handle: pointer drag, keyboard (arrow keys, for accessibility), double-click reset, limits 320px to 60%; reads and writes the width through `src/model/prefs.ts` |
| `src/model/prefs.ts` | one per-device preference, the rail width (a `spx-gfx-*` key; `model/never-rename-persisted-deployed-identifiers-storage`) |
| `src/components/home/CueRundown.tsx` | one-line rows: kind icon, name plus summary, end mark, length (only when the rundown has a server cue), slot; follows the on-air row |
| `src/components/home/ServerCueEditor.tsx`, the graphic editor block in `ProductionPage.tsx` (2963-~3185) | the graphic's layer moves under **Advanced** (a `<details>`; the wizard's `details:not([open])` trap in `AGENTS.md` applies to its CSS) |
| `src/components/HostedControlPage.tsx` | the same row and handle changes, because the dashboard must render identically on both (§17) |
| `e2e/playout-fixed-panes.spec.ts` | still only the control area scrolls, at every size, with the rail narrow and wide |
| `e2e/playout-rail-width.spec.ts` (new) | drag, keyboard, reset, the limits, surviving a reload; a twelve-field graphic at 1366 with the rail at its widest overlaps nothing |
| `docs/PLAYOUT_DASHBOARD.md` | §2 and §4: the rail width and the one-line row |

### Phase 2 - the clip clock and the server's truth

| File | Change |
|---|---|
| `src/control/playoutProtocol.ts` and `cli/src/playout/protocol.ts` (byte-identical, `cli/test/playout.test.mjs:18` refuses drift) | `HealthReply` gains `features?: string[]`; a `StateReply` type (slots with `file`, `elapsed`, `length`, `paused`, `loop`, `queued`, `sequence?`) |
| `cli/src/playout/server.ts` | `/health` (248) reports `features`; a `/state` route beside `/act` (325), token-checked like it |
| `cli/src/playout/amcp.ts` | `parseInfo`: the `INFO <channel>` XML into layer states, tolerant of fields a version lacks |
| `cli/src/playout/adapters/casparcg.ts` | `state(target, channel)`; `capabilities()` (151-157) grows `features: ['state']` |
| `cli/src/playout/adapters/ograf.ts` | `capabilities()` (262-264) declares no features; `/state` answers `unsupported` |
| `src/control/playoutLink.ts` | `reachBridge` (396) keeps the `features` it reads; `readState` beside `act` (520); a poller that never overlaps itself |
| `src/control/serverPlayout.ts`, `serverPlayoutStore.ts` | turn `/state` answers into on-air truth; match a slot's file to a cue after reload; the one-second trust after a Take (§18, case 14) |
| `src/components/home/ClipClock.tsx` (new) | the clock of §6.4: `container-type: size`, the one-row fold, the warnings, HOLDING, PAUSED, `estimated` |
| `src/components/home/PlayoutMonitors.tsx` | the `STILL` tag; PREVIEW's length |
| `src/components/home/CueRundown.tsx` | remaining time and progress on on-air rows; `played`; `replaced on the server` |
| `src/components/playoutKeys.ts` (43-69) | `p` → pause/resume on a server clip (`components/keep-every-playout-verb-key-keymap`: the key lives only here) |
| `src/styles/playout-dashboard.css` | the clock, the progress bar, the still tag |
| `cli/test/playout.test.mjs`, `cli/test/caspar.test.mjs` | `parseInfo` against real 2.3.3 and 2.5.0 `INFO` answers captured on the real server (§12, item 1); `/state` auth and origin |
| `e2e/playout-clock.spec.ts` (new) | with `page.clock` and the fake: counts, warns at 10 and 5, HOLDING, PAUSED, reload mid-clip, Bridge gone mid-clip, an old Bridge's `estimated`, render count |
| `cli/BRIDGE_CHANGELOG.md`, `cli/package.json` (0.4.2) | the Bridge release that carries `/state` (§17: publishing it needs the owner) |
| `docs/BRIDGE.md` | §3 routes, §3a protocol, §3b adapter, §5 "What the page believes", §9 (OSC no longer needed for position) |

### Phase 3 - clip settings

| File | Change |
|---|---|
| `src/model/shows.ts` | `PlayoutItem` (56-83) gains the §7 fields; `setPlayoutItemLoop` (589-597) becomes `setPlayoutItemEnd` and keeps writing `loop` beside `end: 'loop'`; new setters for fades, level and trim; `addPlayoutItem` (536-567) records `mediaKind` and puts audio on the new `PLAYOUT_AUDIO_LAYER = 5` beside `PLAYOUT_CLIP_LAYER` (526) |
| `src/components/home/PlayoutItemPicker.tsx` | `add` (101-105) passes the server's kind word it drops today (102); the `onAdd` type (46) carries it |
| `src/components/home/ServerCueEditor.tsx` | At the end (four choices, Play next's target named or its reason), Fade, Level, Advanced (channel, layer, trim, kind); controls greyed without the feature |
| `src/control/serverPlayout.ts` | what a Take sends now: `end`, the Play-next target (the next clip on the same slot, past graphics, inside the folder), fades, level, trim |
| `src/control/playoutProtocol.ts` and its mirror | `take` gains `end?`, `next?`, `fadeIn?`, `levelDb?`, `trimIn?`, `trimOut?`; `out` gains `fadeOut?`; `update` may carry `levelDb` alone |
| `cli/src/playout/server.ts` | `readAction` (185-207) validates the new fields and refuses a malformed one with the hop named |
| `cli/src/playout/adapters/casparcg.ts` | `casparLine` (43-81) becomes a list of lines per action: `MIXER c-l VOLUME 1`, then `PLAY … [IN n] [OUT n] [MIX n] [AF "volume=…"] [LOOP]`, then `LOADBG … AUTO` for Clear and Play next; fade seconds to channel frames (§18, case 7); an action with none of the new fields writes exactly today's one line |
| `src/components/home/CueRundown.tsx` | the end marks after the name; audio's icon |
| `cli/test/playout.test.mjs` | every new line, its order, the exact old line for an old action, 25p and 50p fades, the `AF` value for -60, -12, 0 and +6 dB |
| `e2e/playout-cues.spec.ts` | the exact action for each setting; an old record (`loop: true` only) still loops; audio lands on layer 5; an old Bridge greys the controls and sends today's action |
| `cli/BRIDGE_CHANGELOG.md`, `cli/package.json` | a Bridge release (§17) |
| `docs/BRIDGE.md` | §3a, §3b, §5a (the sketch superseded) |

### Phase 4 - folders

| File | Change |
|---|---|
| `src/model/shows.ts` | `Show.folders`, `ShowCue.folderId` (§7); `addShowCue` (499-522), `moveShowCue` (687-697), `removeShowCue` (707-719) and `setShowCues` (659-684) keep a folder's cues together; new `addFolder`, `renameFolder`, `setFolderMode`, `removeFolder` (keeps the cues), `moveCueIntoFolder` |
| `src/model/teamShowMerge.ts` | `FIELD_LABEL` (26-37) gains `folders: 'folders'`. `folders` is an id-keyed list, so `mergeItems` (60-80) already merges it item by item with the stored order as the spine; a spec proves two members adding folders at once keeps both |
| `src/components/home/CueRundown.tsx` | folder rows, indentation, collapse, drag into and out of a folder, the folder's `⋯` menu |
| `src/components/home/FolderEditor.tsx` (new) | the folder's panel: how it plays, at the end, what airs where |
| `src/components/playoutKeys.ts` | `stepSelection` (109-119) walks visible rows; a folder row is one step |
| `src/control/serverPlayout.ts` | a folder Take: Play through becomes one `sequence`; All together becomes one batch plus the graphic Takes; folder Out |
| `src/control/playoutProtocol.ts` and its mirror | the `sequence` verb; the `/act` batch |
| `cli/src/playout/server.ts` | `/act` accepts a batch; the sequence runner's state, per slot, in memory (§6.6) |
| `cli/src/playout/adapters/casparcg.ts` | `BEGIN … COMMIT` when `VERSION` is 2.4 or later; the sequence runner reading `INFO` and queuing the next `LOADBG … AUTO` |
| `cli/src/playout/amcp.ts` | `amcpSend` (81) opens one connection per command today; a batch sends `BEGIN`, its lines and `COMMIT` on one connection and reads each reply |
| `src/control/hostedControl.ts` | if the owner chooses Q5's recommendation: `buildOutputPayload` (289-344) publishes `folders` and each cue's `folderId`, additively, `OutputPayload.v` staying 1 |
| `src/components/HostedControlPage.tsx` | the same, display only: folder headers and indentation in its rundown (1217-1260) |
| `src/export/showExport.ts` (274-278), `src/packs/graphicsPack.ts` (420-448), `api/_lib/me/packageShape.ts` | **not changed**: they copy named fields, so folders do not travel in an export or a pack in these phases. A spec proves a production with folders still exports and packs with every graphic cue in order. |
| `e2e/playout-folders.spec.ts` (new) | create, rename, drag in and out, collapse, keyboard, delete keeps the cues, a split folder in an old record, the three modes against the timed fake, Loop the folder, All together as one batch |
| `e2e/production-pack.spec.ts`, `e2e/production-persistence.spec.ts` | a production with folders round-trips a reload and a pack |
| `cli/test/playout.test.mjs` | the batch, the sequence runner against `_fakeCasparServer.mjs`: each switch queues the next, Out ends it, a new Take ends it |
| `cli/BRIDGE_CHANGELOG.md`, `cli/package.json` | a Bridge release (§17) |
| `docs/BRIDGE.md`, `docs/PLAYOUT_DASHBOARD.md`, `docs/CLOUD_PLAYOUT.md` §2 (if folders are published) | the new behaviour |

### Not touched by any phase

The editor (`src/components/editorFoundation/**`, `src/editor/**`, `src/App.tsx`), the
editor-opening code in `HomePage.tsx`, `GraphicControlPage.tsx` and `CreationWizard.tsx`; the output
renderer (`/output`); the database and its migrations (nothing here is published through the
command log); `src/control/combine.ts` (combined controls resolve cues by id, not order).

## 17. Where this plan meets the repository's standing rules

Found while mapping the files; each needs a decision before the phase it names, and none is
settled by this plan alone.

1. **`components/render-playout-dashboard-identically-hosted-page`** (an invariant): the playout
   dashboard renders identically on the hosted `?control=` page and the production page, and "a
   control added to either belongs on BOTH in the same commit". The owner's Q2 (freeze the phone
   surfaces) was answered without this rule on the table.
   - **Phase 1** (row, width) is honoured as the rule says: both pages, which share the `.pd-`
     classes anyway. The phone breakpoint does not change, so nothing new reaches a phone.
   - **Phases 2 and 3** (clock, clip settings) need the Bridge, which the hosted page can never
     reach (§3). The rule is amended in phase 2, through `npm run learn` as the root rules
     require, to say so: controls that need the operator's own Bridge live only where the Bridge is.
   - **Phase 4** (folders) is a rundown feature for graphics too, so the rule asks for it on both.
     Question Q5.
2. **`backlog/production-page-phases.md`**: the page split is already planned, with the rule that
   `liveCue` and `selectedCueId` never move and that the owner runs the phases awake. Phase 0 runs
   its phases 1 and 2 as written and adds the server-playout module, which moves `livePlayout`
   but neither of those two.
3. **The Bridge keeps no state** (`BRIDGE.md` §3). Phase 4's sequence runner is the one exception
   (§6.6), recorded in `BRIDGE.md` in the same commit.
4. **A Bridge release is a publication past `main`** (`root/publishing-past-still-needs-user-message`):
   the `bridge-vX.Y.Z` tag runs `.github/workflows/release-bridge.yml` and puts a download on the
   Releases page, which a later commit cannot take back. Phases 2, 3 and 4 each end with one, and
   each needs the owner's go in that message. Its notes follow `cli/write-every-published-text-person-who`.

## 18. What could go wrong, case by case

Each case names the guard the build must have, and the phase whose specs pin it. "Source" means
checked in the CasparCG source (§4); "server" means it goes on §12's list for the real server.

**On the server**

1. **A new Take onto a slot with a queued follower.** `PLAY c-l "<clip>"` loads its own background
   first, which replaces the queued one and switches `AUTO` off (source: `load()` sets
   `auto_play_` from the new command). The Bridge also ends its sequence for the slot before
   sending. Pinned in phase 3 (unit) and phase 4 (e2e). Server: confirm on 2.5.0.
2. **Out during a sequence.** `STOP` empties the foreground and switches `AUTO` off (source:
   `stop()`), but the queued background stays loaded. NoaCG never sends a bare `PLAY c-l` without a
   name, so it is never played. An Out with a fade sends `PLAY c-l EMPTY MIX n`, which replaces the
   background too. Pinned in phase 3 (unit: no nameless PLAY is ever written).
3. **Pause during a sequence.** A paused clip does not advance, so `AUTO` does not fire until
   Resume; `INFO` reports `paused`, and the clock and TO STUDIO stop. Pinned in phase 4 (e2e with
   the timed fake server).
4. **Loop and Play next together.** They are one control (At the end), so they cannot both be set.
   A looping clip never ends, so nothing queued behind it would ever play.
5. **A still image.** A still has no length (2.3.2 lists it as `1 1/25`,
   `cli/src/playout/amcp.ts:218-221`), so `AUTO` behind it would fire at once. At the end, Play next
   and fades on the end are offered for movies and audio only; a still keeps Hold and Out.
6. **Trim and `AUTO`.** `AUTO` counts the producer's own frames; with `IN`/`OUT` set, that should
   be the trimmed length. Server: confirm, or trim is not offered on a clip set to Play next.
7. **Fade lengths at other frame rates.** `MIX n` counts the channel's frames, so 12 frames is half a
   second at 25p and a quarter at 50p. The adapter converts Short (0.5 s) and Long (1 s) to frames
   with the channel's own rate, read once from `INFO <channel>` and cached per target. Pinned in
   phase 3 (unit, 25p and 50p).
8. **The mixer level leaks to the next clip.** `MIXER VOLUME` outlives the clip on its layer
   (source). Every manual Take writes `MIXER c-l VOLUME 1` before its `PLAY`; the stored level rides
   in the clip's own `AF`. Pinned in phase 3 (unit: the line order).
9. **Another client takes the layer** (the CasparCG Client, a second NoaCG). `INFO` shows a file the
   rundown did not send: the row reads `replaced on the server` and the clock goes. The Bridge ends
   its sequence for that slot. Pinned in phase 2 (e2e).
10. **2.3 servers.** No `BEGIN … COMMIT`: an All-together folder goes one command after another. The
    adapter declares `batch` only when `VERSION` says 2.4 or later. Server: whether 2.3 is still in
    use anywhere.

**In the Bridge and the network**

11. **The Bridge stops or restarts mid-sequence.** The server plays the file already queued and
    holds. The page's `/state` calls fail: the clock reads `no answer from NoaCG Bridge` over its
    last known number, and the row keeps ON AIR with the same note. Pinned in phase 2 (e2e: Bridge
    goes away mid-clip).
12. **An old Bridge.** `/health` has no `features`: every new control is greyed with "Update NoaCG
    Bridge to use this", and a Take sends exactly today's line. Pinned in phase 3 (e2e with a fake
    0.4 Bridge).
13. **`INFO` answers slowly.** The poll never overlaps itself: the next one waits for the last. The
    clock keeps counting from the last good answer and marks itself `estimated` after 3 s without
    one.
14. **A Take the server has not started yet.** The first `INFO` after a Take can still show the old
    file. The page trusts its own accepted Take for one second before `INFO` may overrule it.

**In the page**

15. **Twice-a-second updates re-rendering the whole page.** The production page is one large
    component; a poll that sets its state would re-render all of it twice a second. The server
    state lives in its own small store (phase 0), and only the clock, the rows' time and the
    on-air marks subscribe to it. Pinned in phase 2 by a render-count check in the e2e spec.
16. **A hidden tab.** The page's own polling slows when the tab is hidden (see §6.6), which only
    delays the display; the server and the Bridge carry on. On return the page reads `/state` at
    once.
17. **Reload mid-clip.** The page reads `/state` and matches each slot's file to the rundown's
    server cues on that slot. Two cues of the same file on one slot are ambiguous: the page marks
    the first and says `matched by file name`. Pinned in phase 2 (e2e: reload mid-clip).
18. **Two operators on one show.** Both pages poll and both show the same truth; only the Bridge
    queues sequences, so nothing is sent twice. A Take from either replaces the slot, as today.
19. **Keyboard.** Arrow keys walk visible rows only: a collapsed folder is one row, and Space on a
    folder row takes the folder. `P` pauses a server clip (a new key; H stays reserved for the
    timed cues' Hold). Pinned in phase 4 and phase 3.

**In the record**

20. **A cue whose `folderId` names no folder** (a folder deleted on another machine, an old pack):
    read as no folder. Deleting a folder keeps its cues and clears their `folderId`.
21. **A folder's cues no longer contiguous** (an older build moved one out of the middle): the page
    shows each run of the folder's cues as it stands, never reorders on read, and the next move in
    this build puts them back together. Pinned in phase 4 (e2e: a record with a split folder).
22. **An older build saves the show.** Every new field is optional and passes through untouched,
    and `loop` is still written beside `end: 'loop'` (§7). Pinned in phase 3 and 4 by reading a
    record written by this build with the previous build's normaliser (fixture in the spec).
23. **The hosted page, the exported controller and packs.** They read the flat cue list and ignore
    the new fields. Pinned in each phase by the frozen-surface spec (§8).
