/**
 * Showing and placing a highlight's close button.
 *
 * A highlight lets clicks through to the tracks underneath, which means the
 * host cannot be a hit target and CSS :hover never matches it. So the hover is
 * worked out by hand, from the pointer position, and this is that arithmetic.
 *
 * The button goes inside the highlight's top right corner while there is room
 * for it. A highlight drawn around a single gene rarely has room -- three
 * pixels is ordinary -- so it goes just outside the right-hand edge instead,
 * where it still reads as belonging to this highlight. Left to the stylesheet
 * it went off the left, floating over whichever track happened to be there.
 *
 * Either way it can end up outside the highlight, so the hover test covers the
 * button's own rectangle as well. Testing the highlight alone hid the button
 * the moment the pointer moved onto it: visible, and impossible to press.
 */

/**
 * The button's size and its inset from the highlight's corner.
 *
 * Shared with the stylesheet that draws it rather than written twice: the
 * placement below is arithmetic on these, and the two drifting apart is what
 * put the button somewhere the hover test was not looking.
 */
export const CLOSE_SIZE_PX = 24;
export const CLOSE_INSET_PX = 8;

/** The gap left between the highlight and a button placed outside it. */
export const CLOSE_GAP_PX = 4;

/**
 * How wide a highlight must be to hold the button and still be visible.
 *
 * The button plus its inset on each side. At exactly the button's width it
 * would cover the highlight entirely, which is no better than hiding it.
 */
export const CLOSE_BUTTON_SPACE_PX = CLOSE_SIZE_PX + 2 * CLOSE_INSET_PX;

/**
 * Where to put the close button for a highlight of this width.
 *
 * Inside the top right corner while there is room. A highlight around a single
 * gene rarely has room, and the button then goes just outside the right-hand
 * edge, where it still reads as belonging to this highlight. Left to the
 * stylesheet it went off the left instead, floating over whatever happened to
 * be there.
 */
export function closeButtonPlacement(highlightWidthPx: number): {
  left: string;
  right: string;
} {
  // "auto" rather than "": clearing an inline value falls back to the
  // stylesheet, which sets right, so the button would have both sides pinned
  // and depend on the rule that says an over-constrained box drops one.
  if (highlightWidthPx >= CLOSE_BUTTON_SPACE_PX) {
    return { left: "auto", right: `${CLOSE_INSET_PX}px` };
  }
  return { left: `calc(100% + ${CLOSE_GAP_PX}px)`, right: "auto" };
}

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
