# Aurio Screening Spike

This spike tests the maintained Aurio Haitsma–Kalker fingerprint store, the
engine used by AudioAlign. The official source is pinned at commit
`34889caac74a626be31375f76a1ae3f2a2daa80d` in the ignored `.vendor/` directory.

The console wrapper uses only PCM WAV input and Aurio's managed FFT/resampler
path. Build and run it with the already-installed .NET 6 SDK:

```bash
dotnet build --configuration Release
dotnet run --configuration Release --no-build -- \
  ../audfprint-feasibility/fixtures/queries/stevenson_full_source.wav \
  ../audfprint-feasibility/fixtures/queries/petrunis_30s_at_60s_clean.wav
```

Aurio generated fingerprints successfully, but its default collision-seeded
matcher returned no match for any of the four 30-second Petrunis clips against
the independent Stevenson reference. The different-performance control also
remained unmatched.

This does not invalidate AudioAlign's larger synchronization pipeline, which
adds drift analysis and time warping around fingerprint correspondences. It does
show that the drop-in fingerprint store alone is insufficient for CrowdClip.

Aurio is AGPL-3.0 and warns about patents covering several fingerprinting
methods. Its maintainers indicate alternative commercial arrangements may be
available. Production use would require a legal and licensing decision.
