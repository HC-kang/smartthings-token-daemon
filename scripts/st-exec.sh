#!/usr/bin/env bash
set -euo pipefail

TOKEN_URL="${SMARTTHINGS_TOKEN_URL:-http://127.0.0.1:8787/token}"
LOCAL_BEARER="${SMARTTHINGS_LOCAL_BEARER:-}"

curl_args=()
if [[ -n "${LOCAL_BEARER}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${LOCAL_BEARER}")
fi

TOKEN="$(curl -fsS "${curl_args[@]}" "${TOKEN_URL}" | jq -r '.access_token')"
if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "failed to fetch access token" >&2
  exit 1
fi

exec env SMARTTHINGS_TOKEN="${TOKEN}" smartthings "$@"
