import asyncio
import os

from dotenv import load_dotenv
from kernel import AsyncKernel
from playwright.async_api import async_playwright

# Load environment variables
load_dotenv()

# Configuration
# WEBSITE_URL is required: set it to the receipt/order lookup page you want to automate.
WEBSITE_URL = os.getenv("WEBSITE_URL")
EMAIL = "support@onkernel.com"
ORDER_NUMBER = "110011001"
DOWNLOAD_DIR = "/tmp/downloads"

client = AsyncKernel()


async def main():
    if not WEBSITE_URL:
        raise ValueError(
            "WEBSITE_URL env var is required. Set it to the URL of the site "
            "you want to automate (e.g. in your .env file)."
        )

    # Create a new browser via Kernel
    kernelBrowser = await client.browsers.create(timeout_seconds=120)
    print("Kernel browser live view url:", kernelBrowser.browser_live_view_url)

    async with async_playwright() as playwright:
        browser = await playwright.chromium.connect_over_cdp(kernelBrowser.cdp_ws_url)
        context = browser.contexts[0]
        page = context.pages[0] if len(context.pages) > 0 else await context.new_page()

        # Required to prevent Playwright from overriding the location of the downloaded file
        cdp_session = await context.new_cdp_session(page)
        await cdp_session.send(
            "Browser.setDownloadBehavior",
            {
                "behavior": "allow",
                "downloadPath": DOWNLOAD_DIR,
                "eventsEnabled": True,
            },
        )

        # Set up CDP listeners to capture download filename and completion
        download_completed = asyncio.Event()
        download_filename: str | None = None

        def _on_download_begin(event):
            nonlocal download_filename
            download_filename = event.get("suggestedFilename", "unknown")
            print(f"Download started: {download_filename}")

        def _on_download_progress(event):
            if event.get("state") in ["completed", "canceled"]:
                download_completed.set()

        cdp_session.on("Browser.downloadWillBegin", _on_download_begin)
        cdp_session.on("Browser.downloadProgress", _on_download_progress)

        # Navigate to the Parking lookup page
        print(f"Navigating to Parking lookup page: {WEBSITE_URL}")
        await page.goto(WEBSITE_URL)

        # Fill in the email field
        print(f"Filling email field with: {EMAIL}")
        await page.fill("input#email", EMAIL)

        # Fill in the Parking reference field
        print(f"Filling Parking reference field with: {ORDER_NUMBER}")
        await page.fill("input#order_number", ORDER_NUMBER)

        # Click the "Look Up Parking" button
        print("Clicking 'Look Up Parking' button")
        await page.click("button#generateBtn")

        # Wait for navigation to order confirmation page
        print("Waiting for order confirmation page to load")
        await page.wait_for_load_state("networkidle")

        # Click the download receipt button
        print("Clicking download receipt button")
        await page.click("a.btn-download")

        # Wait for download to complete
        try:
            await asyncio.wait_for(download_completed.wait(), timeout=30)
            print("Download completed")
        except asyncio.TimeoutError:
            print("Download timed out after 30 seconds")
        finally:
            if download_filename:
                print(f"Reading downloaded file: {download_filename}")
                resp = await client.browsers.fs.read_file(
                    kernelBrowser.session_id, path=f"{DOWNLOAD_DIR}/{download_filename}"
                )
                local_path = f"./downloads/{download_filename}"
                os.makedirs("./downloads", exist_ok=True)
                await resp.write_to_file(local_path)  # streaming; file never in memory
                print(f"✅ Receipt saved to {local_path}")
            else:
                print("❌ No download filename captured")

            await client.browsers.delete_by_id(kernelBrowser.session_id)


if __name__ == "__main__":
    asyncio.run(main())
