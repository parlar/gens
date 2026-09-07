import { BafHistogramPanel } from "./baf_histogram";
import { requireElement, requireShadow } from "../../util/dom";

describe("BAF histogram panel", () => {
  let panel: BafHistogramPanel;
  let region: Region;
  let loadData: jest.Mock;
  let pickRegion: jest.Mock;
  let picking: boolean;
  const samples: Sample[] = [
    { sampleId: "proband", caseId: "case", genomeBuild: 38 },
    { sampleId: "parent", caseId: "case", genomeBuild: 38 },
  ];

  let lastPick: ((region: Region) => void) | null = null;

  const flush = async () => {
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
  };
  const select = (id: string, value: string) => {
    const input = requireElement(requireShadow(panel), id) as HTMLSelectElement;
    input.value = value;
    input.dispatchEvent(new Event("change"));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    region = { chrom: "1", start: 100, end: 200 };
    loadData = jest.fn().mockResolvedValue([{ pos: 150, value: 0.5 }]);
    picking = false;
    pickRegion = jest.fn((onPicked: (region: Region) => void) => {
      picking = true;
      lastPick = onPicked;
    });
    panel = new BafHistogramPanel();
    panel.setSources({
      getSamples: () => samples,
      getMainSample: () => samples[0],
      getRegion: () => region,
      getHighlights: () => [
        { id: "highlight", chromosome: "2", range: [300, 400], color: "blue" },
      ],
      getSampleLabel: (sample) => sample.sampleId,
      loadData,
      pickRegion,
      isPickingRegion: () => picking,
    });
    document.body.appendChild(panel);
  });

  afterEach(() => {
    panel.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("loads the visible interval and rebins without another request", async () => {
    expect(
      requireElement(requireShadow(panel), "#status").textContent,
    ).toContain("Loading");
    await flush();
    expect(loadData).toHaveBeenCalledWith(
      samples[0],
      region,
      expect.any(AbortSignal),
    );
    expect(requireElement(requireShadow(panel), "#status").textContent).toBe(
      "1 site",
    );
    expect(requireShadow(panel).querySelectorAll("rect")).toHaveLength(50);
    select("#bins", "20");
    expect(requireShadow(panel).querySelectorAll("rect")).toHaveLength(20);
    expect(loadData).toHaveBeenCalledTimes(1);
  });

  test("selects samples and highlights independently of the visible interval", async () => {
    await flush();
    select("#sample", "case___parent___38");
    select("#interval", "highlight");
    await flush();
    expect(loadData).toHaveBeenLastCalledWith(
      samples[1],
      { chrom: "2", start: 300, end: 400 },
      expect.any(AbortSignal),
    );
  });

  test("ignores a stale response after navigation and aborts its request", async () => {
    let resolveOld: (data: ApiCoverageDot[]) => void;
    loadData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    await flush();
    const oldSignal = loadData.mock.calls[0][2] as AbortSignal;
    region = { chrom: "2", start: 300, end: 400 };
    loadData.mockResolvedValue([
      { pos: 350, value: 0.3 },
      { pos: 360, value: 0.7 },
    ]);
    panel.render();
    await flush();
    resolveOld([{ pos: 150, value: 0.5 }]);
    await flush();
    expect(oldSignal.aborted).toBe(true);
    expect(requireElement(requireShadow(panel), "#status").textContent).toBe(
      "2 sites",
    );
  });

  test("reports empty data and invalid BAF ranges", async () => {
    loadData.mockResolvedValue([]);
    await flush();
    expect(
      requireElement(requireShadow(panel), "#status").textContent,
    ).toContain("No BAF sites");
    select("#minimum", "1");
    expect(
      (requireElement(requireShadow(panel), "#validation") as HTMLElement)
        .hidden,
    ).toBe(false);
    expect(requireShadow(panel).querySelectorAll("rect")).toHaveLength(0);
  });

  test("supports retry after an error", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    loadData.mockRejectedValueOnce(new Error("offline"));
    await flush();
    expect(
      requireElement(requireShadow(panel), "#status").textContent,
    ).toContain("Unable to load");
    (
      requireElement(requireShadow(panel), "#refresh") as HTMLButtonElement
    ).click();
    await flush();
    expect(requireElement(requireShadow(panel), "#status").textContent).toBe(
      "1 site",
    );
  });

  test("cancels requests when the panel is detached", async () => {
    await flush();
    const signal = loadData.mock.calls[0][2] as AbortSignal;
    panel.remove();
    expect(signal.aborted).toBe(true);
  });

  const typeRegion = (value: string) => {
    const input = requireElement(
      requireShadow(panel),
      "#custom-region",
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event("change"));
  };
  const regionError = () =>
    requireElement(requireShadow(panel), "#region-validation") as HTMLElement;

  test("measures a region the reader types, not only the visible one", async () => {
    await flush();
    loadData.mockClear();
    select("#interval", "custom");
    typeRegion("2:1,000-2,000");
    await flush();

    expect(loadData).toHaveBeenCalledWith(
      samples[0],
      { chrom: "2", start: 1000, end: 2000 },
      expect.anything(),
    );
    expect(regionError().hidden).toBe(true);
  });

  test("starts the typed region from where the reader is looking", async () => {
    await flush();
    select("#interval", "custom");
    await flush();
    const input = requireElement(
      requireShadow(panel),
      "#custom-region",
    ) as HTMLInputElement;
    // Shows the format by example, so a small edit is enough to get going.
    expect(input.value).toBe("1:100-200");
  });

  test("measures nothing while the typed region is unusable", async () => {
    await flush();
    select("#interval", "custom");
    typeRegion("2:5000-1000");
    await flush();
    loadData.mockClear();
    await flush();

    // Drawing the previous region under the new label would be a wrong answer,
    // not a stale one.
    expect(loadData).not.toHaveBeenCalled();
    expect(regionError().hidden).toBe(false);
    expect(regionError().textContent).toMatch(/end must not come before/);
    expect(requireElement(requireShadow(panel), "#region").textContent).toBe(
      "",
    );
  });

  test("recovers once the region is corrected", async () => {
    await flush();
    select("#interval", "custom");
    typeRegion("banana:1-2");
    await flush();
    expect(regionError().hidden).toBe(false);

    loadData.mockClear();
    typeRegion("2:1000-2000");
    await flush();
    expect(regionError().hidden).toBe(true);
    expect(loadData).toHaveBeenCalledWith(
      samples[0],
      { chrom: "2", start: 1000, end: 2000 },
      expect.anything(),
    );
  });

  test("hides the region box unless it is being used", async () => {
    await flush();
    const field = requireElement(
      requireShadow(panel),
      "#custom-field",
    ) as HTMLElement;
    expect(field.hidden).toBe(true);
    select("#interval", "custom");
    await flush();
    expect(field.hidden).toBe(false);
    select("#interval", "view");
    await flush();
    expect(field.hidden).toBe(true);
  });

  test("hands the region pick to the tracks and uses what comes back", async () => {
    await flush();
    loadData.mockClear();
    (
      requireElement(requireShadow(panel), "#pick") as HTMLButtonElement
    ).click();
    await flush();

    expect(pickRegion).toHaveBeenCalledTimes(1);
    expect(
      (
        requireElement(requireShadow(panel), "#pick") as HTMLElement
      ).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      (requireElement(requireShadow(panel), "#pick-hint") as HTMLElement)
        .hidden,
    ).toBe(false);

    // The reader drags on the tracks; the range arrives here.
    picking = false;
    lastPick({ chrom: "2", start: 5000, end: 6000 } as Region);
    await flush();

    const interval = requireElement(
      requireShadow(panel),
      "#interval",
    ) as HTMLSelectElement;
    expect(interval.value).toBe("custom");
    expect(
      (
        requireElement(
          requireShadow(panel),
          "#custom-region",
        ) as HTMLInputElement
      ).value,
    ).toBe("2:5,000-6,000");
    expect(loadData).toHaveBeenCalledWith(
      samples[0],
      { chrom: "2", start: 5000, end: 6000 },
      expect.anything(),
    );
  });

  test("a picked region can then be edited by hand", async () => {
    await flush();
    (
      requireElement(requireShadow(panel), "#pick") as HTMLButtonElement
    ).click();
    picking = false;
    lastPick({ chrom: "2", start: 5000, end: 6000 } as Region);
    await flush();

    loadData.mockClear();
    typeRegion("2:5,000-5,500");
    await flush();
    expect(loadData).toHaveBeenCalledWith(
      samples[0],
      { chrom: "2", start: 5000, end: 5500 },
      expect.anything(),
    );
  });

  test("exports the displayed bins and interval metadata", async () => {
    await flush();
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const create = jest.fn().mockReturnValue("blob:histogram");
    URL.createObjectURL = create;
    URL.revokeObjectURL = jest.fn();
    const click = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    try {
      (
        requireElement(requireShadow(panel), "#export") as HTMLButtonElement
      ).click();
      const blob = create.mock.calls[0][0] as Blob;
      const reader = new FileReader();
      const content = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
      });
      reader.readAsText(blob);
      const csv = await content;
      expect(csv).toContain(
        "chromosome,start,end,genome_build,resolution,baf_min,baf_max,count",
      );
      expect(csv).toContain("1,100,200,38,d,0.5,0.52,1");
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      jest.runOnlyPendingTimers();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
