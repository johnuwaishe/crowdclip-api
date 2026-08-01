from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from audio_analysis.media import MediaExtractionError, extract_standard_wav


class MediaExtractionTests(unittest.TestCase):
    def test_invokes_ffmpeg_without_a_shell(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            output = Path(temp_name) / "output.wav"

            def complete(command, **kwargs):
                output.write_bytes(b"wav")
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch("audio_analysis.media.subprocess.run", side_effect=complete) as run:
                extract_standard_wav("https://example.test/video.mp4", output, 20)

            command = run.call_args.args[0]
            self.assertEqual(command[0], "ffmpeg")
            self.assertIn("https://example.test/video.mp4", command)
            self.assertEqual(run.call_args.kwargs["timeout"], 20)

    def test_reports_ffmpeg_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            output = Path(temp_name) / "output.wav"
            completed = subprocess.CompletedProcess(
                ["ffmpeg"],
                1,
                "",
                "corrupt input",
            )
            with patch(
                "audio_analysis.media.subprocess.run",
                return_value=completed,
            ):
                with self.assertRaisesRegex(MediaExtractionError, "corrupt input"):
                    extract_standard_wav("broken.mp4", output, 20)

    def test_reports_ffmpeg_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as temp_name:
            output = Path(temp_name) / "output.wav"
            timeout = subprocess.TimeoutExpired(["ffmpeg"], 20)
            with patch(
                "audio_analysis.media.subprocess.run",
                side_effect=timeout,
            ):
                with self.assertRaisesRegex(MediaExtractionError, "timed out"):
                    extract_standard_wav("slow.mp4", output, 20)


if __name__ == "__main__":
    unittest.main()
