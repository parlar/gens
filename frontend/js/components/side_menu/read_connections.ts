import { COLORS, ICONS } from "../../constants";
import {
  CONNECTION_KINDS,
  EVIDENCE_WINDOW,
  endpointGeometry,
  endpointLabel,
  EvidenceFilters,
  ReadConnection,
  ReadEndpoint,
  ReadEvidence,
} from "../../util/read_connections";
import { getSampleKey, prefixNts } from "../../util/utils";
import { ShadowBaseElement } from "../util/shadowbaseelement";

interface ConnectionSources {
  getSamples: () => Sample[];
  getMainSample: () => Sample;
  getRegion: () => Region;
  getHighlights: () => RangeHighlight[];
  getSampleLabel: (sample: Sample) => string;
  loadData: (
    sample: SampleIdentifier,
    region: Region,
    filters: EvidenceFilters,
    signal: AbortSignal,
  ) => Promise<ReadEvidence | null>;
  canNavigate: (endpoint: ReadEndpoint) => boolean;
  navigate: (endpoint: ReadEndpoint) => void;
}

const PAGE_SIZE = 50;
const CONNECTION_COLORS = {
  split: COLORS.teal,
  pair: COLORS.blue,
  call: "#a12622",
  unknown: COLORS.darkGray,
};
const template = document.createElement("template");
template.innerHTML = String.raw`
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :host { display: block; min-width: 0; font-weight: 400; color: ${COLORS.black}; }
    * { box-sizing: border-box; }
    .fields { display: grid; gap: 10px; }
    .filters { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 8px; }
    label { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    input, select, button { font: inherit; color: inherit; }
    input, select { width: 100%; min-width: 0; height: 32px; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; background: white; padding: 4px; }
    button { cursor: pointer; }
    button:disabled { opacity: 0.4; cursor: default; }
    .icon { width: 32px; height: 32px; flex: 0 0 32px; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; background: ${COLORS.extraLightGray}; }
    .icon:hover:not(:disabled) { background: ${COLORS.lighterGray}; }
    :focus-visible { outline: 2px solid ${COLORS.teal}; outline-offset: 2px; }
    .row { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin: 10px 0; }
    #status { line-height: 1.5; }
    #region, #source, #status, #details { overflow-wrap: anywhere; }
    #source { color: ${COLORS.darkGray}; margin: 6px 0; }
    #warning { padding: 8px 0; color: #a12622; border-top: 1px solid currentColor; }
    #chart { display: block; width: 100%; aspect-ratio: 600 / 245; }
    #chart text { font: 12px sans-serif; fill: ${COLORS.darkGray}; }
    #chart [role="button"] { cursor: pointer; }
    .table-scroll { max-height: 280px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
    th, td { padding: 6px 4px; border-bottom: 1px solid ${COLORS.lightGray}; text-align: left; overflow-wrap: anywhere; }
    th { position: sticky; top: 0; background: white; }
    th:first-child { width: 28%; }
    th:last-child { width: 21%; }
    .connection { background: none; border: 0; padding: 0; text-align: left; width: 100%; overflow-wrap: anywhere; text-decoration: underline; }
    tr[aria-selected="true"] { background: #e8f3f1; }
    #details { border-top: 1px solid ${COLORS.lightGray}; padding-top: 10px; }
    #details h3 { font-size: 13px; margin: 0 0 8px; }
    #details dl { display: grid; grid-template-columns: 1fr 1.5fr; gap: 6px; }
    #details dd { margin: 0; }
    #pager { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin: 8px 0; }
    [hidden] { display: none !important; }
  </style>
  <div class="fields">
    <label>Sample<select id="sample" aria-label="Connection sample"></select></label>
    <label>Interval<select id="interval" aria-label="Connection interval"></select></label>
    <div class="filters">
      <label>Evidence<select id="kind"><option value="all">All</option><option value="split">Split alignment</option><option value="pair">Read pair</option><option value="call">SV call</option><option value="unknown">Unspecified</option></select></label>
      <label>Min MAPQ<input id="mapq" type="number" min="0" max="254" step="1" value="0" required></label>
      <label>Min fragments<input id="fragments" type="number" min="0" step="1" value="0" required></label>
    </div>
  </div>
  <div class="row"><div id="region"></div><button class="icon" id="refresh" title="Reload connections" aria-label="Reload connections"><span class="fas ${ICONS.refresh}" aria-hidden="true"></span></button></div>
  <div id="status" role="status" aria-live="polite"></div>
  <div id="source"></div>
  <div id="warning" role="alert" hidden></div>
  <svg id="chart" viewBox="0 0 600 245" role="group" aria-label="Genomic connection arcs"></svg>
  <div class="table-scroll"><table aria-label="Connections"><thead><tr><th>Connection</th><th>Endpoints</th><th>Fragments</th></tr></thead><tbody id="rows"></tbody></table></div>
  <div id="pager"><span id="page-label"></span><button class="icon" id="previous" title="Previous connections" aria-label="Previous connections"><span class="fas ${ICONS.left}" aria-hidden="true"></span></button><button class="icon" id="next" title="Next connections" aria-label="Next connections"><span class="fas ${ICONS.right}" aria-hidden="true"></span></button></div>
  <div id="details"></div>
`;

export class ReadConnectionsPanel extends ShadowBaseElement {
  private sources: ConnectionSources;
  private request: AbortController | null = null;
  private timer: number | undefined;
  private requestKey = "";
  private evidence: ReadEvidence | null = null;
  private region: Region;
  private selectedId = "";
  private page = 0;

  constructor() {
    super(template);
  }

  setSources(sources: ConnectionSources) {
    this.sources = sources;
  }

  connectedCallback() {
    super.connectedCallback();
    for (const id of ["sample", "interval", "kind", "mapq", "fragments"]) {
      this.addElementListener(this.root.querySelector(`#${id}`), "change", () =>
        this.render(),
      );
    }
    this.addElementListener(
      this.root.querySelector("#refresh"),
      "click",
      () => {
        this.requestKey = "";
        this.render();
      },
    );
    this.addElementListener(
      this.root.querySelector("#previous"),
      "click",
      () => {
        this.page -= 1;
        this.draw();
      },
    );
    this.addElementListener(this.root.querySelector("#next"), "click", () => {
      this.page += 1;
      this.draw();
    });
    this.render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.request?.abort();
    window.clearTimeout(this.timer);
    this.requestKey = "";
  }

  render() {
    if (!this.isConnected || !this.sources) return;
    const sampleSelect = this.root.querySelector<HTMLSelectElement>("#sample");
    const intervalSelect =
      this.root.querySelector<HTMLSelectElement>("#interval");
    const samples = this.sources.getSamples();
    const previousSample =
      sampleSelect.value || getSampleKey(this.sources.getMainSample());
    sampleSelect.replaceChildren(
      ...samples.map(
        (sample) =>
          new Option(
            `${this.sources.getSampleLabel(sample)} (${sample.caseId})`,
            getSampleKey(sample),
          ),
      ),
    );
    sampleSelect.value = samples.some(
      (sample) => getSampleKey(sample) === previousSample,
    )
      ? previousSample
      : (sampleSelect.options[0]?.value ?? "");
    sampleSelect.title = sampleSelect.selectedOptions[0]?.text ?? "";
    const sample = samples.find(
      (entry) => getSampleKey(entry) === sampleSelect.value,
    );
    const previousInterval = intervalSelect.value;
    const highlights = this.sources.getHighlights();
    intervalSelect.replaceChildren(
      new Option("Visible interval", "view"),
      ...highlights.map(
        (highlight) =>
          new Option(
            `${highlight.chromosome}:${highlight.range.join("-")}`,
            highlight.id,
          ),
      ),
    );
    intervalSelect.value = highlights.some(
      (highlight) => highlight.id === previousInterval,
    )
      ? previousInterval
      : "view";
    const highlight = highlights.find(
      (entry) => entry.id === intervalSelect.value,
    );
    const rawRegion = highlight
      ? {
          chrom: highlight.chromosome,
          start: highlight.range[0],
          end: highlight.range[1],
        }
      : this.sources.getRegion();
    this.region = {
      ...rawRegion,
      start: Math.max(1, Math.ceil(rawRegion.start)),
      end: Math.floor(rawRegion.end),
    };
    const filters: EvidenceFilters = {
      kind: this.root.querySelector<HTMLSelectElement>("#kind")
        .value as EvidenceFilters["kind"],
      minimum_mapq:
        this.root.querySelector<HTMLInputElement>("#mapq").valueAsNumber,
      minimum_fragments:
        this.root.querySelector<HTMLInputElement>("#fragments").valueAsNumber,
    };
    const key = JSON.stringify([sampleSelect.value, this.region, filters]);
    if (key === this.requestKey) return;
    this.requestKey = key;
    this.request?.abort();
    window.clearTimeout(this.timer);
    this.evidence = null;
    this.page = 0;
    this.root.querySelector("#region").textContent =
      `${this.region.chrom}:${this.region.start.toLocaleString()}-${this.region.end.toLocaleString()} | GRCh${sample?.genomeBuild ?? ""}`;
    this.root.querySelector("#source").textContent = "";
    this.root.querySelector<HTMLElement>("#warning").hidden = true;
    this.draw();
    const status = this.root.querySelector("#status");
    if (!sample) {
      status.textContent = "No samples selected.";
      return;
    }
    if (
      !Number.isFinite(this.region.end) ||
      this.region.end < this.region.start ||
      this.region.end - this.region.start + 1 > EVIDENCE_WINDOW
    ) {
      status.textContent = `Select an interval of at most ${EVIDENCE_WINDOW.toLocaleString()} bases.`;
      return;
    }
    if (
      !Number.isInteger(filters.minimum_mapq) ||
      filters.minimum_mapq < 0 ||
      filters.minimum_mapq > 254 ||
      !Number.isInteger(filters.minimum_fragments) ||
      filters.minimum_fragments < 0
    ) {
      status.textContent =
        "Enter nonnegative integer filters; MAPQ cannot exceed 254.";
      return;
    }
    status.textContent = "Loading connections...";
    const controller = new AbortController();
    this.request = controller;
    const region = this.region;
    this.timer = window.setTimeout(async () => {
      try {
        const evidence = await this.sources.loadData(
          sample,
          region,
          filters,
          controller.signal,
        );
        if (!this.isConnected || controller.signal.aborted) return;
        if (evidence == null) {
          status.textContent =
            "No compact evidence file is registered for this sample.";
          return;
        }
        this.evidence = evidence;
        status.textContent = evidence.connections.length
          ? `${evidence.connections.length.toLocaleString()} ${evidence.connections.length === 1 ? "connection" : "connections"}`
          : "No connections match this interval and filters.";
        this.root.querySelector("#source").textContent =
          `Source: ${evidence.source_label}`;
        const warning = this.root.querySelector<HTMLElement>("#warning");
        warning.hidden = !evidence.truncated;
        warning.textContent =
          "Partial results: the query limit was reached. Narrow the interval or filters.";
        this.draw();
      } catch (error) {
        if (!this.isConnected || controller.signal.aborted) return;
        status.textContent =
          "Unable to load connections. Verify the evidence source or reload to retry.";
        console.error("Connection request failed", error);
      }
    }, 150);
  }

  private draw() {
    const all = this.evidence?.connections ?? [];
    const displayed = all.slice(
      this.page * PAGE_SIZE,
      (this.page + 1) * PAGE_SIZE,
    );
    const selected =
      displayed.find((connection) => connection.id === this.selectedId) ??
      displayed[0];
    this.selectedId = selected?.id ?? "";
    const rows = this.root.querySelector("#rows");
    rows.replaceChildren();
    for (const connection of displayed) {
      const row = document.createElement("tr");
      row.setAttribute(
        "aria-selected",
        String(connection.id === this.selectedId),
      );
      const name = document.createElement("td");
      const button = document.createElement("button");
      button.className = "connection";
      button.textContent = connection.id;
      button.onclick = () => {
        this.selectedId = connection.id;
        this.draw();
      };
      name.appendChild(button);
      const kind = document.createElement("div");
      kind.textContent = CONNECTION_KINDS[connection.kind];
      kind.style.color = CONNECTION_COLORS[connection.kind];
      name.appendChild(kind);
      const endpoints = document.createElement("td");
      for (const endpoint of [connection.first, connection.second]) {
        const line = document.createElement("div");
        line.textContent = endpointLabel(endpoint);
        endpoints.appendChild(line);
      }
      const support = document.createElement("td");
      support.textContent =
        connection.fragments?.toLocaleString() ?? "Not reported";
      row.append(name, endpoints, support);
      rows.appendChild(row);
    }
    this.root.querySelector<HTMLElement>("#pager").hidden = all.length === 0;
    this.root.querySelector("#page-label").textContent =
      `${this.page * PAGE_SIZE + 1}-${Math.min((this.page + 1) * PAGE_SIZE, all.length)} of ${all.length}`;
    this.root.querySelector<HTMLButtonElement>("#previous").disabled =
      this.page === 0;
    this.root.querySelector<HTMLButtonElement>("#next").disabled =
      (this.page + 1) * PAGE_SIZE >= all.length;
    this.drawArcs(displayed);
    this.drawDetails(selected);
  }

  private drawArcs(connections: ReadConnection[]) {
    const chart = this.root.querySelector<SVGSVGElement>("#chart");
    chart.replaceChildren();
    chart.style.display = connections.length ? "block" : "none";
    if (!connections.length) return;
    const add = (
      tag: string,
      attributes: Record<string, string | number>,
      text?: string,
    ) => {
      const element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        tag,
      );
      for (const [name, value] of Object.entries(attributes))
        element.setAttribute(name, String(value));
      if (text != null) element.textContent = text;
      chart.appendChild(element);
      return element;
    };
    add("line", { x1: 40, x2: 500, y1: 208, y2: 208, stroke: COLORS.darkGray });
    add(
      "text",
      { x: 40, y: 231 },
      `${this.region.chrom}:${prefixNts(this.region.start)}`,
    );
    add(
      "text",
      { x: 500, y: 231, "text-anchor": "end" },
      prefixNts(this.region.end),
    );
    add("text", { x: 560, y: 231, "text-anchor": "middle" }, "Off-view");
    connections.forEach((connection, index) => {
      const first = endpointGeometry(connection.first, this.region);
      const second = endpointGeometry(connection.second, this.region);
      const height = Math.min(
        40 + (index % 6) * 24,
        Math.max(8, Math.abs(second.x - first.x) * 0.6),
      );
      const midpoint =
        (first.x + second.x) / 2 + (first.x === second.x ? 20 : 0);
      const description = `${connection.id}: ${CONNECTION_KINDS[connection.kind]}, ${endpointLabel(connection.first)} to ${endpointLabel(connection.second)}, ${connection.fragments ?? "unreported"} fragments`;
      const selected = connection.id === this.selectedId;
      const path = add("path", {
        d: `M ${first.x} 208 Q ${midpoint} ${208 - height * 2} ${second.x} 208`,
        fill: "none",
        stroke: CONNECTION_COLORS[connection.kind],
        "stroke-width": selected ? 4 : 2,
        "stroke-dasharray": connection.kind === "pair" ? "5 3" : "none",
        opacity: selected ? 1 : 0.55,
        role: "button",
        tabindex: 0,
        "aria-label": description,
      });
      const title = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "title",
      );
      title.textContent = description;
      path.appendChild(title);
      path.addEventListener("click", () => {
        this.selectedId = connection.id;
        this.draw();
      });
      path.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.selectedId = connection.id;
          this.draw();
        }
      });
      for (const endpoint of [first, second]) {
        if (endpoint.visible) {
          add("line", {
            x1: endpoint.left,
            x2: Math.max(endpoint.left + 2, endpoint.right),
            y1: 208,
            y2: 208,
            stroke: CONNECTION_COLORS[connection.kind],
            "stroke-width": selected ? 7 : 4,
          });
        } else {
          add("circle", {
            cx: endpoint.x,
            cy: 208,
            r: selected ? 5 : 3,
            fill: "white",
            stroke: CONNECTION_COLORS[connection.kind],
            "stroke-width": 2,
          });
        }
      }
    });
  }

  private drawDetails(connection?: ReadConnection) {
    const details = this.root.querySelector("#details");
    details.replaceChildren();
    if (!connection) return;
    const heading = document.createElement("h3");
    heading.textContent = connection.id;
    details.appendChild(heading);
    const metadata = document.createElement("dl");
    for (const [label, value] of [
      ["Evidence", CONNECTION_KINDS[connection.kind]],
      [
        "Reported fragments",
        connection.fragments?.toLocaleString() ?? "Not reported",
      ],
      [
        "Reported minimum MAPQ",
        connection.minimum_observed_mapq?.toString() ?? "Not reported",
      ],
    ]) {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      metadata.append(term, description);
    }
    details.appendChild(metadata);
    [connection.first, connection.second].forEach((endpoint, index) => {
      const row = document.createElement("div");
      row.className = "row";
      const label = document.createElement("div");
      label.textContent = `Endpoint ${index + 1}: ${endpointLabel(endpoint)}`;
      const button = document.createElement("button");
      button.className = "icon";
      button.title = `Inspect endpoint ${index + 1}`;
      button.setAttribute("aria-label", button.title);
      const icon = document.createElement("span");
      icon.className = `fas ${ICONS.right}`;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
      button.disabled = !this.sources.canNavigate(endpoint);
      button.onclick = () => {
        this.root.querySelector<HTMLSelectElement>("#interval").value = "view";
        this.sources.navigate(endpoint);
      };
      row.append(label, button);
      details.appendChild(row);
    });
  }
}

customElements.define("read-connections", ReadConnectionsPanel);
