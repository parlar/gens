import { drawBarsScaled, drawBinShadeStrip } from "./render_utils";

/**
 * Bars carry their colour in their own body, so a bin whose value sits on the
 * baseline draws as a hairline and its colour becomes unreadable. That is the
 * bin most worth seeing: on chr11:49,688,000-49,736,000 the bin holding the
 * deletion's right breakpoint is 80% deleted, and the nine heterozygous sites in
 * the 4 kb that survived put its bar back on the baseline. The strip under the
 * plot is what keeps that bin's shading visible.
 */

interface Painted {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

function fakeContext() {
  const filled: Painted[] = [];
  const stroked: Painted[] = [];
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    save: () => undefined,
    restore: () => undefined,
    fillRect: (x: number, y: number, width: number, height: number) =>
      filled.push({ x, y, width, height, color: ctx.fillStyle }),
    strokeRect: (x: number, y: number, width: number, height: number) =>
      stroked.push({ x, y, width, height, color: ctx.strokeStyle }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, filled, stroked };
}

/** One pixel per base, so a bin's pixels are its coordinates. */
const identity = (value: number) => value;

const bar = (
  start: number,
  y: number,
  color = "rgb(136,136,136)",
  outlineOnly = false,
): RenderBar => ({ start, end: start + 100, y, color, outlineOnly });

const STRIP = { top: 90, height: 5, leftEdge: 0, rightEdge: 1000 };

describe("the shade strip under binned bars", () => {
  test("a bin sitting on the baseline still shows its colour", () => {
    // The whole reason the strip exists. This bar has no body to colour.
    const { ctx, filled } = fakeContext();

    drawBinShadeStrip(ctx, [bar(100, 0, "rgb(201,10,10)")], identity, STRIP);

    expect(filled).toHaveLength(1);
    expect(filled[0].color).toBe("rgb(201,10,10)");
    expect(filled[0].height).toBe(5);
  });

  test("a run of bins reads as one unbroken stretch", () => {
    // No gap between segments: a deletion spanning several bins is one event,
    // and drawing it as separate blocks would say otherwise.
    const { ctx, filled } = fakeContext();

    drawBinShadeStrip(
      ctx,
      [bar(100, -4), bar(200, -4), bar(300, -4)],
      identity,
      STRIP,
    );

    expect(filled.map((rect) => [rect.x, rect.x + rect.width])).toEqual([
      [100, 200],
      [200, 300],
      [300, 400],
    ]);
  });

  test("a bin with no measured coverage is left blank, not filled neutral", () => {
    // Filling it would assert ordinary coverage where nothing was recorded.
    const { ctx, filled } = fakeContext();

    drawBinShadeStrip(
      ctx,
      [bar(100, 0, "rgb(136,136,136)", true), bar(200, 0)],
      identity,
      STRIP,
    );

    expect(filled).toHaveLength(1);
    expect(filled[0].x).toBe(200);
  });

  test("nothing is drawn outside the plotting area", () => {
    const { ctx, filled } = fakeContext();

    drawBinShadeStrip(ctx, [bar(100, 0), bar(2000, 0)], identity, {
      ...STRIP,
      leftEdge: 150,
      rightEdge: 400,
    });

    expect(filled).toHaveLength(1);
    // Clamped rather than dropped: the visible part of a straddling bin is
    // still drawn.
    expect(filled[0].x).toBe(150);
    expect(filled[0].width).toBe(50);
  });
});

describe("binned bars", () => {
  // A y scale that keeps values as pixels, inverted the way the tracks are.
  const yScale = (value: number) => 100 - value;

  test("a bar spans its bin and grows from the baseline", () => {
    const { ctx, filled } = fakeContext();

    drawBarsScaled(ctx, [bar(100, -40)], identity, yScale, {
      baselineValue: 0,
      leftEdge: 0,
      rightEdge: 1000,
    });

    expect(filled).toHaveLength(1);
    expect(filled[0].y).toBe(100);
    expect(filled[0].height).toBe(40);
  });

  test("a bin on the baseline is still drawn, one pixel tall", () => {
    // Without it an ordinary bin draws nothing, and a run of ordinary bins
    // becomes indistinguishable from a stretch with no data at all.
    const { ctx, filled } = fakeContext();

    drawBarsScaled(ctx, [bar(100, 0)], identity, yScale, {
      baselineValue: 0,
      leftEdge: 0,
      rightEdge: 1000,
    });

    expect(filled).toHaveLength(1);
    expect(filled[0].height).toBe(1);
  });

  test("a bin narrower than the gap keeps its whole width", () => {
    // Subtracting the separator unconditionally erases the series at a zoom
    // level where a bin is a fraction of a pixel.
    const { ctx, filled } = fakeContext();
    const squashed = (value: number) => value / 50;

    drawBarsScaled(ctx, [bar(100, -40)], squashed, yScale, {
      baselineValue: 0,
      leftEdge: 0,
      rightEdge: 1000,
    });

    expect(filled[0].width).toBeCloseTo(2);
  });

  test("an unmeasured bin is outlined rather than filled", () => {
    const { ctx, filled, stroked } = fakeContext();

    drawBarsScaled(
      ctx,
      [bar(100, -40, "rgb(136,136,136)", true)],
      identity,
      yScale,
      {
        baselineValue: 0,
        leftEdge: 0,
        rightEdge: 1000,
      },
    );

    expect(filled).toHaveLength(0);
    expect(stroked).toHaveLength(1);
  });
});
