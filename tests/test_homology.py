"""Reading UCSC's segmental duplication table.

The whole value of this catalogue is that a breakpoint can be placed inside a
near-identical pair and the pair's partner named. Every one of those three
things -- the interval, the partner and the identity -- is read out of a fixed
column position, and `score` sits between `name` and `strand` where it is easy
to miss when counting by hand. Getting that wrong shifts identity into the
transversion count and produces a catalogue that looks entirely plausible and is
wrong throughout, so the positions are checked against a real row.
"""

import pytest

from gens.homology import normalise_contig, parse_super_dups

#: A verbatim row from `genomicSuperDups.txt.gz` for GRCh38, the segmental
#: duplication containing the chr11:49,688,000-49,736,000 deletion carried by
#: five of the six reference-pedigree samples. Its partner is the locus the
#: discordant reads at that deletion's right breakpoint point to.
REAL_ROW = (
    "120\tchr11\t49465497\t49791730\tchr11:88842206\t0\t-\tchr11\t88842206\t"
    "89159225\t317019\t6409\t1000\tN/A\tN/A\tN/A\tN/A\t"
    "align_both/0002/both0012916\t337839\t808\t32434\t305405\t296303\t9102\t"
    "5820\t3282\t0.970197\t0.967637\t0.0304114\t0.0304786"
)


def test_reads_a_real_row_off_the_right_columns():
    (pair,) = parse_super_dups([REAL_ROW])

    assert pair["chrom"] == "11"
    assert pair["partner_chrom"] == "11"
    assert pair["partner_start"] == 88842207
    assert pair["partner_end"] == 89159225
    # fracMatch, not fracMatchIndel and not a neighbouring count.
    assert pair["identity"] == pytest.approx(0.970197)
    # alignB, the aligned bases, not alignL which counts gaps too.
    assert pair["aligned_bases"] == 305405
    assert pair["orientation"] == "inverted"


def test_identity_is_the_matched_fraction_of_the_aligned_bases():
    # Ties the column choice to arithmetic rather than to a remembered index:
    # matchB / alignB is what fracMatch means, and only the right pair of
    # columns satisfies it.
    (pair,) = parse_super_dups([REAL_ROW])

    assert pair["identity"] == pytest.approx(296303 / 305405, abs=1e-6)


def test_coordinates_become_the_inclusive_interval_gens_speaks():
    # UCSC is 0-based half-open. Gens writes the interval the way a position is
    # written, so the start moves by one and the end does not.
    (pair,) = parse_super_dups([REAL_ROW])

    assert pair["start"] == 49465498
    assert pair["end"] == 49791730


def test_a_same_strand_pair_is_direct():
    # Direct pairs delete and duplicate what lies between them; inverted ones
    # invert it. The two leave different evidence, so this is not decoration.
    same_strand = REAL_ROW.replace("\t-\tchr11\t88842206", "\t+\tchr11\t88842206")
    (pair,) = parse_super_dups([same_strand])

    assert pair["orientation"] == "direct"


def test_a_dump_without_the_bin_column_reads_the_same():
    # A table dump carries `bin`; the same data from the table browser does not.
    without_bin = REAL_ROW.split("\t", 1)[1]

    assert list(parse_super_dups([without_bin])) == list(parse_super_dups([REAL_ROW]))


def test_contigs_gens_cannot_place_are_dropped():
    # An alternate haplotype or unplaced contig cannot be drawn or navigated
    # to, so storing it would be storing an address that leads nowhere.
    assert normalise_contig("chr11") == "11"
    assert normalise_contig("chrX") == "X"
    assert normalise_contig("chrM") == "MT"
    assert normalise_contig("chr11_KI270721v1_random") is None
    assert normalise_contig("chrUn_GL000195v1") is None
    assert normalise_contig("chr19_KI270938v1_alt") is None


def test_a_pair_whose_partner_is_unplaceable_is_dropped():
    # Half a pair is not a pair: without a partner to name, the row says only
    # "this region resembles something", which is not what the track claims.
    unplaceable = REAL_ROW.replace(
        "\t-\tchr11\t88842206", "\t-\tchr19_KI270938v1_alt\t88842206"
    )

    assert list(parse_super_dups([unplaceable])) == []


def test_a_truncated_row_is_skipped_rather_than_read_short():
    # Reading a short row would take identity from whatever column happened to
    # be last.
    truncated = "\t".join(REAL_ROW.split("\t")[:12])

    assert list(parse_super_dups([truncated])) == []


def test_a_row_with_unparsable_numbers_is_skipped():
    broken = REAL_ROW.replace("\t0.970197\t", "\tN/A\t")

    assert list(parse_super_dups([broken])) == []


def test_one_bad_row_does_not_stop_the_rest():
    # The file is a third-party dump of sixty thousand rows and covers contigs
    # Gens does not draw; abandoning the load over one line would be worse.
    lines = ["not a row at all", REAL_ROW, ""]

    assert len(list(parse_super_dups(lines))) == 1


def test_a_trailing_newline_does_not_reach_the_last_field():
    # The last column is a number, and a value that arrives as "0.03\n" parses
    # here but would not everywhere.
    (pair,) = parse_super_dups([REAL_ROW + "\n"])

    assert pair["identity"] == pytest.approx(0.970197)
