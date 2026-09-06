import { pannedRange, pixelsToBases } from "./panning";

const CHROM = 248_956_422;

describe("sliding the view", () => {
  test("moves by the distance asked for", () => {
    expect(pannedRange([1000, 2000], 500, CHROM)).toEqual([1500, 2500]);
    expect(pannedRange([1000, 2000], -500, CHROM)).toEqual([500, 1500]);
  });

  test("keeps the window the same width at the start of a chromosome", () => {
    // Clamping the two edges separately would give [1, 1500]: the left edge
    // stops while the right keeps moving, so panning off the end zooms in.
    expect(pannedRange([1000, 2000], -5000, CHROM)).toEqual([1, 1001]);
  });

  test("keeps the window the same width at the end of a chromosome", () => {
    expect(pannedRange([CHROM - 1000, CHROM - 500], 5000, CHROM)).toEqual([
      CHROM - 500,
      CHROM,
    ]);
  });

  test("a view wider than the chromosome stays put", () => {
    const whole: Rng = [1, CHROM];
    expect(pannedRange(whole, 10_000, CHROM)).toEqual(whole);
    expect(pannedRange(whole, -10_000, CHROM)).toEqual(whole);
  });

  test("a zero move changes nothing", () => {
    expect(pannedRange([1000, 2000], 0, CHROM)).toEqual([1000, 2000]);
  });
});

describe("pixels to bases", () => {
  test("excludes the y-axis gutter from the plotted width", () => {
    // 1000 px wide with a 100 px axis leaves 900 px for 900 bases, so a pixel
    // is a base and the content keeps up with the pointer exactly.
    expect(pixelsToBases(100, [1, 901], 1000, 100)).toBe(100);
  });

  test("scales with the zoom level", () => {
    expect(pixelsToBases(10, [1, 9001], 1000, 100)).toBe(100);
  });

  test("is signed", () => {
    expect(pixelsToBases(-100, [1, 901], 1000, 100)).toBe(-100);
  });

  test("survives a container with no room to plot in", () => {
    expect(pixelsToBases(100, [1, 901], 100, 100)).toBe(0);
  });
});
