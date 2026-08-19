"""Find every performance of one reference song inside long concert recordings.

The production analyser answers "where does this 12-second clip sit inside the
song?". This tool answers the inverse, which is what building a demo timeline
from raw fan uploads actually needs: "somewhere in this 90-minute show, the
artist played this song — find it, and cut as many aligned angles out of it as
the recording supports."

Method:

1. Download audio only for each source (cached, so re-runs are free).
2. Fingerprint the whole show once — 5 kHz / hop 512 is ~9.8 frames per second,
   so even a two-hour upload is a few million floats.
3. Coarse pass: slide a short window across the show and align each window
   against the reference at time scale 1.0.
4. Cluster surviving windows on the invariant that `reference offset − window
   start` is CONSTANT throughout a continuous performance. This is the same
   no-annotation ground truth tools/evaluate_pair.py uses, and it is what
   separates a real performance from an isolated lucky correlation peak: a
   false peak has no neighbours agreeing on its delta.
5. Refine each cluster with the full affine scale search to recover a precise
   offset and clock-rate scale, then map every excerpt boundary through it.
6. Emit CASINO_DEMO_SOURCES entries plus a JSON evidence report.

Usage:
  .venv/bin/python -m tools.sweep_show \
      --reference /path/to/casino.wav \
      --report ../tmp/casino-sweep/report.json \
      --typescript ../tmp/casino-sweep/sources.ts.txt
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from audio_analysis.fingerprint import (
    HOP_SIZE,
    SAMPLE_RATE,
    Alignment,
    best_affine_alignment,
    fingerprints,
)
from audio_analysis.media import extract_standard_wav

FRAMES_PER_SECOND = SAMPLE_RATE / HOP_SIZE

# A 20 s window is long enough to correlate confidently and short enough that
# phone clock drift inside it is far below one fingerprint frame.
WINDOW_SECONDS = 20.0
WINDOW_HOP_SECONDS = 5.0
# Production thresholds from audio_analysis/contract.py.
MINIMUM_SIMILARITY = 0.59
MINIMUM_PEAK_MARGIN = 0.02
# Two windows belong to the same performance when they agree on their delta.
DELTA_TOLERANCE_SECONDS = 1.5
MINIMUM_CLUSTER_WINDOWS = 3
REFINE_SECONDS = 60.0
EXCERPT_SECONDS = 12.0
# A verified excerpt must land where the span's affine mapping predicts.
EXCERPT_AGREEMENT_SECONDS = 1.0
FFMPEG_TIMEOUT_SECONDS = 900
# Tried in order; web_embedded is currently the one that reliably serves media.
PLAYER_CLIENTS = ("default", "web_embedded", "android_vr", "tv_embedded")


@dataclass(frozen=True)
class Source:
    video_id: str
    creator: str
    venue: str
    city: str
    kind: str = "watch"

    @property
    def url(self) -> str:
        if self.kind == "shorts":
            return f"https://www.youtube.com/shorts/{self.video_id}"
        return f"https://www.youtube.com/watch?v={self.video_id}"


# Mirrors CASINO_DEMO_SOURCES and CASINO_DEMO_DISCOVERY_SOURCES in
# src/demo/casino-demo.ts. Every CA$INO Tour upload we know of, long ones
# included — the point of this tool is that length is no longer a reason to
# exclude a source.
DEFAULT_SOURCES: tuple[Source, ...] = (
    Source("yabXopwkIVs", "CakessCam", "Webster Hall", "New York, NY"),
    Source("WauHPYXufQs", "WOOPDATTRICK", "CA$INO Tour", "Las Vegas, NV"),
    Source("GysJEiN5OnE", "CULTCERT", "Webster Hall", "New York, NY"),
    Source(
        "ak2BkFN80QA",
        "YungWillieWill",
        "The Fillmore Jackie Gleason Theater",
        "Miami Beach, FL",
    ),
    Source("8voL-JpfobA", "angelslucki", "Bayou Music Center", "Houston, TX"),
    Source("VU8V24kuBuU", "MaxShoots", "CA$INO Tour", "Raleigh, NC"),
    Source("V0xT9CYtidQ", "DallasVisuals", "CA$INO Tour", "Dallas, TX"),
    Source("Vizc3XdykBY", "MaxShoots", "CA$INO Tour", "Detroit, MI"),
    Source("RIJkczwbcQE", "Saul", "CA$INO Tour", "Los Angeles, CA"),
    Source("dU12OOS6gcI", "jaden", "CA$INO Tour", "Atlanta, GA"),
    Source("ajgr__6p_Oc", "gloss", "CA$INO Tour", "Washington, DC"),
    Source("f7_t_nfAmcE", "Shi-Fi", "CA$INO Tour", "Unknown", kind="shorts"),
)


@dataclass(frozen=True)
class WindowMatch:
    start_seconds: float
    similarity: float
    peak_margin: float
    reference_offset_seconds: float

    @property
    def delta(self) -> float:
        return self.reference_offset_seconds - self.start_seconds


@dataclass
class Performance:
    windows: list[WindowMatch] = field(default_factory=list)
    alignment: Alignment | None = None
    query_start_seconds: float = 0.0

    @property
    def start_seconds(self) -> float:
        return self.windows[0].start_seconds

    @property
    def end_seconds(self) -> float:
        return self.windows[-1].start_seconds + WINDOW_SECONDS

    def reference_seconds(self, show_seconds: float) -> float:
        assert self.alignment is not None
        return self.alignment.offset_seconds + (
            show_seconds - self.query_start_seconds
        ) * self.alignment.time_scale


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def slug(value: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def download_audio(source: Source, cache: Path, yt_dlp: str) -> Path:
    """Fetch audio only, trying each player client until one serves the media.

    YouTube hands different clients different URLs, and some of them 403 on the
    media fetch even though the format list came back fine. The production
    downloader already falls back this way; the same chain applies here.
    Itag 139 is a ~49 kbps m4a — the fingerprinter downsamples to 5 kHz, so a
    full show costs ~19 MB instead of a few hundred.
    """
    destination = cache / f"{source.video_id}.m4a"
    if destination.is_file() and destination.stat().st_size > 0:
        log(f"  cached audio: {destination.name}")
        return destination

    failures: list[str] = []
    for client in PLAYER_CLIENTS:
        log(f"  downloading audio ({client}): {source.url}")
        command = [
            yt_dlp,
            "--no-playlist",
            "--no-warnings",
            "--js-runtimes",
            "node",
            "--extract-audio",
            "--audio-format",
            "m4a",
            "--format",
            "139/bestaudio[ext=m4a]/bestaudio",
            "--output",
            str(cache / f"{source.video_id}.%(ext)s"),
        ]
        if client != "default":
            command += ["--extractor-args", f"youtube:player_client={client}"]
        completed = subprocess.run(
            command + [source.url], check=False, capture_output=True, text=True
        )
        if completed.returncode == 0 and destination.is_file():
            return destination
        detail = (completed.stderr or completed.stdout or "unknown").strip()
        failures.append(f"{client}: {' '.join(detail.split())[-160:]}")
    raise RuntimeError(" | ".join(failures))


def probe_duration_ms(media: Path, ffprobe: str) -> int:
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(media),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(completed.stdout.strip()) * 1_000)


def fingerprint_media(media: Path, ffmpeg: str) -> np.ndarray:
    with tempfile.TemporaryDirectory(prefix="casino-sweep-") as directory:
        wav = Path(directory) / "standard.wav"
        extract_standard_wav(str(media), wav, FFMPEG_TIMEOUT_SECONDS, ffmpeg)
        return fingerprints(wav).values


def coarse_windows(
    reference: np.ndarray,
    show: np.ndarray,
    minimum_similarity: float,
    minimum_peak_margin: float,
) -> list[WindowMatch]:
    window_frames = int(WINDOW_SECONDS * FRAMES_PER_SECOND)
    hop_frames = int(WINDOW_HOP_SECONDS * FRAMES_PER_SECOND)
    if window_frames > len(reference):
        raise ValueError("Reference is shorter than one analysis window")

    matches: list[WindowMatch] = []
    starts = range(0, max(1, len(show) - window_frames + 1), hop_frames)
    for index, start in enumerate(starts):
        if index % 50 == 0:
            log(f"    window {index}/{len(starts)}")
        query = show[start : start + window_frames]
        # Scale is pinned to 1.0 here: drift inside 20 s cannot reach a frame,
        # and the full search would cost 161x for no extra discrimination.
        alignment = best_affine_alignment(reference, query, 1.0, 1.0)
        if (
            alignment.similarity < minimum_similarity
            or alignment.peak_margin < minimum_peak_margin
        ):
            continue
        matches.append(
            WindowMatch(
                start_seconds=start / FRAMES_PER_SECOND,
                similarity=alignment.similarity,
                peak_margin=alignment.peak_margin,
                reference_offset_seconds=alignment.offset_seconds,
            )
        )
    return matches


def cluster_windows(matches: list[WindowMatch]) -> list[Performance]:
    """Group windows that agree on delta AND are adjacent in the show.

    A continuous performance produces a run of windows whose delta is the same
    constant. Anything that survives the similarity threshold alone but has no
    neighbours agreeing with it is a correlation artefact, not a performance.
    """
    performances: list[Performance] = []
    current = Performance()
    for match in sorted(matches, key=lambda item: item.start_seconds):
        if current.windows:
            previous = current.windows[-1]
            contiguous = (
                match.start_seconds - previous.start_seconds
                <= WINDOW_HOP_SECONDS * 2 + 1e-6
            )
            consistent = abs(match.delta - previous.delta) <= DELTA_TOLERANCE_SECONDS
            if contiguous and consistent:
                current.windows.append(match)
                continue
            performances.append(current)
            current = Performance()
        current.windows.append(match)
    if current.windows:
        performances.append(current)
    return [
        performance
        for performance in performances
        if len(performance.windows) >= MINIMUM_CLUSTER_WINDOWS
    ]


def refine(reference: np.ndarray, show: np.ndarray, performance: Performance) -> None:
    span = performance.end_seconds - performance.start_seconds
    length_seconds = min(REFINE_SECONDS, span)
    centre = (performance.start_seconds + performance.end_seconds) / 2
    query_start = max(performance.start_seconds, centre - length_seconds / 2)
    start_frame = int(query_start * FRAMES_PER_SECOND)
    end_frame = start_frame + int(length_seconds * FRAMES_PER_SECOND)
    performance.alignment = best_affine_alignment(
        reference, show[start_frame:end_frame]
    )
    performance.query_start_seconds = start_frame / FRAMES_PER_SECOND


def excerpts(
    reference: np.ndarray,
    show: np.ndarray,
    source: Source,
    performance: Performance,
    reference_seconds: float,
    source_duration_ms: int,
    minimum_similarity: float,
    minimum_peak_margin: float,
) -> tuple[list[dict[str, object]], int]:
    """Cut the matched span into excerpts, verifying each one on its own.

    The coarse windows overshoot a performance at both ends: a 20 s window that
    is only part song still clears the threshold, so the outermost excerpts of a
    span can contain the song before or after it. Re-aligning each excerpt
    individually and requiring its own offset to agree with the span's affine
    mapping drops exactly those, and guarantees every emitted clip is the song.
    """
    results: list[dict[str, object]] = []
    excerpt_frames = int(EXCERPT_SECONDS * FRAMES_PER_SECOND)
    rejected = 0
    show_time = performance.start_seconds
    while show_time + EXCERPT_SECONDS <= performance.end_seconds:
        reference_start = performance.reference_seconds(show_time)
        if reference_start < 0 or reference_start + EXCERPT_SECONDS > reference_seconds:
            show_time += EXCERPT_SECONDS
            continue
        start_frame = int(show_time * FRAMES_PER_SECOND)
        query = show[start_frame : start_frame + excerpt_frames]
        if len(query) < excerpt_frames:
            break
        check = best_affine_alignment(reference, query, 1.0, 1.0)
        if (
            check.similarity < minimum_similarity
            or check.peak_margin < minimum_peak_margin
            or abs(check.offset_seconds - reference_start) > EXCERPT_AGREEMENT_SECONDS
        ):
            rejected += 1
            show_time += EXCERPT_SECONDS
            continue
        results.append(
            {
                "id": (
                    f"casino-{slug(source.city)}-{slug(source.creator)}"
                    f"-{round(show_time)}s"
                ),
                "creator": source.creator,
                "venue": source.venue,
                "city": source.city,
                "videoId": source.video_id,
                "kind": source.kind,
                "songStartMs": round(performance.start_seconds * 1_000),
                "excerptOffsetMs": round(
                    (show_time - performance.start_seconds) * 1_000
                ),
                "referenceStartMs": round(reference_start * 1_000),
                "sourceDurationMs": source_duration_ms,
                "similarity": round(check.similarity, 4),
                "peakMargin": round(check.peak_margin, 4),
            }
        )
        show_time += EXCERPT_SECONDS
    return results, rejected


def select_clips(
    entries: list[dict[str, object]],
    angles_per_slot: int,
    maximum_per_source: int,
) -> list[dict[str, object]]:
    """Thin the verified excerpts down to a covering set.

    Emitting every 12 s slot of every matched span produces a few hundred
    angles, which is more than the timeline can load today. What matters is
    that no part of the song is left without an angle, and that the busy parts
    have more than one to cut between — so keep the best few per slot,
    preferring different creators, and cap how much any single upload
    contributes. A clip that is alone in its slot is never dropped.
    """
    def slot(entry: dict[str, object]) -> int:
        return int(entry["referenceStartMs"]) // int(EXCERPT_SECONDS * 1_000)

    by_slot: dict[int, list[dict[str, object]]] = defaultdict(list)
    for entry in entries:
        by_slot[slot(entry)].append(entry)

    covering: list[dict[str, object]] = []
    for key in sorted(by_slot):
        candidates = sorted(
            by_slot[key], key=lambda entry: -float(entry["similarity"])
        )
        picked: list[dict[str, object]] = []
        creators: set[str] = set()
        for candidate in candidates:
            if len(picked) >= angles_per_slot:
                break
            creator = str(candidate["creator"])
            if creator in creators:
                continue
            picked.append(candidate)
            creators.add(creator)
        for candidate in candidates:
            if len(picked) >= angles_per_slot:
                break
            if candidate not in picked:
                picked.append(candidate)
        covering.extend(picked)

    per_source: Counter[str] = Counter()
    covered: set[int] = set()
    kept: list[dict[str, object]] = []
    for entry in sorted(covering, key=lambda entry: -float(entry["similarity"])):
        key = slot(entry)
        video_id = str(entry["videoId"])
        # The cap must never cost coverage: if nothing is holding this slot yet,
        # the clip is kept even when its upload is already at its limit.
        if key in covered and per_source[video_id] >= maximum_per_source:
            continue
        per_source[video_id] += 1
        covered.add(key)
        kept.append(entry)
    return sorted(kept, key=lambda entry: int(entry["referenceStartMs"]))


def typescript(entries: list[dict[str, object]]) -> str:
    lines = ["export const CASINO_DEMO_SOURCES: DemoClipSource[] = ["]
    for entry in entries:
        lines.append("  youtubeSource({")
        lines.append(f"    id: '{entry['id']}',")
        lines.append(f"    creator: '{entry['creator']}',")
        lines.append(f"    venue: '{entry['venue']}',")
        lines.append(f"    city: '{entry['city']}',")
        lines.append(f"    videoId: '{entry['videoId']}',")
        if entry["kind"] == "shorts":
            lines.append("    kind: 'shorts',")
        lines.append(f"    songStartMs: {entry['songStartMs']},")
        lines.append(f"    excerptOffsetMs: {entry['excerptOffsetMs']},")
        lines.append(f"    referenceStartMs: {entry['referenceStartMs']},")
        lines.append(f"    sourceDurationMs: {entry['sourceDurationMs']},")
        lines.append("  }),")
    lines.append("];")
    return "\n".join(lines) + "\n"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reference",
        required=True,
        type=Path,
        help="Local audio file for the song being searched for.",
    )
    parser.add_argument("--cache", type=Path, default=Path("../tmp/casino-sweep"))
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--typescript", type=Path, default=None)
    parser.add_argument("--video-id", action="append", dest="video_ids", default=None)
    parser.add_argument(
        "--angles-per-slot",
        type=int,
        default=2,
        help="Maximum simultaneous angles kept per 12s slot of the song.",
    )
    parser.add_argument(
        "--max-clips-per-source",
        type=int,
        default=4,
        help="Maximum excerpts any single upload contributes.",
    )
    parser.add_argument("--minimum-similarity", type=float, default=MINIMUM_SIMILARITY)
    parser.add_argument(
        "--minimum-peak-margin", type=float, default=MINIMUM_PEAK_MARGIN
    )
    parser.add_argument(
        "--yt-dlp", default="../node_modules/youtube-dl-exec/bin/yt-dlp"
    )
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    if not arguments.reference.is_file():
        log(f"Reference audio not found: {arguments.reference}")
        return 1
    arguments.cache.mkdir(parents=True, exist_ok=True)

    log(f"Fingerprinting reference: {arguments.reference}")
    reference = fingerprint_media(arguments.reference, arguments.ffmpeg)
    reference_seconds = len(reference) / FRAMES_PER_SECOND
    log(f"  reference is {reference_seconds:.1f}s ({len(reference)} frames)")

    sources = DEFAULT_SOURCES
    if arguments.video_ids:
        wanted = set(arguments.video_ids)
        sources = tuple(item for item in sources if item.video_id in wanted)

    report: list[dict[str, object]] = []
    entries: list[dict[str, object]] = []
    for source in sources:
        log(f"\n{source.creator} — {source.city} ({source.video_id})")
        try:
            media = download_audio(source, arguments.cache, arguments.yt_dlp)
            duration_ms = probe_duration_ms(media, arguments.ffprobe)
            show = fingerprint_media(media, arguments.ffmpeg)
        except (subprocess.CalledProcessError, RuntimeError, OSError) as error:
            detail = getattr(error, "stderr", None) or str(error)
            log(f"  unavailable: {' '.join(str(detail).split())[:200]}")
            report.append(
                {"videoId": source.video_id, "status": "unavailable", "clips": 0}
            )
            continue

        log(f"  show is {duration_ms / 1_000:.1f}s, scanning")
        matches = coarse_windows(
            reference,
            show,
            arguments.minimum_similarity,
            arguments.minimum_peak_margin,
        )
        performances = cluster_windows(matches)
        log(f"  {len(matches)} matching windows -> {len(performances)} performance(s)")

        source_entries: list[dict[str, object]] = []
        performance_report: list[dict[str, object]] = []
        for performance in performances:
            refine(reference, show, performance)
            found, rejected = excerpts(
                reference,
                show,
                source,
                performance,
                reference_seconds,
                duration_ms,
                arguments.minimum_similarity,
                arguments.minimum_peak_margin,
            )
            source_entries.extend(found)
            assert performance.alignment is not None
            deltas = [window.delta for window in performance.windows]
            performance_report.append(
                {
                    "showStartSeconds": round(performance.start_seconds, 2),
                    "showEndSeconds": round(performance.end_seconds, 2),
                    "windows": len(performance.windows),
                    "deltaSpreadSeconds": round(max(deltas) - min(deltas), 3),
                    "meanSimilarity": round(
                        sum(w.similarity for w in performance.windows)
                        / len(performance.windows),
                        4,
                    ),
                    "refinedSimilarity": round(performance.alignment.similarity, 4),
                    "refinedPeakMargin": round(performance.alignment.peak_margin, 4),
                    "timeScale": round(performance.alignment.time_scale, 4),
                    "clips": len(found),
                    "rejectedExcerpts": rejected,
                }
            )
            log(
                f"    {performance.start_seconds:7.1f}s-{performance.end_seconds:7.1f}s"
                f"  windows={len(performance.windows):3d}"
                f"  spread={max(deltas) - min(deltas):.2f}s"
                f"  scale={performance.alignment.time_scale:.4f}"
                f"  clips={len(found)} (rejected {rejected})"
            )

        entries.extend(source_entries)
        report.append(
            {
                "videoId": source.video_id,
                "creator": source.creator,
                "city": source.city,
                "status": "scanned",
                "durationMs": duration_ms,
                "performances": performance_report,
                "clips": len(source_entries),
            }
        )

    selected = select_clips(
        entries, arguments.angles_per_slot, arguments.max_clips_per_source
    )
    slots = len({int(e["referenceStartMs"]) // 12_000 for e in selected})
    log(
        f"\nVerified excerpts: {len(entries)} -> selected {len(selected)} "
        f"covering {slots} of {int(reference_seconds // EXCERPT_SECONDS) + 1} song slots"
    )
    if arguments.report:
        arguments.report.parent.mkdir(parents=True, exist_ok=True)
        arguments.report.write_text(
            json.dumps(
                {"sources": report, "verified": entries, "selected": selected},
                indent=2,
            )
            + "\n"
        )
        log(f"Report: {arguments.report}")
    rendered = typescript(selected)
    if arguments.typescript:
        arguments.typescript.parent.mkdir(parents=True, exist_ok=True)
        arguments.typescript.write_text(rendered)
        log(f"Sources: {arguments.typescript}")
    else:
        print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
