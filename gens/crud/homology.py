"""Storing and querying catalogued sequence homology."""

from __future__ import annotations

import logging
from typing import Any, Iterable, Iterator

from pymongo.database import Database

from gens.crud.utils import query_genomic_region
from gens.db.collections import HOMOLOGY_COLLECTION
from gens.models.genomic import Chromosome, GenomeBuild
from gens.models.homology import HomologyPair, HomologyRegions

LOG = logging.getLogger(__name__)

#: Pairs shorter than this are dropped at load time. A region in view is
#: routinely crossed by hundreds of short catalogue entries, and a track showing
#: all of them says only "this part of the genome is repetitive", which is not
#: the question. A pair long enough to hold a breakpoint on each side is.
MINIMUM_PAIR_LENGTH = 1_000

#: A view wider than this is refused rather than answered. Nothing useful is
#: read off a whole chromosome of overlapping pairs, and the query would return
#: tens of thousands of records to draw on top of one another.
MAX_HOMOLOGY_WINDOW = 20_000_000


def replace_homology(
    db: Database[Any],
    genome_build: GenomeBuild,
    pairs: Iterable[dict[str, Any]],
    minimum_length: int = MINIMUM_PAIR_LENGTH,
) -> int:
    """Replace the catalogue for one genome build, and report what was stored.

    Replaced rather than appended to: loading the same file twice is the
    ordinary way to pick up a new UCSC release, and appending would silently
    double every pair. The old records go only once the new ones have been
    parsed, so a load that fails on a malformed file leaves the previous
    catalogue in place.
    """
    collection = db.get_collection(HOMOLOGY_COLLECTION)

    documents = [
        {**pair, "genome_build": int(genome_build)}
        for pair in pairs
        if pair["end"] - pair["start"] + 1 >= minimum_length
    ]
    if not documents:
        raise ValueError(
            "no usable pairs were parsed; the existing catalogue was left alone"
        )

    collection.delete_many({"genome_build": int(genome_build)})
    collection.insert_many(documents)
    return len(documents)


def get_homology(
    db: Database[Any],
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    start: int,
    end: int,
) -> HomologyRegions:
    """Catalogued pairs overlapping the region, longest first.

    Longest first so that a view crossed by one large pair and a scatter of
    small ones leads with the one that can hold both breakpoints of an event.
    """
    query: dict[str, Any] = {
        "genome_build": int(genome_build),
        "chrom": str(chromosome),
        **query_genomic_region(start, end),
    }
    cursor = db.get_collection(HOMOLOGY_COLLECTION).find(query)

    pairs = sorted(
        (HomologyPair.model_validate(record) for record in cursor),
        key=lambda pair: pair.end - pair.start,
        reverse=True,
    )
    return HomologyRegions(
        chromosome=str(chromosome), start=start, end=end, pairs=pairs
    )


def iter_homology(
    db: Database[Any], genome_build: GenomeBuild
) -> Iterator[HomologyPair]:
    """Every stored pair for a build. Used by the loader to report on itself."""
    for record in db.get_collection(HOMOLOGY_COLLECTION).find(
        {"genome_build": int(genome_build)}
    ):
        yield HomologyPair.model_validate(record)
