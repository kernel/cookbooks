#!/usr/bin/env bash

set -euo pipefail

browser_json=""
session_id=""

cleanup() {
  vibium stop >/dev/null 2>&1 || true

  if [[ -n "${session_id}" ]]; then
    kernel browsers delete "${session_id}" >/dev/null 2>&1 || true
  fi

  if [[ -n "${browser_json}" && -f "${browser_json}" ]]; then
    rm -f "${browser_json}"
  fi
}

trap cleanup EXIT

mask_ws_url() {
  python3 - "$1" <<'PY'
import sys
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

value = sys.argv[1]
parsed = urlparse(value)

query = []
for key, raw_value in parse_qsl(parsed.query, keep_blank_values=True):
    if key == "jwt":
        masked = f"{raw_value[:4]}***" if raw_value else "***"
        query.append((key, masked))
    else:
        query.append((key, raw_value))

print(
    urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(query, safe="*"),
            parsed.fragment,
        )
    )
)
PY
}

main() {
  browser_json="$(mktemp)"
  kernel browsers create -o json >"${browser_json}"

  session_id="$(jq -r '.session_id // empty' "${browser_json}")"
  local webdriver_ws_url
  webdriver_ws_url="$(jq -r '.webdriver_ws_url // empty' "${browser_json}")"

  if [[ -z "${session_id}" || -z "${webdriver_ws_url}" ]]; then
    echo "browser create response did not include session_id and webdriver_ws_url" >&2
    exit 1
  fi

  echo "created Kernel browser session ${session_id}"
  echo "using BiDi endpoint $(mask_ws_url "${webdriver_ws_url}")"
  echo "starting Vibium session"
  vibium start "${webdriver_ws_url}" >/dev/null
  echo "navigating to https://example.com"

  vibium go https://example.com

  local title
  title="$(vibium title)"
  echo "page title: ${title}"
  [[ "${title}" == "Example Domain" ]]

  local heading
  heading="$(vibium text h1)"
  echo "h1 text: ${heading}"
  [[ "${heading}" == "Example Domain" ]]

  echo "CLI example completed successfully"
}

main "$@"
