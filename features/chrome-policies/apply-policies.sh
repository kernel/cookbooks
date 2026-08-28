#!/usr/bin/env bash
# Apply Chromium Enterprise Policies to a Kernel browser session and verify them.
# Automates the walkthrough in README.md: create a session with the policy applied
# via the native --chrome-policy-file flag, then verify via chrome://policy.
#
# Prerequisites: kernel CLI (>= 0.26), jq, KERNEL_API_KEY set.
# Usage: ./apply-policies.sh [policy-file]   (defaults to ./policy.json)
set -euo pipefail

POLICY_FILE="${1:-$(dirname "$0")/policy.json}"
[ -f "$POLICY_FILE" ] || { echo "policy file not found: $POLICY_FILE" >&2; exit 1; }

echo "creating browser session with policy applied..."
SESSION_ID=$(kernel browsers create --timeout 600 --chrome-policy-file "$POLICY_FILE" -o json | jq -r '.session_id')
echo "session: $SESSION_ID"

cleanup() {
  echo "deleting session $SESSION_ID"
  kernel browsers delete "$SESSION_ID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "verifying via chrome://policy..."
kernel browsers playwright execute "$SESSION_ID" '
await page.goto("chrome://policy");
await page.waitForTimeout(1500);
await page.click("#reload-policies");
await page.waitForTimeout(1000);
// Collect every policy that has a value set (includes the ones we just applied)
return await page.evaluate(() => {
  const out = {};
  document.querySelectorAll("policy-table").forEach((table) => {
    table.shadowRoot.querySelectorAll("policy-row").forEach((row) => {
      const name = row.shadowRoot.querySelector(".name")?.textContent?.trim();
      const value = row.shadowRoot.querySelector(".value")?.textContent?.trim();
      if (name && value) out[name] = value;
    });
  });
  return out;
});
'
