# Result: a cross-sample reference does not make the density alarm valid

Run 2026-09-06 in response to the outside review of the shipped heterozygote
density track. Rules were fixed in the script header before results were read.
All six pedigree samples, their Gens BAF tracks read directly, 72 random windows
across chromosomes 1, 2, 5, 7, 11 and 17, plus the chr1 truth deletion.

**Outcome: refuted.** Replacing the within-view median with a per-bin
cross-sample reference does not fix the false-alarm rate, and no calibrated
threshold on counts alone exists at any bin size tested.

## What was compared

For each 20 kb bin on the absolute grid, heterozygous-band sites (BAF strictly
inside 0.15-0.85) were counted per sample. The reference for a sample is the
leave-one-out median of the other five, so a carrier never contributes to its
own reference. Three decision rules were measured on the same bins:

- `current` Poisson lower tail against the median of the current window, which
  is what the track ships today
- `panel` the same Poisson tail against the cross-sample reference
- `empirical` observed/reference below the 0.1th percentile of the pooled
  normal-versus-peers ratio distribution, a non-parametric rule that makes no
  distributional assumption

## Alarm rate on ordinary bins, by bin size

| Bin | current | panel | empirical |
| ---: | ---: | ---: | ---: |
| 20 kb | 17.1% | **20.8%** | 0.00% |
| 50 kb | 22.4% | **22.7%** | 0.00% |
| 100 kb | 24.2% | **21.8%** | 0.00% |
| 200 kb | 27.0% | **22.6%** | 0.00% |

Two things kill the approach.

**The Poisson gets worse with more data, not better.** Widening the bin raises
the expected count, which makes the Poisson more confident, so it fires more
often rather than less. That is the signature of a variance model that is simply
wrong for these counts, not of a threshold that needs adjusting. A better
reference does not rescue it: the panel rule is no better than the shipped one
at any bin size, and worse at 20 kb.

**No non-parametric threshold exists.** The pooled normal-versus-peers ratio
distribution has a 0.1th percentile of **0.000 at every bin size tested**, and a
1st percentile of 0.000 up to 100 kb. More than one normal sample in a thousand
has zero heterozygous sites in a bin where its peers have five or more. A
threshold low enough to be calibrated is therefore below zero, which is why the
empirical rule fires on nothing at all, including on the truth deletion.

## The reference itself works

At 50 kb over the chr1 truth deletion, with the reference at 18 sites:

| Sample | Observed | Reference | Carrier |
| --- | ---: | ---: | --- |
| NA12879 | **3** | 18 | **yes** |
| NA12877 | 14 | 18 | no |
| NA12881 | 18 | 18 | no |
| NA12882 | 19 | 18 | no |
| NA12885 | 18 | 18 | no |
| NA12886 | 18 | 18 | no |

The separation is clean and the ordering is correct. At 20 kb the reference also
correctly reports that two of the deletion's three bins are uncallable in every
sample, reference 0 and 1, which the within-view median silently treated as
depleted signal. The cross-sample reference is a real improvement over the view
median as a **descriptive** quantity. What it does not support is a calibrated
probability.

## Why counts alone cannot separate these causes

A bin with no heterozygous sites is produced by a heterozygous deletion, by a
run of homozygosity, by a sample-specific coverage dropout, and by ordinary
mapping difficulty. These are indistinguishable from the count alone, and two of
them are real biology rather than error. Some of the alarms tabulated above are
therefore not false, merely uninterpretable, which is worse: the display cannot
say which.

The random windows were not screened against an event list, so this measures
alert prevalence rather than a demonstrated false-positive rate. That does not
change the conclusion: the rate is two orders of magnitude above nominal, and
the empirical rule's inability to fire is independent of whether any particular
window carries an event.

## What follows

The separable evidence is coverage, which falls for a deletion and does not for
a run of homozygosity. Combining allele and coverage evidence is listed in the
concept document under later options and explicitly gated behind separate
validation. It is not a display change.

For the display now, the supported position is the descriptive one: report the
ratio against a cross-sample reference, mark bins whose reference is too small
to interpret, and make no significance claim.
