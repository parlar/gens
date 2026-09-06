# Exploratory BAF noise pilot

Recorded before measurement on 2026-09-05. The user approved a presumed-neutral,
exploratory baseline. No clinical validation, training, normalization, or changes
to production Gens data are authorized by this pilot. This is not a confirmatory
study, even though its rules are fixed in advance. No git commit was requested;
each run records configuration, protocol and script hashes instead.

## Governing principle and failure conditions

Reduce avoidable measurement error without suppressing true allelic imbalance.
Narrower distributions alone cannot establish improvement. A denominator
explanation fails locally if AD sums match DP and the two fractions coincide.
A quality-filter explanation is not persuasive if narrowing disappears after
matching sites/depth, or if loss of genomic representation dominates. No cleanup
method will be called validated without independent samples and positive events.

## Prior evidence and assumptions

The supplied coordinate-sorted, indexed BAM has GRCh38-compatible chromosome
lengths and sample Seq25-16025. The on-disk sample map identifies NA12881. The
matching SNV VCF declares GT, AD, DP and GQ. Its counts are not independent truth.
The staged NA12878 high-confidence small-variant truth is not this sample's truth.
Known/called SV VCFs are available for NA12881 and Seq25-16025 respectively.
The existing Picard report reports mean filtered coverage 28.897216.

The cnv_validation judgment case file warns against interpreting a region mask
as an event-level exclusion and against selecting validation criteria after
seeing results. This pilot checks each selected SNP against actual masked spans.

Targeted sources checked in the preceding discussion, not a systematic review:

- GATK DepthPerAlleleBySample documents that informative AD sums can differ from
  sample DP: https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/walkers/annotator/DepthPerAlleleBySample.java
- GATK CollectAllelicCounts counts alleles at specified sites with quality
  filters; its nonreference count is not necessarily the specified ALT allele:
  https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/CollectAllelicCounts.java
- MoChA supports phased WGS AD and overdispersion modeling; it is a relevant
  later comparator, not a denoising result established here:
  https://github.com/freeseek/mocha

## Fixed selection

All paths and numeric settings are in pilot.json. Window coordinates are
one-based inclusive. They were chosen before inspecting their allele fractions.
Do not substitute other windows if these prove sparse or difficult.

Mask every record from both specified SV files, regardless of FILTER or genotype.
Use the interval from record.start to the maximum of record.stop and
record.start + abs(SVLEN), then expand by sv_padding. Merge overlapping intervals.
This intentionally conservative treatment can over-mask insertions. It does not
establish the absence of unknown SVs, copy-neutral LOH, dispersed-duplication
source events, repeats or mapping artifacts. All retained regions are only
presumed neutral. No independent callable or mappability mask is assumed.

Select PASS, biallelic A/C/G/T SNPs with GT 0/1 or 1/0, sufficient GQ, nonnegative
AD, positive DP and sufficient REF+ALT AD depth. Do not filter on observed BAF,
minimum alternate count, or similarity to 0.5. Select at most the configured
number of SNPs per window by ascending SHA-256 of chrom:pos:ref:alt, then sort by
coordinate. Report every selection/exclusion count. Genotype/GQ ascertainment
from this same sample is a limitation; no independent heterozygosity is claimed.

## Fixed measurements

For each selected site retain VCF AD_ref, AD_alt, DP, GQ; compute AD_alt/DP and
AD_alt/(AD_ref+AD_alt). Join the existing Gens d-resolution value at the BED end
coordinate for one-base sites. Preserve absent values as missing, not zero.

Use pysam pileups with no automatic overlap or BAQ adjustments, with a fixed
high depth cap. Exclude unmapped, secondary, supplementary, QC-failed and duplicate
records, and missing read names. Do not require the proper-pair flag. Within a
site count each (read-group, read-name) once. For overlapping observations choose
the higher-base-quality observation; tied conflicting bases are excluded. Apply
each fixed MAPQ/base-quality threshold before resolving overlaps. MAPQ 255 is
unknown and excluded. Count REF, the specified ALT, and other bases separately;
only REF+ALT enter the denominator. Also retain read-level counts before overlap
deduplication and allele-by-strand counts for diagnostics. Record capped sites
and exclude them from numeric summaries; never treat truncation as complete data.

Methods: current-formula VCF BAF, AD-sum VCF BAF, stored Gens BAF, and the two
fragment-count settings. Keep raw counts and per-site metrics for all methods.
Restrict BAM summaries to sufficient informative fragment depth. Report results
on each method's available sites and on the intersection with both BAM settings.

## Analysis and stopping

Report overall and per-window site counts, median informative depth, mean BAF,
bias from 0.5, SD, RMSE from 0.5, central quantiles, and tails outside [0.3,0.7].
For consistent count denominators report expected binomial SD
sqrt(mean(0.25/n)) and a descriptive variance ratio var(BAF)/mean(0.25/n).
This ratio is not a test of biological neutrality; linked sites, selected
genotypes, and unknown events can affect it. Do not attach that binomial ratio
to AD_alt/DP or stored fractions whose effective denominator is unknown.

Report AD-sum versus DP disagreements and paired fraction differences. At Gens
overlap sites compare stored values with both VCF formulas without assuming the
stored file came from this exact VCF or code version. Slice BAM observations by
depth (10-19, 20-39, 40-79, 80+). Use window summaries for spatial consistency;
do not treat correlated SNPs as independent replicates or claim formal significance.

Before real data: unit tests must reject out-of-mask selections and incorrect
overlap counting, preserve unbalanced synthetic allele counts, and pass an
end-to-end synthetic indexed-BAM/VCF/BAF control. Run a deterministic small
subset as a technical smoke test, then the fixed full pilot with no tuning.
Stop after the fixed comparisons and report neutral or negative results too.
No smoothing, model fitting, normal-panel correction, phase inference, or CNV
calling is included. A useful next step must be proposed, not silently executed.

## Artifacts and privacy

Input files are read-only. Analysis code and tests live in utils and tests.
Per-site results, plots, run manifests and count summaries are written to the
ignored volumes/gens/data/baf_noise_pilot directory. A concise aggregate report
is stored beside this protocol. No read sequences/names are exported and no
genomic data is sent to external services. The manifest records file sizes,
modification times and index hashes rather than re-reading the entire BAM for
a full-file checksum; this is not full immutable input provenance.