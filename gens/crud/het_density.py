"""Assemble heterozygous-site density for one sample over a region."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pymongo.database import Database
from pysam import TabixFile

from gens.crud.genomic import get_chromosome_info
from gens.crud.samples import get_sample
from gens.het_density import (
    DEFAULT_BIN_SIZE,
    DEFAULT_HET_RANGE,
    bin_range,
    chromosome_baseline,
    count_het_sites,
)
from gens.models.genomic import Chromosome, GenomeBuild
from gens.models.het_density import HetDensityBin, HetDensityTrack

LOG = logging.getLogger(__name__)

#: A chromosome whose typical bin holds fewer sites than this cannot support a
#: ratio at all, so the client is told the scale rather than left to divide by it.
MINIMUM_BASELINE = 5.0

#: Chromosome baselines cost a whole-chromosome scan, so they are computed once
#: per process. The key must name everything the value depends on, or a later
#: request is scaled by another sample's chromosome. See `_baseline_key`.
_BASELINE_CACHE: dict[tuple[str, str, int, str, int, str], float] = {}


def _baseline_key(
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    bin_size: int,
    baf_file: Path,
) -> tuple[str, str, int, str, int, str]:
    """Everything the baseline depends on, so a stale one cannot be served.

    The genome build belongs here twice over: it selects the sample document,
    and it sets the chromosome length, which sets how many empty bins enter the
    median. Two builds of one sample therefore have genuinely different
    baselines, and keying without the build served whichever was requested
    first.

    The file's identity, size and modification time are here because a sample
    can be reloaded against a new BAF file under the same identifiers. Without
    them the process would keep scaling the new data by the old file's median
    until it restarted.
    """
    stat = baf_file.stat()
    fingerprint = f"{baf_file}:{stat.st_size}:{stat.st_mtime_ns}"
    return (
        sample_id,
        case_id,
        int(genome_build),
        str(chromosome),
        bin_size,
        fingerprint,
    )


def get_het_density(
    db: Database[Any],
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    start: int,
    end: int,
    bin_size: int = DEFAULT_BIN_SIZE,
) -> HetDensityTrack:
    """Heterozygous sites per bin, scaled by this sample's own typical bin.

    The scale is the median bin across the whole chromosome, so it does not move
    when the user pans or zooms, and it is the sample's own value, so a family
    case does not measure inheritance. Neither property held before: see the
    module docstring of gens.het_density.
    """
    sample = get_sample(
        db.get_collection("samples"), sample_id, case_id, genome_build
    )

    chrom_info = get_chromosome_info(db, chromosome, genome_build)
    if chrom_info is None:
        raise ValueError(f"no size known for chromosome {chromosome}")

    first_bin, last_bin = bin_range(start, end, bin_size)
    key = _baseline_key(
        sample_id, case_id, genome_build, chromosome, bin_size, Path(sample.baf_file)
    )

    with TabixFile(str(sample.baf_file)) as tabix:
        if key not in _BASELINE_CACHE:
            _BASELINE_CACHE[key] = chromosome_baseline(
                tabix, str(chromosome), chrom_info.size, bin_size, DEFAULT_HET_RANGE
            )
        observed = count_het_sites(
            tabix, str(chromosome), first_bin, last_bin, bin_size, DEFAULT_HET_RANGE
        )

    return HetDensityTrack(
        chromosome=str(chromosome),
        bin_size=bin_size,
        het_range=DEFAULT_HET_RANGE,
        baseline=_BASELINE_CACHE[key],
        minimum_baseline=MINIMUM_BASELINE,
        bins=[
            HetDensityBin(
                start=(first_bin + index) * bin_size + 1,
                end=(first_bin + index + 1) * bin_size,
                observed=value,
            )
            for index, value in enumerate(observed)
        ],
    )
