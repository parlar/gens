from abc import ABC, abstractmethod

from gens.models.annotation import (
    GeneListRecord,
    ResolvedGeneList,
    SimplifiedVariantRecord,
    VariantRecord,
)
from gens.models.genomic import GenomicRegion, VariantCategory


class InterpretationAdapter(ABC):
    """
    Adapter class for interaction with variant interpretation software.
    Makes no assumption on how the retrieval is done (i.e. from db or API).
    """

    @abstractmethod
    def get_variants(
        self,
        case_id: str,
        sample_name: str,
        region: GenomicRegion,
        variant_category: VariantCategory,
    ) -> list[SimplifiedVariantRecord]:
        """Return variants for a sample within a case, in the specified region (chromosome and position range)"""

    @abstractmethod
    def get_variant(self, variant_id: str) -> VariantRecord:
        """Return a single variant"""

    @abstractmethod
    def get_gene_lists(self) -> list[GeneListRecord]:
        """Return list of panel IDs and names"""

    @abstractmethod
    def get_gene_list(
        self, gene_list_id: str, version: str | None = None
    ) -> ResolvedGeneList:
        """Return gene symbols for a gene list, with the version they came from.

        `version` pins the panel version. Without it the newest version is
        returned, which can change under a reader mid-session as panels are
        curated -- so the version that was used comes back with the symbols
        rather than staying inside the adapter.
        """
