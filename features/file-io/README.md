# Kernel File I/O Demo

A demonstration of file download automation using [Kernel](https://www.kernel.sh) cloud browsers with Playwright and Chrome DevTools Protocol (CDP).

This example shows how to automate downloading files from websites using Kernel's remote browser infrastructure, then retrieve those files from the cloud browser's filesystem to your local machine.
[![Kernel File I/O Youtube Video Screenshot](https://github.com/user-attachments/assets/44e168e6-5392-4002-85fc-59618684b92b)](https://www.youtube.com/watch?v=zJWSa-Eqbfs)

## What This Demo Does

This script automates a receipt download workflow:

1. Creates a remote browser session via Kernel
2. Navigates to a parking receipt lookup page
3. Fills out a form with email and order number
4. Downloads a PDF receipt
5. Retrieves the file from the remote browser filesystem
6. Streams it to your local `./downloads/` directory

## Architecture

The demo combines three key technologies:

- **Kernel**: Provides cloud-hosted browsers accessible via API
- **Playwright**: Automates browser interactions (form filling, clicking, navigation)
- **CDP (Chrome DevTools Protocol)**: Handles file download tracking and retrieval

### Key Technical Highlights

**File Download Handling via CDP**

Unlike standard Playwright download handling, this demo uses CDP to:

- Set download behavior on the remote browser (`Browser.setDownloadBehavior`)
- Track download events (`Browser.downloadWillBegin`, `Browser.downloadProgress`)
- Access files in the remote filesystem via Kernel's file API

**Streaming File Transfer**

Files are streamed from the remote browser to local disk using `client.browsers.fs.read_file()` and `write_to_file()`, avoiding loading large files into memory.

## Prerequisites

- Python 3.11 or higher
- [uv](https://docs.astral.sh/uv/) package manager
- A Kernel API key (sign up at [kernel.sh](https://www.kernel.sh))
- Optional: [Modal](https://modal.com) CLI, only if you deploy the bundled demo target

## Installation

1. Clone this repository:

```bash
git clone <your-repo-url>
cd file-io-demo
```

2. Install dependencies using uv:

```bash
uv sync
```

3. Create a `.env` file in the project root:

```bash
KERNEL_API_KEY=your_api_key_here
WEBSITE_URL=https://your-target-site.example.com/receipt-lookup
```

### Environment Variables

| Variable         | Required | Description                                                                              |
| ---------------- | -------- | ---------------------------------------------------------------------------------------- |
| `KERNEL_API_KEY` | Yes      | Your Kernel API key                                                                      |
| `WEBSITE_URL`    | Yes      | The receipt/order lookup page to automate (deploy the bundled demo target, or bring your own site) |

### Deploy the demo target (one command)

Don't have a site to automate? This repo ships `demo_site.py`, a single-file [Modal](https://modal.com) app that serves a parking receipt lookup site matching the selectors in `main.py`. It scales to zero, so it costs nothing at rest.

```bash
modal deploy demo_site.py
```

Modal prints the app URL. Set it as your target:

```bash
WEBSITE_URL=https://<workspace>--file-io-demo-site-web.modal.run uv run main.py
```

Prefer your own site? Any page works as long as you update the selectors and config in `main.py` to match it.

### Configuration Variables

The automation also uses a few constants defined at the top of `main.py`:

- `EMAIL` - Email address filled into the lookup form
- `ORDER_NUMBER` - Order/reference number filled into the lookup form
- `DOWNLOAD_DIR` - Directory on the remote browser where downloads land (`/tmp/downloads`)

Update these (and the Playwright selectors) to match your target site.

## Usage

Run the automation script:

```bash
uv run main.py
```

The script will:

- Print the Kernel browser live view URL (watch the automation in real-time)
- Navigate through the demo site
- Download the receipt
- Save it to `./downloads/`

### Customizing for Your Use Case

To adapt this for your own website automation:

1. Set `WEBSITE_URL` in your `.env` file and update the configuration variables in `main.py`:

   ```python
   EMAIL = "your-email"
   ORDER_NUMBER = "your-order-number"
   DOWNLOAD_DIR = "/tmp/downloads"
   ```

2. Modify the Playwright selectors to match your target website's HTML structure

3. Adjust the CDP event handlers if needed for different download patterns

## Project Structure

- **`main.py`** - Main automation script with download logic
- **`demo_site.py`** - Optional Modal app serving a demo target site (`modal deploy demo_site.py`)
- **`pyproject.toml`** - Project dependencies and configuration
- **`.env`** - Environment variables (API key, target URL)

## Development

Type checking:

```bash
uv run mypy .
```

## Learn More

- [Kernel Documentation](https://www.kernel.sh/docs)
- [Kernel Python SDK](https://github.com/kernel/kernel-python-sdk)
- [Playwright Python](https://playwright.dev/python/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
