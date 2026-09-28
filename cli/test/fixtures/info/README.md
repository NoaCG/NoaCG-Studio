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
