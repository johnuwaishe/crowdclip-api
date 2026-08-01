from __future__ import annotations

import unittest

from audio_analysis.contract import RequestValidationError, parse_request


class ContractTests(unittest.TestCase):
    def test_parses_minimal_request_with_defaults(self) -> None:
        request = parse_request(
            {
                "query": {"id": "asset-id", "source": "/tmp/query.mp4"},
                "references": [
                    {"trackId": "track-id", "source": "/tmp/reference.mp3"}
                ],
            }
        )

        self.assertEqual(request.query.id, "asset-id")
        self.assertEqual(request.references[0].track_id, "track-id")
        self.assertEqual(request.settings.minimum_similarity, 0.59)
        self.assertEqual(request.settings.ffmpeg_timeout_seconds, 120)

    def test_rejects_duplicate_reference_track_ids(self) -> None:
        with self.assertRaisesRegex(RequestValidationError, "duplicate"):
            parse_request(
                {
                    "query": {"id": "asset-id", "source": "/tmp/query.mp4"},
                    "references": [
                        {"trackId": "same", "source": "/tmp/one.mp3"},
                        {"trackId": "same", "source": "/tmp/two.mp3"},
                    ],
                }
            )

    def test_rejects_an_inverted_time_scale_gate(self) -> None:
        with self.assertRaisesRegex(RequestValidationError, "must not exceed"):
            parse_request(
                {
                    "query": {"id": "asset-id", "source": "/tmp/query.mp4"},
                    "references": [
                        {"trackId": "track-id", "source": "/tmp/reference.mp3"}
                    ],
                    "settings": {
                        "minimumTimeScale": 1.1,
                        "maximumTimeScale": 0.9,
                    },
                }
            )


if __name__ == "__main__":
    unittest.main()
