from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from audio_analysis.fingerprint import SAMPLE_RATE
from audio_analysis.pitch import estimate_pitch_shift


def _progression(seconds: float, pitch_cents: float = 0) -> np.ndarray:
    samples = round(seconds * SAMPLE_RATE)
    time = np.arange(samples) / SAMPLE_RATE
    audio = np.zeros(samples)
    ratio = 2 ** (pitch_cents / 1_200)
    notes = (220.0, 261.626, 329.628, 293.665, 246.942)
    note_samples = SAMPLE_RATE
    for index, note in enumerate(notes * (round(seconds / len(notes)) + 1)):
        start = index * note_samples
        if start >= samples:
            break
        stop = min(samples, start + note_samples)
        local = time[start:stop] - time[start]
        envelope = np.sin(np.pi * np.minimum(local / 0.2, 1)) * np.exp(-local / 1.5)
        for harmonic in (1, 2, 3, 4):
            frequency = note * harmonic * ratio
            if frequency < SAMPLE_RATE / 2:
                audio[start:stop] += envelope * np.sin(2 * np.pi * frequency * local) / harmonic
    return audio / np.max(np.abs(audio))


def _write(path: Path, audio: np.ndarray) -> None:
    wavfile.write(path, SAMPLE_RATE, (audio * 30_000).astype(np.int16))


class PitchEstimateTest(unittest.TestCase):
    def test_estimates_pitch_independently_of_aligned_tempo(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            prefix = _progression(3)
            reference_audio = np.concatenate((prefix, _progression(15), prefix))
            # Same musical events and duration (key-lock case), deliberately
            # tuned 137 cents sharp.
            query_audio = _progression(15, pitch_cents=137)
            reference = directory / "reference.wav"
            query = directory / "query.wav"
            _write(reference, reference_audio)
            _write(query, query_audio)

            estimate = estimate_pitch_shift(reference, query, 3.0, 1.0)

            self.assertAlmostEqual(estimate.shift_cents, 137, delta=15)

    def test_reports_unshifted_audio_near_zero(self) -> None:
        with tempfile.TemporaryDirectory() as directory_name:
            directory = Path(directory_name)
            reference = directory / "reference.wav"
            query = directory / "query.wav"
            audio = _progression(12)
            _write(reference, audio)
            _write(query, audio)

            estimate = estimate_pitch_shift(reference, query, 0, 1.0)

            self.assertAlmostEqual(estimate.shift_cents, 0, delta=10)


if __name__ == "__main__":
    unittest.main()
