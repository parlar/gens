"""Heterozygous-site density per genomic bin, relative to peer samples."""

from __future__ import annotations

from pydantic import Field

from .base import RWModel


class HetDensityBin(RWModel):
    """One absolute-grid bin.

    `reference` is the median count of the peer samples over the identical bin.
    It is None when there are no peers, which is not the same as an expectation
    of zero: the first means the question cannot be asked, the second that the
    bin is uncallable in every sample.
    """

    start: int = Field(ge=1, description="1-based inclusive start")
    end: int = Field(ge=1, description="1-based inclusive end")
    observed: int = Field(ge=0)
    reference: float | None = Field(default=None, ge=0)


class HetDensityTrack(RWModel):
    """Binned heterozygous-site density for one sample over one region.

    Deliberately carries no probability, p value or call. Measured against six
    related samples, no calibrated threshold on these counts exists at any bin
    size between 20 kb and 200 kb, because a bin empty of heterozygous sites is
    produced by a heterozygous deletion, by a run of homozygosity, by a coverage
    dropout and by ordinary mapping difficulty alike. See
    docs/research/baf_noise/results-panel-reference.md.
    """

    chromosome: str
    bin_size: int = Field(gt=0)
    het_range: tuple[float, float]
    #: Sample ids contributing to `reference`, never including the sample itself.
    peer_sample_ids: list[str]
    #: Reference values below this are too small for the ratio to mean anything.
    minimum_reference: float = Field(ge=0)
    bins: list[HetDensityBin]
