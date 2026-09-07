/**
 * Turning binned heterozygote counts into bars shaded by the coverage measured
 * over the same bins.
 *
 * The count on its own is ambiguous by construction. A bin empty of
 * heterozygous sites is produced by a heterozygous deletion and by a run of
 * homozygosity alike: the first removes a copy, the second does not, and the
 * counts are identical. The backend measures coverage over the identical bin
 * boundaries, so the two can be shown together rather than left for the reader
 * to align by eye across two tracks.
 *
 * The shading is a covariate, not a call. There is no threshold and no
 * probability here: the colour simply is the bin's coverage. It also cannot
 * separate a deletion from a coverage dropout, because both lower the stored
 * ratio and nothing measures the difference.
 */

import { rgbArrayToString } from "../draw/render_utils";

/**
 * Coverage at or above this is drawn neutral: on a log2 ratio, zero is the
 * ordinary two-copy state and there is nothing to flag.
 */
const NEUTRAL_COVERAGE = 0;

/**
 * Coverage at or below this is drawn fully saturated. Losing one of two copies
 * halves the ratio, which is log2(0.5) = -1, so the end of the ramp is the
 * single-copy state rather than an arbitrary shade. Anything lower is drawn the
 * same, because it is no longer a question of how depleted the bin is.
 */
const SINGLE_COPY_COVERAGE = -1;

/** Ordinary coverage: the bar carries no claim beyond its height. */
const NEUTRAL_RGB = [136, 136, 136];

/**
 * Coverage consistent with a lost copy. Red rather than blue because the rest
 * of Gens already paints deletions red and duplications blue, and a low-coverage
 * bar shaded blue would read as the opposite of what it means.
 */
const DEPLETED_RGB = [204, 0, 0];

/**
 * The colour for a bin's coverage, and null where coverage was not measured.
 *
 * Returning null rather than a neutral colour keeps "ordinary coverage here"
 * separate from "no coverage recorded here". The two are different statements
 * and painting them alike would let a gap in the coverage file read as a
 * perfectly normal bin.
 */
export function coverageShade(
  coverage: number | null | undefined,
): string | null {
  if (coverage == null || !Number.isFinite(coverage)) {
    return null;
  }
  const span = NEUTRAL_COVERAGE - SINGLE_COPY_COVERAGE;
  const depletion = (NEUTRAL_COVERAGE - coverage) / span;
  const clamped = Math.min(1, Math.max(0, depletion));
  // Squared, so the colour is spent where the two states differ rather than on
  // ordinary variation. Measured on this pedigree, bins outside any event sit
  // between -0.14 and -0.28: on a straight ramp every one of them takes a
  // visible share of the red and the whole track reads pink, which leaves less
  // contrast for the thing the shading exists to show. Squaring is a monotone
  // remapping of the same ramp, like a log axis: it introduces no threshold and
  // reorders nothing, and -0.14 lands at 2% while -0.93 still lands at 86%.
  const fraction = clamped * clamped;
  const mixed = NEUTRAL_RGB.map((neutral, channel) =>
    Math.round(neutral + (DEPLETED_RGB[channel] - neutral) * fraction),
  );
  return rgbArrayToString(mixed);
}

/** The endpoints the legend has to name, so the key cannot drift from the ramp. */
export const COVERAGE_SHADE_STOPS: { label: string; color: string }[] = [
  { label: `${SINGLE_COPY_COVERAGE}`, color: rgbArrayToString(DEPLETED_RGB) },
  { label: `${NEUTRAL_COVERAGE}`, color: rgbArrayToString(NEUTRAL_RGB) },
];

interface HetDensityBinInput {
  start: number;
  end: number;
  observed: number;
  coverage?: number | null;
}

/**
 * One bar per bin: height is the count against the sample's own baseline, shade
 * is the coverage over that same bin.
 *
 * A bin with no heterozygous sites has no logarithm and is pinned to the floor
 * of the axis, which is where an unbounded drop belongs. The floor is therefore
 * not a measured value, and the shading is what says whether coverage explains
 * it.
 */
export function hetDensityBars(
  bins: HetDensityBinInput[],
  baseline: number,
  yRange: Rng,
): RenderBar[] {
  const [low, high] = yRange;
  return bins.map((bin) => {
    const shade = coverageShade(bin.coverage);
    const value =
      bin.observed === 0
        ? low
        : Math.min(high, Math.max(low, Math.log2(bin.observed / baseline)));
    return {
      start: bin.start,
      end: bin.end,
      y: value,
      color: shade ?? rgbArrayToString(NEUTRAL_RGB),
      outlineOnly: shade === null,
    };
  });
}
