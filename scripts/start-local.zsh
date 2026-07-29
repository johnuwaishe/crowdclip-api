#!/bin/zsh

set -euo pipefail

supabase_status_env="$(
  SUPABASE_TELEMETRY_DISABLED=1 pnpm exec supabase status -o env 2>/dev/null
)"

supabase_api_url="$(
  printf '%s\n' "$supabase_status_env" |
    sed -n 's/^API_URL="\(.*\)"$/\1/p'
)"

supabase_service_role_key="$(
  printf '%s\n' "$supabase_status_env" |
    sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p'
)"

if [[ -z "$supabase_api_url" || -z "$supabase_service_role_key" ]]; then
  print -u2 "Could not read local Supabase Storage credentials. Is Supabase running?"
  exit 1
fi

export SUPABASE_URL="$supabase_api_url"
export SUPABASE_SERVICE_ROLE_KEY="$supabase_service_role_key"
export MEDIA_DOWNLOAD_WORKER_ENABLED="${MEDIA_DOWNLOAD_WORKER_ENABLED:-true}"

exec pnpm run start:dev
