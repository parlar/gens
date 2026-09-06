import {
  arcRise,
  arcShape,
  arcShapes,
  arcWidth,
  endpointCentre,
  toTrackData,
} from "./connection_arcs";
import { ReadConnection, ReadEvidence } from "./read_connections";

function connection(
  overrides: Partial<ReadConnection> & {
    firstChrom?: string;
    firstStart?: number;
    firstEnd?: number;
    secondChrom?: string;
    secondStart?: number;
    secondEnd?: number;
  } = {},
): ReadConnection {
  const {
    firstChrom = "1",
    firstStart = 1000,
    firstEnd = 1100,
    secondChrom = "1",
    secondStart = 5000,
    secondEnd = 5100,
    ...rest
  } = overrides;
  return {
    id: "c1",
    kind: "pair",
    first: {
      chromosome: firstChrom,
      start: firstStart,
      end: firstEnd,
      strand: "+",
    },
    second: {
      chromosome: secondChrom,
      start: secondStart,
      end: secondEnd,
      strand: "-",
    },
    fragments: 10,
    minimum_observed_mapq: null,
    ...rest,
  };
}

describe("endpointCentre", () => {
  it("takes the middle of the caller's reported interval", () => {
    expect(
      endpointCentre({ chromosome: "1", start: 100, end: 200, strand: "+" }),
    ).toBe(150);
  });

  it("rounds rather than dropping the half base", () => {
    expect(
      endpointCentre({ chromosome: "1", start: 100, end: 101, strand: "+" }),
    ).toBe(101);
  });
});

describe("arcShape", () => {
  it("draws an arc when both ends are in view", () => {
    const shape = arcShape(connection(), "1", [0, 10000]);
    expect(shape).not.toBeNull();
    expect(shape!.kind).toBe("arc");
    expect(shape!.from).toBe(1050);
    expect(shape!.to).toBe(5050);
  });

  it("orders the arc left to right whichever end came first", () => {
    const reversed = connection({
      firstStart: 5000,
      firstEnd: 5100,
      secondStart: 1000,
      secondEnd: 1100,
    });
    const shape = arcShape(reversed, "1", [0, 10000]);
    expect(shape!.from).toBeLessThan(shape!.to!);
  });

  it("stubs a partner on another chromosome and names it", () => {
    const translocation = connection({
      secondChrom: "12",
      secondStart: 500,
      secondEnd: 600,
    });
    const shape = arcShape(translocation, "1", [0, 10000]);
    expect(shape!.kind).toBe("stub");
    expect(shape!.from).toBe(1050);
    expect(shape!.to).toBeNull();
    expect(shape!.awayLabel).toBe("12");
  });

  it("stubs a partner that is off the right of the view", () => {
    const shape = arcShape(
      connection({ secondStart: 9_000_000, secondEnd: 9_000_100 }),
      "1",
      [0, 10000],
    );
    expect(shape!.kind).toBe("stub");
    expect(shape!.awayLabel).toBe("9 Mb");
  });

  it("drops a connection with neither end in view", () => {
    expect(arcShape(connection(), "1", [50_000, 60_000])).toBeNull();
  });

  it("drops a connection on a chromosome that is not being shown", () => {
    expect(arcShape(connection(), "2", [0, 10000])).toBeNull();
  });

  it("keeps an endpoint that only overlaps the edge of the view", () => {
    // The interval runs 1000-1100 and the view starts at 1050, so the endpoint
    // is partly visible and must still be drawn.
    const shape = arcShape(connection(), "1", [1050, 10000]);
    expect(shape!.kind).toBe("arc");
  });
});

describe("arcShapes", () => {
  it("puts the widest arc first so narrow ones draw on top", () => {
    const wide = connection({ id: "wide", secondStart: 9000, secondEnd: 9100 });
    const narrow = connection({
      id: "narrow",
      secondStart: 1200,
      secondEnd: 1300,
    });
    const shapes = arcShapes([narrow, wide], "1", [0, 10000]);
    expect(shapes.map((s) => s.connection.id)).toEqual(["wide", "narrow"]);
  });

  it("leaves out what cannot be placed", () => {
    const offscreen = connection({
      id: "gone",
      firstStart: 80_000,
      firstEnd: 80_100,
      secondStart: 90_000,
      secondEnd: 90_100,
    });
    expect(arcShapes([offscreen], "1", [0, 10000])).toHaveLength(0);
  });
});

describe("arcRise", () => {
  it("rises further for a wider arc", () => {
    expect(arcRise(400, 1000)).toBeGreaterThan(arcRise(100, 1000));
  });

  it("keeps a narrow arc off the baseline", () => {
    expect(arcRise(1, 1000)).toBeGreaterThan(0.2);
  });

  it("never leaves the lane", () => {
    expect(arcRise(5000, 1000)).toBeLessThanOrEqual(1);
  });

  it("returns nothing to draw when the lane has no width", () => {
    expect(arcRise(100, 0)).toBe(0);
  });
});

describe("arcWidth", () => {
  it("draws unreported support at the thinnest width", () => {
    expect(arcWidth(null)).toBe(1);
    expect(arcWidth(0)).toBe(1);
  });

  it("thickens with support but stops", () => {
    expect(arcWidth(50)).toBeGreaterThan(arcWidth(5));
    expect(arcWidth(100_000)).toBeLessThanOrEqual(4);
  });
});

describe("toTrackData", () => {
  const evidence: ReadEvidence = {
    chromosome: "1",
    start: 1,
    end: 1000,
    genome_build: 38,
    source_label: "sample.bedpe",
    records_examined: 2,
    truncated: true,
    connections: [connection()],
  };

  it("passes the connections through untouched", () => {
    const data = toTrackData(evidence, null);
    expect(data.connections).toHaveLength(1);
    expect(data.truncated).toBe(true);
    expect(data.unavailable).toBeNull();
  });

  it("says why nothing is drawn when the window is too wide", () => {
    const data = toTrackData(evidence, "Zoom in below 1 Mb");
    expect(data.connections).toHaveLength(0);
    expect(data.unavailable).toBe("Zoom in below 1 Mb");
  });

  it("distinguishes a sample with no evidence from an empty window", () => {
    const data = toTrackData(null, null);
    expect(data.unavailable).toMatch(/No read connections loaded/);
  });
});
