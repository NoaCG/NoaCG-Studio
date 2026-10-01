# Server media on channels 1 and 2, alpha, and the output slot, on real CasparCG (AC-4, AC-3)

2026-10-01, the owner's Windows laptop. Nothing on production and no CasparCG configuration edited.

## What ran

- **Servers.** `C:\casparcg\casparcg-server-v2.5.0-stable-windows\casparcg.exe` (answers `VERSION`
  with `2.5.0 69e8ad5 Stable`) and `C:\casparcg\casparcg-server-v2.3.3-lts-stable\casparcg.exe`
  (answers `2.3.2 4de6d18f Dev`), each on a scratch configuration in the session scratchpad: two
  `720p5000` channels, no consumers, media, logs, data and CEF cache in the scratchpad, AMCP on 5350
  and 5351. 2.3 was given its configuration by a path relative to its own folder.
- **Bridge.** This branch's build (`npm --prefix cli run build`, version 0.7.0) run as
  `node cli/dist/playoutEntry.js --port 8898 --no-open` with `APPDATA` pointed at the scratchpad.
  Every play below went through its `/act` route with the shapes the page sends (`take` with a
  `media` item and a `casparcg` slot, `out` with the item), so the AMCP lines are the adapter's own.
- **Media**, made with ffmpeg 1280x720 at 50 fps: a red opaque box and a blue box at 50 % alpha on a
  transparent ground, as QuickTime Animation (`qtrle`, argb), ProRes 4444 (`yuva444p10le`), VP9
  WebM (`yuva420p`) and a PNG, each in a straight and (for the two video codecs) a premultiplied
  version (`premultiply=inplace=1`); an opaque H.264 test clip; a 440 Hz WAV.
- **NoaCG output stand-in.** A transparent HTML page with an opaque green box overlapping both
  coloured boxes, played on 1-20 as the Bridge plays the output URL (`PLAY 1-20 [HTML] "<url>"`).
- **Readings.** `INFO <channel>` for what each layer holds. For pixels, the channel recorded with
  the ffmpeg consumer (`ADD 1 FILE <name>.mov -codec:v qtrle -pix_fmt:v argb`, which keeps the
  mixer's BGRA) and probed with ffmpeg. The image consumer (`ADD 1 IMAGE`) was tried first and
  dropped: it un-premultiplies on write and its values wrapped around, so it misreports alpha.

## Routing (both servers alike)

Through the Bridge, then `INFO 1` and `INFO 2`:

| Take | Layer held afterwards |
|---|---|
| output stand-in on 1-20 | 1-20 `html overlay.html` |
| clip, loop, on 2-10 | 2-10 `ffmpeg NORMAL_CLIP` |
| audio, loop, level 0.5, on 2-5 | 2-5 `ffmpeg TONE` |
| premultiplied ProRes alpha, loop, 0.5 s fade in, on 1-10 | 1-10 `ffmpeg PREMUL_PRORES` |
| audio on 1-5 | 1-5 `ffmpeg TONE` |
| PNG still on 2-10 (replacing the clip) | 2-10 `image ALPHA_STILL.png` |
| PNG still on 1-11 | 1-11 `image ALPHA_STILL.png` |
| Out on 1-10, 1-11, 1-5, 2-5, 2-10 (`202 STOP OK` each) | channel 1: only 1-20 `html`; channel 2: nothing |
| clip taken on **1-20** | 1-20 `ffmpeg NORMAL_CLIP`: **the output is gone** |

So nothing ties media to a channel, every kind plays on either channel at its layer, Out on a media
layer leaves the output alone, and a take on the output's own slot replaces it on both versions.

## Alpha on channel 1 (pixels of the recorded channel)

Probes: the blue box alone (50 % alpha over nothing), the blue box over the green output box, the
red box over the green box. The clip played on 1-30, above the output on 1-20; under it (1-10) the
green box covered both overlaps, as layer order says.

| Source | 2.5.0 blue alone | 2.5.0 blue over green | 2.3.2 blue alone | 2.3.2 blue over green |
|---|---|---|---|---|
| straight qtrle | 0,0,255,127 | 0,128,255 | 0,0,255,127 | 0,146,255 |
| straight ProRes 4444 | 0,0,254,127 | 0,128,254 | 0,0,255,127 | 0,146,255 |
| straight VP9 WebM | 0,15,255,127 | 0,143,255 | 0,0,255,**254** | 0,0,255 |
| PNG still | 0,0,127,127 | 0,128,127 | 0,0,125,127 | 0,127,126 |
| premultiplied qtrle | 0,0,128,127 | 0,128,128 | 0,0,132,127 | 0,137,136 |
| premultiplied ProRes 4444 | 0,0,127,127 | 0,128,127 | 0,0,132,127 | 0,136,132 |

The correct half-blue over green is about 0,128,127. Background pixels read 0,0,0,0 and opaque red
255,0,0,255 (2.3: 254 alpha) for every source; red over green stayed red when the clip was above.

- CasparCG treats a video file's colours as already premultiplied. A straight-alpha render
  (After Effects' default) therefore comes out too bright wherever it is partly transparent: soft
  edges, shadows, fades. A premultiplied render is exact on both versions. Stills are premultiplied
  by the image producer, so a PNG is always right.
- VP9 alpha is lost entirely on 2.3 (an opaque black ground) and straight on 2.5. Not recommended.
- No `MIXER ... STRAIGHT_ALPHA_OUTPUT` exists on either version (`400 ERROR`).

## Limits

- No SDI card here: the fill and key outputs and the ATEM DSK were not tested. The decklink consumer
  is fed the same mixer frame that was recorded, so with premultiplied media and NoaCG's output
  (premultiplied, like every browser's) the DSK should run with Pre Multiplied Key on. That is an
  owner check in the studio.
- Audio was checked by what the layers hold, not by ear: no audio consumer was configured.
- One machine: the servers ran beside the Bridge at 127.0.0.1.
