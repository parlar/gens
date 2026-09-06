"""What interval the coverage and BAF endpoints actually return.

A GenomicRegion is the inclusive 1-based interval a reader sees in the address
bar. Tabix fetches BED's 0-based half-open one. The start used to be passed
through unconverted, so every window silently lost its first base, and the two
frontend callers disagreed about whose job it was to fix that: the histogram
subtracted one before sending, the scatter client did not.

Widened cache windows hide this for most ordinary views, which is why it went
unnoticed; a one-base or edge-aligned query is where it shows.
"""

import pytest

from gens.io import get_scatter_data
from gens.models.genomic import Chromosome, GenomeBuild, GenomicRegion
from gens.models.sample import ScatterDataType
from tests.test_het_density import write_baf

# write_baf takes BED starts, so a row written at n covers 1-based position
# n + 1. Sites at display positions 100 through 104.
SITES = [(99, 0.1), (100, 0.2), (101, 0.3), (102, 0.4), (103, 0.5)]


@pytest.fixture
def baf_file(tmp_path, monkeypatch):
    from types import SimpleNamespace

    path = write_baf(tmp_path, "interval", SITES).filename.decode()
    monkeypatch.setattr(
        "gens.io.get_sample", lambda *args: SimpleNamespace(baf_file=path)
    )
    return path


def positions(start: int, end: int) -> list[int]:
    result = get_scatter_data(
        None,
        "sample",
        "case",
        GenomeBuild.HG38,
        GenomicRegion(chromosome=Chromosome.CH1, start=start, end=end),
        ScatterDataType.BAF,
        "d",
    )
    return result.position


class TestTheIntervalIsInclusiveAtBothEnds:
    def test_a_single_base_returns_that_base(self, baf_file):
        assert positions(100, 100) == [100]

    def test_the_first_base_of_the_window_is_included(self, baf_file):
        # The one that was lost: asking from 100 used to start at 101.
        assert positions(100, 102) == [100, 101, 102]

    def test_the_last_base_of_the_window_is_included(self, baf_file):
        assert positions(102, 104) == [102, 103, 104]

    def test_bases_outside_the_window_are_left_out(self, baf_file):
        assert positions(101, 103) == [101, 102, 103]

    def test_the_whole_set_comes_back_for_a_wide_window(self, baf_file):
        assert positions(1, 1000) == [100, 101, 102, 103, 104]

    def test_a_window_before_the_first_site_is_empty(self, baf_file):
        assert positions(1, 99) == []

    def test_a_window_starting_at_base_one_does_not_go_negative(self, baf_file):
        # start - 1 is 0 here, which is the lowest BED coordinate there is;
        # anything below it would be rejected by the fetch.
        assert positions(1, 100) == [100]
