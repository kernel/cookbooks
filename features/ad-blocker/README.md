# Using Ad Blocker Extensions with Kernel Browsers

This guide documents how to use popular ad blocker extensions with [Kernel](https://www.kernel.sh) cloud browsers for automation workflows.

## Quick Start (Recommended: AdGuard)

Based on our testing, **AdGuard** is the recommended ad blocker for Kernel browser automation because it works immediately out of the box without any user interaction or configuration.

```bash
# Set your API key
export KERNEL_API_KEY=your_api_key_here

# 1. Download AdGuard from Chrome Web Store
kernel extensions download-web-store \
  "https://chromewebstore.google.com/detail/adguard-adblocker/bgnkhhnnamicmpeenaelnjfhikgbkllg" \
  --to ./extensions/adguard

# 2. Upload to Kernel
kernel extensions upload ./extensions/adguard --name adguard

# 3. Create a browser with the extension
kernel browsers create --extension adguard
```

## Test Results Summary

We tested three popular ad blockers against `https://13f.info/form-d` (a site with Google AdSense ads):

| Extension                   | Ad-Related Requests | Works Out of Box? | Notes                            |
| --------------------------- | ------------------- | ----------------- | -------------------------------- |
| **Baseline (no extension)** | 12                  | N/A               | Control test                     |
| **AdGuard**                 | 1                   | ✅ Yes            | Best for automation              |
| **uBlock Origin**           | 21-24               | ❌ No             | Filter lists need initialization |
| **Poper Blocker**           | 24                  | ❌ No             | Requires consent dialog          |

### Why AdGuard Works Best

- **Immediate blocking**: Starts blocking ads as soon as the browser launches
- **No user interaction required**: Works without clicking consent dialogs or configuring settings
- **Manifest V3**: Uses modern Chrome extension architecture
- **Comprehensive**: Blocks ads, trackers, and popups

### Why Others Didn't Work

- **uBlock Origin**: Uses Manifest V2 and requires filter lists to be loaded/compiled on first run. This typically happens via network requests and internal processing that may not complete before navigation.
- **Poper Blocker**: Opens a consent dialog requiring users to agree to privacy terms before functioning. Not suitable for headless/automated use.

## Step-by-Step Guide

### Prerequisites

1. Install the Kernel CLI:

   ```bash
   brew install kernel/tap/kernel
   # or
   npm install -g @onkernel/cli
   ```

2. Set your API key:
   ```bash
   export KERNEL_API_KEY=your_api_key_here
   ```

### Step 1: Download Extension from Chrome Web Store

The Kernel CLI can download and unpack extensions directly from the Chrome Web Store:

```bash
# AdGuard (Recommended)
kernel extensions download-web-store \
  "https://chromewebstore.google.com/detail/adguard-adblocker/bgnkhhnnamicmpeenaelnjfhikgbkllg" \
  --to ./extensions/adguard

# uBlock Origin (requires configuration)
kernel extensions download-web-store \
  "https://chromewebstore.google.com/detail/ublock-origin/cjpalhdlnbpafiamejdnhcphjbkeiagm" \
  --to ./extensions/ublock-origin

# Poper Blocker (requires consent)
kernel extensions download-web-store \
  "https://chromewebstore.google.com/detail/poper-blocker-popup-block/bkkbcggnhapdmkeljlodobbkopceiche" \
  --to ./extensions/poper-blocker
```

### Step 2: Upload Extension to Kernel

Upload the unpacked extension to your Kernel account:

```bash
kernel extensions upload ./extensions/adguard --name adguard
```

This will output an extension ID and name that you can use when creating browsers. Manage uploaded extensions with:

```bash
# List uploaded extensions
kernel extensions list

# Delete an extension (--yes skips the confirmation prompt)
kernel extensions delete <extension-id-or-name> --yes
```

### Step 3: Create a Browser with the Extension

```bash
# Using extension name
kernel browsers create --extension adguard

# With additional options
kernel browsers create --extension adguard --timeout 600 -o json

# With multiple extensions
kernel browsers create --extension adguard --extension poper-blocker
```

You can also load an unpacked extension into an already-running browser (this restarts Chromium when needed):

```bash
kernel browsers extensions upload <session_id> ./extensions/adguard
```

### Step 4: Use with Playwright

Once you have a browser with the extension, connect via CDP:

```typescript
import Kernel from "@onkernel/sdk";
import { chromium } from "playwright";

const kernel = new Kernel();

// Create browser with ad blocker
const kernelBrowser = await kernel.browsers.create({
  extensions: [{ name: "adguard" }],
});

// Connect with Playwright
const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
const context = browser.contexts()[0] || (await browser.newContext());
const page = context.pages()[0] || (await context.newPage());

try {
  // Navigate to a site with ads
  await page.goto("https://13f.info/form-d?from=2026-01-09&to=2026-01-09");

  // Wait for page to load
  await page.waitForLoadState("networkidle");

  // Ads should be blocked!
  const title = await page.title();
  console.log("Page loaded:", title);
} finally {
  await browser.close();
  await kernel.browsers.deleteByID(kernelBrowser.session_id);
}
```

## Using the Playwright Execution API

For one-off tests, you can use Kernel's Playwright execution API:

```bash
# Create a browser with extension
kernel browsers create --extension adguard --timeout 600 -o json
# Note the session_id from the output

# Execute Playwright code against it (the code is a positional argument)
kernel browsers playwright execute <session_id> '
  await page.goto("https://13f.info/form-d");
  await page.waitForLoadState("networkidle");
  return { title: await page.title() };
'

# Clean up when done (no confirmation prompt)
kernel browsers delete <session_id>
```

## Handling Welcome Pages

Some extensions (like AdGuard) open a welcome/thank-you page on first run. This is typically not an issue for automation because:

1. The extension is already active and blocking ads
2. You can close extra tabs programmatically if needed:

```typescript
// Close any welcome tabs
const pages = context.pages();
for (const p of pages) {
  const url = p.url();
  if (url.includes("welcome.adguard.com") || url.includes("thankyou")) {
    await p.close();
  }
}
```

## Extension Configuration (Advanced)

If you need to pre-configure an extension before uploading:

1. Download and unpack the extension
2. Examine the extension's manifest.json and storage files
3. Modify configuration files as needed
4. Upload the modified extension

For example, to disable the welcome page in AdGuard, you might modify the extension's local storage or manifest, though this varies by extension.

## Troubleshooting

### Extension Not Blocking Ads

1. **Wait for initialization**: Some extensions need time to load filter lists. Try adding a delay:

   ```typescript
   await page.waitForTimeout(3000); // Wait 3 seconds
   await page.goto("https://example.com");
   ```

2. **Check for consent dialogs**: Some extensions require user interaction. Use AdGuard instead.

3. **Reload the page**: If ads load on first navigation, try reloading:
   ```typescript
   await page.goto("https://example.com");
   await page.reload({ waitUntil: "networkidle" });
   ```

### Multiple Tabs Opening

Some extensions open welcome/configuration tabs. Close them programmatically:

```typescript
const pages = context.pages();
// Keep only the page you need
for (const p of pages) {
  if (!p.url().includes("your-target-site.com")) {
    await p.close();
  }
}
```

## Files in This Repository

```
.
├── README.md                 # This guide
└── examples/
    ├── package.json          # Dependencies for the example script
    ├── tsconfig.json         # TypeScript config for the example script
    └── test-adblocker.ts     # Example Playwright test script
```

## Additional Resources

- [Kernel Extensions Documentation](https://www.kernel.sh/docs/browsers/extensions)
- [Kernel CLI Reference](https://www.kernel.sh/docs/reference/cli)
- [Chrome Web Store - AdGuard](https://chromewebstore.google.com/detail/adguard-adblocker/bgnkhhnnamicmpeenaelnjfhikgbkllg)
