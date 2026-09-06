# Compact read connections

The Read connections panel accepts compact BEDPE files. Gens does not need BAM,
CRAM, reference FASTA, read sequences, or raw alignments for this workflow.
Prepare connections upstream from a paired-read export, split-alignment pipeline,
or SV caller. Prefilter or aggregate upstream to keep the file small. Gens does
not cluster reads or calculate support from the BEDPE score.

## Input format

Use tab-separated BEDPE with the standard columns:

```text
chrom1 start1 end1 chrom2 start2 end2 name score strand1 strand2
```

Whitespace above is illustrative; the actual file must contain tabs. Inputs can
be plain text or gzip-compressed with a `.gz` suffix. Blank lines and lines
starting with `#` are ignored. Input does not need to be sorted or indexed.

- Both intervals use zero-based, half-open BED coordinates: `0 <= start < end`.
  Use a one-base interval for a reported exact endpoint, or preserve the full
  read/uncertainty interval. Unknown coordinates (`-1`) are rejected.
- Chromosome names may use the `chr` prefix; `chrM`/`M` normalize to `MT`.
- Names must be unique. A `.` name receives a generated row identifier.
- Strand must be `+`, `-`, or `.`. It is displayed as supplied, not interpreted
  as a rearrangement type.
- The standard BEDPE `score` column is ignored. It is not assumed to represent
  MAPQ or a number of supporting reads.

Optionally append **all three** additional columns:

| Column | Meaning |
| --- | --- |
| `kind` | `split`, `pair`, `call`, or `unknown` |
| `fragments` | Reported nonnegative count of distinct supporting fragments, or `.` |
| `minimum_mapq` | Reported minimum MAPQ, or `.`; `255` means unavailable |

Without these extra columns, type and support are unspecified. Label SV-caller
output `call` unless it really represents read connections. For per-fragment
exports, the upstream pipeline can set `fragments` to `1`; for clustered output,
it must calculate distinct-fragment counts and avoid counting both mates or
supplementary records twice. Gens displays supplied counts without summing rows.
Prefer opaque connection IDs rather than read names if sharing files.

See [the synthetic example](../../tests/data/read_connections.bedpe) for exact
tab-delimited records. It is demonstration data, not observed biological evidence.

## Producing evidence for uncalled events

An SV caller's output can only show what it called. A reader looking at a
coverage dip that nothing called needs the opposite: the clusters a caller saw
and discarded for being too weak.

`utils/discordant_evidence.py` produces those from an indexed BAM or CRAM. It
keeps read pairs whose fragment is longer than the library's normal range, pairs
whose mates disagree about orientation or chromosome, and reads carrying a split
alignment. It clusters them by position and exports every cluster at or above a
support floor, including clusters no caller would report.

```bash
python utils/discordant_evidence.py \
    /path/to/sample.bam /path/to/sample.evidence.bedpe \
    --max-normal 900 --min-support 3 --threads 8
```

Set `--max-normal` from the library's own insert size rather than the default:
Picard `CollectInsertSizeMetrics` reports the median and standard deviation, and
median plus three standard deviations is a reasonable normal limit. On one 30x
WGS library with a 400 bp median and 157 bp standard deviation, that is about
900 bp, and roughly 1% of reads survive the filter.

The `fragments` column is the number a reader weighs. Measured against windows
with no known structural variant on that library, clusters at support 3 to 9
occur a few times per 100 kb and are background; clusters at support 10 or more
did not occur at all. A known 43 kb deletion scored 28. Those figures are one
library's and should be re-measured for another, but the shape of the answer —
that the count separates signal from background — is what makes the export
useful without this tool deciding which is which.

This is not a caller and the output is not a variant list. A cluster is evidence
that some fragments disagree with the reference in a consistent way; whether
that means a deletion is the reader's judgement, made alongside coverage and
BAF. Repeat-rich regions produce high-support clusters with low mapping
quality, so the `minimum_mapq` column matters as much as the count.

## Import for an existing sample

```bash
gens update read-evidence \
    --sample-id hg002 \
    --case-id giab-trio \
    --genome-build 38 \
    --file /path/to/hg002.connections.bedpe.gz \
    --output /path/to/gens-data/hg002.connections.v1.gz
```

The command validates the input, writes a BGZF-compressed file and `.tbi` index,
and registers the output on the sample. Both endpoints are indexed, so links
can be found from either chromosome. Query results deduplicate the two index
entries by connection ID. The output is Gens' internal dual-anchor format, not
a BEDPE file intended for other tools.

The server must be able to read the output and its `.tbi` index at the registered
path. Keep both files together. The original BEDPE and upstream alignment files
are not needed by the web server. The genome build is supplied by the operator;
Gens records and checks it on queries but cannot infer whether input coordinates
really belong to that build. Use a single sample's evidence per file.

For replacement, use a new output filename and rerun the command. Existing
output files are never overwritten. Invalid input leaves the previously
registered evidence intact. Unregister without deleting any files:

```bash
gens update read-evidence \
    --sample-id hg002 --case-id giab-trio --genome-build 38 --remove
```

## Interpretation limits

Connections are supplied evidence, not newly detected SVs. Read-pair intervals
do not establish exact breakpoints. Arc height and thickness are presentation
choices, not confidence scores; selected connections are thicker. Support and
MAPQ are upstream summaries. Positive support/MAPQ filters exclude records where
that field is unknown, while zero leaves unknown records visible.

The viewer queries endpoints overlapping the selected interval, not every link
whose arc spans it. It does not show read bases, CIGAR strings, soft clips, local
assembly, or re-evaluate aligner filters. Retain upstream alignments separately
for base-level confirmation. A lack of connections in a filtered export is not
evidence that no rearrangement exists. Query limits are reported as partial
results rather than a complete absence of additional evidence.