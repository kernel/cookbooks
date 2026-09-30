"""Buy a test MPP browser and print the top seven Hacker News headlines.

Requires `link-cli` (logged in to Link) and `playwright`.
The Link app asks you to approve the test spend before the browser is created.
"""

import asyncio
import json
import subprocess

from playwright.async_api import async_playwright


MPP_URL = "https://api.dev.onkernel.com/mpp/browsers"
CONTEXT = (
    "Create one test-mode Kernel browser session for a short demonstration. "
    "The script will visit Hacker News, read its first seven story headlines, "
    "and print them to the terminal."
)


def link_cli(*args: str) -> dict:
    result = subprocess.run(
        ["link-cli", *args, "--format", "json"],
        capture_output=True,
        text=True,
    )
    output = json.loads(result.stdout)
    if result.returncode:
        raise RuntimeError(f"Link CLI: {output['message']}")
    return output[-1] if isinstance(output, list) else output


def buy_browser() -> dict:
    purchase = link_cli(
        "mpp", "pay", MPP_URL, "--method", "POST", "--test", "--context", CONTEXT
    )
    if "_next" in purchase:
        print(f"Approve the test payment in Link: {purchase['approval_url']}", flush=True)
        approval = link_cli(
            "spend-request",
            "retrieve",
            purchase["id"],
            "--interval",
            "2",
            "--max-attempts",
            "300",
        )
        if approval["status"] != "approved":
            raise RuntimeError(f"Link spend request ended with status {approval['status']}")
        continuation = purchase["_next"]["pay_argv"]
        if continuation["command"] != "mpp" or continuation["args"][0:2] != ["pay", MPP_URL]:
            raise RuntimeError("Unexpected Link payment continuation")
        purchase = link_cli("mpp", *continuation["args"])

    if purchase["status"] != 200:
        raise RuntimeError(f"Browser purchase returned HTTP {purchase['status']}: {purchase['body']}")
    return json.loads(purchase["body"])


async def main() -> None:
    session = buy_browser()
    print(f"Browser session: {session['session_id']} (expires {session['expires_at']})")

    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(session["cdp_ws_url"])
        try:
            context = browser.contexts[0]
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto("https://news.ycombinator.com/", wait_until="domcontentloaded")
            headlines = page.locator(".athing .titleline > a")
            await headlines.nth(6).wait_for()
            for index in range(7):
                print(f"{index + 1}. {await headlines.nth(index).inner_text()}")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
