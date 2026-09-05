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
});
