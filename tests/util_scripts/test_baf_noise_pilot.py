import gzip
import json
from pathlib import Path
from unittest.mock import Mock

import pysam
import pytest

from utils.baf_noise_pilot import (
    count_observations,
    describe,
    is_masked,
    join_gens,
    merge_intervals,
    run,
)


def test_mask_uses_one_based_sites_against_half_open_intervals():
    intervals = merge_intervals([(99, 110), (109, 120), (200, 210)])
    assert intervals == [(99, 120), (200, 210)]
    assert not is_masked(99, intervals)
    assert is_masked(100, intervals)
    assert is_masked(120, intervals)
    assert not is_masked(121, intervals)


def test_overlapping_mates_are_one_fragment_not_two_reads():
    counts = count_observations(
        [
            ("pair", "A", 30, 60, False),
            ("pair", "A", 30, 60, True),
            ("other", "C", 30, 60, False),
        ],
        "A",
        "C",
        20,
        20,
    )
    assert counts["reads_ref"] == 2
    assert counts["ref"] == 1
    assert counts["alt"] == 1


def test_conflicting_mates_use_better_base_quality_or_are_excluded():
    counts = count_observations(
        [
            ("better", "A", 30, 60, False),
            ("better", "C", 40, 60, True),
            ("tied", "A", 30, 60, False),
            ("tied", "C", 30, 60, True),
        ],
        "A",
        "C",
        20,
        20,
    )
    assert counts["ref"] == 0
    assert counts["alt"] == 1
    assert counts["conflicts"] == 1


def test_filters_and_other_alleles_do_not_create_reference_support():
    counts = count_observations(
        [
            ("low-base", "C", 5, 60, False),
            ("low-map", "C", 40, 10, False),
            ("unknown-map", "C", 40, 255, False),
            ("other", "G", 40, 60, False),
            ("ref", "A", 40, 60, False),
        ],
        "A",
        "C",
        20,
        20,
    )
    assert counts["ref"] == 1
    assert counts["alt"] == 0
    assert counts["other"] == 1


def test_known_unbalanced_counts_are_not_shrunk_toward_half():
    observations = [(f"ref-{index}", "A", 40, 60, False) for index in range(10)]
    observations += [(f"alt-{index}", "C", 40, 60, True) for index in range(20)]
    counts = count_observations(observations, "A", "C", 30, 30)
    assert counts["alt"] / (counts["ref"] + counts["alt"]) == pytest.approx(2 / 3)


def test_summary_does_not_pass_empty_or_mismatched_depths_as_low_noise():
    assert describe([]) == {"sites": 0}
    with pytest.raises(ValueError):
        describe([0.5], [])
    with pytest.raises(ValueError):
        describe([0.5], [0])
    result = describe([0.25, 0.75], [4, 4])
    assert result["variance_ratio"] == 1


def build_fixture(directory: Path):
    header = pysam.AlignmentHeader.from_dict(
        {
            "HD": {"VN": "1.6", "SO": "coordinate"},
            "SQ": [{"SN": "chr1", "LN": 10000}],
            "RG": [{"ID": "group", "SM": "sample"}],
        }
    )
    bam = directory / "input.bam"
    with pysam.AlignmentFile(str(bam), "wb", header=header) as handle:
        for index in range(33):
            read = pysam.AlignedSegment(header)
            read.query_name = f"fragment-{index}"
            if index >= 30:
                read.flag = (1024, 256, 2048)[index - 30]
            read.reference_id = 0
            read.reference_start = 90
            read.cigarstring = "30M"
            read.mapping_quality = 60
            sequence = list("A" * 30)
            sequence[9] = "C" if index >= 10 else "A"
            read.query_sequence = "".join(sequence)
            read.query_qualities = pysam.qualitystring_to_array("I" * 30)
            read.set_tag("RG", "group")
            handle.write(read)
    pysam.index(str(bam))
    vcf_header = pysam.VariantHeader()
    vcf_header.contigs.add("chr1", length=10000)
    for key, number, field_type in (
        ("GT", 1, "String"),
        ("AD", "R", "Integer"),
        ("DP", 1, "Integer"),
        ("GQ", 1, "Integer"),
    ):
        vcf_header.formats.add(key, number, field_type, key)
    vcf_header.info.add("SVLEN", 1, "Integer", "SV length")
    vcf_header.add_sample("sample")
    vcf = directory / "snps.vcf.gz"
    with pysam.VariantFile(str(vcf), "wz", header=vcf_header) as handle:
        for position in (100, 110):
            record = handle.new_record(
                contig="chr1", start=position - 1, stop=position, alleles=("A", "C")
            )
            record.filter.add("PASS")
            record.samples["sample"]["GT"] = (0, 1)
            record.samples["sample"]["AD"] = (10, 20)
            record.samples["sample"]["DP"] = 40
            record.samples["sample"]["GQ"] = 99
            handle.write(record)
    pysam.tabix_index(str(vcf), preset="vcf")
    sv = directory / "sv.vcf.gz"
    with pysam.VariantFile(str(sv), "wz", header=vcf_header) as handle:
        record = handle.new_record(
            contig="chr1", start=109, stop=111, alleles=("AA", "A")
        )
        record.info["SVLEN"] = -1
        handle.write(record)
    pysam.tabix_index(str(sv), preset="vcf")
    bed = directory / "baf.bed"
    bed.write_text("d_1\t99\t100\t0.5\nd_1\t109\t110\t0.5\n")
    pysam.tabix_compress(str(bed), str(bed) + ".gz")
    pysam.tabix_index(str(bed) + ".gz", preset="bed")
    config = {
        "sample": "sample",
        "bam": str(bam),
        "vcf": str(vcf),
        "baf": str(bed) + ".gz",
        "sv_vcfs": [str(sv)],
        "windows": [{"chrom": "chr1", "start": 1, "end": 1000}],
        "sv_padding": 0,
        "minimum_gq": 30,
        "minimum_informative_depth": 10,
        "maximum_sites_per_window": 100,
        "maximum_pileup_depth": 10000,
        "bam_settings": [
            {"name": "bam_q20", "mapq": 20, "baseq": 20},
            {"name": "bam_q30", "mapq": 30, "baseq": 30},
        ],
    }
    config_path = directory / "pilot.json"
    config_path.write_text(json.dumps(config))
    (directory / "protocol.md").write_text("Synthetic unit-test protocol")
    return config_path


def test_indexed_end_to_end_masks_and_counts_without_modifying_inputs(tmp_path):
    config_path = build_fixture(tmp_path)
    output = tmp_path / "results"
    summary = run(config_path, output)
    assert summary["selected_sites"] == 1
    assert summary["selection"]["chr1:1-1000"]["sv_masked"] == 1
    metrics = summary["groups"]["common_bam_sites"]
    assert metrics["vcf_alt_dp"]["mean"] == 0.5
    assert metrics["vcf_alt_adsum"]["mean"] == pytest.approx(2 / 3)
    assert metrics["bam_q20"]["mean"] == pytest.approx(2 / 3)
    assert metrics["bam_q30"]["median_depth"] == 30
    assert metrics["gens_stored"]["mean"] == 0.5
    with gzip.open(output / "sites.tsv.gz", "rt") as handle:
        assert "fragment-" not in handle.read()
    with pytest.raises(ValueError, match="never overwritten"):
        run(config_path, output)


def test_capped_pileups_are_not_reported_as_complete_measurements(tmp_path):
    config_path = build_fixture(tmp_path)
    config = json.loads(config_path.read_text())
    config["maximum_pileup_depth"] = 5
    config_path.write_text(json.dumps(config))
    summary = run(config_path, tmp_path / "capped-results")
    assert summary["capped_sites"] == 1
    assert summary["groups"]["all_selected"]["bam_q20"] == {"sites": 0}


def test_complete_exclusion_stops_instead_of_producing_a_clean_baseline(tmp_path):
    config_path = build_fixture(tmp_path)
    config = json.loads(config_path.read_text())
    config["sv_padding"] = 1000
    config_path.write_text(json.dumps(config))
    with pytest.raises(ValueError, match="No eligible SNPs"):
        run(config_path, tmp_path / "empty-results")


def test_stored_baf_duplicates_are_audited_and_conflicts_are_not_chosen():
    indexed = Mock()
    indexed.contigs = ["d_1"]
    indexed.fetch.return_value = iter(
        [
            "d_1\t99\t100\t0.5",
            "d_1\t99\t100\t0.5",
            "d_1\t199\t200\t0.3",
            "d_1\t199\t200\t0.7",
        ]
    )
    rows = [{"pos": 100}, {"pos": 200}]
    counts = join_gens(indexed, rows, {"chrom": "chr1", "start": 1, "end": 300})
    assert rows[0]["gens_stored"] == 0.5
    assert rows[1]["gens_stored"] is None
    assert counts["duplicate_records"] == 2
    assert counts["identical_duplicate_sites"] == 1
    assert counts["ambiguous_sites"] == 1
    assert counts["matched"] == 1
    assert counts["missing"] == 1
