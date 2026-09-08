/**
 * A vertical line across every track, and the lines a reader pins to keep.
 *
 * Reading an event means comparing tracks at the same base: a coverage drop is
 * a deletion only if the BAF agrees, and it matters what gene sits at its
 * edges. Tracks are stacked and share one x axis, so the comparison is already
 * possible -- but by eye, down a column of pixels, across a screen that may be
 * two thousand pixels wide. A line drawn at one base removes the guesswork.
 *
 * The line following the pointer answers "what is here". A pinned line stays
 * where it was put, so a reader can leave one at each boundary of an event and
 * then look wherever they like without losing the edges.
 */

import { prefixNts } from "./utils";

/** How near a pointer must be, in pixels, to grab an existing pin. */
export const PIN_GRAB_PX = 4;

/** A pin, kept as a base position so it survives panning and zooming. */
export interface Pin {
  id: string;
  position: number;
}

/**
 * Where a base sits on screen.
 *
 * The plotted area starts after the y axis, so a base at the left edge of the
 * data is at `axisWidth`, not at zero.
 */
export function basePx(
  position: number,
  xRange: Rng,
  containerWidth: number,
  axisWidth: number,
): number {
  const plotted = containerWidth - axisWidth;
  const span = xRange[1] - xRange[0];
  if (plotted <= 0 || span <= 0) {
    return axisWidth;
  }
  return axisWidth + ((position - xRange[0]) / span) * plotted;
}

/** The base under a pixel, the inverse of basePx. */
export function pxBase(
  xPx: number,
  xRange: Rng,
  containerWidth: number,
  axisWidth: number,
): number {
  const plotted = containerWidth - axisWidth;
  if (plotted <= 0) {
    return xRange[0];
  }
  const fraction = (xPx - axisWidth) / plotted;
  return Math.round(xRange[0] + fraction * (xRange[1] - xRange[0]));
}

/** Whether a pixel falls in the plotted area rather than over the y axis. */
export function isOverPlot(
  xPx: number,
  containerWidth: number,
  axisWidth: number,
): boolean {
  return xPx >= axisWidth && xPx <= containerWidth;
}

/**
 * The pins that fall inside the current view, with where to draw each.
 *
 * A pin outside the view is kept, not dropped: panning back should bring it
 * with the same coordinate it was placed at.
 */
export function visiblePins(
  pins: Pin[],
  xRange: Rng,
  containerWidth: number,
  axisWidth: number,
): { pin: Pin; xPx: number }[] {
  return pins
    .filter((pin) => pin.position >= xRange[0] && pin.position <= xRange[1])
    .map((pin) => ({
      pin,
      xPx: basePx(pin.position, xRange, containerWidth, axisWidth),
    }));
}

/**
 * The pin a click at this position should remove, if any.
 *
 * Clicking a line again is how a line is taken away, so the same gesture both
 * places and removes one. The tolerance is in bases, converted from pixels by
 * the caller, because at a whole-chromosome zoom one pixel is thousands of
 * bases and an exact match would never happen.
 */
export function pinAt(
  pins: Pin[],
  position: number,
  toleranceBases: number,
): Pin | null {
  let nearest: Pin | null = null;
  let nearestDistance = Infinity;
  for (const pin of pins) {
    const distance = Math.abs(pin.position - position);
    if (distance <= toleranceBases && distance < nearestDistance) {
      nearest = pin;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** A base position as it is written everywhere else in the interface. */
export function formatBase(position: number): string {
  return Math.round(position).toLocaleString();
}

/**
 * The distance between two pins.
 *
 * This is the measurement the pins exist to make: pin both edges of a coverage
 * drop and this is the size of the event, without arithmetic on two nine-digit
 * numbers.
 */
export function spanLabel(first: number, second: number): string {
  const span = Math.abs(Math.round(second) - Math.round(first));
  return prefixNts(span);
}

/**
 * What to show between pins.
 *
 * Only between neighbours: with three pins, the reader wants the two gaps, not
 * every pairing. Empty until there are two, since one pin spans nothing.
 */
export function spans(
  pins: Pin[],
): { from: number; to: number; label: string }[] {
  const ordered = [...pins].sort((a, b) => a.position - b.position);
  const measured: { from: number; to: number; label: string }[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const from = ordered[i - 1].position;
    const to = ordered[i].position;
    measured.push({ from, to, label: spanLabel(from, to) });
  }
  return measured;
}
