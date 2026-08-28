# Kernel Proxies Demo

This demo showcases **Kernel's new proxies feature** by verifying regional website availability across multiple geographic locations using residential proxies and the Browser Use SDK.

## What This Demonstrates

This application highlights key capabilities of Kernel's proxies API:

- **Residential Proxies** - Uses residential IPs to avoid bot detection and access websites as real users from different regions
- **Geographic Targeting** - Routes browser traffic through proxies in specific countries (US, JP, AU, IN, RU)
- **Parallel Execution** - Checks multiple regions concurrently using async operations
- **Browser Integration** - Seamlessly attaches proxies to Kernel-managed browsers with stealth mode
- **Resource Management** - Demonstrates proper proxy lifecycle management (create → use → delete)

## How It Works

The app takes a website URL and checks its availability from 5 different countries in parallel:

1. Creates a residential proxy for each region
2. Launches a stealth-mode browser with the proxy attached
3. Uses Browser Use SDK + LLM agents to navigate and analyze the site
4. Detects regional redirects, page language, and content availability
5. Returns structured results with regional insights

## Example Output

Testing IGN.com shows how the site serves different regional content:

```JSON
{
  "results": [
    {
      "country": "US",
      "detected_language": "en",
      "final_url": "https://www.ign.com/",
      "page_title": "Video Game News, Reviews, and Walkthroughs - IGN",
      "site_content_available": "yes"
    },
    {
      "country": "JP",
      "detected_language": "ja",
      "final_url": "https://jp.ign.com/",
      "page_title": "IGN Japan",
      "site_content_available": "yes"
    },
    {
      "country": "AU",
      "detected_language": "en",
      "final_url": "https://www.ign.com/au",
      "page_title": "Video Game News, Reviews, and Walkthroughs - IGN",
      "site_content_available": "yes"
    },
    {
      "country": "IN",
      "detected_language": "en-in",
      "final_url": "https://in.ign.com/",
      "page_title": "IGN India",
      "site_content_available": "yes"
    },
    {
      "country": "RU",
      "detected_language": "en",
      "final_url": "https://www.ign.com/",
      "page_title": "Video Game News, Reviews, and ",
      "site_content_available": "yes"
    }
  ]
}
```

Notice how Japan and India get redirected to regional subdomains with localized content!

## Kernel Proxies Feature

Kernel offers four proxy types for different use cases:

1. **Datacenter** - Fastest performance
2. **ISP** - Balanced speed and detectability
3. **Residential** - Most realistic, least detectable (used in this demo)
4. **Custom** - Bring your own proxy servers

**Key Benefits:**

- Enhanced privacy and anonymity
- Bot detection avoidance
- Access geo-restricted content
- Test regional website behavior
- Web scraping at scale

Learn more in the [Kernel Proxies Documentation](https://www.kernel.sh/docs/proxies/overview).

## Use Cases

- **Regional Content Testing** - Verify websites serve correct content per country
- **Geo-Restriction Testing** - Check if content is properly restricted/accessible by region
- **Localization QA** - Validate language detection and regional redirects
- **Competitive Analysis** - Monitor how competitors present content across markets
- **Web Scraping** - Collect data from different geographic perspectives

## Setup

Note: creating proxies is available on all plans, but attaching a proxy to a browser requires a paid Kernel plan. On the free tier the demo runs but each region check returns a 403 insufficient_plan error.

This project uses [uv](https://docs.astral.sh/uv/) for Python dependency management (requires Python >= 3.11).

**Install dependencies:**

```bash
uv sync
```

**Required environment variables:**

| Variable         | Purpose                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `KERNEL_API_KEY` | Authenticates the Kernel CLI/SDK locally (or use `kernel login`). Inside a deployed app this variable is reserved and injected automatically by Kernel.            |
| `GOOGLE_API_KEY` | Gemini API key used by Browser Use's `ChatGoogle(model="gemini-flash-latest")` (get one at https://aistudio.google.com/apikey). `GEMINI_API_KEY` also works, but `GOOGLE_API_KEY` takes precedence when both are set. |

**Deploy and invoke the app:**

```bash
# Deploy the app (main.py registers the "proxies-demo" app)
kernel deploy main.py --env GOOGLE_API_KEY=$GOOGLE_API_KEY

# Invoke the action with any website URL
kernel invoke proxies-demo verify-regional-sites-available \
  --payload '{"website": "https://www.ign.com"}'
```

## Architecture

- [main.py](main.py) - Registers the `proxies-demo` Kernel app and its `verify-regional-sites-available` action, which fans out checks for 5 regions in parallel
- [check_region.py](check_region.py) - Per-region check: creates a residential proxy, launches a stealth browser with the proxy attached, runs a Browser Use agent to analyze the site, and cleans up the proxy and browser afterwards

## Resources

- [Kernel Proxies Documentation](https://www.kernel.sh/docs/proxies/overview)
- [Kernel Apps Guide](https://www.kernel.sh/docs/apps/develop)
- [Browser Use SDK](https://github.com/browser-use/browser-use)
