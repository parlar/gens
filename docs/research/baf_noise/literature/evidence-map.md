# Improving WGS allele-frequency reliability

## Recommendation for Gens

The most promising near-term comparison is a separate **regional allelic-imbalance
likelihood track**, with raw BAF retained. CNVpytor provides a WGS-specific,
unphased baseline; GATK ModelSegments offers a segmented Bayesian alternative
with reference-bias and outlier terms. Phase-aware approaches are an additional
option when suitable phase information and fragment-level bookkeeping are available.

The user's normal-cohort idea is also supported by existing methods: learn
reproducible allele-mapping bias from process-matched normals and propagate
uncertainty in that calibration. This is different from forcing every normal
heterozygous observation to exactly 0.5, and does not remove finite-read sampling.

These are recommendations for a future comparison, not demonstrated improvements
on the Gens pilot. The pilot tested denominators and fixed quality filters, not
regional models, phasing, personalized alignment, or a panel-of-normals correction.

## Evidence by approach

### Unphased regional likelihood: CNVpytor

- **Source:** Suvakov et al., 2021, GigaScience,
  [10.1093/gigascience/giab074](https://doi.org/10.1093/gigascience/giab074).
- **Mechanism:** combine reference/alternate count likelihoods across genomic
  bins, symmetrizing allele orientation when genotypes are unphased. This retains
  information about split bands that an ordinary mean would cancel.
- **Input/output:** VCF genotype and allele-count data; optional BAM recounting;
  binned BAF likelihood and allele-imbalance estimates alongside read depth.
- **Evidence checked:** paper describes WGS and demonstrates deletion, duplication
  and copy-neutral LOH examples. Project documentation describes optional phase
  use, likelihood plotting, and maximum-likelihood regional estimates.
- **Limitations:** regional precision trades against spatial resolution; sparse
  heterozygotes, erroneous genotypes, mapping bias, and correlated fragments still
  matter. A likelihood image is not a calibrated posterior by itself.
- **Specific caution:** current source includes an optional `reduce_noise` path
  that increments the smaller allele count, explicitly noting it can change BAF.
  This is not the same as unbiased measurement cleanup. Benchmark likelihood
  aggregation separately from count modification and pin the actual options.
- **Artifacts:** https://github.com/abyzovlab/CNVpytor and the 2024 browser paper,
  [10.1093/bioinformatics/btae453](https://doi.org/10.1093/bioinformatics/btae453).

### Bayesian segmented estimates: GATK ModelSegments

- **Sources:** current [ModelSegments source/documentation](https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/ModelSegments.java)
  and [AlleleFractionModeller](https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/models/AlleleFractionModeller.java).
- **Mechanism:** infer segment-level minor-allele fraction from counts, integrate
  over unknown reference/alternate minor-allele assignment, and model a global
  gamma distribution of mapping-bias ratios plus an outlier probability. MCMC
  produces posterior summaries rather than new observed counts.
- **Input/output:** allelic counts, optionally denoised copy ratios and matched
  normal counts; segment estimates and uncertainty summaries. Predefined segments
  can be supplied, making it possible to separate inference from segmentation.
- **Evidence checked:** implementation and documented model, not a new benchmark
  or a claim of WGS performance improvement on the present sample.
- **Limitations:** reference-bias distribution is a model assumption; unreliable
  segmentation can blur short events. Same-sample heterozygote discovery can miss
  LOH sites, a limitation explicitly described in the documentation. A matched
  normal helps in somatic analysis but is not an independent diploid control for
  a constitutional CNV present in both tissues.

### Haplotype-level inference: MoChA, hapLOHseq and mCAs_WGS

- **Recent source:** Tang et al., 2026, Nature Genetics,
  [10.1038/s41588-026-02592-0](https://doi.org/10.1038/s41588-026-02592-0).
  Main paper: https://pmc.ncbi.nlm.nih.gov/articles/PMC13263154/.
- **Mechanism:** combine signals consistently along phased haplotypes and count
  haplotype-informative DNA fragments without repeatedly treating observations
  from the same fragment as independent. Combine imbalance with read-depth data.
- **Evidence checked:** the study analyzes high-coverage WGS from UK Biobank,
  compares its mosaic calls with array-based results, and uses independent WES
  and breakpoint-read evidence for supporting checks. The main article reports
  improved event detection; this is not evidence of precise corrected BAF at
  every individual SNP.
- **Resources:** https://github.com/tangdavid/mCAs_WGS provides code and links to
  empirical REF-bias and read-depth reference resources. Its README distinguishes
  general pipeline scripts from UKB-specific workflows that are not easily portable.
- **Critical Gens caveat:** the mosaic pipeline deliberately filters inherited
  CNVs. Do not apply those masks unchanged to a germline duplication viewer.
  Phase-switch errors, ancestry/reference-panel fit, short events, and sparse
  sites limit what can be recovered. Public bias resources should not be assumed
  interchangeable with this laboratory's alignment/calling process.
- **Earlier comparator:** San Lucas et al., 2016,
  [hapLOHseq](https://doi.org/10.1093/bioinformatics/btw340), uses VCF AD and
  haplotypes to infer regional imbalance, with WES and WGS evaluations. This is
  regional evidence, not per-SNP denoising.
- **MoChA context:** https://github.com/freeseek/mocha supports WGS AD and
  beta-binomial overdispersion. The Tang paper discusses the information lost
  when thinning nearby SNPs to reduce correlation between observations.

The Gens pilot resolved overlapping mates **within each SNP**. It did not create
haplotype-fragment observations deduplicated **across nearby SNPs**. That distinction
is essential before multiplying regional likelihoods or reporting narrow intervals.

### Process-matched normal-panel bias calibration

- **Source:** [PureCN best practices](https://bioconductor.org/packages/release/bioc/vignettes/PureCN/inst/doc/Quick.html),
  checked at the current release, and Riester et al., 2016,
  [10.1186/s13029-016-0060-z](https://doi.org/10.1186/s13029-016-0060-z).
- **Mechanism:** precompute position-specific mapping-bias information from normal
  VCF allele counts; use that information with copy-number and allele-count models,
  including a beta-binomial option. Documentation emphasizes process-matched normals.
- **Relevance:** a concrete precedent for estimating systematic site effects using
  a normal cohort instead of assuming the expected measured balance is identical
  at every site. Bias-estimate uncertainty must be retained, especially where few
  normals are heterozygous.
- **Limits:** PureCN is developed around tumor targeted/exome workflows. Its
  documentation is not validation of the same recipe for germline WGS. Do not
  equate its coverage panel with its allele-mapping-bias panel. Remove real CNV,
  LOH and contaminated regions from calibration and keep held-out individuals.
- **Related method:** Shen and Seshan's [FACETS](https://doi.org/10.1093/nar/gkw520)
  uses paired tumor-normal allelic log-odds ratios to cancel shared mapping bias.
  This requires an appropriate paired normal and is not a general single-sample
  germline BAF correction.

### Mapping improvements: biastools and personalized references

- **Diagnostic source:** Lin et al., 2024,
  [biastools](https://doi.org/10.1186/s13059-024-03240-8), measures and diagnoses
  reference bias, distinguishing causes such as genetic differences, repeats and
  coordinate ambiguity. Its simulation, predict and scan modes address different
  levels of available genotype knowledge. It is not a statistical denoiser.
- **WGS correction source:** Vaddadi et al., 2026,
  [10.1101/gr.280989.125](https://doi.org/10.1101/gr.280989.125), constructs imputed
  personalized diploid references, realigns reads, and evaluates heterozygous-site
  allele balance and variant calling on GIAB samples. It reports improved balance
  particularly around indels and fewer errors in the main benchmark setting.
- **Limits:** this is upstream realignment, not an adjustment to an existing BAF
  column. Results vary by benchmark stratum; the paper reports exceptions in some
  challenging/outside-high-confidence comparisons. It does not validate germline
  CNV sensitivity or eliminate SNP count sampling noise. Coordinate projection,
  reference-panel leakage, and new pipeline validation would all need attention.
- **Context only:** [WASP](https://doi.org/10.1038/nmeth.3582) is a relevant
  allele-specific mapping-bias precedent, but its reported evaluations concern
  RNA-seq/ChIP-seq; do not cite it as direct evidence of WGS CNV cleanup.

### Empirical-Bayes shrinkage

- **Source:** Zitovsky and Love,
  [10.12688/f1000research.20916.2](https://doi.org/10.12688/f1000research.20916.2),
  "Fast effect size shrinkage software for beta-binomial models of allelic imbalance."
- **Mechanism:** shrink uncertain allele-imbalance effects using a fitted prior
  and a count likelihood, rather than letting sparse observations produce unstable
  extreme estimates. The study explicitly concerns allelic expression and discusses
  alternatives to filtering or adding arbitrary pseudocounts.
- **Relevance:** confirms that modeling/adjustment is statistically possible, but
  a prior improves average estimation only when its assumptions fit the task.
- **Limits:** expression-effect shrinkage is not a drop-in WGS CNV method. A strong
  balanced prior can erase low-cell-fraction imbalance or move duplication bands
  toward 0.5. Heavy-tailed or state-aware priors are candidates for testing, not a
  guarantee of preserving true events.

## What a model would estimate

The biologically relevant target for CNV inspection is often regional haplotype
imbalance, not an independently precise fraction at each SNP. A schematic
unphased likelihood for regional minor-allele fraction f is:

$$
L(f) \propto \prod_i \left[f^{a_i}(1-f)^{r_i} + f^{r_i}(1-f)^{a_i}\right].
$$

Here a_i and r_i are ALT and REF informative counts, and 0 <= f <= 0.5. The two
terms marginalize over which allele belongs to the minor haplotype. This is a
schematic bias-free count model, not a validated protocol or a claim that sites
are independent. A phased model or an explicit correlation treatment is needed
when observations reuse fragments; real data may also need reference-bias and
outlier terms. A beta-binomial extension represents extra dispersion, but does
not by itself increase precision or remove bias.

Do not learn an arbitrarily flexible noise distribution inside each suspicious
region: it could explain true band splitting as noise. Likewise, phase inferred
merely by assigning high-BAF alleles to the same haplotype can create apparent
coherence under the null. Prefer independent phase information or a model that
properly marginalizes uncertainty.

A model-derived regional estimate, its uncertainty, informative-site/fragment
counts, and its spatial resolution should be displayed separately from raw BAF.
An unphased estimate can be shown as f and 1-f without claiming parental origin.
Smoothing across true breakpoints or flattening opposing bands is not acceptable.

## Proposed next decision, not an executed experiment

First compare an existing unphased regional-likelihood implementation with raw
BAF and the existing histogram. Evaluate phase-aware evidence next if usable
phase is available. Separately investigate recurrent site bias with process-matched
normal counts, rather than combining every mechanism into the first test.

Before executing, agree on a fixed set of independently supported neutral and
positive regions, versioned SNP/mappability masks, held-out individuals/families,
fragment-counting semantics and evaluation metrics. Reject a candidate if it
narrows neutral plots but attenuates known duplications/mosaic shifts, loses
clinically relevant regions, mislocalizes breakpoints, or produces overconfident
uncertainty. No numerical acceptance threshold has been selected in this review.