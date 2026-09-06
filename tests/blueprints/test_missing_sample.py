"""Asking for a sample that is not there is a 404, not a 500.

SampleNotFoundError had a Flask handler but nothing on the FastAPI side, so
every API route that did not catch it itself answered 500. That tells a caller
the server is broken, when what happened is that they asked for something that
does not exist — and it is the difference between a client retrying and a
client reporting the right thing to the user.
"""

import pytest
from fastapi.testclient import TestClient

from gens.app import create_app
from gens.config import AuthMethod, settings
from gens.db.db import get_gens_db

PARAMS = {
    "sample_id": "no-such-sample",
    "case_id": "no-such-case",
    "genome_build": 38,
    "chromosome": "1",
    "start": 1,
    "end": 1000,
}


@pytest.fixture
def client(db, monkeypatch):
    monkeypatch.setattr(settings, "authentication", AuthMethod.DISABLED)
    monkeypatch.setattr(
        "gens.app.init_database_connection", lambda app: app.config.update(GENS_DB=db)
    )
    app = create_app()
    app.dependency_overrides[get_gens_db] = lambda: db
    # Without this a 500 is re-raised into the test instead of being returned,
    # so a regression would look like an error in the test rather than a
    # response the client would actually receive.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.mark.parametrize(
    "path",
    [
        "/api/samples/sample",
        "/api/samples/sample/coverage",
        "/api/samples/sample/het-density",
        "/api/samples/sample/read-evidence",
    ],
)
def test_a_missing_sample_is_reported_as_not_found(client, path):
    response = client.get(path, params=PARAMS)
    assert response.status_code == 404, response.text


def test_the_body_names_the_sample_asked_for(client):
    # A stable, useful contract: enough to tell the caller which sample was
    # missing, and nothing about where samples live on disk.
    response = client.get("/api/samples/sample", params=PARAMS)

    detail = response.json()["detail"]
    assert "no-such-sample" in detail
    assert "/" not in detail
