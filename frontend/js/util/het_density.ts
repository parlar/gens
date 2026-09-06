/**
 * Heterozygote density: the count of heterozygous BAF sites per genomic bin,
 * relative to a background density estimated from the same view.
 *
 * A heterozygous deletion or copy-neutral LOH removes heterozygosity instead of
 * shifting the BAF band, so it is invisible to a statistic conditioned on
 * heterozygous sites alone. This is a count, not a fitted model.
 *
 * The critical distinction this module makes is between "no heterozygous sites
 * were observed because a haplotype is missing" and "no heterozygous sites were
 * observed because nothing is callable here". Both look like an empty region.
 * An oracle-bin comparison over seven truth deletions found six of them sitting
 * in intervals with near-zero callable heterozygous sites in *every* sample,
 * carrier and noncarrier alike; treating those as deletions would have produced
 * six false events. Bins without enough expected sites are therefore reported as
 * uninformative and never as a depleted region.
 */

/** Why a bin does or does not carry interpretable evidence. */
export type HetDensityState =
  /** Enough sites expected for the observed count to mean something. */
  | "informative"
  /** Sites are expected here but too few to distinguish depletion from noise. */
  | "uninformative"
  /** The view itself has no usable heterozygous sites; no baseline exists. */
  | "no-baseline";

export interface HetDensityBin {
  start: number;
  end: number;
  /** Heterozygous sites observed in this bin. */
  observed: number;
  /** Sites expected from the background density, or null without a baseline. */
  expected: number | null;
  /** observed / expected, or null when that ratio would not be meaningful. */
  ratio: number | null;
  /**
   * Poisson probability of seeing at most `observed` when `expected` are
   * expected. Small values indicate depletion. Null unless informative.
   */
  depletionP: number | null;
  state: HetDensityState;
}

export interface HetDensity {
  bins: HetDensityBin[];
  /** Median sites per bin across occupied bins; the background density. */
  baseline: number;
  /** Sites placed into bins. */
  siteCount: number;
  /** Sites dropped for a non-finite or out-of-region position. */
  excludedCount: number;
  /** Sites in the region whose BAF is outside the heterozygous interval. */
  homozygousCount: number;
  /** True when no baseline could be established for this view. */
  noBaseline: boolean;
}

export interface HetDensityOptions {
  /** Number of bins across the region. */
  binCount?: number;
  /**
   * BAF interval within which a site is treated as heterozygous.
   *
   * The stored BAF track holds every site, homozygous ones included, so a plain
   * count of points does not measure heterozygosity. Inside a real 79 kb
   * heterozygous deletion the carrier still has 138 stored sites, of which only
   * 5 fall in this interval; counting all 138 hides the event entirely.
   *
   * At the depths seen here a true heterozygote sits near 0.5 with a sampling
   * SD around 0.09, so the default spans roughly four SD either side and also
   * retains the 1/3 and 2/3 fractions of a three-copy state. This is selection
   * by displayed value, which is ascertainment: it cannot separate a genuine
   * homozygote from a heterozygote whose imbalance is extreme. Genotypes or a
   * fixed common-SNP site list would be needed to avoid that.
   */
  hetRange?: Rng;
  /**
   * Expected sites a bin needs before its count is interpreted. Below this,
   * observing zero is not distinguishable from ordinary sampling: at an
   * expectation of 5 a genuinely normal bin is empty about 0.7 percent of the
   * time, at an expectation of 2 about 14 percent of the time.
   */
  minExpected?: number;
}

const DEFAULT_BIN_COUNT = 100;
const DEFAULT_MIN_EXPECTED = 5;
const DEFAULT_HET_RANGE: Rng = [0.15, 0.85];

/**
 * Poisson probability of at most `k` events when `lambda` are expected.
 *
 * Summed in log space; a region of normal density spanning a wide bin can carry
 * an expectation in the hundreds, where the naive product underflows to zero
 * and would report every bin as infinitely depleted.
 */
export function poissonAtMost(k: number, lambda: number): number {
  if (!Number.isFinite(k) || !Number.isFinite(lambda) || k < 0 || lambda < 0) {
    return NaN;
  }
  if (lambda === 0) {
    return 1;
  }
  const logLambda = Math.log(lambda);
  // term_i = exp(-lambda + i*log(lambda) - log(i!)), accumulated as logs.
  let logTerm = -lambda;
  let total = Math.exp(logTerm);
  for (let i = 1; i <= Math.floor(k); i += 1) {
    logTerm += logLambda - Math.log(i);
    total += Math.exp(logTerm);
  }
  return Math.min(1, total);
}

/** Median of a numeric array. Returns 0 for an empty array. */
function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Bin heterozygous sites and compare each bin with the view's own background.
 *
 * The baseline is the median count across bins rather than the mean, so that a
 * genuine deletion inside the view does not drag down the very background it is
 * being compared against. This holds only while affected bins are a minority of
 * the view; a view consisting mostly of one event has no usable internal
 * background, and the ratios are then relative to the event itself.
 */
export function buildHetDensity(
  sites: ApiCoverageDot[],
  region: Rng,
  options: HetDensityOptions = {},
): HetDensity {
  const binCount = options.binCount ?? DEFAULT_BIN_COUNT;
  const minExpected = options.minExpected ?? DEFAULT_MIN_EXPECTED;
  const hetRange = options.hetRange ?? DEFAULT_HET_RANGE;

  if (
    !hetRange.every(Number.isFinite) ||
    hetRange[0] < 0 ||
    hetRange[1] > 1 ||
    hetRange[0] >= hetRange[1]
  ) {
    throw new Error("Invalid heterozygous BAF range");
  }

  if (
    !Number.isInteger(binCount) ||
    binCount < 1 ||
    binCount > 2000 ||
    !Number.isFinite(minExpected) ||
    minExpected <= 0 ||
    !region.every(Number.isFinite) ||
    region[0] >= region[1]
  ) {
    throw new Error("Invalid heterozygote density region or bin count");
  }

  const width = (region[1] - region[0]) / binCount;
  const counts = new Array<number>(binCount).fill(0);
  let siteCount = 0;
  let excludedCount = 0;
  let homozygousCount = 0;

  for (const site of sites) {
    if (
      !Number.isFinite(site.pos) ||
      site.pos < region[0] ||
      site.pos > region[1]
    ) {
      excludedCount += 1;
      continue;
    }
    if (
      !Number.isFinite(site.value) ||
      site.value < hetRange[0] ||
      site.value > hetRange[1]
    ) {
      homozygousCount += 1;
      continue;
    }
    // The final position belongs to the last bin rather than one past the end.
    const index = Math.min(
      binCount - 1,
      Math.floor((site.pos - region[0]) / width),
    );
    counts[index] += 1;
    siteCount += 1;
  }

  const baseline = median(counts);
  const noBaseline = baseline <= 0;

  const bins = counts.map((observed, index) => {
    const start = region[0] + index * width;
    const end = start + width;
    if (noBaseline) {
      // Male chrX outside the pseudoautosomal regions, chrY, and unmappable
      // stretches all land here. Reporting them as depleted would invent an
      // event out of an expected absence.
      return {
        start,
        end,
        observed,
        expected: null,
        ratio: null,
        depletionP: null,
        state: "no-baseline" as HetDensityState,
      };
    }
    if (baseline < minExpected) {
      return {
        start,
        end,
        observed,
        expected: baseline,
        ratio: null,
        depletionP: null,
        state: "uninformative" as HetDensityState,
      };
    }
    return {
      start,
      end,
      observed,
      expected: baseline,
      ratio: observed / baseline,
      depletionP: poissonAtMost(observed, baseline),
      state: "informative" as HetDensityState,
    };
  });

  return {
    bins,
    baseline,
    siteCount,
    excludedCount,
    homozygousCount,
    noBaseline,
  };
}
