import { ANNOTATIONS_RESPONSE_CAP, HET_DENSITY_MAX_WINDOW } from "../constants";
import { EVIDENCE_WINDOW } from "../util/read_connections";
import { API } from "./api";
import { getRenderDataSource } from "./data_source";

describe("heterozygote density", () => {
  const sample = { sampleId: "NA12879", caseId: "pedigree", genomeBuild: 38 };
  const getHetDensity = jest.fn();
  const api = { getHetDensity } as unknown as API;

  const sourceOver = (span: number) => {
    const xRange: Rng = [1, 1 + span];
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
      bins: [{ start: 1, end: 20000, observed: 10, coverage: 0.05 }],
      baseline: 10,
      minimum_baseline: 5,
    });
    const source = sourceOver(HET_DENSITY_MAX_WINDOW);
    const data = await source.getHetDensityData(sample, "1");

    expect(getHetDensity).toHaveBeenCalledTimes(1);
    expect(data.shaded).toEqual([]);
    expect(data.bars).toHaveLength(1);
    expect(data.bars[0].y).toBe(0);
    // Bins are drawn to their own width, not as a point at the midpoint.
    expect(data.bars[0].start).toBe(1);
    expect(data.bars[0].end).toBe(20000);
  });

  test("carries the coverage measured over each bin into the drawn bar", async () => {
    // Identical counts, opposite readings: one bin has lost a copy and one has
    // not, and only the coverage says which.
    getHetDensity.mockResolvedValue({
      bins: [
        { start: 1, end: 20000, observed: 0, coverage: -1.05 },
        { start: 20001, end: 40000, observed: 0, coverage: 0.01 },
      ],
      baseline: 10,
      minimum_baseline: 5,
    });
    const source = sourceOver(1_000_000);
    const data = await source.getHetDensityData(sample, "1");

    expect(data.bars[0].y).toBe(data.bars[1].y);
    expect(data.bars[0].color).not.toBe(data.bars[1].color);
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

describe("read connections", () => {
  const sample = { sampleId: "NA12879", caseId: "pedigree", genomeBuild: 38 };
  const getReadEvidence = jest.fn();
  const api = { getReadEvidence } as unknown as API;

  const sourceOver = (span: number) => {
    const xRange: Rng = [1, 1 + span];
    return getRenderDataSource(
      api,
      () => "1",
      () => xRange,
      () => null,
    );
  };

  beforeEach(() => getReadEvidence.mockReset());

  // The route counts the window inclusively, as end - start + 1, and refuses
  // anything above EVIDENCE_WINDOW. These two cases sit either side of that
  // exact boundary; this test used to bless [1, EVIDENCE_WINDOW + 1], which
  // the server rejects with a 422.
  test("does not ask for a window one base above the limit", async () => {
    const source = sourceOver(EVIDENCE_WINDOW);
    const data = await source.getReadConnections(sample, "1", [
      1,
      1 + EVIDENCE_WINDOW,
    ]);

    expect(getReadEvidence).not.toHaveBeenCalled();
    expect(data.connections).toEqual([]);
    expect(data.unavailable).toMatch(/Zoom in/);
  });

  test("asks for a window at the limit", async () => {
    getReadEvidence.mockResolvedValue({
      connections: [],
      truncated: false,
    });
    const source = sourceOver(EVIDENCE_WINDOW - 1);
    const data = await source.getReadConnections(sample, "1", [
      1,
      EVIDENCE_WINDOW,
    ]);

    expect(getReadEvidence).toHaveBeenCalledTimes(1);
    expect(data.unavailable).toBeNull();
  });

  test("tells an unloaded sample apart from an empty window", async () => {
    getReadEvidence.mockResolvedValue(null);
    const source = sourceOver(1000);
    const data = await source.getReadConnections(sample, "1", [1, 1001]);

    expect(data.unavailable).toMatch(/No read connections loaded/);
  });

  test("reports whether a sample has any evidence at all", async () => {
    const source = sourceOver(1000);

    getReadEvidence.mockResolvedValue(null);
    expect(await source.hasReadConnections(sample)).toBe(false);

    getReadEvidence.mockResolvedValue({ connections: [], truncated: false });
    expect(await source.hasReadConnections(sample)).toBe(true);
  });
});

describe("annotations", () => {
  const getAnnotations = jest.fn();
  const api = { getAnnotations } as unknown as API;

  const sourceOver = (span: number) => {
    const xRange: Rng = [1, 1 + span];
    return getRenderDataSource(
      api,
      () => "1",
      () => xRange,
      () => null,
    );
  };

  const record = (start: number) => ({
    record_id: `r${start}`,
    name: "Alu",
    chrom: "1",
    start,
    end: start + 300,
    color: "grey",
    type: "annotation",
  });

  beforeEach(() => getAnnotations.mockReset());

  test("asks only for the region in view", async () => {
    getAnnotations.mockResolvedValue([record(1000)]);
    const source = sourceOver(500_000);
    await source.getAnnotationBands("track1", "1");

    expect(getAnnotations).toHaveBeenCalledWith("track1", "1", [1, 500_001]);
  });

  test("a partial answer says so", async () => {
    // The server stops at a fixed count and does not pick the records nearest
    // the view, so a full response cannot be drawn as though it were complete.
    getAnnotations.mockResolvedValue(
      Array.from({ length: ANNOTATIONS_RESPONSE_CAP }, (_, i) =>
        record(i * 10 + 1),
      ),
    );
    const data = await sourceOver(1000).getAnnotationBands("track1", "1");

    expect(data.incomplete).toMatch(/Zoom in/);
  });

  test("a complete answer says nothing", async () => {
    getAnnotations.mockResolvedValue([record(1000), record(2000)]);
    const data = await sourceOver(1000).getAnnotationBands("track1", "1");

    expect(data.incomplete).toBeNull();
    expect(data.bands).toHaveLength(2);
  });
});
