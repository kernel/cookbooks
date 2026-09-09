#!/bin/sh
# Runs the fx coding agent (https://fx.sh) inside a Kernel browser VM, co-located
# with the browser it controls, so each tool call is a loopback instead of a
# round trip through Kernel's public API.
#
# Requires: kernel CLI authenticated (KERNEL_API_KEY), AI_GATEWAY_API_KEY.
set -e

SESSION_ID=$(kernel browsers create -t 900 -y -o json | jq -r .session_id)

# Upload fx into the VM.
curl -fsSL https://releases.fx.sh/latest.txt -o /tmp/fx_version.txt
VERSION=$(cat /tmp/fx_version.txt)
curl -fsSL "https://releases.fx.sh/${VERSION}/fx-linux-x86_64.tar.gz" | tar -xz -C /tmp fx
kernel browsers fs upload "$SESSION_ID" --file /tmp/fx:/usr/local/bin/fx
kernel browsers process exec "$SESSION_ID" --command chmod --args +x --args /usr/local/bin/fx

# fx reaches the browser via the in-VM kernel-images API's playwright-daemon
# on 127.0.0.1:10001.
cat > /tmp/run_fx.sh <<'EOF'
#!/bin/sh
set -e
SYSTEM_PROMPT="You control a live Chromium browser running on this same \
machine (co-located, no network hop). To drive it, write a JSON payload file \
containing {\"code\": \"<playwright TypeScript>\"} where the code has page, \
context, and browser bound, then POST it: curl -s -X POST \
http://127.0.0.1:10001/playwright/execute -H 'Content-Type: application/json' \
--data-binary @payload.json . The response's 'result' field holds whatever \
your code returns. Do not use any other tool (e.g. a direct HTTP fetch) to \
read page content -- you must go through the live browser."
cd /tmp
/usr/local/bin/fx ask --yolo --no-save --json --system "$SYSTEM_PROMPT" \
  "Go to https://news.ycombinator.com and tell me the top 5 article titles."
EOF
kernel browsers fs upload "$SESSION_ID" --file /tmp/run_fx.sh:/tmp/run_fx.sh
kernel browsers process exec "$SESSION_ID" --command chmod --args +x --args /tmp/run_fx.sh

kernel browsers process exec "$SESSION_ID" \
  --env "AI_GATEWAY_API_KEY=$AI_GATEWAY_API_KEY" \
  --env "FX_MODEL=anthropic/claude-sonnet-4.5" \
  --timeout 90 \
  --command /tmp/run_fx.sh

kernel browsers delete "$SESSION_ID"
