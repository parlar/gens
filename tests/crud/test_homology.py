"""Storing and querying the homology catalogue."""

import mongomock
import pytest

from gens.crud.homology import get_homology, replace_homology
from gens.db.collections import HOMOLOGY_COLLECTION
from gens.models.genomic import Chromosome, GenomeBuild


@pytest.fixture(name="db")
def fixture_db():
    return mongomock.MongoClient().db


def pair(start: int, end: int, chrom: str = "11", identity: float = 0.97, **extra):
    return {
        "chrom": chrom,
        "start": start,
        "end": end,
        "partner_chrom": extra.get("partner_chrom", "11"),
        "partner_start": extra.get("partner_start", 88_842_207),
        "partner_end": extra.get("partner_end", 89_159_225),
        "identity": identity,
        "orientation": extra.get("orientation", "inverted"),
        "aligned_bases": extra.get("aligned_bases", 305_405),
    }


def test_a_region_finds_the_pair_that_spans_it(db):
    # The case the feature exists for: an event sits well inside one large
    # pair, so a query for the event must find a record that starts long before
    # it and ends long after.
    replace_homology(db, GenomeBuild.HG38, [pair(49_465_498, 49_791_730)])

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 49_688_000, 49_736_000)

    assert len(result.pairs) == 1
    assert result.pairs[0].partner_start == 88_842_207
    assert result.pairs[0].orientation == "inverted"


def test_a_pair_touching_either_edge_of_the_view_is_returned(db):
    replace_homology(
        db,
        GenomeBuild.HG38,
        [pair(1_000, 2_000), pair(3_000, 4_000), pair(5_000, 6_000)],
    )

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 2_000, 5_000)

    assert sorted(p.start for p in result.pairs) == [1_000, 3_000, 5_000]


def test_a_pair_outside_the_view_is_not_returned(db):
    replace_homology(db, GenomeBuild.HG38, [pair(1_000, 2_000), pair(9_000, 10_000)])

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 4_000, 5_000)

    assert result.pairs == []


def test_another_chromosome_is_not_returned(db):
    replace_homology(
        db,
        GenomeBuild.HG38,
        [pair(1_000, 200_000), pair(1_000, 200_000, chrom="7")],
    )

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 1_000, 2_000)

    assert [p.chrom for p in result.pairs] == ["11"]


def test_another_genome_build_is_not_returned(db):
    # Coordinates from the wrong build resolve somewhere plausible and wrong,
    # which is worse than returning nothing.
    replace_homology(db, GenomeBuild.HG37, [pair(1_000, 200_000)])

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 1_000, 2_000)

    assert result.pairs == []


def test_the_longest_pair_comes_first(db):
    # A view is routinely crossed by one large pair and several small ones; the
    # large one is the one that can hold both breakpoints of an event.
    replace_homology(
        db,
        GenomeBuild.HG38,
        [pair(4_000, 6_000), pair(1_000, 200_000), pair(4_500, 9_000)],
    )

    result = get_homology(db, GenomeBuild.HG38, Chromosome.CH11, 5_000, 5_500)

    assert [p.end - p.start for p in result.pairs] == [199_000, 4_500, 2_000]


def test_loading_the_same_file_twice_does_not_double_the_catalogue(db):
    # Reloading is the ordinary way to pick up a new UCSC release.
    rows = [pair(1_000, 200_000), pair(300_000, 400_000)]
    replace_homology(db, GenomeBuild.HG38, rows)
    replace_homology(db, GenomeBuild.HG38, rows)

    assert db.get_collection(HOMOLOGY_COLLECTION).count_documents({}) == 2


def test_loading_one_build_leaves_another_alone(db):
    replace_homology(db, GenomeBuild.HG37, [pair(1_000, 200_000)])
    replace_homology(db, GenomeBuild.HG38, [pair(1_000, 200_000)])

    assert db.get_collection(HOMOLOGY_COLLECTION).count_documents({}) == 2


def test_a_failed_parse_leaves_the_previous_catalogue_in_place(db):
    # The old records go only once the new ones are in hand, so a bad file
    # cannot empty a working install.
    replace_homology(db, GenomeBuild.HG38, [pair(1_000, 200_000)])

    with pytest.raises(ValueError):
        replace_homology(db, GenomeBuild.HG38, [])

    assert db.get_collection(HOMOLOGY_COLLECTION).count_documents({}) == 1


def test_pairs_too_short_to_hold_a_breakpoint_are_not_stored(db):
    # A view is crossed by hundreds of short catalogue entries, and drawing all
    # of them says "this part of the genome is repetitive", which is not the
    # question being asked.
    stored = replace_homology(
        db,
        GenomeBuild.HG38,
        [pair(1_000, 1_500), pair(10_000, 200_000)],
        minimum_length=1_000,
    )

    assert stored == 1
    assert [p.start for p in get_homology(
        db, GenomeBuild.HG38, Chromosome.CH11, 1, 300_000
    ).pairs] == [10_000]
