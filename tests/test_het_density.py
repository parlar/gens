import pysam
import pytest

from gens.het_density import (
    DEFAULT_BIN_SIZE,
    bin_range,
    count_het_sites,
    leave_one_out_reference,
    panel_reference,
)

BIN = 1000


def write_baf(tmp_path, name, sites, chromosome="1"):
    """A bgzipped, tabix-indexed Gens BAF bed with one row per site."""
    raw = tmp_path / f"{name}.bed"
    with open(raw, "w") as handle:
        for position, value in sites:
            handle.write(f"d_{chromosome}\t{position}\t{position + 1}\t{value}\n")
    path = str(tmp_path / f"{name}.bed.gz")
    pysam.tabix_compress(str(raw), path, force=True)
    pysam.tabix_index(path, preset="bed", force=True)
    return pysam.TabixFile(path)


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
