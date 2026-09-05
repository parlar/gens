import { get, objectToQueryString } from "./fetch";

describe("Test objectToQueryString", () => {
  test("test objectToQueryString single args", () => {
    const paramString = objectToQueryString({ region: "1:1-10" });
    expect(paramString).toBe("region=1%3A1-10");
  });

  test("test objectToQueryString multiple args", () => {
    const paramString = objectToQueryString({ region: "1:1-10", page: 1 });
    expect(paramString).toBe("region=1%3A1-10&page=1");
  });

  test("test objectToQueryString multiple args multiple types", () => {
    const paramString = objectToQueryString({
      region: "1:1-10",
      page: 1,
      print: true,
    });
    expect(paramString).toBe("region=1%3A1-10&page=1&print=true");
  });

  test("test objectToQueryString escapes reserved characters", () => {
    expect(objectToQueryString({ sample: "sample&A" })).toBe(
      "sample=sample%26A",
    );
    expect(objectToQueryString({ sample: "sample+1" })).toBe(
      "sample=sample%2B1",
    );
  });

  test("test objectToQueryString keeps params after a hash", () => {
    const paramString = objectToQueryString({ sample: "sample#1", page: 2 });
    expect(paramString).toBe("sample=sample%231&page=2");
  });
});

test("GET forwards request cancellation", async () => {
  const originalFetch = global.fetch;
  const signal = new AbortController().signal;
  global.fetch = jest.fn().mockResolvedValue({
    status: 200,
    json: async () => [],
  });
  try {
    await get("https://example.org/api", { sample: "sample&A" }, signal);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.org/api?sample=sample%26A",
      expect.objectContaining({ signal }),
    );
  } finally {
    global.fetch = originalFetch;
  }
});
