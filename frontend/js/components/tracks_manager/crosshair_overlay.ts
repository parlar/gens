import { COLORS, FONT_SIZE, SIZES, STYLE, ZINDICES } from "../../constants";
import {
  basePx,
  formatBase,
  isOverPlot,
  Pin,
  spans,
  visiblePins,
} from "../../util/crosshair";

/**
 * The crosshair drawn over the whole stack of tracks.
 *
 * One element across every track rather than one per track, so the line is
 * unbroken: a line that restarts at each track boundary is exactly as hard to
 * follow by eye as no line at all, which is the problem it exists to solve.
 *
 * Nothing here takes pointer events. The tracks underneath keep their panning,
 * their zooming and their tooltips, and the overlay only draws.
 */

const FOLLOWER_COLOR = COLORS.darkGray;
const PIN_COLOR = COLORS.teal;
const LABEL_BACKGROUND = "rgba(255,255,255,0.88)";

export class CrosshairOverlay {
  private root: HTMLDivElement;
  private follower: HTMLDivElement;
  private followerLabel: HTMLDivElement;
  private pinLayer: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: `${ZINDICES.trackMarkers}`,
      overflow: "hidden",
    });

    this.pinLayer = document.createElement("div");
    Object.assign(this.pinLayer.style, { position: "absolute", inset: "0" });

    this.follower = this.buildLine(FOLLOWER_COLOR, [3, 3]);
    this.followerLabel = this.buildLabel(FOLLOWER_COLOR);
    this.follower.appendChild(this.followerLabel);
    this.follower.hidden = true;

    this.root.append(this.pinLayer, this.follower);
    container.appendChild(this.root);
  }

  private buildLine(
    color: string,
    dash: [number, number] | null,
  ): HTMLDivElement {
    const line = document.createElement("div");
    Object.assign(line.style, {
      position: "absolute",
      top: "0",
      bottom: "0",
      width: "0",
      // A border rather than a background: a 1 px background on a fractional
      // left offset renders as a two-pixel smear on a scaled display.
      borderLeft: dash
        ? `${SIZES.one}px dashed ${color}`
        : `${SIZES.one}px solid ${color}`,
      pointerEvents: "none",
    });
    return line;
  }

  private buildLabel(color: string): HTMLDivElement {
    const label = document.createElement("div");
    Object.assign(label.style, {
      position: "absolute",
      top: "0",
      left: `${SIZES.xs}px`,
      padding: `0 ${SIZES.xxs}px`,
      font: STYLE.tracks.font,
      fontSize: `${FONT_SIZE.small}px`,
      color,
      background: LABEL_BACKGROUND,
      whiteSpace: "nowrap",
      borderRadius: `${SIZES.xxs}px`,
    });
    return label;
  }

  /** Follow the pointer, or hide when it leaves the plotted area. */
  showFollower(xPx: number, position: number, containerWidth: number): void {
    if (!isOverPlot(xPx, containerWidth, STYLE.yAxis.width)) {
      this.hideFollower();
      return;
    }
    this.follower.hidden = false;
    this.follower.style.left = `${xPx}px`;
    this.followerLabel.textContent = formatBase(position);
    // The label flips to the left of the line near the right edge, where it
    // would otherwise be cut off by the overflow that keeps it off the axis.
    const nearRightEdge = xPx > containerWidth - 90;
    this.followerLabel.style.left = nearRightEdge ? "" : `${SIZES.xs}px`;
    this.followerLabel.style.right = nearRightEdge ? `${SIZES.xs}px` : "";
  }

  hideFollower(): void {
    this.follower.hidden = true;
  }

  /** Redraw the pinned lines for the view now on screen. */
  renderPins(pins: Pin[], xRange: Rng, containerWidth: number): void {
    this.pinLayer.replaceChildren();
    const axis = STYLE.yAxis.width;

    for (const { pin, xPx } of visiblePins(
      pins,
      xRange,
      containerWidth,
      axis,
    )) {
      const line = this.buildLine(PIN_COLOR, null);
      line.style.left = `${xPx}px`;
      const label = this.buildLabel(PIN_COLOR);
      label.textContent = formatBase(pin.position);
      const nearRightEdge = xPx > containerWidth - 90;
      label.style.left = nearRightEdge ? "" : `${SIZES.xs}px`;
      label.style.right = nearRightEdge ? `${SIZES.xs}px` : "";
      line.appendChild(label);
      this.pinLayer.appendChild(line);
    }

    for (const span of spans(pins)) {
      const fromPx = basePx(span.from, xRange, containerWidth, axis);
      const toPx = basePx(span.to, xRange, containerWidth, axis);
      // Both ends off the same side means the span crosses nothing on screen.
      if (toPx < axis || fromPx > containerWidth) {
        continue;
      }
      this.pinLayer.appendChild(
        this.buildSpanLabel(span.label, fromPx, toPx, containerWidth),
      );
    }
  }

  /**
   * The distance between two pins, written between them.
   *
   * This is the number a reader came for: pin both edges of a coverage drop and
   * the size of the event is on screen, with no arithmetic on nine-digit
   * coordinates.
   */
  private buildSpanLabel(
    text: string,
    fromPx: number,
    toPx: number,
    containerWidth: number,
  ): HTMLDivElement {
    const label = this.buildLabel(PIN_COLOR);
    const midPx =
      (Math.max(fromPx, STYLE.yAxis.width) + Math.min(toPx, containerWidth)) /
      2;
    Object.assign(label.style, {
      left: `${midPx}px`,
      top: `${SIZES.l}px`,
      transform: "translateX(-50%)",
      fontWeight: `${600}`,
    });
    label.textContent = text;
    return label;
  }

  remove(): void {
    this.root.remove();
  }
}
