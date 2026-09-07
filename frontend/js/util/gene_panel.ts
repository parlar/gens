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
  const flank = Math.max(
    Math.round(span * GENE_FLANK_FRACTION),
    GENE_FLANK_MINIMUM,
  );
  const start = Math.max(1, gene.start - flank);
  const wanted = gene.end + flank;
  const end =
    chromosomeSize != null && chromosomeSize > 0
      ? Math.min(chromosomeSize, wanted)
      : wanted;
  return { chrom: gene.chromosome, start, end: Math.max(end, start + 1) };
}

/**
 * The view to open for a gene while holding the current scale.
 *
 * Stepping through a panel to compare coverage between genes is a different
 * task from inspecting one gene, and reframing the window at every step makes
 * that comparison impossible: a dip looks deeper or shallower purely because
 * the gene beside it is a different size. Here the window keeps the width it
 * already had and moves so the gene sits in the middle.
 *
 * A gene wider than the window shows its middle rather than growing the window
 * to fit. That is the point of holding the scale, and the alternative puts the
 * jump back for exactly the genes where the reader is most likely to be
 * comparing.
 *
 * At a chromosome edge the window is pushed inwards rather than clipped, so the
 * scale still does not change; the gene simply stops being centred. Only a
 * window wider than the whole chromosome gives that up, having nowhere to go.
 */
export function keptZoomRegion(
  gene: ApiPanelGene,
  currentWidth: number,
  chromosomeSize: number | null,
): Region {
  const width = Math.max(2, Math.round(currentWidth));
  const centre = Math.round((gene.start + gene.end) / 2);
  const limit =
    chromosomeSize != null && chromosomeSize > 0 ? chromosomeSize : null;

  if (limit !== null && width >= limit) {
    return { chrom: gene.chromosome, start: 1, end: limit };
  }

  let start = Math.max(1, centre - Math.floor(width / 2));
  let end = start + width - 1;
  if (limit !== null && end > limit) {
    end = limit;
    start = Math.max(1, end - width + 1);
  }
  return { chrom: gene.chromosome, start, end };
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

/** Where the reader's choice of stepping behaviour is remembered. */
const KEEP_ZOOM_KEY = "gens.genePanel.keepZoom";

/**
 * Whether stepping should hold the current scale. Defaults to yes.
 *
 * Reading and writing are wrapped because storage throws outright in a private
 * window or with site data blocked, and a panel that cannot remember a checkbox
 * should still work.
 */
export function loadKeepZoomPreference(): boolean {
  try {
    const stored = window.localStorage.getItem(KEEP_ZOOM_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function saveKeepZoomPreference(keepZoom: boolean): void {
  try {
    window.localStorage.setItem(KEEP_ZOOM_KEY, String(keepZoom));
  } catch {
    // Nothing to do: the panel works, it just forgets between sessions.
  }
}
