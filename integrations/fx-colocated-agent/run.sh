#!/bin/sh
# run fx (embedded via libfx) alongside a KERNEL browser, using the Browser
# REPL so its tool calls run in-process instead of over a local HTTP hop.
set -eu

for dependency in curl jq kernel mktemp; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "missing required command: $dependency" >&2
    exit 1
  fi
done

: "${AI_GATEWAY_API_KEY:?set AI_GATEWAY_API_KEY before running this script}"

FX_MODEL=${FX_MODEL:-anthropic/claude-sonnet-4.5}
FX_TASK=${FX_TASK:-Go to https://news.ycombinator.com and tell me the top 5 article titles.}
LIBFX_VERSION=${LIBFX_VERSION:-0.0.10}
BROWSER_TIMEOUT_SECONDS=${BROWSER_TIMEOUT_SECONDS:-900}
PROCESS_TIMEOUT_SECONDS=${PROCESS_TIMEOUT_SECONDS:-60}
REPL_TIMEOUT_SECONDS=${REPL_TIMEOUT_SECONDS:-90}

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

process_exec --timeout "$PROCESS_TIMEOUT_SECONDS" --command npm --args install --args -g --args "libfx@$LIBFX_VERSION"

CONFIG_JSON=$(jq -cn \
  --arg apiKey "$AI_GATEWAY_API_KEY" \
  --arg model "$FX_MODEL" \
  --arg task "$FX_TASK" \
  '{apiKey: $apiKey, model: $model, task: $task}')

AGENT_SCRIPT="$LOCAL_TMP_DIR/agent.js"
{
  printf 'const config = %s;\n' "$CONFIG_JSON"
  cat <<'EOF'
const { createFxAgent } = await import('libfx');

let lastSnapshot = null;

function findNode(backendNodeId) {
  const node = lastSnapshot?.nodes?.find((n) => n.backendNodeId === backendNodeId);
  if (!node) throw new Error(`unknown backendNodeId: ${backendNodeId} (call snapshot first)`);
  return node;
}

const tools = [
  {
    name: 'goto',
    description: 'Navigate the browser to a URL and wait for the page to finish loading.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async execute({ url }) {
      await gotoUrl(url);
      await waitForLoad();
      return await pageInfo();
    },
  },
  {
    name: 'snapshot',
    description:
      'Get an accessibility tree snapshot of the current page. Nodes carry a ' +
      'backendNodeId, role, and name; pass a backendNodeId to click or type. Call this ' +
      'again after any navigation or action, since backendNodeIds go stale once the ' +
      'DOM changes.',
    inputSchema: { type: 'object', properties: {} },
    async execute() {
      lastSnapshot = await accessibilitySnapshot();
      return lastSnapshot;
    },
  },
  {
    name: 'click',
    description: 'Click a node returned by the most recent snapshot call.',
    inputSchema: {
      type: 'object',
      properties: { backendNodeId: { type: 'integer' } },
      required: ['backendNodeId'],
    },
    async execute({ backendNodeId }) {
      await click(findNode(backendNodeId));
      return { ok: true };
    },
  },
  {
    name: 'type',
    description: 'Fill an input node returned by the most recent snapshot call, optionally pressing Enter afterward.',
    inputSchema: {
      type: 'object',
      properties: {
        backendNodeId: { type: 'integer' },
        text: { type: 'string' },
        submit: { type: 'boolean' },
      },
      required: ['backendNodeId', 'text'],
    },
    async execute({ backendNodeId, text, submit }) {
      await fillInput(findNode(backendNodeId), text);
      if (submit) await pressKey('Enter');
      return { ok: true };
    },
  },
  {
    name: 'js',
    description:
      'Evaluate a JavaScript function body against the page and return its result, ' +
      'for anything the other tools cannot express.',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    async execute({ code }) {
      return await js(new Function(code));
    },
  },
];

const agent = await createFxAgent({
  apiKey: config.apiKey,
  model: config.model,
  instructions:
    'You control a live Chromium browser through the tools provided. Call snapshot ' +
    'after navigating or acting, before clicking or typing.',
  tools,
});

const turn = agent.prompt(config.task);
let text = '';
for await (const event of turn) {
  if (event.type === 'text_delta') text += event.delta;
}
const result = await turn.result;
await agent.close();

repl.write(JSON.stringify({ text, stopReason: result.stopReason, usage: result.usage }));
EOF
} > "$AGENT_SCRIPT"

REPL_JSON=$(kernel browsers repl "$SESSION_ID" --timeout-sec "$REPL_TIMEOUT_SECONDS" -o json < "$AGENT_SCRIPT")

if [ "$(printf '%s' "$REPL_JSON" | jq -r '.success')" != "true" ]; then
  printf '%s' "$REPL_JSON" | jq -r '"error: " + .error, .stack' >&2
  exit 1
fi

printf '%s' "$REPL_JSON" | jq -r '.content[] | select(.type == "text" and .channel == "write") | .text' | jq -r '.text'
