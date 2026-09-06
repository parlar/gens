import {
  endpointGeometry,
  endpointRegion,
  ReadEndpoint,
} from "./read_connections";

const endpoint: ReadEndpoint = {
  chromosome: "1",
  start: 100,
  end: 200,
  strand: "+",
};
const region: Region = { chrom: "1", start: 100, end: 200 };

test("local interval geometry retains the full endpoint interval", () => {
  expect(endpointGeometry(endpoint, region)).toEqual({
    visible: true,
    x: 270,
    left: 40,
    right: 500,
  });
});

test("interchromosomal and off-window endpoints are explicitly not visible", () => {
  expect(endpointGeometry({ ...endpoint, chromosome: "2" }, region)).toEqual({
    visible: false,
    x: 560,
    left: 560,
    right: 560,
  });
  expect(endpointGeometry({ ...endpoint, start: 1, end: 99 }, region)).toEqual({
    visible: false,
    x: 40,
    left: 40,
    right: 40,
  });
});

test("single-base intervals remain finite", () => {
  expect(
    endpointGeometry({ ...endpoint, end: 100 }, { ...region, end: 100 }).x,
  ).toBe(40);
});

test("endpoint navigation clamps to chromosome bounds and rejects unknown contigs", () => {
  expect(endpointRegion(endpoint, { "1": 100000 })).toEqual({
    chrom: "1",
    start: 1,
    end: 10150,
  });
  expect(endpointRegion(endpoint, {})).toBeNull();
  expect(
    endpointRegion(
      { ...endpoint, start: 200000, end: 200010 },
      { "1": 100000 },
    ),
  ).toBeNull();
});
