import { STYLE } from "../../constants";
import { getLinearScale } from "../../draw/render_utils";
import { drawBox, drawLabel } from "../../draw/shapes";
import {
  ArcShape,
  arcRise,
  arcShapes,
  arcWidth,
} from "../../util/connection_arcs";
import {
  CONNECTION_COLORS,
  CONNECTION_KINDS,
} from "../../util/read_connections";
import { DataTrack } from "./base_tracks/data_track";

const LEFT_PX_EDGE = STYLE.yAxis.width;
/** Room under the arcs for the baseline and the stub labels. */
const BASELINE_PAD = 14;
/** How close the pointer must come to an arc for it to be the hovered one. */
const HOVER_SLOP = 6;

/** Widest a stub label is assumed to be when checking for a collision. */
const STUB_LABEL_WIDTH = 44;
const STUB_LEVELS = [0.45, 0.62, 0.79];

/**
 * Height for the next stub, avoiding the labels already placed.
 *
 * Stubs mark breakpoints whose partner is elsewhere, and those cluster: a
 * translocation and its reciprocal land within a few pixels of each other, and
 * two labels drawn at one height are unreadable.
 */
function stubHeight(x: number, placed: readonly number[]): number {
  const near = placed.filter(
    (other) => Math.abs(other - x) < STUB_LABEL_WIDTH,
  ).length;
  return STUB_LEVELS[near % STUB_LEVELS.length];
}

/**
 * Read connections drawn on the track's own x scale.
 *
 * The point of the track, as opposed to the side panel, is that a breakpoint
 * sits directly under the coverage bin that made it. So every position comes
 * from the shared scale and nothing here rescales or re-centres the view.
 */
export class ConnectionsTrack extends DataTrack {
  private hovered: ArcShape | null = null;
  private shapes: { shape: ArcShape; x1: number; x2: number; peak: number }[] =
    [];
  private getChromosome: () => string;
  private openConnection: ((id: string) => void) | null;

  constructor(
    id: string,
    label: string,
    trackType: TrackType,
    getSettings: () => DataTrackSettings,
    setExpanded: (isExpanded: boolean) => void,
    getXRange: () => Rng,
    getChromosome: () => string,
    getRenderData: () => Promise<ConnectionsTrackData>,
    openTrackContextMenu: (track: DataTrack) => void,
    getMarkerModeOn: () => boolean,
    getAnnotColorBands: () => RenderBand[],
    openConnection: ((id: string) => void) | null = null,
  ) {
    super(
      id,
      label,
      trackType,
      getXRange,
      () => getLinearScale(getXRange(), [LEFT_PX_EDGE, this.dimensions.width]),
      openTrackContextMenu,
      getSettings,
      setExpanded,
      (_height: number) => {
        console.warn("Set expanded height not used for connections tracks");
      },
      getMarkerModeOn,
      getAnnotColorBands,
    );
    this.getRenderData = getRenderData;
    this.getChromosome = getChromosome;
    this.openConnection = openConnection;
  }

  connectedCallback(): void {
    super.connectedCallback();
    const onExpand = () => this.render({});
    this.initializeExpander("contextmenu", onExpand);

    this.canvas.addEventListener(
      "mousemove",
      (event: MouseEvent) => {
        const found = this.shapeAt(event.offsetX, event.offsetY);
        if (found !== this.hovered) {
          this.hovered = found;
          this.canvas.style.cursor = found === null ? "auto" : "pointer";
          this.render({});
        }
      },
      { signal: this.getListenerAbortSignal() },
    );
    this.canvas.addEventListener(
      "mouseleave",
      () => {
        if (this.hovered !== null) {
          this.hovered = null;
          this.render({});
        }
      },
      { signal: this.getListenerAbortSignal() },
    );
    this.canvas.addEventListener(
      "click",
      (event: MouseEvent) => {
        const found = this.shapeAt(event.offsetX, event.offsetY);
        if (found !== null && this.openConnection !== null) {
          this.openConnection(found.connection.id);
        }
      },
      { signal: this.getListenerAbortSignal() },
    );
  }

  /**
   * The arc nearest the pointer, if the pointer is close enough to one.
   *
   * Distance is measured to the drawn curve rather than to its bounding box, so
   * the gap under a tall arc does not claim clicks meant for the arc below it.
   */
  private shapeAt(x: number, y: number): ArcShape | null {
    let best: { shape: ArcShape; distance: number } | null = null;
    for (const entry of this.shapes) {
      const distance = this.distanceToArc(entry, x, y);
      if (
        distance <= HOVER_SLOP &&
        (best === null || distance < best.distance)
      ) {
        best = { shape: entry.shape, distance };
      }
    }
    return best === null ? null : best.shape;
  }

  private distanceToArc(
    entry: { shape: ArcShape; x1: number; x2: number; peak: number },
    x: number,
    y: number,
  ): number {
    const baseline = this.dimensions.height - BASELINE_PAD;
    if (entry.shape.kind === "stub") {
      const withinX = Math.abs(x - entry.x1);
      const withinY =
        y > entry.peak && y < baseline
          ? 0
          : Math.min(Math.abs(y - entry.peak), Math.abs(y - baseline));
      return Math.hypot(withinX, withinY);
    }
    if (x < entry.x1 || x > entry.x2) {
      return Number.POSITIVE_INFINITY;
    }
    // A quadratic curve at parameter t, solved for the x the pointer is over.
    const span = entry.x2 - entry.x1;
    const t = span === 0 ? 0 : (x - entry.x1) / span;
    const curveY =
      (1 - t) * (1 - t) * baseline +
      2 * (1 - t) * t * (entry.peak - (baseline - entry.peak)) +
      t * t * baseline;
    return Math.abs(y - curveY);
  }

  override draw(data: TrackData) {
    const renderData = data as ConnectionsTrackData;
    super.syncDimensions();
    super.drawStart();

    const xRange = this.getXRange();
    const xScale = this.getXScale();
    const width = this.dimensions.width;
    const height = this.dimensions.height;
    const baseline = height - BASELINE_PAD;

    if (renderData.unavailable !== null) {
      drawBox(
        this.ctx,
        { x1: LEFT_PX_EDGE, x2: width, y1: 0, y2: height },
        {
          fillColor: STYLE.colors.lightGray,
          borderColor: STYLE.colors.lightGray,
          alpha: STYLE.tracks.backgroundColorTransparency,
        },
      );
      drawLabel(
        this.ctx,
        renderData.unavailable,
        (LEFT_PX_EDGE + width) / 2,
        height / 2,
        { textAlign: "center", textColor: STYLE.colors.darkGray },
      );
      this.shapes = [];
      super.drawEnd();
      return;
    }

    const shapes = arcShapes(
      renderData.connections,
      this.getChromosome(),
      xRange,
    );

    this.shapes = [];
    const laneWidth = width - LEFT_PX_EDGE;
    const usable = baseline - 2;
    const stubLabelXs: number[] = [];

    for (const shape of shapes) {
      const color = CONNECTION_COLORS[shape.connection.kind];
      const isHovered = this.hovered?.connection.id === shape.connection.id;
      const lineWidth =
        arcWidth(shape.connection.fragments) + (isHovered ? 1.5 : 0);

      if (shape.kind === "stub") {
        const x = xScale(shape.from);
        // Stubs close together get different heights, so their labels sit
        // side by side instead of on top of one another.
        const peak = baseline - usable * stubHeight(x, stubLabelXs);
        this.ctx.save();
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.setLineDash([3, 3]);
        this.ctx.beginPath();
        this.ctx.moveTo(x, baseline);
        this.ctx.lineTo(x, peak);
        this.ctx.stroke();
        this.ctx.restore();
        drawLabel(this.ctx, shape.awayLabel, x, peak - 4, {
          textAlign: "center",
          textColor: color,
        });
        stubLabelXs.push(x);
        this.shapes.push({ shape, x1: x, x2: x, peak });
        continue;
      }

      const x1 = xScale(shape.from);
      const x2 = xScale(shape.to);
      const peak = baseline - usable * arcRise(x2 - x1, laneWidth);

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.globalAlpha = isHovered ? 1 : 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, baseline);
      // Control point is pulled twice as far as the peak, because a quadratic
      // curve reaches only half way to it.
      this.ctx.quadraticCurveTo(
        (x1 + x2) / 2,
        peak - (baseline - peak),
        x2,
        baseline,
      );
      this.ctx.stroke();
      this.ctx.restore();

      // Feet, so a breakpoint stays findable when the arc is very flat.
      for (const foot of [x1, x2]) {
        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(foot, baseline, 2.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }

      this.shapes.push({ shape, x1, x2, peak });
    }

    this.ctx.save();
    this.ctx.strokeStyle = STYLE.colors.lightGray;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(LEFT_PX_EDGE, baseline);
    this.ctx.lineTo(width, baseline);
    this.ctx.stroke();
    this.ctx.restore();

    if (shapes.length === 0) {
      drawLabel(
        this.ctx,
        "No read connections here",
        (LEFT_PX_EDGE + width) / 2,
        height / 2,
        { textAlign: "center", textColor: STYLE.colors.darkGray },
      );
    }

    if (renderData.truncated) {
      drawLabel(this.ctx, "Showing part of this window", width - 6, 12, {
        textAlign: "right",
        textColor: STYLE.colors.darkGray,
      });
    }

    if (this.hovered !== null) {
      const c = this.hovered.connection;
      const support =
        c.fragments === null
          ? "support not reported"
          : `${c.fragments} fragments`;
      drawLabel(
        this.ctx,
        `${CONNECTION_KINDS[c.kind]} · ${support} · ${c.id}`,
        LEFT_PX_EDGE + 6,
        12,
        { textAlign: "left", textColor: STYLE.colors.black },
      );
    }

    super.drawEnd();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

customElements.define("connections-track", ConnectionsTrack);
