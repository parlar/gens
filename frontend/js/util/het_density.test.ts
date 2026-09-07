import {
  COVERAGE_SHADE_STOPS,
  coverageShade,
  hetDensityBars,
} from "./het_density";

/**
 * The heterozygote count is ambiguous on its own: a bin empty of heterozygous
 * sites is produced by a heterozygous deletion and by a run of homozygosity
 * alike. Shading each bar by the coverage over the same bin is what separates
 * them, so these check that the shade says what it claims to say.
 */

const Y_RANGE: Rng = [-4, 4];

const bin = (start: number, observed: number, coverage: number | null = 0) => ({
  start,
  end: start + 19999,
  observed,
  coverage,
});

describe("coverage shading", () => {
  test("ordinary coverage and a lost copy are visibly different", () => {
    const ordinary = coverageShade(0);
    const oneCopy = coverageShade(-1);

    expect(ordinary).not.toBeNull();
    expect(oneCopy).not.toBeNull();
    expect(ordinary).not.toBe(oneCopy);
  });

  test("the ramp ends at one lost copy and does not keep going", () => {
    // log2(0.5) = -1 is a single copy. Below that the question is no longer how
    // depleted the bin is, so a deeper value must not read as a different state.
    expect(coverageShade(-1)).toBe(coverageShade(-3));
    expect(coverageShade(-1)).toBe(coverageShade(-40));
  });

  test("a gain is drawn as ordinary, not as its own colour", () => {
    // The shade answers one question: does coverage explain the missing
    // heterozygotes. Extra copies do not, and giving them a colour would invite
    // reading a second story that is not being told.
    expect(coverageShade(0)).toBe(coverageShade(1.5));
  });

  test("ordinary variation stays neutral while a near-lost copy reads red", () => {
    // Bins outside any event on this pedigree sit between -0.14 and -0.28, so a
    // straight ramp would tint the whole track and leave less contrast for the
    // one thing the shading exists to show.
    const towardsRed = (coverage: number) => {
      const channels = (coverageShade(coverage) as string)
        .replace(/[^\d,]/g, "")
        .split(",")
        .map(Number);
      // 136 is the neutral red channel, 204 the depleted one.
      return (channels[0] - 136) / (204 - 136);
    };

    expect(towardsRed(-0.2)).toBeLessThan(0.1);
    expect(towardsRed(-0.9)).toBeGreaterThan(0.7);
  });

  test("part of a copy lands between the two ends", () => {
    const half = coverageShade(-0.5);

    expect(half).not.toBe(coverageShade(0));
    expect(half).not.toBe(coverageShade(-1));
  });

  test("unmeasured coverage is not a colour at all", () => {
    // Null rather than the neutral colour: "coverage is ordinary here" and "no
    // coverage was recorded here" are different statements, and painting them
    // alike would let a gap in the coverage file read as a normal bin.
    expect(coverageShade(null)).toBeNull();
    expect(coverageShade(undefined)).toBeNull();
    expect(coverageShade(Number.NaN)).toBeNull();
  });

  test("the legend names the two ends of the ramp it draws", () => {
    const colors = COVERAGE_SHADE_STOPS.map((stop) => stop.color);

    expect(colors).toContain(coverageShade(-1));
    expect(colors).toContain(coverageShade(0));
    expect(COVERAGE_SHADE_STOPS.map((stop) => stop.label)).toEqual(["-1", "0"]);
  });
});

describe("het density bars", () => {
  test("a bar spans its bin rather than sitting at the midpoint", () => {
    const [bar] = hetDensityBars([bin(20001, 30)], 30, Y_RANGE);

    expect(bar.start).toBe(20001);
    expect(bar.end).toBe(40000);
  });

  test("a typical bin sits on the baseline", () => {
    const [bar] = hetDensityBars([bin(1, 30)], 30, Y_RANGE);

    expect(bar.y).toBe(0);
  });

  test("half the usual count is one below the baseline", () => {
    const [bar] = hetDensityBars([bin(1, 15)], 30, Y_RANGE);

    expect(bar.y).toBeCloseTo(-1);
  });

  test("a bin with no heterozygous sites goes to the floor", () => {
    // Zero has no logarithm, and the drop is unbounded, so the floor of the
    // axis is where it belongs.
    const [bar] = hetDensityBars([bin(1, 0)], 30, Y_RANGE);

    expect(bar.y).toBe(Y_RANGE[0]);
  });

  test("an extreme bin is held inside the axis", () => {
    const [low] = hetDensityBars([bin(1, 1)], 10000, Y_RANGE);
    const [high] = hetDensityBars([bin(1, 10000)], 1, Y_RANGE);

    expect(low.y).toBe(Y_RANGE[0]);
    expect(high.y).toBe(Y_RANGE[1]);
  });

  test("an empty bin over low coverage is shaded, over normal coverage is not", () => {
    // The whole point of the track. Identical counts, opposite readings: the
    // first has lost a copy, the second has not.
    const [deletion] = hetDensityBars([bin(1, 0, -1.1)], 30, Y_RANGE);
    const [homozygosity] = hetDensityBars([bin(1, 0, 0.02)], 30, Y_RANGE);

    expect(deletion.y).toBe(homozygosity.y);
    expect(deletion.color).not.toBe(homozygosity.color);
    expect(deletion.color).toBe(coverageShade(-1));
  });

  test("a bin whose coverage is unknown is drawn hollow, not neutral", () => {
    const [unknown] = hetDensityBars([bin(1, 0, null)], 30, Y_RANGE);
    const [ordinary] = hetDensityBars([bin(1, 0, 0)], 30, Y_RANGE);

    expect(unknown.outlineOnly).toBe(true);
    expect(ordinary.outlineOnly).toBe(false);
  });

  test("every bin gets a bar, including the ordinary ones", () => {
    // A gap in the drawn series would otherwise mean two different things:
    // nothing measured, and nothing unusual.
    const bars = hetDensityBars(
      [bin(1, 30), bin(20001, 0), bin(40001, 31)],
      30,
      Y_RANGE,
    );

    expect(bars).toHaveLength(3);
  });
});
