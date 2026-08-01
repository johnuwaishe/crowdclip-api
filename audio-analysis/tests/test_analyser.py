from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from audio_analysis.analyser import analyse
from audio_analysis.contract import parse_request
from audio_analysis.fingerprint import Alignment, FingerprintSequence


class AnalyserTests(unittest.TestCase):
    def setUp(self) -> None:
        self.request = parse_request(
            {
                "query": {"id": "asset-id", "source": "query.mp4"},
                "references": [
                    {"trackId": "track-one", "source": "one.mp3"},
                    {"trackId": "track-two", "source": "two.mp3"},
                ],
            }
        )

    @staticmethod
    def extract(_source: str, destination: Path, _timeout: int) -> None:
        destination.write_bytes(b"test")

    @staticmethod
    def fingerprint(path: Path) -> FingerprintSequence:
        frame_count = 100 if path.name == "query.wav" else 500
        return FingerprintSequence(
            values=np.ones((frame_count, 32), dtype=np.float32),
            duration_seconds=15.0 if path.name == "query.wav" else 240.0,
        )

    def test_returns_the_best_catalogue_match(self) -> None:
        alignments = [
            Alignment(0.64, 0.54, 0.10, 4.0, 88.576, 0.995),
            Alignment(0.55, 0.53, 0.02, 2.0, 20.0, 1.0),
        ]
        with patch(
            "audio_analysis.analyser.best_affine_alignment",
            side_effect=alignments,
        ):
            result = analyse(self.request, self.extract, self.fingerprint)

        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["referenceTrackId"], "track-one")
        self.assertEqual(result["referenceOffsetMs"], 88_576)
        self.assertEqual(result["matchedDurationMs"], 15_000)
        self.assertAlmostEqual(result["peakMargin"], 0.09)

    def test_returns_no_match_when_another_track_is_too_close(self) -> None:
        alignments = [
            Alignment(0.64, 0.54, 0.10, 4.0, 88.576, 0.995),
            Alignment(0.63, 0.52, 0.11, 4.0, 20.0, 1.0),
        ]
        with patch(
            "audio_analysis.analyser.best_affine_alignment",
            side_effect=alignments,
        ):
            result = analyse(self.request, self.extract, self.fingerprint)

        self.assertEqual(result["status"], "no_match")
        self.assertIsNone(result["referenceTrackId"])
        self.assertAlmostEqual(result["peakMargin"], 0.01)


if __name__ == "__main__":
    unittest.main()
