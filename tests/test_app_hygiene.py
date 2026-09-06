"""Invariants about how the app is wired that are easy to lose silently.

Each of these was broken and is cheap to break again: nothing fails loudly when
debug is left on, when an error handler is defined but never registered, or when
a blocking handler is declared async.
"""

import ast
from pathlib import Path

import pytest

from gens.config import settings
from gens.db.db import _shared_client

ROUTES_DIR = Path(__file__).resolve().parents[1] / "gens" / "routes"


class TestDebugMode:
    def test_debug_is_off_unless_asked_for(self):
        # Flask debug puts an interactive traceback on the error page, showing
        # source and local variables to whoever triggered the error.
        assert settings.debug is False

    def test_the_app_takes_debug_from_settings(self):
        source = (Path(__file__).resolve().parents[1] / "gens" / "app.py").read_text()
        assert 'flask_app.config["DEBUG"] = settings.debug' in source
        assert 'flask_app.config["DEBUG"] = True' not in source


class TestErrorHandlers:
    def test_the_error_handlers_are_registered(self):
        # register_errors existed for a long time without ever being called, so
        # every error fell through to Flask's own page.
        source = (Path(__file__).resolve().parents[1] / "gens" / "app.py").read_text()
        assert "register_errors(flask_app)" in source


class TestDatabaseClients:
    def test_one_client_per_connection_string(self):
        # A MongoClient owns a connection pool and is meant to be long-lived.
        first = _shared_client("mongodb://localhost:27017")
        second = _shared_client("mongodb://localhost:27017")
        assert first is second

    def test_a_different_database_gets_its_own_client(self):
        first = _shared_client("mongodb://localhost:27017")
        other = _shared_client("mongodb://localhost:27018")
        assert first is not other

    def test_the_request_dependency_does_not_close_the_client(self):
        source = (
            Path(__file__).resolve().parents[1] / "gens" / "db" / "db.py"
        ).read_text()
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name == "get_gens_db":
                calls = [
                    n
                    for n in ast.walk(node)
                    if isinstance(n, ast.Call)
                    and isinstance(n.func, ast.Attribute)
                    and n.func.attr == "close"
                ]
                assert calls == [], "closing a shared client breaks the next request"
                return
        pytest.fail("get_gens_db not found")


def route_handlers():
    """Every function in gens/routes that carries a @router decorator."""
    for path in sorted(ROUTES_DIR.glob("*.py")):
        tree = ast.parse(path.read_text())
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            decorated = any(
                isinstance(d, ast.Call)
                and isinstance(d.func, ast.Attribute)
                and isinstance(d.func.value, ast.Name)
                and d.func.value.id == "router"
                for d in node.decorator_list
            )
            if decorated:
                yield path.name, node


class TestRouteConcurrency:
    def test_there_are_route_handlers_to_check(self):
        # A silent zero here would make the next test vacuous.
        assert len(list(route_handlers())) > 15

    @pytest.mark.parametrize(
        "case", list(route_handlers()), ids=lambda case: f"{case[0]}::{case[1].name}"
    )
    def test_an_async_handler_actually_awaits(self, case):
        # FastAPI runs a plain def handler in a threadpool and an async one on
        # the event loop. An async handler that only does blocking database and
        # file work holds the loop for every other request until it finishes.
        _, node = case
        if not isinstance(node, ast.AsyncFunctionDef):
            return
        awaits = [n for n in ast.walk(node) if isinstance(n, ast.Await)]
        assert awaits, (
            f"{node.name} is async but never awaits; declare it 'def' so FastAPI "
            "runs it in a threadpool instead of on the event loop"
        )
