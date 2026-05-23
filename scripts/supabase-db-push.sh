#!/usr/bin/env bash
set -euo pipefail

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v colima >/dev/null 2>&1; then
  echo "Error: colima is not installed or not in PATH." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: docker CLI is not installed or not in PATH." >&2
  exit 1
fi

if ! colima status >/dev/null 2>&1; then
  echo "Starting Colima..."
  colima start
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker daemon is still unavailable after Colima start." >&2
  exit 1
fi

set +e
output="$(supabase db push "$@" 2>&1)"
exit_code=$?
set -e

printf '%s\n' "$output"

# Supabase CLI beta may return exit 1 for no-op states.
if [[ $exit_code -ne 0 ]] && printf '%s' "$output" | grep -Eq "Remote database is up to date|No migrations to apply|No schema changes found"; then
  exit 0
fi

exit "$exit_code"