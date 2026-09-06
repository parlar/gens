#!/usr/bin/env bash
#
# Regenerate frontend/js/generated/api_schema.ts from the API's OpenAPI schema.
#
# With --check, regenerate into a temporary file and fail if it differs from the
# committed one. That is the whole point of the exercise: a route or model
# change that the frontend types no longer describe should fail here rather than
# at runtime in a clinician's browser.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
generated="$repo_root/frontend/js/generated/api_schema.ts"

check_only=0
if [[ "${1:-}" == "--check" ]]; then
  check_only=1
elif [[ $# -gt 0 ]]; then
  echo "usage: $0 [--check]" >&2
  exit 2
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# uv locally, a plain interpreter in CI where gens is pip-installed.
if command -v uv >/dev/null 2>&1; then
  uv run --project "$repo_root" python "$repo_root/utils/dump_openapi.py" \
    --out "$work/openapi.json"
else
  python "$repo_root/utils/dump_openapi.py" --out "$work/openapi.json"
fi

npx --prefix "$repo_root" openapi-typescript "$work/openapi.json" \
  -o "$work/api_schema.ts" >/dev/null

npx --prefix "$repo_root" prettier --write --log-level warn "$work/api_schema.ts"

if [[ "$check_only" == 1 ]]; then
  if ! diff -u "$generated" "$work/api_schema.ts"; then
    echo >&2
    echo "frontend/js/generated/api_schema.ts is out of date." >&2
    echo "Run: npm run types:api" >&2
    exit 1
  fi
  echo "api_schema.ts is up to date"
else
  mkdir -p "$(dirname "$generated")"
  cp "$work/api_schema.ts" "$generated"
  echo "wrote $generated"
fi
