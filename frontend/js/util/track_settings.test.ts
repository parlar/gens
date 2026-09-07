import { trackChromosome, trackSample, trackSourceId } from "./track_settings";

const settings = (
  overrides: Partial<DataTrackSettings> = {},
): DataTrackSettings => ({
  trackId: "cov-1",
  trackLabel: "Coverage",
  trackType: "dot-cov",
  height: { collapsedHeight: 45 },
  showLabelWhenCollapsed: true,
  isExpanded: false,
  isHidden: false,
  ...overrides,
});

const sample: Sample = {
  sampleId: "NA12878",
  caseId: "pedigree",
  genomeBuild: 38,
} as Sample;

describe("fields a track has because of what kind it is", () => {
  test("hands back the sample a sample track was built with", () => {
    expect(trackSample(settings({ sample })).sampleId).toBe("NA12878");
  });

  test("hands back the source and the chromosome", () => {
    const chromTrack = settings({ sourceId: "annot-3", chromosome: "7" });
    expect(trackSourceId(chromTrack)).toBe("annot-3");
    expect(trackChromosome(chromTrack)).toBe("7");
  });

  test.each([
    ["sample", trackSample],
    ["source id", trackSourceId],
    ["chromosome", trackChromosome],
  ])("names the track and the missing %s", (field, read) => {
    // The failure a reader can act on: which track, and what it lacks. The
    // alternative is a null dereference several frames from the mistake.
    expect(() => read(settings())).toThrow(/dot-cov track 'cov-1'/);
    expect(() => read(settings())).toThrow(new RegExp(field));
  });
});
