import click
import pytest
from fastapi.testclient import TestClient

from gens.bedpe import prepare_read_evidence
from gens.config import AuthMethod, settings
from gens.crud.read_evidence import register_evidence_source
from gens.db.db import get_gens_db
from gens.models.genomic import GenomeBuild
from gens.models.read_evidence import EvidenceSource


@pytest.fixture
def evidence_file(tmp_path):
    path = tmp_path / "connections.bedpe"
    path.write_text("1\t99\t100\t2\t499\t500\tjunction\t0\t+\t-\tsplit\t7\t40\n")
    return path


def test_import_and_removal_preserve_sample_fields(
    tmp_path, evidence_file, db, cli_update
):
    db.samples.insert_one(
        {
            "sample_id": "sample",
            "case_id": "case",
            "genome_build": 38,
            "meta": ["existing"],
        }
    )
    output = tmp_path / "evidence.gz"
    cli_update.read_evidence.callback(
        sample_id="sample",
        case_id="case",
        genome_build=GenomeBuild.HG38,
        evidence_file=evidence_file,
        output=output,
        remove=False,
    )
    assert db.samples.find_one({})["read_evidence"]["path"] == str(output)
    assert db.samples.find_one({})["meta"] == ["existing"]
    cli_update.read_evidence.callback(
        sample_id="sample",
        case_id="case",
        genome_build=GenomeBuild.HG38,
        evidence_file=None,
        output=None,
        remove=True,
    )
    assert "read_evidence" not in db.samples.find_one({})
    assert output.is_file()
    assert db.samples.find_one({})["meta"] == ["existing"]


def test_bad_replacement_preserves_registered_evidence(
    tmp_path, evidence_file, db, cli_update
):
    db.samples.insert_one(
        {"sample_id": "sample", "case_id": "case", "genome_build": 38}
    )
    kwargs = {
        "sample_id": "sample",
        "case_id": "case",
        "genome_build": GenomeBuild.HG38,
        "evidence_file": evidence_file,
        "remove": False,
    }
    output = tmp_path / "evidence.gz"
    cli_update.read_evidence.callback(**kwargs, output=output)
    evidence_file.write_text("malformed\n")
    with pytest.raises(click.ClickException):
        cli_update.read_evidence.callback(**kwargs, output=tmp_path / "replacement.gz")
    assert db.samples.find_one({})["read_evidence"]["path"] == str(output)
    assert not (tmp_path / "replacement.gz").exists()


def test_missing_sample_does_not_create_files(tmp_path, evidence_file, cli_update):
    output = tmp_path / "evidence.gz"
    with pytest.raises(click.ClickException, match="Sample not found"):
        cli_update.read_evidence.callback(
            sample_id="missing",
            case_id="case",
            genome_build=GenomeBuild.HG38,
            evidence_file=evidence_file,
            output=output,
            remove=False,
        )
    assert not output.exists()


def test_api_requires_auth_and_uses_only_registered_source(
    tmp_path, evidence_file, db, monkeypatch
):
    from gens.app import create_app

    output = tmp_path / "evidence.gz"
    prepare_read_evidence(evidence_file, output, GenomeBuild.HG38)
    db.samples.insert_one(
        {"sample_id": "sample", "case_id": "case", "genome_build": 38}
    )
    register_evidence_source(
        db,
        "sample",
        "case",
        GenomeBuild.HG38,
        EvidenceSource(path=output, label="connections.bedpe"),
    )
    monkeypatch.setattr(settings, "authentication", AuthMethod.SIMPLE)
    monkeypatch.setattr(settings, "secret_key", "read-evidence-test-secret")
    monkeypatch.setattr(
        "gens.app.init_database_connection", lambda app: app.config.update(GENS_DB=db)
    )
    app = create_app()
    app.dependency_overrides[get_gens_db] = lambda: db
    params = {
        "sample_id": "sample",
        "case_id": "case",
        "genome_build": 38,
        "chromosome": "1",
        "start": 1,
        "end": 1000,
    }
    with TestClient(app) as client:
        assert (
            client.get("/api/samples/sample/read-evidence", params=params).status_code
            == 401
        )
        monkeypatch.setattr(settings, "authentication", AuthMethod.DISABLED)
        response = client.get(
            "/api/samples/sample/read-evidence",
            params={**params, "file": "/not-registered"},
        )
        assert response.status_code == 200
        assert response.json()["connections"][0]["fragments"] == 7
        assert response.json()["source_label"] == "connections.bedpe"
        assert str(output) not in response.text
        assert (
            client.get(
                "/api/samples/sample/read-evidence",
                params={**params, "chromosome": "2"},
            ).json()["connections"][0]["id"]
            == "junction"
        )
        assert (
            client.get(
                "/api/samples/sample/read-evidence",
                params={**params, "minimum_mapq": 50},
            ).json()["connections"]
            == []
        )
        assert (
            client.get(
                "/api/samples/sample/read-evidence", params={**params, "end": 1000001}
            ).status_code
            == 422
        )
        assert (
            client.get(
                "/api/samples/sample/read-evidence",
                params={**params, "case_id": "other"},
            ).status_code
            == 404
        )
        assert (
            client.get(
                "/api/samples/sample/read-evidence",
                params={**params, "kind": "invented"},
            ).status_code
            == 422
        )
