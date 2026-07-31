# audfprint Feasibility Spike

This isolated spike tests whether [`audfprint`](https://github.com/dpwe/audfprint)
can recognize the same live concert performance across independent audience
recordings and return a stable alignment offset. It does not modify or import
the CrowdClip application, database, or workers.

The experiment deliberately tests a harder question than matching a clip cut
from its own reference file:

- Recording A is the fingerprint reference.
- Recordings B and C capture the same performance with different microphones.
- A fourth recording contains the same composition from a different concert and
  acts as a negative control.
- Generated MP4 files verify the video-to-audio path used by CrowdClip.

Downloaded media and generated binary fixtures are ignored by Git. Only scripts,
metadata, checksums, commands, and measured results should be retained.

## Toolchain

- Python 3.11. Python 3.14 is installed on the development machine but is not
  used for this spike because scientific-package support is less predictable.
- The recorded run used Python 3.11.15 and FFmpeg 8.1.2.
- Official audfprint repository pinned to commit
  `cb03ba99feafd41b8874307f0f4e808a6ce34362`.
- NumPy 1.26.4. The official source currently calls `numpy.asfarray`, which was
  removed in NumPy 2. Pinning NumPy is a dependency constraint; audfprint itself
  is not patched.
- FFmpeg and FFprobe. On Apple Silicon Homebrew, this installation is available
  under `/opt/homebrew/opt/ffmpeg/bin`.

The official audfprint README documents 11,025 Hz as its default analysis sample
rate and defines its match score as consistently time-aligned landmark hashes.
It says that more than five or six such hashes generally indicates a true match.
The score is a raw count, not a percentage or probability.

## Folder layout

```text
spikes/audfprint-feasibility/
├── README.md
├── requirements.txt
├── .gitignore
├── fixtures/
│   ├── sources/
│   ├── reference/
│   ├── queries/
│   └── video/
├── scripts/
│   ├── fetch_archive_fixture.py
│   ├── fetch_commons_video.py
│   ├── prepare_audio.py
│   ├── build_fingerprint_db.sh
│   ├── run_experiment.py
│   └── create_test_video.sh
├── results/
│   ├── results.csv
│   ├── summary.json
│   └── REPORT.md
└── fixtures-manifest.json
```

## 1. Install system dependencies

macOS with Homebrew:

```bash
brew install ffmpeg python@3.11
export PATH="/opt/homebrew/opt/ffmpeg/bin:$PATH"
ffmpeg -version
python3.11 --version
```

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg git python3.11 python3.11-venv
```

Docker is not required for this local spike. A virtual environment plus pinned
Python packages is smaller and makes it easier to inspect every command. A
container would be appropriate later if the experiment becomes a service.

## 2. Create the isolated Python environment

From this directory:

```bash
uv venv --python /opt/homebrew/bin/python3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Standard `venv` and `pip` also work:

```bash
/opt/homebrew/bin/python3.11 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Clone the official implementation at the pinned revision:

```bash
mkdir -p .vendor
git clone https://github.com/dpwe/audfprint.git .vendor/audfprint
git -C .vendor/audfprint checkout cb03ba99feafd41b8874307f0f4e808a6ce34362
git -C .vendor/audfprint rev-parse HEAD
```

No audfprint source changes are required. Its dependencies are installed from
this spike's pinned `requirements.txt`.

## 3. Acquire the Internet Archive fixtures

The fetch script requests each item's metadata endpoint and prints every file
whose title or filename contains `Brown Eyed Women`. It ranks downloadable
formats in this order: VBR MP3, Ogg Vorbis, then FLAC. Only the best single track
is downloaded from each item.

```bash
.venv/bin/python scripts/fetch_archive_fixture.py all
```

The command:

1. Saves each original metadata response under `fixtures/sources/`.
2. Downloads one song rather than a complete concert item.
3. Computes SHA-256.
4. Writes source URL, direct download URL, format, size, role, and attribution
   context to `fixtures-manifest.json`.
5. Skips an existing file only when its current SHA-256 matches the manifest.

Individual sources can be fetched by key:

```bash
.venv/bin/python scripts/fetch_archive_fixture.py moore
.venv/bin/python scripts/fetch_archive_fixture.py petrunis stevenson
.venv/bin/python scripts/fetch_archive_fixture.py sportatorium
```

If no suitable derivative is downloadable, the script fails and leaves the
metadata response available for inspection. It never falls back to a stream-only
soundboard source.

## 4. Optionally acquire an openly licensed concert video

This fixture checks only that a real video can be decoded to the standard WAV
format. It is not expected to match the Grateful Dead reference.

Inspect candidates first:

```bash
.venv/bin/python scripts/fetch_commons_video.py --list-only
```

Download the smallest clearly licensed candidate under 80 MiB:

```bash
.venv/bin/python scripts/fetch_commons_video.py
```

For the recorded experiment, candidates were reviewed first and this explicit
selection was used so the script did not silently choose an unrelated short
video:

```bash
.venv/bin/python scripts/fetch_commons_video.py \
  --title 'File:Koncerto en la baro Water Melon (Ĉengduo) 07.webm'
```

The selected 6,614,141-byte WebM is credited to RG72 and licensed CC BY-SA 4.0.
Its Commons page, direct URL, attribution, checksum, and API metadata are saved
in `fixtures-manifest.json`; its decoded duration is 18.17 seconds.

The script rejects entries without a clear Creative Commons or public-domain
license URL. It records title, creator, license, attribution, page URL, direct
media URL, size, duration when available, and SHA-256 before the video is used.

## 5. Normalize audio and generate query clips

```bash
export FFMPEG_BIN=/opt/homebrew/opt/ffmpeg/bin/ffmpeg
export FFPROBE_BIN=/opt/homebrew/opt/ffmpeg/bin/ffprobe
.venv/bin/python scripts/prepare_audio.py
```

Every audfprint input is written as:

```text
WAV / mono / 16-bit PCM / 11025 Hz
```

The script makes 5, 10, 15, and 30-second clips around 30, 60, 120, and
180 seconds, while keeping every extraction at least five seconds from the end.
For each clean query it creates:

- an AAC 64 kbps encode/decode round trip;
- a 150 Hz high-pass and 5,000 Hz low-pass variant;
- a -10 dB variant;
- a combined filter, attenuation, and AAC variant.

The requested 7,000 Hz phone low-pass cannot survive the final 11,025 Hz sample
rate because Nyquist is 5,512.5 Hz. The spike therefore uses 5,000 Hz as the
closest meaningful cutoff in the standardized input. This is documented rather
than hidden.

Generated query metadata is stored in `fixtures/queries/queries.json`.

## 6. Create generated MP4 fixtures

```bash
FFMPEG_BIN=/opt/homebrew/opt/ffmpeg/bin/ffmpeg \
  sh scripts/create_test_video.sh
```

The script creates a black 720x1280 H.264 frame with AAC audio for clean and
combined 15- and 30-second Moore and Petrunis clips. It then extracts each MP4
back to the standard WAV format. The Moore files are positive controls for the
container path; Petrunis retains the independent-recorder condition. This tests
the real CrowdClip container shape without introducing another media source.

## 7. Build the fingerprint database

```bash
sh scripts/build_fingerprint_db.sh
```

Equivalent audfprint command:

```bash
.venv/bin/python .vendor/audfprint/audfprint.py new \
  --dbase fixtures/reference/cornell-moore.fpdb \
  --samplerate 11025 \
  --density 20 \
  --maxtimebits 16 \
  fixtures/reference/moore_reference.wav
```

`--maxtimebits 16` avoids the default offset wrap for references longer than
about 380 seconds. The reduced track-ID capacity is irrelevant to this one-song
catalogue.

## 8. Run the experiment

Run one query first to verify installation and output parsing:

```bash
.venv/bin/python scripts/run_experiment.py --limit 1
```

Then run the complete matrix:

```bash
.venv/bin/python scripts/run_experiment.py
```

Useful debugging filters:

```bash
.venv/bin/python scripts/run_experiment.py \
  --query-regex 'petrunis_15s_at_60s_(clean|combined)'
```

Each audfprint invocation uses `match`, `--find-time-range`, and
`--exact-count`. The parser stores:

- the raw consistently aligned landmark count as `audfprint_score`;
- the raw common hash count;
- the predicted reference offset;
- the matched time span;
- execution time and errors.

It does not invent a normalized confidence value.

## Relative offset evaluation

Independent tapes can include different amounts of crowd noise before a song.
Absolute track timestamps are therefore not treated as shared ground truth.

For each source, transformation, and duration, the earliest successful query is
used as an anchor. If later queries were extracted 60 seconds apart, their
predicted reference offsets should also differ by about 60 seconds. The signed
difference is written to `offset_error_seconds` and summarized as an absolute
error distribution.

## Outputs

- `results/results.csv`: one row per query.
- `results/summary.json`: group rates, threshold calculations, offset metrics,
  audfprint revision, and conclusion.
- `results/REPORT.md`: plain-language answers to the ten product questions.

The report applies the requested decision thresholds and ends with `GO`,
`LIMITED GO`, or `NO-GO`. Generated results are evidence from this fixture set,
not a scientific guarantee for every venue or phone.

## Fixture safety

Before sharing changes, verify that no media is tracked:

```bash
git status --short --ignored spikes/audfprint-feasibility
git check-ignore -v fixtures/sources/example.mp3
find fixtures -type f \
  \( -name '*.mp3' -o -name '*.flac' -o -name '*.wav' -o -name '*.mp4' \)
```

The final `find` command lists local binaries for review; those files must remain
ignored and must never be committed.

## References

- [Official audfprint repository](https://github.com/dpwe/audfprint)
- [Official audfprint README](https://github.com/dpwe/audfprint/blob/master/README.md)
- [Internet Archive metadata API](https://archive.org/developers/metadata-schema/)
- [Wikimedia Commons API](https://www.mediawiki.org/wiki/API:Imageinfo)
- [FFmpeg documentation](https://ffmpeg.org/documentation.html)
