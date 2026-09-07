import { CHROMOSOMES, IDB_CACHE } from "../constants";
import { get } from "../util/fetch";
import { idbGet, idbSet } from "../util/indexeddb";
import { getSampleKey, zip } from "../util/utils";
import { EvidenceFilters, ReadEvidence } from "../util/read_connections";

// Data for these are loaded up front for the full chromosome
// Remaining zoom levels (up to "d") are loaded dynamically and
// only for the points currently in view
const CACHED_ZOOM_LEVELS = ["o", "a", "b", "c"];

// FIXME: This will need to be made configurable eventually
const DEFAULT_VARIANT_CATEGORY = "sv";
const DEFAULT_VARIANT_SUB_CATEGORIES = [
  "del",
  "dup",
  "tdup",
  "ins",
  "inv",
  "cnv",
  "bnd",
];
const ZOOM_WINDOW_CACHE_MULTIPLIER = 5;

/**
 * Remember an in-flight request under `key`, but forget it if it fails.
 *
 * Caching the promise rather than its result is what lets several callers
 * share one request, and is worth keeping. Keeping a *rejected* promise is
 * not: one dropped connection would then be replayed as the same failure for
 * the rest of the session, and panning back to that region could never
 * recover, because no second request is ever made.
 *
 * The identity check before deleting matters — by the time a failure lands,
 * the slot may already hold a newer request, and that one should stay.
 */
/**
 * The IndexedDB cache holds nothing the server cannot send again, so a browser
 * that refuses to open it should cost the reader a slower load, not an empty
 * track. Private windows and browsers set to block site data both refuse.
 */
let cacheRefusalReported = false;
function reportCacheRefusal(action: string, error: unknown): void {
  if (cacheRefusalReported) {
    return;
  }
  // Once per session. The alternative is two lines per chromosome, which buries
  // whatever else the console had to say.
  cacheRefusalReported = true;
  console.warn(
    `Could not ${action} the Gens browser cache, so tracks will be fetched from ` +
      `the server every time. Expected in a private window, or when the browser ` +
      `is set to block site data.`,
    error,
  );
}

/** Read from the cache, treating a refusal as a miss. */
async function cacheGet<T>(store: string, key: string): Promise<T | null> {
  try {
    return await idbGet<T>(IDB_CACHE.dbName, store, key);
  } catch (error) {
    reportCacheRefusal("read", error);
    return null;
  }
}

/** Write to the cache, treating a refusal as "this load is not remembered". */
async function cacheSet<T>(
  store: string,
  key: string,
  value: T,
): Promise<void> {
  try {
    await idbSet(IDB_CACHE.dbName, store, key, value);
  } catch (error) {
    reportCacheRefusal("write", error);
  }
}

export function cachedRequest<T>(
  store: Record<string, Promise<T>>,
  key: string,
  start: () => Promise<T>,
): Promise<T> {
  const existing = store[key];
  if (existing !== undefined) {
    return existing;
  }
  const pending = start();
  store[key] = pending;
  pending.catch(() => {
    if (store[key] === pending) {
      delete store[key];
    }
  });
  return pending;
}

/** The same, for the caches that remember which window they cover. */
export function cachedWindow<T>(
  store: Record<string, { range: Rng; promise: Promise<T> }>,
  key: string,
  range: Rng,
  start: () => Promise<T>,
): Promise<T> {
  const pending = start();
  const entry = { range, promise: pending };
  store[key] = entry;
  pending.catch(() => {
    if (store[key] === entry) {
      delete store[key];
    }
  });
  return pending;
}

export class API {
  genomeBuild: number;
  apiURI: string;

  private allChromData: Record<Chromosome, ChromosomeInfo> = {} as Record<
    Chromosome,
    ChromosomeInfo
  >;

  getChromSizes(): Record<Chromosome, number> {
    if (this.allChromData == null) {
      throw Error(
        "API.initialize must be called and awaited before accessing the chromosome sizes",
      );
    }

    const allChromSizes = {} as Record<Chromosome, number>;
    for (const chrom of CHROMOSOMES) {
      const chromLength = this.allChromData[chrom].size;
      allChromSizes[chrom] = chromLength;
    }
    return allChromSizes;
  }

  getChromInfo(): Record<string, ChromosomeInfo> {
    return this.allChromData;
  }

  constructor(genomeBuild: number, gensApiURL: string) {
    this.genomeBuild = genomeBuild;
    const urlWithTrailingSlash = gensApiURL.endsWith("/")
      ? gensApiURL
      : `${gensApiURL}/`;
    this.apiURI = urlWithTrailingSlash;
  }

  async initialize() {
    // All 24 at once. Fetched one after another this blocked the first paint
    // for the sum of 24 round trips, and none of them depends on another.
    const chromInfos = await Promise.all(
      CHROMOSOMES.map((chrom) => this.getChromData(chrom)),
    );
    CHROMOSOMES.forEach((chrom, index) => {
      this.allChromData[chrom] = chromInfos[index];
    });
  }

  getSearchResult(
    query: string,
    annotationTrackIds: string[],
  ): Promise<ApiSearchResult | null> {
    const params = {
      q: query,
      genome_build: this.genomeBuild,
      annotation_track_ids: annotationTrackIds.join(","),
    };

    const details = get(
      new URL(`search/result`, this.apiURI).href,
      params,
    ).then((result) => {
      if (result === null) {
        return null;
      }
      if (result["chromosome"] != null) {
        return result;
      }
      return null;
    });
    return details;
  }

  getAnnotationDetails(id: string): Promise<ApiAnnotationDetails> {
    const details = get(
      new URL(`tracks/annotations/record/${id}`, this.apiURI).href,
      {},
    ) as Promise<ApiAnnotationDetails>;
    return details;
  }

  getTranscriptDetails(id: string): Promise<ApiGeneDetails> {
    const details = get(
      new URL(`tracks/transcripts/${id}`, this.apiURI).href,
      {},
    ) as Promise<ApiGeneDetails>;
    return details;
  }

  async getVariantDetails(id: string): Promise<ApiVariantDetails> {
    const details = get(
      new URL(`tracks/variants/${id}`, this.apiURI).href,
      {},
    ) as Promise<ApiVariantDetails>;
    return details;
  }

  getAnnotationSources(): Promise<ApiAnnotationTrack[]> {
    const annotSources = get(new URL("tracks/annotations", this.apiURI).href, {
      genome_build: this.genomeBuild,
    }) as Promise<ApiAnnotationTrack[]>;
    return annotSources;
  }

  getGeneLists(): Promise<ApiGeneList[] | null> {
    // The trailing slash matters: the route is declared as "/gene_lists/" and
    // the bare path answers 404, which this client turns into null.
    const geneLists = get(
      new URL("gene_lists/", this.apiURI).href,
      {},
    ) as Promise<ApiGeneList[] | null>;
    return geneLists;
  }

  getGeneListGenes(panelId: string, chromosome: string): Promise<string[]> {
    const geneSymbols = get(
      new URL(`gene_lists/track/${panelId}`, this.apiURI).href,
      { chromosome, genome_build: this.genomeBuild },
    ) as Promise<string[]>;
    return geneSymbols;
  }

  getPanelGenes(
    panelId: string,
    version: string,
    signal?: AbortSignal,
  ): Promise<ApiPanelGenes | null> {
    // The version is pinned so the gene set cannot change under a reader
    // part-way through a panel as the panel is curated.
    return get(
      new URL(`gene_lists/${encodeURIComponent(panelId)}/genes`, this.apiURI)
        .href,
      { genome_build: this.genomeBuild, version },
      signal,
    ) as Promise<ApiPanelGenes | null>;
  }

  getSampleAnnotationSources(
    id: SampleIdentifier,
  ): Promise<ApiSampleAnnotationTrack[]> {
    const query = {
      case_id: id.caseId,
      sample_id: id.sampleId,
      genome_build: id.genomeBuild,
    };
    return get(
      new URL("sample-tracks/annotations", this.apiURI).href,
      query,
    ).then((result) => result ?? []);
  }

  private sampleAnnotsCache: Record<
    string,
    Record<string, Promise<ApiSimplifiedAnnotation[]>>
  > = {};
  getSampleAnnotations(
    trackId: string,
    chromosome: string,
  ): Promise<ApiSimplifiedAnnotation[]> {
    if (this.sampleAnnotsCache[trackId] === undefined) {
      this.sampleAnnotsCache[trackId] = {};
    }

    return cachedRequest(
      this.sampleAnnotsCache[trackId],
      chromosome,
      () =>
        get(
          new URL(`sample-tracks/annotations/track/${trackId}`, this.apiURI)
            .href,
          { chromosome },
        ) as Promise<ApiSimplifiedAnnotation[]>,
    );
  }

  getSampleAnnotationDetails(id: string): Promise<ApiSampleAnnotationDetails> {
    const details = get(
      new URL(`sample-tracks/annotations/record/${id}`, this.apiURI).href,
      {},
    ) as Promise<ApiSampleAnnotationDetails>;
    return details;
  }

  private annotsCache: Record<string, Promise<ApiSimplifiedAnnotation[]>> = {};
  /**
   * Annotations on one chromosome.
   *
   * The chromosome is part of the request rather than a filter applied after
   * it arrives. A repeat catalogue holds millions of records genome-wide, and
   * fetching all of them to draw one chromosome is the difference between a
   * usable track and an unusable one.
   */
  getAnnotations(
    trackId: string,
    chromosome: string,
    xRange: Rng,
  ): Promise<ApiSimplifiedAnnotation[]> {
    // Requests are widened to whole megabases so that panning reuses the
    // window either side of the view instead of asking again on every frame.
    const start = Math.max(1, Math.floor(xRange[0] / 1e6) * 1e6);
    const end = Math.ceil(xRange[1] / 1e6) * 1e6;
    const key = `${trackId}:${chromosome}:${start}-${end}`;
    return cachedRequest(
      this.annotsCache,
      key,
      () =>
        get(new URL(`tracks/annotations/track/${trackId}`, this.apiURI).href, {
          chromosome,
          start,
          end,
        }) as Promise<ApiSimplifiedAnnotation[]>,
    );
  }

  /**
   * Calculate base zoom levels up front
   * Return detailed zoom levels only on demand
   */
  private covSampleChrZoomCache: Record<
    string,
    Record<string, Record<string, Promise<ApiCoverageDot[]>>>
  > = {};
  private covSampleDWindowCache: Record<
    string,
    Record<string, { range: Rng; promise: Promise<ApiCoverageDot[]> }>
  > = {};
  getCov(
    id: SampleIdentifier,
    chrom: string,
    zoom: string,
    xRange: Rng,
  ): Promise<ApiCoverageDot[]> {
    const endpoint = "samples/sample/coverage";
    const sampleKey = getSampleKey(id);

    if (this.covSampleChrZoomCache[sampleKey] == null) {
      this.covSampleChrZoomCache[sampleKey] = {};
    }

    if (CACHED_ZOOM_LEVELS.includes(zoom)) {
      if (this.covSampleChrZoomCache[sampleKey][chrom] === undefined) {
        this.covSampleChrZoomCache[sampleKey][chrom] = {};
      }

      return cachedRequest(
        this.covSampleChrZoomCache[sampleKey][chrom],
        zoom,
        () =>
          getCovData(
            this.apiURI,
            endpoint,
            id.sampleId,
            id.caseId,
            id.genomeBuild,
            chrom,
            zoom,
            [1, this.getChromSizes()[chrom]],
          ),
      );
    } else {
      // Zoom D level
      // FIXME: This should be generalized to be configurable

      if (this.covSampleDWindowCache[sampleKey] == null) {
        this.covSampleDWindowCache[sampleKey] = {};
      }

      const cached = this.covSampleDWindowCache[sampleKey][chrom];
      const withinCache =
        cached !== undefined &&
        xRange[0] >= cached.range[0] &&
        xRange[1] <= cached.range[1];

      if (withinCache) {
        return cached.promise.then((data) => filterRange(data, xRange));
      }

      const extended = expandRange(
        xRange,
        ZOOM_WINDOW_CACHE_MULTIPLIER,
        this.getChromSizes()[chrom],
      );

      return cachedWindow(
        this.covSampleDWindowCache[sampleKey],
        chrom,
        extended,
        () =>
          getCovData(
            this.apiURI,
            endpoint,
            id.sampleId,
            id.caseId,
            id.genomeBuild,
            chrom,
            zoom,
            extended,
          ),
      ).then((data) => filterRange(data, xRange));
    }
  }

  private bafSampleZoomChrCache: Record<
    string,
    Record<string, Record<string, Promise<ApiCoverageDot[]>>>
  > = {};
  private bafSampleDWindowCache: Record<
    string,
    Record<string, { range: Rng; promise: Promise<ApiCoverageDot[]> }>
  > = {};
  getBaf(
    id: SampleIdentifier,
    chrom: string,
    zoom: string,
    xRange: Rng,
  ): Promise<ApiCoverageDot[]> {
    const endpoint = "samples/sample/baf";
    const sampleKey = getSampleKey(id);

    if (this.bafSampleZoomChrCache[sampleKey] == null) {
      this.bafSampleZoomChrCache[sampleKey] = {};
    }

    if (CACHED_ZOOM_LEVELS.includes(zoom)) {
      if (this.bafSampleZoomChrCache[sampleKey][chrom] === undefined) {
        this.bafSampleZoomChrCache[sampleKey][chrom] = {};
      }

      return cachedRequest(
        this.bafSampleZoomChrCache[sampleKey][chrom],
        zoom,
        () =>
          getCovData(
            this.apiURI,
            endpoint,
            id.sampleId,
            id.caseId,
            id.genomeBuild,
            chrom,
            zoom,
            [1, this.getChromSizes()[chrom]],
          ),
      );
    } else {
      if (this.bafSampleDWindowCache[sampleKey] == null) {
        this.bafSampleDWindowCache[sampleKey] = {};
      }

      const cached = this.bafSampleDWindowCache[sampleKey][chrom];
      const withinCache =
        cached !== undefined &&
        xRange[0] >= cached.range[0] &&
        xRange[1] <= cached.range[1];

      if (withinCache) {
        return cached.promise.then((data) => filterRange(data, xRange));
      }

      const extended = expandRange(
        xRange,
        ZOOM_WINDOW_CACHE_MULTIPLIER,
        this.getChromSizes()[chrom],
      );

      return cachedWindow(
        this.bafSampleDWindowCache[sampleKey],
        chrom,
        extended,
        () =>
          getCovData(
            this.apiURI,
            endpoint,
            id.sampleId,
            id.caseId,
            id.genomeBuild,
            chrom,
            zoom,
            extended,
          ),
      ).then((data) => filterRange(data, xRange));
    }
  }

  private transcriptUpdateTimestamp: string | null = null;
  private async getTranscriptUpdateTimestamp(): Promise<string | null> {
    if (this.transcriptUpdateTimestamp != null) {
      return this.transcriptUpdateTimestamp;
    }
    const resp = (await get(new URL("tracks/updates", this.apiURI).href, {
      track: "transcripts",
    })) as { track: string; timestamp: string | null };
    this.transcriptUpdateTimestamp = resp ? resp.timestamp : null;
    return this.transcriptUpdateTimestamp;
  }

  private transcriptCache: Record<string, Promise<ApiSimplifiedTranscript[]>> =
    {};
  getTranscripts(
    chrom: string,
    onlyCanonical: boolean,
  ): Promise<ApiSimplifiedTranscript[]> {
    const cacheKey = `${this.genomeBuild}|${chrom}|${onlyCanonical ? 1 : 0}`;

    return cachedRequest(this.transcriptCache, cacheKey, async () => {
      const serverTs = await this.getTranscriptUpdateTimestamp();
      const cached = await cacheGet<IDBTranscripts>(
        IDB_CACHE.transcriptsStore,
        cacheKey,
      );
      if (cached != null && Array.isArray(cached.transcripts)) {
        if (serverTs == null) {
          return cached.transcripts as ApiSimplifiedTranscript[];
        }
        if (cached.serverTimestamp === serverTs) {
          return cached.transcripts as ApiSimplifiedTranscript[];
        }
      }

      const query = {
        chromosome: chrom,
        genome_build: this.genomeBuild,
        only_canonical: onlyCanonical,
      };
      const transcripts = (await get(
        new URL("tracks/transcripts", this.apiURI).href,
        query,
      )) as ApiSimplifiedTranscript[];

      await cacheSet(IDB_CACHE.transcriptsStore, cacheKey, {
        transcripts,
        serverTimestamp: serverTs,
        cachedAt: new Date().toISOString(),
      });

      return transcripts;
    });
  }

  private cachedThreshold: number;
  private variantsSampleChromCache: Record<
    string,
    Record<string, Promise<ApiSimplifiedVariant[]>>
  > = {};
  getVariants(
    // Sample instead of SampleIdf to retrieve sample type
    // Later likely an analysis type should be used (i.e. constitutional vs somatic)
    sample: Sample,
    chrom: string,
    rank_score_threshold: number,
  ): Promise<ApiSimplifiedVariant[]> {
    const sampleKey = getSampleKey(sample);
    const selectedCategory = getScoutVariantCategory(sample.sampleType);
    const categoryChromCacheKey = `${selectedCategory}:${chrom}`;

    // Invalidate cache if changing the rank score threshold
    if (this.cachedThreshold != rank_score_threshold) {
      this.cachedThreshold = rank_score_threshold;
      this.variantsSampleChromCache = {};
    }

    if (this.variantsSampleChromCache[sampleKey] == null) {
      this.variantsSampleChromCache[sampleKey] = {};
    }

    return cachedRequest(
      this.variantsSampleChromCache[sampleKey],
      categoryChromCacheKey,
      () => {
        // Note: The genome build is ignored when running this
        // with a Scout backend
        const query = {
          sample_id: sample.sampleId,
          case_id: sample.caseId,
          genome_build: sample.genomeBuild,
          chromosome: chrom,
          category: selectedCategory,
          start: 1,
          rank_score_threshold,
          sub_categories: DEFAULT_VARIANT_SUB_CATEGORIES,
        };
        const url = new URL("tracks/variants", this.apiURI).href;
        return get(url, query) as Promise<ApiSimplifiedVariant[]>;
      },
    );
  }

  private chromCache: Record<string, Promise<ChromosomeInfo>> = {};
  getChromData(chrom: string): Promise<ChromosomeInfo> {
    return cachedRequest(
      this.chromCache,
      chrom,
      () =>
        get(new URL(`tracks/chromosomes/${chrom}`, this.apiURI).href, {
          genome_build: this.genomeBuild,
        }) as Promise<ChromosomeInfo>,
    );
  }

  private overviewSampleCovCache: Record<
    string,
    Promise<Record<string, ApiCoverageDot[]>>
  > = {};
  getOverviewCovData(
    id: SampleIdentifier,
  ): Promise<Record<string, ApiCoverageDot[]>> {
    const sampleKey = getSampleKey(id);

    return cachedRequest(this.overviewSampleCovCache, sampleKey, () =>
      getOverviewData(
        id.sampleId,
        id.caseId,
        id.genomeBuild,
        "cov",
        this.apiURI,
      ),
    );
  }

  private overviewBafCache: Record<
    string,
    Promise<Record<string, ApiCoverageDot[]>>
  > = {};
  getOverviewBafData(
    id: SampleIdentifier,
  ): Promise<Record<string, ApiCoverageDot[]>> {
    const sampleKey = getSampleKey(id);

    return cachedRequest(this.overviewBafCache, sampleKey, () =>
      getOverviewData(
        id.sampleId,
        id.caseId,
        id.genomeBuild,
        "baf",
        this.apiURI,
      ),
    );
  }

  getHetDensity(
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
    signal?: AbortSignal,
  ): Promise<ApiHetDensityTrack> {
    return get(
      new URL("samples/sample/het-density", this.apiURI).href,
      {
        sample_id: id.sampleId,
        case_id: id.caseId,
        genome_build: id.genomeBuild,
        chromosome: chrom,
        start: Math.max(1, Math.floor(xRange[0])),
        end: Math.ceil(xRange[1]),
      },
      signal,
    ) as Promise<ApiHetDensityTrack>;
  }

  /**
   * Catalogued sequence homology overlapping a region.
   *
   * Not sample-specific and not cached per sample: the catalogue is the same
   * for every sample on a genome build, and what differs between samples is the
   * connections it gets read beside.
   */
  getHomology(
    genomeBuild: number,
    chrom: string,
    xRange: Rng,
    signal?: AbortSignal,
  ): Promise<ApiHomologyRegions> {
    return get(
      new URL("homology", this.apiURI).href,
      {
        genome_build: genomeBuild,
        chromosome: chrom,
        start: Math.max(1, Math.floor(xRange[0])),
        end: Math.ceil(xRange[1]),
      },
      signal,
    ) as Promise<ApiHomologyRegions>;
  }

  async getBafHistogramData(
    id: SampleIdentifier,
    region: Region,
    signal?: AbortSignal,
  ): Promise<ApiCoverageDot[]> {
    if (
      !Number.isInteger(region.start) ||
      !Number.isInteger(region.end) ||
      region.start < 1 ||
      region.end < region.start
    ) {
      throw new Error("Invalid BAF histogram interval");
    }
    const result = (await get(
      new URL("samples/sample/baf", this.apiURI).href,
      {
        sample_id: id.sampleId,
        case_id: id.caseId,
        genome_build: id.genomeBuild,
        chromosome: region.chrom,
        zoom_level: "d",
        // Sent as the inclusive interval the reader sees, the same as every
        // other caller. This used to subtract one to compensate for the server
        // reading start as a BED coordinate; that conversion now happens once,
        // server-side, so doing it here as well would drop a base again.
        start: region.start,
        end: region.end,
      },
      signal,
    )) as { position: number[]; value: number[]; zoom: string | null } | null;

    if (
      result == null ||
      !Array.isArray(result.position) ||
      !Array.isArray(result.value) ||
      result.position.length !== result.value.length ||
      (result.position.length > 0 && result.zoom !== "d")
    ) {
      throw new Error("Full-resolution BAF data is unavailable");
    }

    return filterRange(
      result.position.map((pos, index) => ({
        pos,
        value: result.value[index],
      })),
      [region.start, region.end],
    );
  }

  getReadEvidence(
    id: SampleIdentifier,
    region: Region,
    filters: EvidenceFilters,
    signal?: AbortSignal,
  ): Promise<ReadEvidence | null> {
    return get(
      new URL("samples/sample/read-evidence", this.apiURI).href,
      {
        sample_id: id.sampleId,
        case_id: id.caseId,
        genome_build: id.genomeBuild,
        chromosome: region.chrom,
        start: region.start,
        end: region.end,
        ...filters,
      },
      signal,
    );
  }

  getSample(id: SampleIdentifier): Promise<ApiSample> {
    const query = {
      sample_id: id.sampleId,
      case_id: id.caseId,
      genome_build: id.genomeBuild,
    };
    return get(
      new URL("samples/sample", this.apiURI).href,
      query,
    ) as Promise<ApiSample>;
  }
}

function expandRange(range: Rng, factor: number, chromSize: number): Rng {
  const width = range[1] - range[0];
  const halfExtra = Math.floor((width * factor - width) / 2);
  const start = Math.max(1, range[0] - halfExtra);
  const end = Math.min(chromSize, range[1] + halfExtra);
  return [start, end];
}

function filterRange(data: ApiCoverageDot[], range: Rng): ApiCoverageDot[] {
  return data.filter((d) => d.pos >= range[0] && d.pos <= range[1]);
}

async function getCovData(
  apiURI: string,
  endpoint: string,
  sampleId: string,
  caseId: string,
  genomeBuild: number,
  chrom: string,
  zoom: string,
  range: Rng,
): Promise<ApiCoverageDot[]> {
  const query = {
    sample_id: sampleId,
    case_id: caseId,
    genome_build: genomeBuild,
    chromosome: chrom,
    zoom_level: zoom,
    start: range[0],
    end: range[1],
  };

  const regionResult = (await get(new URL(endpoint, apiURI).href, query)) as {
    position: number[];
    value: number[];
  };
  const parsedResult: ApiCoverageDot[] = zip(
    regionResult.position,
    regionResult.value,
  ).map(([pos, val]) => {
    return {
      pos: pos,
      value: val,
    };
  });

  return parsedResult;
}

async function getOverviewData(
  sampleId: string,
  caseId: string,
  genomeBuild: number,
  covOrBaf: "cov" | "baf",
  apiURI: string,
): Promise<Record<string, ApiCoverageDot[]>> {
  const query = {
    sample_id: sampleId,
    case_id: caseId,
    genome_build: genomeBuild,
    cov_or_baf: covOrBaf,
  };

  const dataType = covOrBaf == "cov" ? "coverage" : "baf";

  type OverviewData = {
    region: string;
    position: number[];
    value: number[];
    zoom: string | null;
  };

  const overviewData: OverviewData[] = await get(
    new URL(`samples/sample/${dataType}/overview`, apiURI).href,
    query,
  );

  const chromToDataObject: Record<string, OverviewData> = {};
  overviewData.forEach((chromData) => {
    chromToDataObject[chromData.region] = chromData;
  });

  const chromDatapoints: Record<string, ApiCoverageDot[]> = {};
  for (const chrom of CHROMOSOMES) {
    if (chromToDataObject[chrom] == null) {
      chromDatapoints[chrom] = [];
      continue;
    }
    const element = chromToDataObject[chrom];
    const points: ApiCoverageDot[] = zip(element.position, element.value).map(
      (xy) => {
        return {
          pos: xy[0],
          value: xy[1],
        };
      },
    );
    chromDatapoints[element.region] = points;
  }

  return chromDatapoints;
}

function getScoutVariantCategory(sampleType?: string): string {
  const normalizedType = sampleType?.toLowerCase();
  if (normalizedType === "normal" || normalizedType === "tumor") {
    return "cancer_sv";
  }
  return DEFAULT_VARIANT_CATEGORY;
}
