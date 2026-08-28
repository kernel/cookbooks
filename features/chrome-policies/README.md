# Chrome Enterprise Policies on Kernel Browsers

This guide demonstrates how to apply Chromium Enterprise Policies to a Kernel browser session using the Kernel CLI's native `--chrome-policy` / `--chrome-policy-file` flags, and how to verify they took effect via `chrome://policy`.

## Overview

`kernel browsers create` accepts a Chrome enterprise policy as a JSON object at creation time:

- `--chrome-policy '<json>'` - pass the policy inline
- `--chrome-policy-file <path>` - read the policy from a file (use `-` for stdin)

The policy is validated server-side and applied before the browser starts - no manual file uploads or Chromium restarts required. The applied policy is echoed back in the `chrome_policy` field of the create response.

> **Note:** Some policies are reserved and cannot be overridden. For example, `DeveloperToolsAvailability` is rejected with `Invalid_chrome_policy ... required for CDP connectivity`, since disabling DevTools would break Kernel's CDP-based browser control.

## Prerequisites

- Kernel CLI >= 0.26 installed (`brew install kernel/tap/kernel`)
- `jq` (for the one-shot script)
- A Kernel API key (`export KERNEL_API_KEY='your_api_key_here'`)

## One-shot script

The walkthrough below is automated in [apply-policies.sh](apply-policies.sh), using the sample [policy.json](policy.json):

```bash
export KERNEL_API_KEY='your_api_key_here'
./apply-policies.sh            # or ./apply-policies.sh path/to/your-policy.json
```

It creates a session with the policy applied, prints the active policies from `chrome://policy`, and deletes the session when done.

## Quick Start

### 1. Set your API key

```bash
export KERNEL_API_KEY='your_api_key_here'
```

### 2. Create a policy file

```bash
cat > policy.json << 'EOF'
{
  "IncognitoModeAvailability": 1,
  "BookmarkBarEnabled": true,
  "DefaultBrowserSettingEnabled": false,
  "HomepageLocation": "https://example.com/managed-by-enterprise-policy"
}
EOF
```

### 3. Create a browser session with the policy applied

```bash
kernel browsers create --timeout 600 --chrome-policy-file policy.json -o json
```

Save the `session_id` from the JSON output. The response also echoes the applied policy in the `chrome_policy` field. To pass the policy inline instead:

```bash
kernel browsers create --timeout 600 --chrome-policy '{"BookmarkBarEnabled": true}' -o json
```

### 4. Verify via chrome://policy

Use the Playwright execution API (the code is passed as a positional argument):

```bash
kernel browsers playwright execute <session_id> '
await page.goto("chrome://policy");
await page.waitForTimeout(1500);
await page.click("#reload-policies");
await page.waitForTimeout(1000);
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
```

To take a screenshot of the policy page:

```bash
kernel browsers computer screenshot <session_id> --to policy_screenshot.png
```

### 5. Clean up

```bash
kernel browsers delete <session_id>
```

(No confirmation prompt; multiple IDs or names can be passed at once.)

## Example Policies

### Disable Incognito Mode

```json
{
  "IncognitoModeAvailability": 1
}
```

Values: `0` = Enabled, `1` = Disabled, `2` = Force (only incognito)

### Set Homepage

```json
{
  "HomepageLocation": "https://your-company.com",
  "HomepageIsNewTabPage": false,
  "RestoreOnStartup": 4,
  "RestoreOnStartupURLs": ["https://your-company.com"]
}
```

### Disable Password Manager

```json
{
  "PasswordManagerEnabled": false
}
```

### Force Extensions

```json
{
  "ExtensionInstallForcelist": [
    "extension_id_here;https://clients2.google.com/service/update2/crx"
  ]
}
```

## Verified Policies

The following policies were tested and confirmed working via `--chrome-policy-file`:

| Policy                         | Value   | Effect                          |
| ------------------------------ | ------- | ------------------------------- |
| `IncognitoModeAvailability`    | `1`     | Disables incognito mode         |
| `BookmarkBarEnabled`           | `true`  | Shows bookmark bar              |
| `DefaultBrowserSettingEnabled` | `false` | Disables "make default" prompts |
| `HomepageLocation`             | URL     | Sets custom homepage            |

Not overridable: `DeveloperToolsAvailability` (required for CDP connectivity - rejected at creation).

## Important Notes

1. **Per-session**: The policy applies to the browser session it was created with. Browser pools also support Chrome policies via their pool configuration.

2. **Validation**: Policies are validated at creation time. Invalid or reserved policies fail fast with an `Invalid_chrome_policy` error instead of silently not applying.

3. **Baseline policies**: Kernel browsers ship with some managed defaults (e.g. `PasswordManagerEnabled: false`, `TranslateEnabled: false`, DuckDuckGo as default search). Your custom policy is merged on top of these.

## Appendix: Manual policy files (legacy approach)

Before the native flags existed, policies had to be written to the VM's filesystem and Chromium restarted. This still works and can be useful for experimenting on a running session:

```bash
# 1. Create a session
kernel browsers create --timeout 600 -o json   # save .session_id

# 2. Upload a policy file to the managed policies directory
kernel browsers fs write-file <session_id> \
  --source ./policy.json \
  --path /etc/chromium/policies/managed/custom_policy.json \
  --mode 0644

# 3. Restart Chromium to apply
kernel browsers process exec <session_id> --as-root -- supervisorctl restart chromium

# 4. Inspect the policy files on the VM
kernel browsers process exec <session_id> --as-root -- ls -la /etc/chromium/policies/managed/
kernel browsers process exec <session_id> --as-root -- cat /etc/chromium/policies/managed/custom_policy.json
```

Then verify via `chrome://policy` as in step 4 above. Policy file locations on the VM:

| Path                                  | Description                                          |
| ------------------------------------- | ---------------------------------------------------- |
| `/etc/chromium/policies/managed/`     | Mandatory policies (enforced, users cannot override) |
| `/etc/chromium/policies/recommended/` | Recommended policies (users can override)            |

Notes for the manual approach: files written this way are not validated (a reserved policy may break browser control), do not survive into new sessions, and multiple JSON files in `managed/` are merged in alphabetical order.

## References

- [Chrome Enterprise Policy List](https://chromeenterprise.google/policies/)
- [Kernel Custom Chrome Policies Documentation](https://www.kernel.sh/docs/browsers/chrome-policies)
- [Kernel CLI Reference](https://www.kernel.sh/docs/reference/cli)
