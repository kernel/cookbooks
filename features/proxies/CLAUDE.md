# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kernel application that demonstrates Kernel's proxies feature by verifying regional website availability across multiple geographic locations using residential proxies and the Browser Use SDK. The app checks if a website loads successfully from 5 different regions (US, JP, AU, IN, RU) in parallel and returns structured availability data including detected language, final URLs after redirects, and page titles.

## Commands

This project uses `uv` for Python dependency management (requires Python >= 3.11).

**Install dependencies:**

```bash
uv sync
```

**Deploy and invoke the application:**

```bash
kernel deploy main.py --env GOOGLE_API_KEY=$GOOGLE_API_KEY
kernel invoke proxies-demo verify-regional-sites-available \
  --payload '{"website": "https://www.ign.com"}'
```

Requires `KERNEL_API_KEY` (or `kernel login`) locally, and a `GOOGLE_API_KEY` (Gemini) for the Browser Use `ChatGoogle` LLM.

## Architecture

### Core Components

- **[main.py](main.py)** - Entry point registering the `proxies-demo` app and its `verify-regional-sites-available` Kernel action
  - Configures residential proxy targets for 5 countries (US, JP, AU, IN, RU)
  - Runs all regional checks in parallel using `asyncio.gather()` for efficient execution

- **[check_region.py](check_region.py)** - Per-region availability check
  - Creates a residential proxy and a Kernel browser instance with stealth mode and the proxy attached
  - Uses a Browser Use agent with LLM (Gemini Flash) to navigate to the website and check availability
  - Returns structured results using the `SiteAvailability` Pydantic model with Field descriptions
  - Implements try/finally blocks to ensure proxy and browser cleanup even when errors occur

### Key Integration Points

**Kernel SDK:**

- `client.browsers.create()` - Creates managed browser with live view URL
- `client.proxies.create()` - Creates residential proxies with geographic targeting
- `client.proxies.delete()` - Deletes proxy resources (always called in finally block)
- Uses `invocation_id` from `KernelContext` for browser lifecycle management

**Browser Use SDK:**

- `Browser` class connects to Kernel browser via `cdp_url`
- `Agent` runs tasks with LLM (Gemini Flash) and returns structured output
- `output_model_schema` enforces Pydantic validation on agent results
- Use Pydantic `Field` with descriptions to guide LLM output generation

### Proxy Configuration

Each region uses a simplified config with just the country code:

```python
configs = [
    {"country": "US"},
    {"country": "JP"},
    {"country": "AU"},
    {"country": "IN"},
    {"country": "RU"},
]
```

The Kernel proxies API supports additional optional parameters:

- `city` - Target specific city within country
- `os` - Operating system fingerprint (windows/macos)
- `zip` - Postal code targeting (e.g., US ZIP codes)

### Data Flow

1. Action receives website URL input
2. For each region, spawn an async task (`check_region`) that:
   - Creates residential proxy with regional config (e.g., `{'country': 'US'}`)
   - Creates Kernel browser with stealth mode and proxy attached
   - Creates Browser Use agent with the browser and LLM
   - Navigates to website and assesses availability using LLM analysis
   - Parses structured output (site_content_available, final_url, page_title, detected_language)
   - **Finally**: Always deletes proxy via `client.proxies.delete(proxy.id)` even on errors
3. Runs all regional checks in parallel using `asyncio.gather(*tasks)`
4. Returns aggregated results for all regions with regional insights (redirects, language, etc.)

### Example Output

```json
{
  "results": [
    {
      "country": "US",
      "site_content_available": "yes",
      "final_url": "https://www.ign.com/",
      "page_title": "Video Game News, Reviews, and Walkthroughs - IGN",
      "detected_language": "en"
    },
    {
      "country": "JP",
      "site_content_available": "yes",
      "final_url": "https://jp.ign.com/",
      "page_title": "IGN Japan",
      "detected_language": "ja"
    }
  ]
}
```

### Resource Management

**Critical**: Proxies must be cleaned up to avoid resource leaks. Each proxy creation is wrapped in a try/finally block that guarantees `client.proxies.delete(proxy.id)` is called, even if agent execution or result parsing fails.
