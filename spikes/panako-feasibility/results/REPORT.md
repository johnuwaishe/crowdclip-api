# Panako Feasibility Screening

Panako was built from official commit
`e4b0e1dbb55e340bc66c90bac0ceb82b2cf84211` with Java 17 and an isolated LMDB.
No source changes were made.

The same-recording sanity check matched. Against the independent Stevenson
reference, however, 0/16 clean Petrunis clips from 5 through 30 seconds matched.
All 12 tested 10-, 15-, and 30-second different-performance controls also
remained unmatched. A prior Moore-reference screen and relaxed full-song query
also produced no cross-recording match.

This is enough to reject Panako for the current fixture before spending time on
the full degradation matrix. Its sparse fingerprint lookup still requires more
shared landmark hashes than these independent audience captures provide.

The next experiment moved to explicit fingerprint-sequence alignment and is
recorded under `spikes/concert-alignment-feasibility/`.

## Conclusion

**NO-GO:** Panako does not solve CrowdClip's cross-recording requirement on this
fixture corpus.
