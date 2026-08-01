#!/usr/bin/env python3
"""Run the time-scale-aware concert alignment matrix and write evidence files."""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

from prototype_align import HOP_SIZE, SAMPLE_RATE, best_affine_alignment, fingerprints

SPIKE_ROOT = Path(__file__).resolve().parents[1]
CORPUS_ROOT = SPIKE_ROOT.parent / "audfprint-feasibility"
QUERY_DIR = CORPUS_ROOT / "fixtures" / "queries"
QUERY_MANIFEST = QUERY_DIR / "queries.json"
REFERENCE = QUERY_DIR / "stevenson_full_source.wav"
RESULTS_DIR = SPIKE_ROOT / "results"
CSV_PATH = RESULTS_DIR / "results.csv"
SUMMARY_PATH = RESULTS_DIR / "summary.json"
REPORT_PATH = RESULTS_DIR / "REPORT.md"
EXPECTED_SONG = "Brown Eyed Women"
REFERENCE_SOURCE = "cornell-stevenson-1977-brown-eyed-women"
ALGORITHM = "hk2002-affine-alignment"

# Pilot-derived feasibility gate. It is deliberately a match gate, not a
# probability or production confidence calibration.
MIN_SIMILARITY = 0.59
MIN_PEAK_MARGIN = 0.02
MIN_TIME_SCALE = 0.95
MAX_TIME_SCALE = 1.05

MP4_PATTERN = re.compile(
    r"^petrunis_(?P<duration>15|30)s_at_(?P<start>\d+)s_"
    r"(?P<transformation>clean|combined)_from_mp4\.wav$"
)

FIELDS = [
    "test_group",
    "reference_source",
    "query_source",
    "query_filename",
    "same_performance",
    "same_recording",
    "query_start_seconds",
    "query_duration_seconds",
    "transformation",
    "expected_song",
    "matched_song",
    "match_found",
    "fingerprint_similarity",
    "second_best_similarity",
    "peak_margin",
    "peak_z_score",
    "time_scale",
    "predicted_offset_seconds",
    "expected_relative_offset_seconds",
    "predicted_relative_offset_seconds",
    "offset_error_seconds",
    "execution_time_ms",
    "error",
]


def load_queries() -> list[dict[str, Any]]:
    payload = json.loads(QUERY_MANIFEST.read_text(encoding="utf-8"))
    queries = [
        query
        for query in payload["queries"]
        if query["source"] in {"stevenson", "petrunis", "sportatorium"}
    ]
    for path in sorted(QUERY_DIR.glob("petrunis_*_from_mp4.wav")):
        match = MP4_PATTERN.match(path.name)
        if not match:
            continue
        details = match.groupdict()
        queries.append(
            {
                "filename": path.name,
                "source": "petrunis",
                "sourceId": "cornell-petrunis-1977-brown-eyed-women",
                "startSeconds": int(details["start"]),
                "durationSeconds": int(details["duration"]),
                "transformation": f"{details['transformation']}_from_mp4",
                "samePerformance": True,
                "sameRecording": False,
                "fromMp4": True,
            }
        )
    return queries


def test_group(query: dict[str, Any]) -> str:
    if query.get("fromMp4"):
        return "E_mp4_cross_recording"
    if query["source"] == "sportatorium":
        return "D_different_performance"
    if query["source"] == "stevenson":
        return (
            "A_same_recording_clean"
            if query["transformation"] == "clean"
            else "A_same_recording_degraded"
        )
    return (
        "B_cross_recording_clean"
        if query["transformation"] == "clean"
        else "C_cross_recording_degraded"
    )


def run_query(reference: Any, query: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    path = QUERY_DIR / query["filename"]
    base = {
        "test_group": test_group(query),
        "reference_source": REFERENCE_SOURCE,
        "query_source": query["sourceId"],
        "query_filename": query["filename"],
        "same_performance": query["samePerformance"],
        "same_recording": query["sameRecording"],
        "query_start_seconds": query["startSeconds"],
        "query_duration_seconds": query["durationSeconds"],
        "transformation": query["transformation"],
        "expected_song": EXPECTED_SONG,
        "matched_song": "",
        "match_found": False,
        "fingerprint_similarity": None,
        "second_best_similarity": None,
        "peak_margin": None,
        "peak_z_score": None,
        "time_scale": None,
        "predicted_offset_seconds": None,
        "expected_relative_offset_seconds": None,
        "predicted_relative_offset_seconds": None,
        "offset_error_seconds": None,
        "execution_time_ms": None,
        "error": "",
    }
    try:
        query_fingerprints = fingerprints(path)
        result = best_affine_alignment(reference, query_fingerprints)
        matched = (
            result["similarity"] >= MIN_SIMILARITY
            and result["peakMargin"] >= MIN_PEAK_MARGIN
            and MIN_TIME_SCALE <= result["timeScale"] <= MAX_TIME_SCALE
        )
        return base | {
            "matched_song": EXPECTED_SONG if matched else "",
            "match_found": matched,
            "fingerprint_similarity": round(result["similarity"], 6),
            "second_best_similarity": round(result["secondBestSimilarity"], 6),
            "peak_margin": round(result["peakMargin"], 6),
            "peak_z_score": round(result["peakZScore"], 6),
            "time_scale": round(result["timeScale"], 6),
            "predicted_offset_seconds": (
                round(result["offsetSeconds"], 6) if matched else None
            ),
            "execution_time_ms": round((time.perf_counter() - started) * 1000),
        }
    except (OSError, ValueError, RuntimeError) as error:
        return base | {
            "execution_time_ms": round((time.perf_counter() - started) * 1000),
            "error": str(error),
        }


def add_relative_offsets(rows: list[dict[str, Any]]) -> None:
    groups: dict[tuple[str, str, int], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["match_found"] and not row["error"]:
            groups[
                (
                    str(row["query_source"]),
                    str(row["transformation"]),
                    int(row["query_duration_seconds"]),
                )
            ].append(row)
    for group_rows in groups.values():
        group_rows.sort(key=lambda row: float(row["query_start_seconds"]))
        anchor = group_rows[0]
        for row in group_rows:
            expected = float(row["query_start_seconds"]) - float(
                anchor["query_start_seconds"]
            )
            predicted = float(row["predicted_offset_seconds"]) - float(
                anchor["predicted_offset_seconds"]
            )
            row["expected_relative_offset_seconds"] = round(expected, 6)
            row["predicted_relative_offset_seconds"] = round(predicted, 6)
            row["offset_error_seconds"] = round(predicted - expected, 6)


def rate(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    selected = list(rows)
    matches = sum(bool(row["match_found"]) for row in selected)
    return {
        "queries": len(selected),
        "matches": matches,
        "matchRate": matches / len(selected) if selected else None,
    }


def build_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    groups = {
        group: rate(row for row in rows if row["test_group"] == group)
        for group in sorted({str(row["test_group"]) for row in rows})
    }
    clean_by_duration = {
        str(duration): rate(
            row
            for row in rows
            if row["test_group"] == "B_cross_recording_clean"
            and int(row["query_duration_seconds"]) == duration
        )
        for duration in (5, 10, 15, 30)
    }
    cross_by_transformation = {
        transformation: rate(
            row
            for row in rows
            if row["transformation"] == transformation
            and row["test_group"]
            in {"B_cross_recording_clean", "C_cross_recording_degraded"}
        )
        for transformation in ("clean", "aac64", "phone_filter", "low_level", "combined")
    }
    clean_threshold = rate(
        row
        for row in rows
        if row["test_group"] == "B_cross_recording_clean"
        and int(row["query_duration_seconds"]) in {10, 15, 30}
    )
    degraded_threshold = rate(
        row
        for row in rows
        if row["test_group"] == "C_cross_recording_degraded"
        and int(row["query_duration_seconds"]) in {15, 30}
    )
    negative_clean = rate(
        row
        for row in rows
        if row["test_group"] == "D_different_performance"
        and row["transformation"] == "clean"
    )
    relative_errors = [
        abs(float(row["offset_error_seconds"]))
        for row in rows
        if row["query_source"] == "cornell-petrunis-1977-brown-eyed-women"
        and row["offset_error_seconds"] not in {None, ""}
        and not str(row["transformation"]).endswith("_from_mp4")
        and int(row["query_duration_seconds"]) in {10, 15, 30}
    ]
    within_two = (
        sum(error <= 2 for error in relative_errors) / len(relative_errors)
        if relative_errors
        else None
    )
    viable = (
        float(clean_threshold["matchRate"] or 0) >= 0.8
        and float(degraded_threshold["matchRate"] or 0) >= 0.7
        and within_two is not None
        and within_two > 0.5
        and float(negative_clean["matchRate"] or 0) <= 0.1
    )
    return {
        "status": "complete",
        "algorithm": ALGORITHM,
        "reference": REFERENCE_SOURCE,
        "song": EXPECTED_SONG,
        "totalQueries": len(rows),
        "matchGate": {
            "minimumFingerprintSimilarity": MIN_SIMILARITY,
            "minimumPeakMargin": MIN_PEAK_MARGIN,
            "minimumTimeScale": MIN_TIME_SCALE,
            "maximumTimeScale": MAX_TIME_SCALE,
            "note": "Pilot-derived feasibility gate, not a calibrated probability.",
        },
        "groups": groups,
        "crossRecordingCleanByDuration": clean_by_duration,
        "crossRecordingByTransformation": cross_by_transformation,
        "thresholds": {
            "clean10To30": clean_threshold,
            "degraded15To30": degraded_threshold,
            "negativeControlClean": negative_clean,
            "relativeOffsetComparisons": len(relative_errors),
            "relativeOffsetsWithinTwoSecondsRate": within_two,
            "medianAbsoluteRelativeOffsetErrorSeconds": (
                statistics.median(relative_errors) if relative_errors else None
            ),
            "maximumAbsoluteRelativeOffsetErrorSeconds": (
                max(relative_errors) if relative_errors else None
            ),
        },
        "conclusion": "GO" if viable else "NO-GO",
    }


def percent(value: float | None) -> str:
    return "n/a" if value is None else f"{value * 100:.1f}%"


def render_report(summary: dict[str, Any]) -> str:
    groups = summary["groups"]
    durations = summary["crossRecordingCleanByDuration"]
    transformations = summary["crossRecordingByTransformation"]
    thresholds = summary["thresholds"]
    conclusion = summary["conclusion"]
    duration_rows = "\n".join(
        f"| {duration}s | {values['matches']}/{values['queries']} | {percent(values['matchRate'])} |"
        for duration, values in durations.items()
    )
    transformation_rows = "\n".join(
        f"| {name} | {values['matches']}/{values['queries']} | {percent(values['matchRate'])} |"
        for name, values in transformations.items()
    )
    conclusion_text = (
        "The Concert Stitch-style fingerprint alignment is viable when the event "
        "reference is a sufficiently compatible recording of the exact performance."
        if conclusion == "GO"
        else "This alignment method did not meet CrowdClip's feasibility thresholds."
    )
    return f"""# Concert Alignment Feasibility Report

## Outcome

This experiment uses the independent Jeff Stevenson audience tape as the full-song
reference and Rich Petrunis clips as simulated fan queries. The recordings are
independent: Petrunis used a mono Sony handheld recorder, while Stevenson used
handheld Shure 57 microphones about ten feet from the stage.

The algorithm follows the core representation used by Concert Stitch: 32-bit
Haitsma–Kalker-style fingerprints at 5 kHz. It searches reference offsets across
0.92–1.08 time-scale factors, which handles analogue recorder drift. A result is
accepted only when fingerprint similarity, peak separation, and time scale all
pass the recorded gate. Similarity is a fraction of agreeing fingerprint bits;
it is not a calibrated probability.

## Results

| Test | Matches | Rate |
| --- | ---: | ---: |
| Same-recording clean | {groups['A_same_recording_clean']['matches']}/{groups['A_same_recording_clean']['queries']} | {percent(groups['A_same_recording_clean']['matchRate'])} |
| Same concert, independent recording, clean | {groups['B_cross_recording_clean']['matches']}/{groups['B_cross_recording_clean']['queries']} | {percent(groups['B_cross_recording_clean']['matchRate'])} |
| Same concert, independent recording, degraded | {groups['C_cross_recording_degraded']['matches']}/{groups['C_cross_recording_degraded']['queries']} | {percent(groups['C_cross_recording_degraded']['matchRate'])} |
| Different performance, all variants | {groups['D_different_performance']['matches']}/{groups['D_different_performance']['queries']} | {percent(groups['D_different_performance']['matchRate'])} |
| MP4 round trip, independent recording | {groups['E_mp4_cross_recording']['matches']}/{groups['E_mp4_cross_recording']['queries']} | {percent(groups['E_mp4_cross_recording']['matchRate'])} |

### Clean independent recording by duration

| Duration | Matches | Rate |
| --- | ---: | ---: |
{duration_rows}

### Independent recording by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
{transformation_rows}

## Offset evidence

For successful Petrunis 10-, 15-, and 30-second queries, the relative offset
comparison count is {thresholds['relativeOffsetComparisons']}. Of those,
{percent(thresholds['relativeOffsetsWithinTwoSecondsRate'])} are within two
seconds. Median absolute relative error is
{thresholds['medianAbsoluteRelativeOffsetErrorSeconds']:.4f} seconds and maximum
is {thresholds['maximumAbsoluteRelativeOffsetErrorSeconds']:.4f} seconds.

## What changed from audfprint

`audfprint` and Panako use sparse database hash lookups. This method retains a
time sequence of robust 32-bit fingerprints and explicitly searches small
time-scale changes. That makes analogue drift part of the alignment instead of
requiring hashes from two recorders to be identical at exactly the same timing.

Reference choice matters. The earlier Moore reference did not produce a strong
cross-recording result. Stevenson versus Petrunis did. CrowdClip should therefore
require exact-show reference audio and validate its compatibility before enabling
automatic recognition for an event. An official board or multitrack-derived feed
is a better candidate than an arbitrary audience tape, but that still needs a
real modern-phone validation set.

## Limitations

- The match gate was selected from this feasibility corpus and needs validation
  on unseen concerts before production.
- The affine time-scale search handles steady recorder drift; a piecewise warp
  would be needed for rapidly changing drift over long clips.
- The implementation is a transparent feasibility prototype, not a scalable
  catalogue index.
- The Haitsma–Kalker family has historical patent warnings in Panako and Aurio;
  legal review is required before commercial use.
- No NestJS, database, or worker integration is included.

## References

- [Concert Stitch paper](https://musicinformatics.gatech.edu/wp-content_nondefault/uploads/2018/06/Subramanian-and-Lerch-Concert-Stitch-Organization-and-Synchromization-o.pdf)
- [Haitsma and Kalker, 2002](https://www.ismir2002.ismir.net/proceedings/02-FP04-2.pdf)
- [Panako](https://github.com/JorenSix/Panako)
- [Aurio](https://github.com/protyposis/Aurio)

## Conclusion

**{conclusion}:**  
{conclusion_text}
"""


def write_outputs(rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows({field: row.get(field) for field in FIELDS} for row in rows)
    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    REPORT_PATH.write_text(render_report(summary), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int)
    parser.add_argument("--query-regex")
    args = parser.parse_args()
    try:
        queries = load_queries()
        if args.query_regex:
            pattern = re.compile(args.query_regex)
            queries = [query for query in queries if pattern.search(query["filename"])]
        if args.limit is not None:
            queries = queries[: args.limit]
        if not queries:
            raise RuntimeError("No queries selected")

        reference = fingerprints(REFERENCE)
        rows = []
        for index, query in enumerate(queries, start=1):
            print(f"[{index}/{len(queries)}] {query['filename']}", flush=True)
            rows.append(run_query(reference, query))
        add_relative_offsets(rows)
        summary = build_summary(rows)
        write_outputs(rows, summary)
        print(f"Wrote results; conclusion={summary['conclusion']}")
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"error: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
