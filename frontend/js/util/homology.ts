/**
 * Catalogued sequence homology, and what it explains about the event in view.
 *
 * Where two stretches of the genome are near-identical, recombination can pair
 * the wrong two copies and delete, duplicate or invert what lies between them.
 * So a coverage drop whose breakpoints sit inside such a pair, and whose
 * discordant reads point at that pair's partner, has a mechanism; the same drop
 * in unique sequence does not. Both halves of that are already on the page --
 * the pairs from the catalogue and the connections from the sample -- and
 * putting them together is what saves the reader from doing it by hand.
 *
 * Nothing here is a call. A pair is a catalogue entry, the identity is UCSC's
 * own number, and "the reads point into this pair's partner" is an observation
 * about two coordinates, not a claim that recombination happened.
 */

/** Below this a pair is drawn as pale as the track goes. */
const LOWEST_CATALOGUED_IDENTITY = 0.9;

/** Pale end of the ramp: catalogued, but as dissimilar as the catalogue holds. */
const FAINT_RGB = [204, 204, 214];

/** Full end: near-identical, the state that makes mispairing easy. */
const STRONG_RGB = [72, 61, 139];

/**
 * A colour for a pair's percent identity.
 *
 * The catalogue starts at 90%, so the ramp does too: spreading it from zero
 * would put every entry in the top tenth of the scale and waste the whole
 * range on a distinction the catalogue never makes.
 */
export function identityShade(identity: number): string {
  const span = 1 - LOWEST_CATALOGUED_IDENTITY;
  const above = (identity - LOWEST_CATALOGUED_IDENTITY) / span;
  const fraction = Math.min(1, Math.max(0, above));
  const mixed = FAINT_RGB.map((faint, channel) =>
    Math.round(faint + (STRONG_RGB[channel] - faint) * fraction),
  );
  return `rgb(${mixed[0]},${mixed[1]},${mixed[2]})`;
}

/**
 * A partner locus short enough for a band label but precise enough to find.
 *
 * Rounded to the nearest hundred kilobases rather than the nearest megabase: a
 * partner is a place to navigate to, and "89 Mb" names a stretch of chromosome
 * a million bases wide.
 */
export function shortLocus(chrom: string, position: number): string {
  if (position < 1_000_000) {
    return `${chrom}:${Math.round(position / 1_000)} kb`;
  }
  return `${chrom}:${(position / 1_000_000).toFixed(1)} Mb`;
}

/** A partner locus as it is written in the toolbar, so it can be pasted there. */
export function formatPartner(pair: ApiHomologyPair): string {
  return `${pair.partner_chrom}:${pair.partner_start}-${pair.partner_end}`;
}

function inRange(
  chrom: string,
  position: number,
  pair: ApiHomologyPair,
): boolean {
  return (
    chrom === pair.partner_chrom &&
    position >= pair.partner_start &&
    position <= pair.partner_end
  );
}

/**
 * Whether either end of a connection lands inside this pair's partner.
 *
 * Either end, because a connection is stored from whichever side the reader
 * happened to navigate to and the two are the same observation. The near end
 * is not required to sit inside the pair itself: a breakpoint routinely falls
 * just outside the catalogued boundary, and demanding containment on both
 * sides would discard the case this exists for.
 */
export function connectionReachesPartner(
  connection: RenderConnection,
  pair: ApiHomologyPair,
): boolean {
  return (
    inRange(connection.first.chromosome, connection.first.start, pair) ||
    inRange(connection.second.chromosome, connection.second.start, pair)
  );
}

export interface HomologyBand extends RenderBand {
  /** Set when a connection in view reaches this pair's partner. */
  reachedByReads: boolean;
}

/**
 * The catalogue as bands, with the ones the reads point into marked.
 *
 * Ordered longest first, as the endpoint returns them, so a view crossed by one
 * large pair and a scatter of small ones leads with the one that can hold both
 * breakpoints of an event.
 */
export function homologyBands(
  pairs: ApiHomologyPair[],
  connections: RenderConnection[],
  sampleLabel: string = "the main sample",
): HomologyBand[] {
  return pairs.map((pair, index) => {
    const reachedByReads = connections.some((connection) =>
      connectionReachesPartner(connection, pair),
    );
    const percent = (pair.identity * 100).toFixed(1);
    const partner = shortLocus(pair.partner_chrom, pair.partner_start);
    const label = reachedByReads
      ? `${percent}% ${pair.orientation} → ${partner} — reads point here`
      : `${percent}% ${pair.orientation} → ${partner}`;

    return {
      id: `homology-${index}-${pair.start}-${pair.partner_start}`,
      start: pair.start,
      end: pair.end,
      color: identityShade(pair.identity),
      // Outlined only when the reads agree with the catalogue, so the one band
      // worth reading first is the one that stands out.
      edgeColor: reachedByReads ? "rgb(204,0,0)" : undefined,
      edgeWidth: reachedByReads ? 2 : undefined,
      label,
      hoverInfo: [
        `${percent}% identical over ${pair.aligned_bases} aligned bases`,
        `${pair.orientation} orientation`,
        `partner ${formatPartner(pair)}`,
        reachedByReads
          ? `a read connection from ${sampleLabel} in view reaches this partner`
          : `no read connection from ${sampleLabel} in view reaches this partner`,
      ].join("\n"),
      reachedByReads,
    };
  });
}
