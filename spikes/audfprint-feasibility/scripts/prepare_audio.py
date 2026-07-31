#!/usr/bin/env python3
"""Normalize source tracks and generate the audfprint query matrix."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

SPIKE_ROOT = Path(__file__).resolve().parents[1]
FIXTURES_DIR = SPIKE_ROOT / "fixtures"
SOURCES_DIR = FIXTURES_DIR / "sources"
REFERENCE_DIR = FIXTURES_DIR / "reference"
QUERIES_DIR = FIXTURES_DIR / "queries"
VIDEO_DIR = FIXTURES_DIR / "video"
MANIFEST_PATH = SPIKE_ROOT / "fixtures-manifest.json"
QUERY_MANIFEST_PATH = QUERIES_DIR / "queries.json"
TARGET_SAMPLE_RATE = 11_025
PHONE_LOWPASS_HZ = 5_000
POSITIONS = (30, 60, 120, 180)
DURATIONS = (5, 10, 15, 30)


def find_binary(name: str, environment_name: str) -> str:
    configured = os.environ.get(environment_name)
    candidates = [
        configured,
        shutil.which(name),
        f"/opt/homebrew/opt/ffmpeg/bin/{name}",
        f"/usr/local/bin/{name}",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise RuntimeError(
        f"{name} was not found; set {environment_name} or install FFmpeg"
    )


def run(command: list[str]) -> None:
    printable = " ".join(command)
    print(f"+ {printable}", flush=True)
    completed = subprocess.run(command, text=True, capture_output=True)
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed ({completed.returncode}): {printable}\n"
            f"{completed.stderr[-4000:]}"
        )


def probe_duration(ffprobe: str, path: Path) -> float:
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
        capture_output=True,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Could not probe {path}: {completed.stderr.strip()}")
    duration = float(completed.stdout.strip())
    if duration <= 0:
        raise RuntimeError(f"Source has an invalid duration: {path}")
    return duration


def normalize_source(ffmpeg: str, source: Path, destination: Path) -> None:
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def extract_clean(
    ffmpeg: str, source: Path, start: int, duration: int, destination: Path
) -> None:
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ss",
            str(start),
            "-t",
            str(duration),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def transform_wav(
    ffmpeg: str,
    clean: Path,
    transformation: str,
    destination: Path,
) -> None:
    if transformation == "phone_filter":
        run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(clean),
                "-af",
                f"highpass=f=150,lowpass=f={PHONE_LOWPASS_HZ}",
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "-c:a",
                "pcm_s16le",
                str(destination),
            ]
        )
        return

    if transformation == "low_level":
        run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(clean),
                "-af",
                "volume=-10dB",
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "-c:a",
                "pcm_s16le",
                str(destination),
            ]
        )
        return

    if transformation not in {"aac64", "combined"}:
        raise ValueError(f"Unknown transformation: {transformation}")

    with tempfile.TemporaryDirectory(prefix="crowdclip-audfprint-") as temp_dir:
        compressed = Path(temp_dir) / "compressed.m4a"
        encode_command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(clean),
        ]
        if transformation == "combined":
            encode_command.extend(
                [
                    "-af",
                    f"highpass=f=150,lowpass=f={PHONE_LOWPASS_HZ},volume=-10dB",
                ]
            )
        encode_command.extend(
            [
                "-ac",
                "1",
                "-ar",
                "44100",
                "-c:a",
                "aac",
                "-b:a",
                "64k",
                str(compressed),
            ]
        )
        run(encode_command)
        run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                str(compressed),
                "-ac",
                "1",
                "-ar",
                str(TARGET_SAMPLE_RATE),
                "-c:a",
                "pcm_s16le",
                str(destination),
            ]
        )


def safe_positions(source_duration: float, clip_duration: int) -> list[int]:
    latest = int(source_duration - clip_duration - 5)
    if latest < 5:
        return []
    return sorted({max(5, min(position, latest)) for position in POSITIONS})


def source_key(entry: dict[str, Any]) -> str:
    source_id = str(entry["sourceId"])
    if "moore" in source_id:
        return "moore"
    if "petrunis" in source_id:
        return "petrunis"
    if "stevenson" in source_id:
        return "stevenson"
    if "sportatorium" in source_id:
        return "sportatorium"
    raise ValueError(f"Unknown source ID: {source_id}")


def prepare_source(
    ffmpeg: str,
    ffprobe: str,
    entry: dict[str, Any],
    query_metadata: list[dict[str, Any]],
) -> None:
    key = source_key(entry)
    source = SOURCES_DIR / entry["localFilename"]
    if not source.exists():
        raise RuntimeError(f"Downloaded source is missing: {source}")

    normalized_destination = (
        REFERENCE_DIR / "moore_reference.wav"
        if key == "moore"
        else QUERIES_DIR / f"{key}_full_source.wav"
    )
    normalize_source(ffmpeg, source, normalized_destination)
    duration_seconds = probe_duration(ffprobe, normalized_destination)

    for clip_duration in DURATIONS:
        for start in safe_positions(duration_seconds, clip_duration):
            base_name = f"{key}_{clip_duration}s_at_{start}s"
            clean = QUERIES_DIR / f"{base_name}_clean.wav"
            extract_clean(
                ffmpeg,
                normalized_destination,
                start,
                clip_duration,
                clean,
            )
            query_metadata.append(
                {
                    "filename": clean.name,
                    "source": key,
                    "sourceId": entry["sourceId"],
                    "startSeconds": start,
                    "durationSeconds": clip_duration,
                    "transformation": "clean",
                    "samePerformance": key != "sportatorium",
                    "sameRecording": key == "moore",
                }
            )

            for transformation in (
                "aac64",
                "phone_filter",
                "low_level",
                "combined",
            ):
                transformed = QUERIES_DIR / f"{base_name}_{transformation}.wav"
                transform_wav(ffmpeg, clean, transformation, transformed)
                query_metadata.append(
                    {
                        "filename": transformed.name,
                        "source": key,
                        "sourceId": entry["sourceId"],
                        "startSeconds": start,
                        "durationSeconds": clip_duration,
                        "transformation": transformation,
                        "samePerformance": key != "sportatorium",
                        "sameRecording": key == "moore",
                    }
                )


def extract_commons_video(ffmpeg: str, manifest: dict[str, Any]) -> None:
    video = manifest.get("video")
    if not video:
        return
    source = VIDEO_DIR / video["localFilename"]
    destination = QUERIES_DIR / "commons_video_extracted.wav"
    run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ss",
            "5",
            "-t",
            "30",
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-c:a",
            "pcm_s16le",
            str(destination),
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ffmpeg", help="Path to ffmpeg")
    parser.add_argument("--ffprobe", help="Path to ffprobe")
    args = parser.parse_args()

    try:
        ffmpeg = args.ffmpeg or find_binary("ffmpeg", "FFMPEG_BIN")
        ffprobe = args.ffprobe or find_binary("ffprobe", "FFPROBE_BIN")
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        if not manifest.get("sources"):
            raise RuntimeError("No sources in the manifest; run fetch_archive_fixture.py")

        REFERENCE_DIR.mkdir(parents=True, exist_ok=True)
        QUERIES_DIR.mkdir(parents=True, exist_ok=True)
        query_metadata: list[dict[str, Any]] = []
        for entry in manifest["sources"]:
            prepare_source(ffmpeg, ffprobe, entry, query_metadata)
        extract_commons_video(ffmpeg, manifest)
        QUERY_MANIFEST_PATH.write_text(
            json.dumps(
                {
                    "sampleRate": TARGET_SAMPLE_RATE,
                    "reference": "moore_reference.wav",
                    "queries": query_metadata,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )
        print(f"Prepared {len(query_metadata)} query WAV files")
    except (RuntimeError, OSError, ValueError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
