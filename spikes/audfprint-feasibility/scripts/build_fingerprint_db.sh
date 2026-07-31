#!/bin/sh

set -eu

spike_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python_bin=${PYTHON_BIN:-"$spike_dir/.venv/bin/python"}
audfprint_script=${AUDFPRINT_SCRIPT:-"$spike_dir/.vendor/audfprint/audfprint.py"}
reference="$spike_dir/fixtures/reference/moore_reference.wav"
database="$spike_dir/fixtures/reference/cornell-moore.fpdb"

if [ ! -x "$python_bin" ]; then
  echo "error: Python environment is missing: $python_bin" >&2
  exit 1
fi

if [ ! -f "$audfprint_script" ]; then
  echo "error: audfprint is missing: $audfprint_script" >&2
  exit 1
fi

if [ ! -f "$reference" ]; then
  echo "error: normalized reference is missing: $reference" >&2
  exit 1
fi

echo "+ build $database from $reference"
"$python_bin" "$audfprint_script" new \
  --dbase "$database" \
  --samplerate 11025 \
  --density 20 \
  --maxtimebits 16 \
  "$reference"

echo "Fingerprint database created at $database"

