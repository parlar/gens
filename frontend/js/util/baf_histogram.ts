export interface BafHistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface BafHistogram {
  bins: BafHistogramBin[];
  siteCount: number;
  excludedCount: number;
}

export function buildBafHistogram(
  data: ApiCoverageDot[],
  region: Rng,
  binCount: number = 50,
  bafRange: Rng = [0, 1],
): BafHistogram {
  if (
    !Number.isInteger(binCount) ||
    binCount < 1 ||
    binCount > 200 ||
    !region.every(Number.isFinite) ||
    region[0] > region[1] ||
    !bafRange.every(Number.isFinite) ||
    bafRange[0] < 0 ||
    bafRange[1] > 1 ||
    bafRange[0] >= bafRange[1]
  ) {
    throw new Error("Invalid histogram range or bin count");
  }

  const width = (bafRange[1] - bafRange[0]) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    start: bafRange[0] + index * width,
    end: bafRange[0] + (index + 1) * width,
    count: 0,
  }));
  let siteCount = 0;
  let excludedCount = 0;

  for (const point of data) {
    if (
      !Number.isFinite(point.pos) ||
      point.pos < region[0] ||
      point.pos > region[1]
    ) {
      continue;
    }
    if (
      !Number.isFinite(point.value) ||
      point.value < bafRange[0] ||
      point.value > bafRange[1]
    ) {
      excludedCount += 1;
      continue;
    }
    let index = 0;
    let upper = binCount - 1;
    while (index < upper) {
      const middle = Math.ceil((index + upper) / 2);
      if (point.value >= bins[middle].start) {
        index = middle;
      } else {
        upper = middle - 1;
      }
    }
    bins[index].count += 1;
    siteCount += 1;
  }

  return { bins, siteCount, excludedCount };
}
