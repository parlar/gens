import { getOverlapInfo, getTrackHeight } from "../../util/expand_track_utils";
import {
  getBandYScale,
  rangeInRange,
  rangeSurroundsRange,
} from "../../util/utils";
import { COLORS, STYLE } from "../../constants";
import { getLinearScale } from "../../draw/render_utils";
import { drawLabel, drawLine, drawArrow } from "../../draw/shapes";
import { DataTrack } from "./base_tracks/data_track";

/**
 * What a band is drawn in when it carries no colour of its own. Matches the
 * grey gens/models/annotation.py gives an annotation that names none, so a band
 * that reaches here uncoloured looks the same as one the backend defaulted.
 */
const DEFAULT_BAND_COLOR = "#808080";

const LEFT_PX_EDGE = STYLE.yAxis.width;

export class BandTrack extends DataTrack {
  openContextMenu: (id: string) => void;

  constructor(
    id: string,
    label: string,
    trackType: TrackType,
    getSettings: () => DataTrackSettings,
    setExpanded: (isExpanded: boolean) => void,
    setExpandedHeight: (expandedHeight: number) => void,
    getXRange: () => Rng,
    getRenderData: () => Promise<BandTrackData>,
    openContextMenu: (id: string) => void,
    openTrackContextMenu: ((track: DataTrack) => void) | null,
    getMarkerModeOn: () => boolean,
    getAnnotColorBands: () => RenderBand[],
  ) {
    super(
      id,
      label,
      trackType,
      getXRange,
      // FIXME: Supply xScale directly?
      () => {
        const xRange = getXRange();
        const xScale = getLinearScale(xRange, [
          LEFT_PX_EDGE,
          this.dimensions.width,
        ]);
        return xScale;
      },
      openTrackContextMenu,
      getSettings,
      setExpanded,
      setExpandedHeight,
      getMarkerModeOn,
      getAnnotColorBands,
    );

    this.getRenderData = getRenderData;
    this.openContextMenu = openContextMenu;
  }

  connectedCallback(): void {
    super.connectedCallback();

    const onElementClick = async (box: HoverBox) => {
      const element = box.element as RenderBand;
      this.openContextMenu(element.id);
    };

    this.initializeHoverTooltip();
    this.initializeClick(onElementClick);
    const onExpand = () => this.render({});
    this.initializeExpander("contextmenu", onExpand);
  }

  override draw(renderData: BandTrackData) {
    const { bands } = renderData;
    // First, sync to get the window size right
    this.syncDimensions();

    const xRange = this.getXRange();
    const ntsPerPx = this.getNtsPerPixel(xRange);
    const showDetails = ntsPerPx < STYLE.tracks.zoomLevel.showDetails;

    const bandsInView = bands
      .filter((band) => {
        const inRange = rangeInRange([band.start, band.end], xRange);
        const surrounding = rangeSurroundsRange([band.start, band.end], xRange);

        return inRange || surrounding;
      })
      .sort((r1, r2) => (r1.start < r2.start ? -1 : 1));

    const { numberLanes, bandOverlaps } = getOverlapInfo(bandsInView);

    const labelSize =
      this.getIsExpanded() && showDetails ? STYLE.tracks.textLaneSize : 0;

    this.setExpandedTrackHeight(numberLanes, showDetails);
    // Now we need to re-sync to get the expanded y-size correct
    this.syncDimensions();

    // Needs to be done after setting the height / syncing dimensions
    super.drawStart();

    const xScale = getLinearScale(xRange, [
      LEFT_PX_EDGE,
      this.dimensions.width,
    ]);

    const bandTopBottomPad =
      this.currentHeight > STYLE.bandTrack.dynamicPadThreshold
        ? STYLE.bandTrack.trackPadding
        : this.currentHeight / STYLE.bandTrack.dynamicPadFraction;

    const yScale = getBandYScale(
      bandTopBottomPad,
      this.getIsExpanded() || this.getSettings().yPadBands
        ? STYLE.bandTrack.bandPadding
        : 0,
      this.getIsExpanded() ? numberLanes : 1,
      this.dimensions.height,
      labelSize,
    );

    const renderBand: PositionedBand[] = bandsInView.map((band) => {
      if (bandOverlaps[band.id] == null) {
        throw Error(`Missing ID: ${band.id}`);
      }
      const bandNOverlap = bandOverlaps[band.id].lane;
      const yRange = yScale(bandNOverlap, this.getIsExpanded());

      const renderBand = Object.create(band);
      renderBand.y1 = yRange[0];
      renderBand.y2 = yRange[1];
      // A band that chose its own edge keeps it. This used to overwrite every
      // band's edgeColor unconditionally, which made the field impossible to
      // use from outside.
      renderBand.edgeColor = band.edgeColor ?? STYLE.bandTrack.edgeColor;
      // A band with no colour used to be drawn with whatever fillStyle the
      // previous band left on the context, so its appearance depended on what
      // happened to be next to it. Grey matches the colour the backend gives an
      // annotation that names none.
      renderBand.color = band.color ?? DEFAULT_BAND_COLOR;

      return renderBand;
    });

    const hoverTargets = renderBand.flatMap((band) => {
      const bandHoverTargets = drawBand(
        this.ctx,
        band,
        xScale,
        showDetails,
        this.getIsExpanded(),
        [LEFT_PX_EDGE, this.dimensions.width],
      );
      return bandHoverTargets;
    });

    this.setHoverTargets(hoverTargets);

    // Said plainly rather than left to be inferred from a gap: the bands that
    // arrived are a partial answer, and the reader cannot tell which part.
    if (renderData.incomplete != null) {
      drawLabel(
        this.ctx,
        renderData.incomplete,
        this.dimensions.width - 6,
        10,
        { textAlign: "right", textColor: COLORS.darkGray },
      );
    }

    this.drawEnd();
  }

  setExpandedTrackHeight(numberLanes: number, showDetails: boolean) {
    // A band track sizes itself to how many lanes its bands need. Once the
    // reader has dragged this track's boundary, that would undo the drag on
    // every redraw, so their height wins.
    if (this.getSettings().height.userResized) {
      this.syncHeight();
      return;
    }
    const style = STYLE.bandTrack;
    const height = STYLE.tracks.trackHeight.m;
    const expandedHeight = getTrackHeight(
      height,
      numberLanes,
      style.trackPadding,
      style.bandPadding,
      showDetails,
    );
    if (this.setExpandedHeight != null) {
      this.setExpandedHeight(expandedHeight);
    }
    this.syncHeight();
  }
}

/** Whether a band carries the exons that make it draw as a transcript. */
function asTranscript(band: PositionedBand): TranscriptBand | null {
  const hasExons = band.subFeatures != null && band.subFeatures.length > 0;
  return hasExons && band.exonCount != null ? (band as TranscriptBand) : null;
}

function drawBand(
  ctx: CanvasRenderingContext2D,
  band: PositionedBand,
  xScale: (position: number) => number,
  showDetails: boolean,
  isExpanded: boolean,
  screenRange?: Rng,
): HoverBox[] {
  const y1 = band.y1;
  const y2 = band.y2;
  const height = y2 - y1;

  const hoverBoxes: HoverBox[] = [];

  // Body
  const xPxRange: Rng = [xScale(band.start), xScale(band.end)];
  const [xPxStart, xPxEnd] = xPxRange;
  const width = Math.max(xPxEnd - xPxStart, STYLE.bandTrack.minBandWidth);
  const transcript = asTranscript(band);

  if (transcript === null || !showDetails) {
    ctx.fillStyle = band.color;
    ctx.fillRect(xPxStart, y1, width, height);
    // Outlined only when the band asked for it by setting a width. Bands have
    // always carried an edgeColor that nothing drew, so stroking every band
    // here would silently restyle every existing track.
    if (band.edgeWidth != null && band.edgeWidth > 0) {
      ctx.strokeStyle = band.edgeColor ?? STYLE.bandTrack.edgeColor;
      ctx.lineWidth = band.edgeWidth;
      const inset = band.edgeWidth / 2;
      ctx.strokeRect(
        xPxStart + inset,
        y1 + inset,
        Math.max(0, width - band.edgeWidth),
        Math.max(0, height - band.edgeWidth),
      );
    }
    const box = { x1: xPxStart, x2: xPxStart + width, y1, y2 };
    // A band with no hover text gets an empty tooltip, which is what the
    // undefined already produced: the DOM turns it into "" on assignment.
    const hoverBox: HoverBox = {
      box,
      label: band.hoverInfo ?? "",
      element: band,
    };
    hoverBoxes.push(hoverBox);
  }

  if (showDetails && transcript !== null) {
    const midY = y1 + height / 2;
    drawLine(
      ctx,
      { x1: xPxStart, x2: xPxEnd, y1: midY, y2: midY },
      { color: band.color, lineWidth: 2, transpose_05: false },
    );

    if (band.direction != null) {
      drawDirectionArrows(ctx, band, height, xPxRange, midY, band.color);
    }

    transcript.subFeatures.forEach((subBand) => {
      if (
        xScale(subBand.start) >= xPxRange[0] &&
        xScale(subBand.end) <= xPxRange[1]
      ) {
        const box = drawExon(
          ctx,
          transcript,
          subBand,
          xScale,
          band.color,
          y1,
          height,
        );
        hoverBoxes.push(box);
      }
    });

    hoverBoxes.push(...getIntronHoverBoxes(transcript, midY, xScale));
  }

  // Outside the transcript branch, where it used to sit: a band that carries a
  // label got one only if it happened to be a transcript, so every other band
  // set a label that nothing ever drew. Still only on an expanded track and
  // only at a zoom that shows detail, so a wide view does not fill with text.
  if (isExpanded && showDetails && band.label != null) {
    drawTrackLabel(ctx, screenRange, xPxRange, band.label, y2);
  }

  return hoverBoxes;
}

function drawDirectionArrows(
  ctx: CanvasRenderingContext2D,
  band: RenderBand,
  height: number,
  xPxRange: Rng,
  midY: number,
  detailColor: string,
) {
  const [xPxStart, xPxEnd] = xPxRange;
  const isForward = band.direction == "+";
  const spacing = STYLE.bandTrack.arrowSpacing;
  const arrowHeight = height * STYLE.bandTrack.arrowHeightFraction;
  let pos = isForward ? xPxStart + spacing : xPxEnd - spacing;
  while (
    isForward ? pos < xPxEnd - spacing / 2 : pos > xPxStart + spacing / 2
  ) {
    drawArrow(ctx, pos, midY, isForward ? 1 : -1, arrowHeight, {
      lineWidth: STYLE.bandTrack.arrowLineWidth,
      color: detailColor,
    });
    pos += isForward ? spacing : -spacing;
  }
}

function drawExon(
  ctx: CanvasRenderingContext2D,
  band: TranscriptBand,
  subBand: TranscriptFeature,
  xScale: Scale,
  detailColor: string,
  y1: number,
  height: number,
): HoverBox {
  const xPxStart = xScale(subBand.start);
  const xPxEnd = xScale(subBand.end);
  ctx.fillStyle = detailColor;
  const width = Math.max(xPxEnd - xPxStart, STYLE.bandTrack.minBandWidth);

  const drawHeight = height;
  const yStart = y1;
  const label = `Exon: ${subBand.exonNumber}/${band.exonCount}`;
  if (subBand.feature != null && subBand.feature !== "exon") {
    ctx.fillStyle = COLORS.lightGray;
  }
  ctx.fillRect(xPxStart, y1, width, drawHeight);

  const hoverBox = {
    box: { x1: xPxStart, x2: xPxEnd, y1: yStart, y2: yStart + drawHeight },
    label,
    element: band,
  };
  return hoverBox;
}

function drawTrackLabel(
  ctx: CanvasRenderingContext2D,
  screenRange: Rng | undefined,
  pxRange: Rng,
  label: string,
  y2: number,
) {
  const [xPxStart, xPxEnd] = pxRange;
  const labelRangeStart = screenRange
    ? Math.max(xPxStart, screenRange[0])
    : xPxStart;
  const labelRangeEnd = screenRange ? Math.min(xPxEnd, screenRange[1]) : xPxEnd;
  const mid = (labelRangeStart + labelRangeEnd) / 2;
  drawLabel(ctx, label, mid, y2, {
    textAlign: "center",
    textBaseline: "top",
  });
}

function getIntronHoverBoxes(
  band: TranscriptBand,
  midY: number,
  xScale: Scale,
): HoverBox[] {
  const exons = [...band.subFeatures].sort((a, b) => a.start - b.start);
  const introns: { start: number; end: number }[] = [];
  let prev = band.start;
  exons.forEach((e) => {
    if (e.start > prev) {
      introns.push({ start: prev, end: e.start });
    }
    prev = e.end;
  });
  if (band.end > prev) {
    introns.push({ start: prev, end: band.end });
  }

  const totalIntrons = band.exonCount - 1;

  const hoverBoxes = introns.map((intron, i) => {
    const x1 = xScale(intron.start);
    const x2 = xScale(intron.end);

    if (band.direction !== "+" && band.direction !== "-") {
      console.warn("Expected a band direction, found", band.direction);
    }

    const labelIndex = band.direction === "+" ? i + 1 : totalIntrons - i;

    return {
      box: { x1, x2, y1: midY - 2, y2: midY + 2 },
      label: `Intron ${labelIndex}/${totalIntrons}`,
      element: band,
    };
  });
  return hoverBoxes;
}

customElements.define("band-track", BandTrack);
