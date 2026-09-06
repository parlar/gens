"""What has to be true of the build configuration for a release to work.

utils/check_distribution.sh is the real check: it builds, installs and imports.
This is the fast one, so a bad edit to pyproject.toml fails in a second rather
than only in CI.

The failure it exists for: `[tool.hatch.build] include` names built assets, and
a target that sets no include of its own inherits exactly that list. The wheel
gets its Python from `packages`; the sdist had nothing, so it shipped assets
and no modules, and the wheel pip builds from that sdist could not be imported.
"""

import tomllib
from pathlib import Path

import pytest

PYPROJECT = Path(__file__).resolve().parents[1] / "pyproject.toml"


@pytest.fixture(scope="module")
def build_config():
    return tomllib.loads(PYPROJECT.read_text())["tool"]["hatch"]["build"]


class TestTheSourceDistributionCarriesTheSource:
    def test_it_says_what_to_include(self, build_config):
        assert "sdist" in build_config.get("targets", {}), (
            "without its own include list the sdist inherits the asset list, "
            "which names no Python"
        )

    def test_the_package_is_in_it(self, build_config):
        include = build_config["targets"]["sdist"]["include"]
        assert any(
            entry.rstrip("/") == "gens" for entry in include
        ), f"gens is not in the sdist include list: {include}"

    def test_the_build_metadata_is_in_it(self, build_config):
        # Needed to build the wheel from the unpacked archive at all.
        include = set(build_config["targets"]["sdist"]["include"])
        assert "pyproject.toml" in include
        assert "README.md" in include


class TestTheCompiledAssetsSurviveTheIgnoreFile:
    def test_they_are_declared_as_artifacts(self, build_config):
        # .gitignore hides the compiled CSS and JavaScript from hatchling, and
        # `include` does not override a VCS ignore — only `artifacts` does. A
        # locally built wheel used to contain no frontend at all; the Docker
        # build hid it, because its context has no .gitignore.
        artifacts = " ".join(build_config.get("artifacts", []))
        assert "gens/blueprints/**/static/*" in artifacts
        assert "gens/static/**/*" in artifacts

    def test_the_wheel_names_the_package(self, build_config):
        assert build_config["targets"]["wheel"]["packages"] == ["gens"]


def test_the_sdist_list_points_at_paths_that_exist(build_config):
    # A typo here drops source from the archive with no warning, and an entry
    # for something deleted is dead weight that reads as coverage — the old
    # config still named gens/openapi/openapi.yaml long after that directory
    # went. Only the sdist list is checked: `artifacts` names compiled output,
    # which is absent from a fresh checkout by design.
    root = PYPROJECT.parent
    for entry in build_config["targets"]["sdist"]["include"]:
        base = entry.split("*")[0].rstrip("/")
        assert (root / base).exists(), f"{entry} refers to a missing path"
