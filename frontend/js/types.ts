enum VariantCategory {
  SV = "sv",
  SNV = "snv",
  STR = "str",
  CANCER = "cancer",
  CANCER_SV = "cancer_sv",
  MEI = "mei",
  FUSION = "fusion",
}

enum VariantSubCategory {
  SNV = "snv",
  INDEL = "indel",
  DEL = "del",
  INS = "ins",
  DUP = "dup",
  TDUP = "tdup",
  INV = "inv",
  CNV = "cnv",
  BND = "bnd",
  STR = "str",
  MEI = "mei",
}

// Every type below describes a response body, and each is generated from the
// API's own OpenAPI schema rather than written out again by hand. Two
// hand-written copies of the same shape drift, and nothing tells you: the
// annotation track id, the transcript colour and half of ApiVariantDetails had
// all already drifted when this was introduced. Regenerate with
// `npm run types:api`; `npm run types:api:check` fails when it is stale.
//
// The inline import() form is deliberate. This file has no top-level import or
// export, which is what makes every type in it global. A top-level import
// would turn the file into a module and hide all of them at once.
type ApiSchemas = import("./generated/api_schema").components["schemas"];

type ApiAnnotationTrack = ApiSchemas["AnnotationTrackInDb"];
type ApiGeneList = ApiSchemas["GeneListRecord"];
type ApiPanelGene = ApiSchemas["PanelGene"];
type ApiPanelGenes = ApiSchemas["PanelGenes"];
type ApiSampleAnnotationTrack = ApiSchemas["SampleAnnotationTrackInDb"];
type ApiSearchResult = ApiSchemas["GenomicRegion"];
type ApiSimplifiedAnnotation = ApiSchemas["SimplifiedTrackInfo"];
type ApiSimplifiedTranscript = ApiSchemas["SimplifiedTranscriptInfo"];
type ApiComment = ApiSchemas["Comment"];
type ApiReference =
  | ApiSchemas["ReferenceUrl"]
  | ApiSchemas["ScientificArticle"];
type ApiMetadata =
  | ApiSchemas["GenericMetadata"]
  | ApiSchemas["UrlMetadata"]
  | ApiSchemas["DatetimeMetadata"]
  | ApiSchemas["DnaStrandMetadata"];
type ApiAnnotationDetails = ApiSchemas["AnnotationRecord"];
type ApiSampleAnnotationDetails = ApiSchemas["SampleAnnotationRecord"];
type ApiTranscriptFeature =
  | ApiSchemas["ExonFeature"]
  | ApiSchemas["UtrFeature"];
type ApiGeneDetails = ApiSchemas["TranscriptRecord"];
type ApiSimplifiedVariant = ApiSchemas["SimplifiedVariantRecord"];
type ApiVariantDetails = ApiSchemas["VariantRecord"];
type ApiHetDensityBin = ApiSchemas["HetDensityBin"];
type ApiHetDensityTrack = ApiSchemas["HetDensityTrack"];
type ApiSample = ApiSchemas["SampleInfo"];
type SampleMetaValue = ApiSchemas["MetaValue"];
type SampleMetaEntry = ApiSchemas["MetaEntry"];
type ApiScoutSample = ApiSchemas["ScoutSampleCall"];
type ApiHomologyPair = ApiSchemas["HomologyPair"];
type ApiHomologyRegions = ApiSchemas["HomologyRegions"];

// Despite the name, these two are not response bodies and so are not
// generated. The coverage endpoint returns ApiSchemas["GenomeCoverage"], which
// is a pair of parallel arrays; api.ts zips them into these before anything
// else sees them.
interface ApiCoverageDot {
  pos: number;
  value: number;
}

interface ApiCoverageBin {
  start: number;
  end: number;
  value: number;
  zoom: string;
}

interface PopupContent {
  header: string;
  info?: { key: string; value: string; url?: string }[];
}

type RenderElement = RenderBand | RenderDot;

interface TranscriptFeature {
  start: number;
  end: number;
  feature: string;
  exonNumber?: number;
}

interface RenderBand {
  id: string;
  start: number;
  end: number;
  color?: string;
  edgeColor?: string;
  edgeWidth?: number;
  label?: string;
  hoverInfo?: string;
  direction?: "+" | "-";
  y1?: number;
  y2?: number;
  subFeatures?: TranscriptFeature[];
  exonCount?: number;
}

/**
 * A band the band track has placed in a lane and given a colour.
 *
 * RenderBand marks y1, y2 and color optional because a band arrives from the
 * data source without them; the layout pass fills them in before anything is
 * drawn. Saying that in the type is what lets the drawing code read them
 * without a null check on every use.
 */
interface PositionedBand extends RenderBand {
  y1: number;
  y2: number;
  color: string;
}

/** A positioned band that carries a transcript's exons, so it draws as one. */
interface TranscriptBand extends PositionedBand {
  subFeatures: TranscriptFeature[];
  exonCount: number;
}

interface RenderDot {
  x: number;
  y: number;
  color: string;
}

/**
 * A genomic span the track could not interpret.
 *
 * Drawn as a neutral wash rather than left blank, so that "no usable
 * observations here" is distinguishable from "nothing to report here". A blank
 * dot track otherwise looks the same as one that failed to load.
 */
interface ShadedRange {
  start: number;
  end: number;
  color: string;
  label?: string;
}

/**
 * A binned value drawn as a column from the axis baseline.
 *
 * Used where the data is one number per fixed genomic bin rather than a cloud
 * of individual observations. Drawn as a dot, a bin becomes a single pixel at
 * its midpoint, so a stretch of depleted bins reads as scattered specks; drawn
 * to the bin's real width it reads as a block, and the width itself states the
 * resolution instead of implying a smooth curve between midpoints.
 */
interface RenderBar {
  /** 1-based inclusive bin start. */
  start: number;
  /** 1-based inclusive bin end. */
  end: number;
  /** The value. The column runs from the axis baseline to here. */
  y: number;
  color: string;
  /**
   * Draw the outline and leave the inside empty.
   *
   * For a bar whose colour would otherwise assert a covariate that was never
   * measured. A filled neutral bar and an unmeasured one must not look alike.
   */
  outlineOnly?: boolean;
}

interface DotTrackData {
  dots: RenderDot[];
  /**
   * Drawn instead of dots when present. A track supplies one or the other, not
   * both: they are two ways of showing the same axis, and overlaying them would
   * double every value.
   */
  bars?: RenderBar[];
  shaded?: ShadedRange[];
}

/**
 * A connection as the track draws it.
 *
 * Structurally the same as the API's ReadConnection, so a response needs no
 * translation and the two cannot drift apart in meaning.
 */
interface RenderConnectionEnd {
  chromosome: string;
  start: number;
  end: number;
  strand: "+" | "-" | ".";
}

interface RenderConnection {
  id: string;
  kind: "split" | "pair" | "call" | "unknown";
  first: RenderConnectionEnd;
  second: RenderConnectionEnd;
  fragments: number | null;
  minimum_observed_mapq: number | null;
}

interface ConnectionsTrackData {
  connections: RenderConnection[];
  /** Set when the server stopped short of the whole window. */
  truncated: boolean;
  /** Why nothing can be drawn, when that is the case. */
  unavailable: string | null;
}

/** Everything a DataTrack subclass may be handed to draw. */
type TrackData = BandTrackData | DotTrackData | ConnectionsTrackData;

interface AnnotationTrackData {
  xRange: Rng;
  annotation: { source: string; bands: RenderBand[] };
}

type Chromosome = ApiSchemas["Chromosome"];

interface BandTrackData {
  // xRange: Rng;
  bands: RenderBand[];
  /**
   * Why the bands are not the whole story, when that is the case.
   *
   * A repeat catalogue holds more records over a wide view than the server
   * will send, and the ones it sends are whichever came first. Drawing that
   * subset unlabelled would show repeats over part of a chromosome and
   * nothing over the rest, which reads as a fact about the genome.
   */
  incomplete?: string | null;
}

interface IdeogramTrackData {
  chromInfo: ChromosomeInfo;
  xRange: Rng;
}

interface OverviewTrackData {
  dotsPerChrom: Record<string, RenderDot[]>;
  chromosome: string;
  xRange: Rng;
  sampleLabel: string;
}

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

interface HoverBox {
  label: string;
  box: Box;
  element?: RenderBand | RenderDot;
}

interface BoxStyle {
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  alpha?: number;
}

interface LabelStyle {
  withFrame?: boolean;
  textBaseline?: "top" | "middle" | "bottom";
  textAlign?: "left" | "right" | "center";
  padding?: number;
  font?: string;
  textColor?: string;
  boxStyle?: BoxStyle;
  rotation?: number;
}

interface LineStyle {
  lineWidth?: number;
  color?: string;
  dashed?: boolean;
  transpose_05?: boolean;
}

type Scale = (value: number) => number;

type ColorScale = (level: string) => string;

type BandYScale = (lane: number, expanded: boolean) => Rng;

type GetAnnotSources = (settings: {
  selectedOnly: boolean;
}) => { id: string; label: string }[];

interface RenderDataSource {
  getChromInfo: (chrom: Chromosome) => Promise<ChromosomeInfo>;

  getAnnotationBands: (
    sourceId: string,
    chrom: string,
  ) => Promise<BandTrackData>;
  getAnnotationDetails: (bandId: string) => Promise<ApiAnnotationDetails>;

  getSampleAnnotSources: (
    id: SampleIdentifier,
  ) => Promise<{ id: string; name: string }[]>;
  getSampleAnnotationBands: (
    trackId: string,
    chrom: string,
  ) => Promise<RenderBand[]>;
  getSampleAnnotationDetails: (
    recordId: string,
  ) => Promise<ApiSampleAnnotationDetails>;

  getCovData: (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ) => Promise<RenderDot[]>;
  getBafData: (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ) => Promise<RenderDot[]>;
  getHetDensityData: (
    id: SampleIdentifier,
    chrom: string,
  ) => Promise<DotTrackData>;
  getReadConnections: (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ) => Promise<ConnectionsTrackData>;
  hasReadConnections: (id: SampleIdentifier) => Promise<boolean>;

  getHomologyBands: (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ) => Promise<RenderBand[]>;

  getTranscriptBands: (chrom: string) => Promise<RenderBand[]>;
  getTranscriptDetails: (geneId: string) => Promise<ApiGeneDetails>;

  getGeneListBands: (listId: string, chrom: string) => Promise<RenderBand[]>;

  getVariantBands: (
    sample: Sample,
    chrom: string,
    rankScoreThres: number,
  ) => Promise<RenderBand[]>;
  getVariantDetails: (variantId: string) => Promise<ApiVariantDetails>;

  getOverviewCovData: (
    id: SampleIdentifier,
  ) => Promise<Record<string, RenderDot[]>>;
  getOverviewBafData: (
    id: SampleIdentifier,
  ) => Promise<Record<string, RenderDot[]>>;

  getVariantURL: (doc_id: string) => string;
}

type Rng = [number, number];

interface Region {
  chrom: Chromosome;
  start: number;
  end: number;
}

interface _RegionDetail {
  region: Region;
  exclude?: string[];
}

interface DrawPaths {
  chromosome: _DrawChromosome;
  bands: _BandPath[];
}

interface _Transcript {
  id: string;
  name: string;
  chrom: string;
  start: number;
  end: number;
  mane: string;
  scale: number;
  color: string;
  // eslint-disable-next-line
  features: any[];

  x1?: number;
  x2?: number;
  y1?: number;
  y2?: number;

  visibleX1?: number;
  visibleX2?: number;
  visibleY1?: number;
  visibleY2?: number;

  isDisplayed?: boolean;
  tooltip?: Tooltip;
}

interface Tooltip {
  // eslint-disable-next-line
  instance: any; // Popper.js instance
  // eslint-disable-next-line
  virtualElement: any;
  tooltip: HTMLDivElement;
  isDisplayed: boolean;
}

interface _VirtualDOMElement {
  x: number; // Placeholder for Popper.js
  y: number; // Placeholder for Popper.js
  // eslint-disable-next-line
  toJSON: () => any; // Placeholder for Popper.js
  width: number;
  height: number;
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface ChromosomeBand {
  start: number;
  end: number;
  stain: string;
  id: string;
  strand: string;
}

interface ChromosomeInfo {
  chrom: string;
  centromere: { start: number; end: number };
  size: number;
  bands: ChromosomeBand[];
}

interface _DrawChromosome {
  path: Path2D;
  chromInfo?: {
    chrom: string;
    scale: number;
    x: number;
    width: number;
    size: number;
  };
}

interface Dimensions {
  width: number;
  height: number;
}

interface _BandPath {
  id: string;
  path: Path2D;
  start: number;
  end: number;
  stain: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface _ChromosomeDims {
  [key: string]: _ChromosomeDim;
}

interface _ChromosomeDim {
  x_pos: number;
  y_pos: number;
  width: number;
  size: number;
}

interface _ChromosomePos {
  region: string;
  x_pos: number;
  y_pos: number;
  x_ampl: number; // What is this?
}

interface _ColorSchema {
  default?: string;
  [key: string]: string;
}

type Point = {
  x: number;
  y: number;
};

interface _VariantLabel {
  start: number;
  end: number;
  text: string;
  x: number;
  y: number;
  fontProp: string;
}

type _DisplayElement = {
  id: string | number;
  name: string;
  x1?: number;
  x2?: number;
  y1?: number;
  y2?: number;
  start: number;
  end: number;
  // FIXME: Something weird here
  exon_number?: number;
  feature?: string;
  features: string[];
  isDisplayed?: boolean;
  // eslint-disable-next-line
  tooltip?: any;
  visibleX1?: number;
  visibleX2?: number;
  visibleY1?: number;
  visibleY2?: number;
};

type _ScreenPositions = {
  start: number;
  end: number;
};

type RequestType = "GET" | "POST" | "PUT" | "DELETE";

type RequestOptions = {
  method: RequestType;
  // eslint-disable-next-line
  headers: any;
  body?: string;
};

type _OffscreenPosition = {
  start: number | null;
  end: number | null;
  scale: number | null;
};

type _OnscreenPosition = {
  start: number | null;
  end: number | null;
};

type _InteractiveFeature = {
  yStart: number;
  yEnd: number;
  step: number;
  color: string;
};

interface DragCallbacks {
  onZoomIn: (xRange: Rng) => void;
  onZoomOut: () => void;
  getHighlights: () => RangeHighlight[];
  addHighlight: (highlight: RangeHighlight) => void;
  removeHighlight: (id: string) => void;
}

interface ExpandedTrackHeight {
  collapsedHeight: number;
  expandedHeight?: number;
  /**
   * Set once the reader has dragged this track's boundary.
   *
   * Separates a height that was chosen from one the shared settings produced.
   * A chosen height is written to the saved layout, and stops a band track
   * recomputing its expanded height from its lane count.
   */
  userResized?: boolean;
}

interface DataTrackSettings {
  trackId: string;
  trackLabel: string;
  sample?: Sample;
  trackType: TrackType;
  height: ExpandedTrackHeight;
  showLabelWhenCollapsed: boolean;
  yAxis?: Axis;
  yPadBands?: boolean;
  isExpanded: boolean;
  isHidden: boolean;
  chromosome?: string;
  sourceId?: string;
}

interface Axis {
  range: Rng;
  label: string;
  hideLabelOnCollapse: boolean;
  highlightedYs?: number[];
}

interface RenderSettings {
  reloadData?: boolean;
  chromosomeChange?: boolean;
  colorByChange?: boolean;
  resized?: boolean;
  positionOnly?: boolean;
  samplesUpdated?: boolean;
  saveLayoutChange?: boolean;
  tracksReorderedOnly?: boolean;
  tracksReordered?: boolean;
  targetTrackId?: string;
  mainSampleChanged?: boolean;
}

interface RangeHighlight {
  id: string;
  chromosome: Chromosome;
  range: Rng;
  color: string;
}

interface SampleIdentifier {
  caseId: string;
  sampleId: string;
  genomeBuild: number;
}

interface Sample {
  caseId: string;
  displayCaseId?: string | null;
  caseAlias?: string | null;
  sampleId: string;
  sampleAlias?: string | null;
  genomeBuild: number;
  sampleType?: string;
  sex?: Sex;
  meta?: SampleMetaEntry[];
}

type TrackType =
  | "annotation"
  | "sample-annotation"
  | "variant"
  | "dot-cov"
  | "dot-baf"
  | "dot-hetdensity"
  | "connections"
  | "gene"
  | "homology"
  | "position"
  | "gene-list";

type IDBTranscripts = {
  transcripts: ApiSimplifiedTranscript[];
  serverTimestamp: string;
};

interface SelectData {
  id: string;
  label: string;
}

interface TrackHeights {
  bandCollapsed: number;
  dotCollapsed: number;
  dotExpanded: number;
}

type StorageValue =
  | string
  | string[]
  | TrackHeights
  | Rng
  | Record<string, boolean>
  | ProfileSettings;

type ProfileSettings = {
  version: number;
  profileKey: string;
  fileName?: string;
  layout: TrackLayout | null;
  colorAnnotationIds: string[];
  variantThreshold: number;
  annotationSelections: string[];
  coverageRange: Rng;
  trackHeights: TrackHeights;
};

type TrackLayout = {
  order: string[];
  hidden: Record<string, boolean>;
  expanded: Record<string, boolean>;
  /**
   * Heights the reader set by dragging, keyed by concrete track id.
   *
   * Optional so a layout saved before this existed still loads. Keyed
   * differently from the rest of the layout on purpose: see applySavedHeights.
   */
  heights?: Record<string, ExpandedTrackHeight>;
};

interface TableCell {
  value: string;
  class?: string;
}

interface TableData {
  columns: string[];
  rows: TableCell[][];
  rowNames: string[];
  rowNameHeader?: string;
  rowStyles?: (string | undefined)[];
}

type CellWarning = {
  colName: string;
  position: number;
  warning: string | null;
};

type Sex = "M" | "F";

type ThresholdDirection = "above" | "below" | "both";

type ThresholdKind =
  | "estimated_chromosome_count_deviate"
  | "threshold_above"
  | "threshold_below"
  | "threshold_deviate";

type WarningThreshold = {
  column: string;
  kind: ThresholdKind;
  size?: number;
  max_deviation?: number;
  message: string;
  ignore_when?: WarningIgnore | WarningIgnore[];
};

type WarningIgnore = {
  sex?: Sex;
  column?: string;
  chromosome?: string;
  row?: string;
};
