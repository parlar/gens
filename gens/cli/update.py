"""CLI commands for updating entries in the database."""

import logging
from os import getenv
from pathlib import Path

import click

from gens.bedpe import prepare_read_evidence
from gens.cli.util import db as cli_db
from gens.cli.util.util import ChoiceType, normalize_sample_type
from gens.crud.read_evidence import get_evidence_source, register_evidence_source
from gens.crud.samples import get_sample, update_sample
from gens.db.collections import (
    SAMPLES_COLLECTION,
)
from gens.exceptions import SampleNotFoundError
from gens.load.meta import parse_meta_file
from gens.models.genomic import GenomeBuild
from gens.models.read_evidence import EvidenceSource
from gens.models.sample import SampleInfo, SampleSex

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

    sample_obj = get_sample(
        db[SAMPLES_COLLECTION],
        sample_id=sample_id,
        case_id=case_id,
        genome_build=genome_build,
    )

    if sample_type is not None:
        sample_obj.sample_type = (
            normalize_sample_type(sample_type) if sample_type else None
        )
    if sex is not None:
        sample_obj.sex = sex
    if coverage is not None:
        sample_obj.coverage_file = coverage.resolve()
    if baf is not None:
        sample_obj.baf_file = baf.resolve()

    if meta_file:
        meta_results = parse_meta_file(meta_file)

        existing_file_names = [meta.file_name for meta in sample_obj.meta]

        if meta_results.file_name in existing_file_names:
            click.echo(f"Meta data {meta_results.file_name} already exists on sample")
            if not force:
                if not click.confirm("Proceed with update?", default=False):
                    click.echo("Aborted")
                    return

        # Overwrite existing meta with the same name
        sample_obj.meta = [
            meta_entry
            for meta_entry in sample_obj.meta
            if meta_entry.file_name != meta_results.file_name
        ]
        sample_obj.meta.append(meta_results)

    # Re-validate the full sample object so updates follow the same
    # file/content validation path as `gens load sample`.
    sample_obj = SampleInfo.model_validate(
        sample_obj.model_dump(exclude={"baf_index", "coverage_index"})
    )

    update_sample(db, sample_obj)
    click.secho("Finished updating sample ✔", fg="green")
