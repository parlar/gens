import { formatRegion, parseRegionText } from "./region_text";

const CHROMS = ["1", "2", "10", "X", "Y", "MT"];
const parse = (text: string) => parseRegionText(text, CHROMS);

describe("reading a typed region", () => {
  test("reads the plain form", () => {
    expect(parse("1:100000-200000")).toEqual({
      region: { chrom: "1", start: 100000, end: 200000 },
      error: null,
    });
  });

  test("accepts what other tools paste", () => {
    // Thousands separators, a chr prefix, spaces around the punctuation: all
    // of these arrive on the clipboard from IGV, UCSC and Excel.
    const expected = { chrom: "1", start: 100000, end: 200000 };
    expect(parse("chr1:100,000-200,000").region).toEqual(expected);
    expect(parse("  1 : 100000 - 200000  ").region).toEqual(expected);
    expect(parse("CHR1:100 000-200 000").region).toEqual(expected);
  });

  test("reads the sex chromosomes and the mitochondrion", () => {
    expect(parse("X:1-100").region?.chrom).toBe("X");
    expect(parse("chrM:1-100").region?.chrom).toBe("MT");
    expect(parse("mt:1-100").region?.chrom).toBe("MT");
  });

  test("a single base is a region", () => {
    expect(parse("1:500-500").region).toEqual({ chrom: "1", start: 500, end: 500 });
  });

  test("says what to type when the shape is wrong", () => {
    expect(parse("1").error).toMatch(/chromosome:start-end/);
    expect(parse("1:100000").error).toMatch(/chromosome:start-end/);
    expect(parse("").error).toMatch(/Enter a region/);
  });

  test("refuses a chromosome this genome does not have", () => {
    expect(parse("23:1-100").error).toMatch(/not a chromosome/);
    expect(parse("banana:1-100").error).toMatch(/not a chromosome/);
  });

  test("refuses coordinates that cannot mean anything", () => {
    // Silently accepting these would measure a region the reader did not ask
    // for, which is worse than refusing to measure at all.
    expect(parse("1:0-100").error).toMatch(/count from 1/);
    expect(parse("1:200-100").error).toMatch(/end must not come before/);
  });

  test("never returns both a region and an error", () => {
    for (const text of ["1:1-2", "1", "23:1-2", "1:0-1", "1:9-8", ""]) {
      const result = parse(text);
      expect(result.region === null).toBe(result.error !== null);
    }
  });
});

describe("showing a region back", () => {
  test("groups the digits so long coordinates can be read", () => {
    expect(formatRegion({ chrom: "1", start: 100000, end: 200000 } as Region))
      .toBe("1:100,000-200,000");
  });

  test("what it writes, it can read back", () => {
    const region = { chrom: "10", start: 1, end: 248956422 } as Region;
    expect(parse(formatRegion(region)).region).toEqual(region);
  });
});
