import { DataTrack } from "./data_track";

/**
 * The debounce and the stale-response guard on a data track.
 *
 * Both were broken in ways that only show under rapid panning or zooming:
 * the debounced function was rebuilt on every render() call, so each call got
 * its own timer and nothing was ever coalesced; and the sequence number that
 * discards stale responses only advanced once a fetch actually started, so a
 * response for the previous view could arrive in the gap between a new view
 * being requested and its fetch beginning, and be drawn against the new
 * view's coordinate scale.
 *
 * Object.create gives a subject whose prototype chain is the real one, so
 * render() reaches the real scheduleFetch, while leaving out the custom
 * element machinery a DataTrack would otherwise need to construct.
 */

const renderSettings = {
  reloadData: true,
  positionOnly: false,
} as RenderSettings;

interface Subject {
  render: (settings: RenderSettings) => Promise<void>;
  draw: jest.Mock;
  getRenderData: jest.Mock;
  renderLoading: jest.Mock;
}

function makeTrack(getRenderData: jest.Mock): Subject {
  return Object.assign(Object.create(DataTrack.prototype), {
    updateHidden: () => false,
    renderSeq: 0,
    renderData: null,
    renderLoading: jest.fn(),
    getRenderData,
    draw: jest.fn(),
  });
}

describe("data track requests", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("several renders in one interval make one request", async () => {
    const getRenderData = jest.fn().mockResolvedValue({ dots: [] });
    const track = makeTrack(getRenderData);

    await track.render(renderSettings);
    await track.render(renderSettings);
    await track.render(renderSettings);
    jest.advanceTimersByTime(50);
    await Promise.resolve();

    expect(getRenderData).toHaveBeenCalledTimes(1);
  });

  test("a request is still made once the interval passes", async () => {
    // The control: coalescing must not turn into never asking.
    const getRenderData = jest.fn().mockResolvedValue({ dots: [] });
    const track = makeTrack(getRenderData);

    await track.render(renderSettings);
    jest.advanceTimersByTime(50);
    await Promise.resolve();

    expect(getRenderData).toHaveBeenCalledTimes(1);
    expect(track.draw).toHaveBeenCalledTimes(1);
  });

  test("a response for a view the reader has left is not drawn", async () => {
    let finishOld: (value: unknown) => void = () => undefined;
    const getRenderData = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockImplementationOnce(() => new Promise(() => undefined));
    const track = makeTrack(getRenderData);

    await track.render(renderSettings);
    jest.advanceTimersByTime(50);
    // The reader pans. The old request is still in flight, and its fetch has
    // not yet been superseded by a new one.
    await track.render(renderSettings);
    finishOld({ dots: [{ x: 100, y: 1 }] });
    await Promise.resolve();
    await Promise.resolve();

    expect(track.draw).not.toHaveBeenCalled();
    jest.clearAllTimers();
  });

  test("the current view's response is drawn", async () => {
    const data = { dots: [{ x: 1, y: 1 }] };
    const getRenderData = jest.fn().mockResolvedValue(data);
    const track = makeTrack(getRenderData);

    await track.render(renderSettings);
    jest.advanceTimersByTime(50);
    await Promise.resolve();
    await Promise.resolve();

    expect(track.draw).toHaveBeenCalledWith(data);
  });
});
