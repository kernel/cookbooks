# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Kernel browser automation demo that downloads receipts from a parking lookup website. The app uses Kernel's cloud browser infrastructure with Playwright for automation and CDP (Chrome DevTools Protocol) for file operations.

## Key Architecture

### Main Flow ([main.py](main.py))

1. Creates a remote Kernel browser session via `AsyncKernel()`
2. Connects Playwright to the Kernel browser using CDP WebSocket URL
3. Configures download behavior via CDP session (`Browser.setDownloadBehavior`)
4. Uses CDP event listeners (`Browser.downloadWillBegin`, `Browser.downloadProgress`) to track downloads
5. Retrieves downloaded files from the remote browser filesystem using `client.browsers.fs.read_file()`
6. Streams file to local disk without loading into memory

## Common Commands

### Run the application

```bash
uv run main.py
```

### Type checking

```bash
uv run mypy .
```

### Install dependencies

Uses `uv` for dependency management:

```bash
uv sync
```

## Environment Variables

Requires `.env` file (loaded via `python-dotenv`) with:

- `KERNEL_API_KEY` - Kernel API key
- `WEBSITE_URL` - Required. The receipt/order lookup page to automate (the script raises a `ValueError` at run time if unset)

## Demo Target ([demo_site.py](demo_site.py))

Optional single-file Modal app that serves a receipt lookup site matching the selectors in `main.py` (`input#email`, `input#order_number`, `button#generateBtn`, `a.btn-download`). Deploy with `modal deploy demo_site.py`, then set `WEBSITE_URL` to the printed URL. Scales to zero when idle. Users can also bring their own target site and update the selectors in `main.py`.

## Important Implementation Details

- **File Downloads**: Must use CDP `Browser.setDownloadBehavior` to prevent Playwright from overriding download paths
- **File Retrieval**: Use `client.browsers.fs.read_file()` to access files from remote Kernel browser filesystem
- **Streaming**: File writing uses `resp.write_to_file()` which streams content to avoid memory issues
- **CDP Events**: Download tracking relies on CDP events, not Playwright's download API
- **Session Cleanup**: Always delete Kernel browser session with `client.browsers.delete_by_id()` when done
