# Web scraping with a Kernel headful browser

Scrapes JS-rendered pages behind a login. The browser runs on Kernel (no browser binary in the Modal image), with login via Managed Auth and extraction on a self-hosted Modal Endpoint. [kernel_webscraper.py](kernel_webscraper.py) is a literate example; the full walkthrough is in the file.

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

Only scrape sites you're authorized to. The demo targets test sandboxes (saucedemo.com, books.toscrape.com).
