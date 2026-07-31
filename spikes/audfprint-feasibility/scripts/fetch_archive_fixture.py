#!/usr/bin/env python3
"""Download only Brown Eyed Women from the selected Internet Archive items."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

SPIKE_ROOT = Path(__file__).resolve().parents[1]
SOURCES_DIR = SPIKE_ROOT / "fixtures" / "sources"
MANIFEST_PATH = SPIKE_ROOT / "fixtures-manifest.json"
SONG = "Brown Eyed Women"
USER_AGENT = "CrowdClip-audfprint-feasibility/1.0"

SOURCES: dict[str, dict[str, str]] = {
    "moore": {
        "sourceId": "cornell-moore-1977-brown-eyed-women",
        "archiveIdentifier": "gd1977-05-08.aud.moore.cribbs.28301.shnf",
        "concertDate": "1977-05-08",
        "venue": "Barton Hall, Cornell University",
        "recordingType": "audience",
        "taper": "Jerry Moore",
        "role": "reference",
    },
    "petrunis": {
        "sourceId": "cornell-petrunis-1977-brown-eyed-women",
        "archiveIdentifier": "gd1977-05-08.152379.aud.petrunis.flac2448",
        "concertDate": "1977-05-08",
        "venue": "Barton Hall, Cornell University",
        "recordingType": "audience",
        "taper": "Rich Petrunis",
        "role": "query",
    },
    "stevenson": {
        "sourceId": "cornell-stevenson-1977-brown-eyed-women",
        "archiveIdentifier": "gd1977-05-08.shure57.stevenson.29303.flac16",
        "concertDate": "1977-05-08",
        "venue": "Barton Hall, Cornell University",
        "recordingType": "audience",
        "taper": "Jeff Stevenson",
        "role": "query",
    },
    "sportatorium": {
        "sourceId": "sportatorium-1977-brown-eyed-women",
        "archiveIdentifier": "gd1977-05-22.152259.aud.lamarre.vernon.sirmicki.flac16",
        "concertDate": "1977-05-22",
        "venue": "The Sportatorium",
        "recordingType": "audience",
        "taper": "Jerry LaMarre / Vernon / Sirmicki",
        "role": "negative_control",
    },
}


def request_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not read metadata from {url}: {error}") from error


def normalized(value: object) -> str:
    if isinstance(value, list):
        value = " ".join(str(part) for part in value)
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def format_priority(format_name: str) -> int | None:
    value = normalized(format_name)
    if "vbr mp3" in value or value == "mp3":
        return 0
    if "ogg vorbis" in value or value == "ogg":
        return 1
    if "flac" in value:
        return 2
    return None


def is_downloadable(file_metadata: dict[str, Any]) -> bool:
    if file_metadata.get("private") is True:
        return False
    if str(file_metadata.get("private", "")).lower() == "true":
        return False
    if str(file_metadata.get("source", "")).lower() == "metadata":
        return False
    try:
        return int(file_metadata.get("size", 0)) > 0
    except (TypeError, ValueError):
        return False


def find_candidates(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    song_words = normalized(SONG)
    candidates: list[dict[str, Any]] = []

    for entry in metadata.get("files", []):
        if not isinstance(entry, dict):
            continue
        priority = format_priority(str(entry.get("format", "")))
        haystack = normalized(
            f"{entry.get('title', '')} {entry.get('name', '')}"
        )
        if priority is None or song_words not in haystack:
            continue
        candidate = dict(entry)
        candidate["_priority"] = priority
        candidate["_downloadable"] = is_downloadable(entry)
        candidates.append(candidate)

    candidates.sort(
        key=lambda item: (
            not item["_downloadable"],
            item["_priority"],
            int(item.get("size", 0) or 0),
        )
    )
    return candidates


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifest() -> dict[str, Any]:
    if not MANIFEST_PATH.exists():
        return {"sources": [], "video": None}
    data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    data.setdefault("sources", [])
    data.setdefault("video", None)
    return data


def save_manifest(manifest: dict[str, Any]) -> None:
    temporary = MANIFEST_PATH.with_suffix(".json.part")
    temporary.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    os.replace(temporary, MANIFEST_PATH)


def existing_entry(manifest: dict[str, Any], source_id: str) -> dict[str, Any] | None:
    for entry in manifest["sources"]:
        if entry.get("sourceId") == source_id:
            return entry
    return None


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


def fetch_source(key: str, manifest: dict[str, Any]) -> None:
    source = SOURCES[key]
    identifier = source["archiveIdentifier"]
    metadata_url = f"https://archive.org/metadata/{identifier}"
    item_url = f"https://archive.org/details/{identifier}"
    metadata_path = SOURCES_DIR / f"{source['sourceId']}.metadata.json"

    print(f"\n[{key}] Requesting {metadata_url}", flush=True)
    metadata = request_json(metadata_url)
    metadata_path.write_text(
        json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    candidates = find_candidates(metadata)
    print(f"[{key}] Brown Eyed Women candidates:", flush=True)
    if not candidates:
        raise RuntimeError(
            f"No MP3, Ogg, or FLAC candidate for {SONG!r} in {identifier}"
        )

    for candidate in candidates:
        print(
            "  - "
            f"name={candidate.get('name')!r} "
            f"title={candidate.get('title')!r} "
            f"format={candidate.get('format')!r} "
            f"size={candidate.get('size')} "
            f"downloadable={candidate['_downloadable']}",
            flush=True,
        )

    selected = next(
        (candidate for candidate in candidates if candidate["_downloadable"]), None
    )
    if selected is None:
        raise RuntimeError(
            f"Candidates exist for {SONG!r} in {identifier}, but none are downloadable"
        )

    archive_filename = str(selected["name"])
    suffix = Path(archive_filename).suffix.lower() or ".audio"
    destination = SOURCES_DIR / f"{source['sourceId']}{suffix}"
    download_url = (
        f"https://archive.org/download/{identifier}/"
        f"{urllib.parse.quote(archive_filename, safe='')}"
    )

    prior = existing_entry(manifest, source["sourceId"])
    if destination.exists() and prior:
        actual_checksum = sha256_file(destination)
        if actual_checksum == prior.get("sha256"):
            print(
                f"[{key}] Existing file matches SHA-256; skipping download",
                flush=True,
            )
        else:
            print(f"[{key}] Existing checksum changed; downloading again", flush=True)
            download(download_url, destination)
    else:
        print(
            f"[{key}] Downloading one track ({selected.get('size')} bytes): "
            f"{download_url}",
            flush=True,
        )
        download(download_url, destination)

    checksum = sha256_file(destination)
    manifest_entry = {
        **source,
        "song": SONG,
        "sourceUrl": item_url,
        "metadataUrl": metadata_url,
        "downloadUrl": download_url,
        "filename": archive_filename,
        "localFilename": destination.name,
        "format": selected.get("format"),
        "sizeBytes": destination.stat().st_size,
        "sha256": checksum,
    }
    manifest["sources"] = [
        entry
        for entry in manifest["sources"]
        if entry.get("sourceId") != source["sourceId"]
    ]
    manifest["sources"].append(manifest_entry)
    manifest["sources"].sort(key=lambda entry: entry["sourceId"])
    save_manifest(manifest)
    print(f"[{key}] Saved {destination.name} sha256={checksum}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "sources",
        nargs="*",
        choices=[*SOURCES.keys(), "all"],
        default=["all"],
        help="Fixture keys to download (default: all)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    requested = list(SOURCES) if "all" in args.sources else args.sources
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest()

    try:
        for key in requested:
            fetch_source(key, manifest)
    except (RuntimeError, OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

