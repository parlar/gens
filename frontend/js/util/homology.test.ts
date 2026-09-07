import {
  connectionReachesPartner,
  formatPartner,
  homologyBands,
  identityShade,
  shortLocus,
} from "./homology";

/**
 * The case these were written against, measured on the reference pedigree.
 *
 * NA12879 carries a 48 kb deletion at chr11:49,688,000-49,736,000. It sits
 * inside a 326 kb segmental duplication that is 97.0% identical to
 * chr11:88,842,207-89,159,225 and inverted, and thirteen fragments at the
 * deletion's right breakpoint reach 88,891,067 -- inside that partner. Reading
 * that out of the catalogue and the connections by hand is what this replaces.
 */

const SEGDUP: ApiHomologyPair = {
  chrom: "11",
  start: 49465498,
  end: 49791730,
  partner_chrom: "11",
  partner_start: 88842207,
  partner_end: 89159225,
  identity: 0.970197,
  orientation: "inverted",
  aligned_bases: 305405,
};

const connection = (
  firstStart: number,
  secondStart: number,
  firstChrom = "11",
  secondChrom = "11",
): RenderConnection => ({
  id: "SV_232_1-4",
  kind: "pair",
  first: {
    chromosome: firstChrom,
    start: firstStart,
    end: firstStart + 400,
    strand: "+",
  },
  second: {
    chromosome: secondChrom,
    start: secondStart,
    end: secondStart + 400,
    strand: "+",
  },
  fragments: 13,
  minimum_observed_mapq: null,
});

describe("reads pointing into a homologous partner", () => {
  test("the real case is recognised", () => {
    expect(
      connectionReachesPartner(connection(49737453, 88891067), SEGDUP),
    ).toBe(true);
  });

  test("it does not matter which end of the connection is the far one", () => {
    // A connection is stored from whichever side the reader navigated to; the
    // two orderings are the same observation.
    expect(
      connectionReachesPartner(connection(88891067, 49737453), SEGDUP),
    ).toBe(true);
  });

  test("a connection reaching somewhere else is not counted", () => {
    // The chr1 split read that also sits in this window points at 114 Mb on
    // another chromosome and explains nothing about this pair.
    expect(
      connectionReachesPartner(
        connection(49695575, 114143113, "11", "1"),
        SEGDUP,
      ),
    ).toBe(false);
  });

  test("the same coordinate on another chromosome is not counted", () => {
    expect(
      connectionReachesPartner(
        connection(49737453, 88891067, "11", "7"),
        SEGDUP,
      ),
    ).toBe(false);
  });

  test("a connection landing just outside the partner is not counted", () => {
    expect(
      connectionReachesPartner(connection(49737453, 89159226), SEGDUP),
    ).toBe(false);
    expect(
      connectionReachesPartner(connection(49737453, 89159225), SEGDUP),
    ).toBe(true);
  });

  test("the deletion's own two breakpoints do not count as reaching it", () => {
    // Both ends sit in the pair itself, 39 Mb away from the partner. Counting
    // that would mark every pair in a busy region.
    expect(
      connectionReachesPartner(connection(49687774, 49736164), SEGDUP),
    ).toBe(false);
  });
});

describe("percent identity as a colour", () => {
  test("a near-identical pair is stronger than a barely catalogued one", () => {
    expect(identityShade(0.999)).not.toBe(identityShade(0.9));
  });

  test("the ramp starts where the catalogue does", () => {
    // Spreading it from zero would put every entry in the top tenth of the
    // scale and waste the range on a distinction the catalogue never makes.
    expect(identityShade(0.9)).toBe(identityShade(0.5));
    expect(identityShade(0.9)).toBe(identityShade(0));
  });

  test("identity is never drawn past full", () => {
    expect(identityShade(1)).toBe(identityShade(1.4));
  });
});

describe("the bands the track draws", () => {
  test("a pair the reads reach is marked, and says so", () => {
    const [band] = homologyBands([SEGDUP], [connection(49737453, 88891067)]);

    expect(band.reachedByReads).toBe(true);
    expect(band.label).toContain("97.0%");
    expect(band.label).toContain("inverted");
    expect(band.label).toContain("reads point here");
    expect(band.edgeWidth).toBeGreaterThan(0);
  });

  test("a pair the reads do not reach is still shown, without the mark", () => {
    // Homology with no discordant evidence is still worth knowing: it says the
    // region is repetitive, which bears on how much the coverage can be
    // trusted.
    const [band] = homologyBands([SEGDUP], []);

    expect(band.reachedByReads).toBe(false);
    expect(band.label).not.toContain("reads point here");
    expect(band.edgeColor).toBeUndefined();
  });

  test("a band spans the pair, not the view", () => {
    const [band] = homologyBands([SEGDUP], []);

    expect(band.start).toBe(49465498);
    expect(band.end).toBe(49791730);
  });

  test("the hover text carries the partner in a form that can be pasted", () => {
    const [band] = homologyBands([SEGDUP], []);

    expect(band.hoverInfo).toContain("11:88842207-89159225");
    expect(formatPartner(SEGDUP)).toBe("11:88842207-89159225");
  });

  test("two pairs at the same start get distinct ids", () => {
    // A region routinely carries several catalogue entries beginning together
    // and differing only in where they point.
    const other = { ...SEGDUP, partner_start: 55268268, partner_end: 55309042 };
    const bands = homologyBands([SEGDUP, other], []);

    expect(bands[0].id).not.toBe(bands[1].id);
  });
});

describe("the partner locus on a band label", () => {
  test("a megabase-scale partner keeps a decimal", () => {
    // A partner is somewhere to navigate to. Rounding to the nearest megabase
    // names a stretch of chromosome a million bases wide.
    expect(shortLocus("11", 88842207)).toBe("11:88.8 Mb");
  });

  test("a partner near the start of a chromosome is given in kb", () => {
    expect(shortLocus("1", 87112)).toBe("1:87 kb");
  });

  test("the band label uses it", () => {
    const [band] = homologyBands([SEGDUP], []);

    expect(band.label).toContain("11:88.8 Mb");
  });
});
