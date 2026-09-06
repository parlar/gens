# Clearer BAF visualization in Gens

**Status:** concept for independent review, not an implementation specification
or a validated method. **Date:** 2026-09-05, revised 2026-09-06 after the
[Fable 5.1 review](review.md). **Intended reviewer:** Fable 5.1. Sections 2 and
4–10 were revised in response to that review; the review's concern labels
(C1–C6) are cited where a change was made.
Sections 5.1, 13 and 14 were added subsequently to record a proposed histogram
band-splitting test, Scout panel-guided gene navigation, and additional
interpretation and review workflows. These additions were not evaluated in that
review; the proposed extensions have not been implemented or validated.

## 1. Review request

Please critically evaluate this concept, especially whether the proposed model
can make true allelic-imbalance patterns easier to interpret without creating
false bands or hiding real events. Recommend the smallest useful first comparison.
Do not assume that a method described below has been implemented or validated.

Review the statistical assumptions, input requirements, visualization semantics,
and evaluation design. Separate defects from optional improvements. Cite section
numbers, explain a concrete failure scenario for each major concern, and suggest
the least complicated way to test or address it. If a claim requires unavailable
data or source code, say **not verifiable from this document** rather than guess.

## 2. User goal

Gens displays whole-genome sequencing (WGS) B-allele frequency (BAF), coverage,
and genomic annotations for manual copy-number interpretation. Individual WGS
BAF points often form diffuse bands compared with SNP-array data.

**The immediate goal is a cleaner, more informative BAF view in Gens.** A user
should more easily recognize balanced regions, split bands associated with
duplications, and other allelic imbalance, while retaining access to the evidence.
Improved automated calling is a possible later goal, not the first deliverable.

The governing principle is: **reduce uncertainty in the inferred regional pattern
without altering or concealing the original observations.** Visual tightness alone
is not success. A model must be allowed to report insufficient information.

**Open scope decision:** whether sub-clonal (mosaic) events are in scope for the
first comparison. This decides the smallest useful bin (Section 6) and is not
settled by this document.

Companion product concepts in Sections 13 and 14 address navigating relevant
genes, assessing evidence and preserving review work. They do not expand the
BAF experiment or depend on implementing a new statistical caller.

## 3. What the exploratory pilot established

An offline pilot examined Seq25-16025, mapped to the public reference individual
NA12881, with roughly 29-fold filtered WGS coverage. Fixed SNP-selection rules
were recorded before measurement. Heterozygous, high-quality biallelic SNPs were
selected without filtering on closeness to BAF 0.5. Sites overlapping buffered
known/called SV spans were excluded, leaving a **presumed-neutral**, not proven
neutral, baseline.

Four fixed autosomal windows were considered. Conservative SV masking eliminated
two completely; 2,213 SNPs remained in the chromosome 6 and 20 windows. On the
same 2,212 SNPs with adequate counts under both BAM quality settings:

| Measurement | BAF SD | Median informative depth | Ideal binomial SD |
| --- | ---: | ---: | ---: |
| VCF ALT / DP | 0.09106 | Not assigned | Not assigned |
| VCF ALT / (REF AD + ALT AD) | 0.09110 | 32 | 0.09099 |
| BAM fragment counts, MAPQ/base quality at least 20 | 0.08940 | 30 | 0.09300 |
| BAM fragment counts, MAPQ/base quality at least 30 | 0.09219 | 29 | 0.09513 |

Duplicate-marked reads were excluded. Overlapping mates were counted once per
fragment at each SNP. The effective count denominator was REF plus the specified
ALT, excluding other bases. AD sum differed from DP at 33 of 2,213 sites. All
2,052 sites with an unambiguous stored Gens value matched VCF ALT/DP within 1e-6.

**Interpretation:** stronger filtering and changing the denominator did not yield
a large cleanup in this subset. The observed spread is compatible in magnitude
with limited molecule counts. This motivates testing regional inference, but does
not establish an irreducible noise floor or exclude site-specific mapping bias.

**Limitations:** one individual, two retained windows, no positive-event test,
and heterozygosity/GQ selected from the same sample's VCF. Such ascertainment can
remove tails. No correction model, phase-aware aggregation, or panel-of-normals
calibration was tested. SDs are descriptive; no clinical sensitivity, significance,
or independently calibrated uncertainty claim follows.

## 4. Proposed user experience

Add a separate BAF inference layer with three viewing modes:

- **Raw:** unchanged individual-SNP fractions.
- **Modeled:** regional allele-balance likelihoods or estimated bands, explicitly
  distinguished from measured SNP values.
- **Both:** subdued raw points with the inferred regional pattern alongside or
  overlaid, aligned to the same genomic coordinates.

The first candidate presentation is a position-by-allele-fraction likelihood
heatmap. A narrow likelihood could support a band summary; weak, broad, multimodal,
or unavailable evidence must remain visibly uncertain. Do not turn every region's
maximum-likelihood point into a confident line.

The modeled layer has a second channel: **heterozygote density**, the number of
observed heterozygous sites per bin divided by the number expected from a fixed
site list and the sample's genome-wide heterozygous rate (review C1). A
deletion or copy-neutral LOH removes heterozygosity rather than shifting a band,
so a likelihood conditioned on heterozygous sites alone cannot show the most
common clinically relevant CNV class. The density ratio is a count with a
Poisson-style uncertainty and needs no model fitting.

The existing BAF histogram uses full-resolution (d) fractions over the current
interval and provides a place to inspect the modeled distribution. A regional
count likelihood is a separate inference calculation, not a histogram weighted
by read counts; it requires the additional inputs in Section 7. The optional
band-splitting test in Section 5.1 could accompany this view. Display the
genome-wide modal minor fraction as a
baseline, so that contamination, which appears as a global shift, is not read as
one very large event.

Expose informative-site counts, effective fragment counts where available,
bin/segment boundaries, model version, and missing/excluded-data status on
inspection. An unphased estimate may be displayed at f and 1-f, but these are
not assigned maternal/paternal haplotypes or corrected values for particular SNPs.

A normalized likelihood heatmap is **not automatically a posterior probability**.
Per-bin color normalization can make weak evidence look strong, so evidence
strength and width need explicit presentation. Use a grayscale/neutral missing
state rather than painting absent observations as balanced, and distinguish two
kinds of missing: no sites in the list (grey) versus sites present but not
heterozygous (a low density ratio, which is evidence).

## 5. Statistical concept

For a truly balanced heterozygous site with n independent informative fragments,
the ideal sampling SD of its observed fraction is sqrt(0.25/n). Real data can
have reference bias, overdispersion, genotype errors, and correlated observations.
Software cannot create missing molecules; it can combine relevant evidence under
assumptions and represent the remaining uncertainty.

For CNV inspection, the initial estimand is **regional minor-haplotype fraction**,
not a precise independent allele fraction at every SNP. Start by evaluating an
existing unphased count-likelihood method, such as CNVpytor, before inventing a
new estimator or introducing phasing requirements.

A schematic bias-free likelihood for minor fraction f is:

$$
L(f) \propto \prod_i \left[f^{a_i}(1-f)^{r_i} + f^{r_i}(1-f)^{a_i}\right],
\qquad 0 \leq f \leq \frac12.
$$

Here a_i and r_i are alternate and reference counts at heterozygous SNP i.
The two terms allow either allele to belong to the minor haplotype. This preserves
evidence for opposing bands that ordinary averaging of unphased BAF would cancel.
For example, the ideal three-copy AAB/ABB pattern has fractions 1/3 and 2/3;
their mean alone is indistinguishable from balanced BAF.

This equation is explanatory, **not a complete production model**. Its product
assumes appropriate independence and a common regional imbalance. The same DNA
fragment can overlap multiple SNPs, so per-SNP mate deduplication is not sufficient
for independent regional evidence. In the pilot windows, 53 percent of selected
chromosome 6 sites and 42 percent of chromosome 20 sites have another selected
heterozygote within 500 bp (review C5), so a fragment frequently carries two
sites. The effective independent count is therefore below the sum of per-site
depths by a factor that has not been measured. It can be measured with the
pilot's BAM, site list and counting code; until then any pooled SD is optimistic.

Genotype ascertainment has a direction (review C3). Heterozygotes selected from
the sample's own diploid caller are removed in proportion to how strong the
imbalance is: at LOH, high cell-fraction mosaic loss, or high-level
amplification, the caller stops emitting 0/1 exactly where the signal is
largest. A germline three-copy duplication (about 10 of 30 reads alternate) is
usually still called 0/1, so the immediate goal is less affected than the later
ones. The intended remedy is to count REF and ALT at a **fixed external list of
common SNP sites** regardless of the sample's genotype call, and to decide
heterozygosity from the counts with an outlier-tolerant model, as GATK
ModelSegments does with a CollectAllelicCounts sites list. The same list
supplies the expected count for the density channel. If the first comparison
keeps caller-based selection for speed, the density channel makes the removal
visible. Bias and contamination must not be silently absorbed into a claim of
precisely estimated f.

Evaluate the pinned implementation's actual model and defaults. CNVpytor has an
optional count-changing noise-reduction path; that is a separate intervention,
not interchangeable with combining unchanged count likelihoods. GATK ModelSegments
is a second existing candidate, with regional Bayesian estimates, reference-bias
terms and outlier handling.

### 5.1. Optional histogram band-splitting test

**Purpose:** assess evidence for two underlying allele fractions, not merely two
visible histogram peaks. Overlapping bands can lack separate observed peaks;
conversely, artifacts or mixed genomic states can produce peaks without a
duplication. The governing principle remains evidence with honest uncertainty,
not a cleaner-looking plot or a duplication diagnosis.

**Candidate statistic:** a count-based likelihood-ratio comparison. For eligible
heterozygous SNPs, let $a_i$ be the alternate count and $n_i = a_i + r_i$ the
informative count. The simplest bias-free starting models are:

$$
H_0: a_i \sim \operatorname{Binomial}(n_i, 0.5)
$$

$$
H_1: a_i \sim \tfrac12\operatorname{Binomial}(n_i, f)
             + \tfrac12\operatorname{Binomial}(n_i, 1-f),
\qquad 0 < f < 0.5.
$$

The alternative is the symmetric unphased likelihood above. Its equal mixture
weights are an allele-orientation assumption, not a requirement that the observed
bands contain identical numbers of SNPs. Compare the maximized log likelihoods,
allowing the balanced limit when fitting the alternative. This tests the specified
balanced model against a splitting model; rejecting it does not establish that
splitting is the only explanation.

**Calibration:** the candidate is a parametric-bootstrap likelihood-ratio test.
Fit the null, simulate under it at the observed site depths, refit both models
to each simulation, and compare the observed likelihood improvement with the
simulated null distribution. Do not use a routine chi-squared likelihood-ratio
approximation: the mixture components coincide under the null and the split
parameter is at a boundary. Nor does the SD arithmetic in Section 6 calibrate
this unphased mixture test.

Real-data calibration must address reference bias, genotype ascertainment and
cross-SNP fragment reuse, not just preserve marginal depths. The null simulations
must represent the site-selection process and relevant dependence, or the
preprocessing must demonstrably remove those effects. A beta-binomial model is a
candidate if controls show extra dispersion. Learn noise/bias terms from
defensible controls and propagate their uncertainty; freely fitting a flexible
noise model inside each target interval could absorb genuine splitting. These
input assumptions and the bootstrap's calibration are **unverified** here.

**Current input limitation:** the histogram API returns positions and fractions,
without allele counts, genotypes or quality fields. The histogram helper does
not select heterozygotes and includes endpoint fractions by default. Its current
inputs therefore cannot support this count-aware test. Use the compact counts
from Section 7 and predeclared site-eligibility rules. Homozygous sites must be
handled separately or within an explicit genotype model, not mistaken for split
heterozygous bands. Do not select heterozygotes simply by narrowing displayed BAF.

The test must operate on unbinned counts. Changing display bin counts or BAF-axis
limits must not change its result. Record the tested interval and analysis
filters separately from display settings; disclose any change to the tested data.

**Alternatives considered:**

| Statistic | Potential role | Limitation for WGS BAF |
| --- | --- | --- |
| Hartigan's dip test | Exploratory test against unimodality | Does not use depth or establish exactly two bands; discrete fractions, ties and dependence complicate standard calibration. |
| Silverman's critical-bandwidth test | Exploratory assessment of multiple density peaks | Depends on smoothing and needs calibration appropriate to discrete, depth-dependent fractions. |
| One versus two Gaussian mixtures, compared with BIC | Descriptive model comparison | Ignores bounded fractions and differing site depths; BIC is not a calibrated p-value. |
| Binomial or beta-binomial mixture with bootstrap | Preferred candidate for count-aware evidence | Requires additional inputs and validated noise, selection and dependence assumptions. |

A mean-based t-test or pooling alternate counts across unphased loci is not a
test for symmetric splitting: opposing bands can retain a balanced overall mean.
A normality test is also not specific to band splitting.

**Proposed panel output:** estimated band positions $f$ and $1-f$, separation
$1-2f$ with appropriately calibrated uncertainty, contributing SNPs and depth,
independent-fragment information where available, and observed versus fitted
distributions. Show significance only after calibration, together with model and
filter provenance. Provide explicit unavailable/insufficient-information states;
failure to reject balance does not establish a normal region. Retain the raw
histogram and the heterozygote-density channel.

**Validation before implementation:** first compare the simplest count model
with the raw histogram on fixed balanced controls and independently supported
imbalanced intervals. Calibration failure in balanced controls, artificial
confidence from reused fragments, or failure to preserve supported imbalance
would require revision or rejection. Include simulated null/positive controls
and a deliberately double-counted-fragment case; these checks are proposed,
**not run**, and cannot replace biological controls. Lock the controls, metrics,
bootstrap settings and decision thresholds before examining results. No minimum
SNP count, significance cutoff or detection performance is established here.

Interactive selection of regions or repeated testing makes nominal local p-values
exploratory. A later genome-wide scan or caller requires a separate strategy for
selection and multiple testing. Coverage, mapping quality and breakpoint evidence
remain necessary context; a significant result is not a duplication call.

This is an optional extension with its own calibration plan, not an expansion of
Section 9's smallest first comparison. No test has been run or added to Gens.

## 6. Resolution and information limits

Larger bins pool more information but can blur short events or cross breakpoints.
Smaller bins may remain uncertain. The appropriate trade-off is an evaluation
question, not settled by the desired appearance of the display.

The scale of the trade-off follows from the pilot (review C2). With heterozygous
density 0.38–0.72 per kb after masking, median informative depth 30, and
binomial sampling of independent fragments (the pilot's variance ratio was
1.00), the pooled minor-fraction estimate has:

| Bin | Hets | SD of f | Full 3-copy dup, f = 1/3 | 20 percent mosaic gain, f ≈ 0.45 |
| ---: | ---: | ---: | ---: | ---: |
| 10 kb | 4–7 | 0.034–0.047 | 3.6–4.9 SD | 1.1–1.5 SD |
| 100 kb | 38–72 | 0.011–0.015 | 11.3–15.5 SD | 3.4–4.6 SD |
| 1 Mb | 380–720 | 0.003–0.005 | 36–49 SD | 10.7–14.7 SD |

This is arithmetic under stated assumptions, ignores fragment reuse (Section 5),
and is not a performance claim. It says that pooling is not the uncertain part;
the uncertain part is how short an event can be resolved. A 10 kb full
duplication inside a 100 kb bin shifts the pooled fraction by about 0.017,
which is 1.1–1.5 SD and invisible.

For the first comparison, prefer fixed, explicitly defined genomic bins at
predeclared scales, aligned with the resolution levels Gens already defines
(`ZoomLevel` o/a/b/c/d) rather than a second scheme. Keep those boundaries
stable while panning. Do not silently refit a region whenever the viewport
moves, or let zoom changes imply a biological change. Adaptive bins or
segmentation are later alternatives if their benefit justifies the complexity.

Because the available positive controls are short (Section 8), the evaluation
also computes the likelihood over each known event interval, called **oracle
bins** (review C2). Oracle bins are the upper bound on what the model can do
with these data; fixed bins are the realistic display. A negative oracle-bin
result cannot be rescued by binning. A positive one tells which fixed scale is
honest. Oracle bins are an evaluation device, not a display mode.

Windows crossing boundaries mix copy-number states; an intermediate estimate
could otherwise be mistaken for mosaicism. Empty/sparse bins and low-heterozygosity
regions require explicit treatment. A deletion or copy-neutral LOH may remove
heterozygosity rather than produce a tidy shifted heterozygous band. Lack of usable
heterozygotes must not be interpreted as evidence of a normal region; it is
what the density channel (Section 4) is for. Male chrX outside the
pseudoautosomal regions and chrY have an expected heterozygote count of zero
and must not be reported as deleted; the expected count needs an explicit
per-chromosome, per-sex rule.

## 7. Inputs and architecture

Process sequencing data offline. The Gens web server should not require BAM/CRAM
access for this feature. Keep either compact informative allele counts or
precomputed regional summaries, with sufficient provenance to reproduce them.

Candidate count-level content includes chromosome, position, REF/ALT identities,
counts, genotype/quality information, masks and optional phase-set/haplotype data.
The fixed common-SNP site list (Section 5) is itself an input with a version,
and the expected-heterozygote count per bin derives from it. The exact schema
is not decided. Independent-fragment handling must happen upstream
or be represented well enough to prevent regional double-counting. Counts alone
cannot reconstruct cross-SNP fragment identity after it has been discarded.

Candidate regional output includes interval, likelihood representation or estimate,
appropriate uncertainty information, contributing counts, exclusions and model
configuration. It must distinguish an uninformative result from a balanced result.

Store genome build, sample identity, preprocessing thresholds, source provenance,
and model version. Keep modeled data separate from existing raw BAF files. This
concept does not require replacing the existing histogram or changing raw data.

## 8. Validation resources and unresolved suitability

The neighboring cnv_validation repository has matching indexed BAM/SNV/BAF inputs
and per-sample SV truth for NA12877, NA12879, NA12881, NA12882, NA12885 and NA12886.
These individuals form one pedigree: a father and five children. They can support
exploratory segregation and consistency checks, not family-independent training
and validation of a learned bias correction.

The pedigree also supplies **independent phase** (review C4). The father has a
BAM in the cohort, and the mother's (NA12878) high-confidence small-variant
truth is staged locally, so each child can be trio-phased by Mendelian
transmission without a reference panel. The prepared truth SVs are phased
(`0|1` versus `1|0`), so a duplication's haplotype is known. This gives an
upper bound on what phase-aware inference could add, on the same samples and
events as the unphased comparison. It does not give production phasing.
Whether the staged NA12878 file is usable for trio phasing has not been checked.

The matched SV source is Platinum Pedigree/CEPH-1463 with local duplication-aware
processing, not an interchangeable GIAB benchmark. Some duplications originated
as insertion records. The duplicated source interval, genotype, dosage, and SNP
support must be verified before a record becomes a BAF positive control. Most
candidate duplication spans are short. Truth-region applicability is a separate
question from whether a positive event is listed.

Deletions are the larger positive-control set and were not previously counted
(review C1). In the NA12881 prepared truth, autosomal, without FILTER
restriction, span = max(END − POS, |SVLEN|):

| Type, GT | Records | ≥ 10 kb | ≥ 50 kb | Max span, bp |
| --- | ---: | ---: | ---: | ---: |
| DEL heterozygous | 4,180 | 100 | 4 | 90,483 |
| DEL homozygous | 2,286 | 45 | 21 | 96,355 |
| DUP heterozygous | 727 | 1 | 0 | 10,429 |

These are record counts for one individual, not independent events or
SNP-supported intervals; the same inventory step required for duplications
applies. The other five samples have not been counted.

A separate SeraCare sample has an engineered HG002-background amplification truth
set. Total-copy-number truth does not establish the added haplotype or expected
per-SNP BAF. It is not an unmodified normal or automatically a split-band standard.

## 9. First comparison and rejection criteria

Before running a new experiment, fix the input/site selection, positive/control
regions, model version and parameters, bin scales, fragment rules, and evaluation
metrics. There is **one primary endpoint** (review C6); the remaining measures
are secondary. Proposed shape, with placeholders to be fixed before the run:

> In oracle bins over independently supported heterozygous events with at least
> N informative sites, the modeled minor fraction is at least k SD below 0.5.
> In the matched bins of a noncarrier sibling and in the presumed-neutral pilot
> windows, the fraction of bins reported as split is at most x.

N, k and x are chosen from the Section 6 arithmetic and the measured
fragment-reuse factor, not from a plot, and are recorded before data are
examined.

Compare raw BAF and the existing histogram with the unmodified regional-likelihood
baseline, at fixed scales and in oracle bins (Section 6), together with the
heterozygote density channel (Section 4). Use independently supported CNVs with enough informative sites plus
presumed-neutral controls, and noncarrier relatives when their status is established.
Choose regions without first selecting the ones that display convincing bands.

Evaluate signal separation, false splitting in controls, retained genomic coverage,
breakpoint localization, stability across fixed scales, and the honesty of displayed
uncertainty. Report sparse or unsupported regions rather than dropping them from
the denominator. Truth-event counts and relatives must not be treated as independent
replicates. Simulated count/fragment controls can test logic and calibration, but
cannot replace positive biological examples.

Reject or revise a candidate that creates split bands in balanced controls, attenuates
known imbalance, excessively shifts/blurs boundaries, becomes confident from reused
fragments, or improves appearance primarily by hiding difficult regions. A model
may fail to help at this coverage and event size; report that outcome too.

No such positive-control comparison has yet been run. This document requests
review of the concept, not approval of an untested statistical gate.

**Proposed smallest first comparison** (from the review): run CNVpytor, pinned
version, `reduce_noise` off, on NA12881 and one sibling that does not carry the
chosen events, from the existing SNV VCFs. Export the binned BAF likelihood at
10 kb and 100 kb. Examine, in order: heterozygous deletions of at least 10 kb
(does density drop in the carrier only?), heterozygous duplications of at least
about 8 kb (does the oracle-bin likelihood separate from 0.5, and by how many
SD?), and the presumed-neutral pilot windows (any split bins?). No Gens code is
required. A negative oracle-bin result on the duplications ends the approach at
this coverage and event size.

## 10. Later options, kept separate

- **Normal-panel bias calibration:** learn reproducible locus/process bias from
  appropriate copy-neutral heterozygous controls, propagating calibration
  uncertainty. Separate this from shrinking all fractions toward 0.5. It needs
  independently held-out individuals/families and safeguards against real CNVs/LOH.
- **Phase-aware inference:** combine evidence along consistent haplotypes while
  handling phase switches and cross-site fragment reuse. In production this
  needs independent phase or uncertainty-aware phase inference; grouping alleles
  by high BAF alone can manufacture coherent-looking signal. On the validation
  cohort, trio phasing (Section 8) makes an upper-bound test possible now,
  which decides whether production phasing is worth building.
- **Upstream mapping improvements:** diagnose biased loci before considering
  alternative references or remapping. This changes the pipeline, not just Gens.
- **Calling:** only after separate validation, combine allele evidence with coverage
  and breakpoint support for candidate detection or prioritization. Avoid counting
  the same underlying evidence twice. A clearer display does not establish calibrated
  event probabilities, clinical sensitivity, or a validated caller.

## 11. Decisions requested from the reviewer

1. Is regional minor-haplotype fraction the right estimand for the visualization goal?
2. Is a CNVpytor-style unphased likelihood the simplest useful baseline, or should
   GATK ModelSegments or another established method be preferred, and why?
3. Which ascertainment, reference-bias and fragment-correlation assumptions are
   unacceptable even for the first prototype?
4. How should weak or bimodal likelihoods be displayed without implying posterior
   confidence or assigning false per-SNP corrections?
5. What controls and metrics would distinguish real visual benefit from lost
   sensitivity, false splitting, boundary smearing, or selective SNP removal?
6. What minimum data additions are needed given the related cohort, short DUP
   spans, and uncertain allele composition of the engineered mixture?
7. Which parts should be deferred to keep the first comparison small and falsifiable?

Please return a short verdict, ranked concerns with section references, a preferred
minimal approach, and the unresolved data requirements. Mark recommendations based
on assumptions as such. Do not infer numerical performance from the neutral pilot.

## 12. Supporting material

This document includes the context needed for concept review without repo access.
The local references below provide additional evidence, not prerequisites for
understanding the proposal. Published tools have not been benchmarked on these
samples as part of this concept.

- [Independent review, 2026-09-06](review.md), including the commands behind the counts quoted above.
- [Exploratory pilot report](analysis.md), [protocol](protocol.md), and [dataset inventory](datasets.md).
- [Literature evidence map](literature/evidence-map.md) and [bibliography](literature/references.bib).
- [Raw pilot summary](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/summary.json).
- [Pilot counting utility](../../../utils/baf_noise_pilot.py) and [tests](../../../tests/util_scripts/test_baf_noise_pilot.py).
- CNVpytor: https://doi.org/10.1093/gigascience/giab074 and https://github.com/abyzovlab/CNVpytor.
- GATK allele-fraction model: https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/models/AlleleFractionModeller.java.
- WGS haplotype-fragment inference: https://doi.org/10.1038/s41588-026-02592-0 and https://github.com/tangdavid/mCAs_WGS.
- PureCN normal-panel calibration: https://bioconductor.org/packages/release/bioc/vignettes/PureCN/inst/doc/Quick.html.

## 13. Companion feature: Scout panels and gene navigation

**Goal:** inspect the same genes selected through Scout panels in Gens, moving
between their genomic regions while retaining coverage, BAF and annotation
context. This is a navigation feature, independent of BAF modeling, statistical
calibration and automated calling. It does not require BAM/CRAM access.

### Existing support

The [Scout adapter](../../../gens/adapters/scout.py) already reads panel metadata
and member gene symbols from Scout's MongoDB `gene_panel` collection. The
[gene-list routes](../../../gens/routes/gene_lists.py) expose these through Gens.
The [render data source](../../../frontend/js/state/data_source.ts) matches panel
symbols against canonical transcript names to create gene-list tracks.
The [settings panel](../../../frontend/js/components/side_menu/settings_menu.ts)
contains a hidden gene-list selector, with institute scoping explicitly unresolved.

This is partial support, not a complete panel browser. The current adapter lists
panels without case/institute filtering and retrieves the latest version of each
panel. Simply unhiding the selector would not ensure the same gene set as Scout.

### Proposed workflow

- Open a **Panels** sidebar, defaulting to panels associated with the current
  Scout case once that association can be retrieved and authorized.
- Select one or more panels and display their names, versions and a searchable
  gene list. Ordinary multi-panel browsing uses a deduplicated union, retaining
  each gene's panel membership for inspection.
- Click a gene or use **Previous/Next** controls to visit its region. Maintain a
  stable genomic ordering and show the current position within the gene list.
- Switch chromosomes automatically and frame the annotated gene span with
  adjustable flanking sequence. Keep existing sample comparisons, coverage, BAF
  and annotation tracks visible; navigation must not hide observations outside
  the selected panels or alter allele counts.
- Optionally highlight panel genes in the gene track and record inspected genes
  in the current session. Inspection status is a navigation aid, not a clinical
  classification or shared sign-off.

### Matching Scout's selection

**Case panels and active browser filters are different inputs.** Fetching panel
definitions does not reveal an unsaved selection in Scout's browser. Exact
synchronization would require a Scout-to-Gens handoff, such as an enhanced
"Open in Gens" link carrying selected panel identifiers and versions, or a
server-resolved selection reference. If other filters change gene membership,
handoff must include the effective gene set or enough explicit filter semantics
to reproduce it. Do not label a default panel union as the active Scout filter.

Pin the case-selected or explicitly requested panel version rather than silently
substituting the latest. Resolve case identity and institute access on the server;
client-supplied identifiers are not authorization. Display whether the selection
came from case defaults, manual Gens selection or a Scout filter handoff. Exact
handoff support in Scout and its selection data contract remain to be investigated.

### Coordinates and failure states

Resolve genes against annotations for the sample's genome build. Prefer stable
gene identifiers such as HGNC IDs where available, with explicit symbol/alias
mapping rather than assuming symbols always match. Define the navigation span
consistently, for example the full annotated gene span, and clamp flanks to the
target chromosome. Do not silently substitute coordinates from another build.

Deduplicate genes shared between panels. Keep missing or ambiguous mappings
visible with a reason; do not silently drop genes or navigate to an arbitrary
match. Report unavailable panel versions, inaccessible cases, missing Scout
configuration, empty selections and fetch failures distinctly. Cache entries must
remain separated by the relevant access context, panel version and genome build.

### Smallest useful delivery

First complete case-aware, version-preserving panel retrieval and a gene list
with click/previous/next navigation using the existing Gens integration. Add exact
Scout filter handoff separately, because it may require changes in Scout as well
as Gens. Keep both independent of the BAF experiment in Section 9.

Before release, verify panel membership against the chosen Scout version,
cross-chromosome navigation and flanking limits, duplicate membership, unresolved
genes, empty panels, stale responses and access-denied cases. An exact-filter
handoff must also demonstrate that the effective gene set agrees between Scout
and Gens. These are proposed checks, not tests run for this concept; no runtime
panel-navigation functionality was added with this document update.

## 14. Companion features: interpretation and review workflows

**Goal:** help the reviewer assess whether a signal is supported, understand what
it affects, and preserve what has been inspected. Build on the existing
multi-sample tracks, highlights and saved layout profiles. The following are
product proposals, not implemented capabilities or claims of improved diagnostic
performance. They complement the BAF and Scout-panel concepts without changing
the scientific comparison in Section 9.

### 14.1. Unified region-evidence summary

Selecting a region or an existing finding would open a consolidated summary of
coverage statistics, BAF site counts, overlapping SV calls, connection support
and affected genes. Allow the reviewer to pin the interval or follow navigation,
with the active sample and genomic boundaries always explicit.

Compute summaries from defined source data, not merely the currently rendered
points, and report the resolution, filters, normalization and source versions.
Distinguish all retained BAF sites from verified informative heterozygotes. Show
effective depth or fragment counts only when the inputs support them; unavailable
is not zero. Coverage summaries alone must not silently become absolute
copy-number estimates. Keep evidence sources separate rather than combining
potentially duplicated observations into an unvalidated confidence score.

### 14.2. Paired-breakpoint view

Extend the compact read-connections viewer so both endpoints of an SV can remain
visible at once, including interchromosomal connections. Each pane would show
local coverage, BAF, genes and connection anchors, with independent navigation
and optional linked zoom. Preserve an overview or clear indication of the
relationship between the regions while inspecting either end.

Retain endpoint intervals, orientation and source labels. Do not replace uncertain
breakpoint intervals with apparently exact coordinates, or imply that arc height
is evidence strength. Report an unavailable endpoint or unsupported contig
explicitly. This remains a view of imported evidence and does not require
BAM/CRAM access or promise base-level alignment inspection.

### 14.3. Data-quality context layer

Make low-mappability intervals, segmental duplications, repeats and reference gaps
available alongside suspicious signals. Show sparse observations, missing coverage
and relevant sample-level quality context where available. The aim is to expose
possible technical explanations without automatically hiding difficult regions.

Use genome-build-matched, versioned annotation sources. Depth, mapping-quality
or fragment-quality summaries require additional compact inputs when those fields
are absent from existing files; do not infer them from BAF spread or plot density.
Keep measured quality separate from annotation-based warnings, and distinguish
missing data from a measured low value. Any later composite reliability score
would need its own validation.

### 14.4. Focused family-comparison mode

Build on the aligned multi-sample tracks with a compact proband/parent layout,
consistent coverage and BAF axes, and interval summaries for each sample. Support
comparison with nearby flanks while making normalization and any deliberately
different scales visible. Obtain family roles from verified metadata rather than
assuming that samples opened together are a trio.

Distinguish "not observed in the parent" from "insufficient parental data." Missing
calls or an uninformative parental track must not become a de novo designation.
Inheritance labels require appropriate supporting evidence, and similar-looking
tracks do not by themselves establish identical breakpoints or copy-number states.

### 14.5. Gene-dosage and transcript-impact context

For a selected event, summarize full versus partial gene overlap, potentially
affected exons, ClinGen dosage sensitivity and relevant disease associations.
Distinguish haploinsufficiency from triplosensitivity so deletion and duplication
interpretation are not conflated. Link to the underlying curated evidence rather
than presenting an unexplained pathogenicity verdict.

Record annotation release, genome build and transcript identifiers, including the
chosen MANE transcript where available. Exon-level claims require suitable exon
annotations and sufficiently resolved event boundaries; coarse coverage bins or
uncertain breakpoints cannot establish exact exon disruption. These annotations
provide context, not an automatic clinical classification.

### 14.6. Saved findings queue

Extend highlights into named findings with notes and review states such as
unreviewed, needs discussion and reviewed. Support next/previous navigation,
resuming a case later, and links to corresponding Scout records. Integrate with
panel-guided inspection without treating a visited gene as a reviewed finding.

Persist findings within an authorized case context, retaining authorship and edit
history and handling concurrent changes explicitly. Review state describes work
performed, not whether a variant is benign or pathogenic. Scout should remain the
source of clinical classification rather than creating a competing clinical
record in Gens; any write-back integration requires an explicit permission and
data contract. Saving and restoring findings is distinct from saving track layouts.

### 14.7. Reproducible saved views and evidence export

Save the region, selected samples, track configuration, panel versions, annotations
and analysis settings together. An access-controlled link would let a colleague
reopen the same configuration. Retain data/model provenance and warn when a source
has changed or is no longer available; restoring display settings alone does not
guarantee the original evidence has been reproduced.

Export a figure with coordinates, genome build, legends and source information,
plus structured view metadata where useful. Include the provenance of any modeled
results and distinguish them from raw observations. Offer an option to omit sample
identifiers, while making clear that removing labels does not guarantee anonymity.
Shared links must enforce the recipient's access and must not expose credentials
or grant access merely through knowledge of a URL.

### 14.8. Local background comparison

Provide optional context showing whether a coverage pattern recurs in other
authorized samples processed with a comparable pipeline. Prefer build- and
process-matched summaries, with cohort composition, normalization and contributing
sample counts disclosed. Mark related samples and repeat runs so they are not
silently treated as independent observations or neutral controls.

Recurrence can motivate an artifact investigation but is not an automatic benign
label: a recurrent biological event can also be real. Keep this descriptive view
separate from normal-panel bias correction or automated filtering. Access rules
must cover aggregates as well as individual records so cohort counts do not
reveal inaccessible cases. Suitable cohort inputs and comparison behavior remain
to be evaluated before implementation.

### 14.9. Smaller usability improvements

- **Region history:** back/forward navigation through visited intervals, preserving
  genome build and avoiding changes to unrelated review state.
- **Pinned reference region:** keep a reference interval visible while exploring
  elsewhere, reusing the paired-view capability where practical.
- **Coordinate copying:** copy a region with its genome build and an explicit
  coordinate convention, avoiding ambiguity between display and BED coordinates.
- **Undo highlight deletion:** recover accidental removal without losing associated
  navigation context; persistent findings require an auditable recovery operation.
- **Searchable command menu:** find genes, tracks and application actions without
  traversing multiple menus, with keyboard-accessible controls.
- **Request-state visibility:** distinguish loading, stale data, missing data,
  partial results and errors; late responses must not appear as current evidence.

### 14.10. Suggested priorities and verification

The recommended starting set is the **region-evidence summary**, **paired-breakpoint
view** and **saved findings queue**. Together they address evaluating an interval,
inspecting event structure and retaining review work without depending on a new
statistical caller. Their ordering relative to Scout panel navigation remains a
product decision. Quality annotations and the smaller navigation improvements can
be delivered independently; richer count summaries, curated dosage context and
background-cohort comparison depend on suitable additional inputs.

Before delivery, check summary values against source data, endpoint navigation
against supplied intervals, and save/reopen/export behavior against the original
view state. Include sparse and missing data, ambiguous gene mappings, changing
sources, failed or out-of-order requests, permission failures and concurrent edits
where relevant. These are proposed checks, not executed validation or a claim of
clinical benefit. No runtime feature or scientific experiment was implemented as
part of recording these concepts.