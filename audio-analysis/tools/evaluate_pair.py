"""Evaluate fingerprint alignment on a real reference/query recording pair.

Give it two recordings of the same performance (e.g. a soundboard/matrix
source as --reference and an audience source as --query, from the Live Music
Archive). It cuts evenly spaced clips out of the query, aligns each against
the reference, and reports the match evidence per clip.

Ground truth without hand annotation: both files are continuous recordings,
so (found reference offset − clip start within the query) must be the same
constant for every clip. A tight spread of that delta means the alignments
are correct even if no one annotated the true offset.

Optionally pass --negative-query (a recording of DIFFERENT audio) to measure
what evidence false candidates produce — that gap is what the production
thresholds (similarity ≥ 0.59, peak margin ≥ 0.02) must sit inside.

Usage:
  .venv/bin/python -m tools.evaluate_pair \
      --reference matrix-song.ogg --query audience-song.ogg \
      --negative-query audience-other-song.ogg
"""

from __future__ import annotations

import argparse
import statistics
import tempfile
from pathlib import Path

from audio_analysis.fingerprint import Alignment, best_affine_alignment, fingerprints
from audio_analysis.media import extract_standard_wav

FFMPEG_TIMEOUT_SECONDS = 300


def _clip_wav(
    source_wav: Path, start_seconds: float, length_seconds: float, destination: Path
) -> None:
    import subprocess

    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            str(start_seconds),
            "-t",
            str(length_seconds),
            "-i",
            str(source_wav),
            "-c",
            "copy",
            str(destination),
        ],
        check=True,
        timeout=FFMPEG_TIMEOUT_SECONDS,
    )


def _align_clips(
    reference_values, query_wav: Path, query_seconds: float, args, workdir: Path, label: str
) -> list[tuple[float, Alignment]]:
    usable = query_seconds - args.clip_seconds - 2 * args.edge_margin_seconds
    if usable <= 0:
        raise SystemExit(f"{label} recording is too short for the requested clips")
    results: list[tuple[float, Alignment]] = []
    for index in range(args.clips):
        start = args.edge_margin_seconds + usable * index / max(1, args.clips - 1)
        clip_path = workdir / f"{label}-{index}.wav"
        _clip_wav(query_wav, start, args.clip_seconds, clip_path)
        alignment = best_affine_alignment(
            reference_values, fingerprints(clip_path).values
        )
        results.append((start, alignment))
    return results


def _report(rows: list[tuple[float, Alignment]], title: str) -> None:
    print(f"\n{title}")
    print(
        f"{'clip@':>8} {'offset':>9} {'delta':>9} {'sim':>6} {'margin':>7}"
        f" {'z':>6} {'scale':>6}"
    )
    deltas = []
    for start, a in rows:
        delta = a.offset_seconds - start
        deltas.append(delta)
        print(
            f"{start:>7.1f}s {a.offset_seconds:>8.2f}s {delta:>8.2f}s"
            f" {a.similarity:>6.3f} {a.peak_margin:>7.3f}"
            f" {a.peak_z_score:>6.1f} {a.time_scale:>6.3f}"
        )
    if len(deltas) > 1:
        spread = max(deltas) - min(deltas)
        print(
            f"delta spread: {spread * 1000:.0f} ms"
            f" (median delta {statistics.median(deltas):.2f}s)"
            + ("  <-- consistent alignments" if spread < 0.5 else "  <-- INCONSISTENT")
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", required=True, help="reference recording (any format)")
    parser.add_argument("--query", required=True, help="same-performance recording to cut clips from")
    parser.add_argument("--negative-query", help="different-audio recording for false-match evidence")
    parser.add_argument("--clips", type=int, default=8)
    parser.add_argument("--clip-seconds", type=float, default=15.0)
    parser.add_argument("--edge-margin-seconds", type=float, default=20.0)
    args = parser.parse_args()

    with tempfile.TemporaryDirectory() as temp_name:
        workdir = Path(temp_name)
        reference_wav = workdir / "reference.wav"
        query_wav = workdir / "query.wav"
        extract_standard_wav(args.reference, reference_wav, FFMPEG_TIMEOUT_SECONDS)
        extract_standard_wav(args.query, query_wav, FFMPEG_TIMEOUT_SECONDS)
        reference = fingerprints(reference_wav)
        print(
            f"reference: {reference.duration_seconds:.0f}s,"
            f" {len(reference.values)} fingerprint frames"
        )
        query_seconds = fingerprints(query_wav).duration_seconds

        positives = _align_clips(
            reference.values, query_wav, query_seconds, args, workdir, "clip"
        )
        _report(positives, "TRUE candidates (query clips vs reference)")

        if args.negative_query:
            negative_wav = workdir / "negative.wav"
            extract_standard_wav(args.negative_query, negative_wav, FFMPEG_TIMEOUT_SECONDS)
            negative_seconds = fingerprints(negative_wav).duration_seconds
            negatives = _align_clips(
                reference.values, negative_wav, negative_seconds, args, workdir, "neg"
            )
            _report(negatives, "FALSE candidates (unrelated clips vs reference)")

        matched = [
            a for _, a in positives if a.similarity >= 0.59 and a.peak_margin >= 0.02
        ]
        print(
            f"\nproduction thresholds (sim>=0.59, margin>=0.02):"
            f" {len(matched)}/{len(positives)} true candidates accepted"
        )


if __name__ == "__main__":
    main()
