"""Reading catalogued sequence homology from UCSC's segmental duplication table.

A structural variant does not appear anywhere at random. Where two stretches of
the genome are near-identical, recombination can pair the wrong two copies and
delete, duplicate or invert what lies between them, so a breakpoint sitting
inside such a pair, whose partner is where the discordant reads point, has an
explanation the coverage alone cannot give.

This module reads pairs that have already been aligned and catalogued rather
than aligning anything. The identity it reports is UCSC's own `fracMatch`, not a
number Gens computed.

Being a catalogue, it is bounded by what the catalogue holds: alignments of at
least a kilobase at 90% identity or better. Homology below that, including the
Alu-length pairs behind many small deletions, is not in this table, and its
absence here is not evidence of absence.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable, Iterator

LOG = logging.getLogger(__name__)

# Field positions in UCSC's `genomicSuperDups` table, counted from the first
# real column rather than from the optional leading `bin`. The full order is
# chrom, chromStart, chromEnd, name, score, strand, otherChrom, otherStart,
# otherEnd, otherSize, uid, posBasesHit, testResult, verdict, chits, ccov,
# alignfile, alignL, indelN, indelS, alignB, matchB, mismatchB, transitionsB,
# transversionsB, fracMatch, fracMatchIndel, jcK, k2K.
#
# `score` sits between `name` and `strand` and is easy to leave out when
# counting these by hand, which shifts every position after it: identity would
# then be read from the transversion count and the whole loaded catalogue would
# look plausible and be wrong. tests/test_homology.py checks the positions
# against a real row rather than against this comment.
_CHROM = 0
_START = 1
_END = 2
_STRAND = 5
_OTHER_CHROM = 6
_OTHER_START = 7
_OTHER_END = 8
_ALIGNED_BASES = 20
_FRAC_MATCH = 25

#: Columns the table has once any `bin` prefix is dropped.
_EXPECTED_COLUMNS = 29

#: Contigs Gens can place. UCSC ships alternate haplotypes and unplaced and
#: unlocalised contigs in the same file; a pair whose partner sits on one of
#: them cannot be drawn or navigated to, so it is dropped rather than stored as
#: an address that leads nowhere.
_PLACEABLE = {str(number) for number in range(1, 23)} | {"X", "Y", "MT"}


def normalise_contig(name: str) -> str | None:
    """UCSC's contig name as Gens spells it, or None where Gens cannot place it."""
    stripped = name[3:] if name.startswith("chr") else name
    if stripped == "M":
        stripped = "MT"
    return stripped if stripped in _PLACEABLE else None


def _strip_bin_column(fields: list[str]) -> list[str]:
    """Drop UCSC's indexing column where the dump carries one.

    A table dump begins with `bin`; the same data fetched through the table
    browser does not. Detected rather than configured, because a wrong guess
    shifts every column and fails silently.
    """
    if fields and fields[0].startswith("chr"):
        return fields
    return fields[1:]


def parse_super_dups(lines: Iterable[str]) -> Iterator[dict[str, Any]]:
    """Catalogued pairs from the lines of a `genomicSuperDups` table.

    Malformed rows, and rows naming a contig Gens cannot place, are skipped
    rather than raised on: the file is a third-party dump covering contigs Gens
    does not draw, and one unusable line is not a reason to abandon a load of
    sixty thousand.

    UCSC stores each alignment from both sides, so a region's own rows already
    name its partners and no reciprocal lookup is needed.
    """
    for line in lines:
        fields = _strip_bin_column(line.rstrip("\n").split("\t"))
        if len(fields) < _EXPECTED_COLUMNS:
            continue

        chrom = normalise_contig(fields[_CHROM])
        partner_chrom = normalise_contig(fields[_OTHER_CHROM])
        if chrom is None or partner_chrom is None:
            continue

        try:
            # UCSC coordinates are 0-based half-open; Gens speaks the inclusive
            # 1-based interval a position is written in, so the start moves by
            # one and the end does not.
            start = int(fields[_START]) + 1
            end = int(fields[_END])
            partner_start = int(fields[_OTHER_START]) + 1
            partner_end = int(fields[_OTHER_END])
            identity = float(fields[_FRAC_MATCH])
            aligned_bases = int(fields[_ALIGNED_BASES])
        except ValueError:
            continue

        if end < start or partner_end < partner_start:
            continue
        if not 0.0 <= identity <= 1.0:
            continue

        yield {
            "chrom": chrom,
            "start": start,
            "end": end,
            "partner_chrom": partner_chrom,
            "partner_start": partner_start,
            "partner_end": partner_end,
            "identity": identity,
            # A pair on opposite strands recombines to invert what lies between
            # it; one on the same strand deletes or duplicates it. The two leave
            # different evidence, so the strand is kept rather than reduced to
            # "these two are similar".
            "orientation": "inverted" if fields[_STRAND] == "-" else "direct",
            "aligned_bases": aligned_bases,
        }
