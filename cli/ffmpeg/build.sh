#!/usr/bin/env bash
# Build the small, audio-only, LGPL ffmpeg and ffprobe that NoaCG Bridge reads sound files with
# (docs/AUDIO_TIMELINE_LOUDNESS_PLAN.md §3.3). One recipe for every target, so the Linux build the
# CLI tests run against is the same configuration the Windows exe ships.
#
#   cli/ffmpeg/build.sh linux <out-dir>   # ffmpeg, ffprobe for this Linux machine
#   cli/ffmpeg/build.sh win64 <out-dir>   # ffmpeg.exe, ffprobe.exe, cross-built with mingw-w64
#
# <out-dir> receives the two programs, the LGPL licence text, BUILD.txt (the exact source commit
# and configure line) and ffmpeg-source.tar.gz (the exact source this was built from), which a
# release publishes beside the exe.
#
# LICENCE. Only LGPL parts: no --enable-gpl, no --enable-nonfree, no external libraries
# (--disable-autodetect), and configure is asked to confirm it before anything is compiled.
#
# WHAT IT READS. The containers a playout server holds (WAV, W64, AIFF, CAF, MP3, MP4/MOV, MXF,
# Matroska, MPEG-TS/PS, AVI, FLAC, Ogg, raw AAC/AC-3) and their usual audio codecs. Video is never
# decoded: the Bridge maps audio streams only. The filters are the ones the measure and waveform
# jobs use (cli/src/playout/audio/).
set -euo pipefail

TARGET="${1:?target: linux or win64}"
OUT="$(mkdir -p "${2:?out dir}" && cd "$2" && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
VERSION="7.1.2"
COMMIT="f893221c8d89cb798b829bebe71d55e1a3f242fd"
WORK="${FFMPEG_WORK:-${RUNNER_TEMP:-/tmp}/noacg-ffmpeg-$TARGET}"
JOBS="$(nproc 2>/dev/null || echo 2)"

rm -rf "$WORK" && mkdir -p "$WORK"
git -c advice.detachedHead=false clone -q --depth 1 --branch "n$VERSION" https://github.com/FFmpeg/FFmpeg "$WORK/src"
GOT="$(git -C "$WORK/src" rev-parse HEAD)"
if [ "$GOT" != "$COMMIT" ]; then
  echo "FFmpeg n$VERSION is $GOT, expected $COMMIT. Refusing to build an unpinned source." >&2
  exit 1
fi

DEMUXERS="wav,w64,aiff,caf,mp3,mov,mxf,matroska,mpegts,mpegps,avi,flac,ogg,aac,ac3,eac3"
DECODERS="pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_s32be,pcm_f32le,pcm_f32be,pcm_f64le,pcm_f64be,pcm_u8,pcm_s8,pcm_alaw,pcm_mulaw,pcm_s16le_planar,pcm_s24daud,pcm_dvd,pcm_bluray,mp1,mp1float,mp2,mp2float,mp3,mp3float,aac,aac_latm,ac3,eac3,flac,vorbis,opus,alac,adpcm_ima_wav,adpcm_ms"
PARSERS="aac,aac_latm,ac3,mpegaudio,flac,vorbis,opus"
FILTERS="ebur128,aresample,amerge,aformat,anull,pan,atrim,asetpts"
CONFIG=(
  --disable-everything --disable-autodetect --disable-doc --disable-debug --disable-network
  --disable-ffplay --disable-avdevice --disable-swscale --disable-postproc
  --enable-ffmpeg --enable-ffprobe --enable-avformat --enable-avcodec --enable-avfilter --enable-swresample
  --enable-static --disable-shared --enable-small --disable-x86asm
  --enable-protocol=file,pipe
  "--enable-demuxer=$DEMUXERS" "--enable-decoder=$DECODERS" "--enable-parser=$PARSERS" "--enable-filter=$FILTERS"
  --enable-encoder=pcm_f32le,pcm_s16le --enable-muxer=pcm_f32le,pcm_s16le,null
)
case "$TARGET" in
  linux) EXTRA=() ; EXE="" ;;
  win64) EXTRA=(--arch=x86_64 --target-os=mingw32 --cross-prefix=x86_64-w64-mingw32- --extra-ldflags=-static) ; EXE=".exe" ;;
  *) echo "unknown target $TARGET" >&2; exit 1 ;;
esac

cd "$WORK/src"
./configure --prefix="$WORK/prefix" "${CONFIG[@]}" "${EXTRA[@]}" > "$WORK/configure.log"
grep -q '^License: LGPL version 2.1 or later' "$WORK/configure.log" || { echo "configure did not report LGPL 2.1 or later:" >&2; tail -20 "$WORK/configure.log" >&2; exit 1; }
make -j"$JOBS" "ffmpeg$EXE" "ffprobe$EXE" > "$WORK/make.log" 2>&1 || { tail -40 "$WORK/make.log" >&2; exit 1; }

cp "ffmpeg$EXE" "ffprobe$EXE" "$OUT/"
STRIP="strip"; [ "$TARGET" = win64 ] && STRIP="x86_64-w64-mingw32-strip"
"$STRIP" "$OUT/ffmpeg$EXE" "$OUT/ffprobe$EXE"
cp COPYING.LGPLv2.1 "$OUT/COPYING.LGPLv2.1"
git archive --format=tar.gz --prefix="ffmpeg-$VERSION/" -o "$OUT/ffmpeg-source.tar.gz" HEAD
{
  echo "FFmpeg $VERSION, commit $COMMIT (https://github.com/FFmpeg/FFmpeg/tree/n$VERSION)"
  echo "Built for $TARGET by cli/ffmpeg/build.sh in NoaCG Studio. Licence: LGPL 2.1 or later (COPYING.LGPLv2.1)."
  echo "The exact source is ffmpeg-source.tar.gz. No patches were applied."
  echo
  echo "./configure ${CONFIG[*]} ${EXTRA[*]}"
} > "$OUT/BUILD.txt"
cp "$HERE/build.sh" "$OUT/build.sh"
echo "[ffmpeg] $TARGET -> $OUT ($(du -h "$OUT/ffmpeg$EXE" | cut -f1) ffmpeg, $(du -h "$OUT/ffprobe$EXE" | cut -f1) ffprobe)"
