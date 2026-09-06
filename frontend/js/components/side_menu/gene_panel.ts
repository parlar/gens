import { COLORS, ICONS } from "../../constants";
import {
  filterGenes,
  geneRegion,
  positionLabel,
  stepIndex,
} from "../../util/gene_panel";
import { ShadowBaseElement } from "../util/shadowbaseelement";

interface GenePanelSources {
  getPanels: () => Promise<ApiGeneList[] | null>;
  loadGenes: (
    panelId: string,
    version: string,
    signal: AbortSignal,
  ) => Promise<ApiPanelGenes | null>;
  getChromSize: (chromosome: string) => number | null;
  navigate: (region: Region) => void;
}

const template = document.createElement("template");
template.innerHTML = String.raw`
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :host { display: block; min-width: 0; color: ${COLORS.black}; font-weight: 400; }
    * { box-sizing: border-box; }
    label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    select, input, button { font: inherit; color: inherit; }
    select, input { width: 100%; min-width: 0; height: 32px; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; background: white; padding: 4px; }
    .fields { display: grid; gap: 12px; }
    #status { margin: 12px 0 8px; line-height: 1.5; overflow-wrap: anywhere; }
    #status[data-error] { color: #a12622; }
    .stepper { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .stepper #position { font-variant-numeric: tabular-nums; min-width: 72px; text-align: center; }
    button { height: 32px; min-width: 32px; background: ${COLORS.extraLightGray}; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; cursor: pointer; }
    button:disabled { opacity: 0.4; cursor: default; }
    button:hover:not(:disabled) { background: ${COLORS.lighterGray}; }
    :focus-visible { outline: 2px solid ${COLORS.teal}; outline-offset: 2px; }
    #genes { list-style: none; margin: 0; padding: 0; max-height: 46vh; overflow-y: auto; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; }
    #genes:empty { display: none; }
    #genes li { border-bottom: 1px solid ${COLORS.extraLightGray}; }
    #genes li:last-child { border-bottom: none; }
    .gene { display: flex; align-items: baseline; gap: 8px; width: 100%; border: none; border-radius: 0; background: none; text-align: left; padding: 6px 10px; height: auto; }
    .gene:hover { background: ${COLORS.extraLightGray}; }
    .gene[aria-current="true"] { background: ${COLORS.lighterGray}; font-weight: 600; }
    .gene .symbol { flex: 0 0 auto; }
    .gene .locus { flex: 1 1 auto; text-align: right; font-variant-numeric: tabular-nums; color: ${COLORS.darkGray}; font-size: 0.85em; }
    .gene .weak { color: #8a6d00; font-size: 0.85em; }
    #missing { margin-top: 10px; font-size: 0.9em; color: ${COLORS.darkGray}; }
    #missing ul { margin: 6px 0 0; padding-left: 18px; overflow-wrap: anywhere; }
    #missing summary { cursor: pointer; }
    [hidden] { display: none !important; }
  </style>
  <div class="fields">
    <label>Panel<select id="panel" aria-label="Gene panel"></select></label>
    <label>Find gene<input id="filter" type="search" placeholder="Symbol" aria-label="Filter panel genes"></label>
  </div>
  <div id="status" role="status" aria-live="polite"></div>
  <div class="stepper">
    <button id="previous" title="Previous gene (p)" aria-label="Previous gene" disabled><span class="fas ${ICONS.left}" aria-hidden="true"></span></button>
    <span id="position">0 / 0</span>
    <button id="next" title="Next gene (n)" aria-label="Next gene" disabled><span class="fas ${ICONS.right}" aria-hidden="true"></span></button>
  </div>
  <ul id="genes"></ul>
  <details id="missing" hidden>
    <summary><span id="missing-count"></span></summary>
    <ul id="missing-list"></ul>
  </details>
`;

export class GenePanelNavigator extends ShadowBaseElement {
  private sources: GenePanelSources;
  private panelSelect: HTMLSelectElement;
  private filterInput: HTMLInputElement;
  private status: HTMLDivElement;
  private previousButton: HTMLButtonElement;
  private nextButton: HTMLButtonElement;
  private position: HTMLSpanElement;
  private geneList: HTMLUListElement;
  private missing: HTMLDetailsElement;
  private missingCount: HTMLSpanElement;
  private missingList: HTMLUListElement;

  private panels: ApiGeneList[] = [];
  private genes: ApiPanelGene[] = [];
  private missingSymbols: string[] = [];
  private currentSymbol: string | null = null;
  private request: AbortController | null = null;
  private loadedPanelId = "";

  constructor() {
    super(template);
    this.panelSelect = this.root.querySelector("#panel");
    this.filterInput = this.root.querySelector("#filter");
    this.status = this.root.querySelector("#status");
    this.previousButton = this.root.querySelector("#previous");
    this.nextButton = this.root.querySelector("#next");
    this.position = this.root.querySelector("#position");
    this.geneList = this.root.querySelector("#genes");
    this.missing = this.root.querySelector("#missing");
    this.missingCount = this.root.querySelector("#missing-count");
    this.missingList = this.root.querySelector("#missing-list");
  }

  setSources(sources: GenePanelSources) {
    this.sources = sources;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addElementListener(this.panelSelect, "change", () => this.loadPanel());
    this.addElementListener(this.filterInput, "input", () => this.drawList());
    this.addElementListener(this.previousButton, "click", () => this.step(-1));
    this.addElementListener(this.nextButton, "click", () => this.step(1));
    void this.loadPanels();
  }

  /** Step to the next or previous gene. Also reachable from the n and p keys. */
  step(delta: number) {
    const visible = this.visibleGenes();
    const next = stepIndex(this.currentIndex(visible), visible.length, delta);
    if (next < 0) {
      return;
    }
    this.open(visible[next]);
  }

  hasGenes(): boolean {
    return this.genes.length > 0;
  }

  render() {
    // The panel keeps its own state; a redraw of the viewer does not change it.
    this.drawList();
  }

  private visibleGenes(): ApiPanelGene[] {
    return filterGenes(this.genes, this.filterInput.value);
  }

  /**
   * Position of the open gene within what is currently shown.
   *
   * Tracked by symbol rather than index so that typing in the filter does not
   * silently move the reader to a different gene.
   */
  private currentIndex(visible: ApiPanelGene[]): number {
    if (this.currentSymbol === null) {
      return -1;
    }
    return visible.findIndex((gene) => gene.symbol === this.currentSymbol);
  }

  private open(gene: ApiPanelGene) {
    this.currentSymbol = gene.symbol;
    this.sources.navigate(
      geneRegion(gene, this.sources.getChromSize(gene.chromosome)),
    );
    this.drawList();
  }

  private async loadPanels() {
    // A missing endpoint arrives as null rather than as a thrown error, so an
    // absent result has to be handled as carefully as a failed one.
    let panels: ApiGeneList[] | null = null;
    try {
      panels = await this.sources.getPanels();
    } catch {
      this.setStatus("Could not load gene panels.", true);
      return;
    }
    if (panels === null) {
      this.setStatus("Could not load gene panels.", true);
      return;
    }
    this.panels = panels;
    if (this.panels.length === 0) {
      this.setStatus(
        "No gene panels available. Gens reads panels from the connected interpretation software.",
      );
      this.panelSelect.disabled = true;
      return;
    }
    this.panelSelect.replaceChildren(
      new Option("Select a panel", ""),
      ...this.panels.map(
        (panel) => new Option(`${panel.name} (v${panel.version})`, panel.id),
      ),
    );
    this.setStatus("Select a panel to step through its genes.");
  }

  private async loadPanel() {
    const panelId = this.panelSelect.value;
    this.request?.abort();
    this.currentSymbol = null;
    this.genes = [];
    this.missingSymbols = [];
    this.loadedPanelId = panelId;
    if (panelId === "") {
      this.setStatus("Select a panel to step through its genes.");
      this.drawList();
      return;
    }

    const panel = this.panels.find((entry) => entry.id === panelId);
    this.setStatus("Loading panel…");
    this.request = new AbortController();
    try {
      const result = await this.sources.loadGenes(
        panelId,
        panel?.version ?? "",
        this.request.signal,
      );
      // A slower earlier request must not overwrite a newer panel's genes.
      if (this.loadedPanelId !== panelId) {
        return;
      }
      if (result === null) {
        this.setStatus("This panel is not available from Gens.", true);
        this.drawList();
        return;
      }
      this.genes = result.genes;
      this.missingSymbols = result.missing;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        return;
      }
      this.setStatus("Could not load this panel's genes.", true);
      this.drawList();
      return;
    }

    const placed = `${this.genes.length} gene${this.genes.length === 1 ? "" : "s"}`;
    const version = panel?.version ? ` · panel v${panel.version}` : "";
    this.setStatus(`${placed}${version}`);
    this.drawList();
  }

  private setStatus(text: string, isError = false) {
    this.status.textContent = text;
    if (isError) {
      this.status.setAttribute("data-error", "");
    } else {
      this.status.removeAttribute("data-error");
    }
  }

  private drawList() {
    const visible = this.visibleGenes();
    const index = this.currentIndex(visible);

    this.position.textContent = positionLabel(index, visible.length);
    this.previousButton.disabled = visible.length === 0 || index === 0;
    this.nextButton.disabled =
      visible.length === 0 || (index >= 0 && index === visible.length - 1);

    const rows = visible.map((gene) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "gene";
      button.type = "button";
      if (gene.symbol === this.currentSymbol) {
        button.setAttribute("aria-current", "true");
      }

      const symbol = document.createElement("span");
      symbol.className = "symbol";
      symbol.textContent = gene.symbol;
      button.append(symbol);

      if (!gene.is_mane) {
        // Placed from a non-MANE transcript, so the span is a weaker claim
        // about where the gene is. Worth seeing before trusting the framing.
        const weak = document.createElement("span");
        weak.className = "weak";
        weak.textContent = "no MANE";
        weak.title = "Placed from the widest transcript; no MANE Select found";
        button.append(weak);
      }

      const locus = document.createElement("span");
      locus.className = "locus";
      locus.textContent = `${gene.chromosome}:${gene.start.toLocaleString()}`;
      button.append(locus);

      button.addEventListener("click", () => this.open(gene), {
        signal: this.getListenerAbortSignal(),
      });
      item.append(button);
      return item;
    });
    this.geneList.replaceChildren(...rows);

    const current = this.geneList.querySelector('[aria-current="true"]');
    current?.scrollIntoView({ block: "nearest" });

    this.drawMissing();
  }

  private drawMissing() {
    if (this.missingSymbols.length === 0) {
      this.missing.hidden = true;
      return;
    }
    this.missing.hidden = false;
    this.missingCount.textContent = `${this.missingSymbols.length} not placed in this genome build`;
    this.missingList.replaceChildren(
      ...this.missingSymbols.map((symbol) => {
        const item = document.createElement("li");
        item.textContent = symbol;
        return item;
      }),
    );
  }
}

customElements.define("gene-panel-navigator", GenePanelNavigator);
