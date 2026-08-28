import kernel
from browser_use import Agent, Browser, ChatGoogle
from pydantic import BaseModel, Field

client = kernel.Kernel()


class SiteAvailability(BaseModel):
    site_content_available: str = Field(
        description="Whether the website content loaded successfully. Must be 'yes' or 'no'"
    )
    final_url: str = Field(
        description="The final URL in the browser address bar after any redirects"
    )
    page_title: str = Field(description="The title of the loaded page")
    detected_language: str = Field(
        description="The detected language code of the page (e.g., 'en', 'de', 'ja', 'pt', 'zh')"
    )


llm = ChatGoogle(model="gemini-flash-latest")


async def check_region(config: dict, website: str, ctx: kernel.KernelContext) -> dict:
    """Check website availability from a single region"""
    country_code = config["country"].lower()
    proxy = None
    kernel_browser = None

    try:
        # Create a proxy for this region
        proxy = client.proxies.create(
            type="residential",
            name=f"my-{country_code}-residential",
            config=config,
        )

        kernel_browser = client.browsers.create(
            invocation_id=ctx.invocation_id, stealth=True, proxy_id=proxy.id
        )

        browser = Browser(
            cdp_url=kernel_browser.cdp_ws_url,
            headless=False,
            window_size={"width": 1024, "height": 786},
            viewport={"width": 1024, "height": 786},
            device_scale_factor=1.0,
        )

        agent = Agent(
            task=f"""
            1. Navigate to {website}
            2. Wait for 5 seconds to ensure the page loads completely
            3. Check if the page content loaded successfully
            4. Check if a redirect occurred by comparing the initial URL to the current URL in the address bar
            5. Capture the final URL from the browser address bar
            6. Extract the page title
            7. Detect the language of the page (check html lang attribute or page content)
            8. Set site_content_available to 'yes' if the page loaded successfully, 'no' if it failed or has errors
            """,
            llm=llm,
            browser_session=browser,
            output_model_schema=SiteAvailability,
        )

        result = await agent.run()

        # Parse structured output
        final_result = result.final_result()
        if final_result is not None:
            try:
                parsed = SiteAvailability.model_validate_json(final_result)
                return {
                    "country": country_code.upper(),
                    "site_content_available": parsed.site_content_available,
                    "final_url": parsed.final_url,
                    "page_title": parsed.page_title,
                    "detected_language": parsed.detected_language,
                }
            except Exception as e:
                return {
                    "country": country_code.upper(),
                    "site_content_available": "no",
                    "final_url": "",
                    "page_title": "",
                    "detected_language": "",
                    "error": f"Error parsing result: {str(e)}",
                }
        else:
            return {
                "country": country_code.upper(),
                "site_content_available": "no",
                "final_url": "",
                "page_title": "",
                "detected_language": "",
                "error": f"Errors: {result.errors()}",
            }
    except Exception as e:
        return {
            "country": country_code.upper(),
            "site_content_available": "no",
            "final_url": "",
            "page_title": "",
            "detected_language": "",
            "error": str(e),
        }
    finally:
        # Always delete the proxy, even if an error occurred
        if proxy:
            client.proxies.delete(proxy.id)
        if kernel_browser:
            client.browsers.delete_by_id(kernel_browser.session_id)
