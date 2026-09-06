/**
 * Stepping through the genes of a panel.
 *
 * The panel arrives already placed and ordered from the server; everything here
 * is about what a reader sees when they press Next.
 */

/** Fraction of the gene's own span shown on each side of it. */
export const GENE_FLANK_FRACTION = 0.2;

/** Smallest flank in bases, so a tiny gene is not framed to a sliver. */
export const GENE_FLANK_MINIMUM = 2000;

/**
 * The view to open for a gene: its span plus flanking sequence.
 *
 * A gene framed exactly to its own edges gives no context for reading coverage
 * or BAF at the boundary, which is where a deletion's edge sits. The flank
 * scales with the gene so a 2 Mb gene and a 5 kb gene both get a usable margin.
 */
export function geneRegion(
  gene: ApiPanelGene,
  chromosomeSize: number | null,
): Region {
  const span = gene.end - gene.start + 1;
  const flank = Math.max(Math.round(span * GENE_FLANK_FRACTION), GENE_FLANK_MINIMUM);
  const start = Math.max(1, gene.start - flank);
  const wanted = gene.end + flank;
  const end = chromosomeSize != null && chromosomeSize > 0
    ? Math.min(chromosomeSize, wanted)
    : wanted;
  return { chrom: gene.chromosome, start, end: Math.max(end, start + 1) };
}

/** Genes whose symbol contains `query`, case-insensitively. Order is preserved. */
export function filterGenes(
  genes: ApiPanelGene[],
  query: string,
): ApiPanelGene[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return genes;
  }
  return genes.filter((gene) => gene.symbol.toLowerCase().includes(needle));
}

/**
 * Where Next or Previous lands, given where we are now.
 *
 * Clamped rather than wrapped: silently returning to gene 1 after the last one
 * would make a reader walking a panel believe there was more to see. The ends
 * are dead stops, and the caller disables the button there.
 *
 * A `current` of -1 means nothing is selected yet, so a first Next opens the
 * first gene rather than the second.
 */
export function stepIndex(
  current: number,
  count: number,
  delta: number,
): number {
  if (count === 0) {
    return -1;
  }
  if (current < 0) {
    return delta > 0 ? 0 : count - 1;
  }
  return Math.min(count - 1, Math.max(0, current + delta));
}

/** Human position within the panel, for example "12 / 47". */
export function positionLabel(current: number, count: number): string {
  if (count === 0) {
    return "0 / 0";
  }
  return `${current < 0 ? "–" : current + 1} / ${count}`;
}
