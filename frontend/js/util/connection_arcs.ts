/** Placing read connections on the same x scale as the tracks above them. */

import { ReadConnection, ReadEndpoint, ReadEvidence } from "./read_connections";

/**
 * How a single connection is drawn in the track lane.
 *
 * "arc" joins two positions that are both in view. "stub" marks the one end
 * that is in view and names where its partner went, because an arc to a place
 * the reader cannot see would imply a distance the track does not have.
 */
/**
 * An arc joins two ends both in view; a stub marks one end whose partner is
 * elsewhere. Written as one shape, "to" had to be nullable for the stub's sake
 * and the drawing code then read it on the arc path, where it never is null.
 * Split on kind, the compiler carries that through the branch that tests it.
 */
export type ArcShape =
  | {
      connection: ReadConnection;
      kind: "arc";
      /** Base positions of the two ends. */
      from: number;
      to: number;
      awayLabel: "";
    }
  | {
      connection: ReadConnection;
      kind: "stub";
      /** Base position of the visible end. */
      from: number;
      to: null;
      /** Where the partner is. */
      awayLabel: string;
    };

/** Midpoint of an endpoint interval, which is what the arc is anchored to. */
export function endpointCentre(endpoint: ReadEndpoint): number {
  return Math.round((endpoint.start + endpoint.end) / 2);
}

function inView(
  endpoint: ReadEndpoint,
  chromosome: string,
  range: Rng,
): boolean {
  return (
    endpoint.chromosome === chromosome &&
    endpoint.end >= range[0] &&
    endpoint.start <= range[1]
  );
}

/**
 * The shape for one connection, or null when neither end is in view.
 *
 * A connection whose ends are both off-screen is dropped rather than drawn at
 * the edge: the track would then show a mark for something the reader cannot
 * locate, which is worse than showing nothing.
 */
export function arcShape(
  connection: ReadConnection,
  chromosome: string,
  range: Rng,
): ArcShape | null {
  const firstVisible = inView(connection.first, chromosome, range);
  const secondVisible = inView(connection.second, chromosome, range);

  if (firstVisible && secondVisible) {
    const a = endpointCentre(connection.first);
    const b = endpointCentre(connection.second);
    return {
      connection,
      kind: "arc",
      from: Math.min(a, b),
      to: Math.max(a, b),
      awayLabel: "",
    };
  }

  if (!firstVisible && !secondVisible) {
    return null;
  }

  const here = firstVisible ? connection.first : connection.second;
  const away = firstVisible ? connection.second : connection.first;
  return {
    connection,
    kind: "stub",
    from: endpointCentre(here),
    to: null,
    awayLabel:
      away.chromosome === chromosome
        ? `${Math.round(endpointCentre(away) / 1_000_000)} Mb`
        : away.chromosome,
  };
}

/**
 * Height of an arc as a fraction of the lane, from its width on screen.
 *
 * Wider connections rise higher so that nested events read as nested, and the
 * square root keeps a very wide arc from flattening every narrow one against
 * the baseline.
 */
export function arcRise(pixelSpan: number, laneWidth: number): number {
  if (laneWidth <= 0) {
    return 0;
  }
  const fraction = Math.max(0, Math.min(1, pixelSpan / laneWidth));
  return 0.25 + 0.75 * Math.sqrt(fraction);
}

/**
 * Line width from the number of supporting fragments.
 *
 * A call with no reported fragments is drawn at the thinnest width rather than
 * a middling one, so that thickness never suggests support that was not
 * measured.
 */
export function arcWidth(fragments: number | null): number {
  if (fragments === null || fragments <= 0) {
    return 1;
  }
  return Math.min(4, 1 + Math.log2(fragments) / 2);
}

/** Every drawable shape for a window, ordered so wide arcs sit behind narrow. */
export function arcShapes(
  connections: readonly ReadConnection[],
  chromosome: string,
  range: Rng,
): ArcShape[] {
  const shapes: ArcShape[] = [];
  for (const connection of connections) {
    const shape = arcShape(connection, chromosome, range);
    if (shape !== null) {
      shapes.push(shape);
    }
  }
  return shapes.sort((a, b) => {
    const spanA = a.to === null ? 0 : a.to - a.from;
    const spanB = b.to === null ? 0 : b.to - b.from;
    return spanB - spanA;
  });
}

/** Turn an API response into what the track draws, keeping the caveats. */
export function toTrackData(
  evidence: ReadEvidence | null,
  unavailable: string | null,
): ConnectionsTrackData {
  if (unavailable !== null) {
    return { connections: [], truncated: false, unavailable };
  }
  if (evidence === null) {
    return {
      connections: [],
      truncated: false,
      unavailable: "No read connections loaded for this sample",
    };
  }
  return {
    connections: evidence.connections,
    truncated: evidence.truncated,
    unavailable: null,
  };
}
