import logging
from collections import defaultdict
from typing import Any

from pydantic import ValidationError
from pymongo.database import Database

from gens.adapters.base import InterpretationAdapter
from gens.crud.scout import VariantNotFoundError, VariantValidationError
from gens.crud.utils import query_genomic_region
from gens.models.annotation import (
    GeneListRecord,
    SimplifiedVariantRecord,
    VariantRecord,
)
from gens.models.genomic import GenomicRegion, VariantCategory

LOG = logging.getLogger(__name__)


class ScoutMongoAdapter(InterpretationAdapter):

    def __init__(self, db: Database[Any]):
        self._db = db

    # FIXME: Cleanup
    def get_variants(
        self,
        case_id: str,
        sample_name: str,
        region: GenomicRegion,
        variant_category: VariantCategory,
    ) -> list[SimplifiedVariantRecord]:
        valid_genotype_calls = ["0/1", "1/1"]
        query: dict[str, Any] = {
            "case_id": case_id,
            "category": variant_category,
            "chromosome": region.chromosome,
            "samples": {
                "$elemMatch": {
                    "genotype_call": {"$in": valid_genotype_calls},
                    "$or": [{"sample_id": sample_name}, {"display_name": sample_name}],
                }
            },
        }
        # Restrict to variants overlapping the requested interval. This was
        # commented out, so a bounded query returned every variant on the
        # chromosome. This is the copy the API actually runs.
        #
        # Applied whenever either bound is given: `end` is optional on the
        # route, and skipping the filter unless both were present meant a
        # request with only a start was not narrowed at all.
        query = {
            **query,
            **query_genomic_region(region.start, region.end, "position"),
        }
        projection: dict[str, bool] = {}
        LOG.info("Query variant database: %s", query)

        try:
            result: list[SimplifiedVariantRecord] = []
            for doc in self._db.get_collection("variant").find(query, projection):
                genotype = None

                for sample in doc.get("samples", []):
                    if (
                        sample.get("sample_id") == sample_name
                        or sample.get("display_name") == sample_name
                    ):
                        genotype = sample.get("genotype_call")

                doc_with_genotype = {**doc, "genotype": genotype}

                result.append(SimplifiedVariantRecord.model_validate(doc_with_genotype))

        except ValidationError as e:
            LOG.error("Failed to validate variant data: %s", e)
            # FIXME: More details?
            raise VariantValidationError("Invalid variant data in Scout database ")
        return result

    # FIXME: Consider cleanup
    def get_variant(self, document_id: str) -> VariantRecord:
        raw_variant = self._db.get_collection("variant").find_one(
            {"_id": document_id}, {"_id": False}
        )
        if raw_variant is None:
            LOG.warning(
                "Variant with document_id %s not found in Scout database", document_id
            )
            raise VariantNotFoundError(
                f"Variant with id {document_id} is not found in Scout database"
            )
        try:
            variant = VariantRecord.model_validate(raw_variant)
        except ValidationError as e:
            LOG.error("Failed to validate variant %s: %s", document_id, e)
            raise VariantValidationError(f"Invalid variant data for ID {document_id}")
        return variant

    def get_gene_lists(self) -> list[GeneListRecord]:

        raw_query_results = list(
            self._db.get_collection("gene_panel").find(
                {}, {"_id": 1, "panel_name": 1, "display_name": 1, "version": 1}
            )
        )

        all_gene_lists_parsed = [
            {
                "id": res["panel_name"],
                "name": res["display_name"],
                "version": res["version"],
            }
            for res in raw_query_results
        ]

        highest_version_per_panel: dict[str, float] = defaultdict(float)
        for res_dict in all_gene_lists_parsed:
            panel_id = res_dict["id"]
            version = res_dict["version"]
            if version > highest_version_per_panel[panel_id]:
                highest_version_per_panel[panel_id] = res_dict["version"]

        only_highest = [
            {
                "id": gene_list["id"],
                "name": gene_list["name"],
                "version": str(gene_list["version"]),
            }
            for gene_list in all_gene_lists_parsed
            if gene_list["version"] == highest_version_per_panel[gene_list["id"]]
        ]

        gene_lists = [GeneListRecord.model_validate(result) for result in only_highest]

        return gene_lists

    def get_gene_list(self, gene_list_id: str, version: str | None = None) -> list[str]:
        """Gene symbols for a panel, at a pinned version when one is given.

        Panels are curated, so "the newest version" is a moving target. A reader
        walking a panel needs the set to hold still, and a reader comparing with
        Scout needs to know which set they are looking at; both need the version
        to travel with the request. Without one this keeps the old behaviour.
        """
        query: dict[str, Any] = {"panel_name": gene_list_id}
        if version is not None:
            try:
                query["version"] = float(version)
            except ValueError:
                LOG.warning("ignoring unparseable panel version %r", version)
                del query["version"]
        # Sorting descending still picks the newest when no version was pinned.
        cursor = self._db.get_collection("gene_panel").find(query).sort("version", -1).limit(1)
        gene_list = next(cursor, None)
        if not gene_list:
            return []
        genes = []
        for gene in gene_list.get("genes", []):
            symbol = gene.get("hgnc_symbol") or gene.get("symbol")
            if symbol:
                genes.append(symbol)
        return genes
