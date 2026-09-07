import {
  filterGenes,
  geneRegion,
  keptZoomRegion,
  positionLabel,
  stepIndex,
} from "./gene_panel";

const gene = (
  symbol: string,
  start: number,
  end: number,
  chromosome: Chromosome = "1",
): ApiPanelGene => ({ symbol, chromosome, start, end, is_mane: true });

describe("framing a gene", () => {
  test("adds a flank proportional to the gene", () => {
    // A 100 kb gene gets 20 kb either side.
    expect(geneRegion(gene("BIG", 500_001, 600_000), 248_956_422)).toEqual({
      chrom: "1",
      start: 480_001,
      end: 620_000,
    });
  });

  test("gives a tiny gene a usable margin anyway", () => {
    // 20% of 200 bases is 40, which would frame the gene to a sliver and leave
    // no context for reading the coverage either side of it.
    expect(geneRegion(gene("TINY", 10_000, 10_199), 248_956_422)).toEqual({
      chrom: "1",
      start: 8_000,
      end: 12_199,
    });
  });

  test("does not run off the start of the chromosome", () => {
    expect(geneRegion(gene("ATSTART", 100, 300), 248_956_422).start).toBe(1);
  });

  test("does not run off the end of the chromosome", () => {
    expect(
      geneRegion(gene("ATEND", 248_950_000, 248_956_000), 248_956_422).end,
    ).toBe(248_956_422);
  });

  test("still returns a region when the chromosome size is unknown", () => {
    // Sizes are loaded asynchronously; an unknown size must not block a jump.
    // A 1001 bp gene takes the 2000 bp minimum flank, not 20% of itself.
    const region = geneRegion(gene("NOSIZE", 1000, 2000), null);
    expect(region).toEqual({ chrom: "1", start: 1, end: 4000 });
  });
});

describe("stepping through the panel", () => {
  test("the first Next opens the first gene, not the second", () => {
    expect(stepIndex(-1, 5, 1)).toBe(0);
  });

  test("the first Previous opens the last gene", () => {
    expect(stepIndex(-1, 5, -1)).toBe(4);
  });

  test("stops at the ends rather than wrapping", () => {
    // Wrapping back to gene 1 would make a reader believe the panel continued.
    expect(stepIndex(4, 5, 1)).toBe(4);
    expect(stepIndex(0, 5, -1)).toBe(0);
  });

  test("an empty panel has nowhere to step", () => {
    expect(stepIndex(-1, 0, 1)).toBe(-1);
  });
});

describe("filtering", () => {
  const genes = [gene("BRCA1", 1, 2), gene("BRCA2", 3, 4), gene("TP53", 5, 6)];

  test("matches any part of the symbol, ignoring case", () => {
    expect(filterGenes(genes, "brca").map((g) => g.symbol)).toEqual([
      "BRCA1",
      "BRCA2",
    ]);
    expect(filterGenes(genes, "53").map((g) => g.symbol)).toEqual(["TP53"]);
  });

  test("an empty query keeps the whole panel in its genomic order", () => {
    expect(filterGenes(genes, "   ")).toEqual(genes);
  });
});

describe("position label", () => {
  test("counts from one, the way a reader does", () => {
    expect(positionLabel(0, 47)).toBe("1 / 47");
    expect(positionLabel(11, 47)).toBe("12 / 47");
  });

  test("shows no position before anything is selected", () => {
    expect(positionLabel(-1, 47)).toBe("– / 47");
  });

  test("says so when the panel is empty", () => {
    expect(positionLabel(-1, 0)).toBe("0 / 0");
  });
});

/**
 * Walking a panel to compare coverage between genes is a different task from
 * inspecting one gene. Reframing at every step makes the comparison impossible:
 * a dip looks deeper or shallower purely because the neighbouring gene is a
 * different size. These check the window keeps the width it had.
 */
describe("holding the scale while stepping", () => {
  const CHROM_SIZE = 248_956_422;
  const width = (region: Region) => region.end - region.start + 1;

  test("the window keeps its width and the gene lands in the middle", () => {
    const region = keptZoomRegion(
      gene("MYH7", 1_000_001, 1_020_000),
      60_000,
      CHROM_SIZE,
    );

    expect(width(region)).toBe(60_000);
    expect(region.start).toBe(980_001);
    expect(region.end).toBe(1_040_000);
  });

  test("stepping between genes of very different sizes does not change the scale", () => {
    // The whole point. A 5 kb gene and a 2 Mb gene are looked at through the
    // same window, so the two coverage tracks are directly comparable.
    const small = keptZoomRegion(
      gene("SMALL", 1_000_001, 1_005_000),
      60_000,
      CHROM_SIZE,
    );
    const large = keptZoomRegion(
      gene("LARGE", 5_000_001, 7_000_000),
      60_000,
      CHROM_SIZE,
    );

    expect(width(small)).toBe(width(large));
  });

  test("a gene wider than the window shows its middle rather than growing it", () => {
    const region = keptZoomRegion(
      gene("HUGE", 1_000_001, 3_000_000),
      60_000,
      CHROM_SIZE,
    );

    expect(width(region)).toBe(60_000);
    expect(region.start).toBeGreaterThan(1_000_001);
    expect(region.end).toBeLessThan(3_000_000);
  });

  test("a gene at the start of a chromosome keeps the width, off centre", () => {
    // Pushed inwards rather than clipped: clipping would change the scale at
    // exactly the moment the reader is not expecting it to.
    const region = keptZoomRegion(gene("FIRST", 1, 4_000), 60_000, CHROM_SIZE);

    expect(region.start).toBe(1);
    expect(width(region)).toBe(60_000);
  });

  test("a gene at the end of a chromosome keeps the width too", () => {
    const region = keptZoomRegion(
      gene("LAST", CHROM_SIZE - 3_000, CHROM_SIZE),
      60_000,
      CHROM_SIZE,
    );

    expect(region.end).toBe(CHROM_SIZE);
    expect(width(region)).toBe(60_000);
  });

  test("a window wider than the chromosome becomes the whole chromosome", () => {
    const region = keptZoomRegion(
      gene("ANY", 1_000_001, 1_002_000),
      CHROM_SIZE * 2,
      CHROM_SIZE,
    );

    expect(region).toEqual({ chrom: "1", start: 1, end: CHROM_SIZE });
  });

  test("the width is kept when the gene is on another chromosome", () => {
    // Stepping to a gene on a different contig is still stepping; only the
    // contig changes.
    const region = keptZoomRegion(
      gene("OTHER", 5_000_001, 5_010_000, "7"),
      60_000,
      159_345_973,
    );

    expect(region.chrom).toBe("7");
    expect(width(region)).toBe(60_000);
  });

  test("an unknown chromosome size still gives a window of the right width", () => {
    const region = keptZoomRegion(
      gene("NOSIZE", 1_000_001, 1_002_000),
      60_000,
      null,
    );

    expect(width(region)).toBe(60_000);
  });
});
