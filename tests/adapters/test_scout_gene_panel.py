"""A panel walk has to say which version of the panel it walked.

Panels are curated, so "the newest version" names a different set of genes from
one week to the next. Without a pinned version the adapter picks the newest and
only it knows which that was; the route used to echo the caller's own request
back, which for an unpinned request was empty. A reader was then told nothing
about the set they had been handed.
"""

import mongomock
import pytest

from gens.adapters.scout import ScoutMongoAdapter

PANEL = "demo_cardio"


def panel(version: float, symbols: list[str]) -> dict:
    """A Scout gene panel, which stores its version as a number."""
    return {
        "panel_name": PANEL,
        "display_name": "Demo cardiomyopathy",
        "version": version,
        "genes": [{"hgnc_symbol": symbol} for symbol in symbols],
    }


@pytest.fixture(name="adapter")
def adapter_fixture() -> ScoutMongoAdapter:
    db = mongomock.MongoClient().scout
    db.gene_panel.insert_many(
        [
            panel(1.0, ["CASQ2", "LMNA"]),
            panel(2.0, ["CASQ2", "LMNA", "TNNT2"]),
        ]
    )
    return ScoutMongoAdapter(db)


def test_reports_the_version_it_settled_on(adapter: ScoutMongoAdapter) -> None:
    """An unpinned request still names the version it used."""
    resolved = adapter.get_gene_list(PANEL)

    assert resolved.version == "2.0"
    assert resolved.symbols == ["CASQ2", "LMNA", "TNNT2"]


def test_a_pinned_version_comes_back_as_itself(adapter: ScoutMongoAdapter) -> None:
    resolved = adapter.get_gene_list(PANEL, version="1.0")

    assert resolved.version == "1.0"
    assert resolved.symbols == ["CASQ2", "LMNA"]


def test_the_version_can_be_handed_straight_back(adapter: ScoutMongoAdapter) -> None:
    """What comes out pins what went in.

    The listing and this spell the version the same way, so a reader who saw
    "2.0" beside a panel can ask for that set again and get it.
    """
    first = adapter.get_gene_list(PANEL)
    again = adapter.get_gene_list(PANEL, version=first.version)

    assert again.version == first.version
    assert again.symbols == first.symbols


def test_a_panel_that_is_not_there_reports_no_version(
    adapter: ScoutMongoAdapter,
) -> None:
    # Empty rather than the requested one: claiming a version for a panel that
    # does not exist would be worse than saying nothing.
    resolved = adapter.get_gene_list("no_such_panel", version="3.0")

    assert resolved.version == ""
    assert resolved.symbols == []


def test_an_unparseable_version_falls_back_to_the_newest(
    adapter: ScoutMongoAdapter,
) -> None:
    resolved = adapter.get_gene_list(PANEL, version="not-a-number")

    assert resolved.version == "2.0"
    assert resolved.symbols == ["CASQ2", "LMNA", "TNNT2"]
