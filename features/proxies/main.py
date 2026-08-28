import asyncio
from typing import TypedDict

import kernel
from check_region import check_region

app = kernel.App("proxies-demo")


class WebsiteInput(TypedDict):
    website: str


@app.action("verify-regional-sites-available")
async def verify_regional_sites_available(
    ctx: kernel.KernelContext, input_data: WebsiteInput
):

    # Get the website to check
    website = input_data["website"]

    # Proxy options for different regions
    configs = [
        {"country": "US"},
        {"country": "JP"},
        {"country": "AU"},
        {"country": "IN"},
        {"country": "RU"},
    ]

    # Check all regions in parallel. return_exceptions=True keeps one failing
    # region from discarding the results of the other four.
    tasks = [check_region(config, website, ctx) for config in configs]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    return {
        "results": [
            result
            if not isinstance(result, BaseException)
            else {
                "country": config["country"],
                "site_content_available": "no",
                "final_url": "",
                "page_title": "",
                "detected_language": "",
                "error": str(result),
            }
            for config, result in zip(configs, results)
        ]
    }
