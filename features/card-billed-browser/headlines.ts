import { Kernel } from "@onkernel/sdk";

if (!process.env.KERNEL_API_KEY) {
  throw new Error("Set KERNEL_API_KEY for an account with a credit card on file");
}

const kernel = new Kernel();
const session = await kernel.browsers.create({
  headless: true,
  timeout_seconds: 120,
});

try {
  const response = await kernel.browsers.playwright.execute(session.session_id, {
    code: `
      await page.goto("https://news.ycombinator.com/", { waitUntil: "domcontentloaded" });
      const headlines = page.locator(".athing .titleline > a");
      await headlines.nth(6).waitFor();
      return (await headlines.allTextContents()).slice(0, 7);
    `,
    timeout_sec: 60,
  });

  if (!response.success) {
    throw new Error(response.error ?? response.stderr ?? "Playwright execution failed");
  }

  const headlines = response.result;
  if (
    !Array.isArray(headlines) ||
    headlines.length !== 7 ||
    !headlines.every((headline) => typeof headline === "string")
  ) {
    throw new Error("Expected seven Hacker News headlines");
  }
  headlines.forEach((headline, index) => console.log(`${index + 1}. ${headline}`));
} finally {
  await kernel.browsers.deleteByID(session.session_id);
}
