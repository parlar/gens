import {
  applyResize,
  applySavedHeights,
  heightInUse,
  MAX_TRACK_HEIGHT,
  MIN_TRACK_HEIGHT,
  resizedHeight,
  resizedHeights,
} from "./track_resize";

/**
 * Heights otherwise come from three settings shared by every track of a kind.
 * That is right for keeping a row of samples comparable and wrong when one
 * track is the one being read, so a drag has to set that track alone and then
 * survive everything that pushes the shared settings back onto it.
 */

const track = (
  trackId: string,
  overrides: Partial<DataTrackSettings> = {},
): DataTrackSettings => ({
  trackId,
  trackLabel: trackId,
  trackType: "dot-cov",
  height: { collapsedHeight: 45, expandedHeight: 200 },
  showLabelWhenCollapsed: true,
  isExpanded: false,
  isHidden: false,
  ...overrides,
});

describe("the height a drag produces", () => {
  test("dragging down makes the track taller", () => {
    expect(resizedHeight(100, 40)).toBe(140);
  });

  test("dragging up makes it shorter", () => {
    expect(resizedHeight(100, -40)).toBe(60);
  });

  test("a track cannot be dragged away to nothing", () => {
    expect(resizedHeight(100, -500)).toBe(MIN_TRACK_HEIGHT);
  });

  test("a track cannot be dragged past the point of being undoable", () => {
    // Past this it pushes everything else off screen, and the boundary that
    // would undo it is no longer reachable.
    expect(resizedHeight(100, 100_000)).toBe(MAX_TRACK_HEIGHT);
  });

  test("the height is a whole number of pixels", () => {
    expect(resizedHeight(100, 40.6)).toBe(141);
  });
});

describe("which of the two heights a drag changes", () => {
  test("a collapsed track reports and changes its collapsed height", () => {
    const collapsed = track("cov");

    expect(heightInUse(collapsed)).toBe(45);
    applyResize(collapsed, 90);

    expect(collapsed.height.collapsedHeight).toBe(90);
    // The other one is untouched: writing it would move a track the reader is
    // not looking at.
    expect(collapsed.height.expandedHeight).toBe(200);
  });

  test("an expanded track reports and changes its expanded height", () => {
    const expanded = track("cov", { isExpanded: true });

    expect(heightInUse(expanded)).toBe(200);
    applyResize(expanded, 300);

    expect(expanded.height.expandedHeight).toBe(300);
    expect(expanded.height.collapsedHeight).toBe(45);
  });

  test("an expanded track with no expanded height falls back to the collapsed one", () => {
    const noExpanded = track("genes", {
      isExpanded: true,
      height: { collapsedHeight: 20 },
    });

    expect(heightInUse(noExpanded)).toBe(20);
  });

  test("a drag marks the track as the reader's own", () => {
    // The flag is what stops the shared settings and a band track's own lane
    // arithmetic from overwriting the drag on the next redraw.
    const dragged = track("cov");
    applyResize(dragged, 90);

    expect(dragged.height.userResized).toBe(true);
  });
});

describe("what survives a reload", () => {
  test("only tracks the reader dragged are written to the layout", () => {
    // Writing every track would freeze the shared settings out for good.
    const dragged = applyResize(track("a"), 90);
    const untouched = track("b");

    expect(Object.keys(resizedHeights([dragged, untouched]))).toEqual(["a"]);
  });

  test("heights come back on the track they were set on", () => {
    const tracks = [track("a"), track("b")];
    applySavedHeights(tracks, {
      a: { collapsedHeight: 120, expandedHeight: 400, userResized: true },
    });

    expect(tracks[0].height.collapsedHeight).toBe(120);
    expect(tracks[1].height.collapsedHeight).toBe(45);
  });

  test("two tracks of the same kind keep different heights", () => {
    // The reason heights are keyed by the concrete track id: the rest of the
    // layout is keyed by kind and sample type, so all five relatives in a
    // pedigree share one key and would come back identical.
    const relatives = [
      track("case___NA12877___38_log2_cov"),
      track("case___NA12881___38_log2_cov"),
    ];
    applySavedHeights(relatives, {
      case___NA12877___38_log2_cov: {
        collapsedHeight: 150,
        userResized: true,
      },
    });

    expect(relatives[0].height.collapsedHeight).toBe(150);
    expect(relatives[1].height.collapsedHeight).toBe(45);
  });

  test("a layout saved before heights existed still loads", () => {
    const tracks = [track("a")];

    expect(() => applySavedHeights(tracks, undefined)).not.toThrow();
    expect(tracks[0].height.collapsedHeight).toBe(45);
  });

  test("a saved height for a track that is gone is ignored", () => {
    const tracks = [track("a")];
    applySavedHeights(tracks, {
      vanished: { collapsedHeight: 999, userResized: true },
    });

    expect(tracks[0].height.collapsedHeight).toBe(45);
  });

  test("a dragged height round-trips through save and load", () => {
    const saved = resizedHeights([
      applyResize(track("a", { isExpanded: true }), 333),
    ]);
    const fresh = [track("a", { isExpanded: true })];
    applySavedHeights(fresh, saved);

    expect(heightInUse(fresh[0])).toBe(333);
    expect(fresh[0].height.userResized).toBe(true);
  });
});
