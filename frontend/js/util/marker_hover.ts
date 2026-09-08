/**
 * Whether a highlight's close button should be showing.
 *
 * A highlight lets clicks through to the tracks underneath, which means the
 * host cannot be a hit target and CSS :hover never matches it. So the hover is
 * worked out by hand, from the pointer position, and this is that arithmetic.
 *
 * The close button is placed inside the highlight's top right corner, which
 * works while the highlight is wider than the button. A highlight drawn around
 * a single gene often is not: at 24 px wide with an 8 px inset, the button
 * needs 32 px of highlight to sit in, and a gene at most zooms is a few pixels.
 * The button then hangs off the left-hand side -- beside the highlight rather
 * than on it -- and a test against the highlight alone hides it the moment the
 * pointer moves onto it. Which is to say: visible, and impossible to press.
 */

/** A rectangle in viewport coordinates, as getBoundingClientRect returns one. */
export interface ViewportRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * How far outside a rectangle still counts as on it.
 *
 * The button is inset from the highlight's edge, so a narrow highlight and its
 * button have a gap between them. Without this the pointer crosses dead space
 * on the way and the button hides mid-journey.
 */
export const HOVER_GRACE_PX = 12;

function hasArea(rect: ViewportRect): boolean {
  // A hidden button measures zero at the origin, which every pointer near the
  // top left of the window would otherwise count as being inside.
  return rect.right > rect.left && rect.bottom > rect.top;
}

export function withinRect(
  x: number,
  y: number,
  rect: ViewportRect,
  grace: number = 0,
): boolean {
  if (!hasArea(rect)) {
    return false;
  }
  return (
    x >= rect.left - grace &&
    x <= rect.right + grace &&
    y >= rect.top - grace &&
    y <= rect.bottom + grace
  );
}

/**
 * Whether to show the close button for a pointer at this position.
 *
 * The highlight or the button: reaching for the button is not leaving the
 * highlight, however the two happen to be laid out.
 */
export function closeButtonShowing(
  pointer: { x: number; y: number },
  highlight: ViewportRect,
  closeButton: ViewportRect,
  isCreated: boolean,
): boolean {
  if (!isCreated) {
    return false;
  }
  return (
    withinRect(pointer.x, pointer.y, highlight) ||
    withinRect(pointer.x, pointer.y, closeButton, HOVER_GRACE_PX)
  );
}
