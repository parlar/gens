"""Models for sample specific annotation tracks"""

from typing import Any

from pydantic import Field

from gens.models.annotation import AnnotationRecord
from gens.models.base import CreatedAtModel, ModifiedAtModel, PydanticObjectId, RWModel
from gens.models.genomic import GenomeBuild


class SampleAnnotationRecord(AnnotationRecord):
    sample_id: str
    case_id: str


class SampleAnnotationTrack(RWModel, CreatedAtModel, ModifiedAtModel):

    sample_id: str
    case_id: str
    name: str
    description: str | None = None
    genome_build: GenomeBuild
    metadata: list[dict[str, Any]] = []


# FIXME: Dig into this. Why is this one separate from the one above?
class SampleAnnotationTrackInDb(SampleAnnotationTrack):
    # Sent as track_id, matching AnnotationTrackInDb. It used to go out as _id
    # while its sibling route sent track_id, and the frontend copied one onto
    # the other on arrival.
    track_id: PydanticObjectId = Field(validation_alias="_id")
