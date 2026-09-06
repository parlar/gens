# WGS allele-frequency reliability: focused literature review

## Scope recorded before searching

Date: 2026-09-05. This is a bounded, targeted scoping review, not a systematic
review or a clinical performance assessment. The user requested published ways
to obtain more reliable WGS allele fractions or model their underlying values.
No further sample analysis, correction, or implementation is included.

Questions:

- Can systematic allele-count bias be estimated and removed without suppressing
  true copy-number or mosaic imbalance?
- Which count-likelihood or hierarchical models distinguish per-SNP uncertainty
  from regional allelic imbalance?
- Which phase-aware or unphased methods can support a separate Gens evidence
  track without replacing the observed allele fractions?

Planned discovery sources: PubMed, Europe PMC, OpenAlex. These indexes overlap;
their hit counts are not independent evidence or a count of unique studies.
Supplementary discovery uses named methods and primary-source citation links.
Record any inaccessible source rather than imply comprehensive coverage.

Search concepts: whole-genome sequencing AND (allele frequency OR allelic
imbalance) AND (bias OR beta-binomial OR haplotype). Use each service's native
query syntax, recording exact executed queries and actual returned results.

Include count-based statistical methods, mapping-bias methods, and allele-specific
CNV/mosaic methods with accessible papers or implementation documentation.
Prioritize WGS; retain WES, tumor/normal and allele-specific expression studies
only as explicitly labelled conceptual comparisons. Exclude unrelated species
frequency surveys, variant annotation alone, and cosmetic smoothing without an
estimand or uncertainty model. No publication-date cutoff is imposed.

Screen returned titles/abstracts for relevance, then inspect primary papers and
software documentation for selected methods. Do not import benchmark improvement
numbers unless their data regime and evaluation have been checked. Distinguish
published observations from applicability to this Gens dataset.

## Status

Focused review completed on 2026-09-05. See [evidence-map.md](evidence-map.md)
and [references.bib](references.bib). Published methods were inspected, not run
on Gens data. No new dataset efficacy claim, clinical recommendation, or model
implementation follows from this review.

## Executed discovery

The broad searches were deliberately bounded to the first returned page. The
counts below are the services' actual total hit counts at access time, not the
number of studies read. Indexes overlap and differ in full-text indexing and
query interpretation. These totals must not be summed as unique studies.

| Source | Exact query | Reported hits | Returned items screened |
| --- | --- | ---: | ---: |
| PubMed | `(whole genome sequencing) AND (allelic imbalance OR allele frequency) AND (bias OR beta-binomial OR haplotype)` | 373 | 10 |
| Europe PMC | `("whole genome" OR WGS) AND ("allele frequency" OR "allelic imbalance") AND (bias OR "beta binomial" OR haplotype)` | 24057 | 10 |
| OpenAlex | `whole genome allele frequency allelic imbalance bias correction` | 1974 | 8 |
| Europe PMC | `TITLE:CNVpytor` | 3 | 3 |
| Europe PMC | `TITLE:hapLOHseq` | 1 | 1 |
| Europe PMC | `TITLE:FACETS AND TITLE:"allele-specific"` | 2 | 2 |
| Europe PMC | `TITLE:WASP AND TITLE:"allele-specific"` | 4 | 4 |
| Europe PMC | `TITLE:"allele frequency" AND (TITLE:bias OR ABSTRACT:"beta-binomial")` | 4 | 4 |
| Europe PMC | `TITLE:biastools OR TITLE:"allelic bias" OR TITLE:"reference bias"` | 51 | 6 |
| Europe PMC | `TITLE:PureCN` | 1 | 1 |
| Europe PMC | `TITLE_ABS:"allelic imbalance" AND (TITLE_ABS:"beta-binomial" OR TITLE_ABS:"beta binomial" OR TITLE_ABS:"unphased")` | 8 | 6 |

PubMed discovery used its search webpage. Europe PMC used
`https://www.ebi.ac.uk/europepmc/webservices/rest/search` with `format=json`
and `resultType=core`; named-method searches were repeated in compact output
where terminal rendering truncated long abstracts. OpenAlex used
`https://api.openalex.org/works` with `search`, `per-page=8`, and selected
bibliographic fields. Repeated requests are not additional studies.

## Screening decisions

The broad PubMed page was dominated by population genetic variation, association,
imputation, and demographic-inference studies, rather than within-sample allele
count estimation. Those were not taken forward. The broad Europe PMC page yielded
the Tang WGS study; population-frequency, nonhuman population surveys, and generic
variant-caller comparisons were not taken forward. Its consensus-reference
benchmark preprint was not selected as the main mapping-bias evidence; directly
relevant peer-reviewed biastools and personalized-reference studies were found
by the targeted search. OpenAlex supplied FACETS and array-normalization papers;
array-intensity normalization was not treated as a sequencing-count solution.

| Record | Decision and reason |
| --- | --- |
| CNVpytor, PMID 34817058 | Include: WGS count-based regional likelihood; paper, documentation and implementation reviewed. |
| CNVpytor browser integration, PMID 39018173 | Retain implementation reference: browser integration rather than a new estimator; abstract and project links checked. |
| CNVpytor preprint | Deduplicate conceptually against the published article. |
| Tang et al., PMID 42156563 | Include: recent WGS haplotype-fragment inference, bias resources, and artifact controls; main paper and repository reviewed. |
| hapLOHseq, PMID 27288500 | Include: WES/WGS regional haplotype evidence; methodological text reviewed. |
| FACETS, PMID 27270079 | Include as tumor/normal comparator: paired log-odds mapping-bias cancellation; full-text methods reviewed. |
| FACETS chapter, PMID 35751811 | Secondary description; use the primary paper rather than count it as a separate method. |
| PureCN, PMID 27999612 | Include as assay-specific comparator: primary bibliographic record plus current NormalDB/beta-binomial documentation reviewed. |
| biastools, PMID 38641647 | Include: diagnosis of WGS mapping/reference bias rather than automatic denoising; methodological text reviewed. |
| biastools preprint | Deduplicate against the published article. |
| Personalized reference, PMID 41786604 | Include: WGS realignment and heterozygous-site balance; main paper reviewed. |
| Beta-binomial shrinkage, PMID 33796271 | Include as conceptual comparator only: empirical Bayes for allelic expression, not validated WGS CNV cleanup; methodological text reviewed. |
| Same shrinkage DOI in a preprint record | Duplicate publication identity, not independent validation. |
| easyVAF, PMID 37606183 | Not a primary candidate: group-comparison tests rather than regional BAF estimation; abstract screened. |
| WASP, PMID 26366987 | Context only: RNA-seq/ChIP-seq bias correction; abstract reviewed, full-text XML unavailable. |
| STAR+WASP preprint | Not taken forward: RNA-seq and not a WGS-specific validation. |
| WASP PCR primer-design paper | Exclude: unrelated tool sharing the name. |
| Population allele-frequency threshold/missingness models | Exclude: different estimand from within-sample WGS allele balance. |
| ASPEN, sugarcane expression, QuASAR-MPRA | Exclude from WGS candidates: assay/task mismatch. |
| Phylogenomic, neuroimaging and preventive-medicine reference-bias records | Exclude: unrelated method or general perspective rather than a usable WGS count estimator. |

This is a targeted evidence map with explicit exclusions, not exhaustive PRISMA
screening. Papers and preprints were deduplicated by DOI and method identity for
interpretation. No global included-study count or complete search recall is claimed.

## Retrieval limitations

- The Tang supplementary PDF URL returned a download-preparation page, not the
  supplement. Conclusions here rely on the accessible main article and repository;
  supplement-specific calibration details were not independently verified.
- The WASP Europe PMC full-text XML endpoint returned HTTP 404. Its abstract
  supports only the assay-level description used here.
- Current software documentation/source may differ from publication versions.
  No package was installed or benchmarked in this review; a future experiment
  must pin its own versions and parameters.
- Discovery queries used generic scientific terms only. No sample sequence,
  read names, variants, or patient data were submitted to external services.