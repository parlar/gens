import { CHROMOSOMES, isChromosome } from "../constants";

describe("recognising a chromosome", () => {
  test("accepts every chromosome in the build", () => {
    for (const chrom of CHROMOSOMES) {
      expect(isChromosome(chrom)).toBe(true);
    }
  });

  test.each(["banana", "chr1", "1.5", "", "0", "23"])("rejects %p", (value) => {
    // "chr1" and "23" are the near misses: another browser's spelling, and a
    // number that exists in some naming schemes but not in this one.
    expect(isChromosome(value)).toBe(false);
  });
});
