#!/usr/bin/env bash
#
# Build the distributions and prove the result is a working install.
#
# `import gens` alone is not a sufficient check: with the modules missing, the
# leftover asset directory still makes `gens` a namespace package, so the
# import succeeds and tells you nothing. This imports the application and runs
# the CLI entry point, from outside the checkout so that a stray `gens/` on the
# path cannot stand in for the installed one.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# CI installs the interpreter as `python`; a plain checkout usually has only
# `python3`.
python_bin="$(command -v python || command -v python3)"

# Everything happens in throwaway environments. Installing the build tool into
# the interpreter itself fails on a distro-managed Python (PEP 668) and would
# be rude even where it works.
echo "Preparing a build environment..."
"$python_bin" -m venv "$work/buildenv"
"$work/buildenv/bin/pip" install --quiet --upgrade pip build

echo "Building sdist and wheel..."
# --sdist first, then the wheel from that sdist: a wheel built directly from
# the checkout can be fine while the published source archive is not, which is
# exactly how this last broke.
"$work/buildenv/bin/python" -m build --sdist --outdir "$work/dist" "$repo_root" >/dev/null
sdist="$(ls "$work"/dist/*.tar.gz)"
"$work/buildenv/bin/python" -m build --wheel --outdir "$work/dist" "$sdist" >/dev/null
wheel="$(ls "$work"/dist/*.whl)"
echo "  sdist: $(basename "$sdist")"
echo "  wheel: $(basename "$wheel")"

echo "Installing into a clean environment..."
"$python_bin" -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet "$wheel"

echo "Checking the installed package..."
# Run from somewhere that is not the checkout, with -I so the current
# directory and user site-packages are ignored.
cd "$work"
"$work/venv/bin/python" -I - <<'PY'
import sys
from importlib.resources import files

import gens.app
import gens.cli
import gens.config

root = files("gens")
required = {
    "config.toml": (root / "config.toml").is_file(),
    "viewer templates": (root / "blueprints/gens/templates").is_dir(),
    "compiled javascript": (root / "blueprints/gens/static/gens.min.js").is_file(),
    "compiled css": (root / "blueprints/gens/static/gens.min.css").is_file(),
}
for name, present in required.items():
    print(f"  {'ok     ' if present else 'MISSING'} {name}")
missing = [name for name, present in required.items() if not present]
if missing:
    sys.exit(f"distribution is missing: {', '.join(missing)}")
print("  ok      gens.app, gens.cli and gens.config import")
PY

"$work/venv/bin/gens" --version >/dev/null
echo "  ok      the gens CLI entry point runs"
echo "Distribution is complete."
