"""Heterozygous-site density per genomic bin, relative to the sample itself."""

from __future__ import annotations

from pydantic import Field

from .base import RWModel


class HetDensityBin(RWModel):
    """One bin on the absolute genomic grid.

    Carries the raw count. The client divides by the track's baseline to get a
    ratio, and both numbers are kept so that a displayed ratio can always be
    traced back to what was actually counted.
    """

    start: int = Field(ge=1, description="1-based inclusive start")
    end: int = Field(ge=1, description="1-based inclusive end")
    observed: int = Field(ge=0)
    #: Median stored coverage log2 ratio over this same bin, or None where the
    #: bin holds no stored coverage at all. It is here because the count cannot
    #: be read without it: a bin empty of heterozygous sites is produced by a
    #: heterozygous deletion and by a run of homozygosity alike, and the
    #: coverage in the same bin is what separates the two. It does not separate
    #: a deletion from a coverage dropout.
    coverage: float | None = None


class HetDensityTrack(RWModel):
    """Binned heterozygous-site density for one sample over one region.

    Deliberately carries no probability, p value or call. Measured against six
    related samples, no calibrated threshold on these counts exists at any bin
    size between 20 kb and 200 kb, because a bin empty of heterozygous sites is
    produced by a heterozygous deletion, by a run of homozygosity, by a coverage
    dropout and by ordinary mapping difficulty alike, and two of those are
    ordinary biology. Each bin carries the coverage measured over the same bin,
    which separates the deletion from the run of homozygosity but not from the
    dropout, and is a covariate rather than a call. See
    docs/research/baf_noise/results-panel-reference.md.
    """

    chromosome: str
    bin_size: int = Field(gt=0)
    het_range: tuple[float, float]
    #: Median bin on this chromosome for this sample. Fixed for the chromosome,
    #: so a bin's displayed value does not change as the user pans or zooms.
    baseline: float = Field(ge=0)
    #: Below this the ratio means nothing and the client should decline to show
    #: one: a chromosome whose typical bin holds two or three sites cannot
    #: distinguish depletion from ordinary sampling.
    minimum_baseline: float = Field(ge=0)
    bins: list[HetDensityBin]
