# Candidate inputs for further BAF evaluation

Verified on 2026-09-05 by read-only inspection of the adjacent cnv_validation
repository. This is an input inventory, not a model evaluation or evidence that
any correction improves sensitivity. No additional BAM allele counts were extracted.

## Verified pedigree samples

The authoritative sample table and pedigree identify the following mappings.
For every row, the primary WGS BAM passed a header/EOF quickcheck, its index was
readable, the header sample matched the Seq ID, and chr1 length was 248956422.
Matching indexed SNV VCFs, indexed Gens BAF tracks, and per-sample truth VCFs
were present. SNV and truth sample IDs matched their respective mapping columns.
This does not constitute a full BAM integrity scan or immutable provenance audit.

| Seq ID | Sample | Pipeline case | Mean filtered coverage from existing Picard report |
| --- | --- | --- | ---: |
| Seq25-16020 | NA12877 | oceanic_swamp | 28.863853 |
| Seq25-16022 | NA12879 | graceful_junk | 28.832448 |
| Seq25-16025 | NA12881 | likeable_sled | 28.897216 |
| Seq25-16028 | NA12882 | wild_ceiling | 28.930272 |
| Seq25-16030 | NA12885 | perfect_tapioca | 28.325995 |
| Seq25-16032 | NA12886 | overwrought_rainy | 28.559535 |

NA12877 is the father of the other listed individuals. NA12878 is their mother
in the pedigree, but is not a BAM sample in this configured cohort. Consequently,
these are not independent families. They can support exploratory consistency and
segregation checks; splitting siblings between calibration and evaluation does
not provide family-independent validation of a learned site-bias correction.

## Callset identity and coordinate caveats

The configured merged truth contains sample IDs NA12877, NA12878, NA12879,
NA12881, NA12882, NA12885 and NA12886, and declares a GRCh38 no-ALT reference.
Project provenance identifies this as a Platinum Pedigree/CEPH-1463 SV source
with local duplication-aware processing. It should not be described as a generic
GIAB SV benchmark for arbitrary samples. The staged high-confidence region BED
is specifically NA12878's; it is not independent proof of callability or neutrality
in the other individuals. No separate matching official HG002 SV benchmark was
verified in this inspection.

The duplication-aware source is derived from a representation in which some
tandem duplications were encoded as insertions. Before using a record as a BAF
positive control, confirm the actually duplicated interval, genotype and dosage;
an insertion breakpoint is not necessarily the source interval whose BAF changes.
Reference spans are not assumed identical to inserted/copy-gained sequence length.

The following is a direct count of autosomal `SVTYPE=DUP` records with genotype
0/1 or 1/0 in each prepared `.all.vcf.gz`, without a FILTER restriction.
Length here is exactly `record.stop - record.start`. These are record counts,
not independent CNVs, orthogonally confirmed dosages, or a selection based on BAF.

| Sample | Heterozygous DUP records | Reference span at least 10 kb | Maximum reference span, bp |
| --- | ---: | ---: | ---: |
| NA12877 | 685 | 0 | 9282 |
| NA12879 | 735 | 2 | 13604 |
| NA12881 | 727 | 1 | 10430 |
| NA12882 | 721 | 1 | 13604 |
| NA12885 | 715 | 0 | 6321 |
| NA12886 | 749 | 2 | 13604 |

Most candidate spans are short. The number and distribution of informative SNPs
inside each candidate must be measured before claiming that it can evaluate
BAF-band separation or a regional likelihood model. Shared familial records
must not be counted as independent event discoveries.

## Separate engineered amplification sample

The primary BAM for Seq25-16150 is present, indexed, header-consistent and has
GRCh38-compatible chr1 length. Project manufacturer documentation identifies it
as the SeraCare Seraseq Solid Tumor CNV Mix on a GM24385/HG002 background, with
12 rows in the local per-target truth table.

This is an engineered amplification reference, not unmodified HG002 and not a
normal for bias calibration. Its documented total-copy-number targets do not
establish which haplotype was added or the expected per-SNP BAF. Construct
boundaries are also incompletely public. Use it for amplification evidence only
until allele-specific composition and appropriate intervals are independently
established. Do not transfer arbitrary HG002 germline expectations to the spike-ins.

## Locations

All paths below are relative to `/home/parlar_ai/dev/cnv_validation`:

```text
config/samples.tsv
config/samples.ped
config/evidence_manifest.yaml
config/config.yaml
from_rv/storage/userdata/cnv_validation/refdata/merged_hg38.svs.TRexclusion.dup_split.vcf.gz
from_rv/storage/userdata/cnv_validation/truvari_comparisons/prepared_truth/{NA_ID}.all.vcf.gz
from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/alignment/{SEQ_ID}_sorted_md.bam
from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/call_snv/genome/{CASE}_snv.vcf.gz
from_rv/storage/userdata/cnv_validation/wgs-cnv-validation/raredisease/{SEQ_ID}/raredisease_results/gens/{SEQ_ID}_gens.baf.bed.gz
seracare_solid_tumor_truthset_v1.0/README.md
seracare_solid_tumor_truthset_v1.0/seracare_cnv_truth.tsv
```

## Next decision

These inputs support a more informative exploratory positive-control comparison
than the first neutral-only pilot. First establish event intervals, distinguish
carriers from noncarriers, and inventory SNP support without looking for clean
bands. Then agree on a fixed raw-versus-modeled comparison and uncertainty/signal
preservation criteria. New individual- or family-independent controls would still
be needed for validation of a normal-panel correction. No new model run or
production processing change is recorded by this inventory.