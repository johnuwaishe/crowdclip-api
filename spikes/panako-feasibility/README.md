# Panako Screening Spike

This sibling spike screens [Panako](https://github.com/JorenSix/Panako) against
the preserved Cornell fixtures. It does not modify the CrowdClip application or
the earlier audfprint spike.

Panako was selected because it explicitly handles pitch and time-scale changes
and returns reference offsets. The official source is pinned locally at commit
`e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211` inside the ignored `.vendor/`
directory.

## Dependencies and build

The recorded run used Java 17, FFmpeg 8.1.2, and LMDB 0.9.35:

```bash
brew install ffmpeg lmdb
git clone https://github.com/JorenSix/Panako.git .vendor/Panako
git -C .vendor/Panako checkout e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211
./.vendor/Panako/gradlew -p .vendor/Panako shadowJar
```

On Apple Silicon, Panako needs both:

```text
-Djava.library.path=/opt/homebrew/lib
--add-opens=java.base/java.nio=ALL-UNNAMED
```

The first option exposes Homebrew's `liblmdb`; the second is required by
LMDBJava on current Java runtimes. No Panako source was patched.

## Result

Panako successfully stored and matched same-recording controls. It did not
accept any Petrunis 5-, 10-, 15-, or 30-second clean query against the independent
Stevenson reference. It also rejected the different-performance controls.

The query logs showed a small number of raw hash collisions, but not enough
temporally consistent hits to satisfy Panako's match rules. Relaxing minimum hit
and duration settings and querying full songs against the Moore reference also
produced no accepted cross-recording match.

The more compatible Stevenson reference therefore did not rescue Panako. The
Concert Alignment spike is the successful next step because it compares the
entire fingerprint sequence across explicit time-scale hypotheses.

See `results/REPORT.md` for the screening decision.

## Licensing

Panako is AGPL-3.0 and its README warns that some implemented fingerprinting
techniques may be covered by patents. This spike is research only; production
use would require legal review.
