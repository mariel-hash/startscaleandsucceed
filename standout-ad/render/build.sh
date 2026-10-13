#!/usr/bin/env bash
# Rebuild the Standout ad end to end:
#   cue sheet -> synthesized soundtrack -> motion-blurred 1080p60 frames -> MP4
# Needs: node + playwright (Chromium), python3 with numpy/scipy, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
WORK=${WORK:-$(mktemp -d)}
echo "work dir: $WORK"

node render/capture.mjs cues render/cues.json
python3 render/soundtrack.py render/cues.json "$WORK/soundtrack.wav"
ffmpeg -y -loglevel error -i "$WORK/soundtrack.wav" -c:a aac -b:a 256k soundtrack.m4a

# 60 fps, 180-degree shutter, 4 browser workers, 4 samples/frame (up to 32 in transitions)
node render/capture.mjs video "$WORK/frames.mkv" 60 0.5 4 4

ffmpeg -y -loglevel error -i "$WORK/frames.mkv" -i "$WORK/soundtrack.wav" -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -profile:v high -level 4.2 -x264-params aq-mode=3 \
  -c:a aac -b:a 256k -movflags +faststart -shortest standout-ad.mp4
echo "done -> standout-ad.mp4"
