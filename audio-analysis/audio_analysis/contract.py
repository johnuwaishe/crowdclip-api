"""Strict JSON contract shared with the NestJS orchestration layer."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


DEFAULT_MINIMUM_SIMILARITY = 0.59
DEFAULT_MINIMUM_PEAK_MARGIN = 0.02
DEFAULT_MINIMUM_TIME_SCALE = 0.85
DEFAULT_MAXIMUM_TIME_SCALE = 1.15
DEFAULT_FFMPEG_TIMEOUT_SECONDS = 120


class RequestValidationError(ValueError):
    """Raised when a request cannot satisfy the analyser contract."""


@dataclass(frozen=True)
class MediaSource:
    id: str
    source: str


@dataclass(frozen=True)
class ReferenceSource:
    track_id: str
    source: str


@dataclass(frozen=True)
class AnalysisSettings:
    minimum_similarity: float = DEFAULT_MINIMUM_SIMILARITY
    minimum_peak_margin: float = DEFAULT_MINIMUM_PEAK_MARGIN
    minimum_time_scale: float = DEFAULT_MINIMUM_TIME_SCALE
    maximum_time_scale: float = DEFAULT_MAXIMUM_TIME_SCALE
    ffmpeg_timeout_seconds: int = DEFAULT_FFMPEG_TIMEOUT_SECONDS


@dataclass(frozen=True)
class AnalysisRequest:
    query: MediaSource
    references: tuple[ReferenceSource, ...]
    settings: AnalysisSettings


def _mapping(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise RequestValidationError(f"{name} must be an object")
    return value


def _non_empty_string(value: Any, name: str, maximum: int = 4_096) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RequestValidationError(f"{name} must be a non-empty string")
    result = value.strip()
    if len(result) > maximum:
        raise RequestValidationError(f"{name} must not exceed {maximum} characters")
    return result


def _bounded_float(
    value: Any,
    name: str,
    fallback: float,
    minimum: float,
    maximum: float,
) -> float:
    if value is None:
        return fallback
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise RequestValidationError(f"{name} must be a number")
    result = float(value)
    if result < minimum or result > maximum:
        raise RequestValidationError(
            f"{name} must be between {minimum} and {maximum}"
        )
    return result


def _bounded_integer(
    value: Any,
    name: str,
    fallback: int,
    minimum: int,
    maximum: int,
) -> int:
    if value is None:
        return fallback
    if isinstance(value, bool) or not isinstance(value, int):
        raise RequestValidationError(f"{name} must be an integer")
    if value < minimum or value > maximum:
        raise RequestValidationError(
            f"{name} must be between {minimum} and {maximum}"
        )
    return value


def parse_request(value: Any) -> AnalysisRequest:
    payload = _mapping(value, "request")
    query_payload = _mapping(payload.get("query"), "query")
    query = MediaSource(
        id=_non_empty_string(query_payload.get("id"), "query.id", 200),
        source=_non_empty_string(query_payload.get("source"), "query.source"),
    )

    references_payload = payload.get("references")
    if not isinstance(references_payload, list) or not references_payload:
        raise RequestValidationError("references must be a non-empty array")
    if len(references_payload) > 100:
        raise RequestValidationError("references must not contain more than 100 items")

    references: list[ReferenceSource] = []
    seen_track_ids: set[str] = set()
    for index, raw_reference in enumerate(references_payload):
        reference_payload = _mapping(raw_reference, f"references[{index}]")
        track_id = _non_empty_string(
            reference_payload.get("trackId"),
            f"references[{index}].trackId",
            200,
        )
        if track_id in seen_track_ids:
            raise RequestValidationError(f"duplicate reference track ID: {track_id}")
        seen_track_ids.add(track_id)
        references.append(
            ReferenceSource(
                track_id=track_id,
                source=_non_empty_string(
                    reference_payload.get("source"),
                    f"references[{index}].source",
                ),
            )
        )

    raw_settings = payload.get("settings", {})
    settings_payload = _mapping(raw_settings, "settings")
    minimum_time_scale = _bounded_float(
        settings_payload.get("minimumTimeScale"),
        "settings.minimumTimeScale",
        DEFAULT_MINIMUM_TIME_SCALE,
        0.5,
        1.5,
    )
    maximum_time_scale = _bounded_float(
        settings_payload.get("maximumTimeScale"),
        "settings.maximumTimeScale",
        DEFAULT_MAXIMUM_TIME_SCALE,
        0.5,
        1.5,
    )
    if minimum_time_scale > maximum_time_scale:
        raise RequestValidationError(
            "settings.minimumTimeScale must not exceed settings.maximumTimeScale"
        )

    settings = AnalysisSettings(
        minimum_similarity=_bounded_float(
            settings_payload.get("minimumSimilarity"),
            "settings.minimumSimilarity",
            DEFAULT_MINIMUM_SIMILARITY,
            0,
            1,
        ),
        minimum_peak_margin=_bounded_float(
            settings_payload.get("minimumPeakMargin"),
            "settings.minimumPeakMargin",
            DEFAULT_MINIMUM_PEAK_MARGIN,
            0,
            1,
        ),
        minimum_time_scale=minimum_time_scale,
        maximum_time_scale=maximum_time_scale,
        ffmpeg_timeout_seconds=_bounded_integer(
            settings_payload.get("ffmpegTimeoutSeconds"),
            "settings.ffmpegTimeoutSeconds",
            DEFAULT_FFMPEG_TIMEOUT_SECONDS,
            1,
            600,
        ),
    )

    return AnalysisRequest(
        query=query,
        references=tuple(references),
        settings=settings,
    )
