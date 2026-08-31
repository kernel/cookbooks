from browser_use import BrowserSession


# Browser session pinned to a fixed 1024x786 viewport.
#
# Older browser-use releases mishandled viewport resizing when connecting via
# CDP, which required overriding the internal _setup_viewports() method.
# browser-use >= 0.13 connects over CDP natively and accepts viewport/window
# sizing directly, so this subclass simply passes the fixed size through.
class BrowserSessionCustomResize(BrowserSession):
    def __init__(self, cdp_url: str, **kwargs) -> None:
        super().__init__(
            cdp_url=cdp_url,
            viewport={"width": 1024, "height": 786},
            window_size={"width": 1024, "height": 786},
            device_scale_factor=1.0,
            **kwargs,
        )
