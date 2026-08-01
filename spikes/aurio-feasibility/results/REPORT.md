# Aurio Feasibility Screening

Aurio commit `34889caac74a626be31375f76a1ae3f2a2daa80d` built successfully with
.NET 6. The Haitsma–Kalker generator processed the Stevenson full-song reference
and four independent Petrunis 30-second queries.

The same-recording control generated matches, although selecting a single
highest-similarity collision was not a reliable offset estimator. Against the
Stevenson reference, 0/4 Petrunis queries matched. The tested different-performance
query also remained unmatched.

The result screens out Aurio's standalone fingerprint store, not the complete
AudioAlign application. CrowdClip's successful prototype instead retains the
fingerprint sequence and performs an explicit time-scale search.

## Conclusion

**NO-GO:** the Aurio fingerprint store alone does not solve the cross-recording
requirement.
