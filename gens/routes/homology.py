"""Catalogued sequence homology for a region.

Answers "is this region near-identical to somewhere else, and where", which is
what turns a coverage drop into an explanation. It makes no call: the response
is a catalogue lookup, and an empty one means nothing was catalogued here rather
than that the sequence is unique.
"""

from fastapi import APIRouter, HTTPException, Query

from gens.crud.homology import MAX_HOMOLOGY_WINDOW, get_homology
from gens.models.genomic import Chromosome, GenomeBuild
from gens.models.homology import HomologyRegions

from .utils import ApiTags, GensDb

router = APIRouter()


@router.get("/homology", tags=[ApiTags.ANNOT])
def get_region_homology(
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    db: GensDb,
    start: int = Query(default=1, ge=1),
    end: int = Query(..., ge=1),
) -> HomologyRegions:
    """Segmental duplications overlapping the region, longest first.

    The identity is UCSC's own, from their alignment; Gens aligns nothing. The
    catalogue holds alignments of at least a kilobase at 90% identity or better,
    so shorter homology, including the Alu-length pairs behind many small
    deletions, is simply not in it.
    """
    if end < start:
        raise HTTPException(status_code=416, detail="end precedes start")
    if end - start > MAX_HOMOLOGY_WINDOW:
        raise HTTPException(
            status_code=416,
            detail=f"region exceeds {MAX_HOMOLOGY_WINDOW} bp",
        )
    return get_homology(
        db=db,
        genome_build=genome_build,
        chromosome=chromosome,
        start=start,
        end=end,
    )
