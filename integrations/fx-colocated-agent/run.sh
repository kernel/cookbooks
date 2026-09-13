#!/bin/sh
# run fx alongside a KERNEL browser so browser-control calls use the local
# playwright endpoint instead of KERNEL's public api.
set -eu

for dependency in curl jq kernel mktemp tar; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "missing required command: $dependency" >&2
    exit 1
  fi
done

if command -v sha256sum >/dev/null 2>&1; then
  verify_checksum() {
    sha256sum -c -
  }
elif command -v shasum >/dev/null 2>&1; then
  verify_checksum() {
    shasum -a 256 -c -
  }
else
  echo "missing required command: sha256sum or shasum" >&2
  exit 1
fi

: "${AI_GATEWAY_API_KEY:?set AI_GATEWAY_API_KEY before running this script}"

FX_MODEL=${FX_MODEL:-anthropic/claude-sonnet-4.5}
FX_TASK=${FX_TASK:-Go to https://news.ycombinator.com and tell me the top 5 article titles.}
FX_VERSION=${FX_VERSION:-v0.0.9}
FX_SHA256=${FX_SHA256:-710069648015f37f68123adc6f9f6137d7075681fb7a0881e251c1b9fe860a85}
BROWSER_TIMEOUT_SECONDS=${BROWSER_TIMEOUT_SECONDS:-900}
PROCESS_TIMEOUT_SECONDS=${PROCESS_TIMEOUT_SECONDS:-90}

SESSION_ID=
LOCAL_TMP_DIR=$(mktemp -d)

cleanup() {
  if [ -n "$SESSION_ID" ]; then
    kernel browsers delete "$SESSION_ID" >/dev/null 2>&1 || true
  fi
  rm -rf "$LOCAL_TMP_DIR"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

process_exec() {
  response=$(kernel browsers process exec "$SESSION_ID" --output json "$@")
  printf '%s' "$response" | jq -jr '(.stdout_b64 // "") | @base64d'
  printf '%s' "$response" | jq -jr '(.stderr_b64 // "") | @base64d' >&2

  exit_code=$(printf '%s' "$response" | jq -er '.exit_code')
  if [ "$exit_code" -ne 0 ]; then
    echo "process exited with code $exit_code" >&2
    return 1
  fi
}

BROWSER_JSON=$(kernel browsers create -t "$BROWSER_TIMEOUT_SECONDS" -y -o json)
SESSION_ID=$(printf '%s' "$BROWSER_JSON" | jq -er '.session_id')
LIVE_VIEW_URL=$(printf '%s' "$BROWSER_JSON" | jq -er '.browser_live_view_url')

printf 'browser session: %s\n' "$SESSION_ID"
printf 'live view: %s\n' "$LIVE_VIEW_URL"

FX_ARCHIVE="$LOCAL_TMP_DIR/fx-linux-x86_64.tar.gz"
curl -fsSL "https://releases.fx.sh/${FX_VERSION}/fx-linux-x86_64.tar.gz" -o "$FX_ARCHIVE"
printf '%s  %s\n' "$FX_SHA256" "$FX_ARCHIVE" | verify_checksum
tar -xzf "$FX_ARCHIVE" -C "$LOCAL_TMP_DIR" fx

kernel browsers fs upload "$SESSION_ID" --file "$LOCAL_TMP_DIR/fx:/tmp/fx"
process_exec --command chmod --args +x --args /tmp/fx

cat > "$LOCAL_TMP_DIR/run_fx.sh" <<'EOF'
#!/bin/sh
set -eu

SYSTEM_PROMPT="you control a live chromium browser running alongside you. \
to drive it, write a json payload file containing \
{\"code\": \"<playwright typescript>\"}, where the code has page, context, \
and browser bound. send it with: curl --fail-with-body --silent --show-error \
-X POST http://127.0.0.1:10001/playwright/execute \
-H 'Content-Type: application/json' --data-binary @payload.json . \
the response's result field holds whatever your code returns. use this local \
endpoint, rather than a direct http fetch, to read page content."

cd /tmp
curl --fail-with-body --silent --show-error \
  -X POST http://127.0.0.1:10001/playwright/execute \
  -H 'Content-Type: application/json' \
  --data-binary '{"code":"return { ready: true }"}' >/dev/null
/tmp/fx ask --yolo --no-save --json --system "$SYSTEM_PROMPT" "$FX_TASK"
EOF

kernel browsers fs upload "$SESSION_ID" --file "$LOCAL_TMP_DIR/run_fx.sh:/tmp/run_fx.sh"
process_exec --command chmod --args +x --args /tmp/run_fx.sh

process_exec \
  --env "AI_GATEWAY_API_KEY=$AI_GATEWAY_API_KEY" \
  --env "FX_MODEL=$FX_MODEL" \
  --env "FX_TASK=$FX_TASK" \
  --timeout "$PROCESS_TIMEOUT_SECONDS" \
  --command /tmp/run_fx.sh
