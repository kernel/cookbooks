#!/usr/bin/env python3

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from kernel import Kernel
from vibium.sync_api import browser


def mask_ws_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    query = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key == "jwt":
            query.append((key, f"{value[:4]}***" if value else "***"))
        else:
            query.append((key, value))

    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(query, safe="*"),
            parsed.fragment,
        )
    )


def main() -> None:
    client = Kernel()

    session_id: str | None = None
    bro = None

    try:
        kernel_browser = client.browsers.create()
        session_id = kernel_browser.session_id
        webdriver_ws_url = kernel_browser.webdriver_ws_url

        print(f"created Kernel browser session {session_id}")
        print(f"using BiDi endpoint {mask_ws_url(webdriver_ws_url)}")

        bro = browser.start(webdriver_ws_url)
        page = bro.page()

        page.go("https://example.com")
        title = page.title()
        heading = page.find("h1").text()

        print(f"page title: {title}")
        print(f"h1 text: {heading}")

        if title != "Example Domain":
            raise RuntimeError(f'expected title "Example Domain", got "{title}"')

        if heading != "Example Domain":
            raise RuntimeError(f'expected h1 "Example Domain", got "{heading}"')

        print("Python example completed successfully")
    finally:
        if bro is not None:
            bro.stop()

        if session_id:
            client.browsers.delete_by_id(session_id)


if __name__ == "__main__":
    main()
