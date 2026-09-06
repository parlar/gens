import { get } from "../util/fetch";
import { API, cachedRequest, cachedWindow } from "./api";

jest.mock("../util/fetch", () => ({ get: jest.fn() }));

/**
 * Every cache here stores the promise rather than the result, so that several
 * callers share one request. The cost of that, until this was fixed, was that
 * a rejected promise stayed cached: one dropped connection was replayed as the
 * same failure for the rest of the session, and panning back to the region
 * could never recover because no second request was ever made.
 */

describe("cachedRequest", () => {
  test("callers share one in-flight request", async () => {
    const store: Record<string, Promise<string>> = {};
    const start = jest.fn().mockResolvedValue("value");

    const [first, second] = await Promise.all([
      cachedRequest(store, "k", start),
      cachedRequest(store, "k", start),
    ]);

    expect(start).toHaveBeenCalledTimes(1);
    expect([first, second]).toEqual(["value", "value"]);
  });

  test("a successful result stays cached", async () => {
    const store: Record<string, Promise<string>> = {};
    const start = jest.fn().mockResolvedValue("value");

    await cachedRequest(store, "k", start);
    await cachedRequest(store, "k", start);

    expect(start).toHaveBeenCalledTimes(1);
  });

  test("a failure is not cached, so the next call tries again", async () => {
    const store: Record<string, Promise<string>> = {};
    const start = jest
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("value");

    await expect(cachedRequest(store, "k", start)).rejects.toThrow("network");
    await expect(cachedRequest(store, "k", start)).resolves.toBe("value");
    expect(start).toHaveBeenCalledTimes(2);
  });

  test("a failure does not evict a newer request for the same key", async () => {
    // The old request can land after a retry is already in flight, and
    // deleting the slot then would throw away the good one.
    const store: Record<string, Promise<string>> = {};
    let failFirst: (error: Error) => void = () => undefined;
    const slow = new Promise<string>((_, reject) => {
      failFirst = reject;
    });

    const first = cachedRequest(store, "k", () => slow);
    first.catch(() => undefined);
    delete store["k"];
    const second = cachedRequest(store, "k", () => Promise.resolve("newer"));

    failFirst(new Error("late failure"));
    await expect(first).rejects.toThrow("late failure");
    await expect(second).resolves.toBe("newer");
    await expect(store["k"]).resolves.toBe("newer");
  });
});

describe("cachedWindow", () => {
  test("a failed window is forgotten", async () => {
    const store: Record<string, { range: Rng; promise: Promise<string> }> = {};

    await expect(
      cachedWindow(store, "1", [1, 100], () =>
        Promise.reject(new Error("network")),
      ),
    ).rejects.toThrow("network");

    expect(store["1"]).toBeUndefined();
  });

  test("a successful window is remembered with its range", async () => {
    const store: Record<string, { range: Rng; promise: Promise<string> }> = {};

    await cachedWindow(store, "1", [1, 100], () => Promise.resolve("data"));

    expect(store["1"].range).toEqual([1, 100]);
    await expect(store["1"].promise).resolves.toBe("data");
  });
});

describe("the annotation cache in use", () => {
  const mockGet = get as jest.Mock;
  beforeEach(() => mockGet.mockReset());

  test("a transient failure does not poison the region", async () => {
    const api = new API(38, "https://example.org/gens/api/");
    mockGet
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce([{ record_id: "a" }]);

    await expect(api.getAnnotations("track", "1", [1, 1000])).rejects.toThrow(
      "network",
    );
    await expect(api.getAnnotations("track", "1", [1, 1000])).resolves.toEqual([
      { record_id: "a" },
    ]);
    expect(mockGet).toHaveBeenCalledTimes(2);
  });
});
