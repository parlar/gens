#!/usr/bin/env python3
"""Write the API's OpenAPI schema to a file.

The frontend's Api* types are generated from this, so the schema has to be
obtainable without a running server or a database. Only the routers are
mounted here; create_app also opens a Mongo connection, which a type
generation step has no business needing.
"""

import argparse
import json
import sys
from pathlib import Path

from fastapi import FastAPI

from gens.app import add_api_routers


def build_schema() -> dict:
    """The schema the running server would serve for its API routes."""
    app = FastAPI(title="Gens")
    add_api_routers(app)
    return app.openapi()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        help="write the schema here instead of stdout",
    )
    args = parser.parse_args()

    schema = build_schema()
    if not schema.get("paths"):
        # An empty schema generates an empty types file, which type checks
        # fine and silently removes every check the generated types exist for.
        print("refusing to write a schema with no paths", file=sys.stderr)
        return 1

    text = json.dumps(schema, indent=2, sort_keys=True) + "\n"
    if args.out is None:
        sys.stdout.write(text)
    else:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
