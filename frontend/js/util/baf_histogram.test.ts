import { buildBafHistogram } from "./baf_histogram";

describe("BAF histogram", () => {
  test("counts interval boundaries and includes BAF 0 and 1", () => {
    const result = buildBafHistogram(
      [
        { pos: 99, value: 0.5 },
        { pos: 100, value: 0 },
        { pos: 110, value: 0.25 },
        { pos: 120, value: 0.5 },
        { pos: 130, value: 0.75 },
        { pos: 200, value: 1 },
        { pos: 201, value: 0.5 },
      ],
      [100, 200],
      4,
    );
    expect(result.bins.map((bin) => bin.count)).toEqual([1, 1, 1, 2]);
    expect(result.siteCount).toBe(5);
    expect(result.excludedCount).toBe(0);
  });

  test("excludes invalid fractions without clipping them into endpoint bins", () => {
    const result = buildBafHistogram(
      [NaN, Infinity, -0.01, 1.01, 0.5].map((value) => ({ pos: 100, value })),
      [100, 100],
    );
    expect(result.siteCount).toBe(1);
    expect(result.excludedCount).toBe(4);
    expect(result.bins.reduce((total, bin) => total + bin.count, 0)).toBe(1);
  });

  test("counts only the requested BAF range", () => {
    const result = buildBafHistogram(
      [0, 0.25, 0.5, 0.75, 1].map((value) => ({ pos: 100, value })),
      [100, 100],
      2,
      [0.25, 0.75],
    );
    expect(result.bins.map((bin) => bin.count)).toEqual([1, 2]);
    expect(result.excludedCount).toBe(2);
  });

  test("returns empty bins for an interval without sites", () => {
    const result = buildBafHistogram([], [100, 200], 20);
    expect(result.bins).toHaveLength(20);
    expect(result.bins.every((bin) => bin.count === 0)).toBe(true);
    expect(result.siteCount).toBe(0);
  });

  test("assigns exact decimal bin edges to the bin starting at that edge", () => {
    const boundaries = buildBafHistogram([], [1, 100], 50).bins;
    const result = buildBafHistogram(
      boundaries.map((bin) => ({ pos: 50, value: bin.start })),
      [1, 100],
      50,
    );
    expect(result.bins.map((bin) => bin.count)).toEqual(Array(50).fill(1));
  });

  test.each([0, -1, 1.5, 201, NaN])("rejects invalid bin count %s", (count) => {
    expect(() => buildBafHistogram([], [1, 100], count)).toThrow();
  });

  test.each<Rng>([
    [0.5, 0.5],
    [0.8, 0.2],
    [-1, 1],
    [0, 2],
    [NaN, 1],
  ])("rejects invalid BAF range %s to %s", (start, end) => {
    expect(() => buildBafHistogram([], [1, 100], 50, [start, end])).toThrow();
  });
});
