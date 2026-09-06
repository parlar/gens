"""Fetching annotations for a region.

A repeat catalogue holds millions of records, so which of them the database is
asked for decides whether the track is usable at all. These tests pin down that
the region really narrows the query, and that an annotation overlapping the
edge of the view is not dropped.
"""

import mongomock
from bson import ObjectId

from gens.crud.annotations import get_annotations_for_track
from gens.db.collections import ANNOTATIONS_COLLECTION

TRACK = ObjectId()
OTHER_TRACK = ObjectId()


def annotation(chrom, start, end, name="a", track=TRACK):
    return {
        "track_id": track,
        "name": name,
        "chrom": chrom,
        "start": start,
        "end": end,
        "color": "grey",
    }


def load(db, docs):
    db[ANNOTATIONS_COLLECTION].insert_many(docs)


def names(records):
    return sorted(record.name for record in records)


def test_without_a_region_the_whole_track_comes_back(db: mongomock.Database) -> None:
    load(db, [annotation("1", 100, 200, "a"), annotation("2", 100, 200, "b")])
    assert names(get_annotations_for_track(TRACK, db)) == ["a", "b"]


def test_another_track_is_never_included(db: mongomock.Database) -> None:
    load(
        db,
        [
            annotation("1", 100, 200, "mine"),
            annotation("1", 100, 200, "theirs", OTHER_TRACK),
        ],
    )
    assert names(get_annotations_for_track(TRACK, db)) == ["mine"]


def test_a_chromosome_narrows_the_query(db: mongomock.Database) -> None:
    load(
        db, [annotation("1", 100, 200, "here"), annotation("2", 100, 200, "elsewhere")]
    )
    assert names(get_annotations_for_track(TRACK, db, chromosome="1")) == ["here"]


def test_a_region_keeps_only_what_touches_it(db: mongomock.Database) -> None:
    load(
        db,
        [
            annotation("1", 100, 200, "before"),
            annotation("1", 900, 1100, "inside"),
            annotation("1", 5000, 5100, "after"),
        ],
    )
    found = get_annotations_for_track(TRACK, db, chromosome="1", start=800, end=2000)
    assert names(found) == ["inside"]


def test_an_annotation_reaching_in_from_outside_is_kept(db: mongomock.Database) -> None:
    # Containment would drop a segmental duplication that starts before the
    # view and covers all of it, which is exactly the one worth seeing.
    load(db, [annotation("1", 10, 100_000, "spanning")])
    found = get_annotations_for_track(TRACK, db, chromosome="1", start=5000, end=6000)
    assert names(found) == ["spanning"]


def test_an_annotation_touching_only_the_edge_is_kept(db: mongomock.Database) -> None:
    load(
        db,
        [
            annotation("1", 500, 1000, "ends at the start"),
            annotation("1", 2000, 2500, "starts at the end"),
        ],
    )
    found = get_annotations_for_track(TRACK, db, chromosome="1", start=1000, end=2000)
    assert names(found) == ["ends at the start", "starts at the end"]


def test_only_a_start_is_enough(db: mongomock.Database) -> None:
    load(db, [annotation("1", 100, 200, "early"), annotation("1", 9000, 9100, "late")])
    found = get_annotations_for_track(TRACK, db, chromosome="1", start=5000)
    assert names(found) == ["late"]


def test_the_result_is_capped(db: mongomock.Database) -> None:
    # A repeat catalogue over a whole chromosome would otherwise return
    # hundreds of thousands of records that cannot be told apart on screen.
    load(db, [annotation("1", 1 + i * 10, 6 + i * 10, f"r{i}") for i in range(50)])
    assert len(get_annotations_for_track(TRACK, db, chromosome="1", limit=10)) == 10


def test_the_cap_can_be_lifted(db: mongomock.Database) -> None:
    load(db, [annotation("1", 1 + i * 10, 6 + i * 10, f"r{i}") for i in range(50)])
    assert len(get_annotations_for_track(TRACK, db, chromosome="1", limit=0)) == 50
