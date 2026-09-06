import { STYLE } from "../../constants";
import { drawDotsScaled, getLinearScale } from "../../draw/render_utils";
import { drawBox, drawLabel } from "../../draw/shapes";
import { DataTrack } from "./base_tracks/data_track";

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

    const { dots, shaded } = renderData;

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

    drawDotsScaled(this.ctx, dotsTruncatedY, xScale, yScale, {
      size: STYLE.dotTrack.dotSize,
    });

    super.drawEnd();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
  }
}

customElements.define("dot-track", DotTrack);
