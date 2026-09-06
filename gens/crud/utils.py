"""Shared functions for building queries."""

from typing import Any


def query_genomic_region(
    start_pos: int | None,
    end_pos: int | None,
    start_field: str = "start",
) -> dict[str, Any]:
    """Match records overlapping the inclusive interval [start_pos, end_pos].

    Two intervals overlap when neither finishes before the other begins, which
    is the whole test: the record has not ended before the window starts, and
    has not started after the window ends. Written out that way it also covers
    a record larger than the window, which has neither endpoint inside it — for
    this tool that is a deletion spanning the whole view, the very thing the
    reader is looking at.

    Either bound may be omitted and each one given constrains the query on its
    own. The endpoint allows a request with only a start, and requiring both
    meant such a request was not narrowed at all.

    `start_field` names the field holding a record's first base. It is a field
    name rather than a record category because that is what actually varies:
    Scout keeps a variant's first base in `position` whatever its category, and
    Gens' own transcripts use `start`. Deciding from the category instead meant
    every category except `sv` — `cancer_sv` included — looked up a field that
    Scout does not have, so a bounded query silently matched nothing on that
    clause.
    """
    clauses: list[dict[str, Any]] = []
    if start_pos is not None:
        clauses.append({"end": {"$gte": start_pos}})
    if end_pos is not None:
        clauses.append({start_field: {"$lte": end_pos}})

    if not clauses:
        return {}
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}
