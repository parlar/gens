"""Parsing BED annotation files.

BED is written with anywhere from three to twelve columns, and public
annotation tables are usually distributed with four or six. These tests pin
down that a shorter file loads with sensible defaults rather than being
rejected wholesale.
"""

import pytest
from bson import ObjectId

from gens.load.annotations import fmt_bed_to_annotation, parse_bed_file
from gens.models.genomic import GenomeBuild

TRACK_ID = ObjectId()


def entry(**overrides) -> dict[str, str]:
    row = {"chrom": "chr1", "chrom_start": "10000", "chrom_end": "20000"}
    row.update(overrides)
    return row


def convert(row: dict[str, str]):
    return fmt_bed_to_annotation(row, TRACK_ID, GenomeBuild(38))


class TestShorterFiles:
    def test_three_columns_are_enough(self):
        record = convert(entry())
        assert record.chrom == "1"
        assert (record.start, record.end) == (10001, 20000)

    def test_a_row_without_a_name_gets_the_placeholder(self):
        assert convert(entry()).name == "The Nameless One"

    def test_four_columns_keep_the_name(self):
        assert convert(entry(name="SegDup")).name == "SegDup"

    def test_six_columns_load(self):
        # The shape public annotation tables are usually distributed in.
        record = convert(entry(name="TR", score="789", strand="+"))
        assert record.name == "TR"

    def test_a_missing_colour_falls_back_to_the_default(self):
        # Not an assertion about which colour, only that one is chosen rather
        # than the record failing to build.
        assert convert(entry(name="SegDup")).color is not None

    def test_a_supplied_colour_is_used(self):
        record = convert(entry(name="SegDup", item_rgb="150,90,60"))
        assert record.color.as_rgb_tuple()[:3] == (150, 90, 60)


class TestRequiredFields:
    @pytest.mark.parametrize("field", ["chrom", "chrom_start", "chrom_end"])
    def test_a_row_without_a_place_is_refused(self, field):
        row = entry()
        del row[field]
        with pytest.raises(ValueError, match="BED row has no"):
            convert(row)

    def test_the_message_names_what_is_missing(self):
        row = entry()
        del row["chrom_end"]
        with pytest.raises(ValueError, match="end"):
            convert(row)


class TestCoordinates:
    def test_start_moves_from_zero_based_to_one_based(self):
        # BED counts from zero and Gens from one; an off-by-one here would
        # shift every annotation in the browser by a base.
        assert convert(entry(chrom_start="0", chrom_end="100")).start == 1

    def test_end_is_unchanged(self):
        assert convert(entry(chrom_start="0", chrom_end="100")).end == 100

    def test_the_chr_prefix_is_dropped(self):
        assert convert(entry(chrom="chr22")).chrom == "22"

    def test_a_name_without_the_prefix_still_works(self):
        assert convert(entry(chrom="22")).chrom == "22"


class TestFileParsing:
    def test_a_six_column_file_round_trips(self, tmp_path):
        path = tmp_path / "repeats.bed"
        path.write_text(
            "# a comment\n"
            "chr1\t10000\t10468\tTR~TAACCC\t789\t.\n"
            "chr2\t500\t900\tTR~AT\t120\t+\n"
        )
        rows = list(parse_bed_file(path))
        assert len(rows) == 2
        records = [convert(row) for row in rows]
        assert [record.chrom for record in records] == ["1", "2"]
        assert records[0].name == "TR~TAACCC"
