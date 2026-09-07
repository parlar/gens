"""Heterozygous-site density over fixed genomic bins.

A heterozygous deletion or a run of homozygosity removes heterozygosity instead
of shifting the B-allele band, so neither is visible in the BAF track. Counting
heterozygous sites per bin makes them visible.

The count is descriptive. It is not a test, and it carries no probability. A bin
with few heterozygous sites is produced by a heterozygous deletion, by a run of
homozygosity, by a coverage dropout and by ordinary mapping difficulty, and two
of those are real biology. Measured against six related samples, no calibrated
threshold on these counts exists at any bin size between 20 kb and 200 kb: see
docs/research/baf_noise/results-panel-reference.md. Interpretation needs the
coverage track beside it.

The scale a bin is shown against is the sample's own typical bin on the same
chromosome, not the bins that happen to be in view and not the other samples
opened beside it. Both alternatives were measured and rejected. A within-view
baseline makes a bin's value depend on where the user is looking, so zooming
onto an event erases it. Peer samples are worse for a family case: heterozygote
density is precisely what siblings differ in by descent, and at
chr1:189,580,001-189,600,000 all six reference-pedigree samples carry the same
35 or 36 stored sites while five are homozygous across the block and one is
heterozygous at every site, so a peer reference reports a 35-fold excess in an
entirely ordinary region.
"""

from __future__ import annotations

import logging
from statistics import median

from pysam import TabixFile

LOG = logging.getLogger(__name__)

#: Stored BAF values strictly inside this interval are treated as heterozygous.
#: The stored track holds every site, homozygous ones included, so an unfiltered
#: count measures the site list rather than heterozygosity. At the depths seen
#: here a true heterozygote sits near 0.5 with a sampling SD around 0.09, so this
#: spans roughly four SD either side and still retains the 1/3 and 2/3 fractions
#: of a three-copy state.
DEFAULT_HET_RANGE = (0.15, 0.85)

#: Bin width in base pairs. Bins are aligned to absolute genomic coordinates, so
#: a bin keeps its boundaries and its value regardless of the view.
DEFAULT_BIN_SIZE = 20_000

#: Full resolution. Coarser zoom levels hold pre-aggregated points, where a count
#: measures the aggregation rather than the genome.
FULL_RESOLUTION = "d"


def bin_range(start: int, end: int, bin_size: int) -> tuple[int, int]:
    """Indices of the absolute-grid bins covering the 1-based inclusive region."""
    if bin_size <= 0:
        raise ValueError("bin_size must be positive")
    if end < start:
        raise ValueError("end must not precede start")
    return (start - 1) // bin_size, (end - 1) // bin_size


def count_het_sites(
    tabix: TabixFile,
    chromosome: str,
    first_bin: int,
    last_bin: int,
    bin_size: int = DEFAULT_BIN_SIZE,
    het_range: tuple[float, float] = DEFAULT_HET_RANGE,
) -> list[int]:
    """Heterozygous sites per bin, for bins `first_bin` through `last_bin`.

    Returns zeros rather than raising when the contig is absent, so a sample
    lacking a chromosome reports no observations instead of failing the request.
    """
    if last_bin < first_bin:
        raise ValueError("last_bin must not precede first_bin")
    low, high = het_range
    counts = [0] * (last_bin - first_bin + 1)
    record = f"{FULL_RESOLUTION}_{chromosome}"
    try:
        rows = tabix.fetch(record, first_bin * bin_size, (last_bin + 1) * bin_size)
    except ValueError:
        LOG.warning("no records named %s in %s", record, tabix.filename)
        return counts

    for row in rows:
        fields = row.split("\t")
        if len(fields) < 4:
            continue
        try:
            position = int(fields[1])
            value = float(fields[3])
        except ValueError:
            continue
        if not low < value < high:
            continue
        index = position // bin_size - first_bin
        if 0 <= index < len(counts):
            counts[index] += 1
    return counts


def median_coverage_per_bin(
    tabix: TabixFile,
    chromosome: str,
    first_bin: int,
    last_bin: int,
    bin_size: int = DEFAULT_BIN_SIZE,
) -> list[float | None]:
    """Median stored coverage log2 ratio per bin, on the same grid as the counts.

    This is the covariate the count cannot be read without. A bin empty of
    heterozygous sites is produced by a heterozygous deletion and by a run of
    homozygosity alike; the first removes a copy and the second does not, so the
    coverage in the same bin separates them. Reading it here, on the identical
    bin boundaries, is what lets the track carry the answer rather than asking
    the reader to align two tracks by eye.

    It does not separate a deletion from a coverage dropout. Both lower the
    stored ratio, and nothing in this file can tell them apart.

    The median rather than the mean because the stored track is a per-site ratio
    whose tails are heavy: a handful of pile-up sites in a repeat move a mean out
    of the bin's own range while leaving the median where the bin actually sits.

    `None` for a bin holding no stored coverage at all, which is a different
    statement from a bin whose coverage is zero and must not be drawn as one.

    Measured on a 29x WGS sample at 20 kb bins: 196,811 rows over the widest
    window the endpoint allows, read in 0.15 s.
    """
    if last_bin < first_bin:
        raise ValueError("last_bin must not precede first_bin")
    values: list[list[float]] = [[] for _ in range(last_bin - first_bin + 1)]
    record = f"{FULL_RESOLUTION}_{chromosome}"
    try:
        rows = tabix.fetch(record, first_bin * bin_size, (last_bin + 1) * bin_size)
    except ValueError:
        LOG.warning("no records named %s in %s", record, tabix.filename)
        return [None] * len(values)

    for row in rows:
        fields = row.split("\t")
        if len(fields) < 4:
            continue
        try:
            position = int(fields[1])
            value = float(fields[3])
        except ValueError:
            continue
        index = position // bin_size - first_bin
        if 0 <= index < len(values):
            values[index].append(value)
    return [float(median(bin_values)) if bin_values else None for bin_values in values]


def chromosome_baseline(
    tabix: TabixFile,
    chromosome: str,
    chromosome_length: int,
    bin_size: int = DEFAULT_BIN_SIZE,
    het_range: tuple[float, float] = DEFAULT_HET_RANGE,
) -> float:
    """The sample's typical bin on this chromosome: the median over every bin.

    Empty bins are counted rather than skipped. Skipping them would define the
    typical bin as the typical *callable* bin, raising the scale so that every
    ordinary low-density stretch reads as depleted against it. That is the only
    thing counting them buys. It does not rescue a bin that is genuinely empty:
    a count of zero has no logarithm and sits on the floor of the axis whatever
    the scale is, so an uncallable bin and a deleted one still look identical.
    Nothing in this module separates them, which is why the track carries no
    call and has to be read beside the coverage track. The median rather than
    the mean so that a real event, or a handful of very dense bins, does not
    move it.

    Scanning a whole chromosome costs about a quarter of a second for chromosome
    1 at 20 kb bins, measured on a 29x WGS sample.
    """
    counts = count_het_sites(
        tabix,
        chromosome,
        0,
        max(0, (chromosome_length - 1) // bin_size),
        bin_size,
        het_range,
    )
    return float(median(counts)) if counts else 0.0


def panel_reference(per_sample_counts: list[list[int]]) -> list[float]:
    """Per-bin reference from several samples processed the same way.

    The median is used rather than the mean so that one sample carrying an event
    does not drag down the expectation the others are compared against.
    """
    if not per_sample_counts:
        return []
    widths = {len(counts) for counts in per_sample_counts}
    if len(widths) != 1:
        raise ValueError("every sample must contribute the same number of bins")
    return [float(median(bins)) for bins in zip(*per_sample_counts)]


def leave_one_out_reference(
    per_sample_counts: dict[str, list[int]], sample_id: str
) -> list[float]:
    """Reference excluding `sample_id`, so a carrier never sets its own expectation."""
    others = [counts for name, counts in per_sample_counts.items() if name != sample_id]
    return panel_reference(others)
