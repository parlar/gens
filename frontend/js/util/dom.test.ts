import { requireElement, requireShadow } from "./dom";

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

describe("reaching for a component's shadow root", () => {
  test("returns the root when the component attached one", () => {
    const host = document.createElement("div");
    host.attachShadow({ mode: "open" });
    expect(requireShadow(host)).toBe(host.shadowRoot);
  });

  test("says so when the element is not that component", () => {
    expect(() => requireShadow(document.createElement("div"))).toThrow(
      "no shadow root",
    );
  });
});
