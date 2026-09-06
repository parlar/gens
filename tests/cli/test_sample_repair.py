"""Repairing a sample whose data files have moved.

`gens update sample --coverage <new path>` exists for exactly this. It loaded
the existing record first, and loading validated the recorded paths, so the
command refused to run in the one situation it was needed for: it worked while
the old file was still there and failed once it was not.
"""

import gzip
from pathlib import Path
from types import ModuleType

import mongomock
import pytest

from gens.db.collections import SAMPLES_COLLECTION


def write_track(file_path: Path) -> Path:
    with gzip.open(file_path, "wt", encoding="utf-8") as fh:
        fh.write("0_1\t0\t1\t0.1\n")
    return file_path


@pytest.fixture(autouse=True)
def ensure_indexes(db: mongomock.Database):
    db.get_collection(SAMPLES_COLLECTION).create_index(
        [("sample_id", 1), ("case_id", 1), ("genome_build", 1)], unique=True
    )


@pytest.fixture
def loaded_sample(cli_load: ModuleType, tmp_path: Path) -> dict[str, Path]:
    files = {
        "baf": write_track(tmp_path / "baf.gz"),
        "coverage": write_track(tmp_path / "cov.gz"),
    }
    cli_load.sample.callback(
        sample_id="sample1",
        genome_build=38,
        baf=files["baf"],
        coverage=files["coverage"],
        case_id="case1",
        display_case_id=None,
        meta_files=[],
        sample_type="proband",
        sex=None,
    )
    return files


def update_coverage(cli_update: ModuleType, coverage: Path) -> None:
    cli_update.sample.callback(
        sample_id="sample1",
        case_id="case1",
        genome_build=38,
        sample_type=None,
        sex=None,
        baf=None,
        coverage=coverage,
        meta_file=None,
        force=True,
    )


def test_a_moved_coverage_file_can_be_pointed_at_its_new_home(
    cli_load, cli_update, loaded_sample, tmp_path, db
):
    (tmp_path / "moved").mkdir()
    new_coverage = write_track(tmp_path / "moved" / "cov.gz")
    loaded_sample["coverage"].unlink()

    update_coverage(cli_update, new_coverage)

    stored = db.get_collection(SAMPLES_COLLECTION).find_one({})
    assert stored["coverage_file"] == str(new_coverage.resolve())


def test_the_replacement_still_has_to_exist(
    cli_load, cli_update, loaded_sample, tmp_path, db
):
    # Relaxing the check on the old path must not relax it on the new one.
    loaded_sample["coverage"].unlink()

    with pytest.raises((FileNotFoundError, ValueError)):
        update_coverage(cli_update, tmp_path / "not-there.gz")

    stored = db.get_collection(SAMPLES_COLLECTION).find_one({})
    assert stored["coverage_file"] == str(loaded_sample["coverage"].resolve())


def test_an_ordinary_update_is_unaffected(
    cli_load, cli_update, loaded_sample, tmp_path, db
):
    # The control: replacing a file that is still where it was.
    (tmp_path / "second").mkdir()
    new_coverage = write_track(tmp_path / "second" / "cov.gz")

    update_coverage(cli_update, new_coverage)

    stored = db.get_collection(SAMPLES_COLLECTION).find_one({})
    assert stored["coverage_file"] == str(new_coverage.resolve())
