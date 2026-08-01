"""Read one analysis request from stdin and write one JSON result to stdout."""

from __future__ import annotations

import json
import sys
from typing import Any

from .analyser import PROVIDER, analyse
from .contract import RequestValidationError, parse_request
from .media import MediaExtractionError


def failure(error: Exception) -> dict[str, Any]:
    return {
        "status": "failed",
        "provider": PROVIDER,
        "referenceTrackId": None,
        "fingerprintSimilarity": None,
        "secondBestSimilarity": None,
        "peakMargin": None,
        "timeScale": None,
        "referenceOffsetMs": None,
        "matchedDurationMs": None,
        "error": str(error)[:2_000],
    }


def main() -> int:
    try:
        payload: Any = json.load(sys.stdin)
        request = parse_request(payload)
        result = analyse(request)
    except (
        json.JSONDecodeError,
        RequestValidationError,
        MediaExtractionError,
        OSError,
        RuntimeError,
        ValueError,
    ) as error:
        result = failure(error)
        json.dump(result, sys.stdout, separators=(",", ":"))
        sys.stdout.write("\n")
        return 1

    json.dump(result, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
