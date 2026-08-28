import { Kernel } from "@onkernel/sdk";
import { browser, type Browser } from "vibium";

function maskWebSocketURL(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const jwt = url.searchParams.get("jwt");
    if (jwt !== null) {
      url.searchParams.set("jwt", `${jwt.slice(0, 4)}***`);
    }
    return url.toString();
  } catch {
    return "<unparseable webdriver url>";
  }
}

async function main(): Promise<void> {
  const kernel = new Kernel();

  let sessionID: string | undefined;
  let bro: Browser | undefined;

  try {
    const kernelBrowser = await kernel.browsers.create();
    sessionID = kernelBrowser.session_id;
    const webdriverWsURL = kernelBrowser.webdriver_ws_url;

    console.log(`created Kernel browser session ${sessionID}`);
    console.log(`using BiDi endpoint ${maskWebSocketURL(webdriverWsURL)}`);

    bro = await browser.start(webdriverWsURL);
    const page = await bro.page();

    await page.go("https://example.com");
    const title = await page.title();
    const h1 = await page.find("h1").text();

    console.log(`page title: ${title}`);
    console.log(`h1 text: ${h1}`);

    if (title !== "Example Domain") {
      throw new Error(`expected title "Example Domain", got "${title}"`);
    }

    if (h1 !== "Example Domain") {
      throw new Error(`expected h1 "Example Domain", got "${h1}"`);
    }

    console.log("TypeScript example completed successfully");
  } finally {
    if (bro) {
      await bro.stop();
    }

    if (sessionID) {
      await kernel.browsers.deleteByID(sessionID);
    }
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
