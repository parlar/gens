"""The published schema has to describe what the server actually sends.

frontend/js/types.ts generates its Api* types from this schema, so a schema
that disagrees with the wire produces types that describe a response nobody
sends, and TypeScript then vouches for the wrong shape. That is worse than the
hand-written types it replaced, because it looks checked.

The way it went wrong before: AnnotationTrackInDb declared
``track_id: ... = Field(alias="_id")``, which renames the field in both
directions, and the route worked around it with ``response_model_by_alias=False``.
FastAPI does not reflect that flag in the schema, so the schema said ``_id``
while the route sent ``track_id``.
"""

from typing import get_args

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import BaseModel

from gens.app import add_api_routers
from gens.models.annotation import AnnotationTrackInDb, ScoutSampleCall
from gens.models.sample_annotation import SampleAnnotationTrackInDb
from gens.routes import annotations, base, gene_lists, sample, sample_annotations

ROUTE_MODULES = (annotations, base, gene_lists, sample, sample_annotations)
API_PREFIX = "/api"


def build_app() -> FastAPI:
    app = FastAPI(title="Gens")
    add_api_routers(app)
    return app


@pytest.fixture(scope="module")
def schema():
    return build_app().openapi()


class TestSchemaIsObtainable:
    def test_the_schema_needs_no_database(self, schema):
        # utils/dump_openapi.py runs in CI and in a checkout with no Mongo. If
        # building the schema ever needs a connection, type generation stops
        # being something anyone can run.
        assert schema["paths"]

    def test_every_route_is_described(self, schema):
        # add_api_routers mounts each router under /api, and this walks the
        # routers themselves rather than app.routes: FastAPI wraps included
        # routers in a private object that hides the APIRoutes from the app.
        routes = list(api_routes())
        assert len(routes) > 20
        for route in routes:
            assert API_PREFIX + route.path in schema["paths"], route.path


def api_routes():
    """Every APIRoute the app mounts, read off the routers that define them."""
    for module in ROUTE_MODULES:
        for route in module.router.routes:
            if isinstance(route, APIRoute):
                yield route


def response_models():
    """Every route's response model, with the route and its by_alias setting.

    by_alias is part of the contract: it decides whether the body carries the
    field's alias or its name, and FastAPI does not reflect it in the schema.
    """
    for route in api_routes():
        model = route.response_model
        # list[Model] and Model | None both wrap the model we care about
        for candidate in (model, *get_args(model)):
            if isinstance(candidate, type) and issubclass(candidate, BaseModel):
                yield route.path, candidate, route.response_model_by_alias
                break


class TestSchemaMatchesTheWire:
    def test_there_are_response_models_to_check(self):
        assert len(list(response_models())) > 15

    @pytest.mark.parametrize(
        "case", list(response_models()), ids=lambda c: f"{c[0]}::{c[1].__name__}"
    )
    def test_the_schema_names_the_fields_the_response_carries(self, case, schema):
        path, model, by_alias = case
        component = schema["components"]["schemas"].get(model.__name__)
        if component is None or "properties" not in component:
            pytest.skip(f"{model.__name__} is not a plain object schema")

        # What a response body's keys are: pydantic serialises by alias, and
        # FastAPI dumps the response model the same way — unless the route says
        # response_model_by_alias=False, which sends field names instead and
        # which the schema does not reflect. Computed fields are part of the
        # body too: SampleInfo's file indexes and GenomicRegion's region string
        # are all computed.
        serialised = {
            (field.serialization_alias or name) if by_alias else name
            for name, field in model.model_fields.items()
        } | {
            (field.alias or name) if by_alias else name
            for name, field in model.model_computed_fields.items()
        }
        published = set(component["properties"])
        assert serialised == published, (
            f"{model.__name__} (returned by {path}) sends {sorted(serialised)} "
            f"but the schema publishes {sorted(published)}. The generated "
            "frontend types describe the schema, so they would be wrong."
        )


class TestTrackIdCrossesTheWireByName:
    @pytest.mark.parametrize(
        "model", [AnnotationTrackInDb, SampleAnnotationTrackInDb], ids=lambda m: m.__name__
    )
    def test_it_reads_mongos_underscore_id(self, model):
        document = {
            "_id": ObjectId("6a9dc5e3a33be5bd1003672e"),
            "name": "repeats",
            "description": "",
            "maintainer": None,
            "metadata": [],
            "genome_build": 38,
            "sample_id": "s",
            "case_id": "c",
        }
        assert str(model.model_validate(document).track_id) == "6a9dc5e3a33be5bd1003672e"

    @pytest.mark.parametrize(
        "model", [AnnotationTrackInDb, SampleAnnotationTrackInDb], ids=lambda m: m.__name__
    )
    def test_it_is_sent_as_track_id(self, model):
        # The frontend used to copy _id onto track_id on arrival for one of
        # these two routes and not the other.
        fields = model.model_fields["track_id"]
        assert fields.validation_alias == "_id"
        assert fields.serialization_alias is None


class TestScoutSampleCallIsForgiving:
    def test_an_empty_call_validates(self):
        # Scout documents are written by several pipelines. A required field
        # here would turn one missing key into a 500 on the whole route.
        call = ScoutSampleCall.model_validate({})
        assert call.sample_id is None
        assert call.allele_depths == []

    def test_unknown_keys_survive(self):
        call = ScoutSampleCall.model_validate({"sample_id": "x", "gt_type": "hom"})
        assert call.model_dump()["gt_type"] == "hom"
