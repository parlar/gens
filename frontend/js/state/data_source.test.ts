import { HET_DENSITY_MAX_WINDOW } from "../constants";
import { API } from "./api";
import { getRenderDataSource } from "./data_source";

describe("heterozygote density", () => {
  const sample = { sampleId: "NA12879", caseId: "pedigree", genomeBuild: 38 };
  const getHetDensity = jest.fn();
  const api = { getHetDensity } as unknown as API;

  const sourceOver = (span: number) => {
    let xRange: Rng = [1, 1 + span];
    return getRenderDataSource(
      api,
      () => "1",
      () => xRange,
      () => null,
    );
  };

  beforeEach(() => getHetDensity.mockReset());

  test("does not ask for a region the endpoint refuses", async () => {
    // A whole chromosome is wider than the limit and is the view the user
    // lands on, so asking here would fail every first look at the track.
    const source = sourceOver(HET_DENSITY_MAX_WINDOW + 1);
    const data = await source.getHetDensityData(sample, "1");

    expect(getHetDensity).not.toHaveBeenCalled();
    expect(data.dots).toEqual([]);
    expect(data.shaded).toHaveLength(1);
    expect(data.shaded[0].label).toMatch(/Zoom in/);
  });

  test("asks for a region at the limit", async () => {
    // The boundary is servable, so withholding it would hide a usable view.
    getHetDensity.mockResolvedValue({
      bins: [{ start: 1, end: 20000, observed: 10 }],
      baseline: 10,
      minimum_baseline: 5,
    });
    const source = sourceOver(HET_DENSITY_MAX_WINDOW);
    const data = await source.getHetDensityData(sample, "1");

    expect(getHetDensity).toHaveBeenCalledTimes(1);
    expect(data.shaded).toEqual([]);
    expect(data.dots).toHaveLength(1);
    expect(data.dots[0].y).toBe(0);
  });

  test("says so when the chromosome cannot support a scale", async () => {
    getHetDensity.mockResolvedValue({
      bins: [{ start: 1, end: 20000, observed: 1 }],
      baseline: 2,
      minimum_baseline: 5,
    });
    const source = sourceOver(1_000_000);
    const data = await source.getHetDensityData(sample, "1");

    expect(data.dots).toEqual([]);
    expect(data.shaded[0].label).toMatch(/Too few heterozygous sites/);
  });
});
