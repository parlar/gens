import gzip

import pytest

from gens.bedpe import (
    get_read_evidence,
    parse_bedpe,
    prepare_read_evidence,
    validate_evidence_file,
)
from gens.models.genomic import GenomeBuild

BUILD = GenomeBuild.HG38


def write_bedpe(tmp_path, lines):
    path = tmp_path / "input.bedpe"
    path.write_text("\n".join(lines) + "\n")
    return path


def test_index_finds_both_ends_and_deduplicates_same_chromosome(tmp_path):
    source = write_bedpe(
        tmp_path,
        [
            "chr1\t99\t100\tchr2\t499\t500\ttranslocation\t900\t+\t-\tsplit\t7\t40",
            "1\t149\t150\t1\t549\t550\tlocal\t0\t+\t+\tpair\t3\t30",
        ],
    )
    output = tmp_path / "evidence.gz"
    assert prepare_read_evidence(source, output, BUILD) == 2
    assert (
        get_read_evidence(output, "1", 100, 100, BUILD).connections[0].id
        == "translocation"
    )
    assert get_read_evidence(output, "2", 500, 500, BUILD).connections[0].fragments == 7
    assert get_read_evidence(output, "1", 99, 99, BUILD).connections == []
    result = get_read_evidence(output, "1", 1, 600, BUILD)
    assert len(result.connections) == 2
    assert result.records_examined == 3
    assert result.connections[1].fragments == 3


def test_bedpe_intervals_preserve_uncertainty_and_score_is_not_support(tmp_path):
    source = write_bedpe(tmp_path, ["1\t99\t130\t2\t499\t550\tinterval\t800\t.\t-"])
    connection = next(parse_bedpe(source))
    assert (connection.first.start, connection.first.end) == (100, 130)
    assert connection.kind == "unknown"
    assert connection.fragments is None
    assert connection.minimum_observed_mapq is None
    output = tmp_path / "evidence.gz"
    prepare_read_evidence(source, output, BUILD)
    assert len(get_read_evidence(output, "1", 130, 130, BUILD).connections) == 1
    assert get_read_evidence(output, "1", 131, 131, BUILD).connections == []
    assert (
        get_read_evidence(output, "1", 1, 600, BUILD, minimum_fragments=1).connections
        == []
    )


def test_filters_keep_unknown_support_distinct_from_zero(tmp_path):
    source = write_bedpe(
        tmp_path,
        [
            "1\t99\t100\t2\t499\t500\tknown\t0\t+\t-\tsplit\t7\t40",
            "1\t149\t150\t2\t549\t550\tunknown\t0\t+\t-\tpair\t.\t255",
        ],
    )
    output = tmp_path / "evidence.gz"
    prepare_read_evidence(source, output, BUILD)
    assert len(get_read_evidence(output, "1", 1, 600, BUILD).connections) == 2
    filtered = get_read_evidence(
        output, "1", 1, 600, BUILD, minimum_mapq=20, minimum_fragments=5
    )
    assert [connection.id for connection in filtered.connections] == ["known"]
    assert [
        connection.id
        for connection in get_read_evidence(
            output, "1", 1, 600, BUILD, kind="pair"
        ).connections
    ] == ["unknown"]


@pytest.mark.parametrize(
    "line",
    [
        "1\t-1\t10\t2\t10\t20\tbad\t0\t+\t-",
        "1\t10\t10\t2\t10\t20\tbad\t0\t+\t-",
        "1\t1\t10\t2\t10\t20\tbad\t0\tx\t-",
        "1\t1\t10\t2\t10\t20\tbad\t0\t+\t-\tpair\t-1\t20",
        "1\t1\t10\t2\t10\t20\tbad\t0\t+\t-\tguess\t1\t20",
        "1\t1\t10\t2\t10\t20",
    ],
)
def test_bad_input_never_publishes_output(tmp_path, line):
    output = tmp_path / "evidence.gz"
    with pytest.raises(ValueError, match="BEDPE line 1"):
        prepare_read_evidence(write_bedpe(tmp_path, [line]), output, BUILD)
    assert not output.exists()


def test_duplicate_names_are_rejected_instead_of_counted_twice(tmp_path):
    line = "1\t1\t10\t2\t10\t20\tduplicate\t0\t+\t-"
    with pytest.raises(ValueError, match="unique"):
        list(parse_bedpe(write_bedpe(tmp_path, [line, line])))


def test_gzipped_input_build_validation_and_non_destructive_output(tmp_path):
    source = tmp_path / "input.bedpe.gz"
    with gzip.open(source, "wt") as handle:
        handle.write("1\t99\t100\t2\t499\t500\tlink\t0\t+\t-\n")
    output = tmp_path / "evidence.gz"
    prepare_read_evidence(source, output, BUILD)
    validate_evidence_file(output, BUILD)
    with pytest.raises(ValueError, match="genome build"):
        validate_evidence_file(output, GenomeBuild.HG37)
    original = output.read_bytes()
    with pytest.raises(ValueError, match="never overwritten"):
        prepare_read_evidence(source, output, BUILD)
    assert output.read_bytes() == original


def test_limits_are_reported_as_partial_results(tmp_path):
    source = write_bedpe(
        tmp_path,
        [
            f"1\t{index}\t{index + 1}\t2\t10\t20\tlink-{index}\t0\t+\t-"
            for index in range(3)
        ],
    )
    output = tmp_path / "evidence.gz"
    prepare_read_evidence(source, output, BUILD)
    assert not get_read_evidence(output, "1", 1, 3, BUILD, max_connections=3).truncated
    assert get_read_evidence(output, "1", 1, 3, BUILD, max_connections=2).truncated
    assert get_read_evidence(output, "1", 1, 3, BUILD, max_records=2).truncated
    with pytest.raises(ValueError, match="at most"):
        get_read_evidence(output, "1", 1, 1000001, BUILD)
