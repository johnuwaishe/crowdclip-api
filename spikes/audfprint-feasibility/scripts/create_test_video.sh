#!/bin/sh

set -eu

spike_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
query_dir="$spike_dir/fixtures/queries"
video_dir="$spike_dir/fixtures/video"
ffmpeg_bin=${FFMPEG_BIN:-}

if [ -z "$ffmpeg_bin" ]; then
  if command -v ffmpeg >/dev/null 2>&1; then
    ffmpeg_bin=$(command -v ffmpeg)
  elif [ -x /opt/homebrew/opt/ffmpeg/bin/ffmpeg ]; then
    ffmpeg_bin=/opt/homebrew/opt/ffmpeg/bin/ffmpeg
  else
    echo "error: ffmpeg not found; set FFMPEG_BIN" >&2
    exit 1
  fi
fi

mkdir -p "$video_dir"

for source in moore petrunis
do
  for specification in \
    "15 clean" \
    "15 combined" \
    "30 clean" \
    "30 combined"
  do
    duration=${specification%% *}
    transformation=${specification##* }
    stem="${source}_${duration}s_at_60s_${transformation}"
    input="$query_dir/$stem.wav"
    output="$video_dir/$stem.mp4"
    extracted="$query_dir/${stem}_from_mp4.wav"

    if [ ! -f "$input" ]; then
      echo "error: expected prepared query is missing: $input" >&2
      exit 1
    fi

    echo "+ create $output"
    "$ffmpeg_bin" \
      -hide_banner \
      -loglevel error \
      -y \
      -f lavfi \
      -i color=c=black:s=720x1280:r=30 \
      -i "$input" \
      -shortest \
      -c:v libx264 \
      -pix_fmt yuv420p \
      -c:a aac \
      -b:a 96k \
      "$output"

    echo "+ extract $extracted"
    "$ffmpeg_bin" \
      -hide_banner \
      -loglevel error \
      -y \
      -i "$output" \
      -vn \
      -ac 1 \
      -ar 11025 \
      -c:a pcm_s16le \
      "$extracted"
  done
done

echo "Created and re-extracted eight generated MP4 fixtures."
