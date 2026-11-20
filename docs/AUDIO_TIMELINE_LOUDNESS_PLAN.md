# Waveform timeline and loudness normalize - the plan

Status: planned, not started. Revision 2 (2026-11-20), after two independent reviews (§9).
Builds on `docs/CLIP_PLAYBACK_PLAN.md` (level, trim, audio on layer 5) and `docs/BRIDGE.md` (how
the page reaches the playout server).

## 1. What the owner asked for

1. A short **waveform timeline with two handles** to choose which part of a clip or audio file
   plays. Opened when needed, not always visible. No video thumbnails and no preview playback:
   the operator plays the cue on the server to hear it.
2. A **Normalize** button that sets a cue's level so it airs at a chosen loudness, and a way to
   normalize the whole production. Any LUFS target can be chosen; **-23 LUFS is the default**.
3. Everything happens **inside the playout system**. The file on the server is never rewritten.

Owner answers, 2026-11-20: CasparCG runs on a **separate computer**, and its media folder **can be
shared over the network**. Default target **-23 LUFS**. A Bridge download **20 to 40 MB larger**
(for ffmpeg) is fine.

Scope: **CasparCG, Bridge on Windows.** The Bridge exe is built and shipped for Windows only
(`.github/workflows/release-bridge.yml`). vMix cues take no level or trim yet (`vmixPlayers.ts`),
so vMix waits. The npm CLI Bridge does not advertise the new routes.

## 2. What exists today

- `CuePlayback.levelDb` (`src/model/shows.ts`): -60 to +6 dB per cue, sent at Take as the clip's
  own audio filter `AF "volume=<linear>"` (`src/control/cuePlayback.ts`). The Bridge refuses a
  gain above 2, which is +6 dB (`cli/src/playout/server.ts`, `MAX_GAIN`). The slider steps in
  whole dB.
- `CuePlayback.trimIn` / `trimOut`: seconds into the file, typed under Advanced in
  `ServerCueEditor.tsx`, validated by `trimProblem`, shown in tenths by `clockOf`, and sent as
  `IN`/`OUT` counted in the **channel's** frame rate (`adapters/casparcg.ts`).
- The server's list gives each file a playout name without extension (`SPORTS/GOAL_REPLAY`), its
  `bytes` and its `changed` date (`ListItem`, `cli/src/playout/protocol.ts`). Audio files can have
  no length in the list.
- Play next and Play-through folders already check member kind, length and the two-second minimum
  (`src/control/serverPlayout.ts`), and the Bridge enforces them.

Nothing reads a server file's sound today.

## 3. The design

### 3.1 Two Bridge jobs, both with ffmpeg, both on demand

- **Waveform**, when the operator opens the Timeline. ffmpeg decodes every audio track of the
  file; the Bridge folds the decoded samples into about 2,000 bins of min and max, taking the
  largest value across all channels (never a mono mix, which can cancel or hide a short sound).
  It also returns the file's own duration, from the container when the audio is shorter or absent.
- **Measure**, when the operator presses Normalize. ffmpeg measures **exactly the committed part**
  (seeked to the trim start, stopped at the trim end) with the `ebur128` filter and `peak=true`,
  and the Bridge reads its final integrated loudness and true peak. Nothing is rebuilt from saved
  slices: a reviewer showed a short burst near a trim point can be 20 LU off that way, because the
  measurement windows start at the trim, not at the file's start.

Both are **long jobs**, kept off the Take, Out and state calls and their few-second deadlines: the
page starts a job, reads its progress, and can cancel it. The Bridge runs **one file at a time**.

**What is measured is what airs.** CasparCG merges all of a file's audio tracks, resamples to the
channel's rate, and places channels by index into its output; it does not downmix
(`av_producer.cpp`, 2.3.3 and 2.5.0). ffmpeg alone reads only the first track, and weighs a mono
file 3 LU lower than the same sound on two channels. So the Measure job reproduces CasparCG's
path: merge all tracks, resample to 48 kHz, and measure the channels the output carries, with the
BS.1770 weights for that layout (stereo by default; 5.1 with surround weights and no LFE). A file
whose mapping cannot be stated is measured as stereo and the cue says so. **Phase 1 proves this
against a real server before any UI is built** (§5).

**Outcomes**, each said in words on the cue: measured; silent (nothing above the -70 LUFS gate);
too short (under 0.4 s cannot be measured); no audio track; file could not be read, and why.

### 3.2 Reaching the file: a linked media folder on a share

The Bridge runs on the operator's computer and never listens on the network (`BRIDGE.md` §1c).
It reads the server's media folder through a Windows share the operator links once.

- **Settings, Playout, per CasparCG server: Media folder**, a typed path, `\\PLAYOUT\media`
  preferred. A mapped drive letter is accepted but warned: it is invisible to a Bridge started as
  administrator. A folder picker comes later.
- **Name to file.** The list's name keeps its subfolders. The Bridge lists that one subfolder,
  matches the name without case or extension, and requires **exactly one** match whose size equals
  the list's `bytes`. Two candidates, or none, refuse with the reason. No search by bare file name
  anywhere else, so a renamed file is reported missing, never guessed.
- **Before and after each job** the Bridge checks the file's size and modified time again. A file
  that changed during a job discards the result.
- **States, each with its own words and action**: not linked; access denied (sign in to the share
  as this Windows user); share offline; file missing or renamed; file differs from the server's
  list.
- **Safety**: reads only, inside the linked folder, with the containment checks `vmixMedia.ts`
  already does. `fs.realpath` on SMB and DFS is tested on a real share in phase 1.
- With no link or a broken one, Take, level and typed trim work exactly as today.

### 3.3 ffmpeg in the Bridge

- An **audio-only LGPL ffmpeg for Windows built by the project** in CI: pinned version, pinned
  configure flags (no GPL or nonfree parts), with the demuxers for the promised containers (WAV,
  MP3, MP4, MOV, MXF, transport streams), their audio decoders, `ebur128`, `aresample`, `amerge`.
- **Shipped inside the one Bridge exe** as a single-executable asset, unpacked on first use into a
  versioned folder in the user's profile, its checksum verified before every start. The download
  stays one file.
- The licence texts, the exact source and patches, and the build script are published with each
  release.
- The release workflow smoke-tests a real waveform and a real measurement from the built exe.
- Risk kept in view: an unsigned exe that unpacks and starts another exe is likelier to meet
  antivirus or AppLocker (`BRIDGE.md`, "Unsigned, for now"). Phase 1 tries it on a stock Windows
  with Defender on.

### 3.4 A higher level ceiling, without breaking older Bridges

- The cue level range becomes **-60 to +20 dB**, in 0.1 dB steps on the slider.
- The Bridge advertises a new capability, **`gain-20`**, and raises `MAX_GAIN` to 10.
- A cue above +6 dB needs `gain-20`: checked when editing **and** at Take, for the cue, every Play
  next follower and every folder member (`playbackNeeds`, the existing Take checks). An older
  Bridge gets a disabled Take that says why, never a refusal on air.
- The protocol mirror, the Bridge validator and their boundary tests change together. The +6 dB
  limits on sounds inside graphics are a different feature and stay.

### 3.5 Normalize

- **Production target** in the production's setup: -23 LUFS (EBU R128, default), -24 (ATSC A/85),
  -18, -16, -14, or any number. Stored as `Show.loudnessTarget?: number`, absent = -23. Changing it
  changes nothing already set; Normalize all applies it.
- **Normalize** beside Level on each clip or audio cue. Gain = target - measured, then limited:
  - by the **peak guard**: the true peak after gain stays at or under -1 dBTP;
  - by the **level range**, -60 to +20 dB.
  The cue shows the target, the gain applied and the loudness it will air at. When a limit binds,
  it says which: "Airs at -25.4 LUFS, peak limited (target -23)". Never "Normalized to -23" unless
  it is.
- **What is stored** (additive optional, `CuePlayback.normalized`): `target`, `measured`,
  `truePeak`, `levelDb`, `fileKey` (bytes, changed date), `trimIn`, `trimOut`, `layout`. The badge
  is shown only while the cue's level, trim and file still match it. Anything else (a moved
  handle, a typed trim, a replaced file, a hand-moved level, an older build editing the cue) turns
  it into "Measured for an earlier version - Normalize again". The level that plays is never
  changed by that: only a press of Normalize changes it.
- **Normalize all**, in the rundown menu: every clip and audio cue, stills skipped. One file at a
  time, with progress and Cancel; the same file and part measured once. A warning first when
  something is on air (the reads load the playout computer's disk). **Cues whose level was set by
  hand are skipped by default** and listed, with an option to include them (a music bed kept low
  on purpose stays low). Results are saved as **one undo step**, and only for cues unchanged since
  their job started. A summary lists what changed, what was limited, what was skipped and why. A
  sequence already playing keeps the levels it was taken with.

### 3.6 The timeline

- Under Level and Fade, a **Timeline** button opens a strip the width of the cue panel: the
  waveform, two handles, the chosen part highlighted, its start, end and length. Closed by default.
- **One commit path** for the handles, the typed boxes and Whole clip. A box nobody edited is never
  committed, so it cannot round away a handle's value. Times show in hundredths.
- **Snapping** to the channel's frame rate when known, else 0.01 s. The part is at least one
  channel frame long. Handles cannot cross.
- **Before a trim is committed**, the existing Play next and Play-through checks run on the result;
  a trim that would break a sequence (shorter than its two-second minimum, for example) names the
  cue or folder it affects. A trim valid on its own stays allowed.
- Unknown duration: typed trim only, until the waveform job returns the duration. Stills: no
  timeline. A video with no sound: a flat line, the handles still work.
- Arrow keys move the focused handle by one frame, Shift by one second. Each handle is labelled.
- No preview playback, no thumbnails (owner decision). Where trim is not offered today
  (`offerBlocked`), the handles are off the same way, and an unsupported saved trim can still be
  cleared.

## 4. Phases

Each phase lands on its own through `/queue-merge`.

| Phase | What | Size |
|---|---|---|
| **1. Feasibility** | Build the audio-only ffmpeg; embed and unpack it from the exe; on a real CasparCG 2.3 and 2.5 server, record with a FILE consumer: mono, stereo, 5.1, two mono tracks (MXF style), a 44.1 kHz file, a short faded cue, and compare with the Measure job's prediction; test the share (UNC, mapped drive, administrator start, `realpath`, a file replaced mid-read). Go or stop on the numbers. | medium |
| **2. Bridge** | Media folder link and its states, name-to-file matching, the waveform and measure jobs with progress and cancel, `gain-20` and `MAX_GAIN`. | medium |
| **3. Timeline** | The strip, one commit path, snapping, sequence checks, hundredths. | medium |
| **4. Normalize** | Production target, the button, the stored measurement and its staleness, Normalize all, the 0.1 dB slider, the +20 dB range and its Take checks. | medium |
| **5. Real server check** | §5 acceptance on air. | small |

## 5. Acceptance

- Phase 1's recordings measure within 0.5 LU of the Measure job's prediction for every file type
  listed, or the plan says which types are left out and why.
- A WAV, an MP3 and a video's sound normalized to -23, recorded on air: -23 LUFS within 0.5 LU. The
  same at -16. A trimmed part airs at its own target, not the whole file's.
- A loud file is peak limited, says so, and its recording's true peak is at or under -1 dBTP.
- A short burst at a trim point: the Measure job agrees with ffmpeg run on the cut part alone.
- A cue at +12 dB with an older Bridge: Take is off and says why, before air.
- Moving a handle on a normalized cue keeps its level and shows "Normalize again".
- A handle at 5.04 s survives editing the other box.
- Share unplugged mid-show: Take, level and trim still work; the timeline says the share is offline.
- A file replaced on the server during Normalize all: that cue is reported, not changed.
- Normalize all over 30 cues: one undo step brings every level back.

## 6. Risks

| Risk | Guard |
|---|---|
| Measured loudness differs from what airs (channel mapping, tracks) | phase 1 recordings before any UI; stereo stated when the mapping is unknown |
| A higher gain refused on air by an older Bridge | `gain-20` checked at edit and Take, for every sequence member |
| The wrong file measured | exact one-match rule with size, rechecked before and after |
| A stale "normalized" badge | stored file, trim and level; badge only while all match |
| Long reads during a show | jobs off the Take path, one at a time, cancel, on-air warning |
| Antivirus blocks the unpacked ffmpeg | tried in phase 1; signing is the standing fix |
| ffmpeg licence | project-built LGPL configuration, source and texts published per release |

## 7. Not in this plan

vMix; macOS and Linux Bridge builds; the npm CLI Bridge; sounds inside NoaCG graphics; a limiter;
loudness range (LRA) targets; a live loudness meter; zoomed waveform detail for long files.

## 8. Still unverified

How CasparCG pads channels after the filter (phase 1 recording settles it); `fs.realpath` on SMB
and DFS; the size of a project-built audio-only ffmpeg; whether team sync keeps unknown `Show`
fields (check before `loudnessTarget` ships).

## 9. Review, 2026-11-20

Two independent reviews (Astra, Fable), both "agree with corrections". Taken:

- Measure the exact committed part with ffmpeg instead of rebuilding from 100 ms slices (Astra's
  20.8 LU counterexample; Fable's tests matched within 0.05 LU but did not cover a burst at the
  trim point). This also removes the per-slice peak parsing both found was wrong as planned.
- Channel mapping and multi-track measured CasparCG's way, proven in phase 1, not phase 4.
- `gain-20` capability and Take checks for older Bridges; 0.1 dB slider.
- Stored measurement identity and the stale rule; no automatic level writes.
- Exact name-to-file matching; share states; typed UNC path first.
- Windows only; ffmpeg embedded in the one exe; CI-built LGPL binary with its source.
- One commit path for trim, hundredths, channel-frame snapping, sequence checks before commit.
- Normalize all: one file at a time, cancel, on-air warning, one undo step, hand-set levels skipped
  by default.
- Waveform from decoded samples across all channels, not a mono mix.
