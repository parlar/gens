import { isChromosome } from "../constants";

export function getPan(
  viewRange: [number, number],
  direction = "left",
  edge: number,
  speed = 0.1,
): [number, number] {
  const distance = Math.abs(Math.floor(speed * (viewRange[1] - viewRange[0])));
  let newStartX;
  let newEndX;
  if (direction === "left") {
    // Stop at the left edge
    newStartX = Math.max(edge, viewRange[0] - distance);
    newEndX = viewRange[1] - distance;
  } else {
    newStartX = viewRange[0] + distance;
    // Stop at the right edge
    newEndX = Math.min(viewRange[1] + distance, edge);
  }

  return [newStartX, newEndX];
}

// parse chromosomal region designation string
// return chromosome, start and end position
// eg 1:12-220 --> 1, 12 220
// 1: --> 1, null, null
// 1 --> 1, null, null
// Nothing calls this. The comment above describes returning a chromosome with
// null positions for a bare "1", which the body has never done -- it returns
// undefined. Left as it behaves rather than as it was described, since which of
// the two is right is its owner's call.
export function parseRegionDesignation(
  regionString: string,
): { chrom: Chromosome; start: number; end: number } | undefined {
  if (!regionString.includes(":")) {
    return undefined;
  }
  const [chromosome, position] = regionString.split(":");
  if (!isChromosome(chromosome)) {
    throw new Error(`${chromosome} is not a valid chromosome`);
  }
  const [start, end] = position.split("-");
  return { chrom: chromosome, start: parseInt(start), end: parseInt(end) };
}

export function zoomIn(
  xCurrView: [number, number],
  zoomFactor: number = 0.2,
): [number, number] {
  const factor = Math.floor((xCurrView[1] - xCurrView[0]) * zoomFactor);
  const newStart = xCurrView[0] + factor;
  const newEnd = xCurrView[1] - factor;
  return [newStart, newEnd];
}

export function zoomOut(
  xCurrView: [number, number],
  maxX: number,
  zoomFactor: number = 3,
): [number, number] {
  const factor = Math.floor((xCurrView[1] - xCurrView[0]) / zoomFactor);
  let newStart = xCurrView[0] - factor < 1 ? 1 : xCurrView[0] - factor;
  let newEnd = xCurrView[1] + factor;

  newStart = Math.max(0, newStart);
  newEnd = Math.min(newEnd, maxX);

  return [newStart, newEnd];
}
