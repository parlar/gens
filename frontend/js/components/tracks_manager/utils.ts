import { STYLE } from "../../constants";
import { GensSession } from "../../state/gens_session";
import { DataTrack } from "../tracks/base_tracks/data_track";
import { OverviewTrack } from "../tracks/overview_track";
import { DataTrackWrapper } from "./track_view";

const trackHeight = STYLE.tracks.trackHeight;

export const TRACK_HANDLE_CLASS = "track-handle";
export const TRACK_RESIZE_CLASS = "track-resize";

/** How tall the strip you can grab is. Small enough not to steal ordinary clicks. */
const RESIZE_GRIP_PX = 6;

export function makeTrackContainer(
  track: DataTrack,
  sample: Sample | null,
  onResize?: (heightPx: number) => void,
): DataTrackWrapper {
  const wrapper = createDataTrackWrapper(track, onResize);
  return {
    track,
    container: wrapper,
    sample,
  };
}

export function createOverviewTrack(
  id: string,
  label: string,
  getData: () => Promise<Record<string, RenderDot[]>>,
  yRange: Rng,
  chromSizes: Record<string, number>,
  chromClick: (chrom: string) => void,
  session: GensSession,
  yAxis: Axis,
): OverviewTrack {
  const overviewTrack = new OverviewTrack(
    id,
    label,
    { height: trackHeight.xl },
    chromSizes,
    chromClick,
    yRange,
    async () => {
      return {
        dotsPerChrom: await getData(),
        xRange: session.pos.getXRange(),
        chromosome: session.pos.getChromosome(),
        sampleLabel: session.getDisplaySampleLabel(session.getMainSample()),
      };
    },
    () => {
      const xRange = session.pos.getXRange();
      const chrom = session.pos.getChromosome();
      return {
        chrom,
        start: xRange[0],
        end: xRange[1],
      };
    },
    true,
    yAxis,
  );
  return overviewTrack;
}

export function createDataTrackWrapper(
  track: DataTrack,
  onResize?: (heightPx: number) => void,
) {
  const wrapper = document.createElement("div");
  wrapper.id = `${track.id}-container`;
  // wrapper.classList.add("track-wrapper");
  wrapper.style.position = "relative";
  wrapper.appendChild(track);

  const handle = document.createElement("div");
  handle.className = TRACK_HANDLE_CLASS;
  handle.style.position = "absolute";
  handle.style.top = "0";
  handle.style.left = "0";
  handle.style.width = `${STYLE.yAxis.width}px`;
  handle.style.height = "100%";
  wrapper.appendChild(handle);

  if (onResize != null) {
    wrapper.appendChild(createResizeGrip(wrapper, onResize));
  }

  return wrapper;
}

/**
 * The strip along a track's lower edge that resizes it.
 *
 * It starts where the reorder handle ends, so the two do not compete for the
 * bottom-left corner: dragging the left column reorders, dragging the boundary
 * resizes.
 *
 * The pointer is captured for the length of the drag, so a fast movement that
 * leaves the strip does not drop it, and the height comes from the wrapper's
 * measured box rather than from the settings, so what the reader drags is what
 * they can see.
 */
function createResizeGrip(
  wrapper: HTMLDivElement,
  onResize: (heightPx: number) => void,
): HTMLDivElement {
  const grip = document.createElement("div");
  grip.className = TRACK_RESIZE_CLASS;
  grip.title = "Drag to resize this track";
  grip.style.position = "absolute";
  grip.style.left = `${STYLE.yAxis.width}px`;
  grip.style.right = "0";
  grip.style.bottom = `-${Math.floor(RESIZE_GRIP_PX / 2)}px`;
  grip.style.height = `${RESIZE_GRIP_PX}px`;
  grip.style.cursor = "ns-resize";
  // Above the track's own canvas, or the canvas swallows the pointerdown.
  grip.style.zIndex = "2";
  grip.style.touchAction = "none";

  // Shown on hover rather than always: a line under every track would read as
  // part of the plot, and the cursor already says the boundary is grabbable.
  const showGrip = (visible: boolean) => {
    grip.style.background = visible ? STYLE.colors.teal : "transparent";
  };
  showGrip(false);
  grip.addEventListener("pointerenter", () => showGrip(true));
  grip.addEventListener("pointerleave", () => {
    if (startY === null) {
      showGrip(false);
    }
  });

  let startY: number | null = null;
  let startHeight = 0;

  grip.addEventListener("pointerdown", (event) => {
    // The container's own drag-to-zoom and the sortable reorder both listen
    // further up; neither should see a resize.
    event.stopPropagation();
    event.preventDefault();
    startY = event.clientY;
    startHeight = wrapper.getBoundingClientRect().height;
    grip.setPointerCapture(event.pointerId);
  });

  grip.addEventListener("pointermove", (event) => {
    if (startY === null) {
      return;
    }
    event.stopPropagation();
    onResize(startHeight + (event.clientY - startY));
  });

  const finish = (event: PointerEvent) => {
    if (startY === null) {
      return;
    }
    startY = null;
    showGrip(false);
    if (grip.hasPointerCapture(event.pointerId)) {
      grip.releasePointerCapture(event.pointerId);
    }
  };
  grip.addEventListener("pointerup", finish);
  grip.addEventListener("pointercancel", finish);

  return grip;
}
