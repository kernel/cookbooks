/**
 * Example: Testing Ad Blocker Extensions with Kernel Browsers
 *
 * This script demonstrates how to:
 * 1. Create a Kernel browser with an ad blocker extension
 * 2. Navigate to a site with ads
 * 3. Capture network requests to verify ads are blocked
 * 4. Clean up the browser session
 *
 * Prerequisites:
 * - npm install       (in this examples/ directory; installs @onkernel/sdk, playwright, and dev tooling)
 * - export KERNEL_API_KEY=your_api_key
 * - Upload the adguard extension: kernel extensions upload ./extensions/adguard --name adguard
 *
 * Run with: npx tsx test-adblocker.ts
 */

import Kernel from "@onkernel/sdk";
import { chromium, Page } from "playwright";

interface NetworkRequest {
  url: string;
  method: string;
  resourceType: string;
}

async function captureAdRequests(page: Page): Promise<{
  totalRequests: number;
  adRelatedRequests: NetworkRequest[];
}> {
  const requests: NetworkRequest[] = [];

  page.on("request", (req) => {
    requests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
    });
  });

  // Navigate to the target site
  await page.goto(
    "https://13f.info/form-d?from=2026-01-09&to=2026-01-09&types=other+technology&forms=D",
    {
      waitUntil: "networkidle",
    },
  );

  // Wait for any delayed ad requests
  await page.waitForTimeout(3000);

  // Filter for ad-related requests
  const adRelatedRequests = requests.filter(
    (r) =>
      r.url.includes("ads") ||
      r.url.includes("doubleclick") ||
      r.url.includes("googlesyndication") ||
      r.url.includes("adservice") ||
      r.url.includes("fundingchoices") ||
      r.url.includes("analytics"),
  );

  return {
    totalRequests: requests.length,
    adRelatedRequests,
  };
}

async function testWithoutExtension() {
  console.log("\n📊 Testing WITHOUT ad blocker extension...\n");

  const kernel = new Kernel();
  const kernelBrowser = await kernel.browsers.create({
    timeout_seconds: 300,
  });

  console.log(`Browser created: ${kernelBrowser.session_id}`);
  console.log(`Live view: ${kernelBrowser.browser_live_view_url}`);

  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());

  try {
    const result = await captureAdRequests(page);

    console.log(`Total requests: ${result.totalRequests}`);
    console.log(`Ad-related requests: ${result.adRelatedRequests.length}`);
    console.log("\nAd-related URLs:");
    result.adRelatedRequests.slice(0, 5).forEach((r) => {
      console.log(`  - ${r.url.substring(0, 80)}...`);
    });

    return result.adRelatedRequests.length;
  } finally {
    await browser.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
  }
}

async function testWithAdGuard() {
  console.log("\n🛡️ Testing WITH AdGuard extension...\n");

  const kernel = new Kernel();
  const kernelBrowser = await kernel.browsers.create({
    timeout_seconds: 300,
    extensions: [{ name: "adguard" }],
  });

  console.log(`Browser created: ${kernelBrowser.session_id}`);
  console.log(`Live view: ${kernelBrowser.browser_live_view_url}`);

  const browser = await chromium.connectOverCDP(kernelBrowser.cdp_ws_url);
  const context = browser.contexts()[0] || (await browser.newContext());

  // Close any welcome pages opened by the extension
  const allPages = context.pages();
  for (const p of allPages) {
    const url = p.url();
    if (url.includes("welcome.adguard.com") || url.includes("thankyou")) {
      await p.close();
    }
  }

  // Get or create the main page
  const page = context.pages()[0] || (await context.newPage());

  // Wait for extension to initialize
  await page.waitForTimeout(2000);

  try {
    const result = await captureAdRequests(page);

    console.log(`Total requests: ${result.totalRequests}`);
    console.log(`Ad-related requests: ${result.adRelatedRequests.length}`);

    if (result.adRelatedRequests.length > 0) {
      console.log("\nRemaining ad-related URLs:");
      result.adRelatedRequests.forEach((r) => {
        console.log(`  - ${r.url.substring(0, 80)}...`);
      });
    } else {
      console.log("\n✅ All ads blocked!");
    }

    return result.adRelatedRequests.length;
  } finally {
    await browser.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("Ad Blocker Extension Test for Kernel Browsers");
  console.log("=".repeat(60));

  try {
    const baselineAds = await testWithoutExtension();
    const withAdGuardAds = await testWithAdGuard();

    console.log("\n" + "=".repeat(60));
    console.log("RESULTS SUMMARY");
    console.log("=".repeat(60));
    console.log(`Without extension: ${baselineAds} ad requests`);
    console.log(`With AdGuard:      ${withAdGuardAds} ad requests`);
    console.log(
      `Ads blocked:       ${baselineAds - withAdGuardAds} (${Math.round((1 - withAdGuardAds / baselineAds) * 100)}%)`,
    );
    console.log("=".repeat(60));
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
