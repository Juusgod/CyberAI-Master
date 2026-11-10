#!/bin/sh
# Optional convenience launcher; the HTML also opens directly in a browser.
lab_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1
lab_file="$lab_dir/Cybersecurity_AI_Lab.html"
if command -v open >/dev/null 2>&1; then
  exec open "$lab_file"
elif command -v xdg-open >/dev/null 2>&1; then
  exec xdg-open "$lab_file"
else
  printf 'Open this file in your browser:\n%s\n' "$lab_file"
fi
