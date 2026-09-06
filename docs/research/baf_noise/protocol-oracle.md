# Protocol: oracle-bin comparison for regional BAF inference

Recorded **before** running the estimator, on 2026-09-06, following
[concept.md](concept.md) Section 9 and the [Fable review](review.md). This is an
exploratory falsification probe on a related pedigree, not a validation study
and not authorisation for any production change. It follows Gate C of the
judgment-gate skill: this file is committed before results exist, in a separate
commit from them.

## Governing principle

Reduce uncertainty in the inferred regional allelic pattern without altering or
concealing the raw observations. A narrower-looking plot is not success. The
model must be able to report insufficient information.

## What would kill this

If the symmetric unphased minor-fraction likelihood, computed over the exact
truth interval (the most favourable possible bin), does not separate from 0.5 in
any carrier of any known heterozygous duplication, then regional pooling does not
recover allelic imbalance at this coverage and event size. The modelled BAF layer
is then not worth building, and Section 4 of the concept is withdrawn.

## Departures from the review's recommended comparison

The review proposed running on NA12881. Input verification (below) shows NA12881
does **not** carry the only duplication locus whose truth record is not
insertion-derived. Carrier sets are therefore taken from the truth genotypes per
locus, not fixed to one sample. CNVpytor is not required for the primary
endpoint: the estimand is computed directly from the SNV VCF allele depths, which
is cheaper and removes an unverified dependency on that tool's defaults.

## Verified input assumptions

Each was measured on 2026-09-06, not assumed.

| Assumption | How verified | Result |
| --- | --- | --- |
| Matched SNV and truth VCFs exist for all six samples | file existence check | all present |
| Truth records carry per-sample GT | `bcftools query` | GT, GQ, PL, AD, PS present |
| Autosomal het DUP loci >= 8 kb | coordinate-merged inventory across all six samples | **3 distinct loci** |
| Autosomal het DEL loci >= 10 kb | same | **106 distinct loci, 7 singletons** |
| SNV VCF FILTER column usable as a quality gate | `bcftools view -H \| cut -f7` | **no**: every record is `.` |
| `"PASS" in record.filter` in the existing pilot | executed against this VCF with pysam | returns `True` for empty FILTER; the pilot's PASS rule is a no-op |

Consequences: site selection uses GT and GQ only, never FILTER. Distinct loci are
defined by merged coordinates, never by record ID: the `_1`.. `_11` ID suffixes
in this callset split one physical event across many records, and ID-based
counting inflates the locus count (189 versus the correct 106 for DEL).

## Fixed intervals

Duplication loci (all three that exist in the cohort at >= 8 kb). Oracle bin is
the truth interval itself.

| Locus | Span | Truth record origin | Carriers | Noncarriers |
| --- | ---: | --- | --- | --- |
| chr10:39366825-39377254 | 10429 | insertion-derived (`ASM_pav_...-INS-10429`) | NA12879, NA12881, NA12886 | NA12877, NA12882, NA12885 |
| chr22:15940451-15954054 | 13603 | pangenome graph (`ASM_pggb_...`) | NA12879, NA12882, NA12886 | NA12877, NA12881, NA12885 |
| chr5:141179991-141189272 | 9281 | insertion-derived (`ASM_pav_...-INS-9281`) | NA12877, NA12879, NA12881, NA12882 | NA12885, NA12886 |

Two of three are insertion-derived, so their reference span may not be the
interval whose BAF changes. chr22 is the only locus without that defect and is
designated the primary locus in advance. All three are reported regardless.

Singleton deletion loci (exactly one carrier, five noncarriers each):

| Locus | Span | Carrier |
| --- | ---: | --- |
| chr1:152583066-152615262 | 32196 | NA12881 |
| chr1:189735377-189814226 | 78849 | NA12879 |
| chr2:203316939-203327010 | 10071 | NA12885 |
| chr7:143587137-143662142 | 75005 | NA12882 |
| chr9:23362803-23377686 | 14883 | NA12881 |
| chr9:38863133-38874497 | 11364 | NA12877 |
| chr13:113672463-113721711 | 49248 | NA12881 |

These seven are fixed now. They are not independent events: all six individuals
are one pedigree (father plus five children), so shared ancestry is expected and
these must not be counted as independent replicates.

## Site selection

Biallelic A/C/G/T SNVs inside the interval, sample GT 0/1 or 1/0, GQ >= 20,
AD present with REF+ALT >= 10. No filtering on observed BAF, no minimum alternate
count, no closeness to 0.5, no FILTER condition. Counts are REF AD and ALT AD;
the denominator is their sum, excluding other bases.

Heterozygote selection comes from each sample's own caller. This is the
directional ascertainment defect of review C3 and is accepted for this probe:
it biases **against** detecting imbalance, so a positive result is conservative
and a negative result is partly attributable to it. Recorded, not corrected.

## Estimator

Symmetric unphased minor-fraction likelihood, concept.md Section 5:

L(f) proportional to product over sites i of
[ f^a_i (1-f)^r_i + f^r_i (1-f)^a_i ],  for f in (0, 0.5].

Maximise over f on a fixed grid of 0.001 steps from 0.001 to 0.500. Report the
maximiser f-hat per sample per interval.

Uncertainty by parametric bootstrap under the null: simulate a_i ~ Binomial(n_i,
0.5) at the observed depths n_i, 2000 replicates, refit f-hat on each, and take
the null distribution of f-hat. Report its mean, SD, and 1st percentile. No
chi-squared approximation is used: the split parameter is at a boundary.

## Primary endpoint, locked

**Duplication arm.** For each locus, a sample separates if its f-hat lies at
least **k = 3** null SD below 0.5, using that sample's own null distribution at
its own site depths.

- **Supported:** at least one of the three loci separates in **all** of its
  carriers, and **zero of the nine** noncarrier sample-locus tests separate.
- **Refuted:** no locus separates in any carrier. Section 4 of the concept is
  withdrawn at this coverage and event size.
- **Invalid:** any noncarrier separates. The estimator is then responding to
  something other than the truth genotype, most likely reference or mapping
  bias, and no conclusion about duplications may be drawn until that is
  explained.

k = 3 is taken from the Section 6 arithmetic, which predicts 3.6-4.9 SD for a
full three-copy duplication in the smallest bin considered. It is not chosen from
these data. **No minimum site count is applied and no locus is excluded for
sparsity**, to avoid a post-hoc threshold; the site count per locus is reported
as context.

## Secondary endpoint, locked

**Deletion / heterozygote-density arm.** For each singleton locus, the density
ratio is the carrier's qualifying het-site count divided by the mean qualifying
het-site count of the five noncarriers over the identical interval. A
cross-sample ratio is used rather than a genome-wide expected rate so that
locus-specific mappability cancels.

- **Supported:** ratio <= 0.5 in at least **6 of 7** loci, and the leave-one-out
  noncarrier control ratio (each noncarrier against the mean of the other four)
  lies within **[0.7, 1.4]** in at least **30 of 35** tests.
- A heterozygous deletion leaves one haplotype, so every retained site is
  hemizygous and the expected ratio is near 0. The 0.5 bound is deliberately
  lenient to absorb imprecise breakpoints and residual mismapping.

## Trivial baseline, run alongside

Mean |BAF - 0.5| and SD of BAF over the same sites and intervals, carriers versus
noncarriers. If this separates carriers as well as the likelihood does, the
likelihood adds nothing for this purpose and the simpler statistic wins.

## Controls that must pass before the real result is read

1. **Planted-signal recovery.** Simulate counts at the observed site depths with
   a true f of 0.5 and of 1/3. The estimator must recover each within 0.02. A
   estimator that cannot recover a planted 1/3 cannot test for one.
2. **Deliberate double counting.** Duplicate every site in an interval and refit.
   The null SD must shrink by approximately sqrt(2). This demonstrates that the
   fragment-reuse concern of review C5 is real and quantifies its direction; the
   reported SD is optimistic by an unmeasured factor because cross-SNP fragment
   sharing is not corrected without BAM access.
3. **Broken-control check.** With carrier and noncarrier labels shuffled, the
   primary endpoint must not be met. A gate that fires on shuffled labels is dead.

Cross-SNP proximity is reported per interval as the fraction of selected sites
within 500 bp of another selected site, as the observable proxy for fragment
reuse.

## What this cannot establish

Three duplication loci in one pedigree, two of them insertion-derived, cannot
validate anything. A positive result is encouraging and yields the numbers needed
to fix N, k and x for a real evaluation; it is not evidence of clinical
sensitivity, a calibrated probability, or a validated caller. Only the negative
result is decisive, and only for this coverage and event size. Nominal
percentiles are exploratory: the loci were enumerated exhaustively rather than
selected on appearance, but the pedigree structure violates independence.
