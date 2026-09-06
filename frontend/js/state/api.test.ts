import { get } from "../util/fetch";
import { API } from "./api";

jest.mock("../util/fetch", () => ({ get: jest.fn() }));

describe("BAF histogram requests", () => {
  const api = new API(38, "https://example.org/gens/api/");
  const sample = { sampleId: "sample&A", caseId: "case", genomeBuild: 38 };
  const region: Region = { chrom: "1", start: 100, end: 200 };
  const mockGet = get as jest.Mock;

  beforeEach(() => mockGet.mockReset());

  test("requests only resolution d and includes the leftmost BED site", async () => {
    mockGet.mockResolvedValue({
      position: [99, 100, 150, 200, 201],
      value: [0, 0.3, 0.5, 0.7, 1],
      zoom: "d",
    });
    const signal = new AbortController().signal;
    await expect(
      api.getBafHistogramData(sample, region, signal),
    ).resolves.toEqual([
      { pos: 100, value: 0.3 },
      { pos: 150, value: 0.5 },
      { pos: 200, value: 0.7 },
    ]);
    expect(mockGet).toHaveBeenCalledWith(
      "https://example.org/gens/api/samples/sample/baf",
      {
        sample_id: "sample&A",
        case_id: "case",
        genome_build: 38,
        chromosome: "1",
        zoom_level: "d",
        start: 99,
        end: 200,
      },
      signal,
    );
  });

  test("accepts an empty interval response", async () => {
    mockGet.mockResolvedValue({ position: [], value: [], zoom: null });
    await expect(api.getBafHistogramData(sample, region)).resolves.toEqual([]);
  });

  test.each([
    null,
    { position: [100], value: [0.5], zoom: "a" },
    { position: [100], value: [], zoom: "d" },
  ])(
    "rejects missing, downsampled or mismatched data: %p",
    async (response) => {
      mockGet.mockResolvedValue(response);
      await expect(api.getBafHistogramData(sample, region)).rejects.toThrow(
        "Full-resolution BAF data is unavailable",
      );
    },
  );

  test("rejects inverted intervals without fetching", async () => {
    await expect(
      api.getBafHistogramData(sample, { chrom: "1", start: 200, end: 100 }),
    ).rejects.toThrow("Invalid BAF histogram interval");
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("requests compact evidence with inclusive coordinates and no file path", async () => {
    mockGet.mockResolvedValue(null);
    const signal = new AbortController().signal;
    const filters = { kind: "pair" as const, minimum_mapq: 20, minimum_fragments: 3 };
    await expect(api.getReadEvidence(sample, region, filters, signal)).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledWith(
      "https://example.org/gens/api/samples/sample/read-evidence",
      {
        sample_id: "sample&A", case_id: "case", genome_build: 38,
        chromosome: "1", start: 100, end: 200, ...filters,
      },
      signal,
    );
  });
});

describe("gene panel requests", () => {
  const api = new API(38, "https://example.org/gens/api/");
  const mockGet = get as jest.Mock;

  beforeEach(() => mockGet.mockReset());

  test("keeps the trailing slash on the gene list collection", async () => {
    // The route is declared as "/gene_lists/". Without the slash the server
    // answers 404, which this client turns into null, and the panel selector
    // silently comes up empty.
    mockGet.mockResolvedValue([]);
    await api.getGeneLists();
    expect(mockGet).toHaveBeenCalledWith(
      "https://example.org/gens/api/gene_lists/",
      {},
    );
  });

  test("pins the panel version so the gene set cannot drift", async () => {
    mockGet.mockResolvedValue({ genes: [], missing: [] });
    const signal = new AbortController().signal;
    await api.getPanelGenes("cardio panel", "2.0", signal);
    expect(mockGet).toHaveBeenCalledWith(
      "https://example.org/gens/api/gene_lists/cardio%20panel/genes",
      { genome_build: 38, version: "2.0" },
      signal,
    );
  });
});
