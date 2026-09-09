import logging

from fastapi import APIRouter, Query

from gens.crud.gene_lists import get_panel_gene_positions
from gens.models.annotation import GeneListRecord, PanelGenes
from gens.models.genomic import GenomeBuild
from gens.routes.utils import AdapterDep, ApiTags, GensDb

router = APIRouter(prefix="/gene_lists")

LOG = logging.getLogger(__name__)


@router.get("/", tags=[ApiTags.GENE_LIST])
def get_gene_lists(variant_adapter: AdapterDep) -> list[GeneListRecord]:
    """Get ID and name of all available gene lists"""

    return variant_adapter.get_gene_lists()


@router.get("/track/{panel_id}", tags=[ApiTags.GENE_LIST])
def get_gene_list_symbols(
    panel_id: str,
    variant_adapter: AdapterDep,
    version: str | None = Query(default=None),
) -> list[str]:
    """Get gene list entries"""

    return variant_adapter.get_gene_list(panel_id, version=version).symbols


@router.get("/{panel_id}/genes", tags=[ApiTags.GENE_LIST])
def get_gene_list_positions(
    panel_id: str,
    genome_build: GenomeBuild,
    variant_adapter: AdapterDep,
    db: GensDb,
    version: str | None = Query(default=None),
) -> PanelGenes:
    """The panel's genes placed on the genome, in the order they are walked.

    The response carries the version it resolved and the symbols it could not
    place, so a reader stepping through a panel can tell how much of that panel
    they have actually seen.
    """
    resolved = variant_adapter.get_gene_list(panel_id, version=version)
    genes, missing = get_panel_gene_positions(db, resolved.symbols, genome_build)
    return PanelGenes(
        panel_id=panel_id,
        # The version that was used, not the one that was asked for. Without a
        # pinned version the adapter takes the newest, and echoing back the
        # empty request told a caller nothing about which set it received.
        version=resolved.version,
        genome_build=genome_build,
        genes=genes,
        missing=missing,
    )
