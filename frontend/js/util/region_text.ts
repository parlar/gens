/** Reading a region a person typed. */

export interface ParsedRegion {
  region: Region | null;
  /** What is wrong and how to fix it, or null when the text was usable. */
  error: string | null;
}

/** How a region is shown back to the reader, and what they can type. */
export function formatRegion(region: Region): string {
  return `${region.chrom}:${region.start.toLocaleString()}-${region.end.toLocaleString()}`;
}

/**
 * Parse "1:100,000-200,000" into a region.
 *
 * Deliberately forgiving about how it is written, because the coordinates a
 * reader pastes come from other tools: thousands separators, spaces and a
 * "chr" prefix are all accepted. It is strict about what the numbers mean,
 * because a region that is silently wrong is worse than one that is refused.
 */
export function parseRegionText(
  text: string,
  chromosomes: readonly string[],
): ParsedRegion {
  const cleaned = text.trim();
  if (cleaned === "") {
    return { region: null, error: "Enter a region, for example 1:100000-200000" };
  }

  const match = /^(?:chr)?([^\s:]+)\s*:\s*([\d,\s]+?)\s*-\s*([\d,\s]+)$/i.exec(
    cleaned,
  );
  if (match === null) {
    return {
      region: null,
      error: "Write the region as chromosome:start-end, for example 1:100000-200000",
    };
  }

  const [, rawChrom, rawStart, rawEnd] = match;
  const chrom = rawChrom.toUpperCase() === "M" ? "MT" : rawChrom.toUpperCase();
  const named = chromosomes.find(
    (candidate) => candidate.toUpperCase() === chrom,
  );
  if (named === undefined) {
    return { region: null, error: `${rawChrom} is not a chromosome in this genome` };
  }

  const start = Number(rawStart.replace(/[,\s]/g, ""));
  const end = Number(rawEnd.replace(/[,\s]/g, ""));
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return { region: null, error: "Start and end must be whole numbers" };
  }
  if (start < 1) {
    return { region: null, error: "Positions count from 1" };
  }
  if (end < start) {
    return { region: null, error: "The end must not come before the start" };
  }

  return { region: { chrom: named as Chromosome, start, end }, error: null };
}
