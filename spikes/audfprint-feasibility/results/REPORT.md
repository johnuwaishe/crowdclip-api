# audfprint Feasibility Report

## Experiment

The reference is Jerry Moore's audience recording of “Brown Eyed Women” from
Barton Hall on 8 May 1977. Queries include clips from that file, independent
audience recordings of the same performance when downloadable, a different
performance of the same song from 22 May 1977, phone-style transformations, and
eight generated MP4 round trips split between same-file controls and the main
independent recording.

The experiment ran 328 queries against audfprint commit
`cb03ba99feafd41b8874307f0f4e808a6ce34362`. All fingerprint input was mono 16-bit PCM WAV at
11,025 Hz, audfprint's documented default sample rate.

`audfprint_score` is the number of consistently time-aligned landmark hashes. It
is not a normalized probability. The official documentation says that more than
five or six consistently timed hashes generally indicates a true match. The
reported clip offset is derived by subtracting the matching span's query start
from its reference start.

## Results

| Test | Matches | Rate |
| --- | ---: | ---: |
| Same-file clean baseline | 16/16 | 100.0% |
| Same concert, different recording, clean | 0/32 | 0.0% |
| Same concert, different recording, degraded | 0/128 | 0.0% |
| Different performance, clean negative control | 0/16 | 0.0% |
| Generated MP4 extraction, same recording | 4/4 | 100.0% |
| Generated MP4 extraction, cross recording | 0/4 | 0.0% |

### Clean cross-recording results by duration

| Duration | Matches | Rate |
| --- | ---: | ---: |
| 5 seconds | 0/8 | 0.0% |
| 10 seconds | 0/8 | 0.0% |
| 15 seconds | 0/8 | 0.0% |
| 30 seconds | 0/8 | 0.0% |

### Cross-recording results by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
| aac64 | 0/32 | 0.0% |
| clean | 0/32 | 0.0% |
| combined | 0/32 | 0.0% |
| low_level | 0/32 | 0.0% |
| phone_filter | 0/32 | 0.0% |

### Same-recording results by transformation

| Transformation | Matches | Rate |
| --- | ---: | ---: |
| clean | 16/16 | 100.0% |
| aac64 | 16/16 | 100.0% |
| phone_filter | 16/16 | 100.0% |
| low_level | 16/16 | 100.0% |
| combined | 16/16 | 100.0% |

## Questions answered

1. **Did the same-file baseline work?** 100.0% of
   clean same-file queries matched.
2. **Did a different recording of the exact concert match?**
   0.0% of clean cross-recording queries matched.
3. **What was the shortest reliable clip length?**
   No tested duration met the 80% clean cross-recording threshold.
4. **How did compression and filtering affect results?** See the transformation
   tables above. Digitally transformed same-recording queries all remained
   matchable; the combined cross-recording 15- and 30-second product threshold
   was 0.0%.
5. **Were returned offsets consistent?**
   No cross-recording query matched, so no independent-recording offset could be evaluated. Same-file offsets are reported separately in results.csv as an implementation sanity check.
   For the same-file clean control, the median and maximum absolute offset
   errors were 0.0 and
   0.0 seconds across
   16 matches.
6. **Did the different performance match?** 0 of
   16 clean negative-control queries produced a match.
7. **Can audfprint be used with exact concert recordings?** Not across the three
   audience tapes tested here: the Moore reference matched neither independent
   Cornell recording at any tested duration or degradation level.
8. **Can it be used with backing tracks?** The 100% same-file degraded result
   shows that derivatives of an identical digital signal remain matchable. It
   does not simulate a backing track played through a PA and re-recorded by a
   phone, so this spike does not establish that use case.
9. **Would studio masters match live-band performances?** There is no evidence
   here that they would. The different-performance control also shows that the
   shared composition alone was insufficient to produce a match.
10. **Should CrowdClip proceed?** Not with audfprint as the proposed
    cross-device live-performance recognizer. A separate spike using an exact
    backing track played acoustically could evaluate that narrower use case.

## Relative offset method

Track boundaries differ between audience recordings, so absolute offsets are not
treated as ground truth. Within each source, transformation, and duration, the
earliest successful query is an anchor. The experiment compares the difference
between later extraction positions with the difference between their predicted
reference offsets. Signed per-query errors are in `results.csv`.

## Limitations

- The Grateful Dead fixtures are audience tapes, not modern smartphone files.
- Phone processing is simulated with AAC, band limiting, and attenuation.
- The transformations are digital; they do not reproduce speaker, room, or
  microphone effects.
- A successful exact-show result does not imply composition-level or cover-song
  recognition.
- `audfprint_score` depends on clip duration and available landmarks and must not
  be exposed as a percentage confidence.

## References

- [Official audfprint repository](https://github.com/dpwe/audfprint)
- [Official audfprint usage and score explanation](https://github.com/dpwe/audfprint/blob/master/README.md)
- [Internet Archive metadata API](https://archive.org/developers/metadata-schema/)

## Conclusion

**NO-GO:**  
cross-device matching is not reliable enough for CrowdClip.
