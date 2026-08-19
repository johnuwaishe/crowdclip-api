"""Pitch-offset estimation independent of playback tempo.

The fingerprint matcher establishes a reference interval and an affine time
scale first.  This module compares time-aligned high-resolution chroma features
inside that interval, so a DJ's key-lock and tempo controls remain separate
parameters.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.signal import resample

from .fingerprint import HOP_SIZE, SAMPLE_RATE, _read_mono


PITCH_BINS_PER_OCTAVE = 120
PITCH_STEP_CENTS = 1_200 / PITCH_BINS_PER_OCTAVE
MIN_PITCH_HZ = 80.0
MAX_PITCH_HZ = 2_000.0
PITCH_FRAME_SIZE = 4_096
DEFAULT_MAXIMUM_PITCH_CENTS = 600


@dataclass(frozen=True)
class PitchEstimate:
    """Query tuning relative to the aligned reference interval."""

    shift_cents: float
    similarity: float
    margin: float


def _standard_audio(path: Path) -> np.ndarray:
    sample_rate, audio = _read_mono(path)
    if sample_rate != SAMPLE_RATE:
        target_length = round(len(audio) * SAMPLE_RATE / sample_rate)
        audio = resample(audio, target_length)
    return audio.astype(np.float32, copy=False)


def _chroma(audio: np.ndarray) -> np.ndarray:
    if len(audio) < PITCH_FRAME_SIZE:
        audio = np.pad(audio, (0, PITCH_FRAME_SIZE - len(audio)))
    frame_count = 1 + (len(audio) - PITCH_FRAME_SIZE) // HOP_SIZE
    shape = (frame_count, PITCH_FRAME_SIZE)
    strides = (audio.strides[0] * HOP_SIZE, audio.strides[0])
    frames = np.lib.stride_tricks.as_strided(audio, shape=shape, strides=strides)
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(PITCH_FRAME_SIZE), axis=1)) ** 2
    frequencies = np.fft.rfftfreq(PITCH_FRAME_SIZE, 1 / SAMPLE_RATE)
    selected = (frequencies >= MIN_PITCH_HZ) & (frequencies <= MAX_PITCH_HZ)
    frequencies = frequencies[selected]
    spectrum = spectrum[:, selected]

    # Fractional pitch-class bins distribute energy between neighbours instead
    # of quantising FFT bins. This makes the final parabolic refinement useful
    # below the ten-cent chroma resolution.
    pitch_bins = np.mod(
        PITCH_BINS_PER_OCTAVE * np.log2(frequencies / 440.0),
        PITCH_BINS_PER_OCTAVE,
    )
    lower = np.floor(pitch_bins).astype(int)
    fraction = pitch_bins - lower
    chroma = np.zeros((frame_count, PITCH_BINS_PER_OCTAVE), dtype=np.float64)
    for frequency_index in range(len(frequencies)):
        chroma[:, lower[frequency_index]] += (
            spectrum[:, frequency_index] * (1 - fraction[frequency_index])
        )
        chroma[:, (lower[frequency_index] + 1) % PITCH_BINS_PER_OCTAVE] += (
            spectrum[:, frequency_index] * fraction[frequency_index]
        )

    chroma = np.log1p(chroma)
    chroma -= np.mean(chroma, axis=1, keepdims=True)
    norm = np.linalg.norm(chroma, axis=1, keepdims=True)
    return np.divide(chroma, norm, out=np.zeros_like(chroma), where=norm > 1e-12)


def estimate_pitch_shift(
    reference_path: Path,
    query_path: Path,
    reference_offset_seconds: float,
    time_scale: float,
    maximum_pitch_cents: int = DEFAULT_MAXIMUM_PITCH_CENTS,
) -> PitchEstimate:
    """Estimate query pitch relative to reference after correcting query time.

    Positive cents means the query is sharper/higher than the reference. The
    renderer therefore applies the inverse of this value.
    """

    reference = _chroma(_standard_audio(reference_path))
    query = _chroma(_standard_audio(query_path))
    scaled_length = max(2, round(len(query) * time_scale))
    query = resample(query, scaled_length, axis=0)
    query_norm = np.linalg.norm(query, axis=1, keepdims=True)
    query = np.divide(query, query_norm, out=np.zeros_like(query), where=query_norm > 1e-12)

    start = round(reference_offset_seconds * SAMPLE_RATE / HOP_SIZE)
    available = min(len(query), len(reference) - start)
    if start < 0 or available < 2:
        raise ValueError("Aligned interval is too short for pitch estimation")
    reference = reference[start : start + available]
    query = query[:available]

    maximum_bins = round(maximum_pitch_cents / PITCH_STEP_CENTS)
    shifts = np.arange(-maximum_bins, maximum_bins + 1, dtype=int)
    similarities = np.asarray(
        [np.mean(reference * np.roll(query, -int(shift), axis=1)) * PITCH_BINS_PER_OCTAVE for shift in shifts]
    )
    best_index = int(np.argmax(similarities))
    refined_index = float(best_index)
    if 0 < best_index < len(similarities) - 1:
        left, centre, right = similarities[best_index - 1 : best_index + 2]
        denominator = left - 2 * centre + right
        if abs(denominator) > 1e-12:
            refined_index += float(0.5 * (left - right) / denominator)

    exclusion_bins = max(1, round(50 / PITCH_STEP_CENTS))
    competing = np.ones(len(similarities), dtype=bool)
    competing[max(0, best_index - exclusion_bins) : best_index + exclusion_bins + 1] = False
    second_best = float(np.max(similarities[competing])) if np.any(competing) else -1.0
    shift_bins = shifts[0] + refined_index
    return PitchEstimate(
        shift_cents=float(shift_bins * PITCH_STEP_CENTS),
        similarity=float(similarities[best_index]),
        margin=float(similarities[best_index] - second_best),
    )
