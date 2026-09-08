import { closeButtonShowing, HOVER_GRACE_PX, withinRect } from "./marker_hover";

const rect = (left: number, right: number, top = 0, bottom = 400) => ({
  left,
  right,
  top,
  bottom,
});

// The reported case: a highlight put around a gene. The close button is 24 px
// wide and inset 8 px from the highlight's right edge, so on a 3 px highlight
// starting at x=500 it lands at 495 down to 471 -- entirely to the left of the
// highlight, with a 2 px gap.
const NARROW_HIGHLIGHT = rect(500, 503);
const ITS_BUTTON = rect(471, 495, 8, 32);

// A highlight dragged out by hand is usually wide enough to hold the button.
const WIDE_HIGHLIGHT = rect(500, 900);
const BUTTON_INSIDE = rect(868, 892, 8, 32);

const HIDDEN_BUTTON = { left: 0, right: 0, top: 0, bottom: 0 };

describe("being inside a rectangle", () => {
  test("a pointer in the middle is inside", () => {
    expect(withinRect(600, 200, WIDE_HIGHLIGHT)).toBe(true);
  });

  test("a pointer outside is not", () => {
    expect(withinRect(400, 200, WIDE_HIGHLIGHT)).toBe(false);
  });

  test("grace reaches a little beyond the edge", () => {
    expect(withinRect(497, 20, ITS_BUTTON)).toBe(false);
    expect(withinRect(497, 20, ITS_BUTTON, HOVER_GRACE_PX)).toBe(true);
  });

  test("a rectangle with no area contains nothing", () => {
    // A hidden button measures zero at the origin. Without this every pointer
    // near the top left corner of the window would count as on it.
    expect(withinRect(0, 0, HIDDEN_BUTTON, HOVER_GRACE_PX)).toBe(false);
    expect(withinRect(5, 5, HIDDEN_BUTTON, HOVER_GRACE_PX)).toBe(false);
  });
});

describe("showing the close button on a gene-width highlight", () => {
  test("hovering the highlight shows it", () => {
    expect(
      closeButtonShowing(
        { x: 501, y: 200 },
        NARROW_HIGHLIGHT,
        HIDDEN_BUTTON,
        true,
      ),
    ).toBe(true);
  });

  test("moving onto the button keeps it, which is the whole bug", () => {
    // The button sits outside the highlight here. Testing the highlight alone
    // hid it the moment the pointer arrived, so it could be seen and never
    // pressed.
    expect(
      closeButtonShowing({ x: 483, y: 20 }, NARROW_HIGHLIGHT, ITS_BUTTON, true),
    ).toBe(true);
  });

  test("the gap between the two is crossed", () => {
    // 2 px of nothing between the button's right edge and the highlight.
    expect(
      closeButtonShowing({ x: 497, y: 20 }, NARROW_HIGHLIGHT, ITS_BUTTON, true),
    ).toBe(true);
  });

  test("moving well away hides it again", () => {
    expect(
      closeButtonShowing(
        { x: 300, y: 200 },
        NARROW_HIGHLIGHT,
        ITS_BUTTON,
        true,
      ),
    ).toBe(false);
  });
});

describe("a highlight wide enough to hold its own button", () => {
  test("still shows on hover", () => {
    expect(
      closeButtonShowing(
        { x: 700, y: 200 },
        WIDE_HIGHLIGHT,
        HIDDEN_BUTTON,
        true,
      ),
    ).toBe(true);
  });

  test("and over the button, which is inside it", () => {
    expect(
      closeButtonShowing(
        { x: 880, y: 20 },
        WIDE_HIGHLIGHT,
        BUTTON_INSIDE,
        true,
      ),
    ).toBe(true);
  });
});

describe("a highlight still being dragged out", () => {
  test("has no close button yet, wherever the pointer is", () => {
    // It is not a highlight until the drag ends; offering to remove one that
    // does not exist yet would be a button that does nothing.
    expect(
      closeButtonShowing(
        { x: 700, y: 200 },
        WIDE_HIGHLIGHT,
        BUTTON_INSIDE,
        false,
      ),
    ).toBe(false);
  });
});
