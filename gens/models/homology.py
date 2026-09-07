"""Catalogued sequence homology between two places in the genome."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from .base import RWModel
from .genomic import Chromosome


class HomologyPair(RWModel):
    """One catalogued near-identical pair, seen from one of its two sides.

    UCSC stores every alignment from both sides, so the pairs overlapping a
    region already name that region's partners and nothing has to be looked up
    in reverse.
    """

    chrom: Chromosome
    start: int = Field(ge=1, description="1-based inclusive start")
    end: int = Field(ge=1, description="1-based inclusive end")
    partner_chrom: Chromosome
    partner_start: int = Field(ge=1, description="1-based inclusive start")
    partner_end: int = Field(ge=1, description="1-based inclusive end")
    #: UCSC's `fracMatch`: matched bases over aligned bases, between 0 and 1.
    #: Their number, from their alignment. Gens aligns nothing.
    identity: float = Field(ge=0, le=1)
    #: A direct pair recombines to delete or duplicate what lies between its two
    #: copies; an inverted pair inverts it. Kept because the two mechanisms
    #: leave different evidence, and "these are similar" does not distinguish
    #: them.
    orientation: Literal["direct", "inverted"]
    aligned_bases: int = Field(ge=0)


class HomologyRegions(RWModel):
    """The catalogued pairs overlapping one region.

    Descriptive, and bounded by the catalogue: it holds alignments of at least
    a kilobase at 90% identity or better, so an empty response means no pair
    was catalogued here, not that the sequence is unique. Nothing in it is a
    call about what produced any event in view.
    """

    chromosome: str
    start: int = Field(ge=1)
    end: int = Field(ge=1)
    pairs: list[HomologyPair]
