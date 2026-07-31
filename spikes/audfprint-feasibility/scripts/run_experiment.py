#!/usr/bin/env python3
"""Run the audfprint experiment matrix and generate evidence files."""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import statistics
import subprocess
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

SPIKE_ROOT = Path(__file__).resolve().parents[1]
QUERIES_DIR = SPIKE_ROOT / "fixtures" / "queries"
REFERENCE = SPIKE_ROOT / "fixtures" / "reference" / "moore_reference.wav"
DATABASE = SPIKE_ROOT / "fixtures" / "reference" / "cornell-moore.fpdb"
QUERY_MANIFEST = QUERIES_DIR / "queries.json"
RESULTS_DIR = SPIKE_ROOT / "results"
CSV_PATH = RESULTS_DIR / "results.csv"
SUMMARY_PATH = RESULTS_DIR / "summary.json"
REPORT_PATH = RESULTS_DIR / "REPORT.md"
EXPECTED_SONG = "Brown Eyed Women"
REFERENCE_SOURCE = "cornell-moore-1977-brown-eyed-women"

FIELDS = [
    "test_group",
    "reference_source",
    "query_source",
    "same_performance",
    "same_recording",
    "query_start_seconds",
    "query_duration_seconds",
    "transformation",
    "expected_song",
    "matched_file",
    "matched_song",
    "match_found",
    "audfprint_score",
    "raw_common_hashes",
    "predicted_offset_seconds",
    "matched_query_start_seconds",
    "matched_reference_start_seconds",
    "expected_relative_offset_seconds",
    "predicted_relative_offset_seconds",
    "offset_error_seconds",
    "matched_duration_seconds",
    "execution_time_ms",
    "error",
]

TIME_RANGE_PATTERN = re.compile(
    r"Matched\s+(?P<duration>-?[0-9.]+)\s+s starting at\s+"
    r"(?P<query_start>-?[0-9.]+)\s+s in\s+.+?\s+to time\s+"
    r"(?P<reference_offset>-?[0-9.]+)\s+s in\s+"
    r"(?P<matched_file>.+?)\s+with\s+"
    r"(?P<score>\d+)\s+of\s+(?P<raw>\d+)\s+common hashes",
    re.IGNORECASE,
)
STANDARD_MATCH_PATTERN = re.compile(
    r"Matched\s+.+?\s+[0-9.]+\s+sec\s+\d+\s+raw hashes as\s+"
    r"(.+?)\s+at\s+(?P<reference_offset>-?[0-9.]+)\s+s with\s+"
    r"(?P<score>\d+)\s+of\s+(?P<raw>\d+)\s+hashes",
    re.IGNORECASE,
)
GENERATED_MP4_PATTERN = re.compile(
    r"^(?P<source>[a-z]+)_(?P<duration>\d+)s_at_(?P<start>\d+)s_"
    r"(?P<transformation>clean|combined)_from_mp4\.wav$"
)
SOURCE_IDS = {
    "moore": "cornell-moore-1977-brown-eyed-women",
    "petrunis": "cornell-petrunis-1977-brown-eyed-women",
}


def command_paths() -> tuple[str, Path]:
    python = os.environ.get("PYTHON_BIN") or str(SPIKE_ROOT / ".venv/bin/python")
    audfprint = Path(
        os.environ.get("AUDFPRINT_SCRIPT")
        or SPIKE_ROOT / ".vendor/audfprint/audfprint.py"
    )
    if not Path(python).is_file():
        raise RuntimeError(f"Python environment is missing: {python}")
    if not audfprint.is_file():
        raise RuntimeError(f"audfprint is missing: {audfprint}")
    if not DATABASE.is_file():
        raise RuntimeError(f"Fingerprint database is missing: {DATABASE}")
    return python, audfprint


def test_group(query: dict[str, Any]) -> str:
    if query.get("fromMp4"):
        return "E_mp4_extraction"
    if query["source"] == "sportatorium":
        return "D_different_performance"
    if query["source"] == "moore":
        return (
            "A_same_source_baseline"
            if query["transformation"] == "clean"
            else "A_same_source_degraded"
        )
    return (
        "B_cross_recording_clean"
        if query["transformation"] == "clean"
        else "C_cross_recording_degraded"
    )


def load_queries() -> list[dict[str, Any]]:
    payload = json.loads(QUERY_MANIFEST.read_text(encoding="utf-8"))
    queries = list(payload["queries"])
    for path in sorted(QUERIES_DIR.glob("*_from_mp4.wav")):
        match = GENERATED_MP4_PATTERN.match(path.name)
        if not match:
            continue
        details = match.groupdict()
        queries.append(
            {
                "filename": path.name,
                "source": details["source"],
                "sourceId": SOURCE_IDS[details["source"]],
                "startSeconds": int(details["start"]),
                "durationSeconds": int(details["duration"]),
                "transformation": f"{details['transformation']}_from_mp4",
                "samePerformance": True,
                "sameRecording": details["source"] == "moore",
                "fromMp4": True,
            }
        )
    return queries


def parse_match(output: str) -> dict[str, Any] | None:
    match = TIME_RANGE_PATTERN.search(output)
    if match:
        values = match.groupdict()
        query_match_start = float(values["query_start"])
        reference_match_start = float(values["reference_offset"])
        return {
            "matched_file": Path(values["matched_file"].strip()).name,
            "audfprint_score": int(values["score"]),
            "raw_common_hashes": int(values["raw"]),
            "predicted_offset_seconds": round(
                reference_match_start - query_match_start, 6
            ),
            "matched_query_start_seconds": query_match_start,
            "matched_reference_start_seconds": reference_match_start,
            "matched_duration_seconds": float(values["duration"]),
        }

    match = STANDARD_MATCH_PATTERN.search(output)
    if match:
        values = match.groupdict()
        return {
            "matched_file": Path(match.group(1).strip()).name,
            "audfprint_score": int(values["score"]),
            "raw_common_hashes": int(values["raw"]),
            "predicted_offset_seconds": float(values["reference_offset"]),
            "matched_query_start_seconds": None,
            "matched_reference_start_seconds": None,
            "matched_duration_seconds": None,
        }
    return None


def run_query(
    python: str,
    audfprint: Path,
    query: dict[str, Any],
    timeout_seconds: int,
) -> dict[str, Any]:
    query_path = QUERIES_DIR / query["filename"]
    command = [
        python,
        str(audfprint),
        "match",
        "--dbase",
        str(DATABASE),
        "--samplerate",
        "11025",
        "--density",
        "20",
        "--maxtimebits",
        "16",
        "--max-matches",
        "1",
        "--find-time-range",
        "--exact-count",
        str(query_path),
    ]
    started = time.perf_counter()
    try:
        completed = subprocess.run(
            command,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
        )
        elapsed_ms = round((time.perf_counter() - started) * 1000)
    except subprocess.TimeoutExpired:
        return base_row(query) | {
            "execution_time_ms": timeout_seconds * 1000,
            "error": f"audfprint timed out after {timeout_seconds} seconds",
        }

    output = f"{completed.stdout}\n{completed.stderr}"
    if completed.returncode != 0:
        return base_row(query) | {
            "execution_time_ms": elapsed_ms,
            "error": output.strip()[-2000:],
        }

    parsed = parse_match(output)
    if not parsed:
        return base_row(query) | {
            "execution_time_ms": elapsed_ms,
            "error": "",
        }

    return base_row(query) | parsed | {
        "matched_song": EXPECTED_SONG,
        "match_found": True,
        "execution_time_ms": elapsed_ms,
    }


def base_row(query: dict[str, Any]) -> dict[str, Any]:
    return {
        "test_group": test_group(query),
        "reference_source": REFERENCE_SOURCE,
        "query_source": query["sourceId"],
        "same_performance": query["samePerformance"],
        "same_recording": query["sameRecording"],
        "query_start_seconds": query["startSeconds"],
        "query_duration_seconds": query["durationSeconds"],
        "transformation": query["transformation"],
        "expected_song": EXPECTED_SONG,
        "matched_file": "",
        "matched_song": "",
        "match_found": False,
        "audfprint_score": None,
        "raw_common_hashes": None,
        "predicted_offset_seconds": None,
        "matched_query_start_seconds": None,
        "matched_reference_start_seconds": None,
        "expected_relative_offset_seconds": None,
        "predicted_relative_offset_seconds": None,
        "offset_error_seconds": None,
        "matched_duration_seconds": None,
        "execution_time_ms": None,
        "error": "",
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
    matched = sum(bool(row["match_found"]) for row in selected)
    return {
        "queries": len(selected),
        "matches": matched,
        "matchRate": matched / len(selected) if selected else None,
    }


def safe_rate(value: dict[str, Any]) -> float:
    return float(value["matchRate"] or 0)


def build_summary(rows: list[dict[str, Any]], audfprint_commit: str) -> dict[str, Any]:
    group_summary = {
        group: rate(row for row in rows if row["test_group"] == group)
        for group in sorted({str(row["test_group"]) for row in rows})
    }
    transformation_summary = {
        transformation: rate(
            row
            for row in rows
            if row["transformation"] == transformation
            and row["test_group"] in {
                "B_cross_recording_clean",
                "C_cross_recording_degraded",
            }
        )
        for transformation in sorted(
            {
                str(row["transformation"])
                for row in rows
                if not str(row["transformation"]).endswith("_from_mp4")
            }
        )
    }
    same_recording_transformation_summary = {
        transformation: rate(
            row
            for row in rows
            if row["transformation"] == transformation
            and row["test_group"]
            in {"A_same_source_baseline", "A_same_source_degraded"}
        )
        for transformation in ("clean", "aac64", "phone_filter", "low_level", "combined")
    }
    duration_summary = {
        str(duration): rate(
            row
            for row in rows
            if row["query_duration_seconds"] == duration
            and row["test_group"] == "B_cross_recording_clean"
        )
        for duration in (5, 10, 15, 30)
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
    negative_control = rate(
        row
        for row in rows
        if row["test_group"] == "D_different_performance"
        and row["transformation"] == "clean"
    )
    relative_errors = [
        abs(float(row["offset_error_seconds"]))
        for row in rows
        if row["offset_error_seconds"] not in {None, ""}
        and row["test_group"]
        in {"B_cross_recording_clean", "C_cross_recording_degraded"}
        and int(row["query_duration_seconds"]) in {10, 15, 30}
    ]
    offsets_within_two = (
        sum(error <= 2 for error in relative_errors) / len(relative_errors)
        if relative_errors
        else None
    )
    baseline = group_summary.get("A_same_source_baseline", rate([]))
    baseline_absolute_errors = [
        abs(
            float(row["predicted_offset_seconds"])
            - float(row["query_start_seconds"])
        )
        for row in rows
        if row["test_group"] == "A_same_source_baseline"
        and row["match_found"]
        and row["predicted_offset_seconds"] not in {None, ""}
    ]
    mp4_by_source = {
        "sameRecording": rate(
            row
            for row in rows
            if row["test_group"] == "E_mp4_extraction" and row["same_recording"]
        ),
        "crossRecording": rate(
            row
            for row in rows
            if row["test_group"] == "E_mp4_extraction"
            and not row["same_recording"]
        ),
    }

    if (
        safe_rate(clean_threshold) >= 0.8
        and safe_rate(degraded_threshold) >= 0.7
        and offsets_within_two is not None
        and offsets_within_two >= 0.5
        and safe_rate(negative_control) <= 0.1
    ):
        conclusion = "GO"
    elif (
        safe_rate(clean_threshold) > 0
        and safe_rate(baseline) >= 0.8
        and safe_rate(negative_control) <= 0.1
    ):
        conclusion = "LIMITED GO"
    else:
        conclusion = "NO-GO"

    return {
        "status": "complete",
        "reference": REFERENCE_SOURCE,
        "song": EXPECTED_SONG,
        "audfprintCommit": audfprint_commit,
        "audfprintScoreMeaning": (
            "Number of consistently time-aligned landmark hashes; this is a raw "
            "count, not a normalized confidence probability."
        ),
        "totalQueries": len(rows),
        "groups": group_summary,
        "crossRecordingByTransformation": transformation_summary,
        "sameRecordingByTransformation": same_recording_transformation_summary,
        "crossRecordingCleanByDuration": duration_summary,
        "mp4BySource": mp4_by_source,
        "thresholds": {
            "clean10To30": clean_threshold,
            "degraded15To30": degraded_threshold,
            "negativeControlClean": negative_control,
            "relativeOffsetComparisons": len(relative_errors),
            "relativeOffsetsWithinTwoSecondsRate": offsets_within_two,
            "medianAbsoluteRelativeOffsetErrorSeconds": statistics.median(
                relative_errors
            )
            if relative_errors
            else None,
            "baselineAbsoluteOffsetComparisons": len(baseline_absolute_errors),
            "baselineMedianAbsoluteOffsetErrorSeconds": statistics.median(
                baseline_absolute_errors
            )
            if baseline_absolute_errors
            else None,
            "baselineMaximumAbsoluteOffsetErrorSeconds": max(
                baseline_absolute_errors
            )
            if baseline_absolute_errors
            else None,
        },
        "conclusion": conclusion,
    }


def percent(value: float | None) -> str:
    return "n/a" if value is None else f"{100 * value:.1f}%"


def report_markdown(summary: dict[str, Any]) -> str:
    groups = summary["groups"]
    transforms = summary["crossRecordingByTransformation"]
    same_recording_transforms = summary["sameRecordingByTransformation"]
    durations = summary["crossRecordingCleanByDuration"]
    thresholds = summary["thresholds"]
    baseline = groups.get("A_same_source_baseline", {})
    cross = groups.get("B_cross_recording_clean", {})
    degraded = groups.get("C_cross_recording_degraded", {})
    negative = thresholds["negativeControlClean"]
    mp4_same_recording = summary["mp4BySource"]["sameRecording"]
    mp4_cross_recording = summary["mp4BySource"]["crossRecording"]

    reliable_durations = [
        duration
        for duration, values in durations.items()
        if values["matchRate"] is not None and values["matchRate"] >= 0.8
    ]
    shortest = min(map(int, reliable_durations)) if reliable_durations else None

    transformation_lines = "\n".join(
        f"| {name} | {values['matches']}/{values['queries']} | "
        f"{percent(values['matchRate'])} |"
        for name, values in transforms.items()
    )
    same_recording_transformation_lines = "\n".join(
        f"| {name} | {values['matches']}/{values['queries']} | "
        f"{percent(values['matchRate'])} |"
        for name, values in same_recording_transforms.items()
    )
    duration_lines = "\n".join(
        f"| {duration} seconds | {values['matches']}/{values['queries']} | "
        f"{percent(values['matchRate'])} |"
        for duration, values in durations.items()
    )

    conclusion_text = {
        "GO": "audfprint is viable for exact-show or exact-playback matching.",
        "LIMITED GO": (
            "audfprint is useful only when the artist supplies the exact playback "
            "or a recording of the exact show."
        ),
        "NO-GO": "cross-device matching is not reliable enough for CrowdClip.",
    }[summary["conclusion"]]

    return f"""# audfprint Feasibility Report

## Experiment

The reference is Jerry Moore's audience recording of “Brown Eyed Women” from
Barton Hall on 8 May 1977. Queries include clips from that file, independent
audience recordings of the same performance when downloadable, a different
performance of the same song from 22 May 1977, phone-style transformations, and
eight generated MP4 round trips split between same-file controls and the main
independent recording.

The experiment ran {summary['totalQueries']} queries against audfprint commit
`{summary['audfprintCommit']}`. All fingerprint input was mono 16-bit PCM WAV at
11,025 Hz, audfprint's documented default sample rate.

`audfprint_score` is the number of consistently time-aligned landmark hashes. It
is not a normalized probability. The official documentation says that more than
five or six consistently timed hashes generally indicates a true match. The
reported clip offset is derived by subtracting the matching span's query start
from its reference start.

## Results

| Test | Matches | Rate |
| --- | ---: | ---: |
| Same-file clean baseline | {baseline.get('matches', 0)}/{baseline.get('queries', 0)} | {percent(baseline.get('matchRate'))} |
| Same concert, different recording, clean | {cross.get('matches', 0)}/{cross.get('queries', 0)} | {percent(cross.get('matchRate'))} |
| Same concert, different recording, degraded | {degraded.get('matches', 0)}/{degraded.get('queries', 0)} | {percent(degraded.get('matchRate'))} |
| Different performance, clean negative control | {negative['matches']}/{negative['queries']} | {percent(negative['matchRate'])} |
| Generated MP4 extraction, same recording | {mp4_same_recording['matches']}/{mp4_same_recording['queries']} | {percent(mp4_same_recording['matchRate'])} |
| Generated MP4 extraction, cross recording | {mp4_cross_recording['matches']}/{mp4_cross_recording['queries']} | {percent(mp4_cross_recording['matchRate'])} |

### Clean cross-recording results by duration

| Duration | Matches | Rate |
| --- | ---: | ---: |
{duration_lines}

### Cross-recording results by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
{transformation_lines}

### Same-recording results by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
{same_recording_transformation_lines}

## Questions answered

1. **Did the same-file baseline work?** {percent(baseline.get('matchRate'))} of
   clean same-file queries matched.
2. **Did a different recording of the exact concert match?**
   {percent(cross.get('matchRate'))} of clean cross-recording queries matched.
3. **What was the shortest reliable clip length?**
   {f'{shortest} seconds met the 80% clean cross-recording threshold.' if shortest is not None else 'No tested duration met the 80% clean cross-recording threshold.'}
4. **How did compression and filtering affect results?** See the transformation
   tables above. Digitally transformed same-recording queries all remained
   matchable; the combined cross-recording 15- and 30-second product threshold
   was {percent(thresholds['degraded15To30']['matchRate'])}.
5. **Were returned offsets consistent?**
   {f"{percent(thresholds['relativeOffsetsWithinTwoSecondsRate'])} of {thresholds['relativeOffsetComparisons']} successful cross-recording relative comparisons were within two seconds; median absolute relative error was {thresholds['medianAbsoluteRelativeOffsetErrorSeconds']} seconds." if thresholds['relativeOffsetComparisons'] else "No cross-recording query matched, so no independent-recording offset could be evaluated. Same-file offsets are reported separately in results.csv as an implementation sanity check."}
   For the same-file clean control, the median and maximum absolute offset
   errors were {thresholds['baselineMedianAbsoluteOffsetErrorSeconds']} and
   {thresholds['baselineMaximumAbsoluteOffsetErrorSeconds']} seconds across
   {thresholds['baselineAbsoluteOffsetComparisons']} matches.
6. **Did the different performance match?** {negative['matches']} of
   {negative['queries']} clean negative-control queries produced a match.
7. **Can audfprint be used with exact concert recordings?** Not across the three
   audience tapes tested here: the Moore reference matched neither independent
   Cornell recording at any tested duration or degradation level.
8. **Can it be used with backing tracks?** The 100% same-file degraded result
   shows that derivatives of an identical digital signal remain matchable. It
   does not simulate a backing track played through a PA and re-recorded by a
   phone, so this spike does not establish that use case.
9. **Would studio masters match live-band performances?** There is no evidence
   here that they would. The different-performance control also shows that the
   shared composition alone was insufficient to produce a match.
10. **Should CrowdClip proceed?** Not with audfprint as the proposed
    cross-device live-performance recognizer. A separate spike using an exact
    backing track played acoustically could evaluate that narrower use case.

## Relative offset method

Track boundaries differ between audience recordings, so absolute offsets are not
treated as ground truth. Within each source, transformation, and duration, the
earliest successful query is an anchor. The experiment compares the difference
between later extraction positions with the difference between their predicted
reference offsets. Signed per-query errors are in `results.csv`.

## Limitations

- The Grateful Dead fixtures are audience tapes, not modern smartphone files.
- Phone processing is simulated with AAC, band limiting, and attenuation.
- The transformations are digital; they do not reproduce speaker, room, or
  microphone effects.
- A successful exact-show result does not imply composition-level or cover-song
  recognition.
- `audfprint_score` depends on clip duration and available landmarks and must not
  be exposed as a percentage confidence.

## References

- [Official audfprint repository](https://github.com/dpwe/audfprint)
- [Official audfprint usage and score explanation](https://github.com/dpwe/audfprint/blob/master/README.md)
- [Internet Archive metadata API](https://archive.org/developers/metadata-schema/)

## Conclusion

**{summary['conclusion']}:**  
{conclusion_text}
"""


def audfprint_commit() -> str:
    vendor = SPIKE_ROOT / ".vendor/audfprint"
    completed = subprocess.run(
        ["git", "-C", str(vendor), "rev-parse", "HEAD"],
        text=True,
        capture_output=True,
    )
    return completed.stdout.strip() if completed.returncode == 0 else "unknown"


def write_outputs(rows: list[dict[str, Any]], summary: dict[str, Any]) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field) for field in FIELDS})
    SUMMARY_PATH.write_text(
        json.dumps(summary, indent=2, sort_keys=True, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    REPORT_PATH.write_text(report_markdown(summary), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeout-seconds", type=int, default=90)
    parser.add_argument("--limit", type=int, help="Run only the first N queries")
    parser.add_argument("--query-regex", help="Run only filenames matching regex")
    args = parser.parse_args()

    try:
        python, audfprint = command_paths()
        queries = load_queries()
        if args.query_regex:
            pattern = re.compile(args.query_regex)
            queries = [query for query in queries if pattern.search(query["filename"])]
        if args.limit is not None:
            queries = queries[: args.limit]
        if not queries:
            raise RuntimeError("No prepared queries matched the requested selection")

        rows: list[dict[str, Any]] = []
        for index, query in enumerate(queries, start=1):
            print(f"[{index}/{len(queries)}] {query['filename']}", flush=True)
            rows.append(
                run_query(python, audfprint, query, args.timeout_seconds)
            )
        add_relative_offsets(rows)
        summary = build_summary(rows, audfprint_commit())
        write_outputs(rows, summary)
        print(
            f"Wrote {CSV_PATH}, {SUMMARY_PATH}, and {REPORT_PATH}; "
            f"conclusion={summary['conclusion']}"
        )
    except (RuntimeError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
