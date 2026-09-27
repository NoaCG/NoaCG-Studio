# Clip and audio playback, and the rundown around it - the plan

**Draft, 2026-09-27. Nothing in it is built, and it is not yet approved.** It comes from an owner
planning session and is written to be read twice: by the owner, and by a second, independent
reviewer before anything is built (§14 says what to challenge). Once approved it replaces §3
("Build 2: basic media") of [`RUNDOWN_AUTOMATION_PLAN.md`](RUNDOWN_AUTOMATION_PLAN.md) and closes
the open half of [`backlog/video-through-playout-wrapper.md`](backlog/video-through-playout-wrapper.md).

The mockups are drawn, not built. They live beside the research in
[`research/clip-playback-2026-09-27/`](research/clip-playback-2026-09-27/), with `mockup.html` as
their source:

| File | Shows |
|---|---|
| `today-1600.png` | the production page as it is today, a server clip selected |
| `clip-on-air-1920.png` | a clip on air at full HD: the clip clock, the minimal rundown, a clip's settings |
| `clip-last-seconds-1920.png` | the same clip in its last seconds, the clock in its warning state |
| `clip-on-air-1366.png` | the same page at the 1366×768 floor, rundown dragged narrow |
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
| With a MIX (or any) transition, AUTO starts the transition **that many frames before the end**, so the transition finishes on the last frame. | `transition_producer.cpp`, `auto_play_delta()` returns the duration | A clip set to Clear with a 25-frame fade starts fading 1 s before its end, and loses its last second. Said on screen. |
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

- **Design target 1920×1080. Floor 1366×768**, as the layout contract already says (question Q1).
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
- **PREVIEW** shows a clip's length in its corner (`3:00`). **PROGRAM** shows the remaining time of
  the clip ending soonest, large (`-0:09`), because that is where the operator's eyes are.

### 6.4 The clip clock

The owner called the countdown "one of the most important things when you play a clip". It gets
its own place: **under the verb buttons, beside PROGRAM**, in the column the 2026-08-21 layout
contract left free. It appears only while a server clip or audio file is on air.

- **Large remaining time** (`-0:09`, 52px at 1920, 40px at 1366), the clip's name and slot, its
  length, and a progress bar.
- **What happens at zero**, in words: `then → STUDIO_BG ⟲`, `then holds the last frame`,
  `then clears`.
- **The last ten seconds** turn the border red; **the last five** pulse it
  (`clip-last-seconds-1920.png`). Colour is never the only signal: the digits count too.
- **At zero on Hold** the clock counts up in amber, `HOLDING +0:03`, so nobody forgets a frozen
  frame on air.
- **Paused** reads `PAUSED -0:09`.
- **A second running file** (a music bed under a VT) gets one small line underneath:
  `♪ 2-5 MUSIC_BED -2:31`. The big number is always the file ending soonest; a looping file never
  takes it.
- **Where the number comes from**: the server's own `INFO`, read twice a second (§6.7), with the
  page's clock filling in between reads so the seconds tick evenly. With a Bridge too old to
  answer `INFO`, the clock counts from the Take and the clip's length and says `estimated`.

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
(`Channel 2 · layer 10 · whole clip`): channel, layer, start at and end at (trim), the length in
frames of Short and Long, and the kind (movie or audio) when the server's word was wrong.

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
  looking past any graphics in between (question Q3), and never past the end of the clip's folder.
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

**Who queues the next file in a Play-through folder**: the page, when `INFO` shows the switch
happened, sends the next `LOADBG … AUTO`. If the page is closed, the server still plays the file
already queued, then holds its last frame. The folder's panel says so.

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
cues of `RUNDOWN_AUTOMATION_PLAN.md` §2 (question Q4).

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
new features in these phases**. They keep doing exactly what they do today, and a spec pins that a
published production with folders and clip settings still loads on each and lists its graphic cues
in order. Server cues stay listed and disabled there, as today.

The production page's **phone layout** (≤900px) gets no design work: the drag handle is hidden, the
clip clock takes its place in the stacked column, and the existing phone spec must stay green.

**Rejected: switching the phone surfaces off.** The owner offered it. The Control page is how a
second operator or a presenter's phone joins a live show, which is outcome 5's "no one person a
single point of failure". Freezing costs one spec per phase; switching off costs a feature somebody
may rely on in a show. Question Q2.

## 9. Bridge and protocol

Additive in protocol v2 (`src/control/playoutProtocol.ts`, mirrored in `cli/src/playout/`), so
`PLAYOUT_V` stays 2. Each phase that touches it ships one Bridge release.

- `take` on media gains `end?`, `next?` (the item to queue), `fadeIn?`, `levelDb?`, `trimIn?`,
  `trimOut?`; `out` gains `fadeOut?`; `update` on a media slot may carry `levelDb` alone.
- A new verb **`queue`**: `LOADBG c-l <item> [MIX n] AUTO`, or `LOADBG c-l EMPTY` to cancel, for
  the page's Play-through chain.
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
- **Split the page along its seams**, behaviour unchanged, each piece in its own file with its own
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

**Order**: 0 → 1 → 2 → 3 → 4, then the timed graphics cues (question Q4). Phase 2 comes before 3
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
   Bridge's connection per command, a slow answer), or does it need one held connection?
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

## 15. Questions for the owner

Each carries its reason, `needs: alignment`, and a recommendation.

- **Q1. The screen floor.** Design for 1920×1080, and keep 1366×768 as the smallest window that must
  still work (the class laptops, your ruling of 2026-08-21)? Or raise the floor to full HD?
  *Recommendation: keep 1366×768 as the floor; the mockup at 1366 shows it still fits.*
- **Q2. The phone surfaces.** Keep them working but frozen (no new features, one spec pinning them),
  or switch them off for now? *Recommendation: freeze.*
- **Q3. Play next.** Should it look past graphics to the next clip on the same slot, or play only if
  the very next cue is a clip? *Recommendation: look past graphics, name the target on screen, never
  leave the clip's folder.*
- **Q4. The order.** Clips (phases 0 to 4) first, then the timed graphics cues of build 1?
  *Recommendation: yes; clips are the named blocker, and phase 1 already gives graphics the new
  layout.*
