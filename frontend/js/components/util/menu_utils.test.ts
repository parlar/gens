import { getAHref, getURLRow, isSafeHref } from "./menu_utils";

/**
 * Annotation comments and track names are loaded from BED and TSV files that
 * Gens did not write — a repeat catalogue from UCSC, a panel from a
 * collaborator. They used to reach the document through innerHTML, so a
 * URL-shaped string containing a tag became one, event handler and all.
 */

describe("links built from imported text", () => {
  test("a label containing markup is shown as text", () => {
    const node = getAHref(
      '<img src=x onerror="alert(1)">',
      "https://example.org/",
    ) as HTMLAnchorElement;

    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toBe('<img src=x onerror="alert(1)">');
  });

  test("an ordinary label still reads normally", () => {
    const node = getAHref("12345678", "https://pubmed.example/12345678");

    expect(node.textContent).toBe("12345678");
    expect((node as HTMLAnchorElement).href).toBe(
      "https://pubmed.example/12345678",
    );
  });

  test("a link that would run code is not made clickable", () => {
    // eslint-disable-next-line no-script-url
    const node = getAHref("click me", "javascript:alert(1)");

    expect(node instanceof HTMLAnchorElement).toBe(false);
    expect(node.textContent).toBe("click me");
  });

  test("only http and https are accepted", () => {
    expect(isSafeHref("https://example.org/")).toBe(true);
    expect(isSafeHref("http://example.org/")).toBe(true);
    // eslint-disable-next-line no-script-url
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHref("not a url at all")).toBe(false);
  });

  test("a comment carrying a URL with a tag in it inserts no element", () => {
    // The whole path an annotation comment takes, not just the helper.
    const row = getURLRow(
      'see https://example.org/x<img src=y onerror="window.hacked=1"> for detail',
    );

    expect(row.querySelector("img")).toBeNull();
    expect(row.textContent).toContain("for detail");
  });

  test("a plain comment still gets its link", () => {
    const row = getURLRow("see https://example.org/paper for detail");
    const link = row.querySelector("a");

    expect(link).not.toBeNull();
    expect(link?.href).toBe("https://example.org/paper");
    expect(row.textContent).toContain("for detail");
  });
});
