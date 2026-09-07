import { COLORS, ICONS } from "../../constants";
import { BafHistogram, buildBafHistogram } from "../../util/baf_histogram";
import { getSampleKey } from "../../util/utils";
import { formatRegion, parseRegionText } from "../../util/region_text";
import { CHROMOSOMES } from "../../constants";
import { ShadowBaseElement } from "../util/shadowbaseelement";
import { requireElement } from "../../util/dom";

interface HistogramSources {
  getSamples: () => Sample[];
  getMainSample: () => Sample;
  getRegion: () => Region;
  getHighlights: () => RangeHighlight[];
  getSampleLabel: (sample: Sample) => string;
  loadData: (
    sample: SampleIdentifier,
    region: Region,
    signal: AbortSignal,
  ) => Promise<ApiCoverageDot[]>;
  /** Arm a one-shot pick: the reader's next drag on the tracks lands here. */
  pickRegion: (onPicked: (region: Region) => void) => void;
  isPickingRegion: () => boolean;
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
    .limits { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    #region { margin: 12px 0 4px; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    .summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; }
    #status { overflow-wrap: anywhere; line-height: 1.5; }
    #status[data-error] { color: #a12622; }
    .actions { display: flex; gap: 4px; flex: 0 0 auto; }
    button { width: 32px; height: 32px; background: ${COLORS.extraLightGray}; border: 1px solid ${COLORS.lightGray}; border-radius: 4px; cursor: pointer; }
    button:disabled { opacity: 0.4; cursor: default; }
    button:hover:not(:disabled) { background: ${COLORS.lighterGray}; }
    :focus-visible { outline: 2px solid ${COLORS.teal}; outline-offset: 2px; }
    #chart { width: 100%; display: block; aspect-ratio: 360 / 420; }
    #chart text { font: 12px sans-serif; fill: ${COLORS.darkGray}; }
    #chart rect:hover { fill: ${COLORS.blue}; }
    #validation { color: #a12622; margin: 0; }
    #region-validation { color: #a12622; margin: 0; }
    #pick-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    #pick { width: auto; padding: 0 10px; display: inline-flex; align-items: center; gap: 6px; }
    #pick[aria-pressed="true"] { background: ${COLORS.lightGray}; }
    #pick-hint { font-size: 0.85em; color: ${COLORS.darkGray}; }
    [hidden] { display: none !important; }
  </style>
  <div class="fields">
    <label>Sample<select id="sample" aria-label="Histogram sample"></select></label>
    <label>Interval<select id="interval" aria-label="Histogram interval"></select></label>
    <label id="custom-field" hidden>Region to measure<input id="custom-region" type="text" inputmode="text" placeholder="1:100000-200000" aria-label="Region to measure"></label>
    <div id="pick-row">
      <button id="pick" type="button"><span class="fas ${ICONS.marker}" aria-hidden="true"></span> Select on tracks</button>
      <span id="pick-hint" hidden>Drag across the tracks. Escape cancels.</span>
    </div>
    <p id="region-validation" role="alert" hidden></p>
    <div class="limits">
      <label>BAF min<input id="minimum" type="number" min="0" max="1" step="0.01" value="0" required></label>
      <label>BAF max<input id="maximum" type="number" min="0" max="1" step="0.01" value="1" required></label>
      <label>Bins<select id="bins"><option>20</option><option selected>50</option><option>100</option></select></label>
    </div>
    <p id="validation" role="alert" hidden></p>
  </div>
  <div id="region"></div>
  <div class="summary">
    <div id="status" role="status" aria-live="polite"></div>
    <div class="actions">
      <button id="refresh" title="Reload BAF data" aria-label="Reload BAF data"><span class="fas ${ICONS.refresh}" aria-hidden="true"></span></button>
      <button id="export" title="Export histogram CSV" aria-label="Export histogram CSV" disabled><span class="fas ${ICONS.download}" aria-hidden="true"></span></button>
    </div>
  </div>
  <svg id="chart" viewBox="0 0 360 420" role="img" aria-label="BAF histogram"></svg>
`;

export class BafHistogramPanel extends ShadowBaseElement {
  private sources: HistogramSources;
  private sampleSelect: HTMLSelectElement;
  private intervalSelect: HTMLSelectElement;
  private minimum: HTMLInputElement;
  private maximum: HTMLInputElement;
  private binsSelect: HTMLSelectElement;
  private status: HTMLDivElement;
  private validation: HTMLParagraphElement;
  private chart: SVGSVGElement;
  private exportButton: HTMLButtonElement;
  private customField: HTMLLabelElement;
  private customInput: HTMLInputElement;
  private regionValidation: HTMLParagraphElement;
  private pickButton: HTMLButtonElement;
  private pickHint: HTMLSpanElement;
  private request: AbortController | null = null;
  private timer: number | undefined;
  private requestKey = "";
  private data: ApiCoverageDot[] | null = null;
  private histogram: BafHistogram | null = null;
  private region: Region;
  // Unset until a sample is chosen, and again if the chosen one is gone.
  private sample: Sample | undefined;

  constructor() {
    super(template);
    this.sampleSelect = requireElement(this.root, "#sample");
    this.intervalSelect = requireElement(this.root, "#interval");
    this.minimum = requireElement(this.root, "#minimum");
    this.maximum = requireElement(this.root, "#maximum");
    this.binsSelect = requireElement(this.root, "#bins");
    this.status = requireElement(this.root, "#status");
    this.validation = requireElement(this.root, "#validation");
    this.chart = requireElement(this.root, "#chart");
    this.exportButton = requireElement(this.root, "#export");
    this.customField = requireElement(this.root, "#custom-field");
    this.customInput = requireElement(this.root, "#custom-region");
    this.regionValidation = requireElement(this.root, "#region-validation");
    this.pickButton = requireElement(this.root, "#pick");
    this.pickHint = requireElement(this.root, "#pick-hint");
  }

  setSources(sources: HistogramSources) {
    this.sources = sources;
  }

  connectedCallback() {
    super.connectedCallback();
    for (const select of [this.sampleSelect, this.intervalSelect]) {
      this.addElementListener(select, "change", () => this.render());
    }
    for (const input of [this.minimum, this.maximum, this.binsSelect]) {
      this.addElementListener(input, "change", () => this.draw());
    }
    this.addElementListener(
      requireElement(this.root, "#refresh"),
      "click",
      () => {
        this.requestKey = "";
        this.render();
      },
    );
    this.addElementListener(this.exportButton, "click", () => this.exportCsv());
    this.addElementListener(this.pickButton, "click", () => this.startPick());
    this.addElementListener(this.customInput, "change", () => this.render());
    this.addElementListener(this.customInput, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") {
        event.preventDefault();
        this.render();
      }
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
    if (!this.isConnected || !this.sources) {
      return;
    }
    const samples = this.sources.getSamples();
    const sampleKey =
      this.sampleSelect.value || getSampleKey(this.sources.getMainSample());
    this.sampleSelect.replaceChildren(
      ...samples.map((sample) => {
        const option = new Option(
          `${this.sources.getSampleLabel(sample)} (${sample.caseId})`,
          getSampleKey(sample),
        );
        option.title = option.text;
        return option;
      }),
    );
    this.sampleSelect.value = samples.some(
      (sample) => getSampleKey(sample) === sampleKey,
    )
      ? sampleKey
      : (this.sampleSelect.options[0]?.value ?? "");
    this.sampleSelect.title = this.sampleSelect.selectedOptions[0]?.text ?? "";

    const selectedInterval = this.intervalSelect.value;
    const highlights = this.sources.getHighlights();
    this.intervalSelect.replaceChildren(
      new Option("Visible interval", "view"),
      // Measuring somewhere other than the visible view used to mean leaving
      // the panel, entering marker mode and dragging out a highlight first.
      new Option("Region I type", "custom"),
      ...highlights.map(
        (highlight) =>
          new Option(
            `${highlight.chromosome}:${highlight.range[0]}-${highlight.range[1]}`,
            highlight.id,
          ),
      ),
    );
    this.intervalSelect.value =
      selectedInterval === "custom" ||
      highlights.some((highlight) => highlight.id === selectedInterval)
        ? selectedInterval
        : "view";

    const picking = this.sources.isPickingRegion();
    this.pickButton.setAttribute("aria-pressed", picking ? "true" : "false");
    this.pickHint.hidden = !picking;

    const isCustom = this.intervalSelect.value === "custom";
    this.customField.hidden = !isCustom;
    if (isCustom && this.customInput.value.trim() === "") {
      // Start from where the reader is looking, so the format is shown by
      // example and a small edit is enough.
      this.customInput.value = formatRegion(this.sources.getRegion());
    }

    let rawRegion: Region;
    if (isCustom) {
      const parsed = parseRegionText(this.customInput.value, CHROMOSOMES);
      this.regionValidation.hidden = parsed.error === null;
      this.regionValidation.textContent = parsed.error ?? "";
      if (parsed.region === null) {
        // Nothing is measured until the region is usable. Drawing the previous
        // region under a new label would be a wrong answer, not a stale one.
        this.request?.abort();
        window.clearTimeout(this.timer);
        this.requestKey = "";
        this.data = null;
        this.histogram = null;
        this.chart.replaceChildren();
        this.status.textContent = "";
        this.exportButton.disabled = true;
        requireElement(this.root, "#region").textContent = "";
        return;
      }
      rawRegion = parsed.region;
    } else {
      this.regionValidation.hidden = true;
      this.regionValidation.textContent = "";
      const highlight = highlights.find(
        (entry) => entry.id === this.intervalSelect.value,
      );
      rawRegion = highlight
        ? {
            chrom: highlight.chromosome,
            start: highlight.range[0],
            end: highlight.range[1],
          }
        : this.sources.getRegion();
    }
    this.region = {
      ...rawRegion,
      start: Math.max(1, Math.ceil(rawRegion.start)),
      end: Math.floor(rawRegion.end),
    };
    this.sample = samples.find(
      (sample) => getSampleKey(sample) === this.sampleSelect.value,
    );
    requireElement(this.root, "#region").textContent =
      `${this.region.chrom}:${this.region.start.toLocaleString()}-${this.region.end.toLocaleString()} | GRCh${this.sample?.genomeBuild ?? ""}`;
    const key = JSON.stringify([this.sampleSelect.value, this.region]);
    if (key === this.requestKey) {
      return;
    }

    this.requestKey = key;
    this.request?.abort();
    window.clearTimeout(this.timer);
    this.data = null;
    this.histogram = null;
    this.chart.replaceChildren();
    this.exportButton.disabled = true;
    this.status.removeAttribute("data-error");
    if (!this.sample) {
      this.status.textContent = "No samples selected.";
      return;
    }
    this.status.textContent = "Loading full-resolution BAF...";
    const controller = new AbortController();
    this.request = controller;
    const sample = this.sample;
    const region = this.region;
    this.timer = window.setTimeout(async () => {
      try {
        const data = await this.sources.loadData(
          sample,
          region,
          controller.signal,
        );
        if (controller.signal.aborted || !this.isConnected) {
          return;
        }
        this.data = data;
        this.draw();
      } catch (error) {
        if (controller.signal.aborted || !this.isConnected) {
          return;
        }
        this.status.textContent = "Unable to load BAF data. Reload to retry.";
        this.status.setAttribute("data-error", "");
        console.error("BAF histogram request failed", error);
      }
    }, 150);
  }

  /** Let the reader drag the region out on the tracks instead of typing it. */
  private startPick() {
    this.sources.pickRegion((region) => {
      this.intervalSelect.value = "custom";
      this.customInput.value = formatRegion(region);
      this.render();
    });
    this.render();
  }

  private draw() {
    const range: Rng = [this.minimum.valueAsNumber, this.maximum.valueAsNumber];
    const valid =
      range.every(Number.isFinite) &&
      range[0] >= 0 &&
      range[1] <= 1 &&
      range[0] < range[1];
    this.validation.hidden = valid;
    this.validation.textContent = valid
      ? ""
      : "BAF limits must satisfy 0 <= min < max <= 1.";
    this.exportButton.disabled = true;
    this.histogram = null;
    this.chart.replaceChildren();
    if (!valid || this.data == null) {
      return;
    }
    this.histogram = buildBafHistogram(
      this.data,
      [this.region.start, this.region.end],
      Number(this.binsSelect.value),
      range,
    );
    const { siteCount, excludedCount } = this.histogram;
    this.status.textContent =
      siteCount === 0
        ? "No BAF sites in this interval and BAF range."
        : `${siteCount.toLocaleString()} ${siteCount === 1 ? "site" : "sites"}`;
    if (excludedCount > 0) {
      this.status.textContent += ` (${excludedCount.toLocaleString()} excluded)`;
    }
    this.exportButton.disabled = siteCount === 0;
    drawHistogram(this.chart, this.histogram, range);
  }

  private exportCsv() {
    if (!this.histogram || !this.sample || this.exportButton.disabled) {
      return;
    }
    const rows = [
      "chromosome,start,end,genome_build,resolution,baf_min,baf_max,count",
    ];
    for (const bin of this.histogram.bins) {
      rows.push(
        [
          this.region.chrom,
          this.region.start,
          this.region.end,
          this.sample.genomeBuild,
          "d",
          bin.start,
          bin.end,
          bin.count,
        ].join(","),
      );
    }
    const url = URL.createObjectURL(
      new Blob([rows.join("\n") + "\n"], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `baf-${this.sample.sampleId}-${this.region.chrom}-${this.region.start}-${this.region.end}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawHistogram(
  chart: SVGSVGElement,
  histogram: BafHistogram,
  range: Rng,
) {
  const left = 52;
  const top = 20;
  const width = 278;
  const height = 354;
  const maximum = Math.max(1, ...histogram.bins.map((bin) => bin.count));
  const add = (
    tag: string,
    attributes: Record<string, string | number>,
    text?: string,
  ) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, String(value));
    }
    if (text != null) element.textContent = text;
    chart.appendChild(element);
    return element;
  };
  chart.setAttribute(
    "aria-label",
    `BAF histogram, ${histogram.siteCount} sites, BAF ${range[0]} to ${range[1]}`,
  );
  for (let tick = 0; tick <= 4; tick += 1) {
    const position = top + height - (height * tick) / 4;
    add("line", {
      x1: left,
      x2: left + width,
      y1: position,
      y2: position,
      stroke: COLORS.lighterGray,
    });
    add(
      "text",
      { x: left - 8, y: position + 4, "text-anchor": "end" },
      (range[0] + ((range[1] - range[0]) * tick) / 4).toFixed(2),
    );
  }
  const binHeight = height / histogram.bins.length;
  histogram.bins.forEach((bin, index) => {
    const bar = add("rect", {
      x: left,
      y: top + height - (index + 1) * binHeight,
      width: (bin.count / maximum) * width,
      height: Math.max(1, binHeight - 0.5),
      fill: COLORS.teal,
    });
    const title = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );
    title.textContent = `BAF ${bin.start.toFixed(3)} to ${bin.end.toFixed(3)}: ${bin.count} sites`;
    bar.appendChild(title);
  });
  add("line", {
    x1: left,
    x2: left,
    y1: top,
    y2: top + height,
    stroke: COLORS.darkGray,
  });
  add("line", {
    x1: left,
    x2: left + width,
    y1: top + height,
    y2: top + height,
    stroke: COLORS.darkGray,
  });
  add("text", { x: left, y: 392 }, "0");
  add(
    "text",
    { x: left + width, y: 392, "text-anchor": "end" },
    maximum.toLocaleString(),
  );
  add(
    "text",
    { x: left + width / 2, y: 411, "text-anchor": "middle" },
    "Site count",
  );
  add("text", { x: left, y: 12 }, "BAF");
}

customElements.define("baf-histogram", BafHistogramPanel);
