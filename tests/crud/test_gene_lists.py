import mongomock

from gens.crud.gene_lists import get_panel_gene_positions
from gens.db.collections import TRANSCRIPTS_COLLECTION
from gens.models.genomic import GenomeBuild

BUILD = GenomeBuild.HG38


def transcript(gene, chrom, start, end, mane=None, build=BUILD):
    return {
        "gene_name": gene,
        "chrom": chrom,
        "start": start,
        "end": end,
        "mane": mane,
        "genome_build": build,
    }


def load(db, docs):
    db[TRANSCRIPTS_COLLECTION].insert_many(docs)


def test_walks_the_panel_in_genomic_order(db: mongomock.Database) -> None:
    # Sorting on the chromosome name would put 10 before 2, which sends a reader
    # stepping through a panel back and forth across the genome.
    load(
        db,
        [
            transcript("GENE10", "10", 1000, 2000),
            transcript("GENE2", "2", 1000, 2000),
            transcript("GENEX", "X", 1000, 2000),
            transcript("GENE1B", "1", 9000, 9500),
            transcript("GENE1A", "1", 1000, 2000),
        ],
    )
    genes, missing = get_panel_gene_positions(
        db, ["GENEX", "GENE10", "GENE2", "GENE1B", "GENE1A"], BUILD
    )
    assert [gene.symbol for gene in genes] == [
        "GENE1A",
        "GENE1B",
        "GENE2",
        "GENE10",
        "GENEX",
    ]
    assert missing == []


def test_prefers_the_mane_transcript(db: mongomock.Database) -> None:
    # A gene has many transcripts that disagree on its extent. MANE Select is
    # the agreed representative even when another transcript is wider.
    load(
        db,
        [
            transcript("BRCA2", "13", 32300000, 32400000, mane=None),
            transcript("BRCA2", "13", 32315474, 32399672, mane="MANE Select"),
        ],
    )
    genes, _ = get_panel_gene_positions(db, ["BRCA2"], BUILD)
    assert len(genes) == 1
    assert (genes[0].start, genes[0].end) == (32315474, 32399672)
    assert genes[0].is_mane


def test_falls_back_to_the_widest_span(db: mongomock.Database) -> None:
    # With no MANE transcript, the widest span is used so the opened view holds
    # every exon any transcript claims.
    load(
        db,
        [
            transcript("NOMANE", "7", 5000, 6000),
            transcript("NOMANE", "7", 4000, 9000),
            transcript("NOMANE", "7", 5500, 5800),
        ],
    )
    genes, _ = get_panel_gene_positions(db, ["NOMANE"], BUILD)
    assert (genes[0].start, genes[0].end) == (4000, 9000)
    assert not genes[0].is_mane


def test_reports_symbols_it_could_not_place(db: mongomock.Database) -> None:
    # A panel gene with no transcript must not vanish silently: a reader would
    # believe they had walked past it.
    load(db, [transcript("FOUND", "1", 1000, 2000)])
    genes, missing = get_panel_gene_positions(db, ["FOUND", "ABSENT", "ALSOGONE"], BUILD)
    assert [gene.symbol for gene in genes] == ["FOUND"]
    assert missing == ["ABSENT", "ALSOGONE"]


def test_ignores_transcripts_from_another_build(db: mongomock.Database) -> None:
    load(db, [transcript("ONLY37", "1", 1000, 2000, build=GenomeBuild.HG37)])
    genes, missing = get_panel_gene_positions(db, ["ONLY37"], BUILD)
    assert genes == []
    assert missing == ["ONLY37"]


def test_skips_unsupported_contigs(db: mongomock.Database) -> None:
    # A scaffold or patch contig cannot be navigated to, so it is dropped rather
    # than offered as a destination.
    load(
        db,
        [
            transcript("ONSCAFFOLD", "GL000009.2", 100, 200),
            transcript("ONCHR1", "1", 1000, 2000),
        ],
    )
    genes, missing = get_panel_gene_positions(db, ["ONSCAFFOLD", "ONCHR1"], BUILD)
    assert [gene.symbol for gene in genes] == ["ONCHR1"]
    assert missing == ["ONSCAFFOLD"]


def test_a_repeated_symbol_is_walked_once(db: mongomock.Database) -> None:
    load(db, [transcript("DUP", "1", 1000, 2000)])
    genes, missing = get_panel_gene_positions(db, ["DUP", "DUP"], BUILD)
    assert len(genes) == 1
    assert missing == []


def test_an_empty_panel_is_not_a_query(db: mongomock.Database) -> None:
    assert get_panel_gene_positions(db, [], BUILD) == ([], [])
