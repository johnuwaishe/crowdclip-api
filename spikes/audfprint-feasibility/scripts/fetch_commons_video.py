#!/usr/bin/env python3
"""Fetch one small, clearly licensed concert video from Wikimedia Commons."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

SPIKE_ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = SPIKE_ROOT / "fixtures" / "video"
SOURCES_DIR = SPIKE_ROOT / "fixtures" / "sources"
MANIFEST_PATH = SPIKE_ROOT / "fixtures-manifest.json"
API_URL = "https://commons.wikimedia.org/w/api.php"
USER_AGENT = "CrowdClip-audfprint-feasibility/1.0"


def plain_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()


def ext_value(metadata: dict[str, Any], key: str) -> str:
    entry = metadata.get(key, {})
    return str(entry.get("value", "")) if isinstance(entry, dict) else ""


def license_is_clear(name: str, url: str) -> bool:
    normalized = name.lower()
    return bool(url) and (
        normalized.startswith("cc ")
        or "creative commons" in normalized
        or "public domain" in normalized
        or normalized in {"pd", "cc0"}
    )


def request_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not read Wikimedia metadata: {error}") from error


def query_candidates() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    params = {
        "action": "query",
        "generator": "categorymembers",
        "gcmtitle": "Category:Videos of concerts",
        "gcmtype": "file",
        "gcmlimit": "50",
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "format": "json",
        "formatversion": "2",
    }
    url = f"{API_URL}?{urllib.parse.urlencode(params)}"
    payload = request_json(url)
    candidates: list[dict[str, Any]] = []

    for page in payload.get("query", {}).get("pages", []):
        image_info = (page.get("imageinfo") or [{}])[0]
        metadata = image_info.get("extmetadata") or {}
        license_name = plain_text(ext_value(metadata, "LicenseShortName"))
        license_url = plain_text(ext_value(metadata, "LicenseUrl"))
        mime_type = str(image_info.get("mime", ""))
        if not mime_type.startswith("video/"):
            continue
        if not license_is_clear(license_name, license_url):
            continue
        duration_value = ext_value(metadata, "Duration")
        candidates.append(
            {
                "title": page.get("title"),
                "artist": plain_text(ext_value(metadata, "Artist")),
                "licenseName": license_name,
                "licenseUrl": license_url,
                "attribution": plain_text(
                    ext_value(metadata, "Credit")
                    or ext_value(metadata, "Attribution")
                    or ext_value(metadata, "Artist")
                ),
                "originalPageUrl": image_info.get("descriptionurl"),
                "directMediaUrl": image_info.get("url"),
                "sizeBytes": int(image_info.get("size", 0) or 0),
                "durationSeconds": float(duration_value) if duration_value else None,
                "mimeType": mime_type,
            }
        )

    candidates.sort(key=lambda candidate: candidate["sizeBytes"])
    return payload, candidates


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            with temporary.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
    except urllib.error.URLError as error:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"Could not download {url}: {error}") from error
    os.replace(temporary, destination)


def probe_duration(path: Path) -> float | None:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe and Path("/opt/homebrew/opt/ffmpeg/bin/ffprobe").is_file():
        ffprobe = "/opt/homebrew/opt/ffmpeg/bin/ffprobe"
    if not ffprobe:
        return None
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
        return None
    try:
        return round(float(completed.stdout.strip()), 3)
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-bytes", type=int, default=80 * 1024 * 1024)
    parser.add_argument("--title", help="Select an exact Commons file title")
    parser.add_argument("--list-only", action="store_true")
    args = parser.parse_args()

    try:
        payload, candidates = query_candidates()
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    metadata_path = SOURCES_DIR / "commons-concert-video.metadata.json"
    metadata_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    print("Clearly licensed concert-video candidates:")
    for candidate in candidates:
        print(
            f"  - {candidate['title']} | {candidate['licenseName']} | "
            f"{candidate['sizeBytes']} bytes | {candidate['durationSeconds']} seconds"
        )

    if args.list_only:
        return 0

    selected = None
    if args.title:
        selected = next(
            (candidate for candidate in candidates if candidate["title"] == args.title),
            None,
        )
    else:
        selected = next(
            (
                candidate
                for candidate in candidates
                if 0 < candidate["sizeBytes"] <= args.max_bytes
                and (
                    candidate["durationSeconds"] is None
                    or 5 <= candidate["durationSeconds"] <= 600
                )
            ),
            None,
        )

    if selected is None:
        print(
            "error: no clearly licensed candidate met the selection limits; "
            "rerun with --list-only or an explicit --title",
            file=sys.stderr,
        )
        return 1

    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    source_name = Path(urllib.parse.urlparse(selected["directMediaUrl"]).path).name
    suffix = Path(urllib.parse.unquote(source_name)).suffix.lower() or ".video"
    destination = VIDEO_DIR / f"commons-concert-performance{suffix}"
    print(f"Downloading {selected['directMediaUrl']} -> {destination}")
    try:
        download(selected["directMediaUrl"], destination)
    except RuntimeError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    if selected["durationSeconds"] is None:
        selected["durationSeconds"] = probe_duration(destination)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["video"] = {
        **selected,
        "localFilename": destination.name,
        "sha256": sha256_file(destination),
        "role": "video_extraction_only",
    }
    temporary = MANIFEST_PATH.with_suffix(".json.part")
    temporary.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    os.replace(temporary, MANIFEST_PATH)
    print(f"Saved {destination} with clear licence metadata in the manifest")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
