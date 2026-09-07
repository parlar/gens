/**
 * Resizing one track by dragging its lower boundary.
 *
 * Heights otherwise come from three settings shared by every track of a kind,
 * which is right for keeping a row of samples comparable and wrong when one
 * track is the one being read. A drag sets that track alone, and a track that
 * has never been dragged keeps following the shared setting.
 */

/** Below this a track has no room to draw anything worth looking at. */
export const MIN_TRACK_HEIGHT = 20;

/**
 * Above this a single track pushes everything else off screen, and the drag
 * that did it is hard to undo because the boundary is no longer reachable.
 */
export const MAX_TRACK_HEIGHT = 1000;

/** The height a drag of `deltaPx` from `startHeight` should produce. */
export function resizedHeight(startHeight: number, deltaPx: number): number {
  const wanted = Math.round(startHeight + deltaPx);
  return Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, wanted));
}

/**
 * Which of a track's two heights a drag changes.
 *
 * A track has one height while collapsed and another while expanded, and only
 * the one on screen is being dragged. Writing the other would move a track the
 * reader is not looking at.
 */
export function heightInUse(settings: DataTrackSettings): number {
  if (settings.isExpanded && settings.height.expandedHeight != null) {
    return settings.height.expandedHeight;
  }
  return settings.height.collapsedHeight;
}

/**
 * Record a dragged height on the track's settings.
 *
 * `userResized` is what separates a height the reader chose from one the
 * defaults produced. It decides two things: that this track's height is written
 * to the saved layout, and that a band track stops recomputing its own expanded
 * height from its lane count, which would otherwise undo the drag on the next
 * redraw.
 */
export function applyResize(
  settings: DataTrackSettings,
  height: number,
): DataTrackSettings {
  if (settings.isExpanded) {
    settings.height.expandedHeight = height;
  } else {
    settings.height.collapsedHeight = height;
  }
  settings.height.userResized = true;
  return settings;
}

/** Heights the reader set by hand, keyed by track, for the saved layout. */
export function resizedHeights(
  tracks: DataTrackSettings[],
): Record<string, ExpandedTrackHeight> {
  const heights: Record<string, ExpandedTrackHeight> = {};
  for (const track of tracks) {
    if (track.height.userResized) {
      heights[track.trackId] = { ...track.height };
    }
  }
  return heights;
}

/**
 * Put saved heights back onto the tracks they belong to.
 *
 * Keyed by the concrete track id rather than the portable id the rest of the
 * layout uses. The portable id names a kind and a sample type, so all five
 * relatives in a pedigree share one, and keying heights that way would make
 * "resize this track" mean "resize these five" as soon as the page reloaded.
 * The cost is that a profile carried to another case brings no heights with it,
 * and those tracks fall back to the shared settings, which is what they use
 * today anyway.
 */
export function applySavedHeights(
  tracks: DataTrackSettings[],
  heights: Record<string, ExpandedTrackHeight> | undefined,
): DataTrackSettings[] {
  if (heights == null) {
    return tracks;
  }
  for (const track of tracks) {
    const saved = heights[track.trackId];
    if (saved == null) {
      continue;
    }
    track.height = { ...track.height, ...saved };
  }
  return tracks;
}
