#!/usr/bin/env python3
"""Cluster discordant read pairs and split reads into Gens BEDPE connections.

An SV caller emits what passed its threshold. A clinician looking at a coverage
dip that nothing called needs the opposite: the evidence the caller discarded.
This tool exports clusters down to a support level no caller would report, so
that "three pairs point at both edges of this dip" is something a reader can
see and weigh.

It is not a caller. A cluster is evidence, not a variant, and the support count
is the number the reader is meant to judge. Measured on a 30x WGS library
(median insert 400 bp), windows with no known SV carry a handful of clusters at
support 3 and essentially none at support 10, so the count separates signal
from background without this tool having to decide which is which.

Output is BEDPE13 as documented in docs/admin_guide/read_connections.md.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

# Reads that cannot support a rearrangement, or would be counted twice.
# 1024 duplicate, 256 secondary, 4 unmapped, 8 mate unmapped.
EXCLUDE_FLAGS = 1024 | 256 | 4 | 8
FLAG_REVERSE = 16
FLAG_MATE_REVERSE = 32

# Two fragments belong to the same cluster when both of their ends fall within
# this many bases. Wider than the library's fragment length, so the scatter in
# where individual pairs land either side of a breakpoint does not split one
# event into several clusters.
DEFAULT_JOIN = 1_000


@dataclass
class Fragment:
    """One sequenced fragment supporting a link between two places."""

    a_chrom: str
    a_pos: int
    b_chrom: str
    b_pos: int
    split: bool
    mapq: int


def build_filter(max_normal: int) -> str:
    """The htslib expression that keeps only reads worth clustering."""
    return (
        f"rname != mrname || tlen > {max_normal} || tlen < -{max_normal}"
        " || exists([SA])"
    )


def read_fragments(
    bam: Path,
    max_normal: int,
    minimum_mapq: int,
    threads: int,
    region: str | None,
) -> tuple[list[Fragment], int]:
    """Every discordant fragment in the BAM, counted once each.

    The heavy filtering runs inside samtools because it is roughly a hundred
    times faster there than in Python; only the ~1% of reads that survive are
    parsed here.

    Both mates of a discordant pair usually pass the filter, and a split read
    also contributes a supplementary alignment. All of those describe one
    fragment, so the read name decides identity and the first sighting wins.
    """
    command = [
        "samtools",
        "view",
        "-@",
        str(threads),
        "-F",
        str(EXCLUDE_FLAGS),
        "-q",
        str(minimum_mapq),
        "-e",
        build_filter(max_normal),
        str(bam),
    ]
    if region is not None:
        command.append(region)

    fragments: list[Fragment] = []
    seen: set[str] = set()
    scanned = 0

    process = subprocess.Popen(
        command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    assert process.stdout is not None
    for line in process.stdout:
        scanned += 1
        parts = line.split("\t", 12)
        name, flag, chrom, pos, mapq, _cigar, mate_chrom, mate_pos, tlen = (
            parts[0],
            int(parts[1]),
            parts[2],
            int(parts[3]),
            int(parts[4]),
            parts[5],
            parts[6],
            int(parts[7]),
            int(parts[8]),
        )
        if name in seen:
            continue

        partner = chrom if mate_chrom == "=" else mate_chrom
        same = partner == chrom
        far = same and abs(tlen) > max_normal
        # FR is the expected orientation. Both mates on one strand points at an
        # inversion; it is kept for the same reason a long fragment is.
        wrong_orientation = same and (
            bool(flag & FLAG_REVERSE) == bool(flag & FLAG_MATE_REVERSE)
        )
        split = "\tSA:Z:" in line
        if not (far or wrong_orientation or not same or split):
            continue

        seen.add(name)
        # Canonical order, so a link found from either mate is the same link.
        ends = sorted([(chrom, pos), (partner, mate_pos)])
        fragments.append(
            Fragment(
                a_chrom=ends[0][0],
                a_pos=ends[0][1],
                b_chrom=ends[1][0],
                b_pos=ends[1][1],
                split=split,
                mapq=mapq,
            )
        )

    process.stdout.close()
    error = process.stderr.read() if process.stderr else ""
    if process.wait() != 0:
        raise RuntimeError(f"samtools failed: {error.strip()}")
    return fragments, scanned


@dataclass
class Cluster:
    a_chrom: str
    a_start: int
    a_end: int
    b_chrom: str
    b_start: int
    b_end: int
    support: int
    split_support: int
    minimum_mapq: int


def cluster_fragments(
    fragments: list[Fragment], join: int = DEFAULT_JOIN
) -> list[Cluster]:
    """Group fragments whose ends agree, within `join` bases at both ends.

    Fixed-width bins were tried first and are wrong: a breakpoint that happens
    to sit on a bin edge is reported as two half-strength clusters, which reads
    as two weak signals instead of one strong one. Sweeping over sorted
    positions has no edges to fall on.
    """
    by_pair: dict[tuple[str, str], list[Fragment]] = defaultdict(list)
    for fragment in fragments:
        by_pair[(fragment.a_chrom, fragment.b_chrom)].append(fragment)

    clusters: list[Cluster] = []
    for (a_chrom, b_chrom), group in by_pair.items():
        group.sort(key=lambda f: (f.a_pos, f.b_pos))
        # Sweep the A end first, then split each run on the B end, because two
        # unrelated events can share one breakpoint region.
        run: list[Fragment] = []
        for fragment in group:
            if run and fragment.a_pos - run[-1].a_pos > join:
                clusters.extend(_split_on_b(a_chrom, b_chrom, run, join))
                run = []
            run.append(fragment)
        if run:
            clusters.extend(_split_on_b(a_chrom, b_chrom, run, join))
    return clusters


def _split_on_b(
    a_chrom: str, b_chrom: str, run: list[Fragment], join: int
) -> list[Cluster]:
    clusters: list[Cluster] = []
    for fragment in sorted(run, key=lambda f: f.b_pos):
        if clusters and fragment.b_pos - clusters[-1].b_end <= join:
            last = clusters[-1]
            last.a_start = min(last.a_start, fragment.a_pos)
            last.a_end = max(last.a_end, fragment.a_pos)
            last.b_start = min(last.b_start, fragment.b_pos)
            last.b_end = max(last.b_end, fragment.b_pos)
            last.support += 1
            last.split_support += 1 if fragment.split else 0
            last.minimum_mapq = min(last.minimum_mapq, fragment.mapq)
            continue
        clusters.append(
            Cluster(
                a_chrom=a_chrom,
                a_start=fragment.a_pos,
                a_end=fragment.a_pos,
                b_chrom=b_chrom,
                b_start=fragment.b_pos,
                b_end=fragment.b_pos,
                support=1,
                split_support=1 if fragment.split else 0,
                minimum_mapq=fragment.mapq,
            )
        )
    return clusters


def write_bedpe(
    clusters: list[Cluster],
    handle,
    minimum_support: int,
    source: str,
) -> int:
    """Write clusters as BEDPE13, strongest first, and return how many."""
    keep = [c for c in clusters if c.support >= minimum_support]
    keep.sort(key=lambda c: (-c.support, c.a_chrom, c.a_start))

    handle.write(
        f"# Discordant read evidence from {source}. Not SV calls: each row is a\n"
        "# cluster of fragments, and the fragments column is the number to weigh.\n"
    )
    for index, cluster in enumerate(keep, 1):
        # A cluster where most fragments carry a split alignment is reported as
        # a split, because that is the stronger of the two kinds of evidence.
        kind = "split" if cluster.split_support * 2 >= cluster.support else "pair"
        # BEDPE is zero-based half-open, and an interval must be non-empty.
        handle.write(
            "\t".join(
                str(value)
                for value in (
                    cluster.a_chrom,
                    cluster.a_start - 1,
                    cluster.a_end,
                    cluster.b_chrom,
                    cluster.b_start - 1,
                    cluster.b_end,
                    f"ev{index}",
                    0,
                    ".",
                    ".",
                    kind,
                    cluster.support,
                    min(cluster.minimum_mapq, 254),
                )
            )
            + "\n"
        )
    return len(keep)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bam", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--max-normal",
        type=int,
        default=1000,
        help=(
            "Longest fragment treated as normal. Take it from the library's own "
            "insert size (Picard median + 3 standard deviations), not this default."
        ),
    )
    parser.add_argument("--min-mapq", type=int, default=20)
    parser.add_argument(
        "--min-support",
        type=int,
        default=3,
        help=(
            "Smallest cluster to export. Below 3 the output is mostly background; "
            "the viewer can raise the bar further without a re-export."
        ),
    )
    parser.add_argument("--join", type=int, default=DEFAULT_JOIN)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--region", default=None, help="Limit to one region")
    args = parser.parse_args()

    fragments, scanned = read_fragments(
        args.bam, args.max_normal, args.min_mapq, args.threads, args.region
    )
    print(f"reads passing the filter : {scanned:,}", file=sys.stderr)
    print(f"distinct fragments       : {len(fragments):,}", file=sys.stderr)

    clusters = cluster_fragments(fragments, args.join)
    print(f"clusters                 : {len(clusters):,}", file=sys.stderr)

    with args.output.open("w") as handle:
        written = write_bedpe(clusters, handle, args.min_support, args.bam.name)
    print(
        f"written (support >= {args.min_support}) : {written:,} -> {args.output}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
