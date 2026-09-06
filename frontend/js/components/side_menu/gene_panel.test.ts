import { GenePanelNavigator } from "./gene_panel";

describe("Gene panel navigator", () => {
  const genes: ApiPanelGene[] = [
    { symbol: "CASQ2", chromosome: "1", start: 115_700_021, end: 115_768_714, is_mane: true },
    { symbol: "LMNA", chromosome: "1", start: 156_114_711, end: 156_140_081, is_mane: true },
    { symbol: "TNNT2", chromosome: "1", start: 201_359_014, end: 201_377_680, is_mane: false },
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
      new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }),
    );

  beforeEach(async () => {
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
    expect(shadow().querySelector("#missing-count")?.textContent).toContain("1 not placed");
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

  test("opening a gene frames it with flanking sequence", () => {
    rows()[1].click();
    // LMNA spans 25,371 bases, so the flank is a fifth of that.
    expect(navigate).toHaveBeenCalledWith({
      chrom: "1",
      start: 156_109_637,
      end: 156_145_155,
    });
    expect(rows()[1].getAttribute("aria-current")).toBe("true");
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
    { symbol: "CASQ2", chromosome: "1", start: 115_700_021, end: 115_768_714, is_mane: true },
    { symbol: "LMNA", chromosome: "1", start: 156_114_711, end: 156_140_081, is_mane: true },
    { symbol: "TNNT2", chromosome: "1", start: 201_359_014, end: 201_377_680, is_mane: true },
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
    panel = new GenePanelNavigator();
    panel.setSources({
      getPanels: async () => [{ id: "demo", name: "Demo", version: "2.0" }],
      loadGenes: async () => ({
        panel_id: "demo", version: "2.0", genome_build: 38, genes, missing: [],
      }),
      getChromSize: () => 248_956_422,
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
