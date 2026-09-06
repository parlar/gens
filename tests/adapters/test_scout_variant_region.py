"""Variant queries have to respect the interval the route advertises.

The overlap predicate was commented out in both copies of this query, so asking
for a window returned every variant on the chromosome. A caller that trusts the
documented interval would draw variants from far outside the view.

These run against ScoutMongoAdapter, which is the copy the API actually
reaches through AdapterDep. gens/crud/scout.py holds a second copy whose query
functions nothing imports.
"""

import mongomock
import pytest

from gens.adapters.scout import ScoutMongoAdapter
from gens.models.genomic import GenomicRegion, VariantCategory

CASE = "case1"
SAMPLE = "sample1"

# The window every test asks for.
WINDOW_START = 1000
WINDOW_END = 2000


def variant(document_id: str, position: int, end: int) -> dict:
    """A Scout structural variant, which stores its first base in `position`."""
    return {
        "document_id": document_id,
        "case_id": CASE,
        "category": "sv",
        "chromosome": "1",
        "position": position,
        "end": end,
        "variant_type": "clinical",
        "sub_category": "del",
        "samples": [{"sample_id": SAMPLE, "genotype_call": "0/1"}],
    }


@pytest.fixture
def adapter(db: mongomock.Database) -> ScoutMongoAdapter:
    return ScoutMongoAdapter(db)


def found(adapter: ScoutMongoAdapter) -> list[str]:
    variants = adapter.get_variants(
        case_id=CASE,
        sample_name=SAMPLE,
        region=GenomicRegion(chromosome="1", start=WINDOW_START, end=WINDOW_END),
        variant_category=VariantCategory.SINGLE_VAR,
    )
    return sorted(v.document_id for v in variants)


class TestOnlyOverlappingVariantsComeBack:
    def test_one_contained_in_the_window(self, adapter, db):
        db.variant.insert_one(variant("contained", 1200, 1300))
        assert found(adapter) == ["contained"]

    def test_one_spanning_the_whole_window(self, adapter, db):
        # The case that matters most for this tool: a deletion larger than the
        # view has neither endpoint inside it, and testing only the endpoints
        # would hide exactly the variant the reader is looking at.
        db.variant.insert_one(variant("spanning", 10, 50_000))
        assert found(adapter) == ["spanning"]

    def test_one_overlapping_each_edge(self, adapter, db):
        db.variant.insert_many(
            [variant("over_left", 500, 1500), variant("over_right", 1500, 2500)]
        )
        assert found(adapter) == ["over_left", "over_right"]

    def test_one_touching_each_boundary(self, adapter, db):
        # The interval is inclusive at both ends.
        db.variant.insert_many(
            [
                variant("at_start", WINDOW_START, WINDOW_START),
                variant("at_end", WINDOW_END, WINDOW_END),
            ]
        )
        assert found(adapter) == ["at_end", "at_start"]

    def test_ones_outside_are_left_out(self, adapter, db):
        db.variant.insert_many(
            [
                variant("before", 10, 999),
                variant("after", 2001, 3000),
                variant("inside", 1400, 1600),
            ]
        )
        assert found(adapter) == ["inside"]

    def test_another_chromosome_is_left_out(self, adapter, db):
        elsewhere = {**variant("other_chrom", 1400, 1600), "chromosome": "2"}
        db.variant.insert_many([variant("inside", 1400, 1600), elsewhere])
        assert found(adapter) == ["inside"]
