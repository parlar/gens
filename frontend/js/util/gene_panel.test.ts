import {
  filterGenes,
  geneRegion,
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
    expect(geneRegion(gene("ATEND", 248_950_000, 248_956_000), 248_956_422).end)
      .toBe(248_956_422);
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
