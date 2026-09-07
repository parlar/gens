import { GenePanelNavigator } from "./gene_panel";

describe("Gene panel navigator", () => {
  const genes: ApiPanelGene[] = [
    {
      symbol: "CASQ2",
      chromosome: "1",
      start: 115_700_021,
      end: 115_768_714,
      is_mane: true,
    },
    {
      symbol: "LMNA",
      chromosome: "1",
      start: 156_114_711,
      end: 156_140_081,
      is_mane: true,
    },
    {
      symbol: "TNNT2",
      chromosome: "1",
      start: 201_359_014,
      end: 201_377_680,
      is_mane: false,
    },
  ];

  let panel: GenePanelNavigator;
  let navigate: jest.Mock;

  const flush = async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const shadow = () => panel.shadowRoot as ShadowRoot;
  const rows = () => [...shadow().querySelectorAll<HTMLButtonElement>(".gene")];
  const focused = () =>
    (shadow().activeElement as HTMLElement | null)?.textContent?.trim() ?? null;
  const press = (target: Element, key: string) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );

  beforeEach(async () => {
    // The Keep zoom choice is remembered between sessions on purpose, so it
    // also survives between tests unless cleared.
    window.localStorage.clear();
    navigate = jest.fn();
    panel = new GenePanelNavigator();
    panel.setSources({
      getPanels: async () => [{ id: "demo", name: "Demo", version: "2.0" }],
      loadGenes: async () => ({
        panel_id: "demo",
        version: "2.0",
        genome_build: 38,
        genes,
        missing: ["NOTAREALGENE"],
      }),
      getChromSize: () => 248_956_422,
      getCurrentRegion: () => ({
        chrom: "1",
        start: 1_000_001,
        end: 1_060_000,
      }),
      navigate,
    });
    document.body.append(panel);
    await flush();
    const select = shadow().querySelector("#panel") as HTMLSelectElement;
    select.value = "demo";
    select.dispatchEvent(new Event("change"));
    await flush();
  });

  afterEach(() => panel.remove());

  test("shows the panel in genomic order, with what it could not place", () => {
    expect(rows().map((row) => row.dataset.symbol)).toEqual([
      "CASQ2",
      "LMNA",
      "TNNT2",
    ]);
    expect(shadow().querySelector("#status")?.textContent).toContain("3 genes");
    expect(shadow().querySelector("#missing-count")?.textContent).toContain(
      "1 not placed",
    );
  });

  test("tells the reader which keys work", () => {
    // Discoverable in the panel rather than hidden in a tooltip.
    const hint = shadow().querySelector("#hint") as HTMLElement;
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toContain("Enter");
  });

  test("arrow down from the search box moves into the list", () => {
    const filter = shadow().querySelector("#filter") as HTMLInputElement;
    press(filter, "ArrowDown");
    expect(focused()).toContain("CASQ2");
  });

  test("arrow keys move the highlight without moving the view", () => {
    const filter = shadow().querySelector("#filter") as HTMLInputElement;
    press(filter, "ArrowDown");
    press(rows()[0], "ArrowDown");
    expect(focused()).toContain("LMNA");
    press(rows()[1], "ArrowUp");
    expect(focused()).toContain("CASQ2");
    // Looking is not leaping: nothing has been opened yet.
    expect(navigate).not.toHaveBeenCalled();
  });

  test("arrow keys stop at the ends of the list", () => {
    press(rows()[0], "ArrowUp");
    expect(focused()).toContain("CASQ2");
    rows()[2].focus();
    press(rows()[2], "ArrowDown");
    expect(focused()).toContain("TNNT2");
  });

  test("opening a gene keeps the current zoom and centres it", () => {
    // The default. Walking a panel is usually a comparison, and reframing at
    // every gene makes a dip look deeper or shallower purely because the
    // neighbouring gene is a different size.
    rows()[1].click();
    const [region] = navigate.mock.calls[0];

    expect(region.end - region.start + 1).toBe(60_000);
    expect(region.start).toBeLessThan(156_109_637);
    expect(region.end).toBeGreaterThan(156_145_155);
    expect(rows()[1].getAttribute("aria-current")).toBe("true");
  });

  test("unticking Keep zoom frames the gene with flanking sequence", () => {
    const keepZoom = shadow().querySelector("#keep-zoom") as HTMLInputElement;
    keepZoom.checked = false;
    keepZoom.dispatchEvent(new Event("change"));

    rows()[1].click();
    // LMNA spans 25,371 bases, so the flank is a fifth of that.
    expect(navigate).toHaveBeenCalledWith({
      chrom: "1",
      start: 156_109_637,
      end: 156_145_155,
    });
  });

  test("stepping between two genes does not change the scale", () => {
    // The reason the default changed: the same window is used for both, so the
    // two coverage tracks can be read against each other.
    rows()[0].click();
    rows()[2].click();
    const widths = navigate.mock.calls.map(
      ([region]) => region.end - region.start + 1,
    );
    expect(new Set(widths).size).toBe(1);
  });

  test("n and p step, and keep the focus inside the list", () => {
    rows()[0].focus();
    press(rows()[0], "n");
    expect(shadow().querySelector("#position")?.textContent).toBe("2 / 3");
    expect(focused()).toContain("LMNA");
    press(rows()[1], "p");
    expect(shadow().querySelector("#position")?.textContent).toBe("1 / 3");
    expect(focused()).toContain("CASQ2");
  });

  test("typing a symbol never steps the walk", () => {
    // n and p are letters; a reader searching for a gene must be able to type
    // them without being thrown somewhere else in the genome.
    const filter = shadow().querySelector("#filter") as HTMLInputElement;
    filter.focus();
    press(filter, "n");
    press(filter, "p");
    expect(navigate).not.toHaveBeenCalled();
  });

  test("filtering narrows the walk to what is shown", () => {
    const filter = shadow().querySelector("#filter") as HTMLInputElement;
    filter.value = "tnn";
    filter.dispatchEvent(new Event("input"));
    expect(rows().map((row) => row.dataset.symbol)).toEqual(["TNNT2"]);
    expect(shadow().querySelector("#position")?.textContent).toBe("– / 1");
  });

  test("marks a gene placed without a MANE transcript", () => {
    expect(rows()[2].textContent).toContain("no MANE");
    expect(rows()[1].textContent).not.toContain("no MANE");
  });
});

describe("Gene panel keyboard focus", () => {
  // Filtering rebuilds the rows. If focus is not put back, the arrow keys stop
  // moving the highlight and start zooming the genome, which is a silent and
  // very confusing change of meaning.
  const genes: ApiPanelGene[] = [
    {
      symbol: "CASQ2",
      chromosome: "1",
      start: 115_700_021,
      end: 115_768_714,
      is_mane: true,
    },
    {
      symbol: "LMNA",
      chromosome: "1",
      start: 156_114_711,
      end: 156_140_081,
      is_mane: true,
    },
    {
      symbol: "TNNT2",
      chromosome: "1",
      start: 201_359_014,
      end: 201_377_680,
      is_mane: true,
    },
  ];
  let panel: GenePanelNavigator;
  const flush = async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  };
  const shadow = () => panel.shadowRoot as ShadowRoot;
  const rows = () => [...shadow().querySelectorAll<HTMLButtonElement>(".gene")];
  const setFilter = (value: string) => {
    const filter = shadow().querySelector("#filter") as HTMLInputElement;
    filter.value = value;
    filter.dispatchEvent(new Event("input"));
  };

  beforeEach(async () => {
    // The Keep zoom choice is remembered between sessions on purpose, so it
    // also survives between tests unless cleared.
    window.localStorage.clear();
    panel = new GenePanelNavigator();
    panel.setSources({
      getPanels: async () => [{ id: "demo", name: "Demo", version: "2.0" }],
      loadGenes: async () => ({
        panel_id: "demo",
        version: "2.0",
        genome_build: 38,
        genes,
        missing: [],
      }),
      getChromSize: () => 248_956_422,
      getCurrentRegion: () => ({
        chrom: "1",
        start: 1_000_001,
        end: 1_060_000,
      }),
      navigate: jest.fn(),
    });
    document.body.append(panel);
    await flush();
    const select = shadow().querySelector("#panel") as HTMLSelectElement;
    select.value = "demo";
    select.dispatchEvent(new Event("change"));
    await flush();
  });

  afterEach(() => panel.remove());

  test("keeps focus on the same gene when a filter still shows it", () => {
    rows()[2].focus();
    setFilter("tnn");
    expect(shadow().activeElement).toBe(rows()[0]);
    expect(rows()[0].dataset.symbol).toBe("TNNT2");
  });

  test("keeps focus in the list when the filter hides the focused gene", () => {
    rows()[0].focus();
    setFilter("lmna");
    expect(shadow().activeElement).toBe(rows()[0]);
    expect(rows()[0].dataset.symbol).toBe("LMNA");
  });

  test("does not grab focus when the reader was not in the list", () => {
    (shadow().querySelector("#filter") as HTMLInputElement).focus();
    setFilter("lmna");
    expect(shadow().activeElement).toBe(shadow().querySelector("#filter"));
  });
});
