import { spawnSync } from "node:child_process";
import { chromium } from "playwright-core";

const MPP_URL = "https://api.dev.onkernel.com/mpp/browsers";
const CONTEXT =
  "Buy one test-mode Kernel browser session to visit Hacker News, read its first seven story headlines, and print them to the terminal as a Link MPP payment demonstration.";

type LinkOutput = {
  id?: string;
  status?: number | string;
  approval_url?: string;
  body?: string;
  message?: string;
  _next?: { pay_argv: { command: string; args: string[] } };
};

function linkCli(...args: string[]): LinkOutput {
  const result = spawnSync("link-cli", [...args, "--format", "json"], {
    encoding: "utf8",
  });
  if (result.error) throw result.error;

  const output = JSON.parse(result.stdout) as LinkOutput | LinkOutput[];
  const last = Array.isArray(output) ? output.at(-1) : output;
  if (!last) throw new Error("Link CLI returned no result");
  if (result.status !== 0) {
    throw new Error(`Link CLI: ${last.message}`);
  }
  return last;
}

function buyBrowser(): { cdp_ws_url: string; session_id: string; expires_at: string } {
  let purchase = linkCli(
    "mpp",
    "pay",
    MPP_URL,
    "--method",
    "POST",
    "--test",
    "--context",
    CONTEXT,
  );

  if (purchase._next) {
    if (!purchase.id || !purchase.approval_url) {
      throw new Error("Link did not return an approval request");
    }
    console.log(`Approve the test payment in Link: ${purchase.approval_url}`);
    const approval = linkCli(
      "spend-request",
      "retrieve",
      purchase.id,
      "--interval",
      "2",
      "--max-attempts",
      "300",
    );
    if (approval.status !== "approved") {
      throw new Error(`Link spend request ended with status ${approval.status}`);
    }

    const continuation = purchase._next.pay_argv;
    if (
      continuation.command !== "mpp" ||
      continuation.args[0] !== "pay" ||
      continuation.args[1] !== MPP_URL
    ) {
      throw new Error("Unexpected Link payment continuation");
    }
    purchase = linkCli("mpp", ...continuation.args);
  }

  if (purchase.status !== 200 || !purchase.body) {
    throw new Error(`Browser purchase returned HTTP ${purchase.status}`);
  }
  return JSON.parse(purchase.body);
}

const session = buyBrowser();
console.log(`Browser session: ${session.session_id} (expires ${session.expires_at})`);

const browser = await chromium.connectOverCDP(session.cdp_ws_url);
try {
  const context = browser.contexts()[0];
  if (!context) throw new Error("Kernel browser has no default context");
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" });
  const headlines = page.locator(".athing .titleline > a");
  await headlines.nth(6).waitFor();
  for (let index = 0; index < 7; index++) {
    console.log(`${index + 1}. ${await headlines.nth(index).innerText()}`);
  }
} finally {
  await browser.close();
}
