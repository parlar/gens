"""Routes for getting coverage information."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from gens.bedpe import MAX_EVIDENCE_WINDOW, get_read_evidence
from gens.crud import samples
from gens.crud.het_density import get_het_density
from gens.crud.read_evidence import get_evidence_source
from gens.db.collections import SAMPLES_COLLECTION
from gens.exceptions import SampleNotFoundError
from gens.io import get_overview_from_tabix, get_scatter_data
from gens.models.genomic import Chromosome, GenomeBuild, GenomicRegion
from gens.models.het_density import HetDensityTrack
from gens.models.read_evidence import ReadEvidence
from gens.models.sample import (
    GenomeCoverage,
    MultipleSamples,
    SampleInfo,
    ScatterDataType,
)

from .utils import ApiTags, GensDb

router = APIRouter(prefix="/samples")


@router.get("/", tags=[ApiTags.SAMPLE])
async def get_multiple_samples(
    db: GensDb, skip: int = 0, limit: int | None = None
) -> MultipleSamples:
    """Query the database for multiple samples.

    The result can be narrowed using skip and limit.
    """
    resp = samples.get_samples(samples_c=db[SAMPLES_COLLECTION], limit=limit, skip=skip)
    return resp


@router.get("/sample", tags=[ApiTags.SAMPLE])
async def get_sample_route(
    sample_id: str, case_id: str, genome_build: GenomeBuild, db: GensDb
) -> SampleInfo:
    sample_info: SampleInfo = samples.get_sample(
        db[SAMPLES_COLLECTION],
        sample_id=sample_id,
        case_id=case_id,
        genome_build=genome_build,
    )
    return sample_info


@router.get("/sample/read-evidence", tags=[ApiTags.SAMPLE])
def get_sample_read_evidence(
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    db: GensDb,
    start: int = Query(..., ge=1),
    end: int = Query(..., ge=1),
    minimum_mapq: int = Query(0, ge=0, le=254),
    minimum_fragments: int = Query(0, ge=0),
    kind: Literal["all", "split", "pair", "call", "unknown"] = "all",
) -> ReadEvidence:
    """Query the compact dual-endpoint index registered for this sample."""
    if end < start or end - start + 1 > MAX_EVIDENCE_WINDOW:
        raise HTTPException(
            422, f"Select an interval of at most {MAX_EVIDENCE_WINDOW:,} bases"
        )
    try:
        source = get_evidence_source(db, sample_id, case_id, genome_build)
    except SampleNotFoundError as error:
        raise HTTPException(404, "Sample not found") from error
    if source is None:
        raise HTTPException(
            404, "No compact evidence file is registered for this sample"
        )
    try:
        result = get_read_evidence(
            source.path,
            chromosome,
            start,
            end,
            genome_build,
            minimum_mapq=minimum_mapq,
            minimum_fragments=minimum_fragments,
            kind=kind,
        )
        result.source_label = source.label
        return result
    except (OSError, ValueError) as error:
        raise HTTPException(
            422,
            "Cannot read evidence. Verify the registered compact file, index and genome build.",
        ) from error


#: A wider request would bin the whole genome on every pan. The frontend only
#: draws this track at full resolution anyway.
MAX_HET_DENSITY_WINDOW = 20_000_000


@router.get("/sample/het-density", tags=[ApiTags.SAMPLE])
def get_sample_het_density(
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    chromosome: Chromosome,
    db: GensDb,
    start: int = Query(default=1, ge=1),
    end: int = Query(..., ge=1),
    bin_size: int = Query(default=20_000, ge=1_000, le=1_000_000),
) -> HetDensityTrack:
    """Heterozygous sites per bin, scaled by the sample's own typical bin.

    Descriptive only. The response carries no probability and no call: a bin
    empty of heterozygous sites is produced by a heterozygous deletion, a run of
    homozygosity, a coverage dropout and ordinary mapping difficulty alike.
    """
    if end < start:
        raise HTTPException(status_code=416, detail="end precedes start")
    if end - start > MAX_HET_DENSITY_WINDOW:
        raise HTTPException(
            status_code=416,
            detail=f"region exceeds {MAX_HET_DENSITY_WINDOW} bp",
        )
    try:
        return get_het_density(
            db=db,
            sample_id=sample_id,
            case_id=case_id,
            genome_build=genome_build,
            chromosome=chromosome,
            start=start,
            end=end,
            bin_size=bin_size,
        )
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


@router.get(
    "/sample/{data_type}",
    tags=[ApiTags.SAMPLE],
)
async def get_genome_coverage(
    sample_id: str,
    case_id: str,
    data_type: ScatterDataType,
    chromosome: Chromosome,
    genome_build: GenomeBuild,
    db: GensDb,
    start: int = 1,
    end: int | None = None,
    zoom_level: Literal["o", "a", "b", "c", "d"] = "a",
) -> GenomeCoverage:
    """Get genome coverage information."""

    region = GenomicRegion(chromosome=chromosome, start=start, end=end)

    return get_scatter_data(
        collection=db.get_collection(SAMPLES_COLLECTION),
        sample_id=sample_id,
        case_id=case_id,
        genome_build=genome_build,
        region=region,
        data_type=data_type,
        zoom_level=zoom_level,
    )


@router.get("/sample/{data_type}/overview", tags=[ApiTags.SAMPLE])
async def get_cov_overview(
    sample_id: str,
    case_id: str,
    data_type: ScatterDataType,
    genome_build: GenomeBuild,
    db: GensDb,
):
    """Get aggregated overview coverage information."""

    sample_info: SampleInfo = samples.get_sample(
        db[SAMPLES_COLLECTION],
        sample_id=sample_id,
        case_id=case_id,
        genome_build=genome_build,
    )

    return get_overview_from_tabix(sample_info, data_type)
