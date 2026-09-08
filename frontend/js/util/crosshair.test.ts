import {
  basePx,
  formatBase,
  isOverPlot,
  pinAt,
  pxBase,
  spanLabel,
  spans,
  visiblePins,
} from "./crosshair";

// A 1000 px wide view of 100 kb, with 40 px of it taken by the y axis. So the
// data occupies 960 px, and one pixel is a little over 104 bases.
const xRange: Rng = [1, 100_000];
const WIDTH = 1000;
const AXIS = 40;

describe("placing a base on screen", () => {
  test("the first base sits at the left edge of the plot, not of the track", () => {
    // The y axis holds the left 40 px. A line drawn at zero would cross it.
    expect(basePx(1, xRange, WIDTH, AXIS)).toBe(40);
  });

  test("the last base sits at the right edge", () => {
    expect(basePx(100_000, xRange, WIDTH, AXIS)).toBeCloseTo(1000);
  });

  test("the middle base sits in the middle of the plot", () => {
    expect(basePx(50_000, xRange, WIDTH, AXIS)).toBeCloseTo(520, 0);
  });

  test("a track too narrow to plot anything does not divide by zero", () => {
    expect(basePx(50_000, xRange, 40, AXIS)).toBe(40);
  });
});

describe("reading the base under a pixel", () => {
  test("round trips with the placement", () => {
    for (const position of [1, 25_000, 50_000, 99_999]) {
      const xPx = basePx(position, xRange, WIDTH, AXIS);
      expect(pxBase(xPx, xRange, WIDTH, AXIS)).toBe(position);
    }
  });

  test("the y axis area reads as the start of the view", () => {
    expect(pxBase(AXIS, xRange, WIDTH, AXIS)).toBe(1);
  });
});

describe("staying out of the y axis", () => {
  test("a pointer over the axis is not over the plot", () => {
    expect(isOverPlot(20, WIDTH, AXIS)).toBe(false);
  });

  test("a pointer just inside the plot is", () => {
    expect(isOverPlot(41, WIDTH, AXIS)).toBe(true);
  });

  test("a pointer past the right edge is not", () => {
    expect(isOverPlot(1001, WIDTH, AXIS)).toBe(false);
  });
});

describe("which pins are on screen", () => {
  const pins = [
    { id: "a", position: 10_000 },
    { id: "b", position: 90_000 },
    { id: "c", position: 500_000 },
  ];

  test("only the ones inside the view are drawn", () => {
    expect(visiblePins(pins, xRange, WIDTH, AXIS).map((p) => p.pin.id)).toEqual(
      ["a", "b"],
    );
  });

  test("a pin off screen is kept, so panning back finds it again", () => {
    // The filter is on what gets drawn, not on what is remembered.
    const panned = visiblePins(pins, [400_000, 600_000], WIDTH, AXIS);
    expect(panned.map((p) => p.pin.id)).toEqual(["c"]);
  });

  test("each carries the pixel it is drawn at", () => {
    const [first] = visiblePins(pins, xRange, WIDTH, AXIS);
    expect(first.xPx).toBeCloseTo(basePx(10_000, xRange, WIDTH, AXIS));
  });
});

describe("clicking a line to take it away", () => {
  const pins = [
    { id: "a", position: 10_000 },
    { id: "b", position: 10_500 },
  ];

  test("finds the pin under the click", () => {
    expect(pinAt(pins, 10_100, 300)?.id).toBe("a");
  });

  test("finds the nearer one when two are close together", () => {
    // Otherwise a second click near a pair removes whichever was listed first.
    expect(pinAt(pins, 10_400, 1000)?.id).toBe("b");
  });

  test("finds nothing when the click is not on a line", () => {
    expect(pinAt(pins, 50_000, 300)).toBeNull();
  });

  test("the tolerance is in bases, since a pixel is not one base", () => {
    // At a whole-chromosome zoom a pixel covers thousands of bases, so an
    // exact match would never happen and a line could never be removed.
    // One pin, so this measures the tolerance and not which pin is nearer.
    const lone = [{ id: "a", position: 10_000 }];
    expect(pinAt(lone, 10_299, 300)?.id).toBe("a");
    expect(pinAt(lone, 10_301, 300)).toBeNull();
    expect(pinAt(lone, 9_701, 300)?.id).toBe("a");
  });
});

describe("what the labels say", () => {
  test("a position is grouped the way the rest of the interface writes one", () => {
    expect(formatBase(49_688_000)).toBe("49,688,000");
  });

  test("the span between two pins is the size of the event", () => {
    // The measurement the pins exist to make: both edges of a coverage drop,
    // without subtracting two nine-digit numbers by hand.
    expect(spanLabel(49_688_000, 49_736_000)).toBe("48 kb");
  });

  test("the span does not care which edge was pinned first", () => {
    expect(spanLabel(49_736_000, 49_688_000)).toBe("48 kb");
  });

  test("one pin spans nothing", () => {
    expect(spans([{ id: "a", position: 100 }])).toEqual([]);
  });

  test("two pins give the gap between them", () => {
    const measured = spans([
      { id: "a", position: 49_736_000 },
      { id: "b", position: 49_688_000 },
    ]);
    expect(measured).toEqual([
      { from: 49_688_000, to: 49_736_000, label: "48 kb" },
    ]);
  });

  test("three pins give the two neighbouring gaps, not every pairing", () => {
    const measured = spans([
      { id: "a", position: 1_000 },
      { id: "c", position: 3_000 },
      { id: "b", position: 2_000 },
    ]);
    expect(measured.map((m) => [m.from, m.to])).toEqual([
      [1_000, 2_000],
      [2_000, 3_000],
    ]);
  });
});
