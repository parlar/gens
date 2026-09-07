"""The client and the server have to agree on how wide a homology query may be.

The frontend refuses to ask above this limit and the endpoint refuses to answer
above it. If the two numbers drift apart, either whole views break with an HTTP
error or a servable region is withheld with nothing said.
"""

import re
from pathlib import Path

from gens.crud.homology import MAX_HOMOLOGY_WINDOW


def test_the_client_and_the_endpoint_use_the_same_limit():
    constants = (
        Path(__file__).resolve().parents[1] / "frontend/js/constants.ts"
    ).read_text()
    match = re.search(r"HOMOLOGY_MAX_WINDOW\s*=\s*([0-9_]+)\s*;", constants)

    assert match is not None, "HOMOLOGY_MAX_WINDOW is gone from constants.ts"
    assert int(match.group(1).replace("_", "")) == MAX_HOMOLOGY_WINDOW
