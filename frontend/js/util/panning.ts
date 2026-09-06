/** Moving the view sideways without changing how much of it you can see. */

/**
 * The view after sliding it by `distance` bases, kept inside the chromosome.
 *
 * The offset is clamped, not the two edges separately. Clamping each edge on
 * its own lets one edge stop while the other keeps moving, which narrows the
 * window and silently zooms the view in whenever a reader pans into either end
 * of a chromosome.
 *
 * A view already wider than the chromosome has nowhere to go, so it stays put.
 */
export function pannedRange(
  range: Rng,
  distance: number,
  chromosomeSize: number,
): Rng {
  const [start, end] = range;
  const width = end - start;
  // Coordinates are 1-based, so 1 is the first valid position.
  const lowest = 1 - start;
  const highest = chromosomeSize - end;
  if (highest < lowest) {
    return range;
  }
  const offset = Math.max(lowest, Math.min(highest, distance));
  const newStart = Math.round(start + offset);
  return [newStart, newStart + width];
}

/**
 * Bases covered by a horizontal mouse movement of `pixels`.
 *
 * The y-axis gutter is not part of the plotted area, so it is taken off the
 * width; counting it would make the content drift slower than the pointer.
 */
export function pixelsToBases(
  pixels: number,
  range: Rng,
  containerWidth: number,
  axisWidth: number,
): number {
  const plotted = containerWidth - axisWidth;
  if (plotted <= 0) {
    return 0;
  }
  return (pixels * (range[1] - range[0])) / plotted;
}
