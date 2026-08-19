"""Concert Stitch-style robust fingerprint sequence and affine alignment.

Fingerprint per Haitsma & Kalker (ISMIR 2002) with the parameters used in
Subramanian & Lerch, "Concert Stitch" (ISMIR 2018); alignment replaces the
paper's DTW+SVM stage with an affine time-scale search — see
audio-analysis/README.md for the full rationale and deviations.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import correlate, resample_poly


SAMPLE_RATE = 5_000
FRAME_SIZE = 2_048
HOP_SIZE = 512
MIN_FREQUENCY = 300
MAX_FREQUENCY = 2_000
FINGERPRINT_BITS = 32


@dataclass(frozen=True)
class FingerprintSequence:
    values: np.ndarray
    duration_seconds: float


@dataclass(frozen=True)
class Alignment:
    similarity: float
    second_best_similarity: float
    peak_margin: float
    peak_z_score: float
    offset_seconds: float
    time_scale: float


def _read_mono(path: Path) -> tuple[int, np.ndarray]:
    sample_rate, audio = wavfile.read(path)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    if np.issubdtype(audio.dtype, np.integer):
        maximum = max(abs(np.iinfo(audio.dtype).min), np.iinfo(audio.dtype).max)
        audio = audio.astype(np.float32) / maximum
    else:
        audio = audio.astype(np.float32)
    return sample_rate, audio


def fingerprints(path: Path) -> FingerprintSequence:
    sample_rate, audio = _read_mono(path)
    duration_seconds = len(audio) / sample_rate
    divisor = np.gcd(sample_rate, SAMPLE_RATE)
    audio = resample_poly(
        audio,
        SAMPLE_RATE // divisor,
        sample_rate // divisor,
    )
    if len(audio) < FRAME_SIZE:
        raise ValueError(f"Audio is too short for fingerprinting: {path.name}")

    frame_count = 1 + (len(audio) - FRAME_SIZE) // HOP_SIZE
    shape = (frame_count, FRAME_SIZE)
    strides = (audio.strides[0] * HOP_SIZE, audio.strides[0])
    frames = np.lib.stride_tricks.as_strided(audio, shape=shape, strides=strides)
    windowed = frames * np.hanning(FRAME_SIZE)
    power = np.abs(np.fft.rfft(windowed, axis=1)) ** 2

    frequencies = np.fft.rfftfreq(FRAME_SIZE, 1 / SAMPLE_RATE)
    edges = np.geomspace(MIN_FREQUENCY, MAX_FREQUENCY, FINGERPRINT_BITS + 2)
    energy = np.empty((frame_count, FINGERPRINT_BITS + 1), dtype=np.float32)
    for band in range(FINGERPRINT_BITS + 1):
        selected = (frequencies >= edges[band]) & (frequencies < edges[band + 1])
        energy[:, band] = np.log1p(power[:, selected].sum(axis=1))

    frequency_contrast = energy[:, :-1] - energy[:, 1:]
    values = np.where(
        np.diff(frequency_contrast, axis=0) >= 0,
        1.0,
        -1.0,
    ).astype(np.float32)
    return FingerprintSequence(values=values, duration_seconds=duration_seconds)


def resize_fingerprints(values: np.ndarray, scale: float) -> np.ndarray:
    output_length = max(2, round(len(values) * scale))
    source_indices = np.rint(np.arange(output_length) / scale).astype(int)
    source_indices = np.clip(source_indices, 0, len(values) - 1)
    return values[source_indices]


def best_affine_alignment(
    reference: np.ndarray,
    query: np.ndarray,
    search_minimum_scale: float = 0.85,
    search_maximum_scale: float = 1.15,
    scale_step: float = 0.001,
) -> Alignment:
    best_similarity = -1.0
    best_offset_seconds = -1.0
    best_time_scale = 1.0
    candidates: list[np.ndarray] = []

    for scale in np.arange(
        search_minimum_scale,
        search_maximum_scale + scale_step / 2,
        scale_step,
    ):
        resized = resize_fingerprints(query, float(scale))
        if len(resized) > len(reference):
            continue
        score = correlate(reference, resized, mode="valid", method="fft")[:, 0]
        candidate_similarities = score / (len(resized) * FINGERPRINT_BITS)
        candidate_similarities = (candidate_similarities + 1) / 2
        candidates.append(candidate_similarities)
        best_index = int(np.argmax(candidate_similarities))
        similarity = float(candidate_similarities[best_index])
        if similarity > best_similarity:
            best_similarity = similarity
            best_offset_seconds = best_index * HOP_SIZE / SAMPLE_RATE
            best_time_scale = float(scale)

    if not candidates:
        raise ValueError("Query is longer than the reference at every search scale")

    exclusion_seconds = len(query) * HOP_SIZE / SAMPLE_RATE
    separated: list[np.ndarray] = []
    for candidate_similarities in candidates:
        candidate_offsets = (
            np.arange(len(candidate_similarities)) * HOP_SIZE / SAMPLE_RATE
        )
        selected = candidate_similarities[
            np.abs(candidate_offsets - best_offset_seconds) >= exclusion_seconds
        ]
        if len(selected):
            separated.append(selected)

    second_best_similarity = (
        max(float(np.max(values)) for values in separated) if separated else 0.0
    )
    all_similarities = np.concatenate(candidates)
    standard_deviation = float(np.std(all_similarities))
    peak_z_score = (
        (best_similarity - float(np.median(all_similarities)))
        / standard_deviation
        if standard_deviation > 0
        else 0.0
    )
    return Alignment(
        similarity=best_similarity,
        second_best_similarity=second_best_similarity,
        peak_margin=best_similarity - second_best_similarity,
        peak_z_score=peak_z_score,
        offset_seconds=best_offset_seconds,
        time_scale=best_time_scale,
    )
