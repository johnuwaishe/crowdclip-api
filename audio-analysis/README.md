# Audio Analysis

Python worker that fingerprints clip audio and aligns it against reference
recordings so the API can group clips capturing the same moment of a concert.
Invoked as a child process by the NestJS `audio-analysis` module
(`src/audio-analysis/`); the process contract lives in
`audio_analysis/contract.py`.

## Research basis

The approach is based on:

> Vinod Subramanian and Alexander Lerch. **"Concert Stitch: Organization and
> Synchronization of Crowd-Sourced Recordings."** 19th International Society
> for Music Information Retrieval Conference (ISMIR), Paris, 2018.

which in turn uses the fingerprint from:

> Jaap Haitsma and Ton Kalker. **"A Highly Robust Audio Fingerprinting
> System."** ISMIR, 2002.

### What we adopted from the paper

- **Haitsma–Kalker fingerprints** as the audio representation
  (`audio_analysis/fingerprint.py`), with the exact parameters from Concert
  Stitch Section 3.1: audio downmixed to mono and resampled to **5 kHz**,
  framed with **block size 2048** and **hop size 512**, energy summed into 33
  log-spaced bands between **300–2000 Hz**, and each frame reduced to **32
  bits** by taking the sign of the energy difference along the frequency axis
  and then the time axis. Bits are stored as ±1 floats so that FFT
  cross-correlation of two sequences directly counts matching bits
  (normalized similarity = 1 − bit error rate).
- **Cross-correlation of fingerprint sequences** to find the time offset
  between a clip and the reference.
- FFmpeg (`audio_analysis/media.py`) as the extraction boundary that turns
  arbitrary uploaded media into the standard 5 kHz mono WAV the fingerprinter
  expects.

### Where we deviate from the paper

The paper's main pipeline is subsequence **DTW over the fingerprint distance
matrix plus an SVM classifier** to pick the true overlap path, with
cross-correlation used only for sample-accurate fine-tuning (and evaluated
separately as a baseline). We deliberately do not implement DTW or the
classifier:

- **Affine scale search instead of DTW.** DTW exists in the paper to absorb
  playback-speed / tempo fluctuations. For my application, recordings will come from smartphones,
  where the dominant distortion is a small constant clock-rate difference,
  not the analog wow-and-flutter of the paper's Grateful Dead dataset. So
  `best_affine_alignment` brute-forces time-scale factors from **0.92 to
  1.08 in steps of 0.001**, resampling the query fingerprint sequence at
  each scale and cross-correlating against the reference. The best (scale,
  offset) pair wins.
- **Statistical confidence instead of a fixed BER threshold or SVM.** The
  paper's cross-correlation baseline used a fixed 0.35 bit-error-rate
  threshold, which the authors themselves flag as fragile on unseen data.
  Instead we report peak-quality statistics and let the caller decide:
  - `similarity` — best normalized correlation (1 − BER) over all scales;
  - `second_best_similarity` — best peak at least one query-length away
    from the winner (so sidelobes of the true peak don't count);
  - `peak_margin` — gap between the two, i.e. how unambiguous the match is;
  - `peak_z_score` — the winning peak's distance from the median similarity
    in standard deviations, across every offset and scale tried.

  Acceptance thresholds on these values live on the TypeScript side, not
  here.

### Known limitations

- The paper reports that on real-world data plain cross-correlation detects
  overlaps far worse than the DTW+SVM pipeline (F-measure 0.31 vs 0.81).
  The scale search and confidence statistics above target the two causes it
  identifies (tempo variation and a brittle fixed threshold), but overlap
  _detection_ — deciding whether a clip matches the reference at all — rests
  entirely on how well `peak_margin` / `peak_z_score` separate matches from
  noise. If same-moment grouping produces false positives, tune those
  thresholds first.
- The scale search assumes a constant rate offset within ±8%; recordings
  with genuinely varying speed (analog sources) would need the paper's DTW
  stage.
- The query must be no longer than the reference at every searched scale;
  `best_affine_alignment` raises otherwise.

## Layout

- `audio_analysis/media.py` — FFmpeg extraction to standard mono 5 kHz WAV.
- `audio_analysis/fingerprint.py` — fingerprint computation and affine
  alignment (all tunable constants at the top of the file).
- `audio_analysis/analyser.py` — orchestrates extraction → fingerprint →
  alignment for one request.
- `audio_analysis/contract.py` — JSON request/response contract with the
  Node worker.
- `audio_analysis/cli.py` — process entry point.
- `tests/` — pytest suite.

## Setup

Dependencies are NumPy and SciPy only (`requirements.txt`), plus `ffmpeg` on
`PATH`. The Node worker expects the interpreter at `audio-analysis/.venv/bin/python`
and disables itself if it is missing (see `src/audio-analysis/audio-analysis.config.ts`):

```bash
cd audio-analysis
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests
```
