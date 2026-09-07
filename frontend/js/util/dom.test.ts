import { requireElement } from "./dom";

describe("reaching for an element the template guarantees", () => {
  const root = document.createElement("div");
  root.innerHTML = `<span id="here"></span>`;

  test("returns the element when the template has it", () => {
    expect(requireElement<HTMLSpanElement>(root, "#here").id).toBe("here");
  });

  test("names the selector when the template does not", () => {
    // The whole point: a mistyped selector says which one, at the lookup,
    // instead of surfacing later as a null dereference somewhere unrelated.
    expect(() => requireElement(root, "#nowhere")).toThrow("'#nowhere'");
  });
});
