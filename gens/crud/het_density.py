"""Assemble heterozygous-site density for a sample against its peers."""

from __future__ import annotations

import logging
from typing import Any

from pysam import TabixFile
from pymongo.collection import Collection

from gens.het_density import (
    DEFAULT_BIN_SIZE,
    DEFAULT_HET_RANGE,
    bin_range,
    count_het_sites,
    leave_one_out_reference,
)
from gens.models.genomic import GenomeBuild
from gens.models.het_density import HetDensityBin, HetDensityTrack

from .samples import get_samples_for_case

LOG = logging.getLogger(__name__)

#: A reference below this leaves the ratio meaningless, so the bin is reported
#: without one rather than as a confident value built on two or three sites.
MINIMUM_REFERENCE = 5.0


def get_het_density(
    samples_c: Collection[dict[str, Any]],
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    chromosome: str,
    start: int,
    end: int,
    bin_size: int = DEFAULT_BIN_SIZE,
) -> HetDensityTrack:
    """Count heterozygous sites per bin for `sample_id`, and for its peers.

    The peers are the other samples of the same case. **They are not a panel of
    normals, and for a family case they are actively misleading.** Heterozygote
    density is precisely what differs between relatives by descent: measured on
    the reference pedigree at chr1:189,580,001-189,600,000, all six samples have
    the same 35 or 36 stored sites, so callability is identical, yet five are
    homozygous across the whole block and one is heterozygous at every site. A
    peer reference reports a 35-fold excess there, in a completely ordinary
    region, and would report the mirror image as depletion for whichever sample
    happened to be the odd one out.

    A defensible reference has to come from unrelated samples processed the same
    way. Until one exists, treat this output as "how this sample compares with
    the others opened beside it" and nothing more. A case with a single sample
    has no reference at all, which is reported rather than papered over.

    What the per-bin reference does fix, whatever its provenance, is that a bin's
    value no longer depends on where the user happens to be looking, and bins at
    the edge of the view are no longer compared against a full-bin expectation.
    """
    case_samples = get_samples_for_case(samples_c, case_id)
    matching = [s for s in case_samples if s.genome_build == genome_build]

    subject = next((s for s in matching if s.sample_id == sample_id), None)
    if subject is None:
        raise ValueError(f"sample {sample_id} not found in case {case_id}")

    first_bin, last_bin = bin_range(start, end, bin_size)

    counts: dict[str, list[int]] = {}
    for sample in matching:
        with TabixFile(str(sample.baf_file)) as tabix:
            counts[sample.sample_id] = count_het_sites(
                tabix, chromosome, first_bin, last_bin, bin_size, DEFAULT_HET_RANGE
            )

    peers = [s.sample_id for s in matching if s.sample_id != sample_id]
    reference = leave_one_out_reference(counts, sample_id) if peers else []

    observed = counts[sample_id]
    bins = [
        HetDensityBin(
            start=(first_bin + index) * bin_size + 1,
            end=(first_bin + index + 1) * bin_size,
            observed=value,
            reference=reference[index] if reference else None,
        )
        for index, value in enumerate(observed)
    ]

    return HetDensityTrack(
        chromosome=chromosome,
        bin_size=bin_size,
        het_range=DEFAULT_HET_RANGE,
        peer_sample_ids=peers,
        minimum_reference=MINIMUM_REFERENCE,
        bins=bins,
    )
