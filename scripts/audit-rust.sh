#!/bin/sh
set -eu

cd "$(dirname "$0")/../src-tauri"

# quick-xml 0.37.5 is pulled in solely by tauri-winrt-notification, a
# Windows-only transitive dependency. Clipwise ships only for macOS. The
# quick-xml version used by the macOS Tauri/plist path is patched at 0.41.0.
cargo audit \
  --ignore RUSTSEC-2026-0194 \
  --ignore RUSTSEC-2026-0195
