# Concert Alignment Feasibility Report

## Outcome

This experiment uses the independent Jeff Stevenson audience tape as the full-song
reference and Rich Petrunis clips as simulated fan queries. The recordings are
independent: Petrunis used a mono Sony handheld recorder, while Stevenson used
handheld Shure 57 microphones about ten feet from the stage.

The algorithm follows the core representation used by Concert Stitch: 32-bit
Haitsma–Kalker-style fingerprints at 5 kHz. It searches reference offsets across
0.92–1.08 time-scale factors, which handles analogue recorder drift. A result is
accepted only when fingerprint similarity, peak separation, and time scale all
pass the recorded gate. Similarity is a fraction of agreeing fingerprint bits;
it is not a calibrated probability.

## Results

| Test | Matches | Rate |
| --- | ---: | ---: |
| Same-recording clean | 16/16 | 100.0% |
| Same concert, independent recording, clean | 16/16 | 100.0% |
| Same concert, independent recording, degraded | 63/64 | 98.4% |
| Different performance, all variants | 0/80 | 0.0% |
| MP4 round trip, independent recording | 4/4 | 100.0% |

### Clean independent recording by duration

| Duration | Matches | Rate |
| --- | ---: | ---: |
| 5s | 4/4 | 100.0% |
| 10s | 4/4 | 100.0% |
| 15s | 4/4 | 100.0% |
| 30s | 4/4 | 100.0% |

### Independent recording by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
| clean | 16/16 | 100.0% |
| aac64 | 15/16 | 93.8% |
| phone_filter | 16/16 | 100.0% |
| low_level | 16/16 | 100.0% |
| combined | 16/16 | 100.0% |

## Offset evidence

For successful Petrunis 10-, 15-, and 30-second queries, the relative offset
comparison count is 60. Of those,
100.0% are within two seconds. Median absolute relative error is 0.0992 seconds
and maximum is 0.5984 seconds.

## What changed from audfprint

`audfprint` and Panako use sparse database hash lookups. This method retains a
time sequence of robust 32-bit fingerprints and explicitly searches small
time-scale changes. That makes analogue drift part of the alignment instead of
requiring hashes from two recorders to be identical at exactly the same timing.

Reference choice matters. The earlier Moore reference did not produce a strong
cross-recording result. Stevenson versus Petrunis did. CrowdClip should therefore
require exact-show reference audio and validate its compatibility before enabling
automatic recognition for an event. An official board or multitrack-derived feed
is a better candidate than an arbitrary audience tape, but that still needs a
real modern-phone validation set.

## Limitations

- The match gate was selected from this feasibility corpus and needs validation
  on unseen concerts before production.
- The affine time-scale search handles steady recorder drift; a piecewise warp
  would be needed for rapidly changing drift over long clips.
- The implementation is a transparent feasibility prototype, not a scalable
  catalogue index.
- The Haitsma–Kalker family has historical patent warnings in Panako and Aurio;
  legal review is required before commercial use.
- No NestJS, database, or worker integration is included.

## References

- [Concert Stitch paper](https://musicinformatics.gatech.edu/wp-content_nondefault/uploads/2018/06/Subramanian-and-Lerch-Concert-Stitch-Organization-and-Synchromization-o.pdf)
- [Haitsma and Kalker, 2002](https://www.ismir2002.ismir.net/proceedings/02-FP04-2.pdf)
- [Panako](https://github.com/JorenSix/Panako)
- [Aurio](https://github.com/protyposis/Aurio)

## Conclusion

**GO:**  
The Concert Stitch-style fingerprint alignment is viable when the event reference is a sufficiently compatible recording of the exact performance.
