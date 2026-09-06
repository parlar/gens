"""Functions for handeling database connection."""

import logging
from functools import lru_cache
from typing import Any, Generator

from fastapi import HTTPException
from flask import Flask
from pydantic import MongoDsn
from pymongo import MongoClient
from pymongo.database import Database

from gens.adapters.base import InterpretationAdapter
from gens.adapters.null import NullInterpretationAdapter
from gens.adapters.scout import ScoutMongoAdapter
from gens.config import settings

LOG = logging.getLogger(__name__)


def init_database_connection(app: Flask) -> None:
    """Initialize database connection and store variables to the two databases."""

    LOG.info("Initialize db connection")

    app.config["GENS_DB"] = MongoClient(str(settings.gens_db.connection)).get_database(
        name=settings.gens_db.database
    )
    if settings.variant_db is not None:
        app.config["VARIANT_DB"] = MongoClient(
            str(settings.variant_db.connection)
        ).get_database(name=settings.variant_db.database)


@lru_cache(maxsize=None)
def _shared_client(uri: str) -> MongoClient[Any]:
    """One client per connection string, for the life of the process.

    A MongoClient owns a connection pool and is meant to be long-lived; building
    one per request throws the pool away every time and pays for a new
    handshake. Keyed on the URI rather than cached outright so that a test
    pointing at a different database still gets its own client.
    """
    return MongoClient(uri)


def get_db_connection(mongo_uri: MongoDsn, db_name: str) -> Database[Any]:
    """Get database connection."""
    db: Database[Any] = MongoClient(str(mongo_uri)).get_database(name=db_name)
    return db


def get_gens_db() -> Generator[Database[Any], None, None]:
    """Connect to the Gens database."""
    client = _shared_client(str(settings.gens_db.connection))
    # Not closed on the way out: the client is shared with every other request,
    # and closing it here would tear down the pool the next one needs.
    yield client.get_database(settings.gens_db.database)


def get_variant_software_adapter() -> Generator[InterpretationAdapter, None, None]:
    """Return the configured interpretation adapter."""

    if not settings.variant_db:
        yield NullInterpretationAdapter()
        return

    if settings.variant_software_backend != "scout_mongo":
        raise HTTPException(
            status_code=503,
            detail=f"Unsupported variant software backend: {settings.variant_software_backend}",
        )

    client = _shared_client(str(settings.variant_db.connection))
    yield ScoutMongoAdapter(client.get_database(settings.variant_db.database))
