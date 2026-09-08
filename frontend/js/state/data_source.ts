import {
  ANNOTATIONS_RESPONSE_CAP,
  HET_DENSITY_MAX_WINDOW,
  HET_DENSITY_Y_RANGE,
  HOMOLOGY_MAX_WINDOW,
  STYLE,
  VARIANT_COLORS,
  ZOOM_STEPS,
} from "../constants";
import { toTrackData } from "../util/connection_arcs";
import { hetDensityBars } from "../util/het_density";
import { homologyBands } from "../util/homology";
import { EVIDENCE_WINDOW } from "../util/read_connections";
import { prefixNts, transformMap } from "../util/utils";
import { API } from "./api";

function calculateZoom(xRange: Rng) {
  const xRangeSize = xRange[1] - xRange[0];
  let returnVal;
  if (xRangeSize > ZOOM_STEPS.A) {
    returnVal = "a";
  } else if (xRangeSize > ZOOM_STEPS.B) {
    returnVal = "b";
  } else if (xRangeSize > ZOOM_STEPS.C) {
    returnVal = "c";
  } else {
    returnVal = "d";
  }
  return returnVal;
}

export function getRenderDataSource(
  api: API,
  getChrom: () => Chromosome,
  getXRange: () => Rng,
  getVariantURL: (id: string) => string | null,
): RenderDataSource {
  const getChromInfo = async () => {
    return api.getChromData(getChrom());
  };

  const getAnnotation = async (
    recordId: string,
    chrom: string,
  ): Promise<BandTrackData> => {
    const xRange = getXRange();
    const annotData = await api.getAnnotations(recordId, chrom, xRange);
    // The server stops at a fixed number of records and does not choose them
    // by distance from the view, so a full response means the track is showing
    // part of the window without being able to say which part.
    const incomplete =
      annotData.length >= ANNOTATIONS_RESPONSE_CAP
        ? "Too many to show here. Zoom in to see them all."
        : null;
    return { bands: parseAnnotations(annotData, chrom), incomplete };
  };

  const getCovData = async (
    id: SampleIdentifier,
    chrom: Chromosome,
    xRange: Rng,
  ): Promise<RenderDot[]> => {
    const zoom = calculateZoom(xRange);

    const covRaw = await api.getCov(id, chrom, zoom, xRange);
    return parseCoverageDot(covRaw, STYLE.colors.darkGray);
  };

  const getBafData = async (
    id: SampleIdentifier,
    chrom: Chromosome,
  ): Promise<RenderDot[]> => {
    const xRange = getXRange();
    const zoom = calculateZoom(xRange);

    const bafRaw = await api.getBaf(id, chrom, zoom, xRange);
    return parseCoverageDot(bafRaw, STYLE.colors.darkGray);
  };

  /**
   * Heterozygote density: how many heterozygous sites each fixed genomic bin
   * holds, against this sample's typical bin on the same chromosome.
   *
   * A heterozygous deletion and a run of homozygosity both remove heterozygosity
   * rather than shifting the B-allele band, so neither is visible in the BAF
   * track. Neither is distinguishable from the other here, nor from a coverage
   * dropout or ordinary mapping difficulty, which is why this carries no
   * significance and no call: read it beside the coverage track, where a
   * deletion falls and a run of homozygosity does not.
   *
   * Plotted as log2 of the ratio, matching the coverage track's scale, because
   * the raw ratio is bounded below by 0 and unbounded above and would clamp
   * almost every ordinary bin against the top of a linear axis.
   */
  const getHetDensityData = async (
    id: SampleIdentifier,
    chrom: Chromosome,
  ): Promise<DotTrackData> => {
    const xRange = getXRange();

    // Saying the track is unavailable, and why, rather than drawing an empty
    // one. An empty track and a broken track look identical otherwise.
    const unavailable = (label: string): DotTrackData => ({
      dots: [],
      shaded: [
        {
          start: xRange[0],
          end: xRange[1],
          color: STYLE.colors.lightGray,
          label,
        },
      ],
    });

    // The endpoint refuses a wider region, so asking would raise instead of
    // drawing. A whole chromosome is wider than this, which is the view the
    // user lands on, so the guard has to be here rather than in an error path.
    if (xRange[1] - xRange[0] > HET_DENSITY_MAX_WINDOW) {
      return unavailable(
        `Zoom in below ${HET_DENSITY_MAX_WINDOW / 1_000_000} Mb to see heterozygote density`,
      );
    }

    const track = await api.getHetDensity(id, chrom, xRange);

    if (track.baseline < track.minimum_baseline) {
      // A chromosome whose typical bin holds a handful of sites cannot support
      // a ratio at all. Saying so beats plotting one.
      return unavailable(
        "Too few heterozygous sites on this chromosome to scale",
      );
    }

    // Bars rather than dots, and shaded by the coverage the backend measured
    // over the identical bins. A bin is one number on a fixed grid, so a dot at
    // its midpoint states neither its width nor its meaning: a stretch of
    // depleted bins came out as a handful of stray pixels. See
    // frontend/js/util/het_density.ts for what the shading is and is not.
    const bars = hetDensityBars(
      track.bins,
      track.baseline,
      HET_DENSITY_Y_RANGE,
    );

    return { dots: [], bars, shaded: [] };
  };

  const getReadConnections = async (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ): Promise<ConnectionsTrackData> => {
    // The endpoint refuses a wider window, so the guard belongs here rather
    // than in an error path: a whole chromosome is wider than this, and that is
    // the view a reader lands on.
    //
    // The range is inclusive of both ends, which is how the route counts it
    // (end - start + 1). Leaving the + 1 off here made this guard one base
    // more permissive than the server, so the exact boundary window was sent
    // and came back 422.
    if (xRange[1] - xRange[0] + 1 > EVIDENCE_WINDOW) {
      return toTrackData(
        null,
        `Zoom in below ${EVIDENCE_WINDOW / 1_000_000} Mb to see read connections`,
      );
    }

    const evidence = await api.getReadEvidence(
      id,
      { chrom: chrom as Chromosome, start: xRange[0], end: xRange[1] },
      { kind: "all", minimum_mapq: 0, minimum_fragments: 0 },
    );
    return toTrackData(evidence, null);
  };

  /**
   * Whether this sample has connections loaded at all.
   *
   * Asked once when tracks are built, with the narrowest window the endpoint
   * accepts, so a sample without a BEDPE gets no lane rather than a permanently
   * empty one.
   */
  const hasReadConnections = async (id: SampleIdentifier): Promise<boolean> => {
    const evidence = await api.getReadEvidence(
      id,
      { chrom: "1" as Chromosome, start: 1, end: 2 },
      { kind: "all", minimum_mapq: 0, minimum_fragments: 0 },
    );
    return evidence !== null;
  };

  /**
   * Catalogued homology for the view, marked where the sample's own reads agree.
   *
   * The catalogue is the same for every sample; what makes it worth reading is
   * whether the discordant reads of the sample in front of you point into a
   * pair's partner. Both halves are fetched here so the reader is not left to
   * compare two tracks by coordinate.
   *
   * Connections are optional evidence, not a precondition. They are served only
   * over a much narrower window than the catalogue, and a sample may have no
   * BEDPE at all; in either case the pairs are still worth showing, unmarked,
   * because homology bears on how far the coverage can be trusted whether or
   * not any read supports an event.
   */
  const getHomologyBands = async (
    id: SampleIdentifier,
    chrom: Chromosome,
    xRange: Rng,
  ): Promise<RenderBand[]> => {
    if (xRange[1] - xRange[0] > HOMOLOGY_MAX_WINDOW) {
      return [];
    }
    const [homology, connections] = await Promise.all([
      api.getHomology(id.genomeBuild, chrom, xRange),
      getReadConnections(id, chrom, xRange).catch(() => ({
        connections: [],
        truncated: false,
        unavailable: null,
      })),
    ]);
    return homologyBands(homology.pairs, connections.connections, id.sampleId);
  };

  const getTranscriptBands = async (
    chrom: Chromosome,
  ): Promise<RenderBand[]> => {
    const onlyCanonical = true;
    const transcriptsRaw = await api.getTranscripts(chrom, onlyCanonical);
    return parseTranscripts(transcriptsRaw);
  };

  const getGeneListBands = async (
    listId: string,
    chrom: Chromosome,
  ): Promise<RenderBand[]> => {
    const geneSymbols = new Set(await api.getGeneListGenes(listId, chrom));
    const onlyCanonical = true;
    const transcriptsRaw = await api.getTranscripts(chrom, onlyCanonical);
    const matchingTranscripts = transcriptsRaw.filter((tr) =>
      geneSymbols.has(tr.name),
    );

    return parseTranscripts(matchingTranscripts);
  };

  const getVariantBands = async (
    sample: Sample,
    chrom: Chromosome,
    variantThres: number,
  ): Promise<RenderBand[]> => {
    const variantsRaw = await api.getVariants(sample, chrom, variantThres);
    return parseVariants(variantsRaw);
  };

  const getOverviewCovData = async (
    id: SampleIdentifier,
  ): Promise<Record<string, RenderDot[]>> => {
    const overviewCovRaw = await api.getOverviewCovData(id);
    const overviewCovRender = transformMap(overviewCovRaw, (cov) =>
      parseCoverageDot(cov, STYLE.colors.darkGray),
    );
    return overviewCovRender;
  };

  const getOverviewBafData = async (
    sample: Sample,
  ): Promise<Record<string, RenderDot[]>> => {
    const overviewBafRaw = await api.getOverviewBafData(sample);
    const overviewBafRender = transformMap(overviewBafRaw, (cov) =>
      parseCoverageDot(cov, STYLE.colors.darkGray),
    );
    return overviewBafRender;
  };

  const getSampleAnnotationBands = async (
    trackId: string,
    chrom: string,
  ): Promise<RenderBand[]> => {
    const annotsRaw = await api.getSampleAnnotations(trackId, chrom);
    return parseSampleAnnotations(annotsRaw, chrom);
  };

  const getSampleAnnotationDetails = async (
    recordId: string,
  ): Promise<ApiSampleAnnotationDetails> => {
    return api.getSampleAnnotationDetails(recordId);
  };

  const getSampleAnnotSources = async (
    id: SampleIdentifier,
  ): Promise<{ id: string; name: string }[]> => {
    const results = await api.getSampleAnnotationSources(id);
    return results.map((r) => {
      return {
        id: r.track_id,
        name: r.name,
      };
    });
  };

  const renderDataSource: RenderDataSource = {
    getChromInfo,
    getAnnotationBands: getAnnotation,
    getAnnotationDetails: (id: string) => api.getAnnotationDetails(id),
    getSampleAnnotSources,
    getSampleAnnotationBands,
    getSampleAnnotationDetails,
    getCovData,
    getBafData,
    getHetDensityData,
    getReadConnections,
    getHomologyBands,
    hasReadConnections,
    getTranscriptBands,
    getTranscriptDetails: (id: string) => api.getTranscriptDetails(id),
    getGeneListBands,
    getVariantBands,
    getVariantDetails: (id: string) => api.getVariantDetails(id),
    getOverviewCovData,
    getOverviewBafData,
    getVariantURL,
  };
  return renderDataSource;
}

export function parseAnnotations(
  annotations: ApiSimplifiedAnnotation[],
  chromosome: string,
): RenderBand[] {
  const results = annotations
    .filter((annot) => annot.chrom == chromosome)
    .map((annot) => {
      const label = annot.name;
      return {
        id: annot.record_id,
        // id: `${annot.start}_${annot.end}_${annot.color}_${label}`,
        start: annot.start,
        end: annot.end,
        // Null on the API where the record names no colour. Left as absent so
        // the band track applies the same grey the backend defaults to.
        color: annot.color ?? undefined,
        label,
        hoverInfo: `${annot.name}`,
      };
    });
  return results;
}

export function parseSampleAnnotations(
  annotations: ApiSimplifiedAnnotation[],
  chromosome: string,
): RenderBand[] {
  const results = annotations
    .filter((annot) => annot.chrom == chromosome)
    .map((annot) => {
      const label = annot.name;
      return {
        id: annot.record_id,
        start: annot.start,
        end: annot.end,
        // Null on the API where the record names no colour. Left as absent so
        // the band track applies the same grey the backend defaults to.
        color: annot.color ?? undefined,
        label,
        hoverInfo: `${annot.name}`,
      };
    });
  return results;
}

function parseTranscriptFeatures(
  features: {
    feature: string;
    start: number;
    end: number;
    exon_number?: number;
  }[],
): TranscriptFeature[] {
  return features.map((part) => {
    return {
      start: part.start,
      end: part.end,
      exonNumber: part.exon_number,
      feature: part.feature,
    };
  });
}

export function parseTranscripts(
  transcripts: ApiSimplifiedTranscript[],
): RenderBand[] {
  const transcriptsToRender: RenderBand[] = transcripts.map((transcript) => {
    const exons = parseTranscriptFeatures(transcript.features);
    const exonCount = exons.filter((f) => f.feature === "exon").length;
    const renderBand: RenderBand = {
      id: transcript.record_id,
      start: transcript.start,
      end: transcript.end,
      label: transcript.name,
      color: transcript.is_protein_coding
        ? STYLE.colors.green
        : STYLE.colors.blue,
      hoverInfo: `${transcript.name}`,
      direction: transcript.strand as "+" | "-",
      subFeatures: exons,
      exonCount,
    };
    return renderBand;
  });

  // FIXME: This should be done on the backend
  const seenIds = new Set();
  const filteredDuplicates = transcriptsToRender.filter((tr) => {
    const fingerprint = `${tr.label}_${tr.start}_${tr.end}`;
    if (seenIds.has(fingerprint)) {
      return false;
    } else {
      seenIds.add(fingerprint);
      return true;
    }
  });

  return filteredDuplicates;
}

export function parseVariants(variants: ApiSimplifiedVariant[]): RenderBand[] {
  return variants.map((variant) => {
    const id = variant.document_id;
    const length = variant.end - variant.start;

    const subCategory = variant.sub_category;
    const hetHomColors =
      (subCategory != null
        ? VARIANT_COLORS[subCategory as keyof typeof VARIANT_COLORS]
        : undefined) ?? VARIANT_COLORS.default;

    const color =
      variant.genotype == "0/1" ? hetHomColors.het : hetHomColors.hom;

    return {
      id,
      start: variant.start,
      end: variant.end,
      hoverInfo: `${variant.sub_category} (${prefixNts(length)})`,
      label: `${variant.variant_type} ${variant.sub_category}`,
      color,
    };
  });
}

export function parseCoverageBin(
  coverage: ApiCoverageBin[],
  color: string,
): RenderDot[] {
  const renderData = coverage.map((d) => {
    return {
      x: (d.start + d.end) / 2,
      y: d.value,
      color,
    };
  });

  return renderData;
}

export function parseCoverageDot(
  coverage: ApiCoverageDot[],
  color: string,
): RenderDot[] {
  const renderData = coverage.map((d) => {
    return {
      x: d.pos,
      y: d.value,
      color,
    };
  });

  return renderData;
}
