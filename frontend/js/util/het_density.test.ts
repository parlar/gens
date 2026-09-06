import { buildHetDensity, poissonAtMost } from "./het_density";

const BIN = 1000;
// Ten whole bins on the absolute grid: [0,1000) ... [9000,10000).
const REGION: Rng = [0, 9999];

/** `perBin` sites inside each of the ten bins covering REGION. */
function evenSites(perBin: number) {
  const sites: ApiCoverageDot[] = [];
  for (let bin = 0; bin < 10; bin += 1) {
    for (let i = 0; i < perBin; i += 1) {
      sites.push({ pos: bin * BIN + ((i + 0.5) * BIN) / perBin, value: 0.5 });
    }
  }
  return sites;
}

describe("poissonAtMost", () => {
  it("returns 1 when nothing is expected", () => {
    expect(poissonAtMost(0, 0)).toBe(1);
  });

  it("matches exp(-lambda) for observing zero", () => {
    expect(poissonAtMost(0, 5)).toBeCloseTo(Math.exp(-5), 12);
    expect(poissonAtMost(0, 45)).toBeCloseTo(Math.exp(-45), 25);
  });

  it("approaches 1 when the observation matches the expectation", () => {
    expect(poissonAtMost(20, 20)).toBeGreaterThan(0.4);
    expect(poissonAtMost(20, 20)).toBeLessThan(0.7);
  });

  it("stays finite at a large expectation where a naive product underflows", () => {
    // exp(-800) is 0 in double precision; the log-space sum must still work.
    const p = poissonAtMost(800, 800);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.6);
  });

  it("rejects nonsense input", () => {
    expect(Number.isNaN(poissonAtMost(-1, 5))).toBe(true);
    expect(Number.isNaN(poissonAtMost(5, NaN))).toBe(true);
  });
});

describe("buildHetDensity", () => {
  it("reports a flat region as at baseline with ratio near 1", () => {
    const result = buildHetDensity(evenSites(10), REGION, { binSize: BIN });
    expect(result.bins).toHaveLength(10);
    expect(result.baseline).toBe(10);
    expect(result.noBaseline).toBe(false);
    expect(result.siteCount).toBe(100);
    for (const bin of result.bins) {
      expect(bin.state).toBe("informative");
      expect(bin.ratio).toBeCloseTo(1, 10);
    }
  });

  it("puts bins on the absolute grid so panning does not move them", () => {
    // Two overlapping views must agree on the bin covering 4000-5000.
    const sites = evenSites(20);
    const wide = buildHetDensity(sites, [0, 9999], { binSize: BIN });
    const narrow = buildHetDensity(sites, [3500, 6500], { binSize: BIN });

    const from = (r: typeof wide) => r.bins.find((b) => b.start === 4000);
    expect(from(narrow)).toBeDefined();
    expect(from(narrow)!.end).toBe(5000);
    expect(from(narrow)!.observed).toBe(from(wide)!.observed);
  });

  it("flags a depleted bin without dragging down the baseline", () => {
    // Nine normal bins and one empty: a heterozygous deletion in one bin.
    const sites = evenSites(20).filter(
      (site) => site.pos < 4000 || site.pos >= 5000,
    );
    const result = buildHetDensity(sites, REGION, { binSize: BIN });

    expect(result.baseline).toBe(20);
    const empty = result.bins[4];
    expect(empty.start).toBe(4000);
    expect(empty.observed).toBe(0);
    expect(empty.state).toBe("informative");
    expect(empty.ratio).toBe(0);
    // exp(-20); decisive rather than merely suggestive.
    expect(empty.depletionP).toBeLessThan(1e-8);

    for (const bin of result.bins.filter((_, index) => index !== 4)) {
      expect(bin.ratio).toBeCloseTo(1, 10);
    }
  });

  it("never calls an unmappable view depleted", () => {
    // The failure mode found in the oracle-bin run: six of seven truth deletion
    // intervals had near-zero callable sites in every sample. With no baseline
    // these must be uninformative, not six deletions.
    const result = buildHetDensity([], REGION, { binSize: BIN });

    expect(result.noBaseline).toBe(true);
    expect(result.baseline).toBe(0);
    for (const bin of result.bins) {
      expect(bin.state).toBe("no-baseline");
      expect(bin.ratio).toBeNull();
      expect(bin.expected).toBeNull();
      expect(bin.depletionP).toBeNull();
    }
  });

  it("treats male chrX outside PAR and chrY as absent, not deleted", () => {
    const stray: ApiCoverageDot[] = [
      { pos: 500, value: 0.5 },
      { pos: 7200, value: 0.5 },
    ];
    const result = buildHetDensity(stray, REGION, { binSize: BIN });

    expect(result.noBaseline).toBe(true);
    expect(result.bins.every((bin) => bin.state === "no-baseline")).toBe(true);
  });

  it("withholds a verdict when too few sites are expected", () => {
    // Baseline of 3 per bin: an empty bin occurs by chance about 5 percent of
    // the time, which is not evidence of a missing haplotype. This is also why
    // the default bin is 20 kb: too narrow a bin makes every bin uninformative
    // and the track draws nothing at all.
    const result = buildHetDensity(evenSites(3), REGION, {
      binSize: BIN,
      minExpected: 5,
    });

    expect(result.baseline).toBe(3);
    expect(result.noBaseline).toBe(false);
    for (const bin of result.bins) {
      expect(bin.state).toBe("uninformative");
      expect(bin.ratio).toBeNull();
      expect(bin.expected).toBe(3);
    }
  });

  it("excludes sites outside the region and non-finite positions", () => {
    const result = buildHetDensity(
      [
        { pos: -50, value: 0.5 },
        { pos: 99999, value: 0.5 },
        { pos: NaN, value: 0.5 },
        ...evenSites(6),
      ],
      REGION,
      { binSize: BIN, minExpected: 1 },
    );
    expect(result.excludedCount).toBe(3);
    expect(result.siteCount).toBe(60);
  });

  it("counts only sites inside the heterozygous BAF band", () => {
    // The stored BAF track holds homozygous sites too. Counting them hides a
    // deletion: this is the real shape of the chr1 truth event, where the
    // carrier keeps 138 stored sites inside the deletion but only 5 are het.
    const homozygous: ApiCoverageDot[] = Array.from(
      { length: 133 },
      (_, i) => ({ pos: 4000 + (i % 1000), value: i % 2 === 0 ? 0.02 : 0.98 }),
    );
    const het = evenSites(20).filter(
      (site) => site.pos < 4000 || site.pos >= 5000,
    );
    const result = buildHetDensity([...het, ...homozygous], REGION, {
      binSize: BIN,
    });

    expect(result.homozygousCount).toBe(133);
    expect(result.baseline).toBe(20);
    const empty = result.bins[4];
    expect(empty.observed).toBe(0);
    expect(empty.ratio).toBe(0);
    expect(empty.depletionP).toBeLessThan(1e-8);
  });

  it("keeps the 1/3 and 2/3 fractions of a three-copy state", () => {
    const dup: ApiCoverageDot[] = Array.from({ length: 20 }, (_, i) => ({
      pos: 100 + i * 40,
      value: i % 2 === 0 ? 1 / 3 : 2 / 3,
    }));
    const result = buildHetDensity(dup, [0, 999], { binSize: BIN });
    expect(result.homozygousCount).toBe(0);
    expect(result.bins[0].observed).toBe(20);
  });

  it("rejects an invalid heterozygous band", () => {
    expect(() =>
      buildHetDensity([], REGION, { hetRange: [0.9, 0.1] }),
    ).toThrow();
    expect(() =>
      buildHetDensity([], REGION, { hetRange: [-0.1, 0.8] }),
    ).toThrow();
  });

  it("rejects an invalid region or bin size", () => {
    expect(() => buildHetDensity([], [10, 10], {})).toThrow();
    expect(() => buildHetDensity([], REGION, { binSize: 0 })).toThrow();
    expect(() => buildHetDensity([], REGION, { binSize: -5 })).toThrow();
    expect(() => buildHetDensity([], REGION, { minExpected: 0 })).toThrow();
    expect(() => buildHetDensity([], [NaN, 100], {})).toThrow();
  });
});
