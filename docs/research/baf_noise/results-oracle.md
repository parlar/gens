# Results: oracle-bin comparison for regional BAF inference

Run on 2026-09-06 under [protocol-oracle.md](protocol-oracle.md), whose
thresholds and intervals were committed before the estimator was run
(commit `6138d7a3`, amended in `d6ebe096` after the controls, still before any
interval result was computed). Code: [`utils/baf_oracle_bins.py`](../../../utils/baf_oracle_bins.py).

**Outcome under the locked rule: INVALID.** No conclusion about duplications may
be drawn. The reason is the control set, not the estimator. Separately, the
heterozygote-density channel produced one clean textbook positive.

## Controls (all passed before results were read)

| Control | Measured | Bound | Pass |
| --- | --- | --- | --- |
| Interior recovery, planted f = 1/3 | bias 0.0001 | \|bias\| <= 0.02 | yes |
| Decision-rule calibration | FPR 1.4 % | <= 2 % | yes |
| Deliberate double counting | SD ratio 1.32 | 1.30-1.55 (sqrt 2 = 1.414) | yes |
| Label shuffle | 0 of 20,000 fire | must not fire | yes, but see below |

## Duplication arm (primary endpoint)

Oracle bin is the truth interval itself. `prox` is the fraction of selected
sites within 500 bp of another selected site, the observable proxy for
cross-SNP fragment reuse.

| Locus | Sample | Carrier | Sites | Depth | prox | f-hat | boot p | Separates |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| chr22 (pggb, primary) | NA12877 | no | 0 | – | – | – | – | – |
| | NA12879 | **yes** | 4 | 28 | 0.50 | 0.394 | 0.0475 | no |
| | NA12881 | no | 3 | 42 | 0.67 | 0.346 | **0.0050** | **yes** |
| | NA12882 | **yes** | 2 | 22 | 0.00 | 0.337 | 0.0575 | no |
| | NA12885 | no | 0 | – | – | – | – | – |
| | NA12886 | **yes** | 2 | 32 | 0.00 | 0.443 | 0.3000 | no |
| chr10 (INS-derived) | NA12877 | no | 4 | 32 | 0.00 | 0.440 | 0.2850 | no |
| | NA12879 | **yes** | 12 | 47 | 0.75 | 0.419 | 0.0105 | no |
| | NA12881 | **yes** | 14 | 48 | 0.79 | 0.369 | **0.0000** | **yes** |
| | NA12882 | no | 19 | 32 | 0.89 | 0.500 | 1.0000 | no |
| | NA12885 | no | 17 | 30 | 0.76 | 0.441 | 0.1210 | no |
| | NA12886 | **yes** | 16 | 42 | 0.94 | 0.336 | **0.0000** | **yes** |
| chr5 (INS-derived) | NA12877 | **yes** | 21 | 30 | 0.90 | 0.500 | 1.0000 | no |
| | NA12879 | **yes** | 20 | 31 | 0.90 | 0.447 | 0.1430 | no |
| | NA12881 | **yes** | 17 | 32 | 0.82 | 0.500 | 1.0000 | no |
| | NA12882 | **yes** | 19 | 32 | 0.95 | 0.500 | 1.0000 | no |
| | NA12885 | no | 22 | 30 | 0.95 | 0.500 | 1.0000 | no |
| | NA12886 | no | 26 | 30 | 0.96 | 0.455 | 0.2065 | no |

### Why the locked outcome is INVALID

One noncarrier separated: NA12881 at chr22, bootstrap p = 0.005. Under the
protocol that voids the duplication conclusion.

The measured explanation is region quality, established from an input property
rather than from the outcome:

| Region | Het sites | Median GQ | Fraction GQ >= 20 |
| --- | ---: | ---: | ---: |
| chr22 DUP locus | 51 | **6** | **0.06** |
| chr10 DUP locus | 15 | 44 | 1.00 |
| chr5 DUP locus | 24 | 48 | 0.79 |
| chr6 pilot window (reference) | 2,271 | 47 | 0.91 |

chr22:15.94 Mb sits in the acrocentric/pericentromeric zone of chr22. Only 3 of
50 heterozygous calls there survive GQ >= 20 in NA12881, and the entire
noncarrier separation rests on those 3 sites. The GQ >= 20 threshold is not the
problem: it is more permissive than the earlier pilot's GQ >= 30, and it retains
91 percent of het calls in a normal window.

**chr22 is nevertheless not excluded here.** Dropping it after seeing the result
would be exactly the retrospective-criteria error recorded as APR-001 in the
cnv_validation judgment-gate case file. Any quality gate must be declared in
advance and applied to all loci.

### The primary endpoint was also unreachable

The label-shuffle control fired 0 of 20,000 times, which looks like a pass but
is not informative: the maximum number of separating samples at any locus is 2,
while every locus has at least 3 carriers. "Separates in **all** carriers" was
therefore impossible at every locus regardless of the data. The gate was dead,
not merely unfired. A revised endpoint must use a carrier/noncarrier contrast
that is achievable at the available carrier counts.

### The one encouraging signal

At chr10, two of three carriers separate decisively (f-hat 0.369 and 0.336,
bootstrap p < 0.0001) and none of the three noncarriers do; the third carrier
NA12879 is just outside at p = 0.0105. Both separating estimates sit near the
1/3 expected for a three-copy state. This is the pattern a real duplication
would produce.

It cannot be claimed as a result. The locus is insertion-derived, so the
reference span may not be the interval whose BAF changes; `prox` is 0.75-0.94,
so between three-quarters and all sites share fragments with a neighbour, and
control 3 showed that reused sites shrink the SD, making these p-values
optimistic by an unmeasured factor; and the run is INVALID overall.

chr5, also insertion-derived, shows nothing at all: three of four carriers
return f-hat exactly 0.500. This is consistent with the datasets.md warning that
an insertion breakpoint need not be the copy-gained source interval.

## Deletion and heterozygote-density arm (secondary endpoint)

Qualifying heterozygous site counts per sample:

| Locus | Span | 12877 | 12879 | 12881 | 12882 | 12885 | 12886 | Carrier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| chr1:152583066 | 32 kb | 0 | 1 | 0 | 1 | 1 | 1 | NA12881 |
| **chr1:189735377** | **79 kb** | **86** | **0** | **66** | **66** | **66** | **67** | **NA12879** |
| chr2:203316939 | 10 kb | 4 | 4 | 0 | 4 | 0 | 0 | NA12885 |
| chr7:143587137 | 75 kb | 0 | 0 | 0 | 0 | 1 | 0 | NA12882 |
| chr9:23362803 | 15 kb | 0 | 0 | 0 | 0 | 0 | 0 | NA12881 |
| chr9:38863133 | 11 kb | 0 | 0 | 0 | 0 | 0 | 0 | NA12877 |
| chr13:113672463 | 49 kb | 0 | 0 | 1 | 0 | 0 | 0 | NA12881 |

**Locked endpoint not met:** 4 of 7 loci reached ratio <= 0.5 against a required
6, and the noncarrier leave-one-out control held in 9 of 35 against a required
30.

The failure is data availability, not method. Six of the seven loci have close
to zero callable heterozygous sites **in every sample, carrier and noncarrier
alike**. Expected density from the pilot is 0.38-0.72 het/kb, so a 32 kb region
should carry roughly 12-23; these carry 0-4. Three loci are 0 in all six
samples, where the ratio degenerates to 0/0. These are unmappable or repeat-rich
intervals that cannot test anything, and the locked statistic had no
uninformative state to put them in.

### chr1:189735377-189814226 is a textbook positive

The single locus with normal callability behaves exactly as a heterozygous
deletion should:

- Carrier NA12879: **161 variant records in the interval, all 161 homozygous**,
  zero heterozygous.
- Noncarrier NA12881, same interval: 210 records, 96 heterozygous.
- Density ratio 0.000 against a noncarrier mean of 70.2 sites.

The heterozygosity is absent, not the data. One haplotype is gone, so every
retained site is hemizygous and is called homozygous. This is the signal the
density channel exists to show, and it required no model fitting.

One clean locus in one pedigree is an existence proof that the channel responds
correctly, not an estimate of sensitivity, specificity, or minimum detectable
size.

## What this run established

1. **The duplication question cannot be answered with this cohort.** Three loci
   exist at >= 8 kb; two are insertion-derived with uncertain intervals and the
   third is in a pericentromeric region where 94 percent of heterozygous calls
   fail a routine quality threshold. This is a data limitation, and no amount of
   modelling changes it.
2. **The locked primary endpoint was unreachable** and must be redesigned before
   any re-run.
3. **The heterozygote-density channel works** where callable heterozygous sites
   exist, and needs an explicit uninformative state where they do not.
4. **Fragment reuse is severe in these intervals** (`prox` 0.75-0.96 at chr5 and
   chr10). Any confidence figure computed by treating sites as independent is
   optimistic, by a factor that still has not been measured and cannot be
   without BAM access.
5. Loci must be selected against a **pre-declared callability filter**. Choosing
   truth records by span alone selects intervals that carry no usable
   heterozygous sites in anyone.

## Provenance and limitations

Six samples of one pedigree (father plus five children); shared ancestry means
these are not independent replicates. Heterozygotes come from each sample's own
caller, the directional ascertainment defect of review C3, uncorrected here.
Bootstrap p-values assume site independence, which `prox` shows is false. The
tabix indexes for Seq25-16022 and Seq25-16030 are older than their data files;
htslib warned and parsed them, and the records returned were internally
consistent, but this was not independently audited. No BAM was read, no data
left the machine, and no production Gens behaviour was changed.

H5 remains untested. Section 4 of the concept is neither supported nor
withdrawn: the experiment that would decide it could not be run on this cohort.
