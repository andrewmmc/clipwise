#!/usr/bin/env bash
#
# generate-appstore-screenshots.sh
#
# Composites raw app screenshots onto a clean, minimalist background
# for Mac App Store submission.
#
# Requirements: ImageMagick 7+ (brew install imagemagick)
#
# Usage:
#   ./scripts/generate-appstore-screenshots.sh
#   ./scripts/generate-appstore-screenshots.sh --size 2560x1600
#   ./scripts/generate-appstore-screenshots.sh --input-dir ~/my-screens
#   ./scripts/generate-appstore-screenshots.sh --no-captions
#
# Accepted Mac App Store sizes:
#   2880x1800  (default, Retina 15")
#   2560x1600  (Retina 13")
#   1440x900
#   1280x800

set -euo pipefail

# -- Defaults ----------------------------------------------------------
CANVAS_SIZE="2880x1800"
INPUT_DIR="$(cd "$(dirname "$0")/../assets" && pwd)"
OUTPUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/appstore-screenshots"
CORNER_RADIUS=16
CAPTION_FONT_SIZE=100
CAPTION_COLOR="#0a0a0a"
SUBCAPTION_FONT_SIZE=46
SUBCAPTION_COLOR="#8c8c8c"

BG_COLOR="#f8f8f8"

# Captions per screenshot (index-based, optional)
declare -a CAPTIONS=(
  "Define reusable actions"
  "Multi-provider support"
  "Browse transformation history"
  "Configure settings"
)

declare -a SUBCAPTIONS=(
  "Create custom prompt + provider combinations for rewriting, translating, and more"
  "Apple Intelligence, OpenAI, Anthropic, and local CLI tools"
  "Review past transformations with input/output details and quick copy"
  "Notifications, history, and max token limits"
)

# Only process screenshot-1 through screenshot-4 (skip menu bar screenshot-5)
declare -a INPUT_FILES=(
  "screenshot-1.png"
  "screenshot-2.png"
  "screenshot-3.png"
  "screenshot-4.png"
)

# -- Parse CLI args ----------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --size)        CANVAS_SIZE="$2"; shift 2 ;;
    --input-dir)   INPUT_DIR="$2";   shift 2 ;;
    --output-dir)  OUTPUT_DIR="$2";  shift 2 ;;
    --no-captions) CAPTIONS=(); SUBCAPTIONS=(); shift ;;
    -h|--help)
      echo "Usage: $0 [--size WxH] [--input-dir DIR] [--output-dir DIR] [--no-captions]"
      exit 0 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

CANVAS_W="${CANVAS_SIZE%x*}"
CANVAS_H="${CANVAS_SIZE#*x}"

mkdir -p "$OUTPUT_DIR"

echo "Canvas: ${CANVAS_W}x${CANVAS_H}"
echo "Input:  $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# -- Process each screenshot -------------------------------------------
index=0
for fname in "${INPUT_FILES[@]}"; do
  src="$INPUT_DIR/$fname"
  [ -f "$src" ] || { echo "  Skipping $fname (not found)"; index=$((index + 1)); continue; }
  out="$OUTPUT_DIR/$fname"
  caption="${CAPTIONS[$index]:-}"
  subcaption="${SUBCAPTIONS[$index]:-}"

  echo "=> Processing $fname ..."

  # Target screenshot size: 80% of canvas width, positioned below caption area
  target_w=$(( CANVAS_W * 80 / 100 ))
  if [ -n "$caption" ]; then
    target_h=$(( CANVAS_H * 52 / 100 ))
    # Caption at top, screenshot below
    caption_y=$(( CANVAS_H * 12 / 100 ))
    subcaption_y=$(( caption_y + CAPTION_FONT_SIZE + 28 ))
    screenshot_y=$(( CANVAS_H * 36 / 100 ))
  else
    target_h=$(( CANVAS_H * 75 / 100 ))
    screenshot_y=$(( CANVAS_H * 12 / 100 ))
  fi

  # Step 1: Resize screenshot
  resized="/tmp/clipwise_resized_${index}.png"
  magick "$src" -resize "${target_w}x${target_h}" -strip "$resized"

  # Step 2: Create rounded-corner mask and apply
  rounded="/tmp/clipwise_rounded_${index}.png"
  rw="$(magick identify -format '%w' "$resized")"
  rh="$(magick identify -format '%h' "$resized")"

  magick -size "${rw}x${rh}" xc:none \
    -fill white -draw "roundRectangle 0,0 $((rw-1)),$((rh-1)) ${CORNER_RADIUS},${CORNER_RADIUS}" \
    "/tmp/clipwise_mask_${index}.png"

  magick "$resized" "/tmp/clipwise_mask_${index}.png" \
    -alpha off -compose CopyOpacity -composite \
    "$rounded"

  # Step 3: Add subtle drop shadow
  shadowed="/tmp/clipwise_shadowed_${index}.png"
  magick "$rounded" \
    \( +clone -background "rgba(0,0,0,0.03)" -shadow "40x8+0+3" \) \
    +swap -background none -layers merge +repage \
    "$shadowed"

  # Step 4: Create canvas and composite
  magick -size "${CANVAS_W}x${CANVAS_H}" "xc:${BG_COLOR}" \
    "$shadowed" -gravity north -geometry "+0+${screenshot_y}" -compose over -composite \
    "$out"

  # Step 5: Add caption text above the screenshot
  if [ -n "$caption" ]; then
    magick "$out" \
      -gravity north \
      -font "/System/Library/Fonts/SFNS.ttf" \
      -weight 700 \
      -pointsize "$CAPTION_FONT_SIZE" \
      -fill "$CAPTION_COLOR" \
      -annotate "+0+${caption_y}" "$caption" \
      "$out"
  fi

  # Step 6: Add subcaption
  if [ -n "$subcaption" ]; then
    magick "$out" \
      -gravity north \
      -font "/System/Library/Fonts/SFNS.ttf" \
      -weight 400 \
      -pointsize "$SUBCAPTION_FONT_SIZE" \
      -fill "$SUBCAPTION_COLOR" \
      -annotate "+0+${subcaption_y}" "$subcaption" \
      "$out"
  fi

  # Clean up temp files
  rm -f "$resized" "$rounded" "$shadowed" "/tmp/clipwise_mask_${index}.png"

  dims="$(magick identify -format '%wx%h' "$out")"
  echo "  Done: $out ($dims)"
  index=$((index + 1))
done

echo ""
echo "Done! Generated $index screenshot(s) in $OUTPUT_DIR/"
echo "Accepted App Store sizes: 2880x1800, 2560x1600, 1440x900, 1280x800"
