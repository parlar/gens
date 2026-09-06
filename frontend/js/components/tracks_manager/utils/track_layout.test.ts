import { getPortableId } from "./track_layout";

const sample = {
  sampleId: "sample1",
  caseId: "case1",
  genomeBuild: 38,
  sampleType: "proband",
} as Sample;

function settings(
  trackType: TrackType,
  overrides: Partial<DataTrackSettings> = {},
): DataTrackSettings {
  return {
    trackId: `sample1_${trackType}`,
    trackLabel: "label",
    trackType,
    sample,
    height: { collapsedHeight: 20 },
    isExpanded: true,
    isHidden: false,
    ...overrides,
  } as DataTrackSettings;
}

describe("getPortableId", () => {
  it("maps the heterozygote density track to a stable saved-layout id", () => {
    // Every sample track type must be mapped here. An unmapped one throws, so
    // adding a sample track without updating this function breaks loading any
    // saved layout for that sample rather than merely omitting the new track.
    expect(getPortableId(settings("dot-hetdensity"))).toBe(
      "het_density|proband|",
    );
  });

  it("leaves the existing sample track ids unchanged", () => {
    expect(getPortableId(settings("dot-cov"))).toBe("log2_cov|proband|");
    expect(getPortableId(settings("dot-baf"))).toBe("baf|proband|");
    expect(getPortableId(settings("variant"))).toBe("variants|proband|");
  });

  it("gives each sample track type a distinct id", () => {
    const ids = (
      ["dot-cov", "dot-baf", "dot-hetdensity", "variant"] as TrackType[]
    ).map((type) => getPortableId(settings(type)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("still rejects a sample track type it does not know", () => {
    expect(() => getPortableId(settings("gene"))).toThrow();
  });
});
