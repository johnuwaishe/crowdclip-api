"""Ground-truth tests for the actual DSP: fingerprints + affine alignment.

Synthesizes music-like audio (decaying notes with vibrato, so the spectrum
evolves continuously the way real music does), cuts a clip out of it,
degrades the clip the way a smartphone recording differs from the soundboard
(clock drift, muffling, crowd noise, gain), and asserts that
`best_affine_alignment` recovers the known offset and time scale — and that
unrelated audio does NOT clear the default match thresholds.

Calibration notes (from sweeping degradation severity against this synth):
- An identical clip only reaches ~0.83 similarity, not 1.0, because its frame
  grid does not land on the reference's 512-sample hop grid.
- A 3% clock drift alone costs ~0.2 similarity (nearest-neighbour fingerprint
  resizing), landing just above the 0.59 production threshold.
- Drift plus 10 dB SNR noise still recovers the correct offset, but raw
  similarity falls BELOW the production threshold while peak_z_score keeps
  separating true from unrelated matches — see the heavy-degradation test.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, resample_poly

from audio_analysis.contract import (
    DEFAULT_MINIMUM_PEAK_MARGIN,
    DEFAULT_MINIMUM_SIMILARITY,
)
from audio_analysis.fingerprint import (
    SAMPLE_RATE,
    best_affine_alignment,
    fingerprints,
)


def _music_like_audio(seconds: float, seed: int) -> np.ndarray:
    """Overlapping decaying notes with vibrato inside the 300-2000 Hz band.

    The fingerprint's time-derivative bits need a spectrum that changes
    continuously; static held chords (or noise) produce noise-driven bits.
    """
    rng = np.random.default_rng(seed)
    total_samples = int(seconds * SAMPLE_RATE)
    audio = np.zeros(total_samples, dtype=np.float64)
    all_time = np.arange(total_samples) / SAMPLE_RATE
    note_seconds = 0.4
    ring_samples = int(0.3 * SAMPLE_RATE)
    for note_index in range(int(np.ceil(seconds / note_seconds))):
        start = int(note_index * note_seconds * SAMPLE_RATE)
        stop = min(
            int((note_index + 1) * note_seconds * SAMPLE_RATE) + ring_samples,
            total_samples,
        )
        time = all_time[start:stop] - all_time[start]
        for _ in range(3):
            fundamental = rng.uniform(300, 900)
            vibrato = 1 + 0.004 * np.sin(
                2 * np.pi * rng.uniform(4, 7) * time + rng.uniform(0, 6)
            )
            for harmonic in (1, 2):
                frequency = fundamental * harmonic
                if frequency >= 2_000:
                    continue
                amplitude = rng.uniform(0.2, 1.0) / harmonic
                decay = np.exp(-time / rng.uniform(0.15, 0.5))
                audio[start:stop] += (
                    amplitude
                    * decay
                    * np.sin(2 * np.pi * frequency * vibrato * time + rng.uniform(0, 6))
                )
    audio += 0.01 * rng.standard_normal(total_samples)
    return audio / np.max(np.abs(audio))


def _degrade_like_phone(
    audio: np.ndarray,
    speed_factor: float,
    seed: int,
    lowpass_hz: float | None = None,
    snr_linear: float | None = None,
) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # Constant clock-rate error: the phone captures the same sound in less
    # (or more) wall-clock time. speed_factor > 1 means a faster clip.
    degraded = resample_poly(audio, round(1_000 / speed_factor), 1_000)
    if lowpass_hz is not None:
        b, a = butter(4, lowpass_hz / (SAMPLE_RATE / 2), btype="low")
        degraded = lfilter(b, a, degraded)
    if snr_linear is not None:
        signal_power = np.mean(degraded**2)
        degraded = degraded + rng.standard_normal(len(degraded)) * np.sqrt(
            signal_power / snr_linear
        )
    degraded = 0.3 * degraded
    return degraded / np.max(np.abs(degraded))


def _write_wav(path: Path, audio: np.ndarray) -> None:
    wavfile.write(path, SAMPLE_RATE, (audio * 32_000).astype(np.int16))


class BestAffineAlignmentGroundTruthTest(unittest.TestCase):
    REFERENCE_SECONDS = 120.0
    CLIP_START_SECONDS = 40.0
    CLIP_SECONDS = 15.0
    SPEED_FACTOR = 1.03

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.reference_audio = _music_like_audio(self.REFERENCE_SECONDS, seed=7)
        reference_path = self.directory / "reference.wav"
        _write_wav(reference_path, self.reference_audio)
        self.reference = fingerprints(reference_path)

    def _reference_clip(self) -> np.ndarray:
        start = int(self.CLIP_START_SECONDS * SAMPLE_RATE)
        return self.reference_audio[start : start + int(self.CLIP_SECONDS * SAMPLE_RATE)]

    def _align(self, audio: np.ndarray, name: str):
        path = self.directory / name
        _write_wav(path, audio)
        return best_affine_alignment(self.reference.values, fingerprints(path).values)

    def test_clean_clip_aligns_with_high_confidence(self) -> None:
        alignment = self._align(self._reference_clip(), "clean.wav")

        self.assertGreaterEqual(alignment.similarity, 0.8)
        self.assertGreaterEqual(alignment.peak_margin, 0.2)
        self.assertAlmostEqual(
            alignment.offset_seconds, self.CLIP_START_SECONDS, delta=0.2
        )
        self.assertAlmostEqual(alignment.time_scale, 1.0, delta=0.005)

    def test_clock_drift_clears_production_thresholds(self) -> None:
        clip = _degrade_like_phone(self._reference_clip(), self.SPEED_FACTOR, seed=11)
        alignment = self._align(clip, "drifted.wav")

        self.assertGreaterEqual(alignment.similarity, DEFAULT_MINIMUM_SIMILARITY)
        self.assertGreaterEqual(alignment.peak_margin, DEFAULT_MINIMUM_PEAK_MARGIN)
        self.assertAlmostEqual(
            alignment.offset_seconds, self.CLIP_START_SECONDS, delta=0.3
        )
        self.assertAlmostEqual(alignment.time_scale, self.SPEED_FACTOR, delta=0.01)

    def test_heavy_degradation_still_recovers_the_true_offset(self) -> None:
        # Drift + muffling + 10 dB SNR crowd noise. The correct offset and
        # scale are still found and the peak stays statistically significant,
        # but raw similarity drops BELOW the production minimum — documenting
        # that the current 0.59 threshold rejects hard-but-correct matches on
        # this synthetic audio.
        clip = _degrade_like_phone(
            self._reference_clip(),
            self.SPEED_FACTOR,
            seed=11,
            lowpass_hz=2_400,
            snr_linear=10,
        )
        alignment = self._align(clip, "heavy.wav")

        self.assertAlmostEqual(
            alignment.offset_seconds, self.CLIP_START_SECONDS, delta=0.3
        )
        self.assertAlmostEqual(alignment.time_scale, self.SPEED_FACTOR, delta=0.015)
        self.assertGreaterEqual(alignment.peak_z_score, 5.0)
        self.assertLess(alignment.similarity, DEFAULT_MINIMUM_SIMILARITY)

    def test_crowd_singing_along_still_clears_production_thresholds(self) -> None:
        # A fan next to the phone singing the same song — correlated
        # interference: slightly sharp (~half a semitone), 150 ms behind the
        # beat, as loud as the music itself. Measured to cost slightly MORE
        # similarity than uncorrelated noise at equal loudness (biased bit
        # flips vs averaged-out ones), but the realistic level still clears
        # the production gates and the offset stays exact. Only a singer
        # markedly louder than the music (+6 dB) pushes raw similarity just
        # below the 0.59 gate — while the offset remains correct.
        rng = np.random.default_rng(3)
        clip = self._reference_clip()
        voice = resample_poly(clip, round(1_000 * 1.03), 1_000)[: len(clip)]
        voice = np.pad(voice, (int(0.15 * SAMPLE_RATE), 0))[: len(clip)]
        voice = voice + 0.05 * rng.standard_normal(len(voice))
        gain = np.sqrt(np.mean(clip**2) / np.mean(voice**2))
        mixed = clip + gain * voice
        alignment = self._align(mixed / np.max(np.abs(mixed)), "singalong.wav")

        self.assertGreaterEqual(alignment.similarity, DEFAULT_MINIMUM_SIMILARITY)
        self.assertGreaterEqual(alignment.peak_margin, DEFAULT_MINIMUM_PEAK_MARGIN)
        self.assertAlmostEqual(
            alignment.offset_seconds, self.CLIP_START_SECONDS, delta=0.3
        )

    def test_unrelated_audio_stays_below_match_thresholds(self) -> None:
        unrelated = _degrade_like_phone(
            _music_like_audio(self.CLIP_SECONDS, seed=99), 1.0, seed=13, snr_linear=10
        )
        alignment = self._align(unrelated, "unrelated.wav")

        self.assertLess(alignment.similarity, DEFAULT_MINIMUM_SIMILARITY)
        self.assertLess(alignment.peak_margin, DEFAULT_MINIMUM_PEAK_MARGIN)


if __name__ == "__main__":
    unittest.main()
