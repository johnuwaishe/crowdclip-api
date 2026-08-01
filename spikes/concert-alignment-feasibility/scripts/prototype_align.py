#!/usr/bin/env python3
"""Prototype a Concert Stitch-style fingerprint alignment on preserved fixtures."""

from __future__ import annotations

import argparse
import time
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


def read_mono(path: Path) -> tuple[int, np.ndarray]:
    sample_rate, audio = wavfile.read(path)
    if audio.ndim == 2:
        audio = audio.mean(axis=1)
    if np.issubdtype(audio.dtype, np.integer):
        maximum = max(abs(np.iinfo(audio.dtype).min), np.iinfo(audio.dtype).max)
        audio = audio.astype(np.float32) / maximum
    else:
        audio = audio.astype(np.float32)
    return sample_rate, audio


def fingerprints(path: Path) -> np.ndarray:
    sample_rate, audio = read_mono(path)
    divisor = np.gcd(sample_rate, SAMPLE_RATE)
    audio = resample_poly(
        audio,
        SAMPLE_RATE // divisor,
        sample_rate // divisor,
    )
    if len(audio) < FRAME_SIZE:
        raise ValueError(f"Audio is too short for fingerprinting: {path}")

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
    return np.where(np.diff(frequency_contrast, axis=0) >= 0, 1.0, -1.0).astype(
        np.float32
    )


def resize_fingerprints(values: np.ndarray, scale: float) -> np.ndarray:
    output_length = max(2, round(len(values) * scale))
    source_indices = np.rint(np.arange(output_length) / scale).astype(int)
    source_indices = np.clip(source_indices, 0, len(values) - 1)
    return values[source_indices]


def best_affine_alignment(
    reference: np.ndarray,
    query: np.ndarray,
    minimum_scale: float = 0.92,
    maximum_scale: float = 1.08,
    scale_step: float = 0.001,
) -> dict[str, float]:
    best = {
        "similarity": -1.0,
        "offsetSeconds": -1.0,
        "timeScale": 1.0,
    }
    candidates: list[tuple[np.ndarray, float]] = []
    for scale in np.arange(minimum_scale, maximum_scale + scale_step / 2, scale_step):
        resized = resize_fingerprints(query, float(scale))
        if len(resized) > len(reference):
            continue
        score = correlate(reference, resized, mode="valid", method="fft")[:, 0]
        best_index = int(np.argmax(score))
        normalized = float(score[best_index] / (len(resized) * FINGERPRINT_BITS))
        similarity = (normalized + 1) / 2
        candidate_similarities = (score / (len(resized) * FINGERPRINT_BITS) + 1) / 2
        candidates.append((candidate_similarities, float(scale)))
        if similarity > best["similarity"]:
            best = {
                "similarity": similarity,
                "offsetSeconds": best_index * HOP_SIZE / SAMPLE_RATE,
                "timeScale": float(scale),
            }
    similarities = np.concatenate([candidate[0] for candidate in candidates])
    exclusion_seconds = len(query) * HOP_SIZE / SAMPLE_RATE
    separated: list[np.ndarray] = []
    for candidate_similarities, _ in candidates:
        candidate_offsets = (
            np.arange(len(candidate_similarities)) * HOP_SIZE / SAMPLE_RATE
        )
        selected = candidate_similarities[
            np.abs(candidate_offsets - best["offsetSeconds"]) >= exclusion_seconds
        ]
        if len(selected):
            separated.append(selected)
    best["secondBestSimilarity"] = (
        max(float(np.max(values)) for values in separated) if separated else -1.0
    )
    best["peakMargin"] = best["similarity"] - best["secondBestSimilarity"]
    standard_deviation = float(np.std(similarities))
    best["peakZScore"] = (
        (best["similarity"] - float(np.median(similarities))) / standard_deviation
        if standard_deviation > 0
        else 0.0
    )
    return best


def subsequence_dtw_alignment(
    reference: np.ndarray,
    query: np.ndarray,
    warp_penalty: float = 0.02,
) -> dict[str, float]:
    local_cost = 0.5 - (query @ reference.T) / (2 * FINGERPRINT_BITS)
    query_frames, reference_frames = local_cost.shape
    accumulated = np.empty_like(local_cost, dtype=np.float32)
    traceback = np.zeros(local_cost.shape, dtype=np.uint8)
    accumulated[0] = local_cost[0]

    for query_index in range(1, query_frames):
        previous = accumulated[query_index - 1]
        current = accumulated[query_index]
        current[0] = previous[0] + local_cost[query_index, 0] + warp_penalty
        traceback[query_index, 0] = 1
        for reference_index in range(1, reference_frames):
            choices = (
                previous[reference_index - 1],
                previous[reference_index] + warp_penalty,
                current[reference_index - 1] + warp_penalty,
            )
            step = int(np.argmin(choices))
            current[reference_index] = local_cost[query_index, reference_index] + choices[step]
            traceback[query_index, reference_index] = step

    query_index = query_frames - 1
    reference_index = int(np.argmin(accumulated[-1]))
    reference_stop = reference_index
    path_costs: list[float] = []
    while query_index > 0:
        path_costs.append(float(local_cost[query_index, reference_index]))
        step = int(traceback[query_index, reference_index])
        if step == 0:
            query_index -= 1
            reference_index -= 1
        elif step == 1:
            query_index -= 1
        else:
            reference_index -= 1
        if reference_index <= 0:
            reference_index = 0
            break
    reference_start = reference_index
    path_costs.append(float(local_cost[query_index, reference_index]))
    reference_span = max(1, reference_stop - reference_start)
    return {
        "similarity": 1 - float(np.mean(path_costs)),
        "offsetSeconds": reference_start * HOP_SIZE / SAMPLE_RATE,
        "stopSeconds": reference_stop * HOP_SIZE / SAMPLE_RATE,
        "timeScale": reference_span / max(1, query_frames - 1),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("reference", type=Path)
    parser.add_argument("queries", nargs="+", type=Path)
    args = parser.parse_args()

    started = time.perf_counter()
    reference = fingerprints(args.reference)
    print(f"reference_frames={len(reference)}")
    for query_path in args.queries:
        query = fingerprints(query_path)
        result = best_affine_alignment(reference, query)
        dtw = subsequence_dtw_alignment(reference, query)
        print(
            f"{query_path.name}: affine_similarity={result['similarity']:.6f} "
            f"affine_offset={result['offsetSeconds']:.3f}s "
            f"affine_scale={result['timeScale']:.4f} "
            f"peak_margin={result['peakMargin']:.6f} "
            f"peak_z={result['peakZScore']:.3f} "
            f"dtw_similarity={dtw['similarity']:.6f} "
            f"dtw_offset={dtw['offsetSeconds']:.3f}s "
            f"dtw_scale={dtw['timeScale']:.4f} frames={len(query)}"
        )
    print(f"elapsed_seconds={time.perf_counter() - started:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
