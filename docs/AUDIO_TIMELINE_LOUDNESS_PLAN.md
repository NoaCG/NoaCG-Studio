# Waveform timeline and loudness normalize - the plan

Status: planned, not started (2026-11-20). Builds on `docs/CLIP_PLAYBACK_PLAN.md` (level, trim,
audio on layer 5) and `docs/BRIDGE.md` (how the page reaches the playout server).

## 1. What the owner asked for

1. A short **waveform timeline with two handles** to choose which part of a clip or audio file
   plays. Opened when needed, not always visible. No video thumbnails and no preview playback:
   the operator plays the cue on the server to hear it.
2. A **Normalize** button that sets a cue's level so it plays at a chosen loudness, and a way to
   normalize the whole production. Any LUFS target can be chosen; **-23 LUFS is the default**.
3. Everything happens **inside the playout system**. The file on the server is never rewritten.

Owner answers, 2026-11-20: CasparCG runs on a **separate computer**, and its media folder **can be
shared over the network**. Default target **-23 LUFS**. A Bridge download that is **20 to 40 MB
larger** (for ffmpeg) is fine.

## 2. What exists today

- `CuePlayback.levelDb` (`src/model/shows.ts`): -60 to +6 dB per cue, sent at Take as the clip's
  own audio filter `AF "volume=<linear>"` (`src/control/cuePlayback.ts`). Measured on a real
  server: 12.0 dB apart at -12 dB (`CLIP_PLAYBACK_PLAN.md` §12, item 4).
- `CuePlayback.trimIn` / `trimOut`: seconds into the file, typed as start and end times under
  Advanced in `src/components/home/ServerCueEditor.tsx`, validated by `trimProblem`, sent as
  `IN`/`OUT`. Proven on real servers, sequences included (§12, items 7, 11, 12).
- The server's list gives each file its `bytes` and `changed` date (`ListItem` in
  `cli/src/playout/protocol.ts`): a ready cache key.
- vMix: Bridge already knows the vMix media folder (`cli/src/playout/vmixMedia.ts`), but vMix
  cues refuse trim and level today (`vmixPlayers.ts`). vMix stays out of this plan's first build.

What is missing is **reading the file**. Both the waveform and the loudness come from the sound
data, and nothing in NoaCG reads a server file's sound today.

## 3. The design

### 3.1 One read of the file, with ffmpeg

The Bridge reads the file once and returns everything both features need:

- **Loudness slices.** ffmpeg's `ebur128` filter reports the momentary loudness (a 400 ms window)
  every 100 ms. These are exactly the gating blocks of ITU-R BS.1770 / EBU R128, so the
  integrated loudness of **any** part of the file can be computed later from the slices alone:
  drop blocks under -70 LUFS, then blocks more than 10 LU under the mean of the rest, and average
  what remains. Changing the start or end re-measures instantly, with no second read.
- **True peak per slice**, from the same filter with `peak=true`, for the peak guard (§3.5).
- **Waveform peaks**: the same ffmpeg run also writes a low-rate mono copy of the sound, which the
  Bridge folds into about 1,000 min/max pairs.

Why ffmpeg: WAV could be read without it and MP3 with a small decoder, but the sound inside a
video file (MP4, MOV, MXF) needs a real decoder. ffmpeg also gives a measurement other broadcast
tools agree with. Reading only the audio track (`-vn`) is fast, far faster than real time.
Exact flags and how the per-slice values come out are settled in phase 1 against fixtures.

**Where ffmpeg comes from.** The Bridge download ships a small, audio-only ffmpeg build (LGPL)
beside the exe, for Windows, macOS and Linux. `cli/scripts/build-bridge-exe.mjs` packs it; the
licence notice goes with it. An ffmpeg already on the machine's PATH is not relied on.

### 3.2 Reaching the file: the media folder link

The Bridge runs on the operator's computer and CasparCG on another (`BRIDGE.md` §1c). The Bridge
never listens on the network, and this plan keeps it that way: it reads the server's media folder
through a **network share**, which the operator links once.

- Settings, Playout, per CasparCG server: **Media folder**, picked with the system folder picker
  (Windows: `\\PLAYOUT\media` or a mapped drive; macOS and Linux: the mounted share). The same
  pattern as the vMix media folder picker, kept in the Bridge's own settings file, per server.
- **The Bridge checks the link**: it takes a few files from the server's list and confirms each is
  in the folder with the same size. A wrong folder says so in words, never shows a wrong waveform.
- **Safety**: the Bridge reads only names from the server's own list, resolved inside the linked
  folder (the path checks `vmixMedia.ts` already does). It only reads; it never writes, deletes or
  plays anything from the share.
- **No link, or the share is down**: Take, level and typed trim keep working exactly as today. The
  timeline and Normalize say "Link the server's media folder in Settings to see the waveform."

### 3.3 A Bridge route: `/analyse`

`POST /analyse { target, name }` returns
`{ ok, key, seconds, peaks, slices: { loudness, truePeak } }`, where `key` is `bytes:changed` from
the server's list. Values are packed (tenths of a dB as 16-bit numbers, base64), so an hour of
audio is about 72 KB of slices. A long file streams from the share in the background; the page
shows "Reading the file…" on the timeline. One analysis per file at a time; a second request for
the same file waits for the first. The capability list gains `analyse`, so an older Bridge simply
shows no timeline.

### 3.4 Storing it

- **The analysis** (peaks and slices) is a cache, not part of the production: kept in the browser
  (IndexedDB), keyed by server, file name and `key`. A changed file has a new `key` and is read
  again. Another computer reads the file once on demand. The synced production stays small.
- **The result** is in the record, because it decides what airs:
  - `CuePlayback.levelDb`, as today: the level the Take sends.
  - New, additive optional: `CuePlayback.normalized?: { target: number; measured: number;
    peakLimited?: true }`. It records that the level came from Normalize, so the cue reads
    "Normalized to -23 LUFS" and can follow its own trim (§3.5).
  - New, additive optional: `Show.loudnessTarget?: number`. Absent means -23.

### 3.5 Normalize

- **The production target**: in the production's settings, a choice of -23 LUFS (EBU R128, the
  default), -24 (ATSC A/85), -18, -16, -14, or any number typed.
- **Normalize** beside the Level control on each clip or audio cue. Level = target - measured
  loudness of the part that plays (the trim, or the whole file). Example: -31.2 LUFS measured,
  -23 target, level +8.2 dB.
- **Normalize all**, in the production's rundown menu: every clip and audio cue (stills skipped),
  with a short summary at the end: how many cues changed, which were peak limited, which files
  could not be read and why.
- **Peak guard**: if the new level would push the true peak above -1 dBTP, the level stops at the
  point where the peak is -1 dBTP and the cue reads "Normalized to -25.4 LUFS, peak limited". A
  limiter that would let it reach the target is a later option, not part of this plan.
- **It stays normalized**: while `normalized` is set, moving a timeline handle recomputes the level
  from the slices. Touching the Level control by hand clears `normalized`; the value stays.
- **Silence**: a part with nothing above the -70 LUFS gate is not normalized, and says so.
- **On air**: like every level change today, it applies at the next Take. A playing cue is never
  changed mid-air.
- **Level range**: today's +6 dB ceiling is too low for quiet files (a -35 LUFS file needs +12 dB
  for -23). The ceiling rises to **+20 dB** for every cue. The peak guard protects Normalize;
  a hand-set level above +6 dB shows its true peak warning when the analysis is known.

### 3.6 The timeline

- Under the cue's Level and Fade, a **Timeline** button opens a strip the width of the cue panel:
  the waveform, two handles for start and end, the chosen part highlighted, and its length. Closed
  by default; the cue's summary line still reads `0:05-0:42` as today.
- Handles snap to the file's frames (from `frames`/`fps`) and cannot cross; the existing typed
  start and end boxes stay beside the strip, and both edit the same `trimIn`/`trimOut`, validated
  by the same `trimProblem`.
- The waveform is drawn on a canvas from the cached peaks. A video file shows its sound's waveform;
  a video with no sound shows a flat line and the handles still work.
- Arrow keys move the focused handle by one frame, Shift by one second. Each handle is labelled.
- No preview playback, no thumbnails (owner decision).
- If the Bridge or server cannot trim, the handles are off for the same reason the typed boxes are
  off today (`offerBlocked`).

## 4. Phases

Each phase lands on its own through `/queue-merge`.

| Phase | What | Size |
|---|---|---|
| **1** | Bridge: the bundled ffmpeg, the media folder link and its check, `/analyse` with fixtures (WAV, MP3, a video with sound, a video with none, a 5.1 file, a silent file). Unit tests for the gating arithmetic against ffmpeg's own integrated value. | medium |
| **2** | The timeline: the cache, the strip, the handles, keyboard, and the "link the folder" state. | medium |
| **3** | Normalize: the production target, the button, Normalize all, the peak guard, following the trim, the +20 dB ceiling. | small to medium |
| **4** | Real server check (below). | small |

## 5. Acceptance

- A WAV, an MP3 and a video's sound, each normalized to -23, then played on a real CasparCG and
  recorded with a FILE consumer: ffmpeg measures each recording at -23 LUFS, within 0.5 LU. The
  same at -16. (The method of `CLIP_PLAYBACK_PLAN.md` §12, item 4.)
- A trimmed part, normalized, airs at the target, not the whole file's loudness.
- A loud file is peak limited, says so, and its recording's true peak is at or under -1 dBTP.
- Dragging a handle on the timeline moves the same start and end the typed boxes show, and the
  Take airs that part.
- With the share unplugged mid-show, Take, level and trim still work; only the timeline and
  Normalize say the folder cannot be reached.
- An older Bridge without `analyse`: no timeline button, nothing else changes.
- Normalize all over a 30-cue production finishes and reports every cue it could not do.

## 6. Risks, and what guards each

| Risk | Guard |
|---|---|
| A 5.1 or 8-channel file is measured one way and mixed down by CasparCG another, so it airs off target | 5.1 fixture in phase 1; real-server recording in phase 4. If it differs, measure the channel layout CasparCG outputs. |
| The linked folder is the wrong one, or a different copy of the files | the size check in §3.2 on every analysis, not only when linking |
| A big video file over a slow share takes long | background read, progress on the strip, one read per file ever, cached |
| ffmpeg licence | an LGPL build only, shipped as its own file with its notice |
| A cue's level changed by Normalize all while it plays | levels apply at the next Take only, as today |
| The level ceiling change lets a hand-set level clip | the true peak warning when the analysis is known |

## 7. Not in this plan

- vMix: the measurement would work (Bridge has the folder), but vMix cues take no level or trim
  yet. A later step once they do.
- Sounds inside NoaCG graphics (played in the browser): could be normalized in the browser the
  same way; separate step.
- A limiter, loudness range (LRA) targets, and a live loudness meter of the channel's output.
