# Web scraping with a Kernel headful browser

Scrapes JS-rendered pages behind a login. The browser runs on Kernel (no browser binary in the Modal image), with login via Managed Auth and extraction on a self-hosted Modal Endpoint. [kernel_webscraper.py](kernel_webscraper.py) is a literate example; the full walkthrough is in the file.

## Prerequisites

- Python 3.10+ and the Modal CLI: `pip install modal && modal setup`
- A [Kernel](https://www.kernel.sh) account and API key
- A [Modal](https://modal.com) account

The scraper itself runs remotely on Python 3.11 (defined in the Modal image), so your local version only needs to run the CLI.

## Setup

```sh
modal secret create kernel KERNEL_API_KEY=...
modal secret create saucedemo-login TARGET_USERNAME=standard_user TARGET_PASSWORD=secret_sauce
modal endpoint create --model Qwen/Qwen3.5-4B --name example-kernel-webscraper --routing-region us-west
modal workspace proxy-tokens create
modal secret create modal-proxy-tokens MODAL_KEY=<token-id> MODAL_SECRET=<token-secret>
```

## Run

```sh
modal run kernel_webscraper.py                                              # login + scrape
modal run kernel_webscraper.py --url https://books.toscrape.com/ --no-with-auth  # public page
modal run kernel_webscraper.py --prove                                      # headful-vs-headless signals
modal deploy kernel_webscraper.py                                           # daily schedule
```

## What a successful run looks like

```
authenticated: profile saucedemo-scraper
watch live: https://<live-view-url>   <- open this to watch the browser work
waiting for the Endpoint to spin up...       <- first run only, ~1 minute
{'url': 'https://www.saucedemo.com/inventory.html', 'products': [{'name': 'Sauce Labs Backpack', 'price': '$29.99', ...}]}
```

Deployed runs write results to the `kernel-webscraper-results` Modal Volume, one JSON file per date. List them with `modal volume ls kernel-webscraper-results`.

## Point it at your own site

- Any public page: pass `--url <your-url> --no-with-auth`
- A site behind a login: change `login_url` in `ensure_auth` and put your credentials in the `saucedemo-login` secret (rename it in both places). Managed Auth handles the rest.
- Different fields: edit `EXTRACTION_SCHEMA` and the prompt in `extract_products`
- Different model: create a new Endpoint with `modal endpoint create --model <hf-model>` and update `ENDPOINT_MODEL` and `ENDPOINT_NAME`

Only scrape sites you're authorized to. The demo targets test sandboxes (saucedemo.com, books.toscrape.com).

## Troubleshooting

- `waiting for the Endpoint to spin up...` repeats for a while: normal after idle, the Endpoint scales to zero and cold starts take about a minute. If it never resolves, check the Endpoint exists and matches `ENDPOINT_NAME`: `modal endpoint list`
- `Secret 'kernel' not found` (or `modal-proxy-tokens`, `saucedemo-login`): create the secrets with the exact names in Setup
- `page load timed out`: the target was slow or blocked the load; rerun, or try `--no-with-auth` against a public page to isolate
- `extraction produced no parseable output`: the model refused or truncated; rerun, and for very large pages consider a bigger `max_tokens` or model
- 401/403 from the Endpoint: your proxy token secret is wrong; re-run `modal workspace proxy-tokens create` and update `modal-proxy-tokens`
