import { TrackView } from "./track_view";

/**
 * Annotation background colouring after the view moves.
 *
 * The colour bands come from annotation tracks, and annotation requests are
 * scoped to the region in view rather than the whole chromosome. They were
 * refreshed only when the chromosome, the samples or the chosen colouring
 * changed, so panning into a region that had never been fetched kept the
 * previous region's bands and coloured the background from data that does not
 * describe what is on screen.
 */

function makeView(
  chromosome: string,
  range: Rng,
  colorAnnotations: string[] = ["repeats"],
) {
  return Object.assign(Object.create(TrackView.prototype), {
    sessionPos: {
      getChromosome: () => chromosome,
      getXRange: () => range,
    },
    session: {
      profile: { getColorAnnotations: () => colorAnnotations },
    },
    colorBandsCoverage: null,
  });
}

describe("colour band freshness", () => {
  test("nothing has been fetched yet, so a fetch is needed", () => {
    expect(makeView("1", [1000, 2000]).colorBandsAreStale()).toBe(true);
  });

  test("a view inside what was fetched needs no refetch", () => {
    const view = makeView("1", [1200, 1800]);
    view.colorBandsCoverage = { chromosome: "1", range: [1000, 2000] };

    expect(view.colorBandsAreStale()).toBe(false);
  });

  test("panning past the fetched window needs a refetch", () => {
    // The reported bug: the chromosome is unchanged, so none of the explicit
    // flags fire, and the background keeps the previous region's colouring.
    const view = makeView("1", [2500, 3500]);
    view.colorBandsCoverage = { chromosome: "1", range: [1000, 2000] };

    expect(view.colorBandsAreStale()).toBe(true);
  });

  test("panning back past the fetched start needs a refetch", () => {
    const view = makeView("1", [500, 1500]);
    view.colorBandsCoverage = { chromosome: "1", range: [1000, 2000] };

    expect(view.colorBandsAreStale()).toBe(true);
  });

  test("zooming out past the fetched window needs a refetch", () => {
    const view = makeView("1", [1, 100000]);
    view.colorBandsCoverage = { chromosome: "1", range: [1000, 2000] };

    expect(view.colorBandsAreStale()).toBe(true);
  });

  test("another chromosome needs a refetch", () => {
    const view = makeView("2", [1200, 1800]);
    view.colorBandsCoverage = { chromosome: "1", range: [1000, 2000] };

    expect(view.colorBandsAreStale()).toBe(true);
  });

  test("with no colouring chosen there is nothing to fetch", () => {
    // Otherwise every pan would ask for annotations nobody is showing.
    expect(makeView("1", [1000, 2000], []).colorBandsAreStale()).toBe(false);
  });
});
