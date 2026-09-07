import re
from pathlib import Path

import pysam
import pytest

from gens.crud.het_density import _baseline_key
from gens.het_density import (
    DEFAULT_BIN_SIZE,
    bin_range,
    chromosome_baseline,
    count_het_sites,
    leave_one_out_reference,
    median_coverage_per_bin,
    panel_reference,
)
from gens.models.genomic import GenomeBuild
from gens.routes.sample import MAX_HET_DENSITY_WINDOW

BIN = 1000


def write_baf(tmp_path, name, sites, chromosome="1"):
    """A bgzipped, tabix-indexed Gens BAF bed with one row per site."""
    raw = tmp_path / f"{name}.bed"
    with open(raw, "w") as handle:
        # tabix requires coordinate order; sorting here keeps each test free to
        # list its sites in whatever order reads clearly.
        for position, value in sorted(sites):
            handle.write(f"d_{chromosome}\t{position}\t{position + 1}\t{value}\n")
    path = str(tmp_path / f"{name}.bed.gz")
    pysam.tabix_compress(str(raw), path, force=True)
    pysam.tabix_index(path, preset="bed", force=True)
    return pysam.TabixFile(path)


def write_coverage(tmp_path, name, points, chromosome="1"):
    """A bgzipped, tabix-indexed Gens coverage bed: one row per stored point.

    The same layout as the BAF track, which is why one reader serves both.
    """
    return write_baf(tmp_path, name, points, chromosome)


def test_bin_range_covers_the_region_on_the_absolute_grid():
    # 1-based inclusive input; bins are absolute, so the same base always lands
    # in the same bin no matter what region asked for it.
    assert bin_range(1, 1000, 1000) == (0, 0)
    assert bin_range(1001, 1001, 1000) == (1, 1)
    assert bin_range(3500, 6500, 1000) == (3, 6)
    assert bin_range(1, 1, 1000) == bin_range(999, 1000, 1000)


def test_bin_range_rejects_nonsense():
    with pytest.raises(ValueError):
        bin_range(10, 1, 1000)
    with pytest.raises(ValueError):
        bin_range(1, 10, 0)


def test_counts_only_sites_inside_the_heterozygous_band(tmp_path):
    # The stored track holds homozygous sites too; counting them measures the
    # site list rather than heterozygosity.
    tabix = write_baf(
        tmp_path,
        "mixed",
        [(10, 0.5), (20, 0.02), (30, 0.98), (40, 0.33), (50, 0.67), (60, 0.15), (70, 0.85)],
    )
    # Inside: 0.5, 0.33, 0.67. Outside: 0.02, 0.98, and both bounds, which are
    # exclusive so 0.15 and 0.85 are homozygous-side.
    assert count_het_sites(tabix, "1", 0, 0, bin_size=BIN) == [3]


def test_places_sites_in_the_bin_their_coordinate_falls_in(tmp_path):
    tabix = write_baf(
        tmp_path, "spread", [(10, 0.5), (999, 0.5), (1000, 0.5), (2500, 0.5)]
    )
    assert count_het_sites(tabix, "1", 0, 2, bin_size=BIN) == [2, 1, 1]


def test_a_window_sees_the_same_bin_values_as_a_wider_one(tmp_path):
    # This is the property the previous view-median implementation lacked: the
    # value of a bin must not depend on the region that asked for it.
    tabix = write_baf(tmp_path, "stable", [(x, 0.5) for x in range(0, 5000, 100)])
    wide = count_het_sites(tabix, "1", 0, 4, bin_size=BIN)
    narrow = count_het_sites(tabix, "1", 2, 3, bin_size=BIN)
    assert narrow == wide[2:4]


def test_missing_contig_reports_no_observations_rather_than_failing(tmp_path):
    tabix = write_baf(tmp_path, "chr1only", [(10, 0.5)])
    assert count_het_sites(tabix, "22", 0, 2, bin_size=BIN) == [0, 0, 0]


def test_ignores_malformed_and_unparseable_rows(tmp_path):
    raw = tmp_path / "broken.bed"
    raw.write_text("d_1\t10\t11\t0.5\nd_1\t20\t21\tnot-a-number\nd_1\t30\n")
    path = str(tmp_path / "broken.bed.gz")
    pysam.tabix_compress(str(raw), path, force=True)
    pysam.tabix_index(path, preset="bed", force=True)
    assert count_het_sites(pysam.TabixFile(path), "1", 0, 0, bin_size=BIN) == [1]


def test_panel_reference_is_the_median_across_samples():
    assert panel_reference([[10, 0, 4], [12, 0, 6], [11, 1, 5]]) == [11.0, 0.0, 5.0]


def test_panel_reference_resists_one_sample_carrying_an_event():
    # Four normals and one carrier with an empty middle bin: the reference must
    # describe the normals, not be dragged toward the carrier.
    counts = [[20, 20, 20], [20, 19, 20], [20, 21, 20], [20, 20, 20], [20, 0, 20]]
    assert panel_reference(counts)[1] == 20.0


def test_panel_reference_rejects_ragged_input():
    with pytest.raises(ValueError):
        panel_reference([[1, 2, 3], [1, 2]])


def test_panel_reference_of_nothing_is_empty():
    assert panel_reference([]) == []


def test_leave_one_out_excludes_the_sample_being_judged():
    # A carrier must never contribute to the expectation it is compared against.
    counts = {
        "carrier": [0, 0, 0],
        "a": [20, 20, 20],
        "b": [18, 18, 18],
        "c": [22, 22, 22],
    }
    assert leave_one_out_reference(counts, "carrier") == [20.0, 20.0, 20.0]
    # And a normal sample's own value does not prop up its own reference.
    assert leave_one_out_reference(counts, "a") == [18.0, 18.0, 18.0]


def test_default_bin_size_is_the_documented_twenty_kilobases():
    assert DEFAULT_BIN_SIZE == 20_000


def test_chromosome_baseline_is_the_median_bin_including_empty_ones(tmp_path):
    # Five bins over 5000 bp: 10, 10, 0, 10, 0 heterozygous sites.
    sites = []
    for start in (0, 1000, 3000):
        sites += [(start + i * 10 + 1, 0.5) for i in range(10)]
    tabix = write_baf(tmp_path, "baseline", sites)
    # Median of [10, 10, 0, 10, 0] is 10.
    assert chromosome_baseline(tabix, "1", 5000, bin_size=BIN) == 10.0


def test_chromosome_baseline_counts_empty_bins_rather_than_skipping_them(tmp_path):
    # One dense bin and four empty ones. Skipping empties would call the typical
    # bin 20 and make every ordinary stretch look depleted; the median is 0.
    sites = [(i * 10 + 1, 0.5) for i in range(20)]
    tabix = write_baf(tmp_path, "sparse", sites)
    assert chromosome_baseline(tabix, "1", 5000, bin_size=BIN) == 0.0


def test_chromosome_baseline_ignores_homozygous_sites(tmp_path):
    sites = [(i * 10 + 1, 0.5) for i in range(6)] + [
        (i * 10 + 5, 1.0) for i in range(50)
    ]
    tabix = write_baf(tmp_path, "homs", sites)
    # Only bin 0 has heterozygotes; median over five bins is still 0.
    assert chromosome_baseline(tabix, "1", 5000, bin_size=BIN) == 0.0
    assert count_het_sites(tabix, "1", 0, 0, bin_size=BIN) == [6]


def test_chromosome_baseline_of_a_missing_contig_is_zero(tmp_path):
    tabix = write_baf(tmp_path, "chr1only2", [(10, 0.5)])
    assert chromosome_baseline(tabix, "22", 5000, bin_size=BIN) == 0.0


def test_baseline_key_separates_genome_builds(tmp_path):
    # The build selects the sample document and sets the chromosome length,
    # which sets how many empty bins enter the median. Two builds of one sample
    # have genuinely different baselines, so they must not share a cache entry.
    baf = tmp_path / "sample.baf.bed.gz"
    baf.write_bytes(b"x")
    args = ("NA12879", "pedigree", None, "1", BIN, baf)
    key37 = _baseline_key(*args[:2], GenomeBuild.HG37, *args[3:])
    key38 = _baseline_key(*args[:2], GenomeBuild.HG38, *args[3:])
    assert key37 != key38


def test_baseline_key_changes_when_the_baf_file_is_replaced(tmp_path):
    # A sample can be reloaded against new data under the same identifiers.
    # Without the file fingerprint the process would keep scaling the new data
    # by the old file's median until it restarted.
    baf = tmp_path / "sample.baf.bed.gz"
    baf.write_bytes(b"first")
    before = _baseline_key(
        "NA12879", "pedigree", GenomeBuild.HG38, "1", BIN, baf
    )
    baf.write_bytes(b"second and longer")
    after = _baseline_key("NA12879", "pedigree", GenomeBuild.HG38, "1", BIN, baf)
    assert before != after


def test_baseline_key_is_stable_for_the_same_request(tmp_path):
    # A key that changed between identical requests would make the cache a
    # memory leak that never hits.
    baf = tmp_path / "sample.baf.bed.gz"
    baf.write_bytes(b"x")
    args = ("NA12879", "pedigree", GenomeBuild.HG38, "1", BIN, baf)
    assert _baseline_key(*args) == _baseline_key(*args)


def test_frontend_and_backend_agree_on_the_window_limit():
    # The frontend refuses to ask above this limit and the endpoint refuses to
    # answer above it. If the two numbers drift apart, either whole views break
    # with an HTTP error or a servable region is withheld.
    constants = (
        Path(__file__).resolve().parents[1] / "frontend/js/constants.ts"
    ).read_text()
    match = re.search(
        r"HET_DENSITY_MAX_WINDOW\s*=\s*([0-9_]+)\s*;",
        constants,
    )
    assert match is not None, "HET_DENSITY_MAX_WINDOW is gone from constants.ts"
    assert int(match.group(1).replace("_", "")) == MAX_HET_DENSITY_WINDOW


# --- coverage as the covariate the count cannot be read without -------------
#
# A bin empty of heterozygous sites is produced by a heterozygous deletion and
# by a run of homozygosity alike. The first removes a copy and the second does
# not, so the coverage over the same bin is what separates them. These check
# that the covariate lands on the identical grid and says "not measured" when
# it was not measured.


def test_coverage_is_summarised_on_the_same_grid_as_the_counts(tmp_path):
    tabix = write_coverage(
        tmp_path,
        "cov",
        [(10, 0.0), (500, 0.2), (999, -0.2), (1500, -1.0), (2500, 0.1)],
    )
    assert median_coverage_per_bin(tabix, "1", 0, 2, bin_size=BIN) == [0.0, -1.0, 0.1]


def test_an_unmeasured_bin_is_none_and_not_a_coverage_of_zero(tmp_path):
    # Nothing stored and "the ratio here is zero" are different statements, and
    # zero is an ordinary value on this scale: it means two copies. Reporting
    # 0.0 for an unmeasured bin would paint a gap as a perfectly normal bin.
    tabix = write_coverage(tmp_path, "gap", [(10, 0.3), (2500, 0.4)])
    assert median_coverage_per_bin(tabix, "1", 0, 2, bin_size=BIN) == [0.3, None, 0.4]


def test_a_missing_contig_reports_nothing_measured_rather_than_raising(tmp_path):
    # A sample lacking a chromosome must still return its counts; losing the
    # covariate is not a reason to fail the whole track.
    tabix = write_coverage(tmp_path, "chr1only", [(10, 0.1)], chromosome="1")
    assert median_coverage_per_bin(tabix, "22", 0, 1, bin_size=BIN) == [None, None]


def test_the_median_is_not_moved_by_a_pile_up(tmp_path):
    # The stored track is a per-site ratio with heavy tails: a few pile-up sites
    # in a repeat drag a mean out of the range the bin actually sits in.
    values = [(index * 10, -1.0) for index in range(1, 10)]
    values += [(500, 40.0), (510, 40.0)]
    tabix = write_coverage(tmp_path, "pileup", values)
    assert median_coverage_per_bin(tabix, "1", 0, 0, bin_size=BIN) == [-1.0]


def test_a_bin_keeps_its_coverage_whatever_window_asked_for_it(tmp_path):
    # The same property the counts have. A covariate that moved with the view
    # would recolour an event as the user zoomed onto it.
    tabix = write_coverage(
        tmp_path, "stable", [(x, x / 10000) for x in range(0, 5000, 100)]
    )
    wide = median_coverage_per_bin(tabix, "1", 0, 4, bin_size=BIN)
    narrow = median_coverage_per_bin(tabix, "1", 2, 3, bin_size=BIN)
    assert narrow == wide[2:4]


def test_coverage_rejects_a_backwards_bin_range(tmp_path):
    tabix = write_coverage(tmp_path, "backwards", [(10, 0.0)])
    with pytest.raises(ValueError):
        median_coverage_per_bin(tabix, "1", 5, 2, bin_size=BIN)
