import { ReadConnectionsPanel } from "./read_connections";
import { ReadConnection, ReadEvidence } from "../../util/read_connections";

describe("Compact connection panel", () => {
  const sample: Sample = {
    sampleId: "sample",
    caseId: "case",
    genomeBuild: 38,
  };
  const connection: ReadConnection = {
    id: "junction",
    kind: "split",
    fragments: 7,
    minimum_observed_mapq: 40,
    first: { chromosome: "1", start: 100, end: 100, strand: "+" },
    second: { chromosome: "2", start: 500, end: 510, strand: "-" },
  };
  const evidence: ReadEvidence = {
    chromosome: "1",
    start: 1,
    end: 1000,
    genome_build: 38,
    source_label: "connections.bedpe",
    records_examined: 1,
    truncated: false,
    connections: [connection],
  };
  let panel: ReadConnectionsPanel;
  let loadData: jest.Mock;
  let navigate: jest.Mock;
  let region: Region;
  const flush = async () => {
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    region = { chrom: "1", start: 1, end: 1000 };
    loadData = jest.fn().mockResolvedValue(evidence);
    navigate = jest.fn();
    panel = new ReadConnectionsPanel();
    panel.setSources({
      getSamples: () => [sample],
      getMainSample: () => sample,
      getRegion: () => region,
      getHighlights: () => [],
      getSampleLabel: (entry) => entry.sampleId,
      loadData,
      navigate,
      canNavigate: () => true,
    });
    document.body.appendChild(panel);
  });
  afterEach(() => {
    panel.remove();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("renders compact records, provenance, and endpoint navigation", async () => {
    await flush();
    expect(panel.shadowRoot.querySelector("#source").textContent).toContain(
      "connections.bedpe",
    );
    expect(panel.shadowRoot.querySelectorAll("path")).toHaveLength(1);
    expect(panel.shadowRoot.querySelector("#details").textContent).toContain(
      "500-510",
    );
    (
      panel.shadowRoot.querySelector(
        '[aria-label="Inspect endpoint 2"]',
      ) as HTMLButtonElement
    ).click();
    expect(navigate).toHaveBeenCalledWith(connection.second);
  });

  test("does not silently convert unknown counts to evidence", async () => {
    loadData.mockResolvedValue({
      ...evidence,
      connections: [
        {
          ...connection,
          kind: "unknown",
          fragments: null,
          minimum_observed_mapq: null,
        },
      ],
    });
    await flush();
    expect(panel.shadowRoot.querySelector("#rows").textContent).toContain(
      "Not reported",
    );
    expect(panel.shadowRoot.querySelector("#details").textContent).toContain(
      "Unspecified",
    );
  });

  test("shows partial results and pages without refetching", async () => {
    loadData.mockResolvedValue({
      ...evidence,
      truncated: true,
      connections: Array.from({ length: 51 }, (_, index) => ({
        ...connection,
        id: `link-${index}`,
      })),
    });
    await flush();
    expect(
      (panel.shadowRoot.querySelector("#warning") as HTMLElement).hidden,
    ).toBe(false);
    expect(panel.shadowRoot.querySelectorAll("#rows tr")).toHaveLength(50);
    (panel.shadowRoot.querySelector("#next") as HTMLButtonElement).click();
    expect(panel.shadowRoot.querySelectorAll("#rows tr")).toHaveLength(1);
    expect(loadData).toHaveBeenCalledTimes(1);
  });

  test("aborts old requests and ignores stale responses", async () => {
    let resolveOld: (value: ReadEvidence) => void;
    loadData.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    await flush();
    const oldSignal = loadData.mock.calls[0][3] as AbortSignal;
    region = { chrom: "2", start: 400, end: 600 };
    loadData.mockResolvedValue({ ...evidence, connections: [] });
    panel.render();
    await flush();
    resolveOld(evidence);
    await flush();
    expect(oldSignal.aborted).toBe(true);
    expect(panel.shadowRoot.querySelectorAll("path")).toHaveLength(0);
    expect(panel.shadowRoot.querySelector("#status").textContent).toContain(
      "No connections match",
    );
  });

  test("distinguishes a missing source and failed request", async () => {
    loadData.mockResolvedValueOnce(null);
    await flush();
    expect(panel.shadowRoot.querySelector("#status").textContent).toContain(
      "No compact evidence file",
    );
    jest.spyOn(console, "error").mockImplementation(() => {});
    loadData.mockRejectedValueOnce(new Error("offline"));
    (panel.shadowRoot.querySelector("#refresh") as HTMLButtonElement).click();
    await flush();
    expect(panel.shadowRoot.querySelector("#status").textContent).toContain(
      "Unable to load",
    );
  });

  test("blocks oversized intervals and invalid filters before fetching", async () => {
    region = { chrom: "1", start: 1, end: 1000001 };
    panel.render();
    await flush();
    expect(loadData).not.toHaveBeenCalled();
    expect(panel.shadowRoot.querySelector("#status").textContent).toContain(
      "at most",
    );
    region = { chrom: "1", start: 1, end: 1000 };
    const input = panel.shadowRoot.querySelector("#mapq") as HTMLInputElement;
    input.value = "-1";
    panel.render();
    await flush();
    expect(loadData).not.toHaveBeenCalled();
  });
});
