# Exploratory BAF noise pilot: Seq25-16025 / NA12881

## Interpretation

In the retained windows, BAF spread is close to the ideal read-count sampling
variance. This pilot does not support AD/DP mismatch as a major cause of the
diffuse bands. Recounting independent fragments at MAPQ/base quality 20 gives a
small descriptive reduction in SD; increasing both thresholds to 30 reduces
informative depth and widens the distribution. These observations do not validate
a correction, establish a universal noise floor, or prove the regions are neutral.

No smoothing, normalization, calling, or changes to production Gens BAF processing
were made. The existing data and the separate read-connections work were not changed.

## Design and retained data

The user approved an exploratory presumed-neutral baseline. See the
[recorded protocol](protocol.md), [configuration](pilot.json), and
[chronological log](research-log.md). SNP selection did not use BAF proximity to
0.5. It did use heterozygous genotype calls and GQ from this sample's own VCF,
which creates ascertainment bias and can suppress distribution tails.

| Planned window, one-based inclusive | Selected SNPs | Mask outcome |
| --- | ---: | --- |
| chr1:20,000,001-22,000,000 | 0 | Large reported SVs cover the entire window |
| chr6:20,000,001-22,000,000 | 1,447 | Sites overlapping padded SV spans excluded |
| chr12:20,000,001-22,000,000 | 0 | Large reported SVs cover the entire window |
| chr20:20,000,001-22,000,000 | 766 | Sites overlapping padded SV spans excluded |

The full pilot selected 2,213 SNPs; 2,212 have sufficient informative depth under
both BAM counting settings. No selected pileup hit the depth cap. The original
windows were not replaced after inspecting the masks. Large reported calls may
themselves be artifacts; the conservative exclusion is not evidence they are real.

## Paired comparison

The following rows use the same 2,212 sites. Q20/Q30 mean that both mapping and
base quality meet the stated threshold. BAM counts resolve overlapping mates
to one fragment, exclude tied conflicting bases, and use only the specified
REF and ALT alleles in the denominator.

| Method | Mean BAF | BAF SD | Median informative depth | Ideal binomial SD | Variance ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| VCF ALT / DP | 0.50338 | 0.09106 | Not assigned | Not assigned | Not assigned |
| VCF ALT / (REF + ALT AD) | 0.50368 | 0.09110 | 32 | 0.09099 | 1.0023 |
| BAM fragments Q20 | 0.50235 | 0.08940 | 30 | 0.09300 | 0.9241 |
| BAM fragments Q30 | 0.50215 | 0.09219 | 29 | 0.09513 | 0.9393 |

The ideal SD is sqrt(mean(0.25 / informative_depth)); the variance ratio is
observed population variance divided by mean(0.25 / informative_depth). These
are descriptive reference calculations, not goodness-of-fit tests. In particular,
ratios below one can reflect genotype/quality ascertainment, not superior recovery
of true allele frequencies. We did not depth-match fragments by downsampling,
so differences between filters are not isolated causal effects of read quality.

Both retained windows show the same qualitative pattern on their available sites:

| Window | VCF AD-sum SD | BAM Q20 SD | BAM Q30 SD |
| --- | ---: | ---: | ---: |
| chr6 | 0.09117 | 0.08969 | 0.09232 |
| chr20 | 0.09092 | 0.08881 | 0.09195 |

The Q30 chromosome 6 summary omits one low-depth site. There are no independent
sample replicates and no formal significance or confidence interval claims.

## Denominator and stored-data audit

- AD_ref + AD_alt differed from DP at 33/2,213 sites (1.49%); none had AD sum above DP.
- Mean ALT/DP minus ALT/AD-sum was -0.000298. The maximum absolute difference was
  0.05455; two sites differed by more than 0.05. Changing the denominator is
  important semantically but did not narrow the population distribution here.
- Stored full-resolution Gens BAF was available at 2,052 selected sites. Every
  one matched VCF ALT/DP within 1e-6; 2,023 matched the AD-sum fraction.
- One stored locus had identical duplicate entries. The initial full run stopped
  on that ambiguity. The recorded amendment collapses identical duplicates and
  marks conflicting duplicates as missing without changing SNP selection.
- The direct comparison of stored Gens and VCF values is on overlapping sites;
  missing Gens sites were not treated as zero or interpolated.

## Fragment counting

At Q20, 1,723/2,213 sites had repeated qualifying observations within a fragment.
Deduplication changed BAF by a mean absolute 0.01381 and a maximum 0.08929 relative
to counting each qualifying read observation. One tied base conflict was excluded.
At Q30, the corresponding mean absolute difference was 0.01382 across 2,212 sites.
These comparisons use the same BAM observations before versus after overlap
resolution; they do not establish the exact fragment handling of the VCF caller.

Depth-stratified Q20 SD decreased from 0.10828 at depth 10-19 to 0.08950 at 20-39
and 0.07413 at 40-79. The ideal binomial reference also decreases with depth.
There were no eligible sites at depth 80 or above. All depth strata and retained
counts are in the machine-readable summary; Q30 was not selected as a better filter.

## What this does and does not justify

This pilot favors limited molecule counts over gross denominator error as the
main explanation in these selected regions. It does not justify aggressive
filtering or pulling heterozygous observations toward 0.5 to imitate array bands.

Before developing a denoiser, the useful next validation would include additional
individuals, independently supported copy-neutral intervals/heterozygous sites,
and known CNV or mosaic-positive regions. Raw points should remain available.
Phase-aware regional evidence is a candidate for future study, not an improvement
demonstrated by this pilot. Ordinary averaging of unphased BAF can hide duplication
bands by averaging opposite allele imbalances back toward 0.5.

Limitations include one individual, only two retained windows, conservative
masking, same-sample genotype ascertainment, no independent repeat/mappability
mask, no positive-CNV sensitivity test, and no normalization model or holdout set.
No claim of clinical validity or array-equivalent resolution follows.

## Artifacts and reproduction

- [Diagnostic plots](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/diagnostics.png)
- [All summaries and selection accounting](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/summary.json)
- [Per-site counts](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/sites.tsv.gz)
- [Run manifest](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/manifest.json)
- [Offline utility](../../../utils/baf_noise_pilot.py)
- [Counting and end-to-end tests](../../../tests/util_scripts/test_baf_noise_pilot.py)

Executed from the Gens repository root:

```bash
/tmp/gens-review-py312/bin/python utils/baf_noise_pilot.py \
  --config docs/research/baf_noise/pilot.json \
  --output volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2 \
  --plots
```

For another run, choose a new output directory; existing results are not overwritten.
The utility requires pysam; `--plots` additionally requires matplotlib. The run used
Python 3.12.13 and pysam from the isolated review environment; exact counting-tool
versions are recorded in the manifest. The fixed run completed on 2026-09-05.

Input sizes, modification times and index hashes were checked unchanged after
the run. Protocol, configuration and script hashes matched the recorded manifest.
The entire BAM was not checksummed, and no immutable-data guarantee is claimed.
Generated per-site data remain in the ignored local data directory. No genomic
data were uploaded. No git commit was made.