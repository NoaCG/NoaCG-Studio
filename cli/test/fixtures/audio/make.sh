#!/usr/bin/env bash
# Regenerates the compressed audio fixtures read by test/audio.test.mjs. Needs a full ffmpeg
# (with lavfi and the encoders), not the Bridge's audio-only one. WAV fixtures are written by the
# test itself. Each file is about one second, so the folder stays small.
set -euo pipefail
cd "$(dirname "$0")"
S="ffmpeg -v error -y -bitexact"
TONE="sine=f=997:r=48000:d=1"
# MP3, mono, a 997 Hz tone.
$S -f lavfi -i "$TONE" -c:a libmp3lame -b:a 48k tone-mono.mp3
# MOV: a tiny picture and stereo AAC, as a playout clip carries it.
$S -f lavfi -i "color=c=gray:s=32x18:r=25:d=1" -f lavfi -i "$TONE" -map 0:v -map 1:a -af "pan=stereo|c0=c0|c1=c0" -c:v mjpeg -q:v 31 -c:a aac -b:a 64k clip-aac.mov
# MXF, MXF style: two mono PCM tracks, the same tone at two levels.
$S -f lavfi -i "color=c=gray:s=32x18:r=25:d=1" -f lavfi -i "$TONE" -f lavfi -i "$TONE" -filter_complex "[2:a]volume=-6dB[q]" -map 0:v -map 1:a -map "[q]" -c:v mpeg2video -b:v 50k -c:a pcm_s16le -t 1 two-tracks.mxf
# A video with no sound at all.
$S -f lavfi -i "color=c=gray:s=32x18:r=25:d=2" -c:v mjpeg -q:v 31 no-audio.mov

# The reference: this full ffmpeg's own EBU R128 reading of each file, mapped as the Bridge maps
# it (every audio track resampled to 48 kHz and merged, channels 1 and 2 as the programme). The
# test requires the Bridge's reading to agree within 0.1 LU.
ref() {
  local graph="$1" file="$2"
  ffmpeg -nostdin -hide_banner -nostats -i "$file" -vn -filter_complex "$graph,ebur128=peak=true:framelog=quiet" -f null - 2>&1 \
    | awk '/I:/{i=$2} /Peak:/{p=$2} END{printf "{\"integrated\": %s, \"truePeak\": %s}", i, p}'
}
{
  echo "{"
  echo "  \"tone-mono.mp3\": $(ref '[0:a:0]aresample=48000,pan=stereo|c0=c0|c1=0*c0' tone-mono.mp3),"
  echo "  \"clip-aac.mov\": $(ref '[0:a:0]aresample=48000,pan=stereo|c0=c0|c1=c1' clip-aac.mov),"
  echo "  \"two-tracks.mxf\": $(ref '[0:a:0]aresample=48000,pan=mono|c0=c0[a];[0:a:1]aresample=48000,pan=mono|c0=c0[b];[a][b]amerge=inputs=2,pan=stereo|c0=c0|c1=c1' two-tracks.mxf)"
  echo "}"
} > reference.json
cat reference.json
