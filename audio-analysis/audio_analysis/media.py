"""FFmpeg boundary for turning arbitrary media into standard mono WAV."""

from __future__ import annotations

import subprocess
from pathlib import Path


class MediaExtractionError(RuntimeError):
    """Raised when FFmpeg cannot produce analyser input."""


def extract_standard_wav(
    source: str,
    destination: Path,
    timeout_seconds: int,
    ffmpeg_path: str = "ffmpeg",
) -> None:
    command = [
        ffmpeg_path,
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "5000",
        "-c:a",
        "pcm_s16le",
        str(destination),
    ]
    try:
        completed = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired as error:
        raise MediaExtractionError(
            f"FFmpeg timed out after {timeout_seconds} seconds"
        ) from error
    except OSError as error:
        raise MediaExtractionError(f"FFmpeg could not be started: {error}") from error

    if completed.returncode != 0:
        details = (completed.stderr or completed.stdout or "unknown FFmpeg error")
        details = " ".join(details.split())[:1_000]
        raise MediaExtractionError(f"FFmpeg extraction failed: {details}")

    if not destination.is_file() or destination.stat().st_size == 0:
        raise MediaExtractionError("FFmpeg did not create a non-empty WAV file")
