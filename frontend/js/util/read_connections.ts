import { COLORS } from "../constants";

export interface ReadEndpoint {
  chromosome: string;
  start: number;
  end: number;
  strand: "+" | "-" | ".";
}

export interface ReadConnection {
  id: string;
  kind: "split" | "pair" | "call" | "unknown";
  first: ReadEndpoint;
  second: ReadEndpoint;
  fragments: number | null;
  minimum_observed_mapq: number | null;
}

export interface ReadEvidence {
  chromosome: string;
  start: number;
  end: number;
  genome_build: number;
  source_label: string;
  records_examined: number;
  truncated: boolean;
  connections: ReadConnection[];
}

export interface EvidenceFilters {
  kind: ReadConnection["kind"] | "all";
  minimum_mapq: number;
  minimum_fragments: number;
}

export const EVIDENCE_WINDOW = 1_000_000;
export const CONNECTION_KINDS: Record<ReadConnection["kind"], string> = {
  split: "Split alignment",
  pair: "Read pair",
  call: "SV call",
  unknown: "Unspecified",
};

export function endpointLabel(endpoint: ReadEndpoint): string {
  const position =
    endpoint.start === endpoint.end
      ? endpoint.start.toLocaleString()
      : `${endpoint.start.toLocaleString()}-${endpoint.end.toLocaleString()}`;
  return `${endpoint.chromosome}:${position} (${endpoint.strand})`;
}

export function endpointGeometry(endpoint: ReadEndpoint, region: Region) {
  const local = endpoint.chromosome === region.chrom;
  const visible =
    local && endpoint.end >= region.start && endpoint.start <= region.end;
  const scale = (position: number) =>
    40 +
    460 *
      Math.max(
        0,
        Math.min(
          1,
          (position - region.start) / Math.max(1, region.end - region.start),
        ),
      );
  return {
    visible,
    x: local ? scale((endpoint.start + endpoint.end) / 2) : 560,
    left: local ? scale(endpoint.start) : 560,
    right: local ? scale(endpoint.end) : 560,
  };
}

export function endpointRegion(
  endpoint: ReadEndpoint,
  chromSizes: Record<string, number>,
): Region | null {
  const size = chromSizes[endpoint.chromosome];
  if (!size || endpoint.start > size || endpoint.end < 1) return null;
  const center = Math.floor(
    (endpoint.start + Math.min(size, endpoint.end)) / 2,
  );
  return {
    chrom: endpoint.chromosome as Chromosome,
    start: Math.max(1, center - 10000),
    end: Math.min(size, center + 10000),
  };
}

/**
 * Colour per evidence kind, shared by the side panel and the track.
 *
 * One definition rather than two, so a connection cannot be teal in the panel
 * and blue in the track that sits under it.
 */
export const CONNECTION_COLORS: Record<ReadConnection["kind"], string> = {
  split: COLORS.teal,
  pair: COLORS.blue,
  call: "#a12622",
  unknown: COLORS.darkGray,
};
