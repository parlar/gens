# Review request

Review the document(s) in **Section 2**. Section 3 is supporting evidence —
review it only as far as it bears on the document's claims.

---

# 1. How to review

## Your job

Find defects in the document below. Do not summarize it, do not praise it, do not
restate its design back to me. If it is sound, say so in one line and stop.

You are reviewing a **document** — a spec, a plan, or a design. The defect classes that
matter are: a step that cannot work as written, a claim that is false, a number that is
wrong, a gate that proves nothing, and a requirement with no task.

## What you can and cannot do here

You **cannot run anything.** No tests, no greps, no builds. Everything you know comes
from the text in this package.

Therefore, label every finding:

- **READ** — established from text included in this package. Quote it.
- **INFERRED** — reasoning that goes beyond the included text.

Never phrase an INFERRED finding as if you executed something. "This test will fail" is
INFERRED unless the failure is visible in the text.

If a claim depends on a file that is **not** included below, do not guess. Say
**"not verifiable from this package"** and name the file you would need. That is a
useful answer, not a failure.

## Look hardest at these

They have produced real defects before, in this order of yield:

1. **Numbers.** Expected test counts, chains like "3857 → 3891", "fixes 7 of 9 sites",
   mutation flip-sets ("this change reddens test X"). Check both the arithmetic *and*
   the derivation. These are wrong more often than anything else in the document.
2. **Vacuous gates.** For every check, assertion, or gate the document specifies, ask:
   **what trivially passes this?** Real examples that shipped: zero rows satisfy "all
   rows are X"; two empty sets are disjoint; a diff of a branch against itself compares
   nothing; a substring search matches its own comment; a test that catches an exception
   and asserts nothing. A gate that cannot go red is not a gate.
3. **Citations.** Every `file.py:123` reference — does the included source actually show
   what the document says is there?
4. **Steps that cannot pass.** Read each step as the person who has to run it. Does the
   named command exist? Does the expected output match what that command emits?
5. **Internal contradictions.** Two sections stating the same number differently. A
   constraint in one place violated in another. A task producing an interface a later
   task names differently.
6. **Coverage.** Any requirement in the spec with no task in the plan.

## Severity

- **Critical** — the work cannot be completed as written; a step is impossible or a task
  contradicts a hard constraint.
- **High** — a stated claim is false, or a step will fail, or a gate proves nothing.
- **Medium** — real but recoverable; the implementer would notice and work around it.
- **Low** — stale text, wrong count that changes nothing, imprecise wording.

## Output format

A numbered list, most severe first. Nothing before it and nothing after it.

Each finding, exactly:

```
N. [SEVERITY] [READ|INFERRED] <one-line claim>
   Where: <section or line in the document under review>
   Document says: <quote>
   Actually: <what is true, with evidence>
   Fix: <the smallest change that resolves it>
```

If you find nothing at a severity, do not pad the list with Lows to look thorough.

## Also answer this specifically

This is a visualization-first concept review, not authorization to implement a model. Prioritize preserving genuine duplication and mosaic imbalance while making the Gens BAF display easier to interpret. Distinguish reported exploratory pilot observations from untested model benefits; the raw inputs and external callset provenance are not included. Cite numbered concept sections or bundled source lines. Prefer the smallest defensible comparison, and state where missing truth or assumptions prevent conclusions. The user will submit this package to Fable 5.1 manually; do not contact other reviewers.

---

# 2. Under review

## `docs/research/baf_noise/concept.md`

````markdown
# Clearer BAF visualization in Gens

**Status:** concept for independent review, not an implementation specification
or a validated method. **Date:** 2026-09-05. **Intended reviewer:** Fable 5.1.

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

Expose informative-site counts, effective fragment counts where available,
bin/segment boundaries, model version, and missing/excluded-data status on
inspection. An unphased estimate may be displayed at f and 1-f, but these are
not assigned maternal/paternal haplotypes or corrected values for particular SNPs.

A normalized likelihood heatmap is **not automatically a posterior probability**.
Per-bin color normalization can make weak evidence look strong, so evidence
strength and width need explicit presentation. Use a grayscale/neutral missing
state rather than painting absent observations as balanced.

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
for independent regional evidence. Genotype ascertainment, bias, and contamination
must not be silently absorbed into a claim of precisely estimated f.

Evaluate the pinned implementation's actual model and defaults. CNVpytor has an
optional count-changing noise-reduction path; that is a separate intervention,
not interchangeable with combining unchanged count likelihoods. GATK ModelSegments
is a second existing candidate, with regional Bayesian estimates, reference-bias
terms and outlier handling.

## 6. Resolution and information limits

Larger bins pool more information but can blur short events or cross breakpoints.
Smaller bins may remain uncertain. The appropriate trade-off is an evaluation
question, not settled by the desired appearance of the display.

For the first comparison, prefer fixed, explicitly defined genomic bins at
predeclared scales. Keep those boundaries stable while panning. Do not silently
refit a region whenever the viewport moves, or let zoom changes imply a biological
change. Adaptive bins or segmentation are later alternatives if their benefit
justifies the complexity.

Windows crossing boundaries mix copy-number states; an intermediate estimate
could otherwise be mistaken for mosaicism. Empty/sparse bins and low-heterozygosity
regions require explicit treatment. A deletion or copy-neutral LOH may remove
heterozygosity rather than produce a tidy shifted heterozygous band. Lack of usable
heterozygotes must not be interpreted as evidence of a normal region.

## 7. Inputs and architecture

Process sequencing data offline. The Gens web server should not require BAM/CRAM
access for this feature. Keep either compact informative allele counts or
precomputed regional summaries, with sufficient provenance to reproduce them.

Candidate count-level content includes chromosome, position, REF/ALT identities,
counts, genotype/quality information, masks and optional phase-set/haplotype data.
The exact schema is not decided. Independent-fragment handling must happen upstream
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

The matched SV source is Platinum Pedigree/CEPH-1463 with local duplication-aware
processing, not an interchangeable GIAB benchmark. Some duplications originated
as insertion records. The duplicated source interval, genotype, dosage, and SNP
support must be verified before a record becomes a BAF positive control. Most
candidate duplication spans are short. Truth-region applicability is a separate
question from whether a positive event is listed.

A separate SeraCare sample has an engineered HG002-background amplification truth
set. Total-copy-number truth does not establish the added haplotype or expected
per-SNP BAF. It is not an unmodified normal or automatically a split-band standard.

## 9. First comparison and rejection criteria

Before running a new experiment, fix the input/site selection, positive/control
regions, model version and parameters, bin scales, fragment rules, and evaluation
metrics. Numerical acceptance thresholds remain to be agreed; none is inferred
from how clean a plot looks.

Compare raw BAF and the existing histogram with the unmodified regional-likelihood
baseline. Use independently supported CNVs with enough informative sites plus
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

## 10. Later options, kept separate

- **Normal-panel bias calibration:** learn reproducible locus/process bias from
  appropriate copy-neutral heterozygous controls, propagating calibration
  uncertainty. Separate this from shrinking all fractions toward 0.5. It needs
  independently held-out individuals/families and safeguards against real CNVs/LOH.
- **Phase-aware inference:** combine evidence along consistent haplotypes while
  handling phase switches and cross-site fragment reuse. Independent phase or
  uncertainty-aware phase inference is needed; grouping alleles by high BAF alone
  can manufacture coherent-looking signal.
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

- [Exploratory pilot report](analysis.md), [protocol](protocol.md), and [dataset inventory](datasets.md).
- [Literature evidence map](literature/evidence-map.md) and [bibliography](literature/references.bib).
- [Raw pilot summary](../../../volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/summary.json).
- [Pilot counting utility](../../../utils/baf_noise_pilot.py) and [tests](../../../tests/util_scripts/test_baf_noise_pilot.py).
- CNVpytor: https://doi.org/10.1093/gigascience/giab074 and https://github.com/abyzovlab/CNVpytor.
- GATK allele-fraction model: https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/models/AlleleFractionModeller.java.
- WGS haplotype-fragment inference: https://doi.org/10.1038/s41588-026-02592-0 and https://github.com/tangdavid/mCAs_WGS.
- PureCN normal-panel calibration: https://bioconductor.org/packages/release/bioc/vignettes/PureCN/inst/doc/Quick.html.````

---

# 3. Supporting evidence (line-numbered — cite these numbers)

Included files, and nothing else. If a claim depends on a file not listed
here, say **not verifiable from this package** and name the file.

- `docs/research/baf_noise/protocol.md`
- `docs/research/baf_noise/datasets.md`
- `utils/baf_noise_pilot.py`
- `tests/util_scripts/test_baf_noise_pilot.py`
- `volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/summary.json`
- `volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/manifest.json`

## `docs/research/baf_noise/protocol.md`

````
   1  # Exploratory BAF noise pilot
   2  
   3  Recorded before measurement on 2026-09-05. The user approved a presumed-neutral,
   4  exploratory baseline. No clinical validation, training, normalization, or changes
   5  to production Gens data are authorized by this pilot. This is not a confirmatory
   6  study, even though its rules are fixed in advance. No git commit was requested;
   7  each run records configuration, protocol and script hashes instead.
   8  
   9  ## Governing principle and failure conditions
  10  
  11  Reduce avoidable measurement error without suppressing true allelic imbalance.
  12  Narrower distributions alone cannot establish improvement. A denominator
  13  explanation fails locally if AD sums match DP and the two fractions coincide.
  14  A quality-filter explanation is not persuasive if narrowing disappears after
  15  matching sites/depth, or if loss of genomic representation dominates. No cleanup
  16  method will be called validated without independent samples and positive events.
  17  
  18  ## Prior evidence and assumptions
  19  
  20  The supplied coordinate-sorted, indexed BAM has GRCh38-compatible chromosome
  21  lengths and sample Seq25-16025. The on-disk sample map identifies NA12881. The
  22  matching SNV VCF declares GT, AD, DP and GQ. Its counts are not independent truth.
  23  The staged NA12878 high-confidence small-variant truth is not this sample's truth.
  24  Known/called SV VCFs are available for NA12881 and Seq25-16025 respectively.
  25  The existing Picard report reports mean filtered coverage 28.897216.
  26  
  27  The cnv_validation judgment case file warns against interpreting a region mask
  28  as an event-level exclusion and against selecting validation criteria after
  29  seeing results. This pilot checks each selected SNP against actual masked spans.
  30  
  31  Targeted sources checked in the preceding discussion, not a systematic review:
  32  
  33  - GATK DepthPerAlleleBySample documents that informative AD sums can differ from
  34    sample DP: https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/walkers/annotator/DepthPerAlleleBySample.java
  35  - GATK CollectAllelicCounts counts alleles at specified sites with quality
  36    filters; its nonreference count is not necessarily the specified ALT allele:
  37    https://github.com/broadinstitute/gatk/blob/master/src/main/java/org/broadinstitute/hellbender/tools/copynumber/CollectAllelicCounts.java
  38  - MoChA supports phased WGS AD and overdispersion modeling; it is a relevant
  39    later comparator, not a denoising result established here:
  40    https://github.com/freeseek/mocha
  41  
  42  ## Fixed selection
  43  
  44  All paths and numeric settings are in pilot.json. Window coordinates are
  45  one-based inclusive. They were chosen before inspecting their allele fractions.
  46  Do not substitute other windows if these prove sparse or difficult.
  47  
  48  Mask every record from both specified SV files, regardless of FILTER or genotype.
  49  Use the interval from record.start to the maximum of record.stop and
  50  record.start + abs(SVLEN), then expand by sv_padding. Merge overlapping intervals.
  51  This intentionally conservative treatment can over-mask insertions. It does not
  52  establish the absence of unknown SVs, copy-neutral LOH, dispersed-duplication
  53  source events, repeats or mapping artifacts. All retained regions are only
  54  presumed neutral. No independent callable or mappability mask is assumed.
  55  
  56  Select PASS, biallelic A/C/G/T SNPs with GT 0/1 or 1/0, sufficient GQ, nonnegative
  57  AD, positive DP and sufficient REF+ALT AD depth. Do not filter on observed BAF,
  58  minimum alternate count, or similarity to 0.5. Select at most the configured
  59  number of SNPs per window by ascending SHA-256 of chrom:pos:ref:alt, then sort by
  60  coordinate. Report every selection/exclusion count. Genotype/GQ ascertainment
  61  from this same sample is a limitation; no independent heterozygosity is claimed.
  62  
  63  ## Fixed measurements
  64  
  65  For each selected site retain VCF AD_ref, AD_alt, DP, GQ; compute AD_alt/DP and
  66  AD_alt/(AD_ref+AD_alt). Join the existing Gens d-resolution value at the BED end
  67  coordinate for one-base sites. Preserve absent values as missing, not zero.
  68  
  69  Use pysam pileups with no automatic overlap or BAQ adjustments, with a fixed
  70  high depth cap. Exclude unmapped, secondary, supplementary, QC-failed and duplicate
  71  records, and missing read names. Do not require the proper-pair flag. Within a
  72  site count each (read-group, read-name) once. For overlapping observations choose
  73  the higher-base-quality observation; tied conflicting bases are excluded. Apply
  74  each fixed MAPQ/base-quality threshold before resolving overlaps. MAPQ 255 is
  75  unknown and excluded. Count REF, the specified ALT, and other bases separately;
  76  only REF+ALT enter the denominator. Also retain read-level counts before overlap
  77  deduplication and allele-by-strand counts for diagnostics. Record capped sites
  78  and exclude them from numeric summaries; never treat truncation as complete data.
  79  
  80  Methods: current-formula VCF BAF, AD-sum VCF BAF, stored Gens BAF, and the two
  81  fragment-count settings. Keep raw counts and per-site metrics for all methods.
  82  Restrict BAM summaries to sufficient informative fragment depth. Report results
  83  on each method's available sites and on the intersection with both BAM settings.
  84  
  85  ## Analysis and stopping
  86  
  87  Report overall and per-window site counts, median informative depth, mean BAF,
  88  bias from 0.5, SD, RMSE from 0.5, central quantiles, and tails outside [0.3,0.7].
  89  For consistent count denominators report expected binomial SD
  90  sqrt(mean(0.25/n)) and a descriptive variance ratio var(BAF)/mean(0.25/n).
  91  This ratio is not a test of biological neutrality; linked sites, selected
  92  genotypes, and unknown events can affect it. Do not attach that binomial ratio
  93  to AD_alt/DP or stored fractions whose effective denominator is unknown.
  94  
  95  Report AD-sum versus DP disagreements and paired fraction differences. At Gens
  96  overlap sites compare stored values with both VCF formulas without assuming the
  97  stored file came from this exact VCF or code version. Slice BAM observations by
  98  depth (10-19, 20-39, 40-79, 80+). Use window summaries for spatial consistency;
  99  do not treat correlated SNPs as independent replicates or claim formal significance.
 100  
 101  Before real data: unit tests must reject out-of-mask selections and incorrect
 102  overlap counting, preserve unbalanced synthetic allele counts, and pass an
 103  end-to-end synthetic indexed-BAM/VCF/BAF control. Run a deterministic small
 104  subset as a technical smoke test, then the fixed full pilot with no tuning.
 105  Stop after the fixed comparisons and report neutral or negative results too.
 106  No smoothing, model fitting, normal-panel correction, phase inference, or CNV
 107  calling is included. A useful next step must be proposed, not silently executed.
 108  
 109  ## Artifacts and privacy
 110  
 111  Input files are read-only. Analysis code and tests live in utils and tests.
 112  Per-site results, plots, run manifests and count summaries are written to the
 113  ignored volumes/gens/data/baf_noise_pilot directory. A concise aggregate report
 114  is stored beside this protocol. No read sequences/names are exported and no
 115  genomic data is sent to external services. The manifest records file sizes,
 116  modification times and index hashes rather than re-reading the entire BAM for
 117  a full-file checksum; this is not full immutable input provenance.
````

## `docs/research/baf_noise/datasets.md`

````
   1  # Candidate inputs for further BAF evaluation
   2  
   3  Verified on 2026-09-05 by read-only inspection of the adjacent cnv_validation
   4  repository. This is an input inventory, not a model evaluation or evidence that
   5  any correction improves sensitivity. No additional BAM allele counts were extracted.
   6  
   7  ## Verified pedigree samples
   8  
   9  The authoritative sample table and pedigree identify the following mappings.
  10  For every row, the primary WGS BAM passed a header/EOF quickcheck, its index was
  11  readable, the header sample matched the Seq ID, and chr1 length was 248956422.
  12  Matching indexed SNV VCFs, indexed Gens BAF tracks, and per-sample truth VCFs
  13  were present. SNV and truth sample IDs matched their respective mapping columns.
  14  This does not constitute a full BAM integrity scan or immutable provenance audit.
  15  
  16  | Seq ID | Sample | Pipeline case | Mean filtered coverage from existing Picard report |
  17  | --- | --- | --- | ---: |
  18  | Seq25-16020 | NA12877 | oceanic_swamp | 28.863853 |
  19  | Seq25-16022 | NA12879 | graceful_junk | 28.832448 |
  20  | Seq25-16025 | NA12881 | likeable_sled | 28.897216 |
  21  | Seq25-16028 | NA12882 | wild_ceiling | 28.930272 |
  22  | Seq25-16030 | NA12885 | perfect_tapioca | 28.325995 |
  23  | Seq25-16032 | NA12886 | overwrought_rainy | 28.559535 |
  24  
  25  NA12877 is the father of the other listed individuals. NA12878 is their mother
  26  in the pedigree, but is not a BAM sample in this configured cohort. Consequently,
  27  these are not independent families. They can support exploratory consistency and
  28  segregation checks; splitting siblings between calibration and evaluation does
  29  not provide family-independent validation of a learned site-bias correction.
  30  
  31  ## Callset identity and coordinate caveats
  32  
  33  The configured merged truth contains sample IDs NA12877, NA12878, NA12879,
  34  NA12881, NA12882, NA12885 and NA12886, and declares a GRCh38 no-ALT reference.
  35  Project provenance identifies this as a Platinum Pedigree/CEPH-1463 SV source
  36  with local duplication-aware processing. It should not be described as a generic
  37  GIAB SV benchmark for arbitrary samples. The staged high-confidence region BED
  38  is specifically NA12878's; it is not independent proof of callability or neutrality
  39  in the other individuals. No separate matching official HG002 SV benchmark was
  40  verified in this inspection.
  41  
  42  The duplication-aware source is derived from a representation in which some
  43  tandem duplications were encoded as insertions. Before using a record as a BAF
  44  positive control, confirm the actually duplicated interval, genotype and dosage;
  45  an insertion breakpoint is not necessarily the source interval whose BAF changes.
  46  Reference spans are not assumed identical to inserted/copy-gained sequence length.
  47  
  48  The following is a direct count of autosomal `SVTYPE=DUP` records with genotype
  49  0/1 or 1/0 in each prepared `.all.vcf.gz`, without a FILTER restriction.
  50  Length here is exactly `record.stop - record.start`. These are record counts,
  51  not independent CNVs, orthogonally confirmed dosages, or a selection based on BAF.
  52  
  53  | Sample | Heterozygous DUP records | Reference span at least 10 kb | Maximum reference span, bp |
  54  | --- | ---: | ---: | ---: |
  55  | NA12877 | 685 | 0 | 9282 |
  56  | NA12879 | 735 | 2 | 13604 |
  57  | NA12881 | 727 | 1 | 10430 |
  58  | NA12882 | 721 | 1 | 13604 |
  59  | NA12885 | 715 | 0 | 6321 |
  60  | NA12886 | 749 | 2 | 13604 |
  61  
  62  Most candidate spans are short. The number and distribution of informative SNPs
  63  inside each candidate must be measured before claiming that it can evaluate
  64  BAF-band separation or a regional likelihood model. Shared familial records
  65  must not be counted as independent event discoveries.
  66  
  67  ## Separate engineered amplification sample
  68  
  69  The primary BAM for Seq25-16150 is present, indexed, header-consistent and has
  70  GRCh38-compatible chr1 length. Project manufacturer documentation identifies it
  71  as the SeraCare Seraseq Solid Tumor CNV Mix on a GM24385/HG002 background, with
  72  12 rows in the local per-target truth table.
  73  
  74  This is an engineered amplification reference, not unmodified HG002 and not a
  75  normal for bias calibration. Its documented total-copy-number targets do not
  76  establish which haplotype was added or the expected per-SNP BAF. Construct
  77  boundaries are also incompletely public. Use it for amplification evidence only
  78  until allele-specific composition and appropriate intervals are independently
  79  established. Do not transfer arbitrary HG002 germline expectations to the spike-ins.
  80  
  81  ## Locations
  82  
  83  All paths below are relative to `/home/parlar_ai/dev/cnv_validation`:
  84  
  85  ```text
  86  config/samples.tsv
  87  config/samples.ped
  88  config/evidence_manifest.yaml
  89  config/config.yaml
  90  from_rv/storage/userdata/cnv_validation/refdata/merged_hg38.svs.TRexclusion.dup_split.vcf.gz
  91  from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/{NA_ID}.all.vcf.gz
  92  from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/alignment/{SEQ_ID}_sorted_md.bam
  93  from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/call_snv/genome/{CASE}_snv.vcf.gz
  94  from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/gens/{SEQ_ID}_gens.baf.bed.gz
  95  seracare_solid_tumor_truthset_v1.0/README.md
  96  seracare_solid_tumor_truthset_v1.0/seracare_cnv_truth.tsv
  97  ```
  98  
  99  ## Next decision
 100  
 101  These inputs support a more informative exploratory positive-control comparison
 102  than the first neutral-only pilot. First establish event intervals, distinguish
 103  carriers from noncarriers, and inventory SNP support without looking for clean
 104  bands. Then agree on a fixed raw-versus-modeled comparison and uncertainty/signal
 105  preservation criteria. New individual- or family-independent controls would still
 106  be needed for validation of a normal-panel correction. No new model run or
 107  production processing change is recorded by this inventory.
````

## `utils/baf_noise_pilot.py`

````
   1  """Offline exploratory allele-count audit; never writes to source data."""
   2  
   3  from __future__ import annotations
   4  
   5  import argparse
   6  import bisect
   7  import csv
   8  import gzip
   9  import hashlib
  10  import json
  11  import math
  12  import platform
  13  import statistics
  14  from collections import Counter
  15  from datetime import datetime, timezone
  16  from pathlib import Path
  17  from typing import Any, Iterable
  18  
  19  import pysam
  20  
  21  
  22  def merge_intervals(intervals: Iterable[tuple[int, int]]) -> list[tuple[int, int]]:
  23      merged: list[tuple[int, int]] = []
  24      for start, end in sorted(intervals):
  25          if start < 0 or end <= start:
  26              raise ValueError("Invalid zero-based half-open interval")
  27          if merged and start <= merged[-1][1]:
  28              merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
  29          else:
  30              merged.append((start, end))
  31      return merged
  32  
  33  
  34  def is_masked(position: int, intervals: list[tuple[int, int]]) -> bool:
  35      offset = position - 1
  36      index = bisect.bisect_right(intervals, (offset, math.inf)) - 1
  37      return index >= 0 and offset < intervals[index][1]
  38  
  39  
  40  def count_observations(
  41      observations: Iterable[tuple[str, str, int, int, bool]],
  42      reference: str,
  43      alternate: str,
  44      minimum_mapq: int,
  45      minimum_baseq: int,
  46  ) -> dict[str, int]:
  47      fragments: dict[str, tuple[str | None, int, bool]] = {}
  48      counts: Counter[str] = Counter()
  49      for fragment, base, quality, mapq, reverse in observations:
  50          if mapq == 255 or mapq < minimum_mapq or quality < minimum_baseq:
  51              continue
  52          allele = "ref" if base == reference else "alt" if base == alternate else "other"
  53          counts[f"reads_{allele}"] += 1
  54          previous = fragments.get(fragment)
  55          if previous is None or quality > previous[1]:
  56              fragments[fragment] = (base, quality, reverse)
  57          elif quality == previous[1] and base != previous[0]:
  58              fragments[fragment] = (None, quality, reverse)
  59      for chosen_base, _quality, reverse in fragments.values():
  60          if chosen_base is None:
  61              counts["conflicts"] += 1
  62              continue
  63          allele = (
  64              "ref"
  65              if chosen_base == reference
  66              else "alt" if chosen_base == alternate else "other"
  67          )
  68          counts[allele] += 1
  69          if allele != "other":
  70              counts[f"{allele}_{'reverse' if reverse else 'forward'}"] += 1
  71      keys = (
  72          "ref",
  73          "alt",
  74          "other",
  75          "reads_ref",
  76          "reads_alt",
  77          "reads_other",
  78          "conflicts",
  79          "ref_forward",
  80          "ref_reverse",
  81          "alt_forward",
  82          "alt_reverse",
  83      )
  84      return {key: counts[key] for key in keys}
  85  
  86  
  87  def load_masks(
  88      config: dict[str, Any],
  89  ) -> tuple[dict[str, list[tuple[int, int]]], dict[str, int]]:
  90      chromosomes = {window["chrom"] for window in config["windows"]}
  91      masks: dict[str, list[tuple[int, int]]] = {chrom: [] for chrom in chromosomes}
  92      sources: dict[str, int] = {}
  93      padding = config["sv_padding"]
  94      for path in config["sv_vcfs"]:
  95          count = 0
  96          with pysam.VariantFile(path) as variants:
  97              for record in variants:
  98                  if record.chrom not in chromosomes:
  99                      continue
 100                  length = record.info.get("SVLEN", 0)
 101                  lengths = length if isinstance(length, tuple) else (length,)
 102                  span = max(
 103                      [abs(int(value)) for value in lengths if value is not None] or [0]
 104                  )
 105                  masks[record.chrom].append(
 106                      (
 107                          max(0, record.start - padding),
 108                          max(record.stop, record.start + span) + padding,
 109                      )
 110                  )
 111                  count += 1
 112          if count == 0:
 113              raise ValueError(f"No masking SV records on planned chromosomes in {path}")
 114          sources[path] = count
 115      return {chrom: merge_intervals(spans) for chrom, spans in masks.items()}, sources
 116  
 117  
 118  def choose_sites(
 119      variants: pysam.VariantFile,
 120      config: dict[str, Any],
 121      window: dict[str, Any],
 122      masks: list[tuple[int, int]],
 123      cap: int,
 124  ) -> tuple[list[dict[str, Any]], dict[str, int]]:
 125      counts: Counter[str] = Counter()
 126      candidates = []
 127      positions: set[int] = set()
 128      for record in variants.fetch(window["chrom"], window["start"] - 1, window["end"]):
 129          if not window["start"] <= record.pos <= window["end"]:
 130              continue
 131          counts["vcf_records"] += 1
 132          if (
 133              not record.alts
 134              or len(record.alts) != 1
 135              or record.ref not in {"A", "C", "G", "T"}
 136              or record.alts[0] not in {"A", "C", "G", "T"}
 137          ):
 138              counts["not_biallelic_snp"] += 1
 139              continue
 140          if "PASS" not in record.filter:
 141              counts["not_pass"] += 1
 142              continue
 143          call = record.samples[config["sample"]]
 144          if call.get("GT") not in ((0, 1), (1, 0)):
 145              counts["not_heterozygous"] += 1
 146              continue
 147          quality = call.get("GQ")
 148          if quality is None or quality < config["minimum_gq"]:
 149              counts["low_or_missing_gq"] += 1
 150              continue
 151          depths = call.get("AD")
 152          depth = call.get("DP")
 153          if (
 154              depths is None
 155              or len(depths) != 2
 156              or any(value is None or value < 0 for value in depths)
 157              or depth is None
 158              or depth <= 0
 159          ):
 160              counts["invalid_ad_or_dp"] += 1
 161              continue
 162          if sum(depths) < config["minimum_informative_depth"]:
 163              counts["low_informative_ad_depth"] += 1
 164              continue
 165          if is_masked(record.pos, masks):
 166              counts["sv_masked"] += 1
 167              continue
 168          if record.pos in positions:
 169              raise ValueError(
 170                  f"Duplicate selected SNP position: {record.chrom}:{record.pos}"
 171              )
 172          positions.add(record.pos)
 173          identifier = f"{record.chrom}:{record.pos}:{record.ref}:{record.alts[0]}"
 174          candidates.append(
 175              {
 176                  "chrom": record.chrom,
 177                  "pos": record.pos,
 178                  "ref": record.ref,
 179                  "alt": record.alts[0],
 180                  "ad_ref": depths[0],
 181                  "ad_alt": depths[1],
 182                  "dp": depth,
 183                  "gq": quality,
 184                  "vcf_alt_dp": depths[1] / depth,
 185                  "vcf_alt_adsum": depths[1] / sum(depths),
 186                  "selection_hash": hashlib.sha256(identifier.encode()).hexdigest(),
 187                  "window": f"{window['chrom']}:{window['start']}-{window['end']}",
 188              }
 189          )
 190      counts["eligible"] = len(candidates)
 191      selected = sorted(candidates, key=lambda row: row["selection_hash"])[:cap]
 192      selected.sort(key=lambda row: row["pos"])
 193      counts["selected"] = len(selected)
 194      return selected, dict(counts)
 195  
 196  
 197  def join_gens(
 198      baf: pysam.TabixFile, rows: list[dict[str, Any]], window: dict[str, Any]
 199  ) -> dict[str, int]:
 200      by_position = {row["pos"]: row for row in rows}
 201      for row in rows:
 202          row["gens_stored"] = None
 203      contig = "d_" + window["chrom"].removeprefix("chr")
 204      counts: Counter[str] = Counter()
 205      if contig not in baf.contigs:
 206          raise ValueError(f"Missing full-resolution BAF contig {contig}")
 207      observed: dict[int, list[float]] = {}
 208      for line in baf.fetch(contig, window["start"] - 1, window["end"]):
 209          fields = line.split("\t")
 210          if len(fields) < 4 or int(fields[2]) - int(fields[1]) != 1:
 211              counts["non_point_records"] += 1
 212              continue
 213          position = int(fields[2])
 214          if position not in by_position:
 215              continue
 216          value = float(fields[3])
 217          observed.setdefault(position, []).append(value)
 218          if not math.isfinite(value):
 219              counts["nonfinite_stored_values"] += 1
 220      for position, values in observed.items():
 221          counts["duplicate_records"] += len(values) - 1
 222          if not all(math.isfinite(value) for value in values) or len(set(values)) != 1:
 223              counts["ambiguous_sites"] += 1
 224              continue
 225          if len(values) > 1:
 226              counts["identical_duplicate_sites"] += 1
 227          by_position[position]["gens_stored"] = values[0]
 228          counts["matched"] += 1
 229      counts["missing"] = len(rows) - counts["matched"]
 230      return dict(counts)
 231  
 232  
 233  def recount_window(
 234      alignment: pysam.AlignmentFile,
 235      rows: list[dict[str, Any]],
 236      window: dict[str, Any],
 237      settings: list[dict[str, Any]],
 238      maximum_depth: int,
 239  ) -> None:
 240      by_position = {row["pos"]: row for row in rows}
 241      for row in rows:
 242          row["pileup_capped"] = False
 243          row["pileup_records"] = 0
 244          for setting in settings:
 245              for name, value in count_observations(
 246                  [], row["ref"], row["alt"], setting["mapq"], setting["baseq"]
 247              ).items():
 248                  row[f"{setting['name']}_{name}"] = value
 249      if not rows:
 250          return
 251      for column in alignment.pileup(
 252          window["chrom"],
 253          window["start"] - 1,
 254          window["end"],
 255          truncate=True,
 256          stepper="nofilter",
 257          min_base_quality=0,
 258          min_mapping_quality=0,
 259          ignore_overlaps=False,
 260          ignore_orphans=False,
 261          compute_baq=False,
 262          max_depth=maximum_depth,
 263      ):
 264          position = column.reference_pos + 1
 265          if position not in by_position:
 266              continue
 267          row = by_position[position]
 268          row["pileup_records"] = column.nsegments
 269          row["pileup_capped"] = column.nsegments >= maximum_depth
 270          observations = []
 271          for entry in column.pileups:
 272              read = entry.alignment
 273              offset = entry.query_position
 274              if (
 275                  read.is_unmapped
 276                  or read.is_secondary
 277                  or read.is_supplementary
 278                  or read.is_qcfail
 279                  or read.is_duplicate
 280                  or not read.query_name
 281              ):
 282                  continue
 283              if (
 284                  offset is None
 285                  or read.query_sequence is None
 286                  or read.query_qualities is None
 287              ):
 288                  continue
 289              group = read.get_tag("RG") if read.has_tag("RG") else ""
 290              observations.append(
 291                  (
 292                      f"{group}\0{read.query_name}",
 293                      read.query_sequence[offset].upper(),
 294                      read.query_qualities[offset],
 295                      read.mapping_quality,
 296                      read.is_reverse,
 297                  )
 298              )
 299          for setting in settings:
 300              counts = count_observations(
 301                  observations, row["ref"], row["alt"], setting["mapq"], setting["baseq"]
 302              )
 303              for name, value in counts.items():
 304                  row[f"{setting['name']}_{name}"] = value
 305  
 306  
 307  def quantile(values: list[float], fraction: float) -> float | None:
 308      if not values:
 309          return None
 310      ordered = sorted(values)
 311      position = (len(ordered) - 1) * fraction
 312      lower = math.floor(position)
 313      upper = math.ceil(position)
 314      return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
 315  
 316  
 317  def describe(values: list[float], depths: list[int] | None = None) -> dict[str, Any]:
 318      if not values:
 319          return {"sites": 0}
 320      variance = statistics.pvariance(values)
 321      result = {
 322          "sites": len(values),
 323          "mean": statistics.mean(values),
 324          "bias": statistics.mean(values) - 0.5,
 325          "sd": math.sqrt(variance),
 326          "rmse": math.sqrt(statistics.mean((value - 0.5) ** 2 for value in values)),
 327          "q025": quantile(values, 0.025),
 328          "median": statistics.median(values),
 329          "q975": quantile(values, 0.975),
 330          "outside_03_07_fraction": sum(value < 0.3 or value > 0.7 for value in values)
 331          / len(values),
 332      }
 333      if depths is not None:
 334          if len(depths) != len(values) or any(depth <= 0 for depth in depths):
 335              raise ValueError(
 336                  "One positive informative depth per allele fraction is required"
 337              )
 338          expected_variance = statistics.mean(0.25 / depth for depth in depths)
 339          result.update(
 340              {
 341                  "median_depth": statistics.median(depths),
 342                  "binomial_sd": math.sqrt(expected_variance),
 343                  "variance_ratio": variance / expected_variance,
 344              }
 345          )
 346      return result
 347  
 348  
 349  def method_values(
 350      rows: list[dict[str, Any]], method: str, minimum_depth: int
 351  ) -> tuple[list[float], list[int] | None]:
 352      values: list[float] = []
 353      depths: list[int] | None = (
 354          [] if method != "vcf_alt_dp" and method != "gens_stored" else None
 355      )
 356      for row in rows:
 357          if row["pileup_capped"]:
 358              continue
 359          if method.startswith("bam_"):
 360              depth = row[method + "_ref"] + row[method + "_alt"]
 361              if depth < minimum_depth:
 362                  continue
 363              value = row[method + "_alt"] / depth
 364          else:
 365              value = row[method]
 366              depth = row["ad_ref"] + row["ad_alt"]
 367          if value is None or not math.isfinite(value):
 368              continue
 369          values.append(value)
 370          if depths is not None:
 371              depths.append(depth)
 372      return values, depths
 373  
 374  
 375  def summarize(rows: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any]:
 376      minimum_depth = config["minimum_informative_depth"]
 377      bam_methods = [setting["name"] for setting in config["bam_settings"]]
 378      methods = ["vcf_alt_dp", "vcf_alt_adsum", "gens_stored", *bam_methods]
 379      uncapped = [row for row in rows if not row["pileup_capped"]]
 380      common = [
 381          row
 382          for row in uncapped
 383          if all(
 384              row[name + "_ref"] + row[name + "_alt"] >= minimum_depth
 385              for name in bam_methods
 386          )
 387      ]
 388      groups = {"all_selected": rows, "common_bam_sites": common}
 389      by_window = {
 390          window: [row for row in rows if row["window"] == window]
 391          for window in sorted({row["window"] for row in rows})
 392      }
 393      result: dict[str, Any] = {
 394          "selected_sites": len(rows),
 395          "capped_sites": len(rows) - len(uncapped),
 396          "common_bam_sites": len(common),
 397          "groups": {
 398              name: {
 399                  method: describe(*method_values(selected, method, minimum_depth))
 400                  for method in methods
 401              }
 402              for name, selected in groups.items()
 403          },
 404          "windows": {
 405              name: {
 406                  method: describe(*method_values(selected, method, minimum_depth))
 407                  for method in methods
 408              }
 409              for name, selected in by_window.items()
 410          },
 411      }
 412      differences = [row["vcf_alt_dp"] - row["vcf_alt_adsum"] for row in uncapped]
 413      result["denominators"] = {
 414          "sites": len(uncapped),
 415          "ad_sum_differs_from_dp": sum(
 416              row["ad_ref"] + row["ad_alt"] != row["dp"] for row in uncapped
 417          ),
 418          "ad_sum_above_dp": sum(
 419              row["ad_ref"] + row["ad_alt"] > row["dp"] for row in uncapped
 420          ),
 421          "median_adsum_over_dp": (
 422              statistics.median(
 423                  (row["ad_ref"] + row["ad_alt"]) / row["dp"] for row in uncapped
 424              )
 425              if uncapped
 426              else None
 427          ),
 428          "mean_baf_difference": statistics.mean(differences) if differences else None,
 429          "maximum_absolute_baf_difference": max(map(abs, differences), default=None),
 430          "absolute_baf_difference_above_005": sum(
 431              abs(value) > 0.05 for value in differences
 432          ),
 433      }
 434      gens_rows = [row for row in uncapped if row["gens_stored"] is not None]
 435      result["stored_gens_comparison"] = {
 436          "sites": len(gens_rows),
 437          "matching_tolerance": 1e-6,
 438          **{
 439              method: {
 440                  "matches": sum(
 441                      abs(row["gens_stored"] - row[method]) <= 1e-6 for row in gens_rows
 442                  ),
 443                  "mean_absolute_difference": (
 444                      statistics.mean(
 445                          abs(row["gens_stored"] - row[method]) for row in gens_rows
 446                      )
 447                      if gens_rows
 448                      else None
 449                  ),
 450              }
 451              for method in ("vcf_alt_dp", "vcf_alt_adsum")
 452          },
 453      }
 454      result["depth_strata"] = {}
 455      result["overlap_diagnostics"] = {}
 456      for method in bam_methods:
 457          result["depth_strata"][method] = {}
 458          for lower, upper in ((10, 20), (20, 40), (40, 80), (80, math.inf)):
 459              subset = [
 460                  row
 461                  for row in uncapped
 462                  if lower <= row[method + "_ref"] + row[method + "_alt"] < upper
 463              ]
 464              label = f"{lower}-{int(upper) - 1}" if math.isfinite(upper) else "80+"
 465              result["depth_strata"][method][label] = describe(
 466                  *method_values(subset, method, minimum_depth)
 467              )
 468          differences = []
 469          eligible = []
 470          for row in uncapped:
 471              depth = row[method + "_ref"] + row[method + "_alt"]
 472              read_depth = row[method + "_reads_ref"] + row[method + "_reads_alt"]
 473              if depth >= minimum_depth and read_depth >= minimum_depth:
 474                  eligible.append(row)
 475                  differences.append(
 476                      abs(
 477                          row[method + "_alt"] / depth
 478                          - row[method + "_reads_alt"] / read_depth
 479                      )
 480                  )
 481          result["overlap_diagnostics"][method] = {
 482              "sites": len(eligible),
 483              "sites_with_repeated_qualifying_observations": sum(
 484                  sum(
 485                      row[method + "_reads_" + allele]
 486                      for allele in ("ref", "alt", "other")
 487                  )
 488                  > sum(
 489                      row[method + "_" + allele]
 490                      for allele in ("ref", "alt", "other", "conflicts")
 491                  )
 492                  for row in eligible
 493              ),
 494              "mean_absolute_read_vs_fragment_baf_difference": (
 495                  statistics.mean(differences) if differences else None
 496              ),
 497              "maximum_absolute_read_vs_fragment_baf_difference": max(
 498                  differences, default=None
 499              ),
 500              "tied_conflicts": sum(row[method + "_conflicts"] for row in uncapped),
 501              "other_base_observations": sum(row[method + "_other"] for row in uncapped),
 502          }
 503      return result
 504  
 505  
 506  def write_plots(
 507      rows: list[dict[str, Any]],
 508      summary: dict[str, Any],
 509      output: Path,
 510      config: dict[str, Any],
 511  ) -> None:
 512      import matplotlib
 513  
 514      matplotlib.use("Agg")
 515      import matplotlib.pyplot as plt
 516  
 517      figure, axes = plt.subplots(2, 2, figsize=(12, 9), constrained_layout=True)
 518      minimum_depth = config["minimum_informative_depth"]
 519      methods = [
 520          "vcf_alt_dp",
 521          "vcf_alt_adsum",
 522          *[setting["name"] for setting in config["bam_settings"]],
 523      ]
 524      labels = [
 525          "VCF ALT/DP",
 526          "VCF ALT/(REF+ALT)",
 527          "BAM fragments Q20",
 528          "BAM fragments Q30",
 529      ]
 530      common = [
 531          row
 532          for row in rows
 533          if not row["pileup_capped"]
 534          and all(
 535              row[name + "_ref"] + row[name + "_alt"] >= minimum_depth
 536              for name in methods[2:]
 537          )
 538      ]
 539      for method, label in zip(methods, labels):
 540          values, _depths = method_values(common, method, minimum_depth)
 541          axes[0, 0].hist(
 542              values,
 543              bins=[index / 50 for index in range(51)],
 544              density=True,
 545              histtype="step",
 546              label=label,
 547          )
 548      axes[0, 0].set(
 549          xlabel="Allele fraction",
 550          ylabel="Density",
 551          title="Same sites: descriptive BAF distributions",
 552      )
 553      axes[0, 0].legend(fontsize=8)
 554      axes[0, 1].scatter(
 555          [row["dp"] for row in rows],
 556          [row["ad_ref"] + row["ad_alt"] for row in rows],
 557          s=5,
 558          alpha=0.35,
 559      )
 560      limit = max(
 561          [row["dp"] for row in rows] + [row["ad_ref"] + row["ad_alt"] for row in rows]
 562      )
 563      axes[0, 1].plot([0, limit], [0, limit], color="black", linewidth=1)
 564      axes[0, 1].set(
 565          xlabel="VCF DP", ylabel="VCF REF + ALT AD", title="Denominator consistency"
 566      )
 567      values, depths = method_values(rows, methods[2], minimum_depth)
 568      axes[1, 0].scatter(depths, values, s=4, alpha=0.25, color="#008080")
 569      axes[1, 0].axhline(0.5, color="black", linewidth=1)
 570      axes[1, 0].set(
 571          xlabel="Informative fragments (Q20)",
 572          ylabel="ALT / (REF + ALT)",
 573          title="Retained sites by effective depth",
 574      )
 575      labels_depth = list(summary["depth_strata"][methods[2]])
 576      for method, label in zip(methods[2:], labels[2:]):
 577          records = summary["depth_strata"][method]
 578          axes[1, 1].plot(
 579              labels_depth,
 580              [records[group].get("sd", math.nan) for group in labels_depth],
 581              marker="o",
 582              label=label,
 583          )
 584          axes[1, 1].plot(
 585              labels_depth,
 586              [records[group].get("binomial_sd", math.nan) for group in labels_depth],
 587              linestyle="--",
 588              label=f"Binomial at {label} depths",
 589          )
 590      axes[1, 1].set(
 591          xlabel="Informative depth group",
 592          ylabel="BAF standard deviation",
 593          title="Observed spread versus ideal count sampling",
 594      )
 595      axes[1, 1].legend(fontsize=8)
 596      figure.suptitle(
 597          f"{config['sample']}: exploratory presumed-neutral pilot\nGenotype-ascertained sites; no denoising or clinical validation",
 598          fontsize=13,
 599      )
 600      figure.savefig(output / "diagnostics.png", dpi=160)
 601      plt.close(figure)
 602  
 603  
 604  def run(
 605      config_path: Path, output: Path, smoke_sites: int | None = None, plots: bool = False
 606  ) -> dict[str, Any]:
 607      config = json.loads(config_path.read_text())
 608      if output.exists():
 609          raise ValueError(
 610              "Choose a new output directory; existing results are never overwritten"
 611          )
 612      output.mkdir(parents=True)
 613      protocol = config_path.parent / "protocol.md"
 614      manifest: dict[str, Any] = {
 615          "started_at": datetime.now(timezone.utc).isoformat(),
 616          "mode": "smoke" if smoke_sites is not None else "fixed_exploratory_pilot",
 617          "smoke_sites_per_window": smoke_sites,
 618          "config": config,
 619          "config_sha256": hashlib.sha256(config_path.read_bytes()).hexdigest(),
 620          "protocol_sha256": hashlib.sha256(protocol.read_bytes()).hexdigest(),
 621          "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
 622          "versions": {
 623              "python": platform.python_version(),
 624              "pysam": pysam.__version__,
 625              "samtools": pysam.__samtools_version__,
 626          },
 627          "inputs": {},
 628      }
 629      for path_string in [
 630          config["bam"],
 631          config["vcf"],
 632          config["baf"],
 633          *config["sv_vcfs"],
 634      ]:
 635          path = Path(path_string)
 636          suffix = ".bai" if path.suffix == ".bam" else ".tbi"
 637          index = Path(str(path) + suffix)
 638          info = path.stat()
 639          manifest["inputs"][path_string] = {
 640              "size": info.st_size,
 641              "mtime_ns": info.st_mtime_ns,
 642              "index_sha256": hashlib.sha256(index.read_bytes()).hexdigest(),
 643          }
 644      (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
 645      masks, mask_counts = load_masks(config)
 646      rows = []
 647      selection = {}
 648      gens_joins = {}
 649      with (
 650          pysam.AlignmentFile(config["bam"], "rb") as alignment,
 651          pysam.VariantFile(config["vcf"]) as variants,
 652          pysam.TabixFile(config["baf"]) as baf,
 653      ):
 654          if list(variants.header.samples) != [config["sample"]]:
 655              raise ValueError("VCF sample identity mismatch")
 656          groups = alignment.header.to_dict().get("RG", [])
 657          if not groups or any(group.get("SM") != config["sample"] for group in groups):
 658              raise ValueError("BAM sample identity mismatch")
 659          for window in config["windows"]:
 660              if alignment.get_reference_length(window["chrom"]) < window["end"]:
 661                  raise ValueError("Window exceeds BAM contig length")
 662              cap = (
 663                  smoke_sites
 664                  if smoke_sites is not None
 665                  else config["maximum_sites_per_window"]
 666              )
 667              selected, counts = choose_sites(
 668                  variants, config, window, masks[window["chrom"]], cap
 669              )
 670              key = f"{window['chrom']}:{window['start']}-{window['end']}"
 671              selection[key] = counts
 672              print(f"Selected {len(selected)} sites in {key}", flush=True)
 673              gens_joins[key] = join_gens(baf, selected, window)
 674              recount_window(
 675                  alignment,
 676                  selected,
 677                  window,
 678                  config["bam_settings"],
 679                  config["maximum_pileup_depth"],
 680              )
 681              rows.extend(selected)
 682              print(f"Recounted {key}", flush=True)
 683      if not rows:
 684          raise ValueError(
 685              "No eligible SNPs; an empty result is not evidence of low noise"
 686          )
 687      with gzip.open(output / "sites.tsv.gz", "wt", newline="") as handle:
 688          writer = csv.DictWriter(handle, fieldnames=list(rows[0]), delimiter="\t")
 689          writer.writeheader()
 690          writer.writerows(rows)
 691      summary = summarize(rows, config)
 692      summary.update(
 693          {
 694              "selection": selection,
 695              "sv_mask_record_counts": mask_counts,
 696              "gens_join": gens_joins,
 697          }
 698      )
 699      (output / "summary.json").write_text(
 700          json.dumps(summary, indent=2, allow_nan=False) + "\n"
 701      )
 702      if plots:
 703          write_plots(rows, summary, output, config)
 704      manifest["completed_at"] = datetime.now(timezone.utc).isoformat()
 705      manifest["selected_sites"] = len(rows)
 706      (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
 707      print(
 708          json.dumps(
 709              {
 710                  "output": str(output),
 711                  "selected_sites": len(rows),
 712                  "denominators": summary["denominators"],
 713                  "common_bam_sites": summary["groups"]["common_bam_sites"],
 714              },
 715              indent=2,
 716          )
 717      )
 718      return summary
 719  
 720  
 721  def main() -> None:
 722      parser = argparse.ArgumentParser(description=__doc__)
 723      parser.add_argument("--config", type=Path, required=True)
 724      parser.add_argument("--output", type=Path, required=True)
 725      parser.add_argument("--smoke-sites", type=int)
 726      parser.add_argument("--plots", action="store_true")
 727      args = parser.parse_args()
 728      if args.smoke_sites is not None and args.smoke_sites < 1:
 729          parser.error("--smoke-sites must be positive")
 730      run(args.config, args.output, args.smoke_sites, args.plots)
 731  
 732  
 733  if __name__ == "__main__":
 734      main()
````

## `tests/util_scripts/test_baf_noise_pilot.py`

````
   1  import gzip
   2  import json
   3  from pathlib import Path
   4  from unittest.mock import Mock
   5  
   6  import pysam
   7  import pytest
   8  
   9  from utils.baf_noise_pilot import (
  10      count_observations,
  11      describe,
  12      is_masked,
  13      join_gens,
  14      merge_intervals,
  15      run,
  16  )
  17  
  18  
  19  def test_mask_uses_one_based_sites_against_half_open_intervals():
  20      intervals = merge_intervals([(99, 110), (109, 120), (200, 210)])
  21      assert intervals == [(99, 120), (200, 210)]
  22      assert not is_masked(99, intervals)
  23      assert is_masked(100, intervals)
  24      assert is_masked(120, intervals)
  25      assert not is_masked(121, intervals)
  26  
  27  
  28  def test_overlapping_mates_are_one_fragment_not_two_reads():
  29      counts = count_observations(
  30          [
  31              ("pair", "A", 30, 60, False),
  32              ("pair", "A", 30, 60, True),
  33              ("other", "C", 30, 60, False),
  34          ],
  35          "A",
  36          "C",
  37          20,
  38          20,
  39      )
  40      assert counts["reads_ref"] == 2
  41      assert counts["ref"] == 1
  42      assert counts["alt"] == 1
  43  
  44  
  45  def test_conflicting_mates_use_better_base_quality_or_are_excluded():
  46      counts = count_observations(
  47          [
  48              ("better", "A", 30, 60, False),
  49              ("better", "C", 40, 60, True),
  50              ("tied", "A", 30, 60, False),
  51              ("tied", "C", 30, 60, True),
  52          ],
  53          "A",
  54          "C",
  55          20,
  56          20,
  57      )
  58      assert counts["ref"] == 0
  59      assert counts["alt"] == 1
  60      assert counts["conflicts"] == 1
  61  
  62  
  63  def test_filters_and_other_alleles_do_not_create_reference_support():
  64      counts = count_observations(
  65          [
  66              ("low-base", "C", 5, 60, False),
  67              ("low-map", "C", 40, 10, False),
  68              ("unknown-map", "C", 40, 255, False),
  69              ("other", "G", 40, 60, False),
  70              ("ref", "A", 40, 60, False),
  71          ],
  72          "A",
  73          "C",
  74          20,
  75          20,
  76      )
  77      assert counts["ref"] == 1
  78      assert counts["alt"] == 0
  79      assert counts["other"] == 1
  80  
  81  
  82  def test_known_unbalanced_counts_are_not_shrunk_toward_half():
  83      observations = [(f"ref-{index}", "A", 40, 60, False) for index in range(10)]
  84      observations += [(f"alt-{index}", "C", 40, 60, True) for index in range(20)]
  85      counts = count_observations(observations, "A", "C", 30, 30)
  86      assert counts["alt"] / (counts["ref"] + counts["alt"]) == pytest.approx(2 / 3)
  87  
  88  
  89  def test_summary_does_not_pass_empty_or_mismatched_depths_as_low_noise():
  90      assert describe([]) == {"sites": 0}
  91      with pytest.raises(ValueError):
  92          describe([0.5], [])
  93      with pytest.raises(ValueError):
  94          describe([0.5], [0])
  95      result = describe([0.25, 0.75], [4, 4])
  96      assert result["variance_ratio"] == 1
  97  
  98  
  99  def build_fixture(directory: Path):
 100      header = pysam.AlignmentHeader.from_dict(
 101          {
 102              "HD": {"VN": "1.6", "SO": "coordinate"},
 103              "SQ": [{"SN": "chr1", "LN": 10000}],
 104              "RG": [{"ID": "group", "SM": "sample"}],
 105          }
 106      )
 107      bam = directory / "input.bam"
 108      with pysam.AlignmentFile(str(bam), "wb", header=header) as handle:
 109          for index in range(33):
 110              read = pysam.AlignedSegment(header)
 111              read.query_name = f"fragment-{index}"
 112              if index >= 30:
 113                  read.flag = (1024, 256, 2048)[index - 30]
 114              read.reference_id = 0
 115              read.reference_start = 90
 116              read.cigarstring = "30M"
 117              read.mapping_quality = 60
 118              sequence = list("A" * 30)
 119              sequence[9] = "C" if index >= 10 else "A"
 120              read.query_sequence = "".join(sequence)
 121              read.query_qualities = pysam.qualitystring_to_array("I" * 30)
 122              read.set_tag("RG", "group")
 123              handle.write(read)
 124      pysam.index(str(bam))
 125      vcf_header = pysam.VariantHeader()
 126      vcf_header.contigs.add("chr1", length=10000)
 127      for key, number, field_type in (
 128          ("GT", 1, "String"),
 129          ("AD", "R", "Integer"),
 130          ("DP", 1, "Integer"),
 131          ("GQ", 1, "Integer"),
 132      ):
 133          vcf_header.formats.add(key, number, field_type, key)
 134      vcf_header.info.add("SVLEN", 1, "Integer", "SV length")
 135      vcf_header.add_sample("sample")
 136      vcf = directory / "snps.vcf.gz"
 137      with pysam.VariantFile(str(vcf), "wz", header=vcf_header) as handle:
 138          for position in (100, 110):
 139              record = handle.new_record(
 140                  contig="chr1", start=position - 1, stop=position, alleles=("A", "C")
 141              )
 142              record.filter.add("PASS")
 143              record.samples["sample"]["GT"] = (0, 1)
 144              record.samples["sample"]["AD"] = (10, 20)
 145              record.samples["sample"]["DP"] = 40
 146              record.samples["sample"]["GQ"] = 99
 147              handle.write(record)
 148      pysam.tabix_index(str(vcf), preset="vcf")
 149      sv = directory / "sv.vcf.gz"
 150      with pysam.VariantFile(str(sv), "wz", header=vcf_header) as handle:
 151          record = handle.new_record(
 152              contig="chr1", start=109, stop=111, alleles=("AA", "A")
 153          )
 154          record.info["SVLEN"] = -1
 155          handle.write(record)
 156      pysam.tabix_index(str(sv), preset="vcf")
 157      bed = directory / "baf.bed"
 158      bed.write_text("d_1\t99\t100\t0.5\nd_1\t109\t110\t0.5\n")
 159      pysam.tabix_compress(str(bed), str(bed) + ".gz")
 160      pysam.tabix_index(str(bed) + ".gz", preset="bed")
 161      config = {
 162          "sample": "sample",
 163          "bam": str(bam),
 164          "vcf": str(vcf),
 165          "baf": str(bed) + ".gz",
 166          "sv_vcfs": [str(sv)],
 167          "windows": [{"chrom": "chr1", "start": 1, "end": 1000}],
 168          "sv_padding": 0,
 169          "minimum_gq": 30,
 170          "minimum_informative_depth": 10,
 171          "maximum_sites_per_window": 100,
 172          "maximum_pileup_depth": 10000,
 173          "bam_settings": [
 174              {"name": "bam_q20", "mapq": 20, "baseq": 20},
 175              {"name": "bam_q30", "mapq": 30, "baseq": 30},
 176          ],
 177      }
 178      config_path = directory / "pilot.json"
 179      config_path.write_text(json.dumps(config))
 180      (directory / "protocol.md").write_text("Synthetic unit-test protocol")
 181      return config_path
 182  
 183  
 184  def test_indexed_end_to_end_masks_and_counts_without_modifying_inputs(tmp_path):
 185      config_path = build_fixture(tmp_path)
 186      output = tmp_path / "results"
 187      summary = run(config_path, output)
 188      assert summary["selected_sites"] == 1
 189      assert summary["selection"]["chr1:1-1000"]["sv_masked"] == 1
 190      metrics = summary["groups"]["common_bam_sites"]
 191      assert metrics["vcf_alt_dp"]["mean"] == 0.5
 192      assert metrics["vcf_alt_adsum"]["mean"] == pytest.approx(2 / 3)
 193      assert metrics["bam_q20"]["mean"] == pytest.approx(2 / 3)
 194      assert metrics["bam_q30"]["median_depth"] == 30
 195      assert metrics["gens_stored"]["mean"] == 0.5
 196      with gzip.open(output / "sites.tsv.gz", "rt") as handle:
 197          assert "fragment-" not in handle.read()
 198      with pytest.raises(ValueError, match="never overwritten"):
 199          run(config_path, output)
 200  
 201  
 202  def test_capped_pileups_are_not_reported_as_complete_measurements(tmp_path):
 203      config_path = build_fixture(tmp_path)
 204      config = json.loads(config_path.read_text())
 205      config["maximum_pileup_depth"] = 5
 206      config_path.write_text(json.dumps(config))
 207      summary = run(config_path, tmp_path / "capped-results")
 208      assert summary["capped_sites"] == 1
 209      assert summary["groups"]["all_selected"]["bam_q20"] == {"sites": 0}
 210  
 211  
 212  def test_complete_exclusion_stops_instead_of_producing_a_clean_baseline(tmp_path):
 213      config_path = build_fixture(tmp_path)
 214      config = json.loads(config_path.read_text())
 215      config["sv_padding"] = 1000
 216      config_path.write_text(json.dumps(config))
 217      with pytest.raises(ValueError, match="No eligible SNPs"):
 218          run(config_path, tmp_path / "empty-results")
 219  
 220  
 221  def test_stored_baf_duplicates_are_audited_and_conflicts_are_not_chosen():
 222      indexed = Mock()
 223      indexed.contigs = ["d_1"]
 224      indexed.fetch.return_value = iter(
 225          [
 226              "d_1\t99\t100\t0.5",
 227              "d_1\t99\t100\t0.5",
 228              "d_1\t199\t200\t0.3",
 229              "d_1\t199\t200\t0.7",
 230          ]
 231      )
 232      rows = [{"pos": 100}, {"pos": 200}]
 233      counts = join_gens(indexed, rows, {"chrom": "chr1", "start": 1, "end": 300})
 234      assert rows[0]["gens_stored"] == 0.5
 235      assert rows[1]["gens_stored"] is None
 236      assert counts["duplicate_records"] == 2
 237      assert counts["identical_duplicate_sites"] == 1
 238      assert counts["ambiguous_sites"] == 1
 239      assert counts["matched"] == 1
 240      assert counts["missing"] == 1
````

## `volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/summary.json`

````
   1  {
   2    "selected_sites": 2213,
   3    "capped_sites": 0,
   4    "common_bam_sites": 2212,
   5    "groups": {
   6      "all_selected": {
   7        "vcf_alt_dp": {
   8          "sites": 2213,
   9          "mean": 0.5033681285906301,
  10          "bias": 0.0033681285906300706,
  11          "sd": 0.0910418730513391,
  12          "rmse": 0.09110415434489892,
  13          "q025": 0.3333333333333333,
  14          "median": 0.5,
  15          "q975": 0.6857142857142857,
  16          "outside_03_07_fraction": 0.02078626299141437
  17        },
  18        "vcf_alt_adsum": {
  19          "sites": 2213,
  20          "mean": 0.5036662021661013,
  21          "bias": 0.003666202166101251,
  22          "sd": 0.09108177336327493,
  23          "rmse": 0.09115552905513578,
  24          "q025": 0.3333333333333333,
  25          "median": 0.5,
  26          "q975": 0.6857142857142857,
  27          "outside_03_07_fraction": 0.02078626299141437,
  28          "median_depth": 32,
  29          "binomial_sd": 0.09101000817039508,
  30          "variance_ratio": 1.0015777053370114
  31        },
  32        "gens_stored": {
  33          "sites": 2052,
  34          "mean": 0.502966285370538,
  35          "bias": 0.002966285370538002,
  36          "sd": 0.09095697717053212,
  37          "rmse": 0.09100533250804685,
  38          "q025": 0.333333333333333,
  39          "median": 0.5,
  40          "q975": 0.685714285714286,
  41          "outside_03_07_fraction": 0.02046783625730994
  42        },
  43        "bam_q20": {
  44          "sites": 2213,
  45          "mean": 0.5023282451796994,
  46          "bias": 0.0023282451796994286,
  47          "sd": 0.08938782718377032,
  48          "rmse": 0.08941814342879403,
  49          "q025": 0.3333333333333333,
  50          "median": 0.5,
  51          "q975": 0.68,
  52          "outside_03_07_fraction": 0.01762313601446001,
  53          "median_depth": 30,
  54          "binomial_sd": 0.09302618441365501,
  55          "variance_ratio": 0.9233074610242916
  56        },
  57        "bam_q30": {
  58          "sites": 2212,
  59          "mean": 0.5021500987530944,
  60          "bias": 0.002150098753094354,
  61          "sd": 0.09219482536474001,
  62          "rmse": 0.09221989345408596,
  63          "q025": 0.3333333333333333,
  64          "median": 0.5,
  65          "q975": 0.6818181818181818,
  66          "outside_03_07_fraction": 0.025768535262206148,
  67          "median_depth": 29.0,
  68          "binomial_sd": 0.09512625190933893,
  69          "variance_ratio": 0.9393173005250169
  70        }
  71      },
  72      "common_bam_sites": {
  73        "vcf_alt_dp": {
  74          "sites": 2212,
  75          "mean": 0.5033829477105651,
  76          "bias": 0.0033829477105651318,
  77          "sd": 0.09105978133539196,
  78          "rmse": 0.09112259934868965,
  79          "q025": 0.3333333333333333,
  80          "median": 0.5,
  81          "q975": 0.6857142857142857,
  82          "outside_03_07_fraction": 0.020795660036166366
  83        },
  84        "vcf_alt_adsum": {
  85          "sites": 2212,
  86          "mean": 0.503681156039009,
  87          "bias": 0.0036811560390089815,
  88          "sd": 0.09109964310448866,
  89          "rmse": 0.09117398687974954,
  90          "q025": 0.3333333333333333,
  91          "median": 0.5,
  92          "q975": 0.6857142857142857,
  93          "outside_03_07_fraction": 0.020795660036166366,
  94          "median_depth": 32.0,
  95          "binomial_sd": 0.0909940539411888,
  96          "variance_ratio": 1.002322139114831
  97        },
  98        "gens_stored": {
  99          "sites": 2051,
 100          "mean": 0.50298207184059,
 101          "bias": 0.0029820718405899616,
 102          "sd": 0.09097633778906082,
 103          "rmse": 0.09102519865384386,
 104          "q025": 0.333333333333333,
 105          "median": 0.5,
 106          "q975": 0.685714285714286,
 107          "outside_03_07_fraction": 0.020477815699658702
 108        },
 109        "bam_q20": {
 110          "sites": 2212,
 111          "mean": 0.5023466854073853,
 112          "bias": 0.0023466854073852517,
 113          "sd": 0.08940382169936671,
 114          "rmse": 0.08943461447813922,
 115          "q025": 0.3333333333333333,
 116          "median": 0.5,
 117          "q975": 0.68,
 118          "outside_03_07_fraction": 0.01763110307414105,
 119          "median_depth": 30.0,
 120          "binomial_sd": 0.09300048057400265,
 121          "variance_ratio": 0.9241485405932206
 122        },
 123        "bam_q30": {
 124          "sites": 2212,
 125          "mean": 0.5021500987530944,
 126          "bias": 0.002150098753094354,
 127          "sd": 0.09219482536474001,
 128          "rmse": 0.09221989345408596,
 129          "q025": 0.3333333333333333,
 130          "median": 0.5,
 131          "q975": 0.6818181818181818,
 132          "outside_03_07_fraction": 0.025768535262206148,
 133          "median_depth": 29.0,
 134          "binomial_sd": 0.09512625190933893,
 135          "variance_ratio": 0.9393173005250169
 136        }
 137      }
 138    },
 139    "windows": {
 140      "chr20:20000001-22000000": {
 141        "vcf_alt_dp": {
 142          "sites": 766,
 143          "mean": 0.5026162089010956,
 144          "bias": 0.002616208901095596,
 145          "sd": 0.09089502105313853,
 146          "rmse": 0.09093266410517548,
 147          "q025": 0.34285714285714286,
 148          "median": 0.5,
 149          "q975": 0.6919761273209549,
 150          "outside_03_07_fraction": 0.02349869451697128
 151        },
 152        "vcf_alt_adsum": {
 153          "sites": 766,
 154          "mean": 0.5028888861478488,
 155          "bias": 0.002888886147848768,
 156          "sd": 0.09091511114442423,
 157          "rmse": 0.09096099767250931,
 158          "q025": 0.34285714285714286,
 159          "median": 0.5,
 160          "q975": 0.6919761273209549,
 161          "outside_03_07_fraction": 0.02349869451697128,
 162          "median_depth": 31.0,
 163          "binomial_sd": 0.09128787637633604,
 164          "variance_ratio": 0.9918498672275837
 165        },
 166        "gens_stored": {
 167          "sites": 691,
 168          "mean": 0.5021518383070975,
 169          "bias": 0.002151838307097531,
 170          "sd": 0.09145303150824322,
 171          "rmse": 0.09147834377680664,
 172          "q025": 0.342857142857143,
 173          "median": 0.5,
 174          "q975": 0.692307692307692,
 175          "outside_03_07_fraction": 0.024602026049204053
 176        },
 177        "bam_q20": {
 178          "sites": 766,
 179          "mean": 0.5015609782090589,
 180          "bias": 0.001560978209058872,
 181          "sd": 0.08880718463663957,
 182          "rmse": 0.08882090236006021,
 183          "q025": 0.33463541666666663,
 184          "median": 0.5,
 185          "q975": 0.6818181818181818,
 186          "outside_03_07_fraction": 0.016971279373368148,
 187          "median_depth": 30.0,
 188          "binomial_sd": 0.09326293380502555,
 189          "variance_ratio": 0.9067301532317779
 190        },
 191        "bam_q30": {
 192          "sites": 766,
 193          "mean": 0.500779663613655,
 194          "bias": 0.0007796636136550017,
 195          "sd": 0.0919475727534011,
 196          "rmse": 0.09195087824807573,
 197          "q025": 0.3333333333333333,
 198          "median": 0.5,
 199          "q975": 0.6839114832535885,
 200          "outside_03_07_fraction": 0.024804177545691905,
 201          "median_depth": 29.0,
 202          "binomial_sd": 0.09533253925872169,
 203          "variance_ratio": 0.9302468677695718
 204        }
 205      },
 206      "chr6:20000001-22000000": {
 207        "vcf_alt_dp": {
 208          "sites": 1447,
 209          "mean": 0.5037661731533,
 210          "bias": 0.0037661731532999676,
 211          "sd": 0.09111700467700963,
 212          "rmse": 0.0911948057815292,
 213          "q025": 0.3333333333333333,
 214          "median": 0.5,
 215          "q975": 0.6842105263157895,
 216          "outside_03_07_fraction": 0.019350380096751902
 217        },
 218        "vcf_alt_adsum": {
 219          "sites": 1447,
 220          "mean": 0.5040776908115618,
 221          "bias": 0.0040776908115618404,
 222          "sd": 0.09116719336691223,
 223          "rmse": 0.09125834048871731,
 224          "q025": 0.3333333333333333,
 225          "median": 0.5,
 226          "q975": 0.6842105263157895,
 227          "outside_03_07_fraction": 0.019350380096751902,
 228          "median_depth": 32,
 229          "binomial_sd": 0.09086256878760945,
 230          "variance_ratio": 1.0067164119049157
 231        },
 232        "gens_stored": {
 233          "sites": 1361,
 234          "mean": 0.5033797922925346,
 235          "bias": 0.0033797922925346002,
 236          "sd": 0.09070128557107292,
 237          "rmse": 0.09076423414641914,
 238          "q025": 0.333333333333333,
 239          "median": 0.5,
 240          "q975": 0.681818181818182,
 241          "outside_03_07_fraction": 0.018368846436443792
 242        },
 243        "bam_q20": {
 244          "sites": 1447,
 245          "mean": 0.5027344141496446,
 246          "bias": 0.002734414149644593,
 247          "sd": 0.08969102405949492,
 248          "rmse": 0.08973269648006056,
 249          "q025": 0.3333333333333333,
 250          "median": 0.5,
 251          "q975": 0.6783986175115206,
 252          "outside_03_07_fraction": 0.01796821008984105,
 253          "median_depth": 30,
 254          "binomial_sd": 0.0929006118934009,
 255          "variance_ratio": 0.9320963693089664
 256        },
 257        "bam_q30": {
 258          "sites": 1446,
 259          "mean": 0.5028760692349827,
 260          "bias": 0.0028760692349827366,
 261          "sd": 0.09231729342637204,
 262          "rmse": 0.09236208334492725,
 263          "q025": 0.3333333333333333,
 264          "median": 0.5,
 265          "q975": 0.6818181818181818,
 266          "outside_03_07_fraction": 0.02627939142461964,
 267          "median_depth": 29.0,
 268          "binomial_sd": 0.09501679236070704,
 269          "variance_ratio": 0.943985658429216
 270        }
 271      }
 272    },
 273    "denominators": {
 274      "sites": 2213,
 275      "ad_sum_differs_from_dp": 33,
 276      "ad_sum_above_dp": 0,
 277      "median_adsum_over_dp": 1.0,
 278      "mean_baf_difference": -0.0002980735754712087,
 279      "maximum_absolute_baf_difference": 0.054545454545454564,
 280      "absolute_baf_difference_above_005": 2
 281    },
 282    "stored_gens_comparison": {
 283      "sites": 2052,
 284      "matching_tolerance": 1e-06,
 285      "vcf_alt_dp": {
 286        "matches": 2052,
 287        "mean_absolute_difference": 2.4184682846366716e-16
 288      },
 289      "vcf_alt_adsum": {
 290        "matches": 2023,
 291        "mean_absolute_difference": 0.00028690718229044986
 292      }
 293    },
 294    "depth_strata": {
 295      "bam_q20": {
 296        "10-19": {
 297          "sites": 80,
 298          "mean": 0.49063925738219466,
 299          "bias": -0.00936074261780534,
 300          "sd": 0.10828191475119378,
 301          "rmse": 0.10868576983460895,
 302          "q025": 0.3116319444444444,
 303          "median": 0.47368421052631576,
 304          "q975": 0.667647058823529,
 305          "outside_03_07_fraction": 0.05,
 306          "median_depth": 18.0,
 307          "binomial_sd": 0.12127759634400113,
 308          "variance_ratio": 0.7971695325695249
 309        },
 310        "20-39": {
 311          "sites": 1992,
 312          "mean": 0.5029230575901426,
 313          "bias": 0.0029230575901425526,
 314          "sd": 0.08950255705537041,
 315          "rmse": 0.08955027629842983,
 316          "q025": 0.34268796992481204,
 317          "median": 0.5,
 318          "q975": 0.6818181818181818,
 319          "outside_03_07_fraction": 0.01706827309236948,
 320          "median_depth": 30.0,
 321          "binomial_sd": 0.09275347980183686,
 322          "variance_ratio": 0.9311303068759014
 323        },
 324        "40-79": {
 325          "sites": 141,
 326          "mean": 0.500556987748477,
 327          "bias": 0.0005569877484770114,
 328          "sd": 0.07413190551251982,
 329          "rmse": 0.0741339979379847,
 330          "q025": 0.35277777777777775,
 331          "median": 0.509090909090909,
 332          "q975": 0.6219512195121951,
 333          "outside_03_07_fraction": 0.0070921985815602835,
 334          "median_depth": 42,
 335          "binomial_sd": 0.07703576109289095,
 336          "variance_ratio": 0.9260310987517342
 337        },
 338        "80+": {
 339          "sites": 0
 340        }
 341      },
 342      "bam_q30": {
 343        "10-19": {
 344          "sites": 135,
 345          "mean": 0.49084091286791665,
 346          "bias": -0.009159087132083354,
 347          "sd": 0.11474044945551748,
 348          "rmse": 0.11510542827489613,
 349          "q025": 0.29411764705882354,
 350          "median": 0.47368421052631576,
 351          "q975": 0.7356140350877193,
 352          "outside_03_07_fraction": 0.08148148148148149,
 353          "median_depth": 18,
 354          "binomial_sd": 0.12180425821053,
 355          "variance_ratio": 0.8873769651830654
 356        },
 357        "20-39": {
 358          "sites": 1983,
 359          "mean": 0.5030598995623875,
 360          "bias": 0.0030598995623875025,
 361          "sd": 0.09137530654725311,
 362          "rmse": 0.09142652586605474,
 363          "q025": 0.3333333333333333,
 364          "median": 0.5,
 365          "q975": 0.6818181818181818,
 366          "outside_03_07_fraction": 0.02319717599596571,
 367          "median_depth": 29,
 368          "binomial_sd": 0.09381905699295823,
 369          "variance_ratio": 0.9485835021814328
 370        },
 371        "40-79": {
 372          "sites": 94,
 373          "mean": 0.4991990890687401,
 374          "bias": -0.0008009109312598905,
 375          "sd": 0.06901614877307699,
 376          "rmse": 0.06902079577770245,
 377          "q025": 0.35925324675324677,
 378          "median": 0.5,
 379          "q975": 0.6146600934094447,
 380          "outside_03_07_fraction": 0.0,
 381          "median_depth": 42.0,
 382          "binomial_sd": 0.07712261068475397,
 383          "variance_ratio": 0.8008256915573191
 384        },
 385        "80+": {
 386          "sites": 0
 387        }
 388      }
 389    },
 390    "overlap_diagnostics": {
 391      "bam_q20": {
 392        "sites": 2213,
 393        "sites_with_repeated_qualifying_observations": 1723,
 394        "mean_absolute_read_vs_fragment_baf_difference": 0.013810806971843313,
 395        "maximum_absolute_read_vs_fragment_baf_difference": 0.0892857142857143,
 396        "tied_conflicts": 1,
 397        "other_base_observations": 19
 398      },
 399      "bam_q30": {
 400        "sites": 2212,
 401        "sites_with_repeated_qualifying_observations": 1666,
 402        "mean_absolute_read_vs_fragment_baf_difference": 0.013823983659758074,
 403        "maximum_absolute_read_vs_fragment_baf_difference": 0.0892857142857143,
 404        "tied_conflicts": 1,
 405        "other_base_observations": 11
 406      }
 407    },
 408    "selection": {
 409      "chr1:20000001-22000000": {
 410        "vcf_records": 3510,
 411        "sv_masked": 1453,
 412        "not_heterozygous": 1095,
 413        "not_biallelic_snp": 820,
 414        "low_or_missing_gq": 142,
 415        "eligible": 0,
 416        "selected": 0
 417      },
 418      "chr6:20000001-22000000": {
 419        "vcf_records": 3455,
 420        "not_biallelic_snp": 868,
 421        "not_heterozygous": 946,
 422        "low_or_missing_gq": 98,
 423        "sv_masked": 94,
 424        "low_informative_ad_depth": 2,
 425        "eligible": 1447,
 426        "selected": 1447
 427      },
 428      "chr12:20000001-22000000": {
 429        "vcf_records": 4664,
 430        "sv_masked": 2010,
 431        "not_heterozygous": 1577,
 432        "not_biallelic_snp": 878,
 433        "low_or_missing_gq": 198,
 434        "low_informative_ad_depth": 1,
 435        "eligible": 0,
 436        "selected": 0
 437      },
 438      "chr20:20000001-22000000": {
 439        "vcf_records": 2361,
 440        "not_biallelic_snp": 483,
 441        "not_heterozygous": 942,
 442        "low_or_missing_gq": 53,
 443        "sv_masked": 117,
 444        "eligible": 766,
 445        "selected": 766
 446      }
 447    },
 448    "sv_mask_record_counts": {
 449      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/NA12881.all.vcf.gz": 3665,
 450      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/call_sv/genome/likeable_sled_sv.vcf.gz": 3488
 451    },
 452    "gens_join": {
 453      "chr1:20000001-22000000": {
 454        "missing": 0
 455      },
 456      "chr6:20000001-22000000": {
 457        "duplicate_records": 1,
 458        "matched": 1361,
 459        "identical_duplicate_sites": 1,
 460        "missing": 86
 461      },
 462      "chr12:20000001-22000000": {
 463        "missing": 0
 464      },
 465      "chr20:20000001-22000000": {
 466        "duplicate_records": 0,
 467        "matched": 691,
 468        "missing": 75
 469      }
 470    }
 471  }
````

## `volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/manifest.json`

````
   1  {
   2    "started_at": "2026-09-05T20:51:20.935904+00:00",
   3    "mode": "fixed_exploratory_pilot",
   4    "smoke_sites_per_window": null,
   5    "config": {
   6      "sample": "Seq25-16025",
   7      "truth_sample": "NA12881",
   8      "genome_build": "GRCh38",
   9      "bam": "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/alignment/Seq25-16025_sorted_md.bam",
  10      "vcf": "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/call_snv/genome/likeable_sled_snv.vcf.gz",
  11      "baf": "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/gens/Seq25-16025_gens.baf.bed.gz",
  12      "sv_vcfs": [
  13        "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/NA12881.all.vcf.gz",
  14        "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/call_sv/genome/likeable_sled_sv.vcf.gz"
  15      ],
  16      "windows": [
  17        {
  18          "chrom": "chr1",
  19          "start": 20000001,
  20          "end": 22000000
  21        },
  22        {
  23          "chrom": "chr6",
  24          "start": 20000001,
  25          "end": 22000000
  26        },
  27        {
  28          "chrom": "chr12",
  29          "start": 20000001,
  30          "end": 22000000
  31        },
  32        {
  33          "chrom": "chr20",
  34          "start": 20000001,
  35          "end": 22000000
  36        }
  37      ],
  38      "sv_padding": 10000,
  39      "minimum_gq": 30,
  40      "minimum_informative_depth": 10,
  41      "maximum_sites_per_window": 1500,
  42      "maximum_pileup_depth": 10000,
  43      "bam_settings": [
  44        {
  45          "name": "bam_q20",
  46          "mapq": 20,
  47          "baseq": 20
  48        },
  49        {
  50          "name": "bam_q30",
  51          "mapq": 30,
  52          "baseq": 30
  53        }
  54      ]
  55    },
  56    "config_sha256": "dc87d4407cfbe3a439ad6fe322497dea65144c07b0e5aa4562f16b23e56807cf",
  57    "protocol_sha256": "3588c571a740c08404efd73fd332c1755661d77fbf86ddea2d8b1402bcafe1e1",
  58    "script_sha256": "7aa8e72ad46833227c9ee3a9a3f64d4ea0be8d5643a44f9f29268ffa4b989da8",
  59    "versions": {
  60      "python": "3.12.13",
  61      "pysam": "0.24.0",
  62      "samtools": "1.23.1"
  63    },
  64    "inputs": {
  65      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/alignment/Seq25-16025_sorted_md.bam": {
  66        "size": 37992397281,
  67        "mtime_ns": 1771607533276916326,
  68        "index_sha256": "85ccd0c1243e4e49887325156b0fd68a5cfb96229c3054266947e452429e689c"
  69      },
  70      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/call_snv/genome/likeable_sled_snv.vcf.gz": {
  71        "size": 112485653,
  72        "mtime_ns": 1771631643912528973,
  73        "index_sha256": "aece5c67e404582d85f240b0a97fa8ebcdcbf7eb88e061b469823315eba0d776"
  74      },
  75      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/gens/Seq25-16025_gens.baf.bed.gz": {
  76        "size": 43747682,
  77        "mtime_ns": 1771630988849824396,
  78        "index_sha256": "c0ebd3aedb1450a47d32a5237bc0b1d13f1b8667b1bf3b08db4f6e9c49152887"
  79      },
  80      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/NA12881.all.vcf.gz": {
  81        "size": 5561267,
  82        "mtime_ns": 1788510518422151783,
  83        "index_sha256": "7218f321055fe24435918110d0f3791a1c5bba3394d42bba986b7e81b9e1d84c"
  84      },
  85      "/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/Seq25-16025/raredisease_results/call_sv/genome/likeable_sled_sv.vcf.gz": {
  86        "size": 3892236,
  87        "mtime_ns": 1771650179389014502,
  88        "index_sha256": "0a2fc09d2eabd33c07fd499193fce3cbfd31d5f10319a8d48c580c894f8f8002"
  89      }
  90    },
  91    "completed_at": "2026-09-05T20:51:26.119078+00:00",
  92    "selected_sites": 2213
  93  }
````
