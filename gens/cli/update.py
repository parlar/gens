"""CLI commands for updating entries in the database."""

import logging
from os import getenv
from pathlib import Path

import click

from gens.bedpe import prepare_read_evidence
from gens.cli.util import db as cli_db
from gens.cli.util.util import ChoiceType, normalize_sample_type
from gens.crud.read_evidence import get_evidence_source, register_evidence_source
from gens.crud.samples import get_sample, get_sample_document, update_sample
from gens.db.collections import (
    SAMPLES_COLLECTION,
)
from gens.exceptions import SampleNotFoundError
from gens.load.meta import parse_meta_file
from gens.models.genomic import GenomeBuild
from gens.models.read_evidence import EvidenceSource
from gens.models.sample import MetaEntry, SampleInfo, SampleSex

log_level = getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=logging.INFO, format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
)
LOG = logging.getLogger(__name__)


@click.group()
def update() -> None:
    """Update information in Gens database"""


@update.command("read-evidence")
@click.option("--sample-id", required=True)
@click.option("--case-id", required=True)
@click.option("--genome-build", type=ChoiceType(GenomeBuild), required=True)
@click.option(
    "--file",
    "evidence_file",
    type=click.Path(exists=True, dir_okay=False, path_type=Path),
    help="BEDPE or BEDPE.gz input",
)
@click.option(
    "--output",
    type=click.Path(dir_okay=False, path_type=Path),
    help="New indexed .gz file accessible to the Gens server",
)
@click.option(
    "--remove", is_flag=True, help="Unregister evidence without deleting files"
)
def read_evidence(
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    evidence_file: Path | None,
    output: Path | None,
    remove: bool,
) -> None:
    """Import compact BEDPE connections for a sample; no BAM/CRAM is required."""
    if remove and (evidence_file is not None or output is not None):
        raise click.UsageError("Use --remove without --file or --output")
    if not remove and (evidence_file is None or output is None):
        raise click.UsageError("Provide both --file and --output, or use --remove")
    try:
        db = cli_db.get_cli_db([SAMPLES_COLLECTION])
        get_evidence_source(db, sample_id, case_id, genome_build)
        source = None
        if evidence_file is not None and output is not None:
            count = prepare_read_evidence(evidence_file, output, genome_build)
            source = EvidenceSource(path=output.resolve(), label=evidence_file.name)
            click.echo(f"Indexed {count} connections from both endpoints")
        register_evidence_source(db, sample_id, case_id, genome_build, source)
    except (OSError, ValueError, SampleNotFoundError) as error:
        raise click.ClickException(str(error)) from error
    click.echo("Evidence source removed" if remove else "Evidence source registered")


@update.command()
@click.option("-i", "--sample-id", required=True, help="Sample id")
@click.option(
    "-n",
    "--case-id",
    required=True,
    help="Id of case",
)
@click.option(
    "-b",
    "--genome-build",
    type=ChoiceType(GenomeBuild),
    required=True,
    help="Genome build",
)
@click.option(
    "-t",
    "--sample-type",
    type=str,
    help="New sample type (for instance, tumor/normal, proband/mother/father/relative, other)",
)
@click.option(
    "--sex",
    type=ChoiceType(SampleSex),
    required=False,
    help="Update sample sex",
)
@click.option(
    "--baf",
    type=click.Path(exists=True, path_type=Path),
    required=False,
    help="Update BAF file",
)
@click.option(
    "--coverage",
    type=click.Path(exists=True, path_type=Path),
    required=False,
    help="Update coverage file",
)
@click.option(
    "--meta",
    "meta_file",
    type=click.Path(exists=True, path_type=Path),
    help="TSV file with sample metadata",
)
@click.option(
    "--force",
    is_flag=True,
    help="Overwrite existing meta without asking for confirmation",
)
def sample(
    sample_id: str,
    case_id: str,
    genome_build: GenomeBuild,
    sample_type: str | None,
    sex: SampleSex | None,
    baf: Path | None,
    coverage: Path | None,
    meta_file: Path | None,
    force: bool,
) -> None:
    """Update sample information for a sample."""

    db = cli_db.get_cli_db([SAMPLES_COLLECTION])

    # The stored record rather than a validated SampleInfo. SampleInfo types
    # both paths as FilePath, so it cannot be built for a sample whose files
    # have moved, and repairing a moved path is the main reason to run this.
    # The merged result is validated in full below, so the replacement is held
    # to the same standard `gens load sample` applies.
    stored = get_sample_document(
        db[SAMPLES_COLLECTION],
        sample_id=sample_id,
        case_id=case_id,
        genome_build=genome_build,
    )
    updated = {
        key: value for key, value in stored.items() if key not in {"_id", "meta"}
    }
    existing_meta = [MetaEntry.model_validate(m) for m in stored.get("meta", [])]

    if sample_type is not None:
        updated["sample_type"] = (
            normalize_sample_type(sample_type) if sample_type else None
        )
    if sex is not None:
        updated["sex"] = sex
    if coverage is not None:
        updated["coverage_file"] = coverage.resolve()
    if baf is not None:
        updated["baf_file"] = baf.resolve()

    if meta_file:
        meta_results = parse_meta_file(meta_file)

        existing_file_names = [meta.file_name for meta in existing_meta]

        if meta_results.file_name in existing_file_names:
            click.echo(f"Meta data {meta_results.file_name} already exists on sample")
            if not force:
                if not click.confirm("Proceed with update?", default=False):
                    click.echo("Aborted")
                    return

        # Overwrite existing meta with the same name
        existing_meta = [
            meta_entry
            for meta_entry in existing_meta
            if meta_entry.file_name != meta_results.file_name
        ]
        existing_meta.append(meta_results)

    updated["meta"] = [meta.model_dump() for meta in existing_meta]

    # Validate the whole merged record, so updates follow the same
    # file/content validation path as `gens load sample`.
    sample_obj = SampleInfo.model_validate(updated)

    update_sample(db, sample_obj)
    click.secho("Finished updating sample ✔", fg="green")
