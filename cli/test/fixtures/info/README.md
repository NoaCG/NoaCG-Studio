# INFO answers from a real CasparCG 2.5.0

Captured on 2026-09-28 from CasparCG Server 2.5.0 (`69e8ad5 Stable`, Windows) with two 1080p50
channels, for docs/CLIP_PLAYBACK_PLAN.md §12 item 1. Each file holds the AMCP commands that set the
case up on channel 2, what the case shows, and the whole raw reply to `INFO 2`, byte for byte
(`\r\n` as the server sent it). `cli/test/state.test.mjs` reads the parser against these and never
against the fake server.

The media: `NOACG_FIXTURE/COUNT30`, a 30 s 25 fps test pattern with a silent audio track;
`NOACG_FIXTURE/SILENCE20`, a 20 s silent WAV; `GIORNO`, a JPEG still. Both generated files were made
with the ffmpeg that ships beside the server (`testsrc2` and `anullsrc`) and removed afterwards.

What the captures settled:

- `INFO <channel>` answers `201 INFO OK` and one data line of XML whose own line breaks are bare
  LF. `INFO 2-10` answers the same whole-channel document; the layer is ignored.
- `file/time` is the position in the whole file and the file's length; `file/clip` is the segment
  that plays, its start and length. A clip and an audio file are both `ffmpeg`.
- `SEEK`, `IN`, `OUT` and `LENGTH` count frames at the channel's rate: `SEEK 250 LENGTH 375` on a
  25 fps file in a 50p channel is 5 s in and 7.5 s long. `IN 250 OUT 625` is the same segment.
- A queued background is a `transition` producer wrapping its file, and `frames_left` appears on
  the foreground only while that background is queued with `AUTO`.
- A MIX under way is a `transition` foreground whose file fields are the incoming clip's, with
  `transition/frame` [done, total].
- `202 PLAY OK` comes before the clip is on the layer. An `INFO` a few milliseconds after it showed
  the layer still empty, or on a re-take of the same file that file at its end; `video-just-played`
  is one about 130 ms later, a cut transition into the new clip at its start.

`v2.3-trimmed.json` and `v2.3-looping-queued.json` are the same cases read from CasparCG 2.3 the
same day (the build in the machine's 2.3.3 LTS folder, which reports `2.3.2 4de6d18f Dev`), on its
channel 1, also 1080p50. They read the same way, with two differences: no `<format>` element, and a
clip named WITH its extension (`NOACG_FIXTURE/COUNT30.mp4`).

`info-timing.json` is §12 item 2: forty `INFO 2` round trips a quarter of a second apart, a new
connection each, with a clip playing. The median was 1.5 ms and the slowest 3 ms: the answer is
cheap next to the page's two readings a second, and phase 3's four. Whether that rate ever costs a
frame on air was not measured; it needs the channel's own output watched, and belongs to the
owner's check on the real server.

## Phase 3: a clip's playback, and the channel's rate (2026-09-28)

The same two servers, for docs/CLIP_PLAYBACK_PLAN.md §12 items 3 to 7 and 9 and §18 case 7. The
media were 10-second clips with a 1 kHz tone (`A10`, `B10`, `C10`), a 3-second one (`SHORT3`) and a
20-second tone (`TONE20`), made with the ffmpeg beside the server and removed afterwards. On 2.3 the
channel is 1, on 2.5.0 it is 2, layer 10 on both.

- `p3-full-play`, `p3-full-loadbg` (and `p3-v2.3-full-loadbg`): every parameter the Bridge writes,
  `IN 50 OUT 400 MIX 25 AF "volume=0.5012" LOOP`, accepted by both and read back as the segment
  [1, 7]. Behind a looping clip `frames_left` reads close to 2^32 and never fires.
- `p3-af-playing`: a clip playing through `AF "volume=0.2512"`. INFO's `mixer/audio/volume` is a
  peak meter, not a gain: -19.98 dBFS at 0 dB, -31.98 dBFS through the filter.
- `p3-clear-fade-mid` (and `p3-v2.3-clear-fade-mid`), `p3-clear-fade-after`: a clip with the empty
  colour queued behind it with `MIX 25 AUTO`, six frames into the fade, and after it. The fade began
  0.5 s before the end; the outgoing clip's file fields are gone the moment it starts. 2.3's
  transition names no producer.
- `p3-paused-inside-window` (and `p3-v2.3-...`): PAUSE sent inside a follower's `MIX 50` window
  freezes the mix at 26 of 50 frames, with the incoming file's fields.
- `p3-trimmed-follower-airing`: a follower queued with `IN 250 OUT 400` airing at its trimmed start.
- `p3-disarmed`: `LOADBG c-l EMPTY` without AUTO after a follower was queued: nothing waits to play
  by itself, and the clip holds at its end.
- `format-1080i5000`, `format-1080p2997`, `format-1080i5994`: channel 2 switched with `SET 2 MODE`
  and back. INFO's `framerate` is 50, 30000/1001 and 60000/1001: for an interlaced format it is
  already the field rate, which is what `MIX`, `SEEK` and `LENGTH` count (`MIX 50` took about a
  second on 1080i50, 1.67 s at 29.97 and 0.83 s at 59.94).

Not captured as a file, and recorded in docs/BRIDGE.md §3b: a follower queued within about 60 ms
of `PLAY … IN n` fires at once on both versions; the level measured 12.0 dB apart with ffmpeg's
volumedetect on a FILE consumer's recording; and a Take reached the layer about 115 ms after
`202 PLAY OK` on 2.5.0 (95 ms on 2.3), about 55 ms preloaded.
