using Aurio.FFT;
using Aurio.Matching;
using Aurio.Matching.HaitsmaKalker2002;
using Aurio.Project;
using Aurio.Resampler;

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: AurioSpike reference.wav query.wav [query.wav ...]");
    return 2;
}

FFTFactory.Factory = new Aurio.Exocortex.FFTFactory();
ResamplerFactory.Factory = new NAudioWdlResamplerFactory();

var profile = FingerprintGenerator.GetProfiles()[0];
var referenceTrack = new AudioTrack(new FileInfo(Path.GetFullPath(args[0])));
var referencePrints = Generate(profile, referenceTrack);
Console.WriteLine($"reference={referenceTrack.FileInfo.Name};subfingerprints={referencePrints.Count}");

foreach (var queryArgument in args.Skip(1))
{
    var queryTrack = new AudioTrack(new FileInfo(Path.GetFullPath(queryArgument)));
    var queryPrints = Generate(profile, queryTrack);
    var store = new FingerprintStore(profile)
    {
        Threshold = 0.45f,
        FingerprintSize = 256,
    };
    store.Add(referenceTrack, referencePrints, true);
    store.Add(queryTrack, queryPrints, true);
    var matches = store.FindAllMatches()
        .Where(match =>
            (match.Track1 == referenceTrack && match.Track2 == queryTrack)
            || (match.Track2 == referenceTrack && match.Track1 == queryTrack))
        .OrderByDescending(match => match.Similarity)
        .ToList();

    if (matches.Count == 0)
    {
        Console.WriteLine($"query={queryTrack.FileInfo.Name};match=false;subfingerprints={queryPrints.Count}");
        continue;
    }

    Match best = matches[0];
    bool referenceIsFirst = best.Track1 == referenceTrack;
    TimeSpan referenceTime = referenceIsFirst ? best.Track1Time : best.Track2Time;
    TimeSpan queryTime = referenceIsFirst ? best.Track2Time : best.Track1Time;
    double predictedOffset = referenceTime.TotalSeconds - queryTime.TotalSeconds;
    Console.WriteLine(
        $"query={queryTrack.FileInfo.Name};match=true;similarity={best.Similarity:F6};"
        + $"predicted_offset={predictedOffset:F6};reference_time={referenceTime.TotalSeconds:F6};"
        + $"query_time={queryTime.TotalSeconds:F6};matches={matches.Count};"
        + $"subfingerprints={queryPrints.Count}"
    );
}

return 0;

static List<SubFingerprint> Generate(Profile profile, AudioTrack track)
{
    var fingerprints = new List<SubFingerprint>();
    var generator = new FingerprintGenerator(profile, track);
    generator.SubFingerprintsGenerated += (_, eventArgs) =>
        fingerprints.AddRange(eventArgs.SubFingerprints);
    generator.Generate();
    return fingerprints;
}
