"""Place the genes of a gene panel on the genome, in the order a reader walks them."""

import logging
from typing import Any

from pymongo.database import Database

from gens.db.collections import TRANSCRIPTS_COLLECTION
from gens.models.annotation import PanelGene
from gens.models.genomic import Chromosome, GenomeBuild

LOG = logging.getLogger(__name__)

#: Chromosome is declared in genomic order, so its declaration index is the
#: order a reader expects to walk a panel in. Sorting on the name would put
#: chromosome 10 before chromosome 2.
_CHROMOSOME_ORDER = {chromosome: index for index, chromosome in enumerate(Chromosome)}


def _better_placement(candidate: dict[str, Any], current: dict[str, Any]) -> bool:
    """Whether `candidate` should replace `current` as a gene's placement.

    A gene has many transcripts and they disagree about where the gene starts
    and ends. MANE Select is the agreed representative, so it wins outright.
    Between two transcripts of equal standing the widest span wins, so the view
    the navigator opens contains every exon either of them claims.
    """
    candidate_mane = candidate.get("mane") is not None
    current_mane = current.get("mane") is not None
    if candidate_mane != current_mane:
        return candidate_mane
    candidate_span = candidate["end"] - candidate["start"]
    current_span = current["end"] - current["start"]
    return candidate_span > current_span


def get_panel_gene_positions(
    db: Database[Any],
    symbols: list[str],
    genome_build: GenomeBuild,
) -> tuple[list[PanelGene], list[str]]:
    """Resolve panel symbols to one genomic position each, in genomic order.

    Returns the placed genes and the symbols that could not be placed. The
    unplaced ones are returned rather than dropped: a panel gene with no
    transcript in this build would otherwise vanish from the walk silently, and
    a reader stepping "through the panel" would believe they had seen it.
    """
    if not symbols:
        return [], []

    wanted = list(dict.fromkeys(symbols))
    cursor = db.get_collection(TRANSCRIPTS_COLLECTION).find(
        {"gene_name": {"$in": wanted}, "genome_build": genome_build},
        {"gene_name": True, "chrom": True, "start": True, "end": True, "mane": True},
    )

    best: dict[str, dict[str, Any]] = {}
    for doc in cursor:
        symbol = doc["gene_name"]
        if symbol not in best or _better_placement(doc, best[symbol]):
            best[symbol] = doc

    genes: list[PanelGene] = []
    for symbol, doc in best.items():
        try:
            chromosome = Chromosome(str(doc["chrom"]))
        except ValueError:
            # A transcript on a scaffold or patch contig cannot be navigated to.
            LOG.warning("gene %s sits on unsupported contig %s", symbol, doc["chrom"])
            continue
        genes.append(
            PanelGene(
                symbol=symbol,
                chromosome=chromosome,
                start=int(doc["start"]),
                end=int(doc["end"]),
                is_mane=doc.get("mane") is not None,
            )
        )

    genes.sort(key=lambda gene: (_CHROMOSOME_ORDER[gene.chromosome], gene.start))
    placed = {gene.symbol for gene in genes}
    missing = [symbol for symbol in wanted if symbol not in placed]
    return genes, missing
