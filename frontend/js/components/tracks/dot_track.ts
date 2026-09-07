import { STYLE } from "../../constants";
import {
  drawBarsScaled,
  drawBinShadeStrip,
  drawDotsScaled,
  getLinearScale,
} from "../../draw/render_utils";
import { drawBox, drawLabel } from "../../draw/shapes";
import { COVERAGE_SHADE_STOPS } from "../../util/het_density";
import { DataTrack } from "./base_tracks/data_track";

/**
 * Height of the strip repeating each bin's shade under the plot.
 *
 * It lives in the track's bottom padding, which is SIZES.s, so it fits without
 * taking room from the data.
 */
const SHADE_STRIP_HEIGHT = 5;

export class DotTrack extends DataTrack {
  startExpanded: boolean;
  /**
   * Keep the colour each dot carries instead of forcing black.
   *
   * Coverage and BAF dots are uniform, so this track normally paints them all
   * black and reserves red for values clamped outside the y range. A track
   * whose dots differ in meaning, such as heterozygote density marking
   * depleted bins, sets this so its own colours survive.
   */
  private keepDotColors: boolean;

  constructor(
    id: string,
    label: string,
    trackType: TrackType,
    getSettings: () => DataTrackSettings,
    setExpanded: (isExpanded: boolean) => void,
    getXRange: () => Rng,
    getRenderData: () => Promise<DotTrackData>,
    openTrackContextMenu: (track: DataTrack) => void,
    getMarkerModeOn: () => boolean,
    getAnnotColorBands: () => RenderBand[],
    keepDotColors: boolean = false,
  ) {
    super(
      id,
      label,
      trackType,
      getXRange,
      () => {
        // const xRange = this.renderData.xRange;
        const xRange = getXRange();
        const yAxisWidth = STYLE.yAxis.width;
        const xScale = getLinearScale(xRange, [
          yAxisWidth,
          this.dimensions.width,
        ]);
        return xScale;
      },
      openTrackContextMenu,
      getSettings,
      setExpanded,
      (_height: number) => {
        console.warn("Set expanded height not used for dot tracks");
      },
      getMarkerModeOn,
      getAnnotColorBands,
    );
    this.getRenderData = getRenderData;
    this.keepDotColors = keepDotColors;
  }

  connectedCallback(): void {
    super.connectedCallback();

    const onExpand = () => this.render({});
    this.initializeExpander("contextmenu", onExpand);
  }

  override draw(renderData: DotTrackData) {
    super.syncDimensions();
    super.drawStart();

    const { dots, bars, shaded } = renderData;

    const xRange = this.getXRange();
    const xScale = this.getXScale();
    const yScale = this.getYScale();

    const dotsInRange = dots.filter(
      (dot) => dot.x >= xRange[0] && dot.x <= xRange[1],
    );

    const dotsTruncatedY = dotsInRange.map((dot) => {
      const yRange = this.getYRange();
      const copy = {
        ...dot,
        color: this.keepDotColors ? dot.color : STYLE.colors.black,
      };
      if (dot.y < yRange[0]) {
        copy.y = yRange[0];
        copy.color = STYLE.colors.red;
      } else if (dot.y > yRange[1]) {
        copy.y = yRange[1];
        copy.color = STYLE.colors.red;
      }
      return copy;
    });

    // Painted under the dots so a shaded span never hides a computed value.
    for (const span of shaded ?? []) {
      const x1 = xScale(span.start);
      const x2 = xScale(span.end);
      if (x2 <= x1) {
        continue;
      }
      drawBox(
        this.ctx,
        { x1, x2, y1: 0, y2: this.dimensions.height },
        {
          fillColor: span.color,
          borderColor: span.color,
          alpha: STYLE.tracks.backgroundColorTransparency,
        },
      );
    }

    // One label for the whole run, so a fully uninterpretable track says so
    // instead of looking like one that failed to load.
    const widest = (shaded ?? [])
      .filter((span) => span.label != null)
      .reduce<ShadedRange | null>(
        (best, span) =>
          best == null || span.end - span.start > best.end - best.start
            ? span
            : best,
        null,
      );
    if (widest != null) {
      const x1 = Math.max(xScale(widest.start), STYLE.yAxis.width);
      const x2 = xScale(widest.end);
      if (x2 - x1 > 120) {
        drawLabel(
          this.ctx,
          widest.label,
          (x1 + x2) / 2,
          this.dimensions.height / 2,
          { textAlign: "center", textColor: STYLE.colors.darkGray },
        );
      }
    }

    if (bars != null && bars.length > 0) {
      // A binned series, drawn to the width of its bins. The baseline is the
      // axis's own highlighted line where it has one, so a column grows from
      // the value the reader is already comparing against.
      const highlighted = this.getYAxis()?.highlightedYs;
      const baselineValue = highlighted?.length ? highlighted[0] : 0;
      drawBarsScaled(this.ctx, bars, xScale, yScale, {
        baselineValue,
        leftEdge: STYLE.yAxis.width,
        rightEdge: this.dimensions.width,
      });
      // In the padding below the plotting area, so it never covers a bar and a
      // bar never covers it. A bin whose height lands on the baseline shows its
      // colour here and nowhere else.
      drawBinShadeStrip(this.ctx, bars, xScale, {
        top: this.dimensions.height - SHADE_STRIP_HEIGHT - 1,
        height: SHADE_STRIP_HEIGHT,
        leftEdge: STYLE.yAxis.width,
        rightEdge: this.dimensions.width,
      });
      this.drawCoverageShadeKey();
    }

    drawDotsScaled(this.ctx, dotsTruncatedY, xScale, yScale, {
      size: STYLE.dotTrack.dotSize,
    });

    super.drawEnd();
  }

  /**
   * A key for what the bar colours mean, drawn in the track itself.
   *
   * A colour encoding with no key is a colour encoding the reader has to guess,
   * and the whole point of shading these bars is to answer a question without
   * looking anywhere else. Skipped when the track is collapsed or too narrow,
   * where drawing it would cover the data it explains.
   */
  private drawCoverageShadeKey() {
    const KEY_WIDTH = 128;
    const SWATCH = 8;
    const MARGIN = 6;
    if (
      this.dimensions.width - STYLE.yAxis.width < KEY_WIDTH * 2 ||
      this.dimensions.height < 60
    ) {
      return;
    }

    const right = this.dimensions.width - MARGIN;
    const top = MARGIN;
    const stops = COVERAGE_SHADE_STOPS;
    const rampWidth = 48;
    const rampLeft = right - rampWidth;

    this.ctx.save();
    // Left to right runs depleted to ordinary, matching the order of the stops.
    const gradient = this.ctx.createLinearGradient(rampLeft, 0, right, 0);
    gradient.addColorStop(0, stops[0].color);
    gradient.addColorStop(1, stops[stops.length - 1].color);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(rampLeft, top, rampWidth, SWATCH);
    this.ctx.restore();

    drawLabel(this.ctx, "coverage", rampLeft - 4, top + SWATCH / 2, {
      textAlign: "right",
      textBaseline: "middle",
      textColor: STYLE.colors.darkGray,
    });
    drawLabel(this.ctx, stops[0].label, rampLeft, top + SWATCH + 9, {
      textAlign: "left",
      textColor: STYLE.colors.darkGray,
    });
    drawLabel(
      this.ctx,
      stops[stops.length - 1].label,
      right,
      top + SWATCH + 9,
      { textAlign: "right", textColor: STYLE.colors.darkGray },
    );
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

customElements.define("dot-track", DotTrack);
