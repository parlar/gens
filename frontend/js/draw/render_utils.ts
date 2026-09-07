import { rangeSize } from "../util/utils";
import { STYLE } from "../constants";
import { drawLabel, drawLine } from "./shapes";

export function drawYAxis(
  ctx: CanvasRenderingContext2D,
  ys: number[],
  yScale: Scale,
  yRange: Rng,
  label: string,
) {
  const style = STYLE.yAxis;
  drawLine(
    ctx,
    {
      x1: style.width,
      x2: style.width,
      y1: yScale(yRange[0]),
      y2: yScale(yRange[1]),
    },
    { color: style.backgroundColor },
  );

  for (const y of ys) {
    drawLabel(ctx, y.toString(), style.width - style.textPad, yScale(y), {
      textBaseline: "middle",
      textAlign: "right",
      withFrame: false,
    });
  }

  const midPoint = (yRange[1] + yRange[0]) / 2;

  drawLabel(ctx, label, 4, yScale(midPoint), {
    rotation: -Math.PI / 2,
    textAlign: "center",
    textBaseline: "top",
  });
}

export function renderBackground(
  ctx: CanvasRenderingContext2D,
  canvasDim: { height: number; width: number },
  color: string = STYLE.tracks.edgeColor,
) {
  const style = STYLE.tracks;
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, 0, canvasDim.width, canvasDim.height);
  ctx.strokeStyle = color;
  ctx.lineWidth = style.frameLineWidth;
  ctx.strokeRect(0, 0, canvasDim.width, canvasDim.height);
}

export function renderBand(
  ctx: CanvasRenderingContext2D,
  band: RenderBand,
  xScale: Scale,
) {
  const style = STYLE.bands;

  ctx.fillStyle = band.color;
  const xPxStart = xScale(band.start);
  const xPxEnd = xScale(band.end);
  ctx.fillStyle = band.color;
  const width = xPxEnd - xPxStart;
  const height = band.y2 - band.y1;
  ctx.fillRect(xPxStart, band.y1, width, height);
  ctx.strokeStyle = band.edgeColor || style.edgeColor;
  ctx.lineWidth = band.edgeWidth || style.edgeWidth;
  ctx.strokeRect(xPxStart, band.y1, width, height);
}

export function scaleToPixels(
  dataPos: number,
  dataSize: number,
  viewSize: number,
) {
  const scaleFactor = viewSize / dataSize;
  const pixelPos = dataPos * scaleFactor;
  return pixelPos;
}

/**
 * Given a data point (pos)
 * Within a range to display (range)
 * And the number of corresponding pixels (viewSize)
 * Where should the point go (return)
 */
export function getPixelPosInRange(
  pos: number,
  range: [number, number],
  viewSize: number,
): number {
  const viewPos = pos - range[0];
  const scaleFactor = viewSize / (range[1] - range[0]);
  const pixelPos = viewPos * scaleFactor;
  return pixelPos;
}

export function renderDots(
  ctx: CanvasRenderingContext2D,
  dots: RenderDot[],
  xRange: [number, number],
  yRange: [number, number],
  canvasDim: { width: number; height: number },
  dotSize: number = 4,
) {
  dots.forEach((dot) => {
    ctx.fillStyle = dot.color;
    const xPixel = getPixelPosInRange(dot.x, xRange, canvasDim.width);
    const yPixel = getPixelPosInRange(dot.y, yRange, canvasDim.height);
    ctx.fillRect(xPixel - dotSize / 2, yPixel - dotSize / 2, dotSize, dotSize);
  });
}

export function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  lineWidth: number,
  color: string = null,
  fillColor: string = null,
  open: boolean = false,
) {
  x = Math.floor(x);
  y = Math.floor(y);
  width = Math.floor(width);

  if (color !== null) ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;

  // define path to draw
  const path = new Path2D();

  // Draw box without left part, to allow stacking boxes
  // horizontally without getting double lines between them.
  if (open === true) {
    path.moveTo(x, y);
    path.lineTo(x + width, y);
    path.lineTo(x + width, y + height);
    path.lineTo(x, y + height);
    // Draw normal 4-sided box
  } else {
    path.rect(x, y, width, height);
  }
  ctx.stroke(path);
  if (fillColor !== null) {
    ctx.fillStyle = fillColor;
    ctx.fill(path);
  }
  return path;
}

export function linearScale(pos: number, dataRange: Rng, pxRange: Rng): number {
  const scaleFactor = rangeSize(pxRange) / rangeSize(dataRange);
  // We want non-zero data (-4, +3) to start from zero-coordinate
  const zeroBasedPos = pos - dataRange[0];
  const pxPos = zeroBasedPos * scaleFactor + pxRange[0];
  return pxPos;
}

export function drawDotsScaled(
  ctx: CanvasRenderingContext2D,
  dots: RenderDot[],
  xScale: Scale,
  yScale: Scale,
  settings: { size: number },
) {
  const { size } = settings;

  dots.forEach((dot) => {
    ctx.fillStyle = dot.color;
    const xPixel = xScale(dot.x);
    const yPixel = yScale(dot.y);

    ctx.fillRect(xPixel - size / 2, yPixel - size / 2, size, size);
  });
}

/**
 * Binned values as columns growing from a baseline.
 *
 * A bin sitting exactly on the baseline still gets a one-pixel column. Without
 * it an ordinary bin would draw nothing at all, and a run of ordinary bins would
 * be indistinguishable from a stretch with no data — which is the one confusion
 * this track exists to remove.
 *
 * The hairline gap between columns only appears once a column is wide enough to
 * spare it. Subtracting it unconditionally would erase the whole series at a
 * zoom level where a bin is a fraction of a pixel wide.
 */
export function drawBarsScaled(
  ctx: CanvasRenderingContext2D,
  bars: RenderBar[],
  xScale: Scale,
  yScale: Scale,
  settings: { baselineValue: number; leftEdge: number; rightEdge: number },
) {
  const { baselineValue, leftEdge, rightEdge } = settings;
  const baselinePixel = yScale(baselineValue);
  const GAP_APPEARS_ABOVE = 4;
  const GAP = 1;

  ctx.save();
  for (const bar of bars) {
    const rawLeft = xScale(bar.start);
    const rawRight = xScale(bar.end);
    if (rawRight < leftEdge || rawLeft > rightEdge) {
      continue;
    }
    // Clamped rather than skipped, so a bin straddling the edge of the view
    // still draws the part of itself that is inside it.
    const x1 = Math.max(leftEdge, rawLeft);
    const x2 = Math.min(rightEdge, rawRight);
    const full = x2 - x1;
    if (full <= 0) {
      continue;
    }
    const width = full > GAP_APPEARS_ABOVE ? full - GAP : full;

    const valuePixel = yScale(bar.y);
    const top = Math.min(valuePixel, baselinePixel);
    const height = Math.max(1, Math.abs(valuePixel - baselinePixel));

    if (bar.outlineOnly) {
      ctx.strokeStyle = bar.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1 + 0.5, top + 0.5, Math.max(1, width - 1), height - 1);
    } else {
      ctx.fillStyle = bar.color;
      ctx.fillRect(x1, top, width, height);
    }
  }
  ctx.restore();
}

/**
 * The bars' colours again, as an unbroken strip of full-width segments.
 *
 * A bar carries its colour in its own body, so a bin whose value sits on the
 * baseline has nowhere to show one: it draws as a hairline. That is exactly the
 * bin worth seeing — a bin where the shading disagrees with the height is a bin
 * where something is happening that the height alone does not report. Measured
 * on chr11:49,688,000-49,736,000, the bin holding the deletion's right
 * breakpoint is 80% deleted, and the nine heterozygous sites in the 4 kb that
 * survived put its bar back on the baseline, one pixel tall and strongly
 * coloured.
 *
 * The strip does not repeat the height, so it adds no second reading of the
 * same number: it is the covariate on its own, at a constant size, across every
 * bin in view.
 */
export function drawBinShadeStrip(
  ctx: CanvasRenderingContext2D,
  bars: RenderBar[],
  xScale: Scale,
  settings: {
    top: number;
    height: number;
    leftEdge: number;
    rightEdge: number;
  },
) {
  const { top, height, leftEdge, rightEdge } = settings;
  if (height <= 0) {
    return;
  }

  ctx.save();
  for (const bar of bars) {
    // No gap between segments: a run of low-coverage bins should read as one
    // stretch, which is the statement the strip exists to make.
    const x1 = Math.max(leftEdge, xScale(bar.start));
    const x2 = Math.min(rightEdge, xScale(bar.end));
    if (x2 <= x1) {
      continue;
    }
    if (bar.outlineOnly) {
      // Nothing was measured here, so nothing is claimed. Left blank rather
      // than filled neutral, which would assert ordinary coverage.
      continue;
    }
    ctx.fillStyle = bar.color;
    ctx.fillRect(x1, top, x2 - x1, height);
  }
  ctx.restore();
}

export function rgbArrayToString(rgbArray: number[]): string {
  return `rgb(${rgbArray[0]},${rgbArray[1]},${rgbArray[2]})`;
}

export function getLinearScale(
  origDomain: Rng,
  range: Rng,
  reverse: boolean = false,
): Scale {
  let domain = origDomain;
  if (reverse) {
    domain = [origDomain[1], origDomain[0]];
  }

  const scale = (pos: number) => {
    return linearScale(pos, domain, range);
  };
  return scale;
}

export function getColorScale(
  levels: string[],
  colorPool: string[],
  defaultColor: string,
): ColorScale {
  const colorScale = (level: string) => {
    const levelIndex = levels.indexOf(level);
    if (levelIndex == -1) {
      return defaultColor;
    } else if (levelIndex >= colorPool.length) {
      return defaultColor;
    } else {
      return colorPool[levelIndex];
    }
  };
  return colorScale;
}

export function drawArrow(
  ctx: CanvasRenderingContext2D,
  bandHeight: number,
  y1: number,
  isForward: boolean,
  xPxRange: Rng,
  color: string,
) {
  const [xPxStart, xPxEnd] = xPxRange;
  const arrowHeight = bandHeight;
  const arrowWidth = arrowHeight * 0.5;
  const arrowYCenter = y1 + bandHeight / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  if (isForward) {
    ctx.moveTo(xPxEnd + arrowWidth, arrowYCenter);
    ctx.lineTo(xPxEnd, arrowYCenter - arrowHeight / 2);
    ctx.lineTo(xPxEnd, arrowYCenter + arrowHeight / 2);
  } else {
    ctx.moveTo(xPxStart - arrowWidth, arrowYCenter);
    ctx.lineTo(xPxStart, arrowYCenter - arrowHeight / 2);
    ctx.lineTo(xPxStart, arrowYCenter + arrowHeight / 2);
  }
  ctx.closePath();
  ctx.fill();
}
