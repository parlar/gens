import {
  HET_DENSITY_Y_RANGE,
  STYLE,
  VARIANT_COLORS,
  ZOOM_STEPS,
} from "../constants";
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
  getChrom: () => string,
  getXRange: () => Rng,
  getVariantURL: (id: string) => string | null,
): RenderDataSource {
  const getChromInfo = async () => {
    return api.getChromData(getChrom());
  };

  const getAnnotation = async (
    recordId: string,
    chrom: string,
  ): Promise<RenderBand[]> => {
    const annotData = await api.getAnnotations(recordId);
    return parseAnnotations(annotData, chrom);
  };

  const getCovData = async (
    id: SampleIdentifier,
    chrom: string,
    xRange: Rng,
  ): Promise<RenderDot[]> => {
    const zoom = calculateZoom(xRange);

    const covRaw = await api.getCov(id, chrom, zoom, xRange);
    return parseCoverageDot(covRaw, STYLE.colors.darkGray);
  };

  const getBafData = async (
    id: SampleIdentifier,
    chrom: string,
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
    chrom: string,
  ): Promise<DotTrackData> => {
    const xRange = getXRange();
    const track = await api.getHetDensity(id, chrom, xRange);

    if (track.baseline < track.minimum_baseline) {
      // A chromosome whose typical bin holds a handful of sites cannot support
      // a ratio at all. Saying so beats plotting one.
      return {
        dots: [],
        shaded: [
          {
            start: xRange[0],
            end: xRange[1],
            color: STYLE.colors.lightGray,
            label: "Too few heterozygous sites on this chromosome to scale",
          },
        ],
      };
    }

    const [low, high] = HET_DENSITY_Y_RANGE;
    const dots = track.bins.map((bin) => ({
      x: (bin.start + bin.end) / 2,
      // A bin with no heterozygous sites has no logarithm; it is pinned to the
      // bottom of the axis, which is where an unbounded drop belongs.
      y:
        bin.observed === 0
          ? low
          : Math.min(
              high,
              Math.max(low, Math.log2(bin.observed / track.baseline)),
            ),
      color: STYLE.colors.darkGray,
    }));

    return { dots, shaded: [] };
  };

  const getTranscriptBands = async (chrom: string): Promise<RenderBand[]> => {
    const onlyCanonical = true;
    const transcriptsRaw = await api.getTranscripts(chrom, onlyCanonical);
    return parseTranscripts(transcriptsRaw);
  };

  const getGeneListBands = async (
    listId: string,
    chrom: string,
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
    chrom: string,
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
        color: annot.color,
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
        color: annot.color,
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

    const hetHomColors =
      VARIANT_COLORS[variant.sub_category] != undefined
        ? VARIANT_COLORS[variant.sub_category]
        : VARIANT_COLORS.default;

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
