"""Sample-scoped compact evidence source registration."""

from typing import Any

from pymongo.database import Database

from gens.bedpe import validate_evidence_file
from gens.db.collections import SAMPLES_COLLECTION
from gens.exceptions import SampleNotFoundError
from gens.models.genomic import GenomeBuild
from gens.models.read_evidence import EvidenceSource


def get_evidence_source(
    db: Database[Any],
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
) -> EvidenceSource | None:
    record = db[SAMPLES_COLLECTION].find_one(
        {"sample_id": sample_id, "case_id": case_id, "genome_build": genome_build},
        {"read_evidence": 1},
    )
    if record is None:
        raise SampleNotFoundError("Sample not found", sample_id)
    source = record.get("read_evidence")
    return EvidenceSource.model_validate(source) if source else None


def register_evidence_source(
    db: Database[Any],
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    source: EvidenceSource | None,
) -> None:
    if source is not None:
        validate_evidence_file(source.path, genome_build)
    update = (
        {"$set": {"read_evidence": source.model_dump(mode="json")}}
        if source
        else {"$unset": {"read_evidence": ""}}
    )
    result = db[SAMPLES_COLLECTION].update_one(
        {"sample_id": sample_id, "case_id": case_id, "genome_build": genome_build},
        update,
    )
    if result.matched_count != 1:
        raise SampleNotFoundError("Sample not found", sample_id)
