"""Where Gens' trust boundary actually is.

Gens authenticates. It does not authorize: there is no per-user, per-case or
per-institute restriction, so every logged-in user can read every sample. That
may well be the intent for a single-laboratory deployment, but it is not
something an administrator can tell from the configuration, which offers OAuth
and LDAP and so looks like it might carry a directory's own access rules
through. docs/admin_guide/configure_gens.md states it plainly; these tests keep
that statement true.

They are not asserting that the absence of authorization is correct. They pin
the boundary as it stands so that adding restrictions is a deliberate change
that fails here, rather than something half-done that leaves the documentation
describing a system nobody has any more.
"""

import ast
import inspect
from pathlib import Path

import pytest

from gens.crud import samples as sample_crud

REPO = Path(__file__).resolve().parents[1]
GENS = REPO / "gens"


class TestSampleQueriesTakeNoUser:
    @pytest.mark.parametrize(
        "name",
        ["get_samples", "get_samples_per_case", "get_samples_for_case", "get_sample"],
    )
    def test_no_user_narrows_the_query(self, name):
        parameters = set(inspect.signature(getattr(sample_crud, name)).parameters)
        assert not parameters & {"user", "user_id", "email", "institute", "roles"}, (
            f"{name} now takes a caller identity. If sample access is being "
            "restricted, update docs/admin_guide/configure_gens.md and this test."
        )


class TestTheRoleFieldDecidesNothing:
    def test_is_admin_is_defined_but_never_consulted(self):
        # LoginUser.is_admin exists, and the CLI writes roles=["user"], but no
        # code branches on either. Scaffolding that looks like a permission
        # model and is not one is worse than none: it invites the assumption
        # that something is being enforced.
        uses = set()
        for path in GENS.rglob("*.py"):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr in {
                    "is_admin",
                    "roles",
                }:
                    uses.add(str(path.relative_to(REPO)))

        # Only the module that defines LoginUser, which copies the field across
        # and exposes is_admin. Nothing else in the app looks at either.
        assert uses == {"gens/auth.py"}, (
            "roles or is_admin is now read outside gens/auth.py. If that is a "
            f"permission check, say so in the admin guide. Found: {sorted(uses)}"
        )


class TestTheBoundaryIsWrittenDown:
    def test_the_admin_guide_says_there_is_no_per_user_restriction(self):
        # The one place an administrator would look before exposing Gens.
        # Checked by topic rather than by sentence, so the wording can be
        # improved without breaking the test; what must not disappear is the
        # section itself and the two facts an administrator needs from it.
        guide = (REPO / "docs" / "admin_guide" / "configure_gens.md").read_text()
        assert "### Who can see what" in guide
        section = guide.split("### Who can see what", 1)[1].split("\n**", 1)[0]
        assert "every sample" in section
        assert "roles" in section
