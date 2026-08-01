# Concert Alignment Feasibility Spike

This isolated spike tests a time-sequence alignment method designed for separate
recordings of the same concert. It reuses the preserved media corpus from
`../audfprint-feasibility` by path. It does not copy, alter, or delete those
fixtures and does not import CrowdClip application code.

## Why this differs from audfprint

`audfprint` expects enough sparse landmark hashes to be identical between a
query and reference. That worked for digitally transformed copies of one file
but produced no matches between independent Cornell audience tapes.

The method here follows the core signal representation described in the 2018
Concert Stitch paper:

1. Decode mono WAV audio.
2. Resample to 5,000 Hz.
3. Split it into 2,048-sample Hann-windowed frames with a 512-sample hop.
4. Sum spectral energy into 33 logarithmic bands between 300 and 2,000 Hz.
5. Convert changes between adjacent bands and frames into 32-bit robust
   fingerprints based on Haitsma and Kalker.
6. Search the reference over time-scale factors from 0.92 to 1.08.
7. Accept a match only when its bit similarity, separation from the next
   unrelated peak, and time scale all pass the recorded feasibility gate.

The time-scale search is the important addition. The independent 1977 tapes run
at slightly different speeds, so a fixed-offset hash lookup gradually loses
alignment even though both tapes captured the same performance.

## Reference selection

The full song from Jeff Stevenson's recording is the experiment reference. Rich
Petrunis clips are the simulated fan recordings. The Internet Archive metadata
confirms that these are independent sources:

- Petrunis: mono Sony handheld recorder, transferred from his master cassette.
- Stevenson: handheld Shure 57 microphones about ten feet from the stage.

The earlier Jerry Moore tape remains preserved in the audfprint spike. It was
also screened with the new method but produced substantially weaker alignment
against the other sources. That is useful evidence: the algorithm works, but an
arbitrary low-compatibility reference can still make an event unsuitable.

For CrowdClip, the preferred reference would be an exact-show board feed,
multitrack-derived mix, or another validated clean capture—not a studio master
and not an arbitrary audience tape.

## Setup

System dependencies:

```bash
brew install ffmpeg python@3.11
```

Create the isolated environment:

```bash
cd spikes/concert-alignment-feasibility
uv venv --python /opt/homebrew/bin/python3.11 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Only NumPy and SciPy are required. `librosa` and external recognition providers
are not used.

## Preserved fixture prerequisite

Run the acquisition and preparation flow in the audfprint spike first if its
ignored local media is absent:

```bash
cd ../audfprint-feasibility
.venv/bin/python scripts/fetch_archive_fixture.py all
.venv/bin/python scripts/prepare_audio.py
sh scripts/create_test_video.sh
```

The new spike reads:

```text
../audfprint-feasibility/fixtures/queries/stevenson_full_source.wav
../audfprint-feasibility/fixtures/queries/queries.json
../audfprint-feasibility/fixtures/queries/*.wav
```

No media is written into this directory.

## Explore one or more clips

The prototype prints both affine fingerprint alignment and an experimental DTW
comparison:

```bash
.venv/bin/python scripts/prototype_align.py \
  ../audfprint-feasibility/fixtures/queries/stevenson_full_source.wav \
  ../audfprint-feasibility/fixtures/queries/petrunis_15s_at_60s_clean.wav \
  ../audfprint-feasibility/fixtures/queries/sportatorium_15s_at_60s_clean.wav
```

The unrestricted DTW prototype is intentionally not used for the decision
matrix: without path constraints it can over-warp unrelated audio. The affine
search gave more reliable separation on these 5–30-second clips.

## Run the complete experiment

```bash
.venv/bin/python scripts/run_experiment.py
```

The command fingerprints the Stevenson reference once, then processes:

- 80 Petrunis cross-recording queries;
- 80 same-recording Stevenson controls;
- 80 Sportatorium different-performance controls; and
- four Petrunis MP4 extraction round trips.

Outputs:

- `results/results.csv`: one row per query, including raw similarity, second
  peak, peak margin, time scale, offset, timing, and error.
- `results/summary.json`: group rates and the product-threshold calculation.
- `results/REPORT.md`: plain-language findings and limitations.

## Match gate

The recorded feasibility gate is:

```text
fingerprint similarity >= 0.59
peak margin >= 0.02
time scale between 0.95 and 1.05
```

Fingerprint similarity is the fraction of agreeing robust fingerprint bits at
the best time-scale-aware alignment. Peak margin is the difference between that
candidate and the strongest candidate at least one query-duration away. Neither
number is a calibrated probability.

These values were selected while examining this fixture set. They demonstrate
feasibility, but they must be validated on unseen concerts and modern phone
recordings before becoming production defaults.

## Results

The recorded run processed 244 queries without execution errors:

- clean cross-recording: 16/16;
- degraded cross-recording: 63/64;
- clean 10-, 15-, and 30-second product threshold: 12/12;
- degraded 15- and 30-second product threshold: 32/32;
- different-performance controls: 0/80 false matches;
- MP4 cross-recording round trips: 4/4;
- relative offsets within two seconds: 60/60;
- median absolute relative offset error: 0.0992 seconds;
- maximum absolute relative offset error: 0.5984 seconds.

The only missed degraded query was a five-second AAC sample whose peak margin
was 0.019259, narrowly below the 0.02 gate. Five-second clips were not required
to meet the main threshold.

See `results/REPORT.md` for the decision and `results/results.csv` for every
measurement.

## Production cautions

- This is an O(reference length × scale factors) prototype, not yet a catalogue
  index. An event-specific setlist remains small enough for further testing.
- Reference compatibility must be checked when an event is configured.
- An unseen-concert validation set is required to calibrate thresholds.
- The Haitsma–Kalker fingerprint family carries historical patent warnings in
  both Panako and Aurio. Obtain legal advice before commercial deployment.
- The spike makes no NestJS, PostgreSQL, Redis, BullMQ, or worker changes.

## References

- [Concert Stitch: Organization and Synchronization of Crowd-Sourced Recordings](https://musicinformatics.gatech.edu/wp-content_nondefault/uploads/2018/06/Subramanian-and-Lerch-Concert-Stitch-Organization-and-Synchromization-o.pdf)
- [Panako](https://github.com/JorenSix/Panako)
- [Aurio](https://github.com/protyposis/Aurio)
