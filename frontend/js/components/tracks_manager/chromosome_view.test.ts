import { ChromosomeView } from "./chromosome_view";

/**
 * The multi-chromosome view builds its tracks once and labels them on every
 * render. The tracks were built for whichever sample happened to be first,
 * while the heading names the current main sample, so after switching samples
 * the view showed one patient's coverage under another patient's name — the
 * worst kind of wrong in a tool used to interpret a patient's genome.
 */

const sample = (sampleId: string, caseId = "case", genomeBuild = 38) => ({
  sampleId,
  caseId,
  genomeBuild,
});

function makeView(builtFor: unknown, main: unknown) {
  return Object.assign(Object.create(ChromosomeView.prototype), {
    builtForSample: builtFor,
    session: { getMainSample: () => main },
  });
}

describe("chromosome view sample binding", () => {
  test("tracks built for the sample now named are kept", () => {
    const view = makeView(sample("NA12879"), sample("NA12879"));

    expect(view.showsAnotherSampleThanItsLabel()).toBe(false);
  });

  test("a different sample id is caught", () => {
    const view = makeView(sample("NA12879"), sample("NA12882"));

    expect(view.showsAnotherSampleThanItsLabel()).toBe(true);
  });

  test("the same sample id in another case is caught", () => {
    // Sample ids are not unique across cases, so comparing them alone would
    // let one case's data sit under another case's heading.
    const view = makeView(
      sample("NA12879", "case-a"),
      sample("NA12879", "case-b"),
    );

    expect(view.showsAnotherSampleThanItsLabel()).toBe(true);
  });

  test("the same sample on another genome build is caught", () => {
    const view = makeView(
      sample("NA12879", "case", 37),
      sample("NA12879", "case", 38),
    );

    expect(view.showsAnotherSampleThanItsLabel()).toBe(true);
  });

  test("before anything is built there is nothing to rebuild", () => {
    const view = makeView(null, sample("NA12879"));

    expect(view.showsAnotherSampleThanItsLabel()).toBe(false);
  });
});
