# Review of the BAF visualization concept

**Reviewer:** Fable 5.1 (Claude, via Claude Code). **Date:** 2026-09-06.
**Reviewed:** [concept.md](concept.md) as of 2026-09-05, read together with
[analysis.md](analysis.md), [protocol.md](protocol.md), [datasets.md](datasets.md),
[research-log.md](research-log.md), [research-tree.yaml](research-tree.yaml),
[literature/evidence-map.md](literature/evidence-map.md), the pilot output in
`volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/`, and the NA12881
prepared truth VCF in the adjacent cnv_validation repository.

Section numbers below refer to concept.md as it was before this review. Every
number quoted here was computed during the review; the commands are recorded in
[Measurements](#measurements-made-for-this-review). Nothing in this review is a
benchmark of any model. Items marked **assumption** were not verified.

## Verdict

The concept is careful and points in the right direction. Regional
minor-haplotype fraction is the right first estimand, keeping raw points is
right, and starting from an existing unphased count-likelihood method before
inventing one is right.

It is over-hedged and under-designed. Roughly forty percent of the text states
what the proposal is not. The parts that state what it is have three defects
that would make the first comparison uninformative as written: the modeled layer
is blind to deletions and LOH (C1), the fixed-bin design cannot resolve the
positive controls that exist (C2), and heterozygote selection from the sample's
own caller removes sites in proportion to how strong the imbalance is (C3).

The arithmetic also supports the proposal more strongly than the document's tone
implies. Under the pilot's own measurements a full three-copy duplication is
more than ten standard deviations from balanced in a 100 kb bin. The open
question is not whether pooling works, but how small an event it can resolve.

## Ranked concerns

### C1. Deletions and LOH are invisible to the modeled layer as designed (Sec 4, 5, 6) — defect

The likelihood in Section 5 is conditioned on heterozygous sites. A heterozygous
deletion, a homozygous deletion, or copy-neutral LOH removes heterozygosity. The
concept correctly says such a region must not be displayed as balanced (Sec 6),
but then proposes to render it as a neutral missing state (Sec 4). The absence
of heterozygotes where the genome-wide rate predicts many is itself the signal,
and it is the signal for the most common clinically relevant CNV class.

**Failure scenario.** A 60 kb heterozygous deletion at 0.5 hets/kb removes about
30 expected heterozygotes. The modeled layer shows grey. The raw layer shows a
gap that the user has to notice unaided, which is the situation today.

**Least complicated fix.** Add a second channel to the modeled layer:
heterozygote density per bin, observed divided by expected, where expected comes
from a fixed site list (see C3) scaled by the sample's genome-wide heterozygous
rate. This is a count ratio with a Poisson-style uncertainty, needs no model
fitting, and makes "uninformative" distinguishable from "no heterozygotes".

**Supporting measurement.** The NA12881 prepared truth contains 4,180 autosomal
heterozygous `DEL` records, of which 100 span at least 10 kb and 4 at least
50 kb, plus 2,286 homozygous `DEL` records (45 at least 10 kb, 21 at least 50 kb).
It contains 727 heterozygous `DUP` records, of which 1 spans at least 10 kb.
datasets.md counted only duplications. Deletions are the larger and longer
positive-control set for this cohort. Whether individual records are supported
by SNP evidence remains to be checked, as datasets.md already requires for DUPs.

### C2. Fixed bins cannot resolve the positive controls that exist (Sec 6 versus Sec 8) — defect in evaluation design

Section 6 prefers fixed bins at predeclared scales. Section 8 reports that most
candidate duplication spans are short; the longest heterozygous DUP in NA12881
spans about 10 kb. The document does not connect the two.

Using the pilot's own inputs, heterozygous density 0.38–0.72 per kb after
masking and median informative depth 30, and assuming binomial sampling with
independent fragments (the pilot's variance ratio was 1.00 for VCF AD-sum BAF),
the standard deviation of a pooled minor-fraction estimate and the resulting
separation from 0.5 are:

| Bin | Hets | Fragments | SD of f | Full 3-copy dup, f = 1/3 | 20 percent mosaic gain, f ≈ 0.45 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 kb | 4–7 | 110–220 | 0.034–0.047 | 3.6–4.9 SD | 1.1–1.5 SD |
| 50 kb | 19–36 | 570–1,080 | 0.015–0.021 | 8.0–11.0 SD | 2.4–3.3 SD |
| 100 kb | 38–72 | 1,140–2,160 | 0.011–0.015 | 11.3–15.5 SD | 3.4–4.6 SD |
| 500 kb | 190–360 | 5,700–10,800 | 0.005–0.007 | 25–35 SD | 7.5–10.4 SD |
| 1 Mb | 380–720 | 11,400–21,600 | 0.003–0.005 | 36–49 SD | 10.7–14.7 SD |

This is arithmetic, not a benchmark, and it ignores fragment reuse (C5),
reference bias and genotype error. It still shows the shape of the problem.

**Failure scenario.** A 10 kb full duplication inside a 100 kb bin shifts the
pooled fraction by about 0.017, which is 1.1–1.5 SD. It is invisible. The
comparison in Section 9 would then report that the model fails to separate
known events, and the conclusion would be about bin size, not about the model.

**Least complicated fix.** In the evaluation, compute the likelihood over each
known event interval as well ("oracle bins"). Oracle bins give the upper bound
on what the model can do with these data; fixed bins give the realistic
display. Report both. If the oracle-bin likelihood cannot separate a 10 kb full
duplication from balanced at this coverage, the approach cannot be rescued by
better binning. If it can, the fixed-bin result tells you what display
resolution is honest.

### C3. Caller-derived heterozygote selection is directionally biased against strong imbalance (Sec 5, 7) — defect

Section 5 lists genotype ascertainment as an assumption to watch. It is worse
than that: the bias has a direction. Heterozygotes come from the sample's own
diploid variant caller. As allelic imbalance grows (LOH, high cell-fraction
mosaic loss, high-level amplification), the caller stops emitting 0/1 at those
sites. The sites that carry the strongest signal are the ones removed before
the model sees them. For a germline three-copy duplication (10 of 30 reads
alternate) the caller will usually still emit 0/1, so this concern is smaller
for the immediate goal and larger for everything the concept lists as later.

**Failure scenario.** A mosaic copy-neutral LOH at 70 percent cell fraction
gives fractions near 0.15 and 0.85. Many of those sites are called homozygous.
The modeled layer sees a thinned set of remaining heterozygotes and reports a
weaker imbalance than is present, or grey.

**Least complicated fix.** Count REF and ALT at a fixed external list of common
SNP sites regardless of the sample's genotype call (the approach GATK
CollectAllelicCounts takes with a sites list), and determine heterozygosity
from the counts with an outlier-tolerant model, as GATK ModelSegments does. The
same list supplies the expected heterozygote count for C1. If the first
comparison keeps caller-based selection for speed, the het-density channel from
C1 at least makes the removal visible.

### C4. Independent phase is already available from the pedigree (Sec 8, 10) — missed opportunity

Section 10 defers phase-aware inference until "independent phase or
uncertainty-aware phase inference" is available. It is available. The father
(NA12877) is in the cohort with a BAM, and protocol.md records that NA12878's
high-confidence small-variant truth is staged locally. That is a trio for each
of the five children, which allows Mendelian phasing of the children's
heterozygotes without any reference panel. The prepared truth SVs are themselves
phased (`0|1` versus `1|0`), so a duplication's haplotype is known.

This does not give production Gens phasing. It gives an upper bound on what
phasing could add, on the same samples and events as the unphased comparison,
which is exactly the information needed to decide whether production phasing
is worth building.

**Assumption:** the staged NA12878 file is a genotype VCF suitable for trio
phasing. Its path and format were not opened during this review.

### C5. Cross-SNP fragment reuse is common and should be measured, not assumed (Sec 5)

Section 5 is right that per-SNP mate deduplication does not make regional
evidence independent. The review measured how often it matters: 53 percent of
the chromosome 6 pilot sites (772 of 1,446 gaps) and 42 percent of the
chromosome 20 sites (318 of 765) have a neighbouring selected heterozygote
within 500 bp. A typical fragment therefore frequently covers two selected
sites. The effective number of independent fragments in a bin is smaller than
the sum of per-site depths.

This is a correction factor, not a blocker. The pilot already has the BAM,
the site list and the counting code. Counting fragments that carry more than
one selected site in the two retained windows is a small addition to
`utils/baf_noise_pilot.py` and gives the factor directly. Until it is measured,
the SDs in the C2 table are optimistic by an unknown amount, plausibly tens of
percent rather than a multiple.

### C6. No primary endpoint (Sec 9) — defect in evaluation design

Section 9 lists six evaluation dimensions and defers all thresholds. The
document's own principle is that criteria are fixed before data are examined.
Six co-equal metrics with no thresholds cannot reject anything.

**Least complicated fix.** Name one primary endpoint and make the rest
secondary. A candidate shape: in oracle bins over independently supported
heterozygous events with at least N informative sites, the modeled minor
fraction is at least k SD below 0.5; in matched bins in a noncarrier sibling and
in the presumed-neutral pilot windows, the fraction of bins reported as split is
at most x. N, k and x are placeholders to be agreed before the run. They should
be chosen from the C2 arithmetic and the C5 correction, not from a plot.

## Optional improvements

- **Mosaic scope (Sec 2, 6).** State whether sub-clonal events are in scope for
  the first comparison. From the C2 table, a 20 percent mosaic gain is reachable
  at 100 kb and not at 10 kb; the decision fixes the smallest useful bin.
- **Sex chromosomes (Sec 6, 7).** Male chrX outside the pseudoautosomal regions
  and chrY have no heterozygotes. The het-density channel needs an expected
  value of zero there, not a deletion call. Note that
  `utils/generate_gens_data.py` only started accepting haploid genotypes on
  2026-09-05.
- **Contamination (Sec 4).** Sample contamination appears as genome-wide
  imbalance. Display the genome-wide modal minor fraction as a baseline so a
  global shift is not read as one very large event.
- **Bin scales (Sec 6).** Gens already has fixed resolution levels
  (`ZoomLevel` o/a/b/c/d in `gens/models/sample.py`). Align the predeclared
  bin scales with them rather than introducing a second scheme.
- **Relation to the existing histogram (Sec 4, 9).** The BAF histogram added in
  commit 83c81d92 is a one-dimensional distribution of raw values in the current
  interval at resolution d. The proposed position-by-fraction likelihood is that
  histogram computed per bin and weighted by counts. Saying so makes the
  proposal a small step from a feature that already exists.
- **Document shape.** Move the caveats into one Limits section and keep the
  design sections declarative. After this review the "intended reviewer"
  framing in Sections 1 and 11 can be replaced by a link to this file.

## Answers to the decisions requested in Section 11

1. **Estimand.** Yes, regional minor-haplotype fraction, with heterozygote
   density as a second estimand (C1).
2. **Baseline.** CNVpytor first: WGS-native, unphased, no segmentation step,
   runs on a VCF in hours. GATK ModelSegments second, for its reference-bias
   and outlier terms and because it accepts predefined segments, which makes
   oracle bins easy. Pin versions and options; `reduce_noise` off.
3. **Unacceptable assumptions.** Caller-derived heterozygote selection without a
   density channel (C3, C1). The remaining assumptions are tolerable for a
   prototype if they are stated.
4. **Weak or bimodal likelihoods.** Show the likelihood width and the
   contributing site and fragment counts, not only the peak. Draw no band
   summary when the likelihood is multimodal or wider than a preset cutoff.
   Never colour-normalise per bin.
5. **Controls and metrics.** C6, plus oracle versus fixed bins (C2), plus
   noncarrier siblings at the same loci.
6. **Minimum data additions.** None to acquire. Count and SNP-inventory the
   deletions (C1); trio-phase the children (C4); measure fragment reuse (C5).
7. **Defer.** Normal-panel calibration, phasing in production, calling, and
   adaptive segmentation. Keep: raw view, per-bin likelihood, het density,
   oracle-bin evaluation.

## Recommended first comparison

Run CNVpytor, pinned version, `reduce_noise` off, on NA12881 and one sibling
that does not carry the events chosen, using the existing SNV VCFs. Export the
binned BAF likelihood at 10 kb and 100 kb. Examine three things, in this order:

1. The heterozygous deletions of at least 10 kb: does heterozygote density
   drop in the carrier and not in the noncarrier?
2. The heterozygous duplications of at least about 8 kb: does the oracle-bin
   likelihood separate from 0.5, and by how many SD?
3. The pilot's presumed-neutral windows: any bins reported as split?

No Gens code is required. The work is on the order of one day. A negative
result in step 2 at oracle resolution ends the approach at this coverage and
event size; a positive result gives the numbers needed to fix N, k and x.

## Unresolved data requirements

- SNP inventory inside each candidate deletion and duplication before it is
  used as a control (datasets.md already requires this for DUPs).
- Confirmation that the staged NA12878 genotypes support trio phasing (C4,
  assumption).
- The cross-SNP fragment-reuse factor (C5).
- Counts for the other five cohort samples; this review counted NA12881 only.
- Not verifiable from the documents: CNVpytor's actual defaults and binning on
  these inputs, and whether the ~10 kb DUP records are tandem duplications with
  SNP support.

## Measurements made for this review

All commands were run on 2026-09-06 from the Gens repository root. None wrote
to any tracked file or to the pilot output directory.

Heterozygote spacing, from the pilot's `sites.tsv.gz` (positions only):

```bash
zcat volumes/gens/data/baf_noise_pilot/Seq25-16025/pilot-v2/sites.tsv.gz | python3 -c "
import sys
hdr = sys.stdin.readline().rstrip('\n').split('\t')
ci = hdr.index('chrom'); pi = hdr.index('pos')
pos = {}
for line in sys.stdin:
    f = line.rstrip('\n').split('\t')
    pos.setdefault(f[ci], []).append(int(f[pi]))
for c, ps in pos.items():
    ps.sort()
    gaps = [b - a for a, b in zip(ps, ps[1:])]
    near = sum(g <= 500 for g in gaps)
    span_kb = (ps[-1] - ps[0]) / 1000
    print(c, len(ps), f'{len(ps)/span_kb:.2f}/kb', f'{near}/{len(gaps)}')
"
# chr6 1447 0.72/kb 772/1446
# chr20 766 0.39/kb 318/765
```

Pooled-estimate resolution, binomial with independent fragments:

```bash
python3 -c "
import math
for dens in (0.38, 0.72):
    for bin_kb in (10, 50, 100, 500, 1000):
        n = dens * bin_kb * 30
        sd = math.sqrt(0.25 / n)
        print(dens, bin_kb, round(sd, 4), round((0.5 - 1/3) / sd, 1), round(0.05 / sd, 1))
"
```

NA12881 autosomal truth records by type, genotype and span. Span is
`max(END - POS, |SVLEN|)`; no FILTER restriction, matching datasets.md.
`INS` records were excluded because their reference span is not the affected
interval.

```bash
T=/home/parlar_ai/dev/cnv_validation/from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/NA12881.all.vcf.gz
zcat $T | grep -v "^#" | awk -F'\t' '
{
  svtype=""; end=$2+0; svlen=0
  n=split($8,a,";"); for(i=1;i<=n;i++){ if(a[i]~/^SVTYPE=/){svtype=substr(a[i],8)} if(a[i]~/^END=/){end=substr(a[i],5)+0} if(a[i]~/^SVLEN=/){svlen=substr(a[i],7)+0; if(svlen<0)svlen=-svlen} }
  span=end-$2; if(svtype!="INS" && span<svlen)span=svlen
  split($10,g,":"); gt=g[1]
  if($1!~/^chr[0-9]+$/) next
  if(svtype=="INS") next
  key=svtype" "gt
  n_all[key]++; if(span>=10000)n10[key]++; if(span>=50000)n50[key]++; if(span>max[key]+0)max[key]=span
}
END{ for(k in n_all) printf "%-10s %8d %8d %8d %10d\n",k,n_all[k],n10[k]+0,n50[k]+0,max[k]+0 }' | sort
```

| Type, GT | Records | ≥ 10 kb | ≥ 50 kb | Max span, bp |
| --- | ---: | ---: | ---: | ---: |
| DEL 0\|1 | 2,073 | 48 | 3 | 90,483 |
| DEL 1\|0 | 2,107 | 52 | 1 | 60,228 |
| DEL 1\|1 | 2,286 | 45 | 21 | 96,355 |
| DUP 0\|1 | 368 | 1 | 0 | 10,429 |
| DUP 1\|0 | 359 | 0 | 0 | 9,281 |
| DUP 1\|1 | 304 | 0 | 0 | 847 |

The DUP rows reproduce the datasets.md count of 727 heterozygous records and
one span of at least 10 kb; the one-base difference in maximum span is the
POS convention.

## Limits of this review

- One reviewer, one pass, no access to the CNVpytor or GATK source beyond what
  the evidence map records.
- The resolution table is arithmetic under stated assumptions and is not a
  performance claim for any tool.
- Truth-record counts are record counts for one individual and are not
  independent events, confirmed dosages, or SNP-supported intervals.
- No model was run and no data left the machine.
