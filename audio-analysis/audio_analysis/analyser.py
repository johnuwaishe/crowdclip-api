"""Catalogue matching orchestration without database or application logic."""

from __future__ import annotations

import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .contract import AnalysisRequest
from .fingerprint import Alignment, FingerprintSequence, best_affine_alignment, fingerprints
from .media import extract_standard_wav
from .pitch import PitchEstimate, estimate_pitch_shift


PROVIDER = "concert_sequence"


@dataclass(frozen=True)
class Candidate:
    track_id: str
    alignment: Alignment
    reference_path: Path


ExtractFunction = Callable[[str, Path, int], None]
FingerprintFunction = Callable[[Path], FingerprintSequence]
PitchFunction = Callable[[Path, Path, float, float], PitchEstimate]


def analyse(
    request: AnalysisRequest,
    extract: ExtractFunction = extract_standard_wav,
    create_fingerprints: FingerprintFunction = fingerprints,
    estimate_pitch: PitchFunction = estimate_pitch_shift,
) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="crowdclip-audio-") as temp_name:
        temp_dir = Path(temp_name)
        query_path = temp_dir / "query.wav"
        extract(
            request.query.source,
            query_path,
            request.settings.ffmpeg_timeout_seconds,
        )
        query = create_fingerprints(query_path)

        candidates: list[Candidate] = []
        for index, reference in enumerate(request.references):
            reference_path = temp_dir / f"reference-{index}.wav"
            extract(
                reference.source,
                reference_path,
                request.settings.ffmpeg_timeout_seconds,
            )
            reference_fingerprints = create_fingerprints(reference_path)
            alignment = best_affine_alignment(
                reference_fingerprints.values,
                query.values,
            )
            candidates.append(
                Candidate(
                    track_id=reference.track_id,
                    alignment=alignment,
                    reference_path=reference_path,
                )
            )
        candidates.sort(key=lambda item: item.alignment.similarity, reverse=True)
        best = candidates[0]
        competing_similarities = [best.alignment.second_best_similarity]
        competing_similarities.extend(
            candidate.alignment.similarity for candidate in candidates[1:]
        )
        second_best_similarity = max(competing_similarities)
        peak_margin = best.alignment.similarity - second_best_similarity
        matched = (
            best.alignment.similarity >= request.settings.minimum_similarity
            and peak_margin >= request.settings.minimum_peak_margin
            and request.settings.minimum_time_scale
            <= best.alignment.time_scale
            <= request.settings.maximum_time_scale
        )

        common: dict[str, Any] = {
            "provider": PROVIDER,
            "fingerprintSimilarity": round(best.alignment.similarity, 6),
            "secondBestSimilarity": round(second_best_similarity, 6),
            "peakMargin": round(peak_margin, 6),
            "timeScale": round(best.alignment.time_scale, 6),
            "error": None,
        }
        if not matched:
            return {
                "status": "no_match",
                "referenceTrackId": None,
                "referenceOffsetMs": None,
                "matchedDurationMs": None,
                "pitchShiftCents": None,
                "pitchSimilarity": None,
                "pitchMargin": None,
                **common,
            }

        pitch = estimate_pitch(
            best.reference_path,
            query_path,
            best.alignment.offset_seconds,
            best.alignment.time_scale,
        )
        return {
            "status": "matched",
            "referenceTrackId": best.track_id,
            "referenceOffsetMs": round(best.alignment.offset_seconds * 1_000),
            "matchedDurationMs": max(
                1, round(query.duration_seconds * best.alignment.time_scale * 1_000)
            ),
            "pitchShiftCents": round(pitch.shift_cents, 3),
            "pitchSimilarity": round(pitch.similarity, 6),
            "pitchMargin": round(pitch.margin, 6),
            **common,
        }
