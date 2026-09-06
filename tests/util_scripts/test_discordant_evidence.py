"""Tests for the discordant-evidence exporter.

The support count is the whole output: a clinician reads it to decide whether
a coverage dip has anything behind it. So these tests are mostly about the
count being right, and about one event never being reported as two weak ones.
"""

import io
import tempfile
from pathlib import Path

from utils.discordant_evidence import (
    Fragment,
    build_filter,
    cluster_fragments,
    write_bedpe,
)


def fragment(
    a_pos: int, b_pos: int, *, split: bool = False, mapq: int = 60, a="1", b="1"
):
    return Fragment(
        a_chrom=a, a_pos=a_pos, b_chrom=b, b_pos=b_pos, split=split, mapq=mapq
    )


class TestClustering:
    def test_fragments_agreeing_at_both_ends_form_one_cluster(self):
        fragments = [fragment(1000 + i * 50, 5000 + i * 50) for i in range(6)]
        clusters = cluster_fragments(fragments, join=1000)
        assert len(clusters) == 1
        assert clusters[0].support == 6

    def test_a_breakpoint_is_not_split_into_two_weak_clusters(self):
        # The bug fixed-width bins have: fragments either side of a round
        # number belong to one event and must be counted as one.
        fragments = [fragment(999_900 + i * 40, 2_000_000) for i in range(10)]
        clusters = cluster_fragments(fragments, join=1000)
        assert len(clusters) == 1
        assert clusters[0].support == 10

    def test_distant_fragments_stay_separate(self):
        fragments = [fragment(1000, 5000), fragment(50_000, 90_000)]
        clusters = cluster_fragments(fragments, join=1000)
        assert len(clusters) == 2

    def test_one_shared_breakpoint_with_two_partners_stays_two_clusters(self):
        # Both events start in the same place; only the far end distinguishes
        # them, so sweeping the near end alone would merge two real events.
        fragments = [fragment(1000, 5000), fragment(1010, 900_000)]
        clusters = cluster_fragments(fragments, join=1000)
        assert len(clusters) == 2
        assert {c.support for c in clusters} == {1}

    def test_different_chromosome_pairs_never_merge(self):
        fragments = [fragment(1000, 5000, b="1"), fragment(1000, 5000, b="2")]
        clusters = cluster_fragments(fragments, join=1000)
        assert len(clusters) == 2

    def test_cluster_keeps_the_span_the_fragments_covered(self):
        fragments = [fragment(1000, 5000), fragment(1400, 5600)]
        cluster = cluster_fragments(fragments, join=1000)[0]
        assert (cluster.a_start, cluster.a_end) == (1000, 1400)
        assert (cluster.b_start, cluster.b_end) == (5000, 5600)

    def test_minimum_mapq_is_the_worst_read_in_the_cluster(self):
        fragments = [fragment(1000, 5000, mapq=60), fragment(1050, 5050, mapq=22)]
        assert cluster_fragments(fragments, join=1000)[0].minimum_mapq == 22

    def test_no_fragments_gives_no_clusters(self):
        assert cluster_fragments([], join=1000) == []


class TestOutput:
    def _write(self, clusters, minimum_support=3):
        handle = io.StringIO()
        count = write_bedpe(clusters, handle, minimum_support, "test.bam")
        rows = [
            line.split("\t")
            for line in handle.getvalue().splitlines()
            if not line.startswith("#")
        ]
        return count, rows

    def test_weak_clusters_are_left_out(self):
        clusters = cluster_fragments(
            [fragment(1000, 5000), fragment(1050, 5050)], join=1000
        )
        count, rows = self._write(clusters, minimum_support=3)
        assert count == 0 and rows == []

    def test_strongest_cluster_comes_first(self):
        fragments = [fragment(1000 + i * 10, 5000) for i in range(4)]
        fragments += [fragment(80_000 + i * 10, 200_000) for i in range(9)]
        count, rows = self._write(cluster_fragments(fragments, join=1000))
        assert count == 2
        assert [int(row[11]) for row in rows] == [9, 4]

    def test_coordinates_are_zero_based_half_open(self):
        # BEDPE starts count from zero, and Gens rejects an empty interval.
        clusters = cluster_fragments([fragment(1000, 5000)] * 3, join=1000)
        _, rows = self._write(clusters)
        assert int(rows[0][1]) == 999 and int(rows[0][2]) == 1000
        assert int(rows[0][2]) > int(rows[0][1])

    def test_a_mostly_split_cluster_is_reported_as_split(self):
        fragments = [fragment(1000 + i * 10, 5000, split=i < 2) for i in range(3)]
        _, rows = self._write(cluster_fragments(fragments, join=1000))
        assert rows[0][10] == "split"

    def test_a_mostly_paired_cluster_is_reported_as_a_pair(self):
        fragments = [fragment(1000 + i * 10, 5000, split=i < 1) for i in range(4)]
        _, rows = self._write(cluster_fragments(fragments, join=1000))
        assert rows[0][10] == "pair"

    def test_mapq_is_capped_at_what_gens_accepts(self):
        # Gens treats 255 as "unavailable", so a real 255 must not be written.
        clusters = cluster_fragments([fragment(1000, 5000, mapq=255)] * 3, join=1000)
        _, rows = self._write(clusters)
        assert int(rows[0][12]) == 254

    def test_names_are_unique(self):
        fragments = [fragment(1000 + i * 10, 5000) for i in range(3)]
        fragments += [fragment(90_000 + i * 10, 300_000) for i in range(3)]
        _, rows = self._write(cluster_fragments(fragments, join=1000))
        assert len({row[6] for row in rows}) == len(rows)

    def test_output_parses_as_a_gens_bedpe(self):
        from gens.bedpe import parse_bedpe

        fragments = [fragment(1000 + i * 10, 5000) for i in range(5)]
        handle = io.StringIO()
        write_bedpe(cluster_fragments(fragments, join=1000), handle, 3, "test.bam")

        path = Path(tempfile.mkdtemp()) / "evidence.bedpe"
        path.write_text(handle.getvalue())
        connections = list(parse_bedpe(path))
        assert len(connections) == 1
        assert connections[0].fragments == 5


class TestFilterExpression:
    def test_keeps_the_three_things_worth_clustering(self):
        expression = build_filter(1000)
        assert "rname != mrname" in expression
        assert "tlen > 1000" in expression and "tlen < -1000" in expression
        assert "exists([SA])" in expression

    def test_the_normal_limit_is_configurable(self):
        assert "tlen > 700" in build_filter(700)
