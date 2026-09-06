import { getVariantContextMenuContent } from "./menu_content_utils";

/**
 * The tooltip reads a handful of fields off the variant and off the one sample
 * call that belongs to the sample being viewed. Generating the Api types from
 * the API's own schema showed two of those reads were wrong: allele depths came
 * from a `details.sample` the server never sends, and split read went through
 * an unguarded `sample.split_read` even though the lookup that produced it can
 * come back empty.
 */

const sampleCall = (overrides = {}) => ({
  sample_id: "NA12879",
  display_name: "NA12879",
  genotype_call: "0/1",
  allele_depths: [12, 9],
  read_depth: 21,
  genotype_quality: 99,
  alt_frequency: 0.43,
  split_read: 4,
  ...overrides,
});

const variant = (overrides = {}) =>
  ({
    document_id: "v1",
    start: 1000,
    end: 2000,
    length: 1001,
    category: "sv",
    sub_category: "del",
    rank_score: 12,
    rank_score_results: [],
    samples: [sampleCall()],
    ...overrides,
  }) as unknown as ApiVariantDetails;

/** The rendered value sitting next to `label`. */
function valueFor(rows: HTMLDivElement[], label: string): string | null {
  for (const row of rows) {
    const cells = row.querySelectorAll("div");
    if (cells[0]?.textContent === label) {
      return cells[1]?.textContent ?? null;
    }
  }
  return null;
}

describe("variant tooltip", () => {
  test("shows the allele depths of the sample being viewed", () => {
    // These used to be read from details.sample, which is not a field of the
    // response, so this row said N/A for every variant.
    const rows = getVariantContextMenuContent("NA12879", variant(), null);

    expect(valueFor(rows, "Allele depths")).toBe("12, 9");
    expect(valueFor(rows, "Read depth")).toBe("21");
    expect(valueFor(rows, "Split read")).toBe("4");
    expect(valueFor(rows, "Genotype call")).toBe("0/1");
  });

  test("survives a variant with no call for this sample", () => {
    // A sample with no call on the variant is ordinary, and every row but
    // split read already handled it.
    const rows = getVariantContextMenuContent("NA12881", variant(), null);

    expect(valueFor(rows, "Split read")).toBe("N/A");
    expect(valueFor(rows, "Genotype call")).toBe("-");
    expect(valueFor(rows, "Allele depths")).toBe("N/A");
  });

  test("says N/A rather than an empty string for a call with no depths", () => {
    const rows = getVariantContextMenuContent(
      "NA12879",
      variant({ samples: [sampleCall({ allele_depths: [] })] }),
      null,
    );

    expect(valueFor(rows, "Allele depths")).toBe("N/A");
  });
});
